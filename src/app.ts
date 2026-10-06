import express = require("express");
import databaseConfig = require("./config/database");
import healthRouter = require("./routes/health.routes");
import reservationRouter = require("./routes/reservation.routes");

const app: express.Express = express();

app.use(express.json());
app.use("/api/v1", healthRouter);
app.use("/api/v1", reservationRouter);

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
