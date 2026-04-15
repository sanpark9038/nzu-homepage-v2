const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env.local") });

const ROOT = path.resolve(__dirname, "..", "..");
const LOCAL_LATEST_JSON = path.join(ROOT, "tmp", "reports", "ops_pipeline_latest.json");
const KST_TZ = "Asia/Seoul";
const DEFAULT_SOURCE = "github-actions";
const DEFAULT_GITHUB_REPO = "sanpark9038/nzu-homepage-v2";
const DEFAULT_GITHUB_WORKFLOW = ".github/workflows/ops-pipeline-cache.yml";
const DISCORD_SUMMARY_STEP_NAME = "Send Discord summary";

function argValue(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  if (i >= 0 && process.argv[i + 1]) return String(process.argv[i + 1]);
  return fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function nowKstParts() {
  return toKstDateTimeParts(new Date().toISOString());
}

function toKstDateTimeParts(iso) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KST_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value || "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}:${get("second")}`,
  };
}

function hhmmToMinutes(text) {
  const m = String(text || "").match(/^(\d{2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function githubHeaders() {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token =
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    "";
  if (String(token).trim()) {
    headers.Authorization = `Bearer ${String(token).trim()}`;
  }
  return headers;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: githubHeaders() });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`github_api_failed ${res.status} ${body}`.trim());
  }
  return res.json();
}

async function inspectLatestGithubRun({ repo, workflow }) {
  const runsUrl = `https://api.github.com/repos/${repo}/actions/workflows/${encodeURIComponent(workflow)}/runs?per_page=1`;
  const runsDoc = await fetchJson(runsUrl);
  const run = Array.isArray(runsDoc && runsDoc.workflow_runs) ? runsDoc.workflow_runs[0] : null;
  if (!run) {
    return {
      latest_path: workflow,
      latest_run_url: null,
      latest_generated_at: null,
      latest_status: null,
      latest_conclusion: null,
      latest_discord_summary_step: null,
      latest_discord_summary_step_status: null,
      reason: "missing_runs",
      ok: false,
    };
  }

  const jobsUrl = String(run.jobs_url || "").trim();
  let discordStep = null;
  if (jobsUrl) {
    const jobsDoc = await fetchJson(jobsUrl);
    const jobs = Array.isArray(jobsDoc && jobsDoc.jobs) ? jobsDoc.jobs : [];
    for (const job of jobs) {
      const steps = Array.isArray(job && job.steps) ? job.steps : [];
      discordStep = steps.find((step) => String(step && step.name ? step.name : "").trim() === DISCORD_SUMMARY_STEP_NAME);
      if (discordStep) break;
    }
  }

  return {
    latest_path: workflow,
    latest_run_url: String(run.html_url || "").trim() || null,
    latest_generated_at: run.updated_at || run.run_started_at || run.created_at || null,
    latest_status: run.status || null,
    latest_conclusion: run.conclusion || null,
    latest_discord_summary_step: DISCORD_SUMMARY_STEP_NAME,
    latest_discord_summary_step_status: discordStep ? discordStep.conclusion || discordStep.status || null : null,
    reason: "",
    ok: false,
  };
}

function inspectLocalLatest() {
  const summary = {
    latest_path: path.relative(ROOT, LOCAL_LATEST_JSON).replace(/\\/g, "/"),
    latest_run_url: null,
    latest_generated_at: null,
    latest_status: null,
    latest_conclusion: null,
    latest_discord_summary_step: null,
    latest_discord_summary_step_status: null,
    reason: "",
    ok: false,
  };

  if (!fs.existsSync(LOCAL_LATEST_JSON)) {
    summary.reason = "missing_latest_report";
    return summary;
  }

  const latest = readJson(LOCAL_LATEST_JSON);
  summary.latest_generated_at = latest.generated_at || null;
  summary.latest_status = latest.status || null;
  summary.latest_conclusion = latest.status || null;
  return summary;
}

function evaluateSummary(summary, expectedDate, minTime) {
  if (!summary.latest_generated_at) {
    return { ...summary, ok: false, reason: summary.reason || "missing_generated_at" };
  }

  const generated = toKstDateTimeParts(summary.latest_generated_at);
  if (!generated) {
    return { ...summary, ok: false, reason: "invalid_generated_at" };
  }

  const generatedMin = hhmmToMinutes(generated.time);
  const thresholdMin = hhmmToMinutes(minTime);
  if (generated.date !== expectedDate) {
    return { ...summary, ok: false, reason: `stale_date ${generated.date}` };
  }
  if (generatedMin === null || thresholdMin === null) {
    return { ...summary, ok: false, reason: "invalid_time_parse" };
  }
  if (generatedMin < thresholdMin) {
    return { ...summary, ok: false, reason: `too_early ${generated.time}` };
  }

  const status = String(summary.latest_status || "").toLowerCase();
  const conclusion = String(summary.latest_conclusion || "").toLowerCase();
  if (status && status !== "completed" && status !== "pass") {
    return { ...summary, ok: false, reason: `latest_status_${summary.latest_status}` };
  }
  if (conclusion && conclusion !== "success" && conclusion !== "pass") {
    return { ...summary, ok: false, reason: `latest_conclusion_${summary.latest_conclusion}` };
  }

  const discordStepStatus = String(summary.latest_discord_summary_step_status || "").toLowerCase();
  if (summary.latest_discord_summary_step && discordStepStatus && discordStepStatus !== "success") {
    return { ...summary, ok: false, reason: `discord_step_${summary.latest_discord_summary_step_status}` };
  }

  return { ...summary, ok: true, reason: "fresh_and_pass" };
}

