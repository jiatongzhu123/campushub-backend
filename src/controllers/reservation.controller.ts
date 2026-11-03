import type { Request, Response } from "express";
import reservationService = require("../services/reservation.service");
import HttpError = require("../errors/HttpError");
import type { Reservation } from "../types/reservation";

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

async function createReservation(request: Request, response: Response): Promise<void> {
  const body: unknown = request.body;
  if (!isRecord(body)) {
    throw new HttpError(400, "VALIDATION_ERROR", "Request body must be an object.");
  }

  const { resourceId, userId, startTime, endTime } = body;
  if (
    !isNonEmptyString(resourceId) ||
    !isNonEmptyString(userId) ||
    !isNonEmptyString(startTime) ||
    !isNonEmptyString(endTime)
  ) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "resourceId, userId, startTime, and endTime must be non-empty strings.",
    );
  }

  if (!isValidDateTime(startTime) || !isValidDateTime(endTime)) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "startTime and endTime must be valid date-time strings.",
    );
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
    throw new HttpError(400, "VALIDATION_ERROR", message);
  }

  if (result.kind === "conflict") {
    throw new HttpError(
      409,
      "DOUBLE_BOOKING",
      "Resource is already reserved for this time slot.",
    );
  }

  response.status(201).json(result.reservation);
}

async function getUserReservations(
  request: Request,
  response: Response,
): Promise<void> {
  const userId: unknown = request.params.userId;
  if (!isNonEmptyString(userId)) {
    throw new HttpError(400, "VALIDATION_ERROR", "userId must be a non-empty string.");
  }

  const reservations: Reservation[] =
    await reservationService.getReservationsForUser(userId);
  response.status(200).json(reservations);
}

async function cancelReservation(request: Request, response: Response): Promise<void> {
  const id: unknown = request.params.id;
  if (!isNonEmptyString(id)) {
    throw new HttpError(400, "VALIDATION_ERROR", "id must be a valid MongoDB ObjectId.");
  }

  const result = await reservationService.cancelReservation(id);
  if (result.kind === "invalid") {
    throw new HttpError(400, "VALIDATION_ERROR", "id must be a valid MongoDB ObjectId.");
  }
  if (result.kind === "notFound") {
    throw new HttpError(404, "NOT_FOUND", "Reservation not found.");
  }

  response.status(200).json(result.reservation);
}

export = { createReservation, getUserReservations, cancelReservation };
