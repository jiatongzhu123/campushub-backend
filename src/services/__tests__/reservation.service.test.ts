import mongoose = require("mongoose");
import reservationService = require("../reservation.service");
import reservationModelModule = require("../../models/Reservation.model");
import resourceModelModule = require("../../models/Resource.model");
import type { CreateReservationDTO, Reservation } from "../../types/reservation";

const { ReservationModel } = reservationModelModule;
const { ResourceModel } = resourceModelModule;

type CreateResult = Awaited<ReturnType<typeof reservationService.createReservation>>;
type ReservationRecord = InstanceType<typeof ReservationModel>;

interface ConcurrentBookingObservation {
  kinds: string[];
  persisted: number;
  reservations: ReservationRecord[];
}

const startTime: string = "2026-10-19T10:00:00.000Z";
const endTime: string = "2026-10-19T11:00:00.000Z";
let resourceId: string;

beforeEach(async (): Promise<void> => {
  const resource = await ResourceModel.create({
    name: "Study Room",
    type: "ROOM",
    location: "Library",
    isAvailable: true,
  });
  resourceId = resource._id.toString();
});

function booking(overrides: Partial<CreateReservationDTO> = {}): CreateReservationDTO {
  return {
    resourceId,
    userId: "student-1",
    startTime,
    endTime,
    ...overrides,
  };
}

function expectCreated(result: CreateResult): Reservation {
  expect(result.kind).toBe("created");
  if (result.kind !== "created") {
    throw new Error(`Expected a created reservation, received ${result.kind}.`);
  }
  return result.reservation;
}

async function seedReservation(status: "PENDING" | "CONFIRMED" | "CANCELLED" = "PENDING"): Promise<Reservation> {
  const reservation = expectCreated(await reservationService.createReservation(booking()));
  if (status !== "PENDING") {
    await ReservationModel.findByIdAndUpdate(reservation.id, { status }).exec();
  }
  const persisted = await ReservationModel.findById(reservation.id).exec();
  expect(persisted).not.toBeNull();
  expect(persisted?.status).toBe(status);
  return { ...reservation, status };
}

test("creates a pending reservation for a Resource model fixture", async (): Promise<void> => {
  const result = expectCreated(await reservationService.createReservation(booking()));

  expect(result).toEqual({
    id: expect.any(String),
    resourceId,
    userId: "student-1",
    startTime,
    endTime,
    status: "PENDING",
  });
  expect(mongoose.Types.ObjectId.isValid(result.id)).toBe(true);
  const stored = await ReservationModel.findById(result.id).exec();
  expect(stored?.resourceId.toString()).toBe(resourceId);
  expect(stored?.status).toBe("PENDING");
});

for (const status of ["PENDING", "CONFIRMED"] as const) {
  test(`${status} reservations block an identical booking`, async (): Promise<void> => {
    await seedReservation(status);
    expect(await reservationService.createReservation(booking({ userId: "student-2" }))).toEqual({ kind: "conflict" });
    expect(await ReservationModel.countDocuments()).toBe(1);
  });
}

const overlappingRanges: ReadonlyArray<{ label: string; start: string; end: string }> = [
  { label: "fully contained", start: "2026-10-19T10:15:00.000Z", end: "2026-10-19T10:45:00.000Z" },
  { label: "fully enveloping", start: "2026-10-19T09:30:00.000Z", end: "2026-10-19T11:30:00.000Z" },
  { label: "partially overlapping the beginning", start: "2026-10-19T09:30:00.000Z", end: "2026-10-19T10:30:00.000Z" },
  { label: "partially overlapping the end", start: "2026-10-19T10:30:00.000Z", end: "2026-10-19T11:30:00.000Z" },
  { label: "overlapping the beginning by one millisecond", start: "2026-10-19T09:30:00.000Z", end: "2026-10-19T10:00:00.001Z" },
  { label: "overlapping the end by one millisecond", start: "2026-10-19T10:59:59.999Z", end: "2026-10-19T11:30:00.000Z" },
];

for (const range of overlappingRanges) {
  test(`rejects a ${range.label} reservation`, async (): Promise<void> => {
    await seedReservation();
    expect(await reservationService.createReservation(booking({ startTime: range.start, endTime: range.end })))
      .toEqual({ kind: "conflict" });
    expect(await ReservationModel.countDocuments()).toBe(1);
  });
}

for (const range of [
  { label: "ending exactly when the existing booking starts", start: "2026-10-19T09:00:00.000Z", end: startTime },
  { label: "starting exactly when the existing booking ends", start: endTime, end: "2026-10-19T12:00:00.000Z" },
]) {
  test(`allows a reservation ${range.label}`, async (): Promise<void> => {
    await seedReservation();
    expectCreated(await reservationService.createReservation(booking({ startTime: range.start, endTime: range.end })));
    expect(await ReservationModel.countDocuments()).toBe(2);
  });
}

