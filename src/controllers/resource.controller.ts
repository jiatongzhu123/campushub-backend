import type { Request, Response } from "express";
import resourceService = require("../services/resource.service");
import type {
  ErrorResponse,
  Resource,
  ResourceFilters,
  ResourceType,
} from "../types/reservation";

function isResourceType(value: unknown): value is ResourceType {
  return value === "ROOM" || value === "EQUIPMENT" || value === "LAB";
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
    if (type !== undefined && !isResourceType(type)) {
      sendError(
        response,
        400,
        "VALIDATION_ERROR",
        "type must be ROOM, EQUIPMENT, or LAB.",
      );
      return;
    }

    const isAvailable: unknown = request.query.isAvailable;
    if (isAvailable !== undefined && isAvailable !== "true" && isAvailable !== "false") {
      sendError(
        response,
        400,
        "VALIDATION_ERROR",
        'isAvailable must be "true" or "false".',
      );
      return;
    }

    const filters: ResourceFilters = {};
    if (type !== undefined) {
      filters.type = type;
    }
    if (isAvailable !== undefined) {
      filters.isAvailable = isAvailable === "true";
    }

    const resourceList: Resource[] = await resourceService.getResources(filters);
    response.status(200).json(resourceList);
  } catch {
    sendError(response, 500, "INTERNAL_ERROR", "An unexpected server error occurred.");
  }
}

export = { getResources };
