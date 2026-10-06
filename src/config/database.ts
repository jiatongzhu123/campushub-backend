import mongoose = require("mongoose");

const serverPort: number = Number(process.env.PORT ?? 3000);

function getMongoDbUri(): string {
  const mongoDbUri: string | undefined = process.env.MONGODB_URI;
  if (mongoDbUri === undefined || mongoDbUri.trim().length === 0) {
    throw new Error("MONGODB_URI environment variable is required.");
  }

  return mongoDbUri;
}

async function connectDatabase(): Promise<void> {
  const mongoDbUri: string = getMongoDbUri();
  await mongoose.connect(mongoDbUri);
}

export = { connectDatabase, serverPort };