for (const range of [
  { label: "earlier", end: "2026-10-19T09:59:59.999Z" },
  { label: "equal", end: startTime },
]) {
  test(`rejects an endTime ${range.label} than startTime`, async (): Promise<void> => {
    expect(await reservationService.createReservation(booking({ endTime: range.end })))
      .toEqual({ kind: "invalid", reason: "INVALID_TIME_RANGE" });
    expect(await ReservationModel.countDocuments()).toBe(0);
  });
}

for (const [label, value] of [
  ["non-date text", "not-a-date"],
  ["invalid month", "2026-13-19T10:00:00Z"],
  ["invalid ISO hour", "2026-10-19T25:00:00Z"],
] as const) {
  test(`rejects ${label} in startTime`, async (): Promise<void> => {
    expect(await reservationService.createReservation(booking({ startTime: value })))
      .toEqual({ kind: "invalid", reason: "INVALID_TIME_RANGE" });
    expect(await ReservationModel.countDocuments()).toBe(0);
  });
}

test("rejects an invalid endTime date string", async (): Promise<void> => {
  expect(await reservationService.createReservation(booking({ endTime: "2026-10-19T11:99:00Z" })))
    .toEqual({ kind: "invalid", reason: "INVALID_TIME_RANGE" });
  expect(await ReservationModel.countDocuments()).toBe(0);
});

test("the direct service currently normalizes a calendar-invalid ISO timestamp rejected by HTTP validation", async (): Promise<void> => {
  const result = expectCreated(await reservationService.createReservation(booking({
    startTime: "2026-02-30T10:00:00Z",
    endTime: "2026-03-02T11:00:00Z",
  })));
  expect(result.startTime).toBe("2026-03-02T10:00:00.000Z");
});

test("rejects a malformed resource ID before querying or saving", async (): Promise<void> => {
  expect(await reservationService.createReservation(booking({ resourceId: "not-an-object-id" })))
    .toEqual({ kind: "invalid", reason: "INVALID_RESOURCE_ID" });
  expect(await ReservationModel.countDocuments()).toBe(0);
});

test("currently saves a reservation for a nonexistent but valid resource ID", async (): Promise<void> => {
  const nonexistentId: string = new mongoose.Types.ObjectId().toString();
  expect(await ResourceModel.exists({ _id: nonexistentId })).toBeNull();
  const result = expectCreated(await reservationService.createReservation(booking({ resourceId: nonexistentId })));
  expect(result.resourceId).toBe(nonexistentId);
  expect(await ReservationModel.countDocuments()).toBe(1);
});

test("missing resourceId returns the service's invalid ID result", async (): Promise<void> => {
  const input: Partial<CreateReservationDTO> = booking();
  delete input.resourceId;
  expect(await reservationService.createReservation(input as CreateReservationDTO))
    .toEqual({ kind: "invalid", reason: "INVALID_RESOURCE_ID" });
  expect(await ReservationModel.countDocuments()).toBe(0);
});

for (const field of ["startTime", "endTime"] as const) {
  test(`missing ${field} returns the service's invalid time result`, async (): Promise<void> => {
    const input: Partial<CreateReservationDTO> = booking();
    delete input[field];
    expect(await reservationService.createReservation(input as CreateReservationDTO))
      .toEqual({ kind: "invalid", reason: "INVALID_TIME_RANGE" });
    expect(await ReservationModel.countDocuments()).toBe(0);
  });
}

test("missing userId rejects with a Mongoose validation error", async (): Promise<void> => {
  const input: Partial<CreateReservationDTO> = booking();
  delete input.userId;
  await expect(reservationService.createReservation(input as CreateReservationDTO))
    .rejects.toThrow(mongoose.Error.ValidationError);
  expect(await ReservationModel.countDocuments()).toBe(0);
});

test("blank userId rejects with a Mongoose validation error", async (): Promise<void> => {
  await expect(reservationService.createReservation(booking({ userId: "" })))
    .rejects.toThrow(mongoose.Error.ValidationError);
  expect(await ReservationModel.countDocuments()).toBe(0);
});

test("cancels a pending reservation and permits reuse of its original slot", async (): Promise<void> => {
  const existing = await seedReservation();
  const cancelled = await reservationService.cancelReservation(existing.id);
  expect(cancelled).toEqual({ kind: "cancelled", reservation: { ...existing, status: "CANCELLED" } });
  expect((await ReservationModel.findById(existing.id).exec())?.status).toBe("CANCELLED");
  expectCreated(await reservationService.createReservation(booking({ userId: "student-2" })));
  expect(await ReservationModel.countDocuments()).toBe(2);
});

test("cancels a confirmed reservation", async (): Promise<void> => {
  const existing = await seedReservation("CONFIRMED");
  expect(await reservationService.cancelReservation(existing.id))
    .toEqual({ kind: "cancelled", reservation: { ...existing, status: "CANCELLED" } });
});

test("cancelling an already cancelled reservation is idempotent", async (): Promise<void> => {
  const existing = await seedReservation("CANCELLED");
  expect(await reservationService.cancelReservation(existing.id))
    .toEqual({ kind: "cancelled", reservation: existing });
  expect(await reservationService.cancelReservation(existing.id))
    .toEqual({ kind: "cancelled", reservation: existing });
  expect(await ReservationModel.countDocuments()).toBe(1);
});

