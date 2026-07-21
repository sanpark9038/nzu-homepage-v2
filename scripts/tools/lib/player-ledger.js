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

module.exports = {
  LEDGER_PATH,
  loadOpponentIdentityDecisions,
  loadOpponentIdentityAliases,
};
