const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const SOURCE_PATH = path.join(ROOT, "scripts", "player_metadata.json");
const CONFLICT_JSON_PATH = path.join(ROOT, "tmp", "metadata_gender_conflicts.json");
const OUT_JSON = path.join(ROOT, "tmp", "metadata_conflict_resolution_proposal.json");
const OUT_CSV = path.join(ROOT, "tmp", "metadata_conflict_resolution_proposal.csv");

// Live-verified historical roster mapping snapshot (2026-03-20)
const VERIFIED_HISTORICAL_ROSTER = {
  "671:female": "쌍디",
  "150:male": "인치호",
  "100:male": "전흥식",
  "207:male": "김성제",
  "208:male": "서기수",
  "223:female": "애공",
  "57:female": "슬아",
  "668:female": "슈슈",
  "846:female": "예실",
  "627:female": "연블비",
  "927:female": "다라츄",
  "953:female": "아링",
  "424:female": "정연이",
  "981:female": "지아송",
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function csvEscape(v) {
  const s = String(v ?? "");
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function keyOf(wrId, gender) {
  return `${wrId}:${gender}`;
}

function main() {
  if (!fs.existsSync(SOURCE_PATH)) throw new Error(`Missing file: ${SOURCE_PATH}`);
  if (!fs.existsSync(CONFLICT_JSON_PATH)) throw new Error(`Missing file: ${CONFLICT_JSON_PATH}`);

  const source = readJson(SOURCE_PATH);
  const conflictData = readJson(CONFLICT_JSON_PATH);
  const conflicts = Array.isArray(conflictData.conflicts) ? conflictData.conflicts : [];

  const proposals = [];

  for (const c of conflicts) {
    const wrId = Number(c.wr_id);
    const rows = (source || []).filter((r) => Number(r.wr_id) === wrId);
    const names = [...new Set(rows.map((r) => String(r.name || "")))].filter(Boolean);
    const genders = [...new Set(rows.map((r) => String(r.gender || "")))].filter(Boolean);

    // Default policy: keep both gender rows for same wr_id unless verified roster says otherwise.
    const rowActions = rows.map((r) => ({
      wr_id: r.wr_id,
      gender: r.gender,
      name: r.name,
      action: "keep",
      reason: "default_policy_keep_composite_key",
    }));

    // If same name appears on both genders and the verified mapping provides exact side, drop the opposite side.
    const sameNameBothGenders = names.length === 1 && genders.length > 1;
    if (sameNameBothGenders) {
      const preferredKey = Object.keys(VERIFIED_HISTORICAL_ROSTER).find((k) => k.startsWith(`${wrId}:`));
      if (preferredKey) {
        for (const item of rowActions) {
          const isPreferred = keyOf(item.wr_id, item.gender) === preferredKey;
          item.action = isPreferred ? "keep" : "drop";
          item.reason = isPreferred
            ? "verified_nzu_roster_match"
            : "drop_non_verified_gender_duplicate_same_name";
        }
      } else {
        for (const item of rowActions) {
          item.action = "manual_review";
          item.reason = "same_name_cross_gender_without_verified_preference";
        }
      }
    } else {
      // Different names across genders are likely independent identities (men/women board id overlap).
      for (const item of rowActions) {
        item.action = "keep";
        item.reason = "different_names_cross_gender_likely_distinct_identities";
      }
    }

    proposals.push({
      wr_id: wrId,
      names,
      genders,
      recommendation_summary: rowActions.map((r) => `${r.gender}:${r.name}:${r.action}`).join(", "),
      rows: rowActions,
    });
  }

  proposals.sort((a, b) => a.wr_id - b.wr_id);

  const jsonOut = {
    generated_at: new Date().toISOString(),
    source_path: SOURCE_PATH,
    conflict_source_path: CONFLICT_JSON_PATH,
    proposal_count: proposals.length,
    proposals,
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(jsonOut, null, 2), "utf8");

  const csvRows = [
    ["wr_id", "gender", "name", "action", "reason"].join(","),
  ];
  for (const p of proposals) {
    for (const r of p.rows) {
      csvRows.push(
        [p.wr_id, r.gender, r.name, r.action, r.reason].map(csvEscape).join(",")
      );
    }
  }
  fs.writeFileSync(OUT_CSV, "\uFEFF" + csvRows.join("\n"), "utf8");

  console.log(`json: ${OUT_JSON}`);
  console.log(`csv: ${OUT_CSV}`);
  console.log(`proposals: ${proposals.length}`);
}

main();
