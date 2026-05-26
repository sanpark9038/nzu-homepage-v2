const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("roster correction page opens writes only when remote correction store is available", () => {
  const pageSource = readProjectFile("app/admin/roster/page.tsx");
  const storeSource = readProjectFile("lib/roster-admin-store.ts");

  assert.match(storeSource, /export function isRemoteRosterAdminCorrectionStoreEnabled/);
  assert.match(pageSource, /import \{ isAdminWriteDisabled \}/);
  assert.match(pageSource, /isRemoteRosterAdminCorrectionStoreEnabled/);
  assert.match(
    pageSource,
    /const readOnly = isAdminWriteDisabled\(\) && !isRemoteRosterAdminCorrectionStoreEnabled\(\)/
  );
  assert.match(pageSource, /<RosterCorrectionEditor readOnly=\{readOnly\}/);
});

runTest("roster correction API allows deployed writes only through remote correction store", () => {
  const routeSource = readProjectFile("app/api/admin/roster/route.ts");

  assert.match(routeSource, /isRemoteRosterAdminCorrectionStoreEnabled/);
  assert.match(
    routeSource,
    /const allowDeployedRosterCorrectionWrite =\s+allowRosterCorrectionWrite && isRemoteRosterAdminCorrectionStoreEnabled\(\)/
  );
  assert.match(
    routeSource,
    /isAdminWriteDisabled\(\) && !allowDeployedRosterCorrectionWrite && !allowTournamentHomeWrite/
  );
  assert.match(routeSource, /if \(isAdminWriteDisabled\(\) && !allowDeployedRosterCorrectionWrite\)/);
  assert.match(routeSource, /saveRemoteRosterAdminCorrection/);
});

runTest("deployed roster correction writes cannot fall back to local JSON files", () => {
  const routeSource = readProjectFile("app/api/admin/roster/route.ts");

  assert.match(routeSource, /function blockLocalRosterCorrectionFallbackInDeployment/);
  assert.match(
    routeSource,
    /if \(isAdminWriteDisabled\(\) && !remoteSaved\)[\s\S]*getAdminWriteDisabledMessage\("roster correction"\)[\s\S]*status: 503/
  );

  const remoteWriteCount =
    (routeSource.match(/const remoteSaved = await saveRemoteRosterAdminCorrection/g) || []).length;
  const fallbackBlockCount =
    (routeSource.match(/const fallbackBlocked = blockLocalRosterCorrectionFallbackInDeployment\(remoteSaved\)/g) || [])
      .length;
  assert.equal(fallbackBlockCount, remoteWriteCount);
  assert.doesNotMatch(routeSource, /isAdminWriteDisabled\(\)[\s\S]{0,240}writeOverrides\(overrides\)/);
  assert.doesNotMatch(routeSource, /isAdminWriteDisabled\(\)[\s\S]{0,240}writeExclusions\(exclusions\)/);
  assert.doesNotMatch(routeSource, /isAdminWriteDisabled\(\)[\s\S]{0,240}writeResumes\(resumes\)/);
});

runTest("roster correction SQL keeps admin correction table service-role only", () => {
  const sql = readProjectFile("scripts/sql/create-roster-admin-corrections.sql");

  assert.match(sql, /alter table public\.roster_admin_corrections enable row level security;/);
  assert.match(sql, /revoke all on table public\.roster_admin_corrections from anon, authenticated;/);
  assert.match(
    sql,
    /grant select, insert, update, delete on table public\.roster_admin_corrections to service_role;/
  );
  assert.match(sql, /notify pgrst, 'reload schema';/);
  assert.doesNotMatch(sql, /grant\s+(select|all)[^;]+to\s+anon/i);
  assert.doesNotMatch(sql, /grant\s+(select|all)[^;]+to\s+authenticated/i);
});

runTest("package exposes the roster correction live-write contract test", () => {
  const pkg = JSON.parse(readProjectFile("package.json"));

  assert.equal(
    pkg.scripts["test:admin-roster-correction-live-write"],
    "node scripts/tools/admin-roster-correction-live-write-contract.test.js"
  );
  assert.match(pkg.scripts["verify:predeploy"], /test:admin-roster-correction-live-write/);
});
