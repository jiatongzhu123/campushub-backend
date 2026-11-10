import mongoose = require("mongoose");
import os = require("node:os");
import mongodbMemoryServer = require("mongodb-memory-server");

const { MongoMemoryServer } = mongodbMemoryServer;

// Clear any developer or CI URI before Jest evaluates a test module.
delete process.env.MONGODB_URI;

let mongoServer: InstanceType<typeof MongoMemoryServer> | undefined;
let mongoUri: string | undefined;
let ownedConnection: mongoose.Connection | undefined;
let ownedClient: ReturnType<mongoose.Connection["getClient"]> | undefined;
let ownedDatabase: NonNullable<mongoose.Connection["db"]> | undefined;

const testDatabaseName: string = "campushub_jest";

function isOwnedResourceConnection(): boolean {
  if (
    mongoServer === undefined ||
    mongoUri === undefined ||
    ownedConnection === undefined ||
    ownedClient === undefined ||
    ownedDatabase === undefined
  ) {
    return false;
  }

  const endpoint: URL = new URL(mongoUri);
  return (
    ownedConnection.readyState === 1 &&
    ownedConnection.getClient() === ownedClient &&
    ownedConnection.db === ownedDatabase &&
    ownedDatabase.databaseName === testDatabaseName &&
    ownedConnection.name === testDatabaseName &&
    ownedConnection.host === endpoint.hostname &&
    ownedConnection.port === Number(endpoint.port) &&
    mongoServer.getUri(testDatabaseName) === mongoUri
  );
}

function isOwnedConnection(): boolean {
  return mongoose.connection === ownedConnection && isOwnedResourceConnection();
}

function assertOwnedConnection(): mongoose.Connection {
  if (!isOwnedConnection() || ownedConnection === undefined) {
    throw new Error(
      "Refusing to clean up an unowned MongoDB connection; the Jest memory-server connection was replaced or disconnected.",
    );
  }
  return ownedConnection;
}

beforeAll(async (): Promise<void> => {
  const connection: mongoose.Connection = mongoose.connection;
  if (connection.readyState !== 0) {
    throw new Error("Jest expected a disconnected Mongoose instance before setup.");
  }

  try {
    mongoServer = await MongoMemoryServer.create();
    mongoUri = mongoServer.getUri(testDatabaseName);
    process.env.MONGODB_URI = mongoUri;

    // Jest's runtime needs an explicit OS adapter for MongoDB driver client metadata.
    await mongoose.connect(mongoUri, { runtimeAdapters: { os } });
    ownedConnection = connection;
    ownedClient = ownedConnection.getClient();
    ownedDatabase = ownedConnection.db;
    assertOwnedConnection();
  } catch (error: unknown) {
    try {
      if (isOwnedResourceConnection()) {
        await ownedConnection?.close();
      }
    } finally {
      try {
        await mongoServer?.stop();
      } finally {
        if (process.env.MONGODB_URI === mongoUri) {
          delete process.env.MONGODB_URI;
        }
        mongoServer = undefined;
        mongoUri = undefined;
        ownedConnection = undefined;
        ownedClient = undefined;
        ownedDatabase = undefined;
      }
    }
    throw error;
  }
});

afterEach(async (): Promise<void> => {
  if (ownedClient !== undefined) {
    await assertOwnedConnection().dropDatabase();
  } else if (mongoose.connection.readyState !== 0) {
    throw new Error("Refusing to clean up an unowned MongoDB connection after Jest setup failed.");
  }
});

afterAll(async (): Promise<void> => {
  try {
    if (ownedClient !== undefined) {
      const defaultConnectionWasReplaced: boolean = !isOwnedConnection();
      if (isOwnedResourceConnection()) {
        await ownedConnection?.close();
      }
      if (defaultConnectionWasReplaced) {
        throw new Error("Refusing to disconnect an unowned MongoDB connection during Jest teardown.");
      }
    } else if (mongoose.connection.readyState !== 0) {
      throw new Error("Refusing to disconnect an unowned MongoDB connection after Jest setup failed.");
    }
  } finally {
    try {
      await mongoServer?.stop();
    } finally {
      if (process.env.MONGODB_URI === mongoUri) {
        delete process.env.MONGODB_URI;
      }
      mongoServer = undefined;
      mongoUri = undefined;
      ownedConnection = undefined;
      ownedClient = undefined;
      ownedDatabase = undefined;
    }
  }
});
