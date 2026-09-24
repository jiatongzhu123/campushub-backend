import express = require("express");
import healthRouter = require("./routes/health.routes");

const app: express.Express = express();

app.use("/api/v1", healthRouter);

const port: number = Number(process.env.PORT ?? 3000);

app.listen(port, (): void => {
  console.log(`CampusHub API listening on port ${port}`);
});

export = app;
