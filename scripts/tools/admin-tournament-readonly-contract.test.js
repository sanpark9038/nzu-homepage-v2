const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

test("admin tournament page follows deployment read-only guard pattern", () => {
  const source = readProjectFile("app/admin/tournament/page.tsx");

  assert.doesNotMatch(source, /^"use client";/);
  assert.match(source, /import \{ isAdminWriteDisabled \}/);
  assert.match(source, /export const dynamic = "force-dynamic"/);
  assert.match(source, /const readOnly = isAdminWriteDisabled\(\)/);
  assert.match(source, /<TournamentManagementClient readOnly=\{readOnly\}/);
});

test("admin tournament client receives read-only state from the server page", () => {
  const source = readProjectFile("app/admin/tournament/TournamentManagementClient.tsx");

  assert.match(source, /^"use client";/);
  assert.match(source, /import \{ AdminReadonlyNotice \}/);
  assert.match(source, /readOnly = false/);
  assert.match(source, /<AdminReadonlyNotice/);
  assert.doesNotMatch(source, /isAdminWriteDisabled/);
});

test("admin tournament mutation handlers fail closed before fetch when read-only", () => {
  const source = readProjectFile("app/admin/tournament/TournamentManagementClient.tsx");

  for (const handler of ["recruitPlayer", "updateTeamName", "setTeamCaptain", "removePlayer"]) {
    const start = source.indexOf(`const ${handler}`);
    assert.notEqual(start, -1, `${handler} handler should exist`);
    const fetchIndex = source.indexOf("fetch(", start);
    const readOnlyIndex = source.indexOf("if (readOnly)", start);
    assert.notEqual(fetchIndex, -1, `${handler} should contain a fetch call`);
    assert.notEqual(readOnlyIndex, -1, `${handler} should guard read-only mode`);
    assert.ok(readOnlyIndex < fetchIndex, `${handler} should check readOnly before fetch`);
  }
});

test("admin tournament mutation controls are disabled in read-only mode", () => {
  const source = readProjectFile("app/admin/tournament/TournamentManagementClient.tsx");

  assert.match(source, /disabled=\{saving \|\| readOnly\}/);
  assert.match(source, /disabled=\{readOnly\}/);
  assert.match(source, /disabled=\{saving \|\| readOnly\}/);
});
