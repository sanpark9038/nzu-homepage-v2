const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const LEDGER_PATH = path.join(ROOT, "data", "metadata", "player_ledger.v1.json");

function readJson(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^﻿/, ""));
  } catch {
    return null;
  }
}

// The unified 선수 대장 (docs/PIPELINE_REDEFINITION.md §3·§5) is the single source for
// opponent-identity exceptions. These loaders return the exact shapes the pipeline readers
// used to get from the now-absorbed opponent_identity_review_decisions / opponent_identity_aliases
// files, so downstream logic is unchanged.
//
// sourcePath override: tests inject legacy-shaped fixtures ({decisions:[...]} / {aliases:[...]}).
// ponytail: dual-shape read (ledger + legacy) is a transitional affordance so fixtures need no
// rewrite; drop the legacy branch once no caller passes a legacy file.
function loadOpponentIdentityDecisions(sourcePath = LEDGER_PATH) {
  const doc = readJson(sourcePath);
  const section = doc && doc.opponent_identity_decisions ? doc.opponent_identity_decisions : doc;
  return {
    allowed_decisions: (section && section.allowed_decisions) || [],
    policy: (section && section.policy) || {},
    decisions: section && Array.isArray(section.decisions) ? section.decisions : [],
  };
}

function loadOpponentIdentityAliases(sourcePath = LEDGER_PATH) {
  const doc = readJson(sourcePath);
  if (doc && Array.isArray(doc.opponent_identity_aliases)) {
    return { aliases: doc.opponent_identity_aliases };
  }
  return { aliases: doc && Array.isArray(doc.aliases) ? doc.aliases : [] };
}

// 선수(entity_id)당 한 줄. 지금은 표시명(방송명)과 다른 표기만 담고,
// 이후 숲 ID·로스터 교정·수집 제외가 같은 행으로 합쳐진다.
function loadPlayerRows(sourcePath = LEDGER_PATH) {
  const doc = readJson(sourcePath);
  return doc && doc.players && typeof doc.players === "object" ? doc.players : {};
}

// entity_id -> 표시명. 이름이 아니라 번호로 묶으므로 엘로보드가 이름을 본명으로
// 바꾸거나 선수가 팀을 옮겨도 방송명이 날아가지 않는다.
function loadPlayerDisplayNames(sourcePath = LEDGER_PATH) {
  const map = new Map();
  for (const [entityId, row] of Object.entries(loadPlayerRows(sourcePath))) {
    const displayName = String((row && row.display_name) || "").trim();
    const key = String(entityId || "").trim();
    if (key && displayName) map.set(key, displayName);
  }
  return map;
}

module.exports = {
  LEDGER_PATH,
  loadOpponentIdentityDecisions,
  loadOpponentIdentityAliases,
  loadPlayerRows,
  loadPlayerDisplayNames,
};
