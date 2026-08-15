import { FastifyError, FastifyRequest, FastifyReply } from "fastify";
import { logger } from "../utils/logger.js";

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
  // Log error without exposing sensitive information
  logger.error("Request error", {
    message: error.message,
    status: error.statusCode,
    path: request.url,
    method: request.method,
    correlationId: request.id,
  });

  // Determine status code
  const statusCode = error.statusCode || 500;

  // Prepare error response
  const errorResponse: Record<string, unknown> = {
    error: true,
    code: errorCode(statusCode, error),
    message: statusCode >= 500 ? "Internal server error" : error.message,
    requestId: request.id,
    correlationId: request.id,
  };

  // Add validation errors if present
  if (error.validation) {
    errorResponse.validation = error.validation;
  }

  // In development, include stack trace
  if (process.env.NODE_ENV === "development" && statusCode >= 500) {
    errorResponse.stack = error.stack;
  }

  await reply.status(statusCode).send(errorResponse);
};
