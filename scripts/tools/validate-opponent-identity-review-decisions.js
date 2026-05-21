const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_QUEUE_PATH = path.join(
  ROOT,
  "tmp",
  "reports",
  "player_history_opponent_identity_review_queue_latest.json"
);
const DEFAULT_DECISIONS_PATH = path.join(ROOT, "data", "metadata", "opponent_identity_review_decisions.v1.json");
const ALLOWED_DECISIONS = ["canonical_candidate", "external_opponent"];

function argValue(argv, flag, fallback = null) {
  const index = argv.indexOf(flag);
  if (index >= 0 && argv[index + 1]) return argv[index + 1];
  return fallback;
}

function hasFlag(argv, flag) {
  return argv.includes(flag);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function trim(value) {
  return String(value || "").trim();
}

function countDecisions(decisions) {
  const totals = {
    decisions: decisions.length,
    canonical_candidate: 0,
    external_opponent: 0,
  };
  for (const row of decisions) {
    if (Object.prototype.hasOwnProperty.call(totals, row.decision)) {
      totals[row.decision] += 1;
    }
  }
  return totals;
}

function buildDecisionTemplateFromQueue(queue, options = {}) {
  const decisions = [];
  const totals = countDecisions(decisions);
  return {
    schema_version: "1.0.0",
    generated_at: options.generatedAt || new Date().toISOString(),
    source_review_queue: options.sourceReviewQueue || DEFAULT_QUEUE_PATH,
    description:
      "Operator-reviewed decisions for unresolved player-history opponent identities. This file is an input for future metadata review only; it does not create roster metadata by itself.",
    allowed_decisions: ALLOWED_DECISIONS,
    policy: {
      canonical_candidate:
        "Use only when the opponent should become canonical/project metadata; provide canonical_name or target_entity_id.",
      external_opponent: "Use when the opponent should remain an external historical opponent.",
      unreviewed: "Leave the opponent out of this file until an operator has made an explicit decision.",
    },
    totals: {
      queue_names: Number(queue && queue.total_names ? queue.total_names : decisions.length),
      queue_rows: Number(queue && queue.total_rows ? queue.total_rows : 0),
      ...totals,
    },
    decisions,
  };
}

function validateDecisionDocument(doc) {
  const errors = [];
  if (!doc || typeof doc !== "object") {
    return { ok: false, errors: ["decision document must be an object"], totals: countDecisions([]) };
  }
  if (trim(doc.schema_version) !== "1.0.0") {
    errors.push("schema_version must be 1.0.0");
  }
  const decisions = Array.isArray(doc.decisions) ? doc.decisions : [];
  if (!Array.isArray(doc.decisions)) {
    errors.push("decisions must be an array");
  }
  const seen = new Set();
  for (const [index, row] of decisions.entries()) {
    const prefix = `decisions[${index}]`;
    const opponentName = trim(row && row.opponent_name);
    const decision = trim(row && row.decision);
    if (!opponentName) {
      errors.push(`${prefix}.opponent_name is required`);
    } else {
      const key = opponentName.toLowerCase();
      if (seen.has(key)) errors.push(`${prefix}.opponent_name duplicate opponent_name: ${opponentName}`);
      seen.add(key);
    }
    if (!ALLOWED_DECISIONS.includes(decision)) {
      errors.push(`${prefix}.decision invalid decision: ${decision || "(blank)"}`);
    }
    if (decision === "canonical_candidate") {
      const canonicalName = trim(row && row.canonical_name);
      const targetEntityId = trim(row && row.target_entity_id);
      if (!canonicalName && !targetEntityId) {
        errors.push(`${prefix}.canonical_candidate requires canonical_name or target_entity_id`);
      }
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    totals: countDecisions(decisions),
  };
}

function writeDecisionTemplate(options = {}) {
  const queuePath = path.resolve(options.queuePath || DEFAULT_QUEUE_PATH);
  const outputPath = path.resolve(options.outputPath || DEFAULT_DECISIONS_PATH);
  const queue = readJson(queuePath);
  const template = buildDecisionTemplateFromQueue(queue, {
    generatedAt: options.generatedAt,
    sourceReviewQueue: path.relative(ROOT, queuePath).replace(/\\/g, "/"),
  });
  writeJson(outputPath, template);
  return { outputPath, template };
}

function main(argv = process.argv.slice(2)) {
  const queuePath = argValue(argv, "--queue", DEFAULT_QUEUE_PATH);
  const outputPath = argValue(argv, "--output", DEFAULT_DECISIONS_PATH);

  if (hasFlag(argv, "--init-from-queue")) {
    const written = writeDecisionTemplate({ queuePath, outputPath });
    console.log("Generated opponent identity review decisions template.");
    console.log(`- output: ${path.relative(ROOT, written.outputPath)}`);
    console.log(`- decisions: ${written.template.decisions.length}`);
    return;
  }

  const doc = readJson(outputPath);
  const result = validateDecisionDocument(doc);
  if (!result.ok) {
    console.error("Opponent identity review decisions validation failed.");
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log("Opponent identity review decisions validation passed.");
  console.log(`- decisions: ${result.totals.decisions}`);
  console.log(`- canonical_candidate: ${result.totals.canonical_candidate}`);
  console.log(`- external_opponent: ${result.totals.external_opponent}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  ALLOWED_DECISIONS,
  DEFAULT_DECISIONS_PATH,
  DEFAULT_QUEUE_PATH,
  buildDecisionTemplateFromQueue,
  validateDecisionDocument,
  writeDecisionTemplate,
};
