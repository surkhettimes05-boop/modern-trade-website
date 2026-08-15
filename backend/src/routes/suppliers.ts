import { FastifyInstance } from "fastify";
import { z } from "zod";
import { SupplierService } from "../services/supplierService.js";

const supplierService = new SupplierService();

export async function supplierRoutes(fastify: FastifyInstance) {
  // Supplier: Create supplier
  fastify.post("/suppliers", async (request, reply) => {
    const schema = z.object({
      supplier_name: z.string().min(1),
      contact_person: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().email().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      country: z.string().optional(),
      payment_terms: z.string().optional(),
      credit_limit: z.number().optional(),
      tax_id: z.string().optional(),
      pan_number: z.string().optional(),
      notes: z.string().optional(),
      metadata: z.any().optional(),
      created_by: z.string(),
    });

    const supplierData = schema.parse(request.body);

    try {
      const supplier = await supplierService.createSupplier(supplierData);
      return reply.status(201).send(supplier);
    } catch {
      return reply.status(500).send({ error: "Failed to create supplier" });
    }
  });

  // Supplier: Get supplier by ID
  fastify.get("/suppliers/:supplierId", async (request, reply) => {
    const schema = z.object({
      supplierId: z.string().uuid(),
    });

    const { supplierId } = schema.parse(request.params);

    try {
      const supplier = await supplierService.getSupplier(supplierId);
      if (!supplier) {
        return reply.status(404).send({ error: "Supplier not found" });
      }
      return reply.send(supplier);
    } catch {
      return reply.status(500).send({ error: "Failed to get supplier" });
    }
  });

  // Supplier: Get all suppliers
  fastify.get("/suppliers", async (request, reply) => {
    const schema = z.object({
      status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).optional(),
      approval_status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
      search: z.string().optional(),
      limit: z.coerce.number().optional(),
      offset: z.coerce.number().optional(),
    });

    const filters = schema.parse(request.query);

    try {
      const suppliers = await supplierService.getSuppliers(filters);
      return reply.send(suppliers);
    } catch {
      return reply.status(500).send({ error: "Failed to get suppliers" });
    }
  });

  // Supplier: Update supplier
  fastify.put("/suppliers/:supplierId", async (request, reply) => {
    const paramsSchema = z.object({
      supplierId: z.string().uuid(),
    });

    const bodySchema = z.object({
      supplier_name: z.string().optional(),
      contact_person: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().email().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      payment_terms: z.string().optional(),
      credit_limit: z.number().optional(),
      rating: z.number().min(1).max(5).optional(),
      status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).optional(),
      notes: z.string().optional(),
      metadata: z.any().optional(),
    });

    const { supplierId } = paramsSchema.parse(request.params);
    const updates = bodySchema.parse(request.body);

    try {
      const supplier = await supplierService.updateSupplier(
        supplierId,
        updates,
      );
      return reply.send(supplier);
    } catch (error) {
      if (error instanceof Error && error.message === "No fields to update") {
        return reply.status(400).send({ error: "No fields to update" });
      }
      return reply.status(500).send({ error: "Failed to update supplier" });
    }
  });

  // Supplier: Approve supplier
  fastify.post("/suppliers/:supplierId/approve", async (request, reply) => {
    const paramsSchema = z.object({
      supplierId: z.string().uuid(),
    });

    const bodySchema = z.object({
      approved_by: z.string(),
    });

    const { supplierId } = paramsSchema.parse(request.params);
    const { approved_by } = bodySchema.parse(request.body);

    try {
      const supplier = await supplierService.approveSupplier(
        supplierId,
        approved_by,
      );
      return reply.send(supplier);
    } catch {
      return reply.status(500).send({ error: "Failed to approve supplier" });
    }
  });

  // Supplier: Reject supplier
  fastify.post("/suppliers/:supplierId/reject", async (request, reply) => {
    const paramsSchema = z.object({
      supplierId: z.string().uuid(),
    });

    const bodySchema = z.object({
      approved_by: z.string(),
    });

    const { supplierId } = paramsSchema.parse(request.params);
    const { approved_by } = bodySchema.parse(request.body);

    try {
      const supplier = await supplierService.rejectSupplier(
        supplierId,
        approved_by,
      );
      return reply.send(supplier);
    } catch {
      return reply.status(500).send({ error: "Failed to reject supplier" });
    }
  });

  // Supplier Catalog: Add product to catalog
  fastify.post("/suppliers/:supplierId/catalog", async (request, reply) => {
    const paramsSchema = z.object({
      supplierId: z.string().uuid(),
    });

    const bodySchema = z.object({
      product_id: z.string().uuid(),
      supplier_sku: z.string().optional(),
      supplier_product_name: z.string().optional(),
      unit_price: z.number().positive(),
      minimum_order_quantity: z.number().positive().optional(),
      lead_time_days: z.number().positive().optional(),
      is_preferred: z.boolean().optional(),
      expiry_date: z.coerce.date().optional(),
      metadata: z.any().optional(),
    });

    const { supplierId } = paramsSchema.parse(request.params);
    const catalogData = bodySchema.parse(request.body);

    try {
      const catalog = await supplierService.addProductToCatalog({
        ...catalogData,
        supplier_id: supplierId,
      });
      return reply.status(201).send(catalog);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to add product to catalog" });
    }
  });

  // Supplier Catalog: Get supplier catalog
  fastify.get("/suppliers/:supplierId/catalog", async (request, reply) => {
    const paramsSchema = z.object({
      supplierId: z.string().uuid(),
    });

    const querySchema = z.object({
      product_id: z.string().uuid().optional(),
      effective_date: z.coerce.date().optional(),
    });

    const { supplierId } = paramsSchema.parse(request.params);
    const filters = querySchema.parse(request.query);

    try {
      const catalog = await supplierService.getSupplierCatalog(
        supplierId,
        filters,
      );
      return reply.send(catalog);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get supplier catalog" });
    }
  });

  // Supplier: Search suppliers by product
  fastify.get(
    "/suppliers/search/product/:productId",
    async (request, reply) => {
      const schema = z.object({
        productId: z.string().uuid(),
      });

      const { productId } = schema.parse(request.params);

      try {
        const suppliers =
          await supplierService.searchSuppliersByProduct(productId);
        return reply.send(suppliers);
      } catch {
        return reply.status(500).send({ error: "Failed to search suppliers" });
      }
    },
  );

  // Supplier: Get summary
  fastify.get("/suppliers/summary", async (_request, reply) => {
    try {
      const summary = await supplierService.getSupplierSummary();
      return reply.send(summary);
    } catch {
      return reply
        .status(500)
        .send({ error: "Failed to get supplier summary" });
    }
  });
}
