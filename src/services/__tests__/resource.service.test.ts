import resourceService = require("../resource.service");
import resourceModelModule = require("../../models/Resource.model");
import type { Resource } from "../../types/reservation";

const { ResourceModel } = resourceModelModule;

beforeEach(async (): Promise<void> => {
  await ResourceModel.create([
    { name: "Study Room", type: "ROOM", location: "Library", isAvailable: true },
    { name: "Laptop", type: "EQUIPMENT", location: "Desk", isAvailable: false },
    { name: "Chem Lab", type: "LAB", location: "Science Building", isAvailable: false },
  ]);
});

test("getResources returns model fixtures with public fields", async (): Promise<void> => {
  const resources: Resource[] = await resourceService.getResources();
  expect(resources.map((resource: Resource): string => resource.name).sort())
    .toEqual(["Chem Lab", "Laptop", "Study Room"]);
  for (const resource of resources) {
    expect(resource).toEqual({
      id: expect.any(String),
      name: expect.any(String),
      type: expect.stringMatching(/^(ROOM|EQUIPMENT|LAB)$/),
      location: expect.any(String),
      isAvailable: expect.any(Boolean),
    });
  }
});

test("getResources filters by resource type", async (): Promise<void> => {
  const resources: Resource[] = await resourceService.getResources({ type: "EQUIPMENT" });
  expect(resources.map((resource: Resource): string => resource.name)).toEqual(["Laptop"]);
});

test("getResources filters available and unavailable resources", async (): Promise<void> => {
  expect((await resourceService.getResources({ isAvailable: true })).map((resource: Resource): string => resource.name))
    .toEqual(["Study Room"]);
  expect((await resourceService.getResources({ isAvailable: false })).map((resource: Resource): string => resource.name).sort())
    .toEqual(["Chem Lab", "Laptop"]);
});

test("getResources combines type and availability filters", async (): Promise<void> => {
  expect(await resourceService.getResources({ type: "ROOM", isAvailable: false })).toEqual([]);
  expect((await resourceService.getResources({ type: "LAB", isAvailable: false })).map((resource: Resource): string => resource.name))
    .toEqual(["Chem Lab"]);
});
