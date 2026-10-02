import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { retailerOrderService } from "../retailerOrderService.js";
import { query } from "../../database/connection.js";

describe("RetailerOrderService", () => {
  beforeEach(async () => {
    // Setup test data
    await query(`
      INSERT INTO staff (id, staff_number, username, first_name, last_name, role, role_id, status)
      VALUES (
        gen_random_uuid(),
        'STF-TEST-SALES-REP',
        'test_sales_rep',
        'Test',
        'Sales Rep',
        'SALES_REPRESENTATIVE',
        (SELECT id FROM roles WHERE role_key = 'sales_representative' LIMIT 1),
        'ACTIVE'
      )
      ON CONFLICT (username) DO NOTHING
    `);

    await query(`
      INSERT INTO retailers (id, retailer_code, retailer_name, assigned_sales_rep_id, status, approval_status)
      VALUES (
        gen_random_uuid(),
        'TEST001',
        'Test Retailer',
        (SELECT id FROM staff WHERE username = 'test_sales_rep' LIMIT 1),
        'ACTIVE',
        'APPROVED'
      )
      ON CONFLICT (retailer_code) DO NOTHING
    `);

    await query(`
      INSERT INTO products (id, sku, name_en, status)
      VALUES (
        gen_random_uuid(),
        'TEST-PRODUCT-001',
        'Test Product',
        'PUBLISHED'
      )
      ON CONFLICT (sku) DO NOTHING
    `);
  });

  afterEach(async () => {
    // Cleanup test data
    await query("DELETE FROM retailer_order_items WHERE order_id IN (SELECT id FROM retailer_orders WHERE order_number LIKE 'RO-TEST-%')");
    await query("DELETE FROM retailer_orders WHERE order_number LIKE 'RO-TEST-%'");
  });

  describe("getAssignedRetailers", () => {
    it("should return retailers assigned to a sales representative", async () => {
      const salesRep = await query(
        "SELECT id FROM staff WHERE username = 'test_sales_rep' LIMIT 1",
      );
      const retailers = await retailerOrderService.getAssignedRetailers(salesRep.rows[0].id);

      expect(Array.isArray(retailers)).toBe(true);
      expect(retailers.length).toBeGreaterThan(0);
      expect(retailers[0].assigned_sales_rep_id).toBe(salesRep.rows[0].id);
    });

    it("should return empty array for sales rep with no assigned retailers", async () => {
      const retailers = await retailerOrderService.getAssignedRetailers("00000000-0000-0000-0000-000000000000");
      expect(retailers).toEqual([]);
    });
  });

  describe("createRetailerOrder", () => {
    it("should create a retailer order successfully", async () => {
      const salesRep = await query(
        "SELECT id FROM staff WHERE username = 'test_sales_rep' LIMIT 1",
      );
      const retailer = await query(
        "SELECT id FROM retailers WHERE retailer_code = 'TEST001' LIMIT 1",
      );
      const product = await query(
        "SELECT id FROM products WHERE sku = 'TEST-PRODUCT-001' LIMIT 1",
      );

      const order = await retailerOrderService.createRetailerOrder({
        retailer_id: retailer.rows[0].id,
        sales_rep_id: salesRep.rows[0].id,
        items: [
          {
            product_id: product.rows[0].id,
            quantity: 10,
            unit_price: 100,
          },
        ],
        delivery_type: "PICKUP",
        created_by: salesRep.rows[0].id,
      });

      expect(order).toBeDefined();
      expect(order.order_number).toMatch(/^RO-\d{8}-\d{5}$/);
      expect(order.status).toBe("DRAFT");
      expect(order.retailer_id).toBe(retailer.rows[0].id);
      expect(order.sales_rep_id).toBe(salesRep.rows[0].id);
      expect(Number(order.total_amount)).toBe(1000);
    });

    it("should throw error when retailer is not assigned to sales rep", async () => {
      const salesRep = await query(
        "SELECT id FROM staff WHERE username = 'test_sales_rep' LIMIT 1",
      );
      const product = await query(
        "SELECT id FROM products WHERE sku = 'TEST-PRODUCT-001' LIMIT 1",
      );

      await expect(
        retailerOrderService.createRetailerOrder({
          retailer_id: "00000000-0000-0000-0000-000000000000",
          sales_rep_id: salesRep.rows[0].id,
          items: [
            {
              product_id: product.rows[0].id,
              quantity: 10,
              unit_price: 100,
            },
          ],
          created_by: salesRep.rows[0].id,
        }),
      ).rejects.toThrow("Retailer not found or not assigned to sales representative");
    });

    it("should throw error when product does not exist", async () => {
      const salesRep = await query(
        "SELECT id FROM staff WHERE username = 'test_sales_rep' LIMIT 1",
      );
      const retailer = await query(
        "SELECT id FROM retailers WHERE retailer_code = 'TEST001' LIMIT 1",
      );

      await expect(
        retailerOrderService.createRetailerOrder({
          retailer_id: retailer.rows[0].id,
          sales_rep_id: salesRep.rows[0].id,
          items: [
            {
              product_id: "00000000-0000-0000-0000-000000000000",
              quantity: 10,
              unit_price: 100,
            },
          ],
          created_by: salesRep.rows[0].id,
        }),
      ).rejects.toThrow("Product not found");
    });
  });

  describe("getRetailerOrderById", () => {
    it("should return order by ID", async () => {
      const salesRep = await query(
        "SELECT id FROM staff WHERE username = 'test_sales_rep' LIMIT 1",
      );
      const retailer = await query(
        "SELECT id FROM retailers WHERE retailer_code = 'TEST001' LIMIT 1",
      );
      const product = await query(
        "SELECT id FROM products WHERE sku = 'TEST-PRODUCT-001' LIMIT 1",
      );

      const createdOrder = await retailerOrderService.createRetailerOrder({
        retailer_id: retailer.rows[0].id,
        sales_rep_id: salesRep.rows[0].id,
        items: [
          {
            product_id: product.rows[0].id,
            quantity: 10,
            unit_price: 100,
          },
        ],
        created_by: salesRep.rows[0].id,
      });

      const order = await retailerOrderService.getRetailerOrderById(createdOrder.id);

      expect(order).toBeDefined();
      expect(order?.id).toBe(createdOrder.id);
    });

    it("should return null for non-existent order", async () => {
      const order = await retailerOrderService.getRetailerOrderById("00000000-0000-0000-0000-000000000000");
      expect(order).toBeNull();
    });
  });

  describe("getRetailerOrderItems", () => {
    it("should return order items", async () => {
      const salesRep = await query(
        "SELECT id FROM staff WHERE username = 'test_sales_rep' LIMIT 1",
      );
      const retailer = await query(
        "SELECT id FROM retailers WHERE retailer_code = 'TEST001' LIMIT 1",
      );
      const product = await query(
        "SELECT id FROM products WHERE sku = 'TEST-PRODUCT-001' LIMIT 1",
      );

      const createdOrder = await retailerOrderService.createRetailerOrder({
        retailer_id: retailer.rows[0].id,
        sales_rep_id: salesRep.rows[0].id,
        items: [
          {
            product_id: product.rows[0].id,
            quantity: 10,
            unit_price: 100,
          },
        ],
        created_by: salesRep.rows[0].id,
      });

      const items = await retailerOrderService.getRetailerOrderItems(createdOrder.id);

      expect(Array.isArray(items)).toBe(true);
      expect(items.length).toBe(1);
      expect(items[0].product_id).toBe(product.rows[0].id);
      expect(Number(items[0].quantity)).toBe(10);
    });
  });

  describe("getSalesRepOrders", () => {
    it("should return orders for a sales representative", async () => {
      const salesRep = await query(
        "SELECT id FROM staff WHERE username = 'test_sales_rep' LIMIT 1",
      );
      const retailer = await query(
        "SELECT id FROM retailers WHERE retailer_code = 'TEST001' LIMIT 1",
      );
      const product = await query(
        "SELECT id FROM products WHERE sku = 'TEST-PRODUCT-001' LIMIT 1",
      );

      await retailerOrderService.createRetailerOrder({
        retailer_id: retailer.rows[0].id,
        sales_rep_id: salesRep.rows[0].id,
        items: [
          {
            product_id: product.rows[0].id,
            quantity: 10,
            unit_price: 100,
          },
        ],
        created_by: salesRep.rows[0].id,
      });

      const orders = await retailerOrderService.getSalesRepOrders(salesRep.rows[0].id);

      expect(Array.isArray(orders)).toBe(true);
      expect(orders.length).toBeGreaterThan(0);
      expect(orders[0].sales_rep_id).toBe(salesRep.rows[0].id);
    });

    it("should filter orders by status", async () => {
      const salesRep = await query(
        "SELECT id FROM staff WHERE username = 'test_sales_rep' LIMIT 1",
      );
      const retailer = await query(
        "SELECT id FROM retailers WHERE retailer_code = 'TEST001' LIMIT 1",
      );
      const product = await query(
        "SELECT id FROM products WHERE sku = 'TEST-PRODUCT-001' LIMIT 1",
      );

      await retailerOrderService.createRetailerOrder({
        retailer_id: retailer.rows[0].id,
        sales_rep_id: salesRep.rows[0].id,
        items: [
          {
            product_id: product.rows[0].id,
            quantity: 10,
            unit_price: 100,
          },
        ],
        created_by: salesRep.rows[0].id,
      });

      const orders = await retailerOrderService.getSalesRepOrders(salesRep.rows[0].id, {
        status: "DRAFT",
      });

      expect(orders.every((order) => order.status === "DRAFT")).toBe(true);
    });
  });

  describe("updateRetailerOrderStatus", () => {
    it("should update order status successfully", async () => {
      const salesRep = await query(
        "SELECT id FROM staff WHERE username = 'test_sales_rep' LIMIT 1",
      );
      const retailer = await query(
        "SELECT id FROM retailers WHERE retailer_code = 'TEST001' LIMIT 1",
      );
      const product = await query(
        "SELECT id FROM products WHERE sku = 'TEST-PRODUCT-001' LIMIT 1",
      );

      const createdOrder = await retailerOrderService.createRetailerOrder({
        retailer_id: retailer.rows[0].id,
        sales_rep_id: salesRep.rows[0].id,
        items: [
          {
            product_id: product.rows[0].id,
            quantity: 10,
            unit_price: 100,
          },
        ],
        created_by: salesRep.rows[0].id,
      });

      const updatedOrder = await retailerOrderService.updateRetailerOrderStatus(
        createdOrder.id,
        "SUBMITTED",
        salesRep.rows[0].id,
      );

      expect(updatedOrder.status).toBe("SUBMITTED");
    });

    it("should throw error for invalid status transition", async () => {
      const salesRep = await query(
        "SELECT id FROM staff WHERE username = 'test_sales_rep' LIMIT 1",
      );
      const retailer = await query(
        "SELECT id FROM retailers WHERE retailer_code = 'TEST001' LIMIT 1",
      );
      const product = await query(
        "SELECT id FROM products WHERE sku = 'TEST-PRODUCT-001' LIMIT 1",
      );

      const createdOrder = await retailerOrderService.createRetailerOrder({
        retailer_id: retailer.rows[0].id,
        sales_rep_id: salesRep.rows[0].id,
        items: [
          {
            product_id: product.rows[0].id,
            quantity: 10,
            unit_price: 100,
          },
        ],
        created_by: salesRep.rows[0].id,
      });

      await expect(
        retailerOrderService.updateRetailerOrderStatus(
          createdOrder.id,
          "DELIVERED",
          salesRep.rows[0].id,
        ),
      ).rejects.toThrow("Invalid status transition");
    });

    it("should throw error for non-existent order", async () => {
      const salesRep = await query(
        "SELECT id FROM staff WHERE username = 'test_sales_rep' LIMIT 1",
      );

      await expect(
        retailerOrderService.updateRetailerOrderStatus(
          "00000000-0000-0000-0000-000000000000",
          "SUBMITTED",
          salesRep.rows[0].id,
        ),
      ).rejects.toThrow("Order not found");
    });
  });

  describe("getAllRetailerOrders", () => {
    it("should return all retailer orders", async () => {
      const salesRep = await query(
        "SELECT id FROM staff WHERE username = 'test_sales_rep' LIMIT 1",
      );
      const retailer = await query(
        "SELECT id FROM retailers WHERE retailer_code = 'TEST001' LIMIT 1",
      );
      const product = await query(
        "SELECT id FROM products WHERE sku = 'TEST-PRODUCT-001' LIMIT 1",
      );

      await retailerOrderService.createRetailerOrder({
        retailer_id: retailer.rows[0].id,
        sales_rep_id: salesRep.rows[0].id,
        items: [
          {
            product_id: product.rows[0].id,
            quantity: 10,
            unit_price: 100,
          },
        ],
        created_by: salesRep.rows[0].id,
      });

      const orders = await retailerOrderService.getAllRetailerOrders();

      expect(Array.isArray(orders)).toBe(true);
      expect(orders.length).toBeGreaterThan(0);
    });

    it("should filter orders by status", async () => {
      const salesRep = await query(
        "SELECT id FROM staff WHERE username = 'test_sales_rep' LIMIT 1",
      );
      const retailer = await query(
        "SELECT id FROM retailers WHERE retailer_code = 'TEST001' LIMIT 1",
      );
      const product = await query(
        "SELECT id FROM products WHERE sku = 'TEST-PRODUCT-001' LIMIT 1",
      );

      await retailerOrderService.createRetailerOrder({
        retailer_id: retailer.rows[0].id,
        sales_rep_id: salesRep.rows[0].id,
        items: [
          {
            product_id: product.rows[0].id,
            quantity: 10,
            unit_price: 100,
          },
        ],
        created_by: salesRep.rows[0].id,
      });

      const orders = await retailerOrderService.getAllRetailerOrders({
        status: "DRAFT",
      });

      expect(orders.every((order) => order.status === "DRAFT")).toBe(true);
    });
  });
});
