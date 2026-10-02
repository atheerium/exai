import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

// `npm test` runs `node --import tsx --test <explicit file list>`: there is no
// glob and no runner config. A new *.test.ts that nobody appends to scripts.test
// is therefore never executed -- it looks like coverage and is not, and nothing
// fails. This test turns that silent failure into a loud one.
//
// Note this file is itself registered in scripts.test; a test that is never run
// cannot report that anything else is never run.

const SRC = join(process.cwd(), "src");

function testFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) testFiles(full, found);
    else if (entry.isFile() && entry.name.endsWith(".test.ts")) found.push(full);
  }
  return found;
}

test("every *.test.ts under src/ is registered in scripts.test", () => {
  // A wrong cwd makes readFileSync throw rather than skip silently.
  const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
  const registered = new Set(
    String(pkg.scripts.test).split(/\s+/).filter((arg) => arg.endsWith(".test.ts"))
  );

  const unregistered = testFiles(SRC)
    .map((file) => "src/" + relative(SRC, file).split(sep).join("/"))
    .filter((file) => !registered.has(file))
    .sort();

  assert.deepEqual(
    unregistered,
    [],
    `these test files are never run by \`npm test\`; append them to scripts.test: ${unregistered.join(", ")}`
  );
});