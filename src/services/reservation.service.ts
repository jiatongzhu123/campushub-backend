import mongoose = require("mongoose");
import reservationModelModule = require("../models/Reservation.model");
import type { Reservation } from "../types/reservation";

const { ReservationModel } = reservationModelModule;

interface CreateReservationInput {
  resourceId: string;
  userId: string;
  startTime: string;
  endTime: string;
}

type InvalidReservationReason = "INVALID_RESOURCE_ID" | "INVALID_TIME_RANGE";

type CreateReservationResult =
  | { kind: "created"; reservation: Reservation }
  | { kind: "conflict" }
  | { kind: "invalid"; reason: InvalidReservationReason };

async function createReservation(
  input: CreateReservationInput,
): Promise<CreateReservationResult> {
  if (!mongoose.Types.ObjectId.isValid(input.resourceId)) {
    return { kind: "invalid", reason: "INVALID_RESOURCE_ID" };
  }

  const startTime: Date = new Date(input.startTime);
  const endTime: Date = new Date(input.endTime);
  if (
    Number.isNaN(startTime.getTime()) ||
    Number.isNaN(endTime.getTime()) ||
    endTime.getTime() <= startTime.getTime()
  ) {
    return { kind: "invalid", reason: "INVALID_TIME_RANGE" };
  }

  const resourceId: mongoose.Types.ObjectId = new mongoose.Types.ObjectId(
    input.resourceId,
  );
  const conflictingReservation = await ReservationModel.findOne()
    .where("resourceId")
    .equals(resourceId)
    .where("status")
    .ne("CANCELLED")
    .where("startTime")
    .lt(endTime.getTime())
    .where("endTime")
    .gt(startTime.getTime())
    .exec();

  if (conflictingReservation !== null) {
    return { kind: "conflict" };
  }

  const reservationDocument = new ReservationModel({
    resourceId,
    userId: input.userId,
    startTime,
    endTime,
  });
  await reservationDocument.save();

  return {
    kind: "created",
    reservation: {
      id: reservationDocument._id.toString(),
      resourceId: reservationDocument.resourceId.toString(),
      userId: reservationDocument.userId,
      startTime: reservationDocument.startTime.toISOString(),
      endTime: reservationDocument.endTime.toISOString(),
      status: reservationDocument.status,
    },
  };
}

async function getActiveReservationsForUser(userId: string): Promise<Reservation[]> {
  const reservationDocuments = await ReservationModel.find()
    .where("userId")
    .equals(userId)
    .where("status")
    .in(["PENDING", "CONFIRMED"])
    .exec();

  return reservationDocuments.map(
    (reservationDocument): Reservation => ({
      id: reservationDocument._id.toString(),
      resourceId: reservationDocument.resourceId.toString(),
      userId: reservationDocument.userId,
      startTime: reservationDocument.startTime.toISOString(),
      endTime: reservationDocument.endTime.toISOString(),
      status: reservationDocument.status,
    }),
  );
}

export = { createReservation, getActiveReservationsForUser };
