import { execFileSync } from "node:child_process";
import { lstatSync, realpathSync } from "node:fs";
import { join, sep } from "node:path";

const allowedPath = "src/services/reservation.service.ts";

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "buffer" });
}

function reject(message) {
  throw new Error(message);
}

try {
  const root = realpathSync(
    git(process.cwd(), ["rev-parse", "--show-toplevel"]).toString("utf8").trim(),
  );
  git(root, ["rev-parse", "--verify", "HEAD"]);

  const status = git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  const records = status.toString("utf8").split("\0").filter(Boolean);
  if (records.length === 0) reject("No patch found; the working tree is clean.");

  for (const record of records) {
    const state = record.slice(0, 2);
    const path = record.slice(3);
    if (path !== allowedPath) {
      reject(`Unauthorized changed path: ${JSON.stringify(path)} (${state}).`);
    }
    if (!/^( M|M |MM)$/.test(state)) {
      reject(`Only content edits are allowed: ${JSON.stringify(path)} (${state}).`);
    }
  }

  const headEntry = git(root, ["ls-tree", "-z", "HEAD", "--", allowedPath])
    .toString("utf8")
    .split("\0")[0];
  const indexEntry = git(root, ["ls-files", "--stage", "-z", "--", allowedPath])
    .toString("utf8")
    .split("\0")[0];
  const headMode = headEntry.split(" ")[0];
  const indexMode = indexEntry.split(" ")[0];
  if (!/^(100644|100755)$/.test(headMode) || indexMode !== headMode) {
    reject("The approved source file must remain a regular Git file with its original mode.");
  }

  const rawDiff = git(root, [
    "-c", "core.filemode=true", "diff", "--raw", "-z", "--no-ext-diff",
    "--no-textconv", "HEAD", "--", allowedPath,
  ]);
  if (rawDiff.length > 0) {
    const modes = /^:([0-7]{6}) ([0-7]{6}) /.exec(rawDiff.toString("utf8"));
    if (modes === null || modes[1] !== headMode || modes[2] !== headMode) {
      reject("The approved source file's working-tree Git mode changed.");
    }
  }

  const parts = allowedPath.split("/");
  let current = root;
  let sourceInfo;
  for (const part of parts) {
    current = join(current, part);
    const info = lstatSync(current);
    if (info.isSymbolicLink()) reject("The approved source path contains a symlink.");
    if (part === parts.at(-1) ? !info.isFile() : !info.isDirectory()) {
      reject("The approved source path is not a regular file under ordinary directories.");
    }
    if (part === parts.at(-1)) sourceInfo = info;
  }
  if (!realpathSync(current).startsWith(`${root}${sep}`)) {
    reject("The approved source path escapes the Git working tree.");
  }
  if (process.platform !== "win32" && Boolean(sourceInfo.mode & 0o111) !== (headMode === "100755")) {
    reject("The approved source file's executable mode changed.");
  }

  const headObject = /^100(?:644|755) blob ([0-9a-f]{40,64})\t/.exec(headEntry)?.[1];
  const worktreeObject = git(root, ["hash-object", `--path=${allowedPath}`, "--", allowedPath])
    .toString("utf8")
    .trim();
  if (headObject === undefined || worktreeObject === headObject) {
    reject("No source content changed relative to HEAD.");
  }

  console.log(`Patch accepted: content change only in ${allowedPath}.`);
} catch (error) {
  console.error(`Patch rejected: ${error.message}`);
  process.exitCode = 1;
}
