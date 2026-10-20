import assert = require("node:assert/strict");
import http = require("node:http");
import nodeTest = require("node:test");
import express = require("express");
import mongoose = require("mongoose");
import handleMalformedJson = require("../middleware/json-error.middleware");
import reservationModelModule = require("../models/Reservation.model");
import reservationRouter = require("../routes/reservation.routes");
import type { Reservation } from "../types/reservation";

const { ReservationModel } = reservationModelModule;
const { mock, test } = nodeTest;

type ReservationRecord = InstanceType<typeof ReservationModel>;

interface ConflictFilter {
  resourceId: mongoose.Types.ObjectId;
  status: { $in: string[] };
  startTime: { $lt: number };
  endTime: { $gt: number };
}

interface HttpResult {
  status: number;
  body: Record<string, unknown>;
}

test("POST /api/v1/reservations checks active overlaps and validates input", async (context): Promise<void> => {
  const resourceA: string = "000000000000000000000001";
  const resourceB: string = "000000000000000000000002";
  const day: string = "2026-10-19";
  const at = (time: string): string => `${day}T${time}:00Z`;
  const records: ReservationRecord[] = [
    new ReservationModel({
      resourceId: resourceA,
      userId: "confirmed-user",
      startTime: at("13:00"),
      endTime: at("14:00"),
      status: "CONFIRMED",
    }),
    new ReservationModel({
      resourceId: resourceA,
      userId: "cancelled-user",
      startTime: at("15:00"),
      endTime: at("16:00"),
      status: "CANCELLED",
    }),
  ];
  const queries: ConflictFilter[] = [];
  let failLookup: boolean = false;

  const execMock = mock.method(
    mongoose.Query.prototype,
    "exec",
    (async function (this: mongoose.Query<unknown, unknown>): Promise<ReservationRecord | null> {
      if (failLookup) {
        throw new Error("Simulated database failure");
      }
      const filter: ConflictFilter = this.getFilter() as unknown as ConflictFilter;
      queries.push(filter);
      assert.ok(filter.resourceId instanceof mongoose.Types.ObjectId);
      assert.deepEqual(filter.status, { $in: ["PENDING", "CONFIRMED"] });
      assert.equal(typeof filter.startTime.$lt, "number");
      assert.equal(typeof filter.endTime.$gt, "number");
      return (
        records.find(
          (record: ReservationRecord): boolean =>
            record.resourceId.equals(filter.resourceId) &&
            filter.status.$in.includes(record.status) &&
            record.startTime.getTime() < filter.startTime.$lt &&
            record.endTime.getTime() > filter.endTime.$gt,
        ) ?? null
      );
    }) as unknown as typeof mongoose.Query.prototype.exec,
  );
  const saveMock = mock.method(
    ReservationModel.prototype,
    "save",
    (async function (this: ReservationRecord): Promise<ReservationRecord> {
      records.push(this);
      return this;
    }) as unknown as typeof ReservationModel.prototype.save,
  );
  context.after((): void => {
    execMock.mock.restore();
    saveMock.mock.restore();
  });

  const app: express.Express = express();
  app.use(express.json());
  app.use(handleMalformedJson);
  app.use("/api/v1", reservationRouter);
  const server: http.Server = await new Promise<http.Server>((resolve, reject): void => {
    const listeningServer: http.Server = app.listen(0, "127.0.0.1", (): void => {
      resolve(listeningServer);
    });
    listeningServer.on("error", reject);
  });
  context.after(
    async (): Promise<void> =>
      new Promise<void>((resolve, reject): void => {
        server.close((error?: Error): void => {
          if (error === undefined) {
            resolve();
          } else {
            reject(error);
          }
        });
      }),
  );
  const address = server.address();
  assert.ok(address !== null && typeof address !== "string");
  const url: string = `http://127.0.0.1:${address.port}/api/v1/reservations`;

  function booking(resourceId: string, startTime: string, endTime: string): Record<string, unknown> {
    return { resourceId, userId: "student-1", startTime, endTime };
  }

  async function post(body: Record<string, unknown>): Promise<HttpResult> {
    const response: Response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return {
      status: response.status,
      body: (await response.json()) as Record<string, unknown>,
    };
  }

  async function expectError(body: Record<string, unknown>, status: number, code: string): Promise<void> {
    const result: HttpResult = await post(body);
    assert.equal(result.status, status);
    assert.equal(result.body.code, code);
    assert.equal(typeof result.body.message, "string");
  }

  const created: HttpResult = await post(booking(resourceA, at("10:00"), at("11:00")));
  assert.equal(created.status, 201);
  assert.deepEqual(Object.keys(created.body).sort(), [
    "endTime",
    "id",
    "resourceId",
    "startTime",
    "status",
    "userId",
  ]);
  assert.equal(created.body.resourceId, resourceA);
  assert.equal(created.body.userId, "student-1");
  assert.equal(created.body.startTime, new Date(at("10:00")).toISOString());
  assert.equal(created.body.endTime, new Date(at("11:00")).toISOString());
  assert.equal(created.body.status, "PENDING");
  assert.equal(typeof created.body.id, "string");
  assert.deepEqual(queries[0], {
    resourceId: new mongoose.Types.ObjectId(resourceA),
    status: { $in: ["PENDING", "CONFIRMED"] },
    startTime: { $lt: new Date(at("11:00")).getTime() },
    endTime: { $gt: new Date(at("10:00")).getTime() },
  });

  await expectError(booking(resourceA, at("10:30"), at("11:30")), 409, "DOUBLE_BOOKING");
  await expectError(booking(resourceA, at("13:30"), at("14:30")), 409, "DOUBLE_BOOKING");
  assert.equal((await post(booking(resourceA, at("11:00"), at("12:00")))).status, 201);
  assert.equal((await post(booking(resourceA, at("09:00"), at("10:00")))).status, 201);
  assert.equal((await post(booking(resourceA, at("15:30"), at("16:30")))).status, 201);
  assert.equal((await post(booking(resourceB, at("10:00"), at("11:00")))).status, 201);

  const queryCount: number = queries.length;
  const recordCount: number = records.length;
  await expectError(booking("invalid-id", at("17:00"), at("18:00")), 400, "VALIDATION_ERROR");
  await expectError(booking("123456789012", at("17:00"), at("18:00")), 400, "VALIDATION_ERROR");
  await expectError(
    { ...booking(resourceA, at("17:00"), at("18:00")), userId: "   " },
    400,
    "VALIDATION_ERROR",
  );
  await expectError(booking(resourceA, "not-a-date", at("18:00")), 400, "VALIDATION_ERROR");
  await expectError(booking(resourceA, "2026-02-30T17:00:00Z", at("18:00")), 400, "VALIDATION_ERROR");
  await expectError(booking(resourceA, "2026-10-19T17:00:00", at("18:00")), 400, "VALIDATION_ERROR");
  await expectError(booking(resourceA, at("18:00"), at("17:00")), 400, "VALIDATION_ERROR");
  await expectError(booking(resourceA, at("18:00"), at("18:00")), 400, "VALIDATION_ERROR");
  await expectError({ userId: "student-1", startTime: at("17:00"), endTime: at("18:00") }, 400, "VALIDATION_ERROR");
  await expectError({ resourceId: resourceA, userId: "student-1", startTime: at("17:00") }, 400, "VALIDATION_ERROR");
  const malformedResponse: Response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: '{"resourceId":',
  });
  assert.equal(malformedResponse.status, 400);
  assert.match(malformedResponse.headers.get("content-type") ?? "", /application\/json/);
  assert.deepEqual(await malformedResponse.json(), {
    code: "VALIDATION_ERROR",
    message: "Malformed JSON request body.",
  });
  assert.equal(queries.length, queryCount);
  assert.equal(records.length, recordCount);

  failLookup = true;
  await expectError(booking(resourceA, at("20:00"), at("21:00")), 500, "INTERNAL_ERROR");
  assert.equal(records.length, recordCount);
});

