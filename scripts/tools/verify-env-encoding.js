const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const METADATA_PATH = path.join(ROOT, "scripts", "player_metadata.json");

function readJsonUtf8(filePath) {
  const raw = fs.readFileSync(filePath);
  const text = Buffer.from(raw).toString("utf8");
  return JSON.parse(text);
}

function isValidName(name) {
  if (typeof name !== "string") return false;
  const trimmed = name.trim();
  if (!trimmed) return false;
  return /^[A-Za-z0-9가-힣()]+$/u.test(trimmed);
}

function main() {
  const failures = [];

  // a) UTF-8 read + JSON parse validation
  let data = null;
  try {
    data = readJsonUtf8(METADATA_PATH);
    if (!Array.isArray(data)) {
      failures.push("scripts/player_metadata.json is not a JSON array.");
    }
  } catch (error) {
    failures.push(`Failed to read/parse UTF-8 JSON: ${error.message}`);
  }

  // b) Broken name count report
  let brokenCount = 0;
  const brokenSamples = [];

  if (Array.isArray(data)) {
    for (const row of data) {
      const name = row && row.name;
      if (!isValidName(name)) {
        brokenCount += 1;
        if (brokenSamples.length < 20) {
          brokenSamples.push({
            wr_id: row && row.wr_id,
            name,
            gender: row && row.gender,
          });
        }
      }
    }
  }

  // c) stdout encoding validation (Windows-aware)
  // Node.js on Windows does not expose writableEncoding directly.
  // Strategy: check Console OutputEncoding via PowerShell, fallback to chcp check.
  let stdoutEncoding = "unknown";
  let isUtf8 = false;

  try {
    // Node streams on Windows: check if stdout is using utf8 internally
    const enc =
      (process.stdout && process.stdout.writableEncoding) ||
      (process.stdout?._writableState?.defaultEncoding) ||
      null;

    if (enc) {
      stdoutEncoding = enc;
      isUtf8 = enc.toLowerCase() === "utf8" || enc.toLowerCase() === "utf-8";
    } else {
      // Windows fallback: read active code page via CHCP
      const { execSync } = require("child_process");
      const chcpOut = execSync("chcp", { encoding: "utf8" }).trim();
      // "Active code page: 65001" or "활성 코드 페이지: 65001"
      const cpMatch = chcpOut.match(/:\s*(\d+)/);
      const codePage = cpMatch ? cpMatch[1] : "unknown";
      stdoutEncoding = `chcp:${codePage}`;
      // 65001 = UTF-8
      isUtf8 = codePage === "65001";
    }
  } catch (e) {
    stdoutEncoding = `detection-error: ${e.message}`;
  }

  if (!isUtf8) {
    failures.push(`stdout is not UTF-8 (detected: ${stdoutEncoding}). Run: chcp 65001`);
  }

  // Report
  console.log("[verify:env] Encoding verification report");
  console.log(`- metadata_path: ${METADATA_PATH}`);
  console.log(`- json_parse_ok: ${Array.isArray(data)}`);
  console.log(`- broken_name_count: ${brokenCount}`);
  console.log(`- stdout_encoding: ${stdoutEncoding}`);

  if (brokenSamples.length > 0) {
    console.log("- broken_name_samples (max 20):");
    for (const sample of brokenSamples) {
      console.log(`  - wr_id=${sample.wr_id}, name=${sample.name}, gender=${sample.gender}`);
    }
  }

  if (brokenCount > 0) {
    failures.push(`Broken names detected: ${brokenCount}`);
  }

  if (failures.length > 0) {
    console.error("[verify:env] FAILED");
    for (const f of failures) {
      console.error(`- ${f}`);
    }
    process.exit(1);
  }

  console.log("[verify:env] PASS");
}

main();
