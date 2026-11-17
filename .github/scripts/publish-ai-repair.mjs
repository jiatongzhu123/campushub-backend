import { execFileSync, spawnSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const approvedPath = "src/services/reservation.service.ts";
const breakingBranch = "test/breaking-reservation-change";
const repository = "jiatongzhu123/campushub-backend";
const validator = fileURLToPath(new URL("./validate-ai-patch.mjs", import.meta.url));
const shaPattern = /^[0-9a-f]{40}$/i;

function reject(message) {
  throw new Error(message);
}

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function checkout(cwd, expectedHead) {
  if (!shaPattern.test(expectedHead)) reject("Expected PR head must be a full commit SHA.");
  const root = realpathSync(git(cwd, ["rev-parse", "--show-toplevel"]));
  if (git(root, ["rev-parse", "HEAD"]).toLowerCase() !== expectedHead.toLowerCase()) {
    reject("Checkout HEAD no longer matches the failing PR commit.");
  }
  return root;
}

function checkedSource(root) {
  const state = git(root, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (state !== `M  ${approvedPath}`) reject("Only the staged reservation source edit may be published.");
  if (git(root, ["diff", "--name-status", "HEAD"]) !== `M\t${approvedPath}`) {
    reject("The repair must modify exactly the approved source file.");
  }
  git(root, ["diff", "--check", "HEAD"]);
  const treeEntry = git(root, ["ls-tree", "HEAD", "--", approvedPath]);
  const headBlob = /^100644 blob ([0-9a-f]{40})\t/.exec(treeEntry)?.[1];
  const indexEntry = git(root, ["ls-files", "--stage", "--", approvedPath]);
  if (!headBlob || !/^100644 [0-9a-f]{40} 0\t/.test(indexEntry)) {
    reject("The reservation service Git mode must remain 100644.");
  }
  const file = resolve(root, approvedPath);
  const info = lstatSync(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size === 0 || info.size > 512 * 1024) {
    reject("The repaired source must be a nonempty regular file below 512 KiB.");
  }
  const bytes = readFileSync(file);
  const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (content.includes("\0") || git(root, ["hash-object", `--path=${approvedPath}`, "--", approvedPath]) === headBlob) {
    reject("The repair has no valid source-content change.");
  }
  return { content, headBlob };
}

export function applyArtifact({ cwd, patchPath, expectedHead }) {
  const root = checkout(cwd, expectedHead);
  if (git(root, ["status", "--porcelain=v1", "--untracked-files=all"])) {
    reject("The failing checkout must be clean before applying the artifact.");
  }
  const target = resolve(patchPath);
  const info = lstatSync(target);
  if (!info.isFile() || info.isSymbolicLink() || info.size === 0 || info.size > 512 * 1024) {
    reject("Patch artifact must be a nonempty regular file below 512 KiB.");
  }
  const patch = new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(target));
  const lines = patch.split("\n");
  if (patch.includes("\0") || lines.filter((line) => line.startsWith("diff --git ")).length !== 1 ||
      lines[0] !== `diff --git a/${approvedPath} b/${approvedPath}` ||
      lines.filter((line) => line.startsWith("--- ")).join("") !== `--- a/${approvedPath}` ||
      lines.filter((line) => line.startsWith("+++ ")).join("") !== `+++ b/${approvedPath}` ||
      !lines.some((line) => line.startsWith("@@ ")) ||
      lines.some((line) => /^(old mode|new mode|new file mode|deleted file mode|rename |copy |GIT binary patch|Binary files)/.test(line))) {
    reject("Patch artifact is not a single ordinary content edit to the approved source file.");
  }
  const stat = git(root, ["apply", "--numstat", "--", target]);
  if (!/^\d+\t\d+\tsrc\/services\/reservation\.service\.ts$/.test(stat)) {
    reject("Patch artifact changes an unexpected path or file type.");
  }
  git(root, ["apply", "--check", "--index", "--", target]);
  git(root, ["apply", "--index", "--whitespace=error", "--", target]);
  const result = spawnSync(process.execPath, [validator], { cwd: root, encoding: "utf8" });
  if (result.error || result.status !== 0) {
    reject(`Patch safety validator rejected the applied artifact: ${result.error?.code ?? result.stderr.trim()}`);
  }
  checkedSource(root);
  checkout(root, expectedHead);
  console.log(`Validated artifact applied to ${approvedPath} at ${expectedHead}.`);
}

function apiClient({ token, apiUrl, fetchImpl }) {
  if (!token) reject("A step-scoped GitHub token is required for publication.");
  return async (method, path, body, allowed = []) => {
    const response = await fetchImpl(`${apiUrl.replace(/\/$/, "")}${path}`, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: "error",
    });
    if (!response.ok && !allowed.includes(response.status)) {
      reject(`GitHub API ${method} ${path.split("?")[0]} failed with HTTP ${response.status}.`);
    }
    return { status: response.status, data: await response.json() };
  };
}

