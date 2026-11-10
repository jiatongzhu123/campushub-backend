import express = require("express");
import mongoose = require("mongoose");
import request = require("supertest");
import createApp = require("../../createApp");
import errorHandler = require("../../middleware/errorHandler");
import reservationService = require("../../services/reservation.service");
import resourceService = require("../../services/resource.service");
import reservationModelModule = require("../../models/Reservation.model");
import resourceModelModule = require("../../models/Resource.model");

const { ReservationModel } = reservationModelModule;
const { ResourceModel } = resourceModelModule;
const app: express.Express = createApp();
const reservationPath: string = "/api/v1/reservations";
const resourcePath: string = "/api/v1/resources";
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

function booking(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { resourceId, userId: "student-1", startTime, endTime, ...overrides };
}

function expectError(
  response: request.Response,
  status: number,
  code: string,
  message: string,
): void {
  expect(response.status).toBe(status);
  expect(response.headers["content-type"]).toMatch(/application\/json/);
  expect(response.body as unknown).toEqual({ code, message });
}

async function seedReservation(
  status: "PENDING" | "CONFIRMED" | "CANCELLED" = "PENDING",
): Promise<string> {
  const record = await ReservationModel.create({ resourceId, userId: "student-1", startTime, endTime, status });
  expect(record.status).toBe(status);
  return record._id.toString();
}

test("GET /api/v1/health returns the registered health response", async (): Promise<void> => {
  const response = await request(app).get("/api/v1/health");
  expect(response.status).toBe(200);
  expect(response.body as unknown).toEqual({ status: "ok" });
});

test("POST /reservations creates and persists a pending reservation", async (): Promise<void> => {
  const response = await request(app).post(reservationPath).send(booking());
  expect(response.status).toBe(201);
  expect(response.headers["content-type"]).toMatch(/application\/json/);
  expect(response.body as unknown).toEqual({
    id: expect.any(String), resourceId, userId: "student-1", startTime, endTime, status: "PENDING",
  });
  const id: string = (response.body as { id: string }).id;
  expect(mongoose.Types.ObjectId.isValid(id)).toBe(true);
  const persisted = await ReservationModel.findById(id).exec();
  expect(persisted?.resourceId.toString()).toBe(resourceId);
  expect(persisted?.userId).toBe("student-1");
  expect(persisted?.status).toBe("PENDING");
});

for (const scenario of [
  { name: "exact duplicate", startTime, endTime },
  { name: "partial overlap", startTime: "2026-10-19T10:30:00.000Z", endTime: "2026-10-19T11:30:00.000Z" },
  { name: "one-millisecond overlap", startTime: "2026-10-19T10:59:59.999Z", endTime: "2026-10-19T12:00:00.000Z" },
]) {
  test(`POST /reservations returns 409 for ${scenario.name}`, async (): Promise<void> => {
    await seedReservation();
    const response = await request(app).post(reservationPath).send(booking({
      userId: "student-2", startTime: scenario.startTime, endTime: scenario.endTime,
    }));
    expectError(response, 409, "DOUBLE_BOOKING", "Resource is already reserved for this time slot.");
    expect(await ReservationModel.countDocuments()).toBe(1);
  });
}

for (const scenario of [
  { name: "before", startTime: "2026-10-19T09:00:00.000Z", endTime: startTime },
  { name: "after", startTime: endTime, endTime: "2026-10-19T12:00:00.000Z" },
]) {
  test(`POST /reservations allows an exactly adjacent slot ${scenario.name}`, async (): Promise<void> => {
    await seedReservation();
    const response = await request(app).post(reservationPath).send(booking({
      userId: "student-2", startTime: scenario.startTime, endTime: scenario.endTime,
    }));
    expect(response.status).toBe(201);
    expect((response.body as { status: string }).status).toBe("PENDING");
    expect(await ReservationModel.countDocuments()).toBe(2);
  });
}

test("PATCH cancellation releases a slot for another POST", async (): Promise<void> => {
  const id: string = await seedReservation();
  const cancelled = await request(app).patch(`${reservationPath}/${id}/cancel`);
  expect(cancelled.status).toBe(200);
  expect(cancelled.body as unknown).toEqual({ id, resourceId, userId: "student-1", startTime, endTime, status: "CANCELLED" });
  expect((await ReservationModel.findById(id).exec())?.status).toBe("CANCELLED");

  const reused = await request(app).post(reservationPath).send(booking({ userId: "student-2" }));
  expect(reused.status).toBe(201);
  expect(await ReservationModel.countDocuments()).toBe(2);
});

