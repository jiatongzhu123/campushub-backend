import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const validator = fileURLToPath(new URL("./validate-ai-patch.mjs", import.meta.url));
const approved = "src/services/reservation.service.ts";
const jestTest = "src/services/__tests__/reservation.service.test.ts";
const workflow = ".github/workflows/ci.yml";
const manifest = "package.json";
const lockfile = "package-lock.json";
const jestConfig = "jest.config.ts";
const documentation = "docs/openapi.yaml";
const unrelated = "src/services/resource.service.ts";

function git(repo, args, input) {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8", input });
  assert.equal(result.status, 0, `git ${args.join(" ")} failed: ${result.error?.message ?? result.stderr}`);
  return result.stdout.trim();
}

function write(repo, path, content) {
  const target = join(repo, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function append(repo, path) {
  const target = join(repo, path);
  writeFileSync(target, `${readFileSync(target, "utf8")}\n// repair\n`);
}

function withRepo(run) {
  const tempRoot = realpathSync(tmpdir());
  const repo = mkdtempSync(join(tempRoot, "campushub-patch-test-"));
  try {
    git(repo, ["init", "--quiet"]);
    write(repo, approved, "export const reservation = true;\n");
    write(repo, jestTest, "test('reservation', () => {});\n");
    write(repo, workflow, "name: CI\n");
    write(repo, manifest, '{"name":"fixture"}\n');
    write(repo, lockfile, '{"name":"fixture"}\n');
    write(repo, jestConfig, "export default {};\n");
    write(repo, documentation, "openapi: 3.0.0\n");
    write(repo, unrelated, "export const resource = true;\n");
    git(repo, ["add", "."]);
    git(repo, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "baseline"]);
    run(repo);
  } finally {
    const resolved = realpathSync(repo);
    assert.ok(
      resolved.startsWith(`${tempRoot}${sep}`) && relative(tempRoot, resolved).startsWith("campushub-patch-test-"),
      "Refusing to remove a path outside the test fixture directory",
    );
    rmSync(resolved, { recursive: true, force: true });
  }
}

function validate(repo) {
  return spawnSync(process.execPath, [validator], { cwd: repo, encoding: "utf8" });
}

function expectRejected(repo, message) {
  const result = validate(repo);
  assert.equal(result.status, 1, `Unexpected result: ${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, message);
}

test("accepts a content edit to the approved reservation service", () => {
  withRepo((repo) => {
    append(repo, approved);
    const result = validate(repo);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Patch accepted/);
  });
});

test("accepts a staged content edit to the approved file", () => {
  withRepo((repo) => {
    append(repo, approved);
    git(repo, ["add", "--", approved]);
    assert.equal(validate(repo).status, 0);
  });
});

for (const [label, path] of [
  ["Jest test", jestTest],
  ["workflow", workflow],
  ["package manifest", manifest],
  ["lockfile", lockfile],
  ["Jest configuration", jestConfig],
  ["documentation file", documentation],
  ["unrelated source file", unrelated],
]) {
  test(`rejects a modified ${label}`, () => {
    withRepo((repo) => {
      append(repo, path);
      expectRejected(repo, /Unauthorized changed path/);
    });
  });
}

test("rejects multiple modified files when one is unauthorized", () => {
  withRepo((repo) => {
    append(repo, approved);
    append(repo, jestTest);
    expectRejected(repo, /Unauthorized changed path/);
  });
});

test("rejects an empty patch", () => {
  withRepo((repo) => expectRejected(repo, /No patch found/));
});

test("rejects deletion of the approved file", () => {
  withRepo((repo) => {
    rmSync(join(repo, approved));
    expectRejected(repo, /Only content edits are allowed/);
  });
});

test("rejects a rename of the approved file", () => {
  withRepo((repo) => {
    renameSync(join(repo, approved), join(repo, "src/services/renamed.ts"));
    expectRejected(repo, /Unauthorized changed path|Only content edits are allowed/);
  });
});

test("rejects a staged Git rename of the approved file", () => {
  withRepo((repo) => {
    git(repo, ["mv", approved, "src/services/renamed.ts"]);
    expectRejected(repo, /Unauthorized changed path|Only content edits are allowed/);
  });
});

test("rejects a staged symlink replacing the approved file", () => {
  withRepo((repo) => {
    const blob = git(repo, ["hash-object", "-w", "--stdin"], "../../../outside.ts");
    git(repo, ["update-index", "--cacheinfo", "120000", blob, approved]);
    expectRejected(repo, /Only content edits are allowed|regular Git file/);
  });
});

test("rejects an unexpected untracked file", () => {
  withRepo((repo) => {
    write(repo, "test-results.log", "untracked diagnostic\n");
    expectRejected(repo, /Unauthorized changed path/);
  });
});

const posixOnly = process.platform === "win32"
  ? { skip: "Windows does not expose a meaningful unstaged POSIX executable bit" }
  : {};

test("rejects an unstaged executable-bit-only change", posixOnly, () => {
  withRepo((repo) => {
    git(repo, ["config", "core.filemode", "true"]);
    chmodSync(join(repo, approved), 0o755);
    assert.match(git(repo, ["status", "--porcelain", "--", approved]), /^ M /);
    expectRejected(repo, /mode changed/);
  });
});

test("rejects a content edit combined with an unstaged executable-bit change", posixOnly, () => {
  withRepo((repo) => {
    git(repo, ["config", "core.filemode", "false"]);
    append(repo, approved);
    chmodSync(join(repo, approved), 0o755);
    expectRejected(repo, /mode changed/);
  });
});

test("rejects a staged executable-bit change", () => {
  withRepo((repo) => {
    git(repo, ["update-index", "--chmod=+x", "--", approved]);
    expectRejected(repo, /original mode/);
  });
});

test("accepts source content changes when Git file modes stay the same", () => {
  withRepo((repo) => {
    append(repo, approved);
    assert.match(git(repo, ["-c", "core.filemode=true", "diff", "--raw", "HEAD", "--", approved]), /^:100644 100644 /);
    const result = validate(repo);
    assert.equal(result.status, 0, result.stderr);
  });
});
