import { query } from "../database/connection.js";
import { irdTaxService } from "./irdTaxService.js";
import { auditTrailService } from "./auditTrailService.js";
import crypto from "crypto";

interface ComplianceReport {
  id: string;
  report_id: string;
  store_id: string;
  report_type: string;
  report_period_start: Date;
  report_period_end: Date;
  report_data: any;
  generation_status: string;
  file_path: string;
  file_checksum: string;
  generated_at: Date;
  created_at: Date;
  created_by: string;
}

export class ComplianceReportService {
  /**
   * Generate VAT return report
   */
  async generateVATReturn(
    storeId: string,
    periodStart: Date,
    periodEnd: Date,
    createdBy?: string,
  ): Promise<ComplianceReport> {
    const reportId = this.generateComplianceReportId();

    // Get tax transactions for the period
    const taxTransactions = await irdTaxService.getTransactions(storeId, {
      start_date: periodStart,
      end_date: periodEnd,
      transaction_type: "SALE",
    });

    // Calculate totals
    const totalNetAmount = taxTransactions.reduce(
      (sum, t) => sum + Number(t.net_amount),
      0,
    );
    const totalVATAmount = taxTransactions.reduce(
      (sum, t) => sum + Number(t.vat_amount),
      0,
    );
    const totalGrossAmount = taxTransactions.reduce(
      (sum, t) => sum + Number(t.gross_amount),
      0,
    );

    const reportData = {
      report_type: "VAT_RETURN",
      review: {
        status: "PROVISIONAL",
        reason:
          "Market-specific tax treatment requires professional review before filing.",
      },
      period_start: periodStart,
      period_end: periodEnd,
      store_id: storeId,
      summary: {
        total_transactions: taxTransactions.length,
        total_net_amount: totalNetAmount,
        total_vat_amount: totalVATAmount,
        total_gross_amount: totalGrossAmount,
      },
      transactions: taxTransactions,
    };

    const result = await query(
      `INSERT INTO compliance_reports (
        report_id, store_id, report_type, report_period_start, report_period_end,
        report_data, generation_status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, 'PROVISIONAL', $7)
      RETURNING *`,
      [
        reportId,
        storeId,
        "VAT_RETURN",
        periodStart,
        periodEnd,
        JSON.stringify(reportData),
        createdBy || null,
      ],
    );

    return result.rows[0];
  }

  /**
   * Generate tax summary report
   */
  async generateTaxSummary(
    storeId: string,
    periodStart: Date,
    periodEnd: Date,
    createdBy?: string,
  ): Promise<ComplianceReport> {
    const reportId = this.generateComplianceReportId();

    // Get all tax transactions for the period
    const taxTransactions = await irdTaxService.getTransactions(storeId, {
      start_date: periodStart,
      end_date: periodEnd,
    });

    // Group by transaction type
    const byType = taxTransactions.reduce((acc, t) => {
      if (!acc[t.transaction_type]) {
        acc[t.transaction_type] = { count: 0, total_tax: 0, total_amount: 0 };
      }
      acc[t.transaction_type].count++;
      acc[t.transaction_type].total_tax += Number(t.total_tax_amount);
      acc[t.transaction_type].total_amount += Number(t.gross_amount);
      return acc;
    }, {} as any);

    const reportData = {
      report_type: "TAX_SUMMARY",
      review: {
        status: "PROVISIONAL",
        reason:
          "Market-specific tax treatment requires professional review before filing.",
      },
      period_start: periodStart,
      period_end: periodEnd,
      store_id: storeId,
      summary: {
        total_transactions: taxTransactions.length,
        total_tax_amount: taxTransactions.reduce(
          (sum, t) => sum + Number(t.total_tax_amount),
          0,
        ),
        total_gross_amount: taxTransactions.reduce(
          (sum, t) => sum + Number(t.gross_amount),
          0,
        ),
      },
      by_transaction_type: byType,
    };

    const result = await query(
      `INSERT INTO compliance_reports (
        report_id, store_id, report_type, report_period_start, report_period_end,
        report_data, generation_status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, 'PROVISIONAL', $7)
      RETURNING *`,
      [
        reportId,
        storeId,
        "TAX_SUMMARY",
        periodStart,
        periodEnd,
        JSON.stringify(reportData),
        createdBy || null,
      ],
    );

    return result.rows[0];
  }