async function originalPr(api, prNumber, expectedHead) {
  const { data: pr } = await api("GET", `/repos/${repository}/pulls/${prNumber}`);
  if (pr.number !== prNumber || pr.state !== "open" || pr.base?.ref !== "main" ||
      pr.base?.repo?.full_name !== repository || pr.head?.ref !== breakingBranch ||
      pr.head?.repo?.full_name !== repository || pr.head?.sha?.toLowerCase() !== expectedHead.toLowerCase() ||
      pr.user?.login !== "jiatongzhu123") {
    reject("Original PR identity or live head no longer matches the authorized failing PR.");
  }
}

async function priorRepairPr(api, branch) {
  const owner = repository.split("/")[0];
  const query = new URLSearchParams({ state: "all", head: `${owner}:${branch}`, per_page: "100" });
  const { data } = await api("GET", `/repos/${repository}/pulls?${query}`);
  if (!Array.isArray(data) || data.length === 100) reject("Could not establish a unique prior remediation PR.");
  const matches = data.filter((pr) => pr.head?.ref === branch && pr.head?.repo?.full_name === repository);
  if (matches.length > 1) reject("Multiple remediation PRs already exist for the repair branch.");
  const existing = matches[0];
  if (existing && existing.base?.ref !== breakingBranch) {
    reject(`Existing remediation PR #${existing.number} targets an unexpected base branch.`);
  }
  return existing;
}

async function reportExisting(api, branch) {
  const existing = await priorRepairPr(api, branch);
  if (!existing) return false;
  const state = existing.merged_at ? "merged" : existing.state;
  console.log(`Existing remediation PR #${existing.number} is ${state}: ${existing.html_url}`);
  if (state === "closed") reject("The existing remediation PR is closed without a merge; no duplicate will be created.");
  return true;
}

async function repairRef(api, branch) {
  const path = `/repos/${repository}/git/ref/heads/${branch}`;
  const response = await api("GET", path, undefined, [404]);
  return response.status === 404 ? null : response.data?.object?.sha;
}

async function verifyRemoteRepair(api, branch, expectedHead, expectedContent) {
  const tip = await repairRef(api, branch);
  if (!shaPattern.test(tip ?? "") || tip.toLowerCase() === expectedHead.toLowerCase()) {
    reject("Repair branch lacks a committed source repair.");
  }
  const { data: commit } = await api("GET", `/repos/${repository}/commits/${tip}`);
  if (commit.sha !== tip || commit.parents?.length !== 1 || commit.parents[0].sha.toLowerCase() !== expectedHead.toLowerCase() ||
      commit.files?.length !== 1 || commit.files[0].filename !== approvedPath || commit.files[0].status !== "modified") {
    reject("Existing repair branch contains an unexpected commit or changed file.");
  }
  const { data: file } = await api("GET", `/repos/${repository}/contents/${approvedPath}?ref=${encodeURIComponent(branch)}`);
  if (file.type !== "file" || file.encoding !== "base64" || typeof file.content !== "string" ||
      !Buffer.from(file.content.replace(/\s/g, ""), "base64").equals(Buffer.from(expectedContent, "utf8"))) {
    reject("Remote repair content does not match the locally validated source.");
  }
}

