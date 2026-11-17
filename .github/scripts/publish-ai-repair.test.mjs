import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import test from "node:test";
import { applyArtifact, publishRepair } from "./publish-ai-repair.mjs";

const approved = "src/services/reservation.service.ts";
const other = "src/services/__tests__/reservation.service.test.ts";
const repoName = "jiatongzhu123/campushub-backend";
const branch = "fix/auto-heal-pr-17";
const repairedSha = "2".repeat(40);

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.error?.message ?? result.stderr}`);
  return result.stdout.trim();
}

function write(root, path, content) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

async function fixture(run) {
  const tempRoot = realpathSync(tmpdir());
  const directory = mkdtempSync(join(tempRoot, "campushub-publish-test-"));
  const repo = join(directory, "repo");
  mkdirSync(repo);
  try {
    git(repo, ["init", "--quiet"]);
    git(repo, ["config", "core.autocrlf", "false"]);
    write(repo, approved, "export const reservation = 'broken';\n");
    write(repo, other, "test('reservation', () => {});\n");
    git(repo, ["add", "."]);
    git(repo, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "failing"]);
    const head = git(repo, ["rev-parse", "HEAD"]);
    const repaired = "export const reservation = 'repaired';\n";
    write(repo, approved, repaired);
    const patch = join(directory, "validated-repair.patch");
    writeFileSync(patch, spawnSync("git", ["diff", "--binary", "HEAD", "--", approved], { cwd: repo, encoding: "utf8" }).stdout);
    write(repo, approved, "export const reservation = 'broken';\n");
    await run({ repo, directory, head, patch, repaired });
  } finally {
    const resolved = realpathSync(directory);
    assert.ok(resolved.startsWith(`${tempRoot}${sep}`) && relative(tempRoot, resolved).startsWith("campushub-publish-test-"));
    rmSync(resolved, { recursive: true, force: true });
  }
}

function mockGitHub({ head, repaired, originalHead = head, originalUser = "jiatongzhu123",
  prior = null, tip = null, remoteContent = repaired, racePr = false } = {}) {
  const calls = [];
  let currentTip = tip;
  let existing = prior;
  let content = remoteContent;
  const original = () => ({
    number: 17, state: "open", user: { login: originalUser },
    base: { ref: "main", repo: { full_name: repoName } },
    head: { ref: "test/breaking-reservation-change", sha: originalHead, repo: { full_name: repoName } },
  });
  const response = (status, data) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url);
    const path = parsed.pathname;
    const body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ method: options.method, path, query: parsed.search, body, redirect: options.redirect });
    assert.equal(options.headers.Authorization, "Bearer fixture-token");
    assert.equal(options.redirect, "error");
    if (options.method === "GET" && path.endsWith("/pulls/17")) return response(200, original());
    if (options.method === "GET" && path.endsWith("/pulls")) {
      assert.equal(parsed.searchParams.get("state"), "all");
      assert.equal(parsed.searchParams.get("head"), `jiatongzhu123:${branch}`);
      return response(200, existing ? [existing] : []);
    }
    if (options.method === "GET" && path.endsWith(`/git/ref/heads/${branch}`)) {
      return currentTip ? response(200, { object: { sha: currentTip } }) : response(404, { message: "Not Found" });
    }
    if (options.method === "POST" && path.endsWith("/git/refs")) {
      assert.equal(body.ref, `refs/heads/${branch}`);
      assert.equal(body.sha, head);
      currentTip = head;
      return response(201, { ref: body.ref, object: { sha: head } });
    }
    if (options.method === "PUT" && path.endsWith(`/contents/${approved}`)) {
      assert.equal(body.branch, branch);
      assert.equal(Buffer.from(body.content, "base64").toString("utf8"), repaired);
      content = repaired;
      currentTip = repairedSha;
      return response(200, { commit: { sha: repairedSha } });
    }
    if (options.method === "GET" && path.endsWith(`/commits/${repairedSha}`)) {
      return response(200, {
        sha: repairedSha, parents: [{ sha: head }], files: [{ filename: approved, status: "modified" }],
      });
    }
    if (options.method === "GET" && path.endsWith(`/contents/${approved}`)) {
      return response(200, { type: "file", encoding: "base64", content: Buffer.from(content).toString("base64") });
    }
    if (options.method === "POST" && path.endsWith("/pulls")) {
      assert.equal(body.head, branch);
      assert.equal(body.base, "test/breaking-reservation-change");
      assert.match(body.body, /Human-in-the-Loop Audit Log/);
      assert.match(body.body, /Pending human review/);
      assert.match(body.body, /actions\/runs\/900/);
      assert.match(body.body, /lint, Jest and legacy tests/);
      existing = {
        number: 81, state: "open", html_url: `https://github.com/${repoName}/pull/81`,
        base: { ref: body.base }, head: { ref: body.head, repo: { full_name: repoName } },
      };
      if (racePr) return response(422, { message: "A pull request already exists" });
      return response(201, existing);
    }
    throw new Error(`Unexpected mock request: ${options.method} ${path}`);
  };
  return { calls, fetchImpl, get tip() { return currentTip; }, get pr() { return existing; } };
}

