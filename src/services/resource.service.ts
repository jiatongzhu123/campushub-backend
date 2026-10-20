import resourceModelModule = require("../models/Resource.model");
import type { Resource, ResourceFilters } from "../types/reservation";

const { ResourceModel } = resourceModelModule;

async function getResources(filters: ResourceFilters = {}): Promise<Resource[]> {
  const query: ResourceFilters = {};
  if (filters.type !== undefined) {
    query.type = filters.type;
  }
  if (filters.isAvailable !== undefined) {
    query.isAvailable = filters.isAvailable;
  }
  const resourceDocuments = await ResourceModel.find(query).exec();

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
