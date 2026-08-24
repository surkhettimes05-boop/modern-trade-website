import { FastifyInstance } from "fastify";
import { z } from "zod";
import { AuditReportService } from "../services/auditReportService.js";

const auditReportService = new AuditReportService();

export async function auditReportRoutes(fastify: FastifyInstance) {
  // Audit Report: Generate shift audit report
  fastify.post("/audit-reports/shift/:shiftId", async (request, reply) => {
    const schema = z.object({
      shiftId: z.string().uuid(),
    });

    const bodySchema = z.object({
      generated_by: z.string(),
    });

    const { shiftId } = schema.parse(request.params);
    const { generated_by } = bodySchema.parse(request.body);

    try {
      const report = await auditReportService.generateShiftAuditReport(
        shiftId,
        generated_by,
      );
      return reply.status(201).send(report);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to generate shift audit report" });
    }
  });

  // Audit Report: Generate daily sales audit report
  fastify.post("/audit-reports/daily-sales", async (request, reply) => {
    const schema = z.object({
      store_id: z.string().uuid(),
      date: z.coerce.date(),
      generated_by: z.string(),
    });

    const { store_id, date, generated_by } = schema.parse(request.body);

    try {
      const report = await auditReportService.generateDailySalesAuditReport(
        store_id,
        date,
        generated_by,
      );
      return reply.status(201).send(report);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to generate daily sales audit report" });
    }
  });

  // Audit Report: Generate inventory audit report
  fastify.post("/audit-reports/inventory", async (request, reply) => {
    const schema = z.object({
      store_id: z.string().uuid(),
      generated_by: z.string(),
    });

    const { store_id, generated_by } = schema.parse(request.body);

    try {
      const report = await auditReportService.generateInventoryAuditReport(
        store_id,
        generated_by,
      );
      return reply.status(201).send(report);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to generate inventory audit report" });
    }
  });

  // Audit Report: Generate loyalty audit report
  fastify.post("/audit-reports/loyalty", async (request, reply) => {
    const schema = z.object({
      store_id: z.string().uuid(),
      period_start: z.coerce.date(),
      period_end: z.coerce.date(),
      generated_by: z.string(),
    });

    const { store_id, period_start, period_end, generated_by } = schema.parse(
      request.body,
    );

    try {
      const report = await auditReportService.generateLoyaltyAuditReport(
        store_id,
        period_start,
        period_end,
        generated_by,
      );
      return reply.status(201).send(report);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to generate loyalty audit report" });
    }
  });

  // Audit Report: Get report by ID
  fastify.get("/audit-reports/:reportId", async (request, reply) => {
    const schema = z.object({
      reportId: z.string().uuid(),
    });

    const { reportId } = schema.parse(request.params);

    try {
      const report = await auditReportService.getAuditReport(reportId);
      if (!report) {
        return reply.status(404).send({ error: "Audit report not found" });
      }
      return reply.send(report);
    } catch {
      return reply.status(500).send({ error: "Failed to get audit report" });
    }
  });

  // Audit Report: Get all reports
  fastify.get("/audit-reports", async (request, reply) => {
    const schema = z.object({
      report_type: z
        .enum(["SHIFT", "DAILY_SALES", "INVENTORY", "LOYALTY"])
        .optional(),
      store_id: z.string().uuid().optional(),
      date_from: z.coerce.date().optional(),
      date_to: z.coerce.date().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      offset: z.coerce.number().int().min(0).max(100_000).default(0),
    });

    const filters = schema.parse(request.query);

    try {
      const reports = await auditReportService.getAuditReports(filters);
      return reply.send(reports);
    } catch {
      return reply.status(500).send({ error: "Failed to get audit reports" });
    }
  });
}
