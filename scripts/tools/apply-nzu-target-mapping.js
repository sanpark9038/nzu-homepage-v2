const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const METADATA_PATH = path.join(ROOT, "scripts", "player_metadata.json");

const TARGET_MAPPINGS = [
  { wr_id: 671, gender: "female", name: "쌍디" },
  { wr_id: 150, gender: "male", name: "인치호" },
  { wr_id: 100, gender: "male", name: "전흥식" },
  { wr_id: 207, gender: "male", name: "김성제" },
  { wr_id: 208, gender: "male", name: "서기수" },
  { wr_id: 223, gender: "female", name: "애공" },
  { wr_id: 57, gender: "female", name: "슬아" },
  { wr_id: 668, gender: "female", name: "슈슈" },
  { wr_id: 846, gender: "female", name: "예실" },
  { wr_id: 627, gender: "female", name: "연블비" },
  { wr_id: 927, gender: "female", name: "다라츄" },
  { wr_id: 424, gender: "female", name: "정연이" },
  { wr_id: 981, gender: "female", name: "지아송" },
  { wr_id: 953, gender: "female", name: "아링" },
];

function keyOf(row) {
  return `${row.wr_id}:${row.gender}`;
}

function main() {
  if (!fs.existsSync(METADATA_PATH)) {
    throw new Error(`Missing file: ${METADATA_PATH}`);
  }

  const raw = fs.readFileSync(METADATA_PATH, "utf8");
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) {
    throw new Error("scripts/player_metadata.json must be an array");
  }

  const next = [...data];
  let inserted = 0;
  let updated = 0;

  for (const t of TARGET_MAPPINGS) {
    const idx = next.findIndex((row) => keyOf(row) === keyOf(t));
    if (idx === -1) {
      next.push({ wr_id: t.wr_id, gender: t.gender, name: t.name });
      inserted += 1;
      continue;
    }

    if (next[idx].name !== t.name) {
      next[idx] = { ...next[idx], name: t.name };
      updated += 1;
    }
  }

  next.sort((a, b) => {
    const wrDiff = Number(a.wr_id) - Number(b.wr_id);
    if (wrDiff !== 0) return wrDiff;
    return String(a.gender).localeCompare(String(b.gender));
  });

  fs.writeFileSync(METADATA_PATH, JSON.stringify(next, null, 2), "utf8");

  console.log(`Updated ${METADATA_PATH}`);
  console.log(`- inserted: ${inserted}`);
  console.log(`- updated: ${updated}`);
  console.log(`- total rows: ${next.length}`);
}

main();
