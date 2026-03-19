const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const SOURCE_PATH = path.join(ROOT, "scripts", "player_metadata.json");
const REPORT_PATH = path.join(ROOT, "tmp", "player_metadata_integrity_report.json");
const PREVIEW_PATH = path.join(ROOT, "tmp", "player_metadata_canonical_preview.json");

function readJsonUtf8(filePath) {
  const raw = fs.readFileSync(filePath);
  return JSON.parse(Buffer.from(raw).toString("utf8"));
}

function isSuspiciousName(name) {
  if (typeof name !== "string" || !name.trim()) return true;
  if (name.includes("\uFFFD")) return true; // replacement char
  if (/[?占繹�]/u.test(name)) return true;
  return false;
}

function scoreNameQuality(name) {
  if (typeof name !== "string") return -100;
  let score = 0;

  if (!isSuspiciousName(name)) score += 100;
  if (/^[가-힣A-Za-z0-9\s._\-()]+$/u.test(name)) score += 30;
  if (/[가-힣]/u.test(name)) score += 40;
  if (/[A-Za-z]/.test(name)) score += 5;
  if (/\uFFFD/.test(name)) score -= 120;
  if (/[?占繹�]/u.test(name)) score -= 50;

  score -= Math.max(0, name.length - 10);
  return score;
}

function main() {
  if (!fs.existsSync(SOURCE_PATH)) {
    throw new Error(`Missing source file: ${SOURCE_PATH}`);
  }

  const items = readJsonUtf8(SOURCE_PATH);
  if (!Array.isArray(items)) {
    throw new Error("player_metadata.json must be an array");
  }

  const byWrId = new Map();
  const byName = new Map();
  const invalidRows = [];

  items.forEach((row, idx) => {
    if (
      !row ||
      typeof row.wr_id !== "number" ||
      !Number.isFinite(row.wr_id) ||
      typeof row.name !== "string" ||
      typeof row.gender !== "string"
    ) {
      invalidRows.push({ index: idx, row });
      return;
    }

    if (!byWrId.has(row.wr_id)) byWrId.set(row.wr_id, []);
    byWrId.get(row.wr_id).push({ ...row, __index: idx });

    if (!byName.has(row.name)) byName.set(row.name, []);
    byName.get(row.name).push({ ...row, __index: idx });
  });

  const duplicateWrIds = [];
  const wrIdGenderConflicts = [];
  const wrIdNameConflicts = [];
  const suspiciousEntries = [];
  const canonicalPreview = [];

  for (const [wrId, rows] of byWrId.entries()) {
    if (rows.length > 1) {
      duplicateWrIds.push({
        wr_id: wrId,
        count: rows.length,
        entries: rows.map((r) => ({ name: r.name, gender: r.gender, index: r.__index })),
      });
    }

    const genders = [...new Set(rows.map((r) => r.gender))];
    if (genders.length > 1) {
      wrIdGenderConflicts.push({
        wr_id: wrId,
        genders,
        entries: rows.map((r) => ({ name: r.name, gender: r.gender, index: r.__index })),
      });
    }

    const names = [...new Set(rows.map((r) => r.name))];
    if (names.length > 1) {
      wrIdNameConflicts.push({
        wr_id: wrId,
        names,
        entries: rows.map((r) => ({ name: r.name, gender: r.gender, index: r.__index })),
      });
    }

    rows.forEach((r) => {
      if (isSuspiciousName(r.name)) {
        suspiciousEntries.push({
          wr_id: wrId,
          name: r.name,
          gender: r.gender,
          index: r.__index,
        });
      }
    });

    const chosen = [...rows]
      .sort((a, b) => {
        const scoreDiff = scoreNameQuality(b.name) - scoreNameQuality(a.name);
        if (scoreDiff !== 0) return scoreDiff;
        const idxDiff = a.__index - b.__index;
        return idxDiff;
      })[0];

    canonicalPreview.push({
      wr_id: wrId,
      name: chosen.name,
      gender: chosen.gender,
    });
  }

  canonicalPreview.sort((a, b) => a.wr_id - b.wr_id);

  const nameToWrIdConflicts = [];
  for (const [name, rows] of byName.entries()) {
    const wrIds = [...new Set(rows.map((r) => r.wr_id))];
    if (wrIds.length > 1) {
      nameToWrIdConflicts.push({
        name,
        wr_ids: wrIds,
        entries: rows.map((r) => ({ wr_id: r.wr_id, gender: r.gender, index: r.__index })),
      });
    }
  }

  const report = {
    source_path: SOURCE_PATH,
    generated_at: new Date().toISOString(),
    totals: {
      rows: items.length,
      unique_wr_ids: byWrId.size,
      duplicate_wr_id_count: duplicateWrIds.length,
      suspicious_name_count: suspiciousEntries.length,
      invalid_row_count: invalidRows.length,
      wr_id_gender_conflict_count: wrIdGenderConflicts.length,
      wr_id_name_conflict_count: wrIdNameConflicts.length,
      name_to_wr_id_conflict_count: nameToWrIdConflicts.length,
      canonical_preview_count: canonicalPreview.length,
    },
    invalid_rows: invalidRows,
    duplicate_wr_ids: duplicateWrIds,
    wr_id_gender_conflicts: wrIdGenderConflicts,
    wr_id_name_conflicts: wrIdNameConflicts,
    name_to_wr_id_conflicts: nameToWrIdConflicts,
    suspicious_entries: suspiciousEntries,
    recommendations: [
      "Use canonical preview to deduplicate by wr_id before sync.",
      "Manually verify wr_id rows with gender conflicts.",
      "Drop mojibake/suspicious name variants once canonical names are confirmed.",
      "Block future inserts when name quality score is suspicious unless explicitly approved.",
    ],
  };

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(PREVIEW_PATH, JSON.stringify(canonicalPreview, null, 2), "utf8");

  console.log("Integrity check complete.");
  console.log(`- Source: ${SOURCE_PATH}`);
  console.log(`- Report: ${REPORT_PATH}`);
  console.log(`- Canonical preview: ${PREVIEW_PATH}`);
  console.log(`- Rows: ${report.totals.rows}`);
  console.log(`- Unique wr_id: ${report.totals.unique_wr_ids}`);
  console.log(`- Duplicate wr_id groups: ${report.totals.duplicate_wr_id_count}`);
  console.log(`- Suspicious names: ${report.totals.suspicious_name_count}`);
  console.log(`- wr_id gender conflicts: ${report.totals.wr_id_gender_conflict_count}`);
}

main();
