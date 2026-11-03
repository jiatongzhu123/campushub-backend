import type { NextFunction, Request, Response } from "express";
import HttpError = require("../errors/HttpError");
import type { ErrorResponse } from "../types/reservation";

function errorHandler(
  error: unknown,
  _request: Request,
  response: Response,
  next: NextFunction,
): void {
  if (response.headersSent) {
    next(error);
    return;
  }

  const httpError: HttpError | undefined = error instanceof HttpError ? error : undefined;
  const body: ErrorResponse = {
    code: httpError?.code ?? "INTERNAL_ERROR",
    message: httpError?.message ?? "An unexpected server error occurred.",
  };
  response.status(httpError?.statusCode ?? 500).json(body);
}

export = errorHandler;
