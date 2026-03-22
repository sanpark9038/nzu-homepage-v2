const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env.local") });

const KST_TZ = "Asia/Seoul";
const WORKFLOW_FILE = "ops-pipeline.yml";

function argValue(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  if (i >= 0 && process.argv[i + 1]) return String(process.argv[i + 1]);
  return fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function nowKstParts() {
  const d = new Date();
  return toKstParts(d);
}

function toKstParts(d) {
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

async function githubJson(url, token) {
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`github_api_failed ${res.status} ${body}`);
  }
  return res.json();
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

async function main() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
  const repo = process.env.GITHUB_REPOSITORY || "";
  if (!token) throw new Error("Missing GITHUB_TOKEN");
  if (!repo || !repo.includes("/")) throw new Error("Missing GITHUB_REPOSITORY");
  const [owner, name] = repo.split("/", 2);

  const now = nowKstParts();
  const expectedDate = argValue("--expected-date", now.date);
  const minTime = argValue("--min-time", "06:10");
  const alertOnly = hasFlag("--alert-only");
  const notifyOk = hasFlag("--notify-ok");
  const noDiscord = hasFlag("--no-discord");

  const url = `https://api.github.com/repos/${owner}/${name}/actions/workflows/${WORKFLOW_FILE}/runs?per_page=20`;
  const data = await githubJson(url, token);
  const runs = Array.isArray(data.workflow_runs) ? data.workflow_runs : [];

  const expectedMin = hhmmToMinutes(minTime);
  const todayRuns = runs
    .map((r) => {
      const created = new Date(r.created_at);
      const k = Number.isFinite(created.getTime()) ? toKstParts(created) : null;
      return { raw: r, kst: k };
    })
    .filter((r) => r.kst && r.kst.date === expectedDate && r.raw.event === "schedule")
    .sort((a, b) => new Date(b.raw.created_at).getTime() - new Date(a.raw.created_at).getTime());

  const summary = {
    now_kst: `${now.date} ${now.time}`,
    expected_date: expectedDate,
    min_time: minTime,
    ok: false,
    reason: "",
    workflow_file: WORKFLOW_FILE,
    run_count_today: todayRuns.length,
    latest_run_url: null,
    latest_created_at: null,
    latest_status: null,
    latest_conclusion: null,
  };

  if (!todayRuns.length) {
    summary.reason = "missing_scheduled_run_today";
  } else {
    const latest = todayRuns[0];
    const createdMin = hhmmToMinutes(latest.kst.time);
    summary.latest_run_url = latest.raw.html_url || null;
    summary.latest_created_at = latest.raw.created_at || null;
    summary.latest_status = latest.raw.status || null;
    summary.latest_conclusion = latest.raw.conclusion || null;
    if (createdMin === null || expectedMin === null) {
      summary.reason = "invalid_time_parse";
    } else if (createdMin < expectedMin) {
      summary.reason = `run_started_too_early ${latest.kst.time}`;
    } else if (latest.raw.status !== "completed") {
      summary.reason = `latest_run_not_completed ${latest.raw.status || "unknown"}`;
    } else if (latest.raw.conclusion !== "success") {
      summary.reason = `latest_run_not_success ${latest.raw.conclusion || "unknown"}`;
    } else {
      summary.ok = true;
      summary.reason = "fresh_and_success";
    }
  }

  let discord = { enabled: !noDiscord, sent: false, reason: "disabled" };
  const icon = summary.ok ? "✅" : "⚠️";
  const message =
    `${icon} NZU GitHub Ops Freshness ${summary.ok ? "OK" : "FAIL"}\n` +
    `- now_kst: ${summary.now_kst}\n` +
    `- expected_date: ${summary.expected_date}, min_time: ${summary.min_time}\n` +
    `- run_count_today: ${summary.run_count_today}\n` +
    `- latest_status/conclusion: ${summary.latest_status || "-"} / ${summary.latest_conclusion || "-"}\n` +
    `- reason: ${summary.reason}\n` +
    `- latest_run: ${summary.latest_run_url || "-"}`;

  const shouldNotify = !summary.ok || notifyOk;
  if (!noDiscord && shouldNotify) {
    try {
      discord = { enabled: true, ...(await postDiscord(message)) };
    } catch (e) {
      discord = {
        enabled: true,
        sent: false,
        reason: e instanceof Error ? e.message : String(e),
      };
    }
  }

  console.log(JSON.stringify({ ...summary, discord }, null, 2));
  if (!summary.ok && !alertOnly) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

