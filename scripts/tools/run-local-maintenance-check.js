const fs = require("fs");
const path = require("path");

const { pruneArtifactDirectories } = require("./prune-tmp-report-artifact-dirs");
const { pruneArtifactZipFiles } = require("./prune-tmp-report-artifact-zips");
const { pruneReports } = require("./prune-tmp-reports");
const { summarizeReportsFootprint } = require("./report-tmp-reports-footprint");

const ROOT = path.resolve(__dirname, "..", "..");
const REPORTS_DIR = path.join(ROOT, "tmp", "reports");
const OUTPUT_MANIFEST_PATH = path.join(ROOT, "data", "metadata", "pipeline_outputs.manifest.v1.json");

function summarizeManifestPresence() {
  if (!fs.existsSync(OUTPUT_MANIFEST_PATH)) {
    return {
      exists: false,
      path: OUTPUT_MANIFEST_PATH,
      output_count: 0,
    };
  }

  const raw = fs.readFileSync(OUTPUT_MANIFEST_PATH, "utf8");
  const doc = JSON.parse(raw);
  return {
    exists: true,
    path: OUTPUT_MANIFEST_PATH,
    output_count: Array.isArray(doc.outputs) ? doc.outputs.length : 0,
    version: doc.version || null,
  };
}

function buildMaintenanceCheck({ nowMs = Date.now() } = {}) {
  const footprint = summarizeReportsFootprint({ nowMs });
  const rootPrune = pruneReports({ apply: false, nowMs, reportsDir: REPORTS_DIR });
  const artifactPrune = pruneArtifactDirectories({ apply: false, nowMs, reportsDir: REPORTS_DIR });
  const artifactZipPrune = pruneArtifactZipFiles({ apply: false, nowMs, reportsDir: REPORTS_DIR });
  const manifest = summarizeManifestPresence();

  return {
    generated_at: new Date(nowMs).toISOString(),
    reports: {
      total_files: footprint.total_files,
      total_size_human: footprint.total_size_human,
      root_files: footprint.root_files,
      nested_files: footprint.nested_files,
      latest_modified_at: footprint.latest_modified_at,
    },
    prune_candidates: {
      root_report_files: {
        count: rootPrune.deleted_files,
        reclaimable_human: footprint.prune_reclaimable_human,
      },
      artifact_directories: {
        count: artifactPrune.deleted_artifact_dirs,
        reclaimable_human: artifactPrune.reclaimed_human,
      },
      artifact_zip_files: {
        count: artifactZipPrune.deleted_artifact_zips,
        reclaimable_human: artifactZipPrune.reclaimed_human,
      },
    },
    manifest,
    next_actions: [
      "npm run reports:footprint",
      "npm run reports:prune",
      "npm run reports:prune:artifact-dirs",
      "npm run reports:prune:artifact-zips",
    ],
  };
}

function main() {
  const summary = buildMaintenanceCheck();
  console.log(JSON.stringify(summary, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  OUTPUT_MANIFEST_PATH,
  buildMaintenanceCheck,
  summarizeManifestPresence,
};
