import type { Request, Response } from "express";
import resourceService = require("../services/resource.service");
import HttpError = require("../errors/HttpError");
import type {
  Resource,
  ResourceFilters,
  ResourceType,
} from "../types/reservation";

function isResourceType(value: unknown): value is ResourceType {
  return value === "ROOM" || value === "EQUIPMENT" || value === "LAB";
}

async function getResources(request: Request, response: Response): Promise<void> {
  const type: unknown = request.query.type;
  if (type !== undefined && !isResourceType(type)) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "type must be ROOM, EQUIPMENT, or LAB.",
    );
  }

  const isAvailable: unknown = request.query.isAvailable;
  if (isAvailable !== undefined && isAvailable !== "true" && isAvailable !== "false") {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      'isAvailable must be "true" or "false".',
    );
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
}

export = { getResources };
