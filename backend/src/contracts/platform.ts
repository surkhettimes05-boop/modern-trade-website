import { z } from "zod";
export { MARKET } from "../config/market.js";
import { MARKET } from "../config/market.js";

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.string().max(100).optional(),
  order: z.enum(["asc", "desc"]).default("asc"),
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export type PaginatedResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export const ApiErrorCode = {
  BadRequest: "BAD_REQUEST",
  ValidationFailed: "VALIDATION_FAILED",
  Unauthorized: "UNAUTHORIZED",
  Forbidden: "FORBIDDEN",
  NotFound: "NOT_FOUND",
  Conflict: "CONFLICT",
  RateLimited: "RATE_LIMITED",
  Internal: "INTERNAL_ERROR",
} as const;

export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

export type ApiErrorResponse = {
  error: true;
  code: ApiErrorCode;
  message: string;
  requestId: string;
  validation?: unknown;
};

export type StaffSessionContract = {
  authenticated: boolean;
  user?: { id: string; username: string; name: string; staffNumber: string };
  role?: {
    id: string | null;
    key: string | null;
    name: string | null;
    level: number | null;
  };
  capabilities?: string[];
  scope?: { type: string; organizationId: string | null; storeIds: string[] };
  organization?: {
    id: string;
    name: string;
    countryCode: string;
    currencyCode: string;
    locale: string;
    timezone: string;
  } | null;
  storeAssignment?: {
    id: string;
    name: string;
    code: string;
    currencyCode: string;
    locale: string;
    timezone: string;
  } | null;
  featureFlags?: Record<string, boolean>;
};

export type CatalogProductContract = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  price: number;
  currencyCode: typeof MARKET.currencyCode;
  imageUrl: string | null;
  available: boolean;
};

export type StoreContract = {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  countryCode: typeof MARKET.countryCode;
  currencyCode: typeof MARKET.currencyCode;
  locale: typeof MARKET.locale;
  timezone: typeof MARKET.timezone;
};

export const NepalPhoneSchema = z
  .string()
  .trim()
  .regex(MARKET.phonePattern, "Invalid Nepal mobile number");
export const NepalPostalCodeSchema = z
  .string()
  .trim()
  .regex(MARKET.postalCodePattern, "Invalid Nepal postal code");
