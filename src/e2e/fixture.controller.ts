import type { Request, Response } from "express";
import fixtureService = require("./fixture.service");

async function clearReservations(_request: Request, response: Response): Promise<void> {
  await fixtureService.clearReservations();
  response.status(204).end();
}

export = { clearReservations };
