import express = require("express");
import healthRouter = require("./routes/health.routes");
import reservationRouter = require("./routes/reservation.routes");

const app: express.Express = express();

app.use(express.json());
app.use("/api/v1", healthRouter);
app.use("/api/v1", reservationRouter);

const port: number = Number(process.env.PORT ?? 3000);

app.listen(port, (): void => {
  console.log(`CampusHub API listening on port ${port}`);
});

export = app;
