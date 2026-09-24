import type { Request, Response } from "express";

function getHealth(_request: Request, response: Response): void {
  response.status(200).json({ status: "ok" });
}

export = { getHealth };
