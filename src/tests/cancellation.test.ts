import assert = require("node:assert/strict");
import http = require("node:http");
import nodeTest = require("node:test");
import express = require("express");
import mongoose = require("mongoose");
import reservationModelModule = require("../models/Reservation.model");
import reservationRouter = require("../routes/reservation.routes");

const { ReservationModel } = reservationModelModule;
const { mock, test } = nodeTest;

type ReservationRecord = InstanceType<typeof ReservationModel>;

interface CancelFilter {
  _id: mongoose.Types.ObjectId;
  status: { $in: string[] };
}

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

test("PATCH /api/v1/reservations/:id/cancel is idempotent and releases the slot", async (context): Promise<void> => {
  const resourceId: string = "00000000000000000000000a";
  const pendingId: string = "000000000000000000000001";
  const confirmedId: string = "000000000000000000000002";
  const cancelledId: string = "000000000000000000000003";
  const unknownId: string = "000000000000000000000004";
  const startTime: string = "2026-10-19T10:00:00Z";
  const endTime: string = "2026-10-19T11:00:00Z";
  const records: ReservationRecord[] = [
    new ReservationModel({
      _id: pendingId,
      resourceId,
      userId: "pending-user",
      startTime,
      endTime,
      status: "PENDING",
    }),
    new ReservationModel({
      _id: confirmedId,
      resourceId,
      userId: "confirmed-user",
      startTime: "2026-10-19T13:00:00Z",
      endTime: "2026-10-19T14:00:00Z",
      status: "CONFIRMED",
    }),
    new ReservationModel({
      _id: cancelledId,
      resourceId,
      userId: "cancelled-user",
      startTime: "2026-10-19T16:00:00Z",
      endTime: "2026-10-19T17:00:00Z",
      status: "CANCELLED",
    }),
  ];
  let updateCalls: number = 0;
  let readCalls: number = 0;
  let failUpdate: boolean = false;
  let failRead: boolean = false;

  const updateMock = mock.method(
    ReservationModel,
    "findOneAndUpdate",
    ((filter: CancelFilter, update: Record<string, unknown>, options: Record<string, unknown>) => {
      updateCalls++;
      assert.deepEqual(filter.status, { $in: ["PENDING", "CONFIRMED"] });
      assert.deepEqual(update, { $set: { status: "CANCELLED" } });
      assert.deepEqual(options, { new: true, runValidators: true });
      return {
        exec: async (): Promise<ReservationRecord | null> => {
          if (failUpdate) {
            throw new Error("Simulated update failure");
          }
          const record: ReservationRecord | undefined = records.find(
            (candidate: ReservationRecord): boolean =>
              candidate._id.equals(filter._id) &&
              filter.status.$in.includes(candidate.status),
          );
          if (record === undefined) {
            return null;
          }
          record.status = "CANCELLED";
          return record;
        },
      };
    }) as unknown as typeof ReservationModel.findOneAndUpdate,
  );
  const readMock = mock.method(
    ReservationModel,
    "findById",
    ((id: mongoose.Types.ObjectId) => ({
      exec: async (): Promise<ReservationRecord | null> => {
        readCalls++;
        if (failRead) {
          throw new Error("Simulated read failure");
        }
        return records.find((record: ReservationRecord): boolean => record._id.equals(id)) ?? null;
      },
    })) as unknown as typeof ReservationModel.findById,
  );
  const conflictMock = mock.method(
    mongoose.Query.prototype,
    "exec",
    (async function (this: mongoose.Query<unknown, unknown>): Promise<ReservationRecord | null> {
      const filter: ConflictFilter = this.getFilter() as unknown as ConflictFilter;
      assert.deepEqual(filter.status, { $in: ["PENDING", "CONFIRMED"] });
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
    updateMock.mock.restore();
    readMock.mock.restore();
    conflictMock.mock.restore();
    saveMock.mock.restore();
  });

  const app: express.Express = express();
  app.use(express.json());
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
  const baseUrl: string = `http://127.0.0.1:${address.port}/api/v1/reservations`;

  async function patch(id: string): Promise<HttpResult> {
    const response: Response = await fetch(`${baseUrl}/${encodeURIComponent(id)}/cancel`, {
      method: "PATCH",
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  }

  async function post(start: string, end: string): Promise<HttpResult> {
    const response: Response = await fetch(baseUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resourceId, userId: "new-user", startTime: start, endTime: end }),
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  }

  assert.equal((await post(startTime, endTime)).status, 409);
  const pending = await patch(pendingId);
  assert.equal(pending.status, 200);
  assert.deepEqual(pending.body, {
    id: pendingId,
    resourceId,
    userId: "pending-user",
    startTime: new Date(startTime).toISOString(),
    endTime: new Date(endTime).toISOString(),
    status: "CANCELLED",
  });
  assert.equal(records[0]?.status, "CANCELLED");
  assert.equal(updateCalls, 1);
  assert.equal(readCalls, 0);

  const repeated = await patch(pendingId);
  assert.equal(repeated.status, 200);
  assert.deepEqual(repeated.body, pending.body);
  assert.equal(updateCalls, 2);
  assert.equal(readCalls, 1);

  const reused = await post(startTime, endTime);
  assert.equal(reused.status, 201);
  assert.equal(reused.body.status, "PENDING");
  assert.equal(records.length, 4);

  const confirmed = await patch(confirmedId);
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.status, "CANCELLED");
  assert.equal(confirmed.body.userId, "confirmed-user");
  assert.equal(confirmed.body.startTime, new Date("2026-10-19T13:00:00Z").toISOString());
  assert.equal(confirmed.body.endTime, new Date("2026-10-19T14:00:00Z").toISOString());
  assert.equal(records[1]?.status, "CANCELLED");

  const alreadyCancelled = await patch(cancelledId);
  assert.equal(alreadyCancelled.status, 200);
  assert.equal(alreadyCancelled.body.status, "CANCELLED");
  assert.equal(alreadyCancelled.body.userId, "cancelled-user");

  const callsBeforeInvalid: number = updateCalls;
  const invalid = await patch("not-an-object-id");
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.code, "VALIDATION_ERROR");
  assert.equal(updateCalls, callsBeforeInvalid);

  const unknown = await patch(unknownId);
  assert.equal(unknown.status, 404);
  assert.equal(unknown.body.code, "NOT_FOUND");

  failUpdate = true;
  const updateFailure = await patch(pendingId);
  assert.equal(updateFailure.status, 500);
  assert.equal(updateFailure.body.code, "INTERNAL_ERROR");
  failUpdate = false;

  failRead = true;
  const readFailure = await patch(cancelledId);
  assert.equal(readFailure.status, 500);
  assert.equal(readFailure.body.code, "INTERNAL_ERROR");
});
