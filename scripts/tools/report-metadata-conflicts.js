const fs = require("fs");
const path = require("path");
const { loadProjectPlayerMetadata, PROJECTS_DIR } = require("./lib/project-player-metadata");

const ROOT = path.resolve(__dirname, "..", "..");
const OUT_JSON = path.join(ROOT, "tmp", "metadata_gender_conflicts.json");
const OUT_CSV = path.join(ROOT, "tmp", "metadata_gender_conflicts.csv");

function csvEscape(v) {
  const s = String(v ?? "");
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function main() {
  const rows = loadProjectPlayerMetadata();

  const byWrId = new Map();
  for (const row of rows) {
    if (!row || typeof row.wr_id !== "number") continue;
    if (!byWrId.has(row.wr_id)) byWrId.set(row.wr_id, []);
    byWrId.get(row.wr_id).push(row);
  }

  const conflicts = [];
  const crossGenderOverlaps = [];
  for (const [wrId, list] of byWrId.entries()) {
    const genders = [...new Set(list.map((r) => String(r.gender || "")))].filter(Boolean);
    if (genders.length <= 1) continue;

    const byGender = {};
    for (const g of genders) {
      const names = [...new Set(list.filter((r) => String(r.gender) === g).map((r) => String(r.name || "")))].filter(Boolean);
      byGender[g] = names;
    }

    const overlap = {
      wr_id: wrId,
      genders,
      by_gender: byGender,
      rows: list,
    };

    crossGenderOverlaps.push(overlap);

    const maleNames = new Set(byGender.male || []);
    const femaleNames = new Set(byGender.female || []);
    const sharedNames = [...maleNames].filter((n) => femaleNames.has(n));
    if (sharedNames.length > 0) {
      conflicts.push({
        ...overlap,
        shared_names: sharedNames,
      });
    }
  }

  conflicts.sort((a, b) => a.wr_id - b.wr_id);
  crossGenderOverlaps.sort((a, b) => a.wr_id - b.wr_id);

  const jsonOut = {
    generated_at: new Date().toISOString(),
    source_path: PROJECTS_DIR,
    cross_gender_overlap_count: crossGenderOverlaps.length,
    conflict_count: conflicts.length,
    cross_gender_overlaps: crossGenderOverlaps,
    conflicts,
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(jsonOut, null, 2), "utf8");

  const csvLines = [];
  csvLines.push(["wr_id", "genders", "male_names", "female_names", "rows_count"].join(","));
  for (const c of crossGenderOverlaps) {
    csvLines.push(
      [
        c.wr_id,
        c.genders.join("|"),
        (c.by_gender.male || []).join("|"),
        (c.by_gender.female || []).join("|"),
        c.rows.length,
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  fs.writeFileSync(OUT_CSV, "\uFEFF" + csvLines.join("\n"), "utf8");

  console.log(`source: ${PROJECTS_DIR}`);
  console.log(`conflicts: ${conflicts.length}`);
  console.log(`json: ${OUT_JSON}`);
  console.log(`csv: ${OUT_CSV}`);
}

main();
