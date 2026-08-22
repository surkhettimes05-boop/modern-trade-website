import { FastifyError, FastifyRequest, FastifyReply } from "fastify";
import { logger } from "../utils/logger.js";
import { ZodError } from "zod";

function errorCode(statusCode: number, error: FastifyError): string {
  if (statusCode === 400)
    return error.validation ? "VALIDATION_FAILED" : "BAD_REQUEST";
  if (statusCode === 401) return "UNAUTHORIZED";
  if (statusCode === 403) return "FORBIDDEN";
  if (statusCode === 404) return "NOT_FOUND";
  if (statusCode === 409) return "CONFLICT";
  if (statusCode === 429) return "RATE_LIMITED";
  return "INTERNAL_ERROR";
}

export const errorHandler = async (
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const zodValidation =
    error instanceof ZodError ||
    ((error as Error & { issues?: unknown }).name === "ZodError" &&
      Array.isArray((error as Error & { issues?: unknown }).issues));
  const statusCode = zodValidation ? 400 : error.statusCode || 500;

  // Log error without exposing sensitive information
  const logMeta = {
    message: statusCode >= 500 ? error.message : "Request rejected",
    status: statusCode,
    path: request.routeOptions?.url || request.url.split("?", 1)[0],
    method: request.method,
    correlationId: request.id,
  };
  if (statusCode >= 500) logger.error("Request error", logMeta);
  else logger.warn("Request rejected", logMeta);

  // Prepare error response
  const errorResponse: Record<string, unknown> = {
    error: true,
    code: errorCode(statusCode, error),
    message:
      statusCode >= 500
        ? "Internal server error"
        : zodValidation
          ? "Validation failed"
          : error.message,
    requestId: request.id,
    correlationId: request.id,
  };

  // Add validation errors if present
  if (zodValidation) {
    const issues = (error as unknown as ZodError).issues;
    errorResponse.validation = issues.map((issue) => ({
      code: issue.code,
      path: issue.path,
      message: issue.message,
    }));
  } else if (error.validation) {
    errorResponse.validation = error.validation;
  }

  // In development, include stack trace
  if (process.env.NODE_ENV === "development" && statusCode >= 500) {
    errorResponse.stack = error.stack;
  }

  await reply.status(statusCode).send(errorResponse);
};
