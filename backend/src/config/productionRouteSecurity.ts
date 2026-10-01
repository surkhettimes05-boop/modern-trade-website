export type ProductionRouteBoundary =
  | "PUBLIC_READ_ONLY"
  | "PUBLIC_VALIDATED_MUTATION"
  | "CUSTOMER_SESSION"
  | "STAFF_SESSION"
  | "PRIVILEGED_STAFF_MFA"
  | "SIGNED_WEBHOOK"
  | "MIXED_EXPLICIT";

/**
 * Every Fastify plugin registered by app.ts must appear here. The matching
 * test fails when a new production plugin is registered without an explicit
 * security-boundary review.
 */
export const PRODUCTION_ROUTE_SECURITY: Readonly<Record<string, ProductionRouteBoundary>> = {
  healthRoutes: "PUBLIC_READ_ONLY",
  publicRoutes: "PUBLIC_VALIDATED_MUTATION",
  authRoutes: "MIXED_EXPLICIT",
  shoppingCartRoutes: "CUSTOMER_SESSION",
  checkoutRoutes: "CUSTOMER_SESSION",
  addressRoutes: "MIXED_EXPLICIT",
  loyaltyMvpRoutes: "MIXED_EXPLICIT",
  paymentWebhookRoutes: "SIGNED_WEBHOOK",
  operationsAuthRoutes: "MIXED_EXPLICIT",
  protectedOperations: "STAFF_SESSION",
  webOrderRoutes: "STAFF_SESSION",
  privilegedAdministration: "PRIVILEGED_STAFF_MFA",
};