test("cancellation rejects malformed IDs and reports missing reservations", async (): Promise<void> => {
  expect(await reservationService.cancelReservation("invalid-id")).toEqual({ kind: "invalid" });
  expect(await reservationService.cancelReservation(new mongoose.Types.ObjectId().toString()))
    .toEqual({ kind: "notFound" });
});

test("lists exact-user reservations across all three statuses", async (): Promise<void> => {
  const pending = await seedReservation();
  await ReservationModel.create({ resourceId, userId: "student-1", startTime: "2026-10-19T12:00:00Z", endTime: "2026-10-19T13:00:00Z", status: "CONFIRMED" });
  await ReservationModel.create({ resourceId, userId: "student-1", startTime: "2026-10-19T14:00:00Z", endTime: "2026-10-19T15:00:00Z", status: "CANCELLED" });
  await ReservationModel.create({ resourceId, userId: "student-10", startTime: "2026-10-19T16:00:00Z", endTime: "2026-10-19T17:00:00Z", status: "PENDING" });

  const found = await reservationService.getReservationsForUser("student-1");
  expect(found).toHaveLength(3);
  expect(found.map((reservation: Reservation): string => reservation.status).sort())
    .toEqual(["CANCELLED", "CONFIRMED", "PENDING"]);
  expect(found.every((reservation: Reservation): boolean => reservation.userId === "student-1")).toBe(true);
  expect(found.some((reservation: Reservation): boolean => reservation.id === pending.id)).toBe(true);
  expect(await reservationService.getReservationsForUser("missing-user")).toEqual([]);
});

test("currently permits a booking when the resource is unavailable", async (): Promise<void> => {
  await ResourceModel.findByIdAndUpdate(resourceId, { isAvailable: false }).exec();
  expectCreated(await reservationService.createReservation(booking()));
  expect(await ReservationModel.countDocuments()).toBe(1);
});

async function observeConcurrentBookings(): Promise<ConcurrentBookingObservation> {
  let saveArrivals: number = 0;
  let releaseSaves: (() => void) | undefined;
  let rejectSaves: ((error: Error) => void) | undefined;
  const saveGate: Promise<void> = new Promise<void>((resolve, reject): void => {
    releaseSaves = resolve;
    rejectSaves = reject;
  });
  void saveGate.catch((): void => {});
  const realSave = ReservationModel.prototype.save as unknown as
    (this: ReservationRecord) => Promise<ReservationRecord>;
  const saveSpy = jest.spyOn(ReservationModel.prototype, "save");
  const barrierTimeout: NodeJS.Timeout = setTimeout((): void => {
    rejectSaves?.(new Error("Both reservation requests did not reach save() after their overlap checks."));
  }, 30000);

  try {
    saveSpy.mockImplementation((async function (this: ReservationRecord): Promise<ReservationRecord> {
      saveArrivals += 1;
      if (saveArrivals === 2) {
        releaseSaves?.();
      }
      await saveGate;
      return realSave.call(this);
    }) as typeof ReservationModel.prototype.save);

    const settled = await Promise.allSettled([
      reservationService.createReservation(booking({ userId: "student-1" })),
      reservationService.createReservation(booking({ userId: "student-2" })),
    ]);
    const results: CreateResult[] = settled.map((result): CreateResult => {
      if (result.status === "rejected") {
        throw result.reason;
      }
      return result.value;
    });
    expect(saveArrivals).toBe(2);
    const reservations: ReservationRecord[] = await ReservationModel.find({ resourceId }).exec();
    return {
      kinds: results.map((result: CreateResult): string => result.kind).sort(),
      persisted: reservations.length,
      reservations,
    };
  } finally {
    clearTimeout(barrierTimeout);
    releaseSaves?.();
    saveSpy.mockRestore();
  }
}

describe("documented concurrent-booking limitation", (): void => {
  let observation: ConcurrentBookingObservation;

  // Hook failures remain ordinary Jest failures, including database or barrier failures.
  beforeEach(async (): Promise<void> => {
    observation = await observeConcurrentBookings();
  });

  test("two requests can both succeed and persist overlapping reservations", (): void => {
    expect({ kinds: observation.kinds, persisted: observation.persisted })
      .toEqual({ kinds: ["created", "created"], persisted: 2 });
    expect(observation.reservations.map((record: ReservationRecord): string => record.userId).sort())
      .toEqual(["student-1", "student-2"]);
    for (const record of observation.reservations) {
      expect(record.resourceId.toString()).toBe(resourceId);
      expect(record.startTime.toISOString()).toBe(startTime);
      expect(record.endTime.toISOString()).toBe(endTime);
      expect(record.status).toBe("PENDING");
    }
  });

  test.failing("known limitation: simultaneous identical bookings should leave one reservation", (): void => {
    expect({ kinds: observation.kinds, persisted: observation.persisted })
      .toEqual({ kinds: ["conflict", "created"], persisted: 1 });
  });
});
