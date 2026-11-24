import { lstat, readFile, realpath, rm, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Reporter } from "@playwright/test/reporter";

interface CleanupOptions {
  rootDir: string;
  runId: string;
}

interface OwnerMarker {
  runId: string;
  dbPath: string;
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isOwnerMarker(value: unknown): value is OwnerMarker {
  return typeof value === "object" && value !== null &&
    "runId" in value && typeof value.runId === "string" &&
    "dbPath" in value && typeof value.dbPath === "string";
}

export default class MongoCleanupReporter implements Reporter {
  constructor(private readonly options: CleanupOptions) {}

  async onEnd(): Promise<void> {
    const outputDir: string = resolve(this.options.rootDir, "test-results");
    const dbPath: string = resolve(outputDir, `mongo-${this.options.runId}`);
    const markerPath: string = resolve(outputDir, `mongo-${this.options.runId}.owner.json`);
    if (dirname(dbPath) !== outputDir || dirname(markerPath) !== outputDir) {
      throw new Error("Refusing to clean an E2E MongoDB path outside test-results.");
    }

    let markerText: string;
    try {
      markerText = await readFile(markerPath, "utf8");
    } catch (error: unknown) {
      if (isMissingFile(error)) {
        return;
      }
      throw error;
    }
    const marker: unknown = JSON.parse(markerText) as unknown;
    if (!isOwnerMarker(marker) || marker.runId !== this.options.runId || marker.dbPath !== dbPath) {
      throw new Error("Refusing to clean an E2E MongoDB directory without a matching ownership marker.");
    }

    try {
      const directory = await lstat(dbPath);
      if (!directory.isDirectory() || directory.isSymbolicLink() ||
          dirname(await realpath(dbPath)) !== await realpath(outputDir)) {
        throw new Error("Refusing to clean an E2E MongoDB directory outside test-results.");
      }
      await rm(dbPath, { recursive: true, maxRetries: 5, retryDelay: 200 });
    } catch (error: unknown) {
      if (!isMissingFile(error)) {
        throw error;
      }
    }
    await unlink(markerPath);
  }
}