  /**
   * Generate audit trail report
   */
  async generateAuditTrailReport(
    storeId: string,
    periodStart: Date,
    periodEnd: Date,
    createdBy?: string,
  ): Promise<ComplianceReport> {
    const reportId = this.generateComplianceReportId();

    // Get audit trails for the period
    const auditTrails = await auditTrailService.getTrailsByDateRange(
      periodStart,
      periodEnd,
      1000,
    );

    // Group by action
    const byAction = auditTrails.reduce((acc, t) => {
      if (!acc[t.action]) {
        acc[t.action] = { count: 0 };
      }
      acc[t.action].count++;
      return acc;
    }, {} as any);

    const reportData = {
      report_type: "AUDIT_TRAIL",
      period_start: periodStart,
      period_end: periodEnd,
      store_id: storeId,
      summary: {
        total_entries: auditTrails.length,
        unique_actions: Object.keys(byAction).length,
      },
      by_action: byAction,
      entries: auditTrails.slice(0, 100), // Include first 100 entries
    };

    const result = await query(
      `INSERT INTO compliance_reports (
        report_id, store_id, report_type, report_period_start, report_period_end,
        report_data, generation_status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, 'COMPLETED', $7)
      RETURNING *`,
      [
        reportId,
        storeId,
        "AUDIT_TRAIL",
        periodStart,
        periodEnd,
        JSON.stringify(reportData),
        createdBy || null,
      ],
    );

    return result.rows[0];
  }

  /**
   * Generate security report
   */
  async generateSecurityReport(
    storeId: string,
    periodStart: Date,
    periodEnd: Date,
    createdBy?: string,
  ): Promise<ComplianceReport> {
    const reportId = this.generateComplianceReportId();

    // Get security incidents for the period
    const result = await query(
      `SELECT * FROM security_incidents 
       WHERE detected_at >= $1 AND detected_at <= $2
       ORDER BY detected_at DESC`,
      [periodStart, periodEnd],
    );

    const incidents = result.rows;

    // Group by severity
    const bySeverity = incidents.reduce((acc, i) => {
      if (!acc[i.severity]) {
        acc[i.severity] = { count: 0 };
      }
      acc[i.severity].count++;
      return acc;
    }, {} as any);

    const reportData = {
      report_type: "SECURITY_REPORT",
      period_start: periodStart,
      period_end: periodEnd,
      store_id: storeId,
      summary: {
        total_incidents: incidents.length,
        open_incidents: incidents.filter((i) => i.incident_status === "OPEN")
          .length,
        resolved_incidents: incidents.filter(
          (i) => i.incident_status === "RESOLVED",
        ).length,
      },
      by_severity: bySeverity,
      incidents: incidents.slice(0, 50), // Include first 50 incidents
    };

    const insertResult = await query(
      `INSERT INTO compliance_reports (
        report_id, store_id, report_type, report_period_start, report_period_end,
        report_data, generation_status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, 'COMPLETED', $7)
      RETURNING *`,
      [
        reportId,
        storeId,
        "SECURITY_REPORT",
        periodStart,
        periodEnd,
        JSON.stringify(reportData),
        createdBy || null,
      ],
    );

    return insertResult.rows[0];
  }

  /**
   * Get report by ID
   */
  async getReport(reportId: string): Promise<ComplianceReport | null> {
    const result = await query(
      "SELECT * FROM compliance_reports WHERE report_id = $1",
      [reportId],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get reports for store
   */
  async getReportsForStore(
    storeId: string,
    filters: {
      report_type?: string;
      start_date?: Date;
      end_date?: Date;
    } = {},
  ): Promise<ComplianceReport[]> {
    const conditions: string[] = ["store_id = $1"];
    const values: any[] = [storeId];
    let paramIndex = 2;

    if (filters.report_type) {
      conditions.push(`report_type = $${paramIndex}`);
      values.push(filters.report_type);
      paramIndex++;
    }

    if (filters.start_date) {
      conditions.push(`report_period_start >= $${paramIndex}`);
      values.push(filters.start_date);
      paramIndex++;
    }

    if (filters.end_date) {
      conditions.push(`report_period_end <= $${paramIndex}`);
      values.push(filters.end_date);
      paramIndex++;
    }

    const result = await query(
      `SELECT * FROM compliance_reports WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC`,
      values,
    );

    return result.rows;
  }

  /**
   * Generate compliance report ID
   */
  private generateComplianceReportId(): string {
    return `CMP-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * Calculate file checksum
   */
  private calculateChecksum(data: string): string {
    return crypto.createHash("sha256").update(data).digest("hex");
  }
}

export const complianceReportService = new ComplianceReportService();