function publishInput(f, mock) {
  return {
    cwd: f.repo, expectedHead: f.head, prNumber: 17, runId: 900,
    token: "fixture-token", apiUrl: "https://api.github.test", serverUrl: "https://github.com",
    fetchImpl: mock.fetchImpl,
  };
}

test("applies one genuine source patch and stages only that file", () => fixture((f) => {
  applyArtifact({ cwd: f.repo, patchPath: f.patch, expectedHead: f.head });
  assert.equal(readFileSync(join(f.repo, approved), "utf8"), f.repaired);
  assert.equal(git(f.repo, ["status", "--porcelain"]), `M  ${approved}`);
}));

test("rejects a missing or empty patch artifact", () => fixture((f) => {
  assert.throws(() => applyArtifact({ cwd: f.repo, patchPath: join(f.directory, "missing"), expectedHead: f.head }));
  writeFileSync(f.patch, "");
  assert.throws(() => applyArtifact({ cwd: f.repo, patchPath: f.patch, expectedHead: f.head }), /nonempty regular file/);
}));

test("rejects wrong failing HEAD before applying the artifact", () => fixture((f) => {
  assert.throws(() => applyArtifact({ cwd: f.repo, patchPath: f.patch, expectedHead: "0".repeat(40) }), /HEAD no longer matches/);
  assert.equal(git(f.repo, ["status", "--porcelain"]), "");
}));

test("rejects a patch to a Jest test", () => fixture((f) => {
  write(f.repo, other, "test('changed', () => {});\n");
  writeFileSync(f.patch, spawnSync("git", ["diff", "HEAD", "--", other], { cwd: f.repo, encoding: "utf8" }).stdout);
  write(f.repo, other, "test('reservation', () => {});\n");
  assert.throws(() => applyArtifact({ cwd: f.repo, patchPath: f.patch, expectedHead: f.head }), /single ordinary content edit/);
}));

test("rejects metadata changes and additional paths in a patch", () => fixture((f) => {
  writeFileSync(f.patch, `${readFileSync(f.patch, "utf8")}\nold mode 100644\nnew mode 100755\n`);
  assert.throws(() => applyArtifact({ cwd: f.repo, patchPath: f.patch, expectedHead: f.head }), /single ordinary content edit/);
  writeFileSync(f.patch, `${readFileSync(f.patch, "utf8")}\ndiff --git a/package.json b/package.json\n`);
  assert.throws(() => applyArtifact({ cwd: f.repo, patchPath: f.patch, expectedHead: f.head }), /single ordinary content edit/);
}));

test("rejects a symlink-mode patch before Git applies it", () => fixture((f) => {
  writeFileSync(f.patch, `${readFileSync(f.patch, "utf8")}\nnew file mode 120000\n`);
  assert.throws(() => applyArtifact({ cwd: f.repo, patchPath: f.patch, expectedHead: f.head }), /single ordinary content edit/);
  assert.equal(git(f.repo, ["status", "--porcelain"]), "");
}));

test("mock publication makes one source commit and one PR on the breaking branch", () => fixture(async (f) => {
  applyArtifact({ cwd: f.repo, patchPath: f.patch, expectedHead: f.head });
  const mock = mockGitHub({ head: f.head, repaired: f.repaired });
  await publishRepair(publishInput(f, mock));
  assert.equal(mock.tip, repairedSha);
  assert.equal(mock.pr.base.ref, "test/breaking-reservation-change");
  assert.equal(mock.calls.filter((call) => call.method === "POST" && call.path.endsWith("/pulls")).length, 1);
  assert.equal(mock.calls.filter((call) => call.method === "PUT").length, 1);
}));

test("existing remediation PR is reported without another branch, commit, or PR", () => fixture(async (f) => {
  applyArtifact({ cwd: f.repo, patchPath: f.patch, expectedHead: f.head });
  const prior = { number: 81, state: "open", html_url: `https://github.com/${repoName}/pull/81`,
    base: { ref: "test/breaking-reservation-change" }, head: { ref: branch, repo: { full_name: repoName } } };
  const mock = mockGitHub({ head: f.head, repaired: f.repaired, prior });
  await publishRepair(publishInput(f, mock));
  assert.equal(mock.calls.filter((call) => ["POST", "PUT"].includes(call.method)).length, 0);
}));

