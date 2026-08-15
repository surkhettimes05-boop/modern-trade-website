import { FastifyInstance } from "fastify";
import { z } from "zod";
import { complianceReportService } from "../services/complianceReportService.js";

export async function complianceReportRoutes(fastify: FastifyInstance) {
  // Compliance Reports: Generate VAT return
  fastify.post("/compliance-reports/vat-return", async (request, reply) => {
    const schema = z.object({
      store_id: z.string().uuid(),
      period_start: z.coerce.date(),
      period_end: z.coerce.date(),
      created_by: z.string().optional(),
    });

    const reportData = schema.parse(request.body);

    try {
      const report = await complianceReportService.generateVATReturn(
        reportData.store_id,
        reportData.period_start,
        reportData.period_end,
        reportData.created_by,
      );
      return reply.status(201).send(report);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to generate VAT return report" });
    }
  });

  // Compliance Reports: Generate tax summary
  fastify.post("/compliance-reports/tax-summary", async (request, reply) => {
    const schema = z.object({
      store_id: z.string().uuid(),
      period_start: z.coerce.date(),
      period_end: z.coerce.date(),
      created_by: z.string().optional(),
    });

    const reportData = schema.parse(request.body);

    try {
      const report = await complianceReportService.generateTaxSummary(
        reportData.store_id,
        reportData.period_start,
        reportData.period_end,
        reportData.created_by,
      );
      return reply.status(201).send(report);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to generate tax summary report" });
    }
  });

  // Compliance Reports: Generate audit trail report
  fastify.post("/compliance-reports/audit-trail", async (request, reply) => {
    const schema = z.object({
      store_id: z.string().uuid(),
      period_start: z.coerce.date(),
      period_end: z.coerce.date(),
      created_by: z.string().optional(),
    });

    const reportData = schema.parse(request.body);

    try {
      const report = await complianceReportService.generateAuditTrailReport(
        reportData.store_id,
        reportData.period_start,
        reportData.period_end,
        reportData.created_by,
      );
      return reply.status(201).send(report);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to generate audit trail report" });
    }
  });

  // Compliance Reports: Generate security report
  fastify.post("/compliance-reports/security", async (request, reply) => {
    const schema = z.object({
      store_id: z.string().uuid(),
      period_start: z.coerce.date(),
      period_end: z.coerce.date(),
      created_by: z.string().optional(),
    });

    const reportData = schema.parse(request.body);

    try {
      const report = await complianceReportService.generateSecurityReport(
        reportData.store_id,
        reportData.period_start,
        reportData.period_end,
        reportData.created_by,
      );
      return reply.status(201).send(report);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to generate security report" });
    }
  });

  // Compliance Reports: Get report
  fastify.get("/compliance-reports/:reportId", async (request, reply) => {
    const schema = z.object({
      reportId: z.string(),
    });

    const { reportId } = schema.parse(request.params);

    try {
      const report = await complianceReportService.getReport(reportId);
      if (!report) {
        return reply.status(404).send({ error: "Compliance report not found" });
      }
      return reply.send(report);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get compliance report" });
    }
  });

  // Compliance Reports: Get reports for store
  fastify.get("/compliance-reports/store/:storeId", async (request, reply) => {
    const paramsSchema = z.object({
      storeId: z.string().uuid(),
    });

    const querySchema = z.object({
      report_type: z.string().optional(),
      start_date: z.coerce.date().optional(),
      end_date: z.coerce.date().optional(),
    });

    const { storeId } = paramsSchema.parse(request.params);
    const filters = querySchema.parse(request.query);

    try {
      const reports = await complianceReportService.getReportsForStore(
        storeId,
        filters,
      );
      return reply.send(reports);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get compliance reports" });
    }
  });
}
