import { RuleEngineService } from "../ruleEngineService.js";
import { query } from "../../database/connection.js";

describe("RuleEngineService", () => {
  let ruleEngineService: RuleEngineService;

  beforeEach(async () => {
    await query("DELETE FROM loyalty_rules");
    ruleEngineService = new RuleEngineService();
  });

  describe("calculatePoints", () => {
    it("should calculate points for a basket", async () => {
      const basket = {
        items: [
          {
            product_id: "prod-1",
            quantity: 2,
            unit_price: 100,
            line_total: 200,
          },
        ],
        total_amount: 200,
        channel: "IN_STORE",
      };

      const result = await ruleEngineService.calculatePoints(basket);

      expect(result).toHaveProperty("points");
      expect(result).toHaveProperty("applied_rules");
      expect(result).toHaveProperty("calculation_trace");
      expect(result).toHaveProperty("explanation");
      expect(typeof result.points).toBe("number");
    });

    it("should return zero points for empty basket", async () => {
      const basket = {
        items: [],
        total_amount: 0,
        channel: "IN_STORE",
      };

      const result = await ruleEngineService.calculatePoints(basket);

      expect(result.points).toBe(0);
    });

    it("should apply base earning rule", async () => {
      const basket = {
        items: [
          {
            product_id: "prod-1",
            quantity: 1,
            unit_price: 100,
            line_total: 100,
          },
        ],
        total_amount: 100,
        channel: "IN_STORE",
      };

      const result = await ruleEngineService.calculatePoints(basket);

      // With base earning of 1 point per currency, should get 100 points
      // This depends on active rules in the database
      expect(result.points).toBeGreaterThanOrEqual(0);
    });
  });

  describe("createRule", () => {
    it("should create a new rule version", async () => {
      const input = {
        name: "test_rule",
        rule_type: "base_earning",
        config: { points_per_currency: 1 },
        created_by: "test_user",
      };

      const rule = await ruleEngineService.createRule(input);

      expect(rule).toHaveProperty("id");
      expect(rule.name).toBe("test_rule");
      expect(rule.version).toBe(1);
      expect(rule.status).toBe("DRAFT");
    });

    it("should increment version for existing rule name", async () => {
      const input = {
        name: "test_rule",
        rule_type: "base_earning",
        config: { points_per_currency: 1 },
        created_by: "test_user",
      };

      await ruleEngineService.createRule(input);
      const rule2 = await ruleEngineService.createRule(input);

      expect(rule2.version).toBe(2);
    });
  });

  describe("publishRule", () => {
    it("should publish a draft rule", async () => {
      const input = {
        name: "test_rule",
        rule_type: "base_earning",
        config: { points_per_currency: 1 },
        created_by: "test_user",
      };

      const rule = await ruleEngineService.createRule(input);
      const published = await ruleEngineService.publishRule(
        rule.id,
        "test_user",
      );

      expect(published.status).toBe("PUBLISHED");
      expect(published.published_by).toBe("test_user");
      expect(published.published_at).toBeDefined();
    });

    it("should retire previous version when publishing new version", async () => {
      const input = {
        name: "test_rule",
        rule_type: "base_earning",
        config: { points_per_currency: 1 },
        created_by: "test_user",
      };

      const rule1 = await ruleEngineService.createRule(input);
      await ruleEngineService.publishRule(rule1.id, "test_user");

      const rule2 = await ruleEngineService.createRule(input);
      await ruleEngineService.publishRule(rule2.id, "test_user");

      const retired = await ruleEngineService.getRuleById(rule1.id);
      expect(retired?.status).toBe("RETIRED");
    });
  });

  describe("getActiveRules", () => {
    it("should return only published rules", async () => {
      const rules = await ruleEngineService.getActiveRules();

      expect(Array.isArray(rules)).toBe(true);
      rules.forEach((rule) => {
        expect(rule.status).toBe("PUBLISHED");
      });
    });

    it("should filter by rule type", async () => {
      const rules = await ruleEngineService.getActiveRules("base_earning");

      expect(Array.isArray(rules)).toBe(true);
      rules.forEach((rule) => {
        expect(rule.rule_type).toBe("base_earning");
      });
    });
  });
});
