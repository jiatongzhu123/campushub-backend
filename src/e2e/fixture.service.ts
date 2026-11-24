import mongoose = require("mongoose");
import resourceModelModule = require("../models/Resource.model");
import reservationModelModule = require("../models/Reservation.model");
import type { ResourceDocument } from "../models/Resource.model";

const { ResourceModel } = resourceModelModule;
const { ReservationModel } = reservationModelModule;

const resources: ResourceDocument[] = [
  { name: "Study Room 302", type: "ROOM", location: "Library, Floor 3", isAvailable: true },
  { name: "Study Room 303", type: "ROOM", location: "Library, Floor 3", isAvailable: true },
  { name: "Study Room 304", type: "ROOM", location: "Library, Floor 3", isAvailable: true },
  { name: "3D Printer A", type: "EQUIPMENT", location: "Maker Lab", isAvailable: true },
  { name: "3D Printer B", type: "EQUIPMENT", location: "Maker Lab", isAvailable: true },
  { name: "3D Printer C", type: "EQUIPMENT", location: "Maker Lab", isAvailable: true },
];

async function seedResources(): Promise<void> {
  await ResourceModel.insertMany(resources);
}

async function clearReservations(): Promise<void> {
  if (
    mongoose.connection.readyState !== 1 ||
    mongoose.connection.name !== "campushub_e2e" ||
    mongoose.connection.host !== "127.0.0.1" ||
    ReservationModel.db !== mongoose.connection
  ) {
    throw new Error("Refusing to clear reservations outside the connected E2E memory database.");
  }
  await ReservationModel.deleteMany({}).exec();
}

export = { seedResources, clearReservations };
