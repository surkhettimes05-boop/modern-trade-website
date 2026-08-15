import { FastifyInstance } from "fastify";
import { z } from "zod";
import { irdTaxService } from "../services/irdTaxService.js";

export async function irdTaxRoutes(fastify: FastifyInstance) {
  // IRD Tax: Get configuration
  fastify.get("/ird-tax/configurations/:storeId", async (request, reply) => {
    const schema = z.object({
      storeId: z.string().uuid(),
    });

    const { storeId } = schema.parse(request.params);

    try {
      const config = await irdTaxService.getConfiguration(storeId);
      if (!config) {
        return reply
          .status(404)
          .send({ error: "IRD tax configuration not found" });
      }
      return reply.send(config);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get IRD tax configuration" });
    }
  });

  // IRD Tax: Create configuration
  fastify.post("/ird-tax/configurations", async (request, reply) => {
    const schema = z.object({
      store_id: z.string().uuid(),
      vat_enabled: z.boolean().optional(),
      vat_rate: z.number().optional(),
      vat_registration_number: z.string().optional(),
      excise_duty_enabled: z.boolean().optional(),
      excise_duty_rates: z.any().optional(),
      withholding_tax_enabled: z.boolean().optional(),
      withholding_tax_rate: z.number().optional(),
      ird_api_url: z.string().optional(),
      ird_api_username: z.string().optional(),
      ird_api_password: z.string().optional(),
      updated_by: z.string().optional(),
    });

    const configData = schema.parse(request.body);

    try {
      const config = await irdTaxService.createConfiguration(configData);
      return reply.status(201).send(config);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to create IRD tax configuration" });
    }
  });

  // IRD Tax: Update configuration
  fastify.put("/ird-tax/configurations/:storeId", async (request, reply) => {
    const paramsSchema = z.object({
      storeId: z.string().uuid(),
    });

    const bodySchema = z.object({
      vat_enabled: z.boolean().optional(),
      vat_rate: z.number().optional(),
      vat_registration_number: z.string().optional(),
      excise_duty_enabled: z.boolean().optional(),
      excise_duty_rates: z.any().optional(),
      withholding_tax_enabled: z.boolean().optional(),
      withholding_tax_rate: z.number().optional(),
      ird_api_url: z.string().optional(),
      ird_api_username: z.string().optional(),
      ird_api_password: z.string().optional(),
      updated_by: z.string().optional(),
    });

    const { storeId } = paramsSchema.parse(request.params);
    const configData = bodySchema.parse(request.body);

    try {
      const config = await irdTaxService.updateConfiguration(
        storeId,
        configData,
      );
      return reply.send(config);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "IRD tax configuration not found"
      ) {
        return reply.status(404).send({ error: error.message });
      }
      return reply
        .status(500)
        .send({ error: "Failed to update IRD tax configuration" });
    }
  });

  // IRD Tax: Calculate tax
  fastify.post("/ird-tax/calculate", async (request, reply) => {
    const schema = z.object({
      store_id: z.string().uuid(),
      net_amount: z.number(),
      transaction_type: z.string(),
      product_category: z.string().optional(),
    });

    const taxData = schema.parse(request.body);

    try {
      const calculation = await irdTaxService.calculateTax(
        taxData.store_id,
        taxData,
      );
      return reply.send(calculation);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "IRD tax configuration not found"
      ) {
        return reply.status(404).send({ error: error.message });
      }
      return reply.status(500).send({ error: "Failed to calculate tax" });
    }
  });

  // IRD Tax: Record transaction
  fastify.post("/ird-tax/transactions", async (request, reply) => {
    const schema = z.object({
      store_id: z.string().uuid(),
      transaction_type: z.string(),
      reference_id: z.string().uuid().optional(),
      reference_type: z.string().optional(),
      vat_amount: z.number(),
      excise_duty_amount: z.number(),
      withholding_tax_amount: z.number(),
      total_tax_amount: z.number(),
      net_amount: z.number(),
      gross_amount: z.number(),
    });

    const transactionData = schema.parse(request.body);

    try {
      const transaction =
        await irdTaxService.recordTransaction(transactionData);
      return reply.status(201).send(transaction);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to record tax transaction" });
    }
  });

  // IRD Tax: Get transactions
  fastify.get("/ird-tax/transactions/:storeId", async (request, reply) => {
    const paramsSchema = z.object({
      storeId: z.string().uuid(),
    });

    const querySchema = z.object({
      start_date: z.coerce.date().optional(),
      end_date: z.coerce.date().optional(),
      transaction_type: z.string().optional(),
      ird_submission_status: z.string().optional(),
    });

    const { storeId } = paramsSchema.parse(request.params);
    const filters = querySchema.parse(request.query);

    try {
      const transactions = await irdTaxService.getTransactions(
        storeId,
        filters,
      );
      return reply.send(transactions);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get tax transactions" });
    }
  });
}
