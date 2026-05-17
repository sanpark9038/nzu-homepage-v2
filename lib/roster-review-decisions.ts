import fs from "fs";
import path from "path";

const ROOT = process.cwd();
export const ROSTER_REVIEW_DECISIONS_PATH = path.join(ROOT, "data", "metadata", "roster_review_decisions.v1.json");

export type RosterReviewDecision = {
  entity_id: string;
  name?: string;
  review_kind: string;
  decision: "excluded";
  observed_from?: string;
  observed_to?: string;
  decided_at: string;
  source?: string;
  reason?: string;
};

type DecisionDoc = {
  schema_version: string;
  updated_at: string;
  description: string;
  decisions: RosterReviewDecision[];
};

function readJson<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "")) as T;
  } catch {
    return null;
  }
}

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function clean(value: unknown): string {
  return String(value || "").trim();
}

export function rosterReviewDecisionKey(decision: Pick<RosterReviewDecision, "review_kind" | "entity_id" | "observed_from" | "observed_to">) {
  return [
    clean(decision.review_kind),
    clean(decision.entity_id),
    clean(decision.observed_from),
    clean(decision.observed_to),
  ].join("|");
}

export function readRosterReviewDecisions(filePath = ROSTER_REVIEW_DECISIONS_PATH): RosterReviewDecision[] {
  const doc = readJson<Partial<DecisionDoc>>(filePath);
  return Array.isArray(doc?.decisions) ? doc.decisions : [];
}

export function saveExcludedRosterReviewDecision(
  decision: Omit<RosterReviewDecision, "decision" | "decided_at">,
  filePath = ROSTER_REVIEW_DECISIONS_PATH
) {
  const now = new Date().toISOString();
  const nextDecision: RosterReviewDecision = {
    ...decision,
    entity_id: clean(decision.entity_id),
    name: clean(decision.name),
    review_kind: clean(decision.review_kind),
    observed_from: clean(decision.observed_from),
    observed_to: clean(decision.observed_to),
    source: clean(decision.source) || "admin_ops_review",
    reason: clean(decision.reason) || "operator_excluded",
    decision: "excluded",
    decided_at: now,
  };
  const rows = readRosterReviewDecisions(filePath).filter(
    (row) => rosterReviewDecisionKey(row) !== rosterReviewDecisionKey(nextDecision)
  );
  rows.push(nextDecision);
  const doc: DecisionDoc = {
    schema_version: "1.0.0",
    updated_at: now,
    description: "Operator decisions for roster review items. Excluded items are suppressed from repeated review alerts.",
    decisions: rows,
  };
  writeJson(filePath, doc);
  return nextDecision;
}
