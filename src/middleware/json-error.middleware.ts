import type { NextFunction, Request, Response } from "express";
import type { ErrorResponse } from "../types/reservation";

function handleMalformedJson(
  error: unknown,
  _request: Request,
  response: Response,
  next: NextFunction,
): void {
  if (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    error.type === "entity.parse.failed" &&
    "status" in error &&
    error.status === 400
  ) {
    const body: ErrorResponse = {
      code: "VALIDATION_ERROR",
      message: "Malformed JSON request body.",
    };
    response.status(400).json(body);
    return;
  }

  next(error);
}

export = handleMalformedJson;