test("outdated original PR head prevents publication", () => fixture(async (f) => {
  applyArtifact({ cwd: f.repo, patchPath: f.patch, expectedHead: f.head });
  const mock = mockGitHub({ head: f.head, repaired: f.repaired, originalHead: "3".repeat(40) });
  await assert.rejects(publishRepair(publishInput(f, mock)), /live head no longer matches/);
  assert.equal(mock.calls.filter((call) => ["POST", "PUT"].includes(call.method)).length, 0);
}));

test("a PR opened by another user prevents publication", () => fixture(async (f) => {
  applyArtifact({ cwd: f.repo, patchPath: f.patch, expectedHead: f.head });
  const mock = mockGitHub({ head: f.head, repaired: f.repaired, originalUser: "someone-else" });
  await assert.rejects(publishRepair(publishInput(f, mock)), /Original PR identity/);
  assert.equal(mock.calls.filter((call) => ["POST", "PUT"].includes(call.method)).length, 0);
}));

test("rerun recovers a repair branch created before its source commit", () => fixture(async (f) => {
  applyArtifact({ cwd: f.repo, patchPath: f.patch, expectedHead: f.head });
  const mock = mockGitHub({ head: f.head, repaired: f.repaired, tip: f.head });
  await publishRepair(publishInput(f, mock));
  assert.equal(mock.calls.filter((call) => call.path.endsWith("/git/refs") && call.method === "POST").length, 0);
  assert.equal(mock.calls.filter((call) => call.method === "PUT").length, 1);
}));

test("rerun recovers a repair commit created before its PR", () => fixture(async (f) => {
  applyArtifact({ cwd: f.repo, patchPath: f.patch, expectedHead: f.head });
  const mock = mockGitHub({ head: f.head, repaired: f.repaired, tip: repairedSha });
  await publishRepair(publishInput(f, mock));
  assert.equal(mock.calls.filter((call) => call.method === "PUT").length, 0);
  assert.equal(mock.calls.filter((call) => call.path.endsWith("/pulls") && call.method === "POST").length, 1);
}));

test("a mismatched existing repair branch is rejected", () => fixture(async (f) => {
  applyArtifact({ cwd: f.repo, patchPath: f.patch, expectedHead: f.head });
  const mock = mockGitHub({ head: f.head, repaired: f.repaired, tip: repairedSha, remoteContent: "not this repair" });
  await assert.rejects(publishRepair(publishInput(f, mock)), /Remote repair content does not match/);
  assert.equal(mock.calls.filter((call) => call.path.endsWith("/pulls") && call.method === "POST").length, 0);
}));

test("an unrelated local file edit prevents any publication API call", () => fixture(async (f) => {
  applyArtifact({ cwd: f.repo, patchPath: f.patch, expectedHead: f.head });
  write(f.repo, other, "test('changed', () => {});\n");
  const mock = mockGitHub({ head: f.head, repaired: f.repaired });
  await assert.rejects(publishRepair(publishInput(f, mock)), /Only the staged reservation source edit/);
  assert.equal(mock.calls.length, 0);
}));

test("closed unmerged remediation PR prevents a second PR", () => fixture(async (f) => {
  applyArtifact({ cwd: f.repo, patchPath: f.patch, expectedHead: f.head });
  const prior = { number: 81, state: "closed", merged_at: null, html_url: `https://github.com/${repoName}/pull/81`,
    base: { ref: "test/breaking-reservation-change" }, head: { ref: branch, repo: { full_name: repoName } } };
  const mock = mockGitHub({ head: f.head, repaired: f.repaired, prior });
  await assert.rejects(publishRepair(publishInput(f, mock)), /closed without a merge/);
  assert.equal(mock.calls.filter((call) => ["POST", "PUT"].includes(call.method)).length, 0);
}));

test("an existing repair PR with the wrong base blocks publication", () => fixture(async (f) => {
  applyArtifact({ cwd: f.repo, patchPath: f.patch, expectedHead: f.head });
  const prior = { number: 81, state: "open", html_url: `https://github.com/${repoName}/pull/81`,
    base: { ref: "main" }, head: { ref: branch, repo: { full_name: repoName } } };
  const mock = mockGitHub({ head: f.head, repaired: f.repaired, prior });
  await assert.rejects(publishRepair(publishInput(f, mock)), /unexpected base branch/);
  assert.equal(mock.calls.filter((call) => ["POST", "PUT"].includes(call.method)).length, 0);
}));

test("a PR creation race is resolved by reporting the existing PR", () => fixture(async (f) => {
  applyArtifact({ cwd: f.repo, patchPath: f.patch, expectedHead: f.head });
  const mock = mockGitHub({ head: f.head, repaired: f.repaired, racePr: true });
  await publishRepair(publishInput(f, mock));
  assert.equal(mock.calls.filter((call) => call.method === "POST" && call.path.endsWith("/pulls")).length, 1);
  assert.equal(mock.pr.number, 81);
}));