test("POST accepts an unavailable resource under the current API behavior", async (): Promise<void> => {
  await ResourceModel.findByIdAndUpdate(resourceId, { isAvailable: false }).exec();
  const response = await request(app).post(reservationPath).send(booking());
  expect(response.status).toBe(201);
  expect(await ReservationModel.countDocuments()).toBe(1);
});

test("POST accepts a syntactically valid missing resource under the current API behavior", async (): Promise<void> => {
  const missingId: string = new mongoose.Types.ObjectId().toString();
  expect(await ResourceModel.exists({ _id: missingId })).toBeNull();
  const response = await request(app).post(reservationPath).send(booking({ resourceId: missingId }));
  expect(response.status).toBe(201);
  expect((response.body as { resourceId: string }).resourceId).toBe(missingId);
});

test("POST returns 400 for an invalid resource ID", async (): Promise<void> => {
  const response = await request(app).post(reservationPath).send(booking({ resourceId: "invalid-id" }));
  expectError(response, 400, "VALIDATION_ERROR", "resourceId must be a valid MongoDB ObjectId.");
  expect(await ReservationModel.countDocuments()).toBe(0);
});

for (const field of ["resourceId", "userId", "startTime", "endTime"] as const) {
  test(`POST returns 400 when ${field} is missing`, async (): Promise<void> => {
    const body = booking();
    delete body[field];
    const response = await request(app).post(reservationPath).send(body);
    expectError(response, 400, "VALIDATION_ERROR", "resourceId, userId, startTime, and endTime must be non-empty strings.");
    expect(await ReservationModel.countDocuments()).toBe(0);
  });
}

for (const scenario of [
  { name: "null body", body: null, message: "Malformed JSON request body." },
  { name: "array body", body: [], message: "Request body must be an object." },
  { name: "number resource ID", body: booking({ resourceId: 42 }), message: "resourceId, userId, startTime, and endTime must be non-empty strings." },
  { name: "blank user ID", body: booking({ userId: "   " }), message: "resourceId, userId, startTime, and endTime must be non-empty strings." },
]) {
  test(`POST returns 400 for ${scenario.name}`, async (): Promise<void> => {
    const response = await request(app).post(reservationPath).set("Content-Type", "application/json").send(JSON.stringify(scenario.body));
    expectError(response, 400, "VALIDATION_ERROR", scenario.message);
    expect(await ReservationModel.countDocuments()).toBe(0);
  });
}

for (const scenario of [
  { name: "equal times", endTime: startTime },
  { name: "end before start", endTime: "2026-10-19T09:59:59.999Z" },
]) {
  test(`POST returns 400 for ${scenario.name}`, async (): Promise<void> => {
    const response = await request(app).post(reservationPath).send(booking({ endTime: scenario.endTime }));
    expectError(response, 400, "VALIDATION_ERROR", "endTime must be later than startTime.");
    expect(await ReservationModel.countDocuments()).toBe(0);
  });
}

for (const scenario of [
  { name: "non-date text", startTime: "not-a-date" },
  { name: "missing timezone", startTime: "2026-10-19T10:00:00" },
  { name: "invalid calendar date", startTime: "2026-02-30T10:00:00Z" },
  { name: "invalid hour", startTime: "2026-10-19T25:00:00Z" },
  { name: "invalid month", startTime: "2026-13-19T10:00:00Z" },
]) {
  test(`POST returns 400 for ${scenario.name}`, async (): Promise<void> => {
    const response = await request(app).post(reservationPath).send(booking({ startTime: scenario.startTime }));
    expectError(response, 400, "VALIDATION_ERROR", "startTime and endTime must be valid date-time strings.");
    expect(await ReservationModel.countDocuments()).toBe(0);
  });
}

test("POST accepts a valid explicit timezone offset and serializes UTC", async (): Promise<void> => {
  const response = await request(app).post(reservationPath).send(booking({
    startTime: "2026-10-19T03:00:00-07:00", endTime: "2026-10-19T04:00:00-07:00",
  }));
  expect(response.status).toBe(201);
  expect((response.body as { startTime: string; endTime: string })).toMatchObject({ startTime, endTime });
});

