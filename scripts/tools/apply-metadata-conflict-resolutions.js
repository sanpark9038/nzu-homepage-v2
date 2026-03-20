const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const SOURCE_PATH = path.join(ROOT, "scripts", "player_metadata.json");
const PROPOSAL_PATH = path.join(ROOT, "tmp", "metadata_conflict_resolution_proposal.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function keyOf(row) {
  return `${row.wr_id}:${row.gender}:${row.name}`;
}

function main() {
  const write = process.argv.includes("--write");

  if (!fs.existsSync(SOURCE_PATH)) throw new Error(`Missing source: ${SOURCE_PATH}`);
  if (!fs.existsSync(PROPOSAL_PATH)) throw new Error(`Missing proposal: ${PROPOSAL_PATH}`);

  const source = readJson(SOURCE_PATH);
  const proposal = readJson(PROPOSAL_PATH);
  const proposals = Array.isArray(proposal.proposals) ? proposal.proposals : [];

  const toDrop = new Set();
  for (const p of proposals) {
    for (const row of p.rows || []) {
      if (row.action === "drop") {
        toDrop.add(`${row.wr_id}:${row.gender}:${row.name}`);
      }
    }
  }

  const kept = [];
  const dropped = [];
  for (const row of source) {
    if (!row || typeof row.wr_id !== "number" || !row.gender || !row.name) {
      kept.push(row);
      continue;
    }
    const key = keyOf(row);
    if (toDrop.has(key)) dropped.push(row);
    else kept.push(row);
  }

  if (!write) {
    console.log(`dry-run`);
    console.log(`source_rows: ${source.length}`);
    console.log(`drop_candidates: ${toDrop.size}`);
    console.log(`dropped_rows: ${dropped.length}`);
    console.log(`result_rows: ${kept.length}`);
    return;
  }

  const backupPath = `${SOURCE_PATH}.bak.${Date.now()}`;
  fs.copyFileSync(SOURCE_PATH, backupPath);
  fs.writeFileSync(SOURCE_PATH, JSON.stringify(kept, null, 2), "utf8");

  console.log(`applied: ${SOURCE_PATH}`);
  console.log(`backup: ${backupPath}`);
  console.log(`source_rows: ${source.length}`);
  console.log(`dropped_rows: ${dropped.length}`);
  console.log(`result_rows: ${kept.length}`);
}

main();
