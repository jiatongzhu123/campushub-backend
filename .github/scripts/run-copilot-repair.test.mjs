import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const runner = fileURLToPath(new URL("./run-copilot-repair.mjs", import.meta.url));
const approved = "src/services/reservation.service.ts";

function git(repo, args) {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  assert.equal(result.status, 0, `git ${args.join(" ")} failed: ${result.error?.message ?? result.stderr}`);
  return result.stdout.trim();
}

function write(root, path, content) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function withFixture(run) {
  const systemTemp = realpathSync(tmpdir());
  const fixture = mkdtempSync(join(systemTemp, "campushub-runner-test-"));
  const repo = join(fixture, "repo");
  mkdirSync(repo);
  try {
    git(repo, ["init", "--quiet"]);
    write(repo, approved, "export const reservation = 'broken';\n");
    write(repo, "src/services/__tests__/reservation.service.test.ts", "test('reservation', () => {});\n");
    write(repo, ".github/workflows/ci.yml", "name: CI\n");
    git(repo, ["add", "."]);
    git(repo, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "baseline"]);

    write(fixture, "test-results.log", "FAIL src/services/__tests__/reservation.service.test.ts\n  ● rejects overlap\nTest Suites: 1 failed, 3 passed, 4 total\nTests: 1 failed, 89 passed, 90 total\n");
    write(fixture, "pr.diff", `diff --git a/${approved} b/${approved}\n@@ -1 +1 @@\n-broken\n+change\n`);
    write(fixture, "source-context.txt", `Relevant tests for ${approved}: overlapping bookings must conflict.\n`);
    write(fixture, "mock-copilot.mjs", `
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const prompt = readFileSync(0, 'utf8');
writeFileSync(process.env.MOCK_RECORD, JSON.stringify({ args: process.argv.slice(2), prompt, home: process.env.COPILOT_HOME }));
const action = process.env.MOCK_ACTION;
if (action === 'repair') appendFileSync(join(process.cwd(), '${approved}'), "// model repair\\n");
if (action === 'test') appendFileSync(join(process.cwd(), 'src/services/__tests__/reservation.service.test.ts'), '// bad\\n');
if (action === 'workflow') appendFileSync(join(process.cwd(), '.github/workflows/ci.yml'), '# bad\\n');
if (action === 'error') { console.error('TOP_SECRET_TEST_VALUE'); process.exit(23); }
console.log('I fixed the issue.');
`);
    run({ fixture, repo, head: git(repo, ["rev-parse", "HEAD"]) });
  } finally {
    const resolved = realpathSync(fixture);
    assert.ok(
      resolved.startsWith(`${systemTemp}${sep}`) && relative(systemTemp, resolved).startsWith("campushub-runner-test-"),
      "Refusing to remove a path outside the test fixture directory",
    );
    rmSync(resolved, { recursive: true, force: true });
  }
}

function invoke({ fixture, repo, head }, action, overrides = {}) {
  const args = [
    "--test-log", join(fixture, "test-results.log"),
    "--pr-diff", join(fixture, "pr.diff"),
    "--source-context", join(fixture, "source-context.txt"),
    "--expected-head", head,
  ];
  const command = overrides.command ?? [process.execPath, join(fixture, "mock-copilot.mjs")];
  return spawnSync(process.execPath, [runner, ...args], {
    cwd: repo,
    encoding: "utf8",
    env: {
      ...process.env,
      CAMPUSHUB_COPILOT_COMMAND: JSON.stringify(command),
      MOCK_ACTION: action,
      MOCK_RECORD: join(fixture, "invocation.json"),
      GITHUB_ACTIONS: overrides.githubActions ? "true" : "false",
    },
  });
}

function expectRejected(result, message) {
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, message);
}

