import express = require("express");
import fs = require("node:fs/promises");
import http = require("node:http");
import path = require("node:path");
import mongoose = require("mongoose");
import mongodbMemoryServer = require("mongodb-memory-server");
import createApp = require("../createApp");
import errorHandler = require("../middleware/errorHandler");
import fixtureController = require("./fixture.controller");
import fixtureService = require("./fixture.service");

const { MongoMemoryServer } = mongodbMemoryServer;
const port: number = 3000;
let mongoServer: InstanceType<typeof MongoMemoryServer> | undefined;
let apiServer: http.Server | undefined;
let stopping: boolean = false;

async function closeResources(): Promise<void> {
  try {
    if (apiServer?.listening) {
      await new Promise<void>((resolve, reject): void => {
        apiServer?.close((error?: Error): void => {
          if (error === undefined) {
            resolve();
          } else {
            reject(error);
          }
        });
      });
    }
  } finally {
    try {
      await mongoose.disconnect();
    } finally {
      await mongoServer?.stop();
    }
  }
}

async function stop(): Promise<void> {
  if (stopping) {
    return;
  }
  stopping = true;
  try {
    await startup.catch((): void => {});
    await closeResources();
  } catch (error: unknown) {
    console.error("Failed to stop the E2E API cleanly:", error);
    process.exitCode = 1;
  }
}

function listen(app: express.Express): Promise<http.Server> {
  return new Promise<http.Server>((resolve, reject): void => {
    const server: http.Server = app.listen(port, "127.0.0.1");
    server.once("error", reject);
    server.once("listening", (): void => {
      server.off("error", reject);
      resolve(server);
    });
  });
}

async function start(): Promise<void> {
  // Never use a developer or CI MongoDB URI for browser tests.
  delete process.env.MONGODB_URI;
  const runId: string | undefined = process.env.CAMPUSHUB_E2E_RUN_ID;
  if (runId === undefined || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(runId)) {
    throw new Error("A Playwright E2E run ID is required.");
  }

  const outputDir: string = path.resolve(__dirname, "../../test-results");
  const dbPath: string = path.join(outputDir, `mongo-${runId}`);
  const markerPath: string = path.join(outputDir, `mongo-${runId}.owner.json`);
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(dbPath);
  try {
    await fs.writeFile(markerPath, JSON.stringify({ runId, dbPath }), { flag: "wx" });
  } catch (error: unknown) {
    try {
      await fs.rmdir(dbPath);
    } catch (cleanupError: unknown) {
      throw new AggregateError([error, cleanupError], "Failed to create and clean up the E2E MongoDB ownership marker.", { cause: cleanupError });
    }
    throw error;
  }

  mongoServer = await MongoMemoryServer.create({ instance: { dbPath } });
  const mongoUri: string = mongoServer.getUri("campushub_e2e");
  await mongoose.connect(mongoUri);
  await fixtureService.seedResources();
  const app: express.Express = createApp();
  app.delete("/__e2e/reservations", fixtureController.clearReservations);
  app.use(errorHandler);
  apiServer = await listen(app);
  console.log(`CampusHub E2E API listening on http://127.0.0.1:${port}`);
}

const startup: Promise<void> = start();
process.once("SIGINT", (): void => { void stop(); });
process.once("SIGTERM", (): void => { void stop(); });
void startup.catch((error: unknown): void => {
  console.error("Failed to start the E2E API:", error);
  process.exitCode = 1;
  void stop();
});