async function buildSummary({ source, expectedDate, minTime, repo, workflow }) {
  if (source === "local") {
    return evaluateSummary(inspectLocalLatest(), expectedDate, minTime);
  }

  const remote = await inspectLatestGithubRun({ repo, workflow });
  return evaluateSummary(remote, expectedDate, minTime);
}

async function postDiscord(message) {
  const webhook =
    process.env.OPS_DISCORD_WEBHOOK_URL ||
    process.env.DISCORD_WEBHOOK_URL ||
    "";
  if (!String(webhook).trim()) return { sent: false, reason: "missing_webhook" };
  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: message }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`webhook_failed ${res.status} ${body}`);
  }
  return { sent: true };
}

function buildDiscordMessage(summary, meta) {
  const icon = summary.ok ? "✅" : "⚠️";
  const lines = [
    `${icon} HOSAGA Ops Freshness Check ${summary.ok ? "OK" : "FAIL"}`,
    `- source: ${meta.source}`,
    `- now_kst: ${meta.now_kst}`,
    `- expected_date: ${meta.expected_date}, min_time: ${meta.min_time}`,
    `- latest_generated_at: ${summary.latest_generated_at || "-"}`,
    `- latest_status: ${summary.latest_status || "-"}`,
  ];
  if (summary.latest_conclusion) {
    lines.push(`- latest_conclusion: ${summary.latest_conclusion}`);
  }
  if (summary.latest_discord_summary_step) {
    lines.push(
      `- discord_step: ${summary.latest_discord_summary_step_status || "missing"} (${summary.latest_discord_summary_step})`
    );
  }
  lines.push(`- reason: ${summary.reason}`);
  lines.push(`- latest_path: ${summary.latest_path}`);
  if (summary.latest_run_url) {
    lines.push(`- latest_run_url: ${summary.latest_run_url}`);
  }
  return lines.join("\n");
}

async function main() {
  const now = nowKstParts();
  const source = String(argValue("--source", DEFAULT_SOURCE)).trim().toLowerCase();
  const expectedDate = argValue("--expected-date", now.date);
  const minTime = argValue("--min-time", "06:10");
  const repo = String(argValue("--github-repo", DEFAULT_GITHUB_REPO)).trim();
  const workflow = String(argValue("--github-workflow", DEFAULT_GITHUB_WORKFLOW)).trim();
  const alertOnly = hasFlag("--alert-only");
  const notifyOk = hasFlag("--notify-ok");
  const noDiscord = hasFlag("--no-discord");

  const summary = await buildSummary({ source, expectedDate, minTime, repo, workflow });
  const payload = {
    now_kst: `${now.date} ${now.time}`,
    expected_date: expectedDate,
    min_time: minTime,
    source,
    github_repo: source === "github-actions" ? repo : null,
    github_workflow: source === "github-actions" ? workflow : null,
    ok: summary.ok,
    reason: summary.reason,
    latest_path: summary.latest_path,
    latest_generated_at: summary.latest_generated_at,
    latest_status: summary.latest_status,
    latest_conclusion: summary.latest_conclusion,
    latest_run_url: summary.latest_run_url,
    latest_discord_summary_step: summary.latest_discord_summary_step,
    latest_discord_summary_step_status: summary.latest_discord_summary_step_status,
  };

  let discord = { enabled: !noDiscord, sent: false, reason: "disabled" };
  const shouldNotify = !summary.ok || notifyOk;
  if (!noDiscord && shouldNotify) {
    try {
      discord = {
        enabled: true,
        ...(await postDiscord(buildDiscordMessage(summary, {
          source,
          now_kst: payload.now_kst,
          expected_date: expectedDate,
          min_time: minTime,
        }))),
      };
    } catch (e) {
      discord = {
        enabled: true,
        sent: false,
        reason: e instanceof Error ? e.message : String(e),
      };
    }
  }

  console.log(JSON.stringify({ ...payload, discord }, null, 2));

  if (!summary.ok && !alertOnly) process.exit(1);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}

module.exports = {
  buildSummary,
  buildDiscordMessage,
  evaluateSummary,
  inspectLocalLatest,
  inspectLatestGithubRun,
  nowKstParts,
  toKstDateTimeParts,
};