test("GET /resources serializes the resource fixture", async (): Promise<void> => {
  const response = await request(app).get(resourcePath);
  expect(response.status).toBe(200);
  expect(response.body as unknown).toEqual([{ id: resourceId, name: "Study Room", type: "ROOM", location: "Library", isAvailable: true }]);
});

test("GET /resources returns an empty array for no matching type", async (): Promise<void> => {
  const response = await request(app).get(resourcePath).query({ type: "LAB" });
  expect(response.status).toBe(200);
  expect(response.body as unknown).toEqual([]);
});

for (const type of ["ROOM", "EQUIPMENT", "LAB"] as const) {
  test(`GET /resources filters type ${type}`, async (): Promise<void> => {
    await ResourceModel.create({ name: `${type} fixture`, type, location: "Other", isAvailable: false });
    const response = await request(app).get(resourcePath).query({ type });
    expect(response.status).toBe(200);
    const resources = response.body as Array<{ type: string; name: string }>;
    expect(resources.every((resource): boolean => resource.type === type)).toBe(true);
    expect(resources.map((resource): string => resource.name).sort())
      .toEqual(type === "ROOM" ? ["ROOM fixture", "Study Room"] : [`${type} fixture`]);
  });
}

test("GET /resources rejects an invalid type", async (): Promise<void> => {
  const response = await request(app).get(resourcePath).query({ type: "STUDY_ROOM" });
  expectError(response, 400, "VALIDATION_ERROR", "type must be ROOM, EQUIPMENT, or LAB.");
});

test("GET /resources filters availability and combines both filters", async (): Promise<void> => {
  await ResourceModel.create({ name: "Unavailable Room", type: "ROOM", location: "Other", isAvailable: false });
  const available = await request(app).get(resourcePath).query({ isAvailable: "true" });
  expect(available.status).toBe(200);
  expect((available.body as Array<{ name: string }>).map((resource): string => resource.name)).toEqual(["Study Room"]);
  const unavailable = await request(app).get(resourcePath).query({ type: "ROOM", isAvailable: "false" });
  expect(unavailable.status).toBe(200);
  expect((unavailable.body as Array<{ name: string }>).map((resource): string => resource.name)).toEqual(["Unavailable Room"]);
});

for (const availability of ["yes", "True", "", "1"] as const) {
  test(`GET /resources rejects isAvailable=${JSON.stringify(availability)}`, async (): Promise<void> => {
    const response = await request(app).get(resourcePath).query({ isAvailable: availability });
    expectError(response, 400, "VALIDATION_ERROR", 'isAvailable must be "true" or "false".');
  });
}

test("GET /reservations/user/:userId returns all statuses for the exact user", async (): Promise<void> => {
  await seedReservation();
  await ReservationModel.create({ resourceId, userId: "student-1", startTime: "2026-10-19T12:00:00Z", endTime: "2026-10-19T13:00:00Z", status: "CONFIRMED" });
  await ReservationModel.create({ resourceId, userId: "student-1", startTime: "2026-10-19T14:00:00Z", endTime: "2026-10-19T15:00:00Z", status: "CANCELLED" });
  await ReservationModel.create({ resourceId, userId: "student-10", startTime: "2026-10-19T16:00:00Z", endTime: "2026-10-19T17:00:00Z" });
  const response = await request(app).get(`${reservationPath}/user/student-1`);
  expect(response.status).toBe(200);
  const reservations = response.body as Array<{ id: string; userId: string; status: string; resourceId: string }>;
  expect(reservations).toHaveLength(3);
  expect(reservations.map((reservation): string => reservation.status).sort()).toEqual(["CANCELLED", "CONFIRMED", "PENDING"]);
  for (const reservation of reservations) {
    expect(reservation.userId).toBe("student-1");
    expect(reservation.resourceId).toBe(resourceId);
    expect(mongoose.Types.ObjectId.isValid(reservation.id)).toBe(true);
  }
});

