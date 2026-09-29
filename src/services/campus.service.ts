import crypto = require("node:crypto");
import type { Reservation, Resource } from "../types/reservation";

type ReservationDetails = Pick<
  Reservation,
  "resourceId" | "userId" | "startTime" | "endTime"
>;

const resources: Resource[] = [
  {
    id: "resource-1",
    name: "Library Study Room",
    type: "STUDY_ROOM",
    location: "Library, Floor 2",
    isAvailable: true,
  },
  {
    id: "resource-2",
    name: "Chemistry Lab",
    type: "LAB",
    location: "Science Building, Room 204",
    isAvailable: true,
  },
  {
    id: "resource-3",
    name: "Projector",
    type: "EQUIPMENT",
    location: "Media Desk",
    isAvailable: true,
  },
];

const reservations: Reservation[] = [];

function getResources(type?: string): Resource[] {
  return type === undefined
    ? [...resources]
    : resources.filter((resource: Resource): boolean => resource.type === type);
}

function createReservation(details: ReservationDetails): Reservation | null {
  const newStart: number = Date.parse(details.startTime);
  const newEnd: number = Date.parse(details.endTime);

  const overlaps: boolean = reservations.some(
    (existing: Reservation): boolean =>
      existing.resourceId === details.resourceId &&
      existing.status !== "CANCELLED" &&
      newStart < Date.parse(existing.endTime) &&
      newEnd > Date.parse(existing.startTime),
  );

  if (overlaps) {
    return null;
  }

  const reservation: Reservation = {
    ...details,
    id: crypto.randomUUID(),
    status: "PENDING",
  };
  reservations.push(reservation);
  return reservation;
}

function getActiveReservationsForUser(userId: string): Reservation[] {
  return reservations.filter(
    (reservation: Reservation): boolean =>
      reservation.userId === userId &&
      (reservation.status === "PENDING" || reservation.status === "CONFIRMED"),
  );
}

export = { getResources, createReservation, getActiveReservationsForUser };
