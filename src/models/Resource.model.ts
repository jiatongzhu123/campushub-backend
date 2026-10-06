import mongoose = require("mongoose");

export interface ResourceDocument {
  name: string;
  type: "ROOM" | "EQUIPMENT" | "LAB";
  location: string;
  isAvailable: boolean;
}

const resourceSchema: mongoose.Schema<ResourceDocument> =
  new mongoose.Schema<ResourceDocument>({
    name: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ["ROOM", "EQUIPMENT", "LAB"],
      required: true,
    },
    location: {
      type: String,
      required: true,
    },
    isAvailable: {
      type: Boolean,
      required: true,
    },
  });

const resourceModel: mongoose.Model<ResourceDocument> =
  mongoose.model<ResourceDocument>("Resource", resourceSchema);

export declare const ResourceModel: mongoose.Model<ResourceDocument>;
exports.ResourceModel = resourceModel;
