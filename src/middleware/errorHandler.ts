import type { NextFunction, Request, Response } from "express";
import HttpError = require("../errors/HttpError");
import type { ErrorResponse } from "../types/reservation";

function getRequestParserError(error: unknown, request: Request): HttpError | undefined {
  if (
    request.route !== undefined ||
    !(error instanceof Error) ||
    !("status" in error) ||
    !("statusCode" in error) ||
    error.status !== error.statusCode ||
    !("expose" in error) ||
    error.expose !== true
  ) {
    return undefined;
  }

  if (error.status === 400) {
    return new HttpError(400, "VALIDATION_ERROR", "Invalid request body.");
  }

  if (!("type" in error)) {
    return undefined;
  }

  if (error.status === 413 && error.type === "entity.too.large") {
    return new HttpError(413, "VALIDATION_ERROR", "Request body is too large.");
  }

  if (error.status === 415) {
    if (error.type === "charset.unsupported") {
      return new HttpError(415, "VALIDATION_ERROR", "Unsupported request charset.");
    }
    if (error.type === "encoding.unsupported") {
      return new HttpError(415, "VALIDATION_ERROR", "Unsupported content encoding.");
    }
  }

  return undefined;
}

function errorHandler(
  error: unknown,
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  if (response.headersSent) {
    next(error);
    return;
  }

  const httpError: HttpError | undefined =
    error instanceof HttpError ? error : getRequestParserError(error, request);
  const body: ErrorResponse = {
    code: httpError?.code ?? "INTERNAL_ERROR",
    message: httpError?.message ?? "An unexpected server error occurred.",
  };
  response.status(httpError?.statusCode ?? 500).json(body);
}

export = errorHandler;
