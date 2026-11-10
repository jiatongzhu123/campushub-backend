import mongoose = require("mongoose");

test("MongoMemoryServer accepts an isolated database write", async (): Promise<void> => {
  expect(mongoose.connection.readyState).toBe(1);
  expect(mongoose.connection.host).toBe("127.0.0.1");
  expect(process.env.MONGODB_URI).toMatch(/^mongodb:\/\/127\.0\.0\.1:/);

  const database = mongoose.connection.db;
  if (database === undefined) {
    throw new Error("The in-memory database connection was not initialized.");
  }

  const ping: { ok?: number } = await database.command({ ping: 1 });
  expect(ping.ok).toBe(1);

  const collection = database.collection<{ marker: string }>("lab7_setup_smoke");
  await collection.insertOne({ marker: "memory-only" });
  expect(await collection.countDocuments({ marker: "memory-only" })).toBe(1);
});

test("the previous test's database write was removed", async (): Promise<void> => {
  const database = mongoose.connection.db;
  if (database === undefined) {
    throw new Error("The in-memory database connection was not initialized.");
  }

  expect(await database.collection("lab7_setup_smoke").countDocuments()).toBe(0);
});