export async function publishRepair({ cwd, expectedHead, prNumber, runId, token, apiUrl, serverUrl, fetchImpl = fetch }) {
  if (!Number.isSafeInteger(prNumber) || prNumber < 1 || !Number.isSafeInteger(runId) || runId < 1 ||
      !/^https:\/\//.test(apiUrl) || serverUrl !== "https://github.com") {
    reject("Invalid publication metadata.");
  }
  const root = checkout(cwd, expectedHead);
  const { content, headBlob } = checkedSource(root);
  const api = apiClient({ token, apiUrl, fetchImpl });
  const branch = `fix/auto-heal-pr-${prNumber}`;
  await originalPr(api, prNumber, expectedHead);
  if (await reportExisting(api, branch)) return;

  let tip = await repairRef(api, branch);
  if (tip === null) {
    const created = await api("POST", `/repos/${repository}/git/refs`, {
      ref: `refs/heads/${branch}`, sha: expectedHead,
    }, [422]);
    if (created.status !== 201 && created.status !== 422) reject("Could not create repair branch.");
    tip = await repairRef(api, branch);
  }
  if (!shaPattern.test(tip ?? "")) reject("Repair branch reference is missing or invalid.");
  if (tip.toLowerCase() === expectedHead.toLowerCase()) {
    await api("PUT", `/repos/${repository}/contents/${approvedPath}`, {
      message: `fix: auto-heal reservation failure from PR #${prNumber}`,
      content: Buffer.from(content, "utf8").toString("base64"),
      sha: headBlob,
      branch,
    });
  }
  await verifyRemoteRepair(api, branch, expectedHead, content);
  await originalPr(api, prNumber, expectedHead);
  if (await reportExisting(api, branch)) return;

  const body = `Automated Copilot repair for original failing PR #${prNumber} (${serverUrl}/${repository}/pull/${prNumber}).\n\n` +
    `Failed Actions run: ${serverUrl}/${repository}/actions/runs/${runId}\n\n` +
    `Repair summary: Copilot generated a source-only change to address the reservation Jest failure. ` +
    `The exact logic change is visible in this PR's diff.\n\n` +
    `Source file modified: \`${approvedPath}\`.\n\n` +
    `Verification: the auto-fix job passed patch validation, lint, Jest and legacy tests via \`npm test\`, and \`npm run build\` before this PR was published.\n\n` +
    `## Human-in-the-Loop Audit Log\n\nPending human review. The generated diff and test results must be inspected before accepting or merging this repair.\n`;
  const created = await api("POST", `/repos/${repository}/pulls`, {
    title: `fix: automated reservation repair for PR #${prNumber}`,
    head: branch,
    base: breakingBranch,
    body,
    draft: false,
  }, [422]);
  if (created.status === 422 && await reportExisting(api, branch)) return;
  if (created.status !== 201 || created.data?.base?.ref !== breakingBranch ||
      created.data?.head?.ref !== branch || created.data?.state !== "open") {
    reject("GitHub did not confirm one open remediation PR on the breaking branch.");
  }
  console.log(`Created remediation PR #${created.data.number}: ${created.data.html_url}`);
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [mode, option, value, headOption, expectedHead] = process.argv.slice(2);
    if (headOption !== "--expected-head" || !expectedHead) reject("Expected --expected-head.");
    if (mode === "apply" && option === "--patch" && value && process.argv.length === 7) {
      applyArtifact({ cwd: process.cwd(), patchPath: value, expectedHead });
    } else if (mode === "publish" && option === "--pr-number" && /^\d+$/.test(value ?? "") && process.argv.length === 7) {
      if (process.env.GITHUB_ACTIONS !== "true" || process.env.GITHUB_EVENT_NAME !== "pull_request" ||
          process.env.GITHUB_REPOSITORY !== repository) reject("Publication requires the authorized GitHub Actions PR context.");
      await publishRepair({
        cwd: process.cwd(), expectedHead, prNumber: Number(value),
        runId: Number(process.env.GITHUB_RUN_ID), token: process.env.GITHUB_TOKEN,
        apiUrl: process.env.GITHUB_API_URL, serverUrl: process.env.GITHUB_SERVER_URL,
      });
    } else {
      reject("Expected apply --patch FILE --expected-head SHA or publish --pr-number NUMBER --expected-head SHA.");
    }
  } catch (error) {
    console.error(`Repair publication rejected: ${error.message}`);
    process.exitCode = 1;
  }
}
