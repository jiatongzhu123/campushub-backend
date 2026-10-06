import mongoose = require("mongoose");

export interface ReservationDocument {
  resourceId: mongoose.Types.ObjectId;
  userId: string;
  startTime: Date;
  endTime: Date;
  status: "PENDING" | "CONFIRMED" | "CANCELLED";
}

const reservationSchema: mongoose.Schema<ReservationDocument> =
  new mongoose.Schema<ReservationDocument>({
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Resource",
      required: true,
    },
    userId: {
      type: String,
      required: true,
    },
    startTime: {
      type: Date,
      required: true,
    },
    endTime: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "CONFIRMED", "CANCELLED"],
      default: "PENDING",
      required: true,
    },
  });

const reservationModel: mongoose.Model<ReservationDocument> =
  mongoose.model<ReservationDocument>("Reservation", reservationSchema);

export declare const ReservationModel: mongoose.Model<ReservationDocument>;
exports.ReservationModel = reservationModel;
