import express = require("express");
import handleMalformedJson = require("./middleware/json-error.middleware");
import errorHandler = require("./middleware/errorHandler");
import healthRouter = require("./routes/health.routes");
import reservationRouter = require("./routes/reservation.routes");

function createApp(): express.Express {
  const app: express.Express = express();

  app.use(express.json());
  app.use(handleMalformedJson);
  app.use("/api/v1", healthRouter);
  app.use("/api/v1", reservationRouter);
  app.use(errorHandler);

  return app;
}

export = createApp;