test("GET /reservations/user/:userId returns an empty array for an unknown user", async (): Promise<void> => {
  const response = await request(app).get(`${reservationPath}/user/missing-user`);
  expect(response.status).toBe(200);
  expect(response.body as unknown).toEqual([]);
});

test("GET /reservations/user/:userId rejects whitespace", async (): Promise<void> => {
  const response = await request(app).get(`${reservationPath}/user/%20`);
  expectError(response, 400, "VALIDATION_ERROR", "userId must be a non-empty string.");
});

test("PATCH cancellation is idempotent", async (): Promise<void> => {
  const id: string = await seedReservation("CONFIRMED");
  const first = await request(app).patch(`${reservationPath}/${id}/cancel`);
  const second = await request(app).patch(`${reservationPath}/${id}/cancel`);
  expect(first.status).toBe(200);
  expect(second.status).toBe(200);
  expect(first.body as unknown).toEqual({ id, resourceId, userId: "student-1", startTime, endTime, status: "CANCELLED" });
  expect(second.body as unknown).toEqual(first.body as unknown);
  expect(await ReservationModel.countDocuments()).toBe(1);
});

test("PATCH cancellation rejects malformed IDs", async (): Promise<void> => {
  const response = await request(app).patch(`${reservationPath}/not-an-id/cancel`);
  expectError(response, 400, "VALIDATION_ERROR", "id must be a valid MongoDB ObjectId.");
});

test("PATCH cancellation rejects whitespace IDs", async (): Promise<void> => {
  const response = await request(app).patch(`${reservationPath}/%20/cancel`);
  expectError(response, 400, "VALIDATION_ERROR", "id must be a valid MongoDB ObjectId.");
});

test("PATCH cancellation reports an unknown valid ID", async (): Promise<void> => {
  const id: string = new mongoose.Types.ObjectId().toString();
  const response = await request(app).patch(`${reservationPath}/${id}/cancel`);
  expectError(response, 404, "NOT_FOUND", "Reservation not found.");
});

test("POST rejects malformed JSON with the documented error", async (): Promise<void> => {
  const response = await request(app).post(reservationPath).set("Content-Type", "application/json").send('{"resourceId":');
  expectError(response, 400, "VALIDATION_ERROR", "Malformed JSON request body.");
});

for (const failure of [
  { name: "reservation creation", spy: (): jest.SpyInstance => jest.spyOn(reservationService, "createReservation"), method: "post" },
  { name: "resource listing", spy: (): jest.SpyInstance => jest.spyOn(resourceService, "getResources"), method: "resources" },
  { name: "reservation listing", spy: (): jest.SpyInstance => jest.spyOn(reservationService, "getReservationsForUser"), method: "list" },
  { name: "reservation cancellation", spy: (): jest.SpyInstance => jest.spyOn(reservationService, "cancelReservation"), method: "cancel" },
]) {
  test(`central error handler sanitizes ${failure.name} failures`, async (): Promise<void> => {
    const spy = failure.spy().mockRejectedValue(new Error("PRIVATE database details"));
    try {
      let response: request.Response;
      if (failure.method === "post") {
        response = await request(app).post(reservationPath).send(booking());
      } else if (failure.method === "resources") {
        response = await request(app).get(resourcePath);
      } else if (failure.method === "list") {
        response = await request(app).get(`${reservationPath}/user/student-1`);
      } else {
        const id: string = await seedReservation();
        response = await request(app).patch(`${reservationPath}/${id}/cancel`);
      }
      expectError(response, 500, "INTERNAL_ERROR", "An unexpected server error occurred.");
      expect(JSON.stringify(response.body)).not.toMatch(/PRIVATE|stack/);
    } finally {
      spy.mockRestore();
    }
  });
}

test("error middleware delegates after response headers are sent", async (): Promise<void> => {
  const error: Error = new Error("headers already sent");
  const delegated: unknown[] = [];
  const probe: express.Express = express();
  probe.get("/started", (_request: express.Request, response: express.Response): void => {
    response.status(202).type("text/plain");
    response.write("started");
    throw error;
  });
  probe.use(errorHandler);
  probe.use((received: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction): void => {
    delegated.push(received);
    response.end(":delegated");
  });
  const response = await request(probe).get("/started");
  expect(response.status).toBe(202);
  expect(response.text).toBe("started:delegated");
  expect(delegated).toEqual([error]);
});
