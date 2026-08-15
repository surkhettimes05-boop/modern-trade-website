import {
  PaginationQuery,
  PaginationQuerySchema,
} from "../contracts/platform.js";

export function parsePaginationQuery(input: unknown): PaginationQuery {
  return PaginationQuerySchema.parse(input ?? {});
}

export function buildPagination<T>(
  items: T[],
  total: number,
  query: PaginationQuery,
) {
  return {
    items,
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.ceil(total / query.pageSize),
  };
}