test("GET /api/v1/reservations/user/:userId returns every status for the exact user", async (context): Promise<void> => {
  const resourceId: string = "000000000000000000000001";
  const records: ReservationRecord[] = [
    new ReservationModel({
      resourceId,
      userId: "student-1",
      startTime: "2026-10-19T09:00:00Z",
      endTime: "2026-10-19T10:00:00Z",
      status: "PENDING",
    }),
    new ReservationModel({
      resourceId,
      userId: "student-1",
      startTime: "2026-10-19T11:00:00Z",
      endTime: "2026-10-19T12:00:00Z",
      status: "CONFIRMED",
    }),
    new ReservationModel({
      resourceId,
      userId: "student-1",
      startTime: "2026-10-19T13:00:00Z",
      endTime: "2026-10-19T14:00:00Z",
      status: "CANCELLED",
    }),
    new ReservationModel({
      resourceId,
      userId: "student-10",
      startTime: "2026-10-19T15:00:00Z",
      endTime: "2026-10-19T16:00:00Z",
      status: "PENDING",
    }),
  ];
  const queriedUsers: string[] = [];
  let failLookup: boolean = false;
  const execMock = mock.method(
    mongoose.Query.prototype,
    "exec",
    (async function (this: mongoose.Query<unknown, unknown>): Promise<ReservationRecord[]> {
      if (failLookup) {
        throw new Error("Simulated database failure");
      }
      const filter: Record<string, unknown> = this.getFilter();
      assert.deepEqual(Object.keys(filter), ["userId"]);
      const userId: unknown = filter.userId;
      assert.ok(typeof userId === "string");
      queriedUsers.push(userId);
      return records.filter(
        (record: ReservationRecord): boolean => record.userId === userId,
      );
    }) as unknown as typeof mongoose.Query.prototype.exec,
  );
  context.after((): void => execMock.mock.restore());

  const app: express.Express = express();
  app.use("/api/v1", reservationRouter);
  const server: http.Server = await new Promise<http.Server>((resolve, reject): void => {
    const listeningServer: http.Server = app.listen(0, "127.0.0.1", (): void => {
      resolve(listeningServer);
    });
    listeningServer.on("error", reject);
  });
  context.after(
    async (): Promise<void> =>
      new Promise<void>((resolve, reject): void => {
        server.close((error?: Error): void => {
          if (error === undefined) {
            resolve();
          } else {
            reject(error);
          }
        });
      }),
  );
  const address = server.address();
  assert.ok(address !== null && typeof address !== "string");
  const baseUrl: string = `http://127.0.0.1:${address.port}/api/v1/reservations/user`;

  async function get(userId: string): Promise<{ status: number; body: unknown }> {
    const response: Response = await fetch(`${baseUrl}/${encodeURIComponent(userId)}`);
    return { status: response.status, body: await response.json() };
  }

  const allStatuses = await get("student-1");
  assert.equal(allStatuses.status, 200);
  assert.ok(Array.isArray(allStatuses.body));
  const reservations: Reservation[] = allStatuses.body as Reservation[];
  assert.equal(reservations.length, 3);
  assert.deepEqual(
    reservations.map((reservation: Reservation): string | undefined => reservation.status).sort(),
    ["CANCELLED", "CONFIRMED", "PENDING"],
  );
  for (const reservation of reservations) {
    assert.equal(reservation.userId, "student-1");
    assert.deepEqual(Object.keys(reservation).sort(), [
      "endTime",
      "id",
      "resourceId",
      "startTime",
      "status",
      "userId",
    ]);
  }

  const otherUser = await get("student-10");
  assert.equal(otherUser.status, 200);
  assert.ok(Array.isArray(otherUser.body));
  assert.equal(otherUser.body.length, 1);
  assert.equal((otherUser.body[0] as Reservation).userId, "student-10");

  const empty = await get("missing-user");
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body, []);
  assert.deepEqual(queriedUsers, ["student-1", "student-10", "missing-user"]);

  const invalid = await get(" ");
  assert.equal(invalid.status, 400);
  assert.equal((invalid.body as Record<string, unknown>).code, "VALIDATION_ERROR");
  assert.equal(queriedUsers.length, 3);

  failLookup = true;
  const failed = await get("student-1");
  assert.equal(failed.status, 500);
  assert.equal((failed.body as Record<string, unknown>).code, "INTERNAL_ERROR");
});
