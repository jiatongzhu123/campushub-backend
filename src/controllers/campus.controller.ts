import type { Request, Response } from "express";
import campusService = require("../services/campus.service");
import type { ErrorResponse, Reservation, Resource } from "../types/reservation";

const dateTimePattern: RegExp =
  /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidDateTime(value: string): boolean {
  const calendarDate: string | undefined = dateTimePattern.exec(value)?.[1];
  if (calendarDate === undefined) {
    return false;
  }

  const dateAtMidnight: Date = new Date(`${calendarDate}T00:00:00Z`);
  return (
    !Number.isNaN(dateAtMidnight.getTime()) &&
    dateAtMidnight.toISOString().slice(0, 10) === calendarDate &&
    !Number.isNaN(Date.parse(value))
  );
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

function getResources(request: Request, response: Response): void {
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

    const resourceList: Resource[] = campusService.getResources(
      type === undefined ? undefined : type.trim(),
    );
    response.status(200).json(resourceList);
  } catch {
    sendError(response, 500, "INTERNAL_ERROR", "An unexpected server error occurred.");
  }
}

function createReservation(request: Request, response: Response): void {
  try {
    const body: unknown = request.body;
    if (!isRecord(body)) {
      sendError(response, 400, "VALIDATION_ERROR", "Request body must be an object.");
      return;
    }

    const { resourceId, userId, startTime, endTime } = body;
    if (
      !isNonEmptyString(resourceId) ||
      !isNonEmptyString(userId) ||
      !isNonEmptyString(startTime) ||
      !isNonEmptyString(endTime)
    ) {
      sendError(
        response,
        400,
        "VALIDATION_ERROR",
        "resourceId, userId, startTime, and endTime must be non-empty strings.",
      );
      return;
    }

    if (!isValidDateTime(startTime) || !isValidDateTime(endTime)) {
      sendError(
        response,
        400,
        "VALIDATION_ERROR",
        "startTime and endTime must be valid date-time strings.",
      );
      return;
    }

    if (Date.parse(endTime) <= Date.parse(startTime)) {
      sendError(response, 400, "VALIDATION_ERROR", "endTime must be later than startTime.");
      return;
    }

    const reservation: Reservation | null = campusService.createReservation({
      resourceId,
      userId,
      startTime,
      endTime,
    });
    if (reservation === null) {
      sendError(
        response,
        409,
        "DOUBLE_BOOKING",
        "Resource is already reserved for this time slot.",
      );
      return;
    }

    response.status(201).json(reservation);
  } catch {
    sendError(response, 500, "INTERNAL_ERROR", "An unexpected server error occurred.");
  }
}

function getUserReservations(request: Request, response: Response): void {
  try {
    const userId: unknown = request.params.userId;
    if (!isNonEmptyString(userId)) {
      sendError(response, 400, "VALIDATION_ERROR", "userId must be a non-empty string.");
      return;
    }

    const reservations: Reservation[] = campusService.getActiveReservationsForUser(userId);
    response.status(200).json(reservations);
  } catch {
    sendError(response, 500, "INTERNAL_ERROR", "An unexpected server error occurred.");
  }
}

export = { getResources, createReservation, getUserReservations };
