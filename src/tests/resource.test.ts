import assert = require("node:assert/strict");
import http = require("node:http");
import nodeTest = require("node:test");
import express = require("express");
import errorHandler = require("../middleware/errorHandler");
import resourceModelModule = require("../models/Resource.model");
import reservationRouter = require("../routes/reservation.routes");
import type { Resource, ResourceFilters } from "../types/reservation";

const { ResourceModel } = resourceModelModule;
const { mock, test } = nodeTest;

test("GET /api/v1/resources validates and combines filters", async (context: nodeTest.TestContext): Promise<void> => {
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
  app.use(errorHandler);
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

  async function expectInvalid(query: string, message: string): Promise<void> {
    const queryCount: number = queries.length;
    const response: Response = await fetch(`${baseUrl}${query}`);
    assert.equal(response.status, 400);
    assert.match(response.headers.get("content-type") ?? "", /application\/json/);
    const body: unknown = await response.json();
    assert.deepEqual(
      Object.keys(body as Record<string, unknown>).sort(),
      ["code", "message"],
    );
    assert.deepEqual(body, { code: "VALIDATION_ERROR", message });
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

  const typeMessage: string = "type must be ROOM, EQUIPMENT, or LAB.";
  const availabilityMessage: string = 'isAvailable must be "true" or "false".';
  await expectInvalid("?type=STUDY_ROOM", typeMessage);
  await expectInvalid("?type=", typeMessage);
  await expectInvalid("?type=ROOM&type=LAB", typeMessage);
  await expectInvalid("?isAvailable=1", availabilityMessage);
  await expectInvalid("?isAvailable=True", availabilityMessage);
  await expectInvalid("?isAvailable=", availabilityMessage);
  await expectInvalid("?isAvailable=true&isAvailable=false", availabilityMessage);
  await expectInvalid("?type=LAB&isAvailable=yes", availabilityMessage);
  await expectInvalid("?type=INVALID&isAvailable=yes", typeMessage);

  failLookup = true;
  const failedResponse: Response = await fetch(baseUrl);
  assert.equal(failedResponse.status, 500);
  assert.deepEqual(await failedResponse.json(), {
    code: "INTERNAL_ERROR",
    message: "An unexpected server error occurred.",
  });
});

test("centralized error handling sanitizes failures and delegates after headers are sent", async (context: nodeTest.TestContext): Promise<void> => {
  interface FailureCase {
    label: string;
    value: unknown;
  }

  const failures: FailureCase[] = [
    { label: "Error", value: new Error("PRIVATE database connection details") },
    { label: "string", value: "PRIVATE database password" },
    {
      label: "HTTP-like object",
      value: { statusCode: 400, code: "PRIVATE_CODE", message: "PRIVATE details", stack: "PRIVATE stack" },
    },
    { label: "array", value: ["PRIVATE details"] },
    { label: "null", value: null },
    { label: "undefined", value: undefined },
    { label: "false", value: false },
    { label: "zero", value: 0 },
    { label: "true", value: true },
    { label: "number", value: 42 },
    { label: "bigint", value: 42n },
    { label: "symbol", value: Symbol("PRIVATE details") },
  ];
  const startedError: Error = new Error("PRIVATE error after headers were sent");
  const delegatedErrors: unknown[] = [];
  const app: express.Express = express();
  app.get("/rejected/:index", async (request: express.Request, _response: express.Response): Promise<void> => {
    const failure: FailureCase | undefined = failures[Number(request.params.index)];
    assert.ok(failure !== undefined);
    return Promise.reject(failure.value);
  });
  app.get("/thrown", (_request: express.Request, _response: express.Response): void => {
    throw { code: "PRIVATE_CODE", message: "PRIVATE synchronous failure" };
  });
  app.get("/started", (_request: express.Request, response: express.Response): void => {
    response.status(202).type("text/plain");
    response.write("started");
    throw startedError;
  });
  app.use(errorHandler);
  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction): void => {
    delegatedErrors.push(error);
    response.end(":delegated");
  });

  const server: http.Server = await new Promise<http.Server>((
    resolve: (server: http.Server) => void,
    reject: (reason: unknown) => void,
  ): void => {
    const listeningServer: http.Server = app.listen(0, "127.0.0.1", (): void => {
      resolve(listeningServer);
    });
    listeningServer.on("error", reject);
  });
  context.after(async (): Promise<void> => new Promise<void>((
    resolve: () => void,
    reject: (reason: unknown) => void,
  ): void => {
    server.close((error?: Error): void => {
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    });
  }));
  const address = server.address();
  assert.ok(address !== null && typeof address !== "string");
  const baseUrl: string = `http://127.0.0.1:${address.port}`;

  async function expectInternalError(path: string): Promise<void> {
    const response: Response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 500);
    assert.match(response.headers.get("content-type") ?? "", /application\/json/);
    const text: string = await response.text();
    const body: unknown = JSON.parse(text);
    assert.deepEqual(body, {
      code: "INTERNAL_ERROR",
      message: "An unexpected server error occurred.",
    });
    assert.doesNotMatch(text, /PRIVATE|stack/i);
  }

  for (const [index, failure] of failures.entries()) {
    await context.test(`rejected ${failure.label} produces a sanitized JSON 500`, async (): Promise<void> => {
      await expectInternalError(`/rejected/${index}`);
    });
  }
  await context.test("synchronous thrown object produces a sanitized JSON 500", async (): Promise<void> => {
    await expectInternalError("/thrown");
  });
  assert.deepEqual(delegatedErrors, []);

  await context.test("sent headers delegate the original error without rewriting the response", async (): Promise<void> => {
    const response: Response = await fetch(`${baseUrl}/started`);
    assert.equal(response.status, 202);
    assert.match(response.headers.get("content-type") ?? "", /text\/plain/);
    assert.equal(await response.text(), "started:delegated");
    assert.equal(delegatedErrors.length, 1);
    assert.equal(delegatedErrors[0], startedError);
  });
});