test("mock repair edits only the reservation service and passes validation", () => {
  withFixture((fixture) => {
    const result = invoke(fixture, "repair");
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /patch accepted by the safety validator/);
    assert.match(readFileSync(join(fixture.repo, approved), "utf8"), /model repair/);
    const record = JSON.parse(readFileSync(join(fixture.fixture, "invocation.json"), "utf8"));
    assert.match(record.prompt, /rejects overlap/);
    assert.match(record.prompt, /diff --git/);
    assert.match(record.prompt, /overlapping bookings must conflict/);
    assert.match(record.prompt, /export const reservation = 'broken'/);
    assert.match(record.prompt, new RegExp(fixture.head));
    assert.ok(record.args.includes("--available-tools=apply_patch,edit,view,grep,glob"));
    assert.ok(record.args.includes(`--allow-tool=read,write(${approved})`));
    assert.ok(record.args.includes("--deny-tool=shell,url,memory"));
    assert.ok(record.args.includes("--no-ask-user"));
    assert.equal(existsSync(record.home), false);
  });
});

for (const [action, label] of [["test", "Jest test"], ["workflow", "workflow"]]) {
  test(`mock modification of a ${label} is rejected`, () => {
    withFixture((fixture) => expectRejected(invoke(fixture, action), /Patch validation failed:.*Unauthorized changed path/));
  });
}

test("a success message without a source modification is rejected", () => {
  withFixture((fixture) => expectRejected(invoke(fixture, "none"), /Patch validation failed:.*No patch found/));
});

test("incorrect expected HEAD is rejected before Copilot starts", () => {
  withFixture((fixture) => {
    const result = invoke({ ...fixture, head: "0".repeat(40) }, "repair");
    expectRejected(result, /Git HEAD does not match/);
    assert.equal(existsSync(join(fixture.fixture, "invocation.json")), false);
  });
});

test("a dirty initial working tree is rejected before Copilot starts", () => {
  withFixture((fixture) => {
    appendFileSync(join(fixture.repo, approved), "// existing change\n");
    expectRejected(invoke(fixture, "repair"), /working tree is not clean/);
    assert.equal(existsSync(join(fixture.fixture, "invocation.json")), false);
  });
});

test("a missing Copilot executable fails safely", () => {
  withFixture((fixture) => {
    const result = invoke(fixture, "repair", { command: [join(fixture.fixture, "missing-copilot")] });
    expectRejected(result, /Copilot could not run \(ENOENT\)/);
  });
});

test("GitHub Actions refuses the test-only Copilot command override", () => {
  withFixture((fixture) => {
    const result = invoke(fixture, "repair", { githubActions: true });
    expectRejected(result, /command override is not permitted/);
    assert.equal(existsSync(join(fixture.fixture, "invocation.json")), false);
  });
});

test("a nonzero Copilot exit fails without printing its output", () => {
  withFixture((fixture) => {
    const result = invoke(fixture, "error");
    expectRejected(result, /Copilot exited with status 23/);
    assert.doesNotMatch(result.stderr, /TOP_SECRET_TEST_VALUE/);
  });
});

test("a missing Jest log is rejected before Copilot starts", () => {
  withFixture((fixture) => {
    rmSync(join(fixture.fixture, "test-results.log"));
    expectRejected(invoke(fixture, "repair"), /ENOENT/);
    assert.equal(existsSync(join(fixture.fixture, "invocation.json")), false);
  });
});

test("an invalid Jest log is rejected before Copilot starts", () => {
  withFixture((fixture) => {
    write(fixture.fixture, "test-results.log", "All tests passed.\n");
    expectRejected(invoke(fixture, "repair"), /Jest failure log lacks/);
    assert.equal(existsSync(join(fixture.fixture, "invocation.json")), false);
  });
});

test("unusual input characters remain literal data and cannot invoke a shell", () => {
  withFixture((fixture) => {
    const marker = join(fixture.fixture, "injected");
    const payload = `$(touch ${marker}) ; & | \\n \"quoted\" 'single'`;
    appendFileSync(join(fixture.fixture, "test-results.log"), payload);
    const result = invoke(fixture, "repair");
    assert.equal(result.status, 0, result.stderr);
    const record = JSON.parse(readFileSync(join(fixture.fixture, "invocation.json"), "utf8"));
    assert.ok(record.prompt.includes(payload));
    assert.equal(existsSync(marker), false);
  });
});
