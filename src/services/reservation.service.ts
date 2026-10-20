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

type CancelReservationResult =
  | { kind: "invalid" }
  | { kind: "notFound" }
  | { kind: "cancelled"; reservation: Reservation };

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
    .in(["PENDING", "CONFIRMED"])
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

async function getReservationsForUser(userId: string): Promise<Reservation[]> {
  const reservationDocuments = await ReservationModel.find()
    .where("userId")
    .equals(userId)
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

async function cancelReservation(id: string): Promise<CancelReservationResult> {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { kind: "invalid" };
  }

  const reservationId: mongoose.Types.ObjectId = new mongoose.Types.ObjectId(id);
  const updatedReservation = await ReservationModel.findOneAndUpdate(
    { _id: reservationId, status: { $in: ["PENDING", "CONFIRMED"] } },
    { $set: { status: "CANCELLED" } },
    { new: true, runValidators: true },
  ).exec();

  const reservationDocument =
    updatedReservation ?? (await ReservationModel.findById(reservationId).exec());
  if (reservationDocument === null) {
    return { kind: "notFound" };
  }
  if (reservationDocument.status !== "CANCELLED") {
    throw new Error("Reservation status changed during cancellation.");
  }

  return {
    kind: "cancelled",
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

export = { createReservation, getReservationsForUser, cancelReservation };
