import type { Request, Response } from "express";
import resourceService = require("../services/resource.service");
import type { ErrorResponse, Resource } from "../types/reservation";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function sendError(
  response: Response,
  statusCode: number,
  code: string,
  message: string,
): void {
  const error: ErrorResponse = { code, message };
  response.status(statusCode).json(error);
}

async function getResources(request: Request, response: Response): Promise<void> {
  try {
    const type: unknown = request.query.type;
    if (type !== undefined && !isNonEmptyString(type)) {
      sendError(
        response,
        400,
        "VALIDATION_ERROR",
        "type must be a non-empty string when provided.",
      );
      return;
    }

    const resourceList: Resource[] = await resourceService.getResources(
      type === undefined ? undefined : type.trim(),
    );
    response.status(200).json(resourceList);
  } catch {
    sendError(response, 500, "INTERNAL_ERROR", "An unexpected server error occurred.");
  }
}

export = { getResources };
