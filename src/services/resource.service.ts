import resourceModelModule = require("../models/Resource.model");
import type { Resource } from "../types/reservation";

const { ResourceModel } = resourceModelModule;

async function getResources(type?: string): Promise<Resource[]> {
  const resourceDocuments =
    type === undefined
      ? await ResourceModel.find().exec()
      : await ResourceModel.find().where("type").equals(type).exec();

  return resourceDocuments.map(
    (resourceDocument): Resource => ({
      id: resourceDocument._id.toString(),
      name: resourceDocument.name,
      type: resourceDocument.type,
      location: resourceDocument.location,
      isAvailable: resourceDocument.isAvailable,
    }),
  );
}

export = { getResources };
