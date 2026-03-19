const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const SOURCE_PATH = path.join(ROOT, "scripts", "player_metadata.json");
const PREVIEW_PATH = path.join(ROOT, "tmp", "player_metadata_canonical_preview.json");
const OUTPUT_PATH = path.join(ROOT, "tmp", "player_metadata.cleaned.json");

function readJsonUtf8(filePath) {
  const raw = fs.readFileSync(filePath);
  return JSON.parse(Buffer.from(raw).toString("utf8"));
}

function writeJsonUtf8(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function main() {
  if (!fs.existsSync(SOURCE_PATH)) throw new Error(`Missing source: ${SOURCE_PATH}`);
  if (!fs.existsSync(PREVIEW_PATH)) throw new Error(`Missing preview: ${PREVIEW_PATH}`);

  const writeToSource = process.argv.includes("--write");
  const preview = readJsonUtf8(PREVIEW_PATH);

  if (!Array.isArray(preview)) throw new Error("Canonical preview must be an array");

  const dedup = [];
  const seen = new Set();

  for (const row of preview) {
    if (!row || typeof row.wr_id !== "number") continue;
    if (seen.has(row.wr_id)) continue;
    seen.add(row.wr_id);
    dedup.push({
      wr_id: row.wr_id,
      name: row.name,
      gender: row.gender,
    });
  }

  dedup.sort((a, b) => a.wr_id - b.wr_id);

  if (writeToSource) {
    const backupPath = `${SOURCE_PATH}.bak.${Date.now()}`;
    fs.copyFileSync(SOURCE_PATH, backupPath);
    writeJsonUtf8(SOURCE_PATH, dedup);
    console.log(`Applied canonical metadata to source.`);
    console.log(`- Backup: ${backupPath}`);
    console.log(`- Updated: ${SOURCE_PATH}`);
  } else {
    writeJsonUtf8(OUTPUT_PATH, dedup);
    console.log(`Dry-run output written.`);
    console.log(`- Output: ${OUTPUT_PATH}`);
    console.log(`- Rows: ${dedup.length}`);
    console.log(`- To apply to source, run with: --write`);
  }
}

main();
