import assert = require("node:assert/strict");
import http = require("node:http");
import nodeTest = require("node:test");
import express = require("express");
import resourceModelModule = require("../models/Resource.model");
import reservationRouter = require("../routes/reservation.routes");
import type { Resource, ResourceFilters } from "../types/reservation";

const { ResourceModel } = resourceModelModule;
const { mock, test } = nodeTest;

test("GET /api/v1/resources validates and combines filters", async (context): Promise<void> => {
  const queries: ResourceFilters[] = [];
  let failLookup: boolean = false;
  const resourceDocuments = [
    new ResourceModel({
      _id: "000000000000000000000001",
      name: "Study Room",
      type: "ROOM",
      location: "Library",
      isAvailable: true,
    }),
    new ResourceModel({
      _id: "000000000000000000000002",
      name: "Laptop",
      type: "EQUIPMENT",
      location: "Desk",
      isAvailable: false,
    }),
    new ResourceModel({
      _id: "000000000000000000000003",
      name: "Chem Lab",
      type: "LAB",
      location: "Science Building",
      isAvailable: false,
    }),
  ];
  const findMock = mock.method(
    ResourceModel,
    "find",
    ((query: ResourceFilters = {}) => {
      queries.push(query);
      return {
        exec: async (): Promise<typeof resourceDocuments> => {
          if (failLookup) {
            throw new Error("Simulated database failure");
          }
          return resourceDocuments.filter(
            (resourceDocument): boolean =>
              (query.type === undefined || resourceDocument.type === query.type) &&
              (query.isAvailable === undefined ||
                resourceDocument.isAvailable === query.isAvailable),
          );
        },
      };
    }) as unknown as typeof ResourceModel.find,
  );
  context.after((): void => findMock.mock.restore());

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
  const baseUrl: string = `http://127.0.0.1:${address.port}/api/v1/resources`;

  async function expectSuccess(
    query: string,
    expectedFilter: ResourceFilters,
    expectedNames: string[],
  ): Promise<void> {
    const response: Response = await fetch(`${baseUrl}${query}`);
    assert.equal(response.status, 200);
    const resources: Resource[] = (await response.json()) as Resource[];
    assert.deepEqual(
      resources.map((resource: Resource): string => resource.name),
      expectedNames,
    );
    for (const resource of resources) {
      assert.deepEqual(Object.keys(resource).sort(), [
        "id",
        "isAvailable",
        "location",
        "name",
        "type",
      ]);
    }
    assert.deepEqual(queries.at(-1), expectedFilter);
  }

  async function expectInvalid(query: string): Promise<void> {
    const queryCount: number = queries.length;
    const response: Response = await fetch(`${baseUrl}${query}`);
    assert.equal(response.status, 400);
    assert.deepEqual(
      Object.keys((await response.json()) as Record<string, unknown>).sort(),
      ["code", "message"],
    );
    assert.equal(queries.length, queryCount);
  }

  await expectSuccess("", {}, ["Study Room", "Laptop", "Chem Lab"]);
  await expectSuccess("?type=ROOM", { type: "ROOM" }, ["Study Room"]);
  await expectSuccess("?type=EQUIPMENT", { type: "EQUIPMENT" }, ["Laptop"]);
  await expectSuccess("?type=LAB", { type: "LAB" }, ["Chem Lab"]);
  await expectSuccess("?isAvailable=true", { isAvailable: true }, ["Study Room"]);
  await expectSuccess("?isAvailable=false", { isAvailable: false }, ["Laptop", "Chem Lab"]);
  await expectSuccess(
    "?type=LAB&isAvailable=false",
    { type: "LAB", isAvailable: false },
    ["Chem Lab"],
  );

  await expectInvalid("?type=STUDY_ROOM");
  await expectInvalid("?type=");
  await expectInvalid("?type=ROOM&type=LAB");
  await expectInvalid("?isAvailable=1");
  await expectInvalid("?isAvailable=True");
  await expectInvalid("?isAvailable=");
  await expectInvalid("?isAvailable=true&isAvailable=false");
  await expectInvalid("?type=LAB&isAvailable=yes");

  failLookup = true;
  const failedResponse: Response = await fetch(baseUrl);
  assert.equal(failedResponse.status, 500);
  assert.deepEqual(await failedResponse.json(), {
    code: "INTERNAL_ERROR",
    message: "An unexpected server error occurred.",
  });
});
