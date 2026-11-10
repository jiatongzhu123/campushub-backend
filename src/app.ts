import express = require("express");
import databaseConfig = require("./config/database");
import createApp = require("./createApp");

const app: express.Express = createApp();

async function startServer(): Promise<void> {
  await databaseConfig.connectDatabase();

  app.listen(databaseConfig.serverPort, (): void => {
    console.log(`CampusHub API listening on port ${databaseConfig.serverPort}`);
  });
}

void startServer().catch((error: unknown): void => {
  const message: string =
    error instanceof Error ? error.message : "Unknown database startup error.";
  console.error(`Failed to start CampusHub API: ${message}`);
  process.exitCode = 1;
});

export = app;
