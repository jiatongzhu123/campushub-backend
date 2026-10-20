import type { Request, Response } from "express";
import reservationService = require("../services/reservation.service");
import type { ErrorResponse, Reservation } from "../types/reservation";

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

async function createReservation(request: Request, response: Response): Promise<void> {
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

    const result = await reservationService.createReservation({
      resourceId,
      userId,
      startTime,
      endTime,
    });

    if (result.kind === "invalid") {
      const message: string =
        result.reason === "INVALID_RESOURCE_ID"
          ? "resourceId must be a valid MongoDB ObjectId."
          : "endTime must be later than startTime.";
      sendError(response, 400, "VALIDATION_ERROR", message);
      return;
    }

    if (result.kind === "conflict") {
      sendError(
        response,
        409,
        "DOUBLE_BOOKING",
        "Resource is already reserved for this time slot.",
      );
      return;
    }

    response.status(201).json(result.reservation);
  } catch {
    sendError(response, 500, "INTERNAL_ERROR", "An unexpected server error occurred.");
  }
}

async function getUserReservations(
  request: Request,
  response: Response,
): Promise<void> {
  try {
    const userId: unknown = request.params.userId;
    if (!isNonEmptyString(userId)) {
      sendError(response, 400, "VALIDATION_ERROR", "userId must be a non-empty string.");
      return;
    }

    const reservations: Reservation[] =
      await reservationService.getReservationsForUser(userId);
    response.status(200).json(reservations);
  } catch {
    sendError(response, 500, "INTERNAL_ERROR", "An unexpected server error occurred.");
  }
}

async function cancelReservation(request: Request, response: Response): Promise<void> {
  try {
    const id: unknown = request.params.id;
    if (!isNonEmptyString(id)) {
      sendError(response, 400, "VALIDATION_ERROR", "id must be a valid MongoDB ObjectId.");
      return;
    }

    const result = await reservationService.cancelReservation(id);
    if (result.kind === "invalid") {
      sendError(response, 400, "VALIDATION_ERROR", "id must be a valid MongoDB ObjectId.");
      return;
    }
    if (result.kind === "notFound") {
      sendError(response, 404, "NOT_FOUND", "Reservation not found.");
      return;
    }

    response.status(200).json(result.reservation);
  } catch {
    sendError(response, 500, "INTERNAL_ERROR", "An unexpected server error occurred.");
  }
}

export = { createReservation, getUserReservations, cancelReservation };
