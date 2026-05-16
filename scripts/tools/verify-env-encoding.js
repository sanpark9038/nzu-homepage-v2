const { execSync } = require("child_process");
const { loadProjectPlayerMetadata, PROJECTS_DIR } = require("./lib/project-player-metadata");

function isValidName(name) {
  if (typeof name !== "string") return false;
  const trimmed = name.trim();
  if (!trimmed) return false;
  return !trimmed.includes("\uFFFD");
}

function main() {
  const failures = [];

  let data = null;
  try {
    data = loadProjectPlayerMetadata();
    if (!Array.isArray(data)) {
      failures.push("project player metadata did not load as an array.");
    }
  } catch (error) {
    failures.push(`Failed to read/parse UTF-8 JSON: ${error.message}`);
  }

  let brokenCount = 0;
  const brokenSamples = [];

  if (Array.isArray(data)) {
    for (const row of data) {
      const name = row && (row.display_name || row.name);
      if (!isValidName(name)) {
        brokenCount += 1;
        if (brokenSamples.length < 20) {
          brokenSamples.push({
            entity_id: row && row.entity_id,
            wr_id: row && row.wr_id,
            name,
            gender: row && row.gender,
          });
        }
      }
    }
  }

  let stdoutEncoding = "unknown";
  let isUtf8 = false;

  try {
    const enc =
      (process.stdout && process.stdout.writableEncoding) ||
      (process.stdout?._writableState?.defaultEncoding) ||
      null;

    if (enc) {
      stdoutEncoding = enc;
      isUtf8 = enc.toLowerCase() === "utf8" || enc.toLowerCase() === "utf-8";
    } else {
      const chcpOut = execSync("chcp", { encoding: "utf8" }).trim();
      const cpMatch = chcpOut.match(/:\s*(\d+)/);
      const codePage = cpMatch ? cpMatch[1] : "unknown";
      stdoutEncoding = `chcp:${codePage}`;
      isUtf8 = codePage === "65001";
    }
  } catch (error) {
    stdoutEncoding = `detection-error: ${error.message}`;
  }

  if (!isUtf8) {
    failures.push(`stdout is not UTF-8 (detected: ${stdoutEncoding}). Run: chcp 65001`);
  }

  console.log("[verify:env] Encoding verification report");
  console.log(`- metadata_path: ${PROJECTS_DIR}`);
  console.log(`- json_parse_ok: ${Array.isArray(data)}`);
  console.log(`- broken_name_count: ${brokenCount}`);
  console.log(`- stdout_encoding: ${stdoutEncoding}`);

  if (brokenSamples.length > 0) {
    console.log("- broken_name_samples (max 20):");
    for (const sample of brokenSamples) {
      console.log(
        `  - entity_id=${sample.entity_id}, wr_id=${sample.wr_id}, name=${sample.name}, gender=${sample.gender}`
      );
    }
  }

  if (brokenCount > 0) {
    failures.push(`Broken names detected: ${brokenCount}`);
  }

  if (failures.length > 0) {
    console.error("[verify:env] FAILED");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("[verify:env] PASS");
}

main();
