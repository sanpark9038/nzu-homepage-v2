const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env.local") });

const ROOT = path.resolve(__dirname, "..", "..");
const LATEST_JSON = path.join(ROOT, "tmp", "reports", "ops_pipeline_latest.json");
const KST_TZ = "Asia/Seoul";

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
  const now = nowKstParts();
  const expectedDate = argValue("--expected-date", now.date);
  const minTime = argValue("--min-time", "06:10");
  const alertOnly = hasFlag("--alert-only");
  const notifyOk = hasFlag("--notify-ok");
  const noDiscord = hasFlag("--no-discord");

  const summary = {
    now_kst: `${now.date} ${now.time}`,
    expected_date: expectedDate,
    min_time: minTime,
    ok: false,
    reason: "",
    latest_path: path.relative(ROOT, LATEST_JSON).replace(/\\/g, "/"),
    latest_generated_at: null,
    latest_status: null,
  };

  if (!fs.existsSync(LATEST_JSON)) {
    summary.reason = "missing_latest_report";
  } else {
    const latest = readJson(LATEST_JSON);
    summary.latest_generated_at = latest.generated_at || null;
    summary.latest_status = latest.status || null;
    const generated = toKstDateTimeParts(latest.generated_at);
    if (!generated) {
      summary.reason = "invalid_generated_at";
    } else {
      const generatedMin = hhmmToMinutes(generated.time);
      const thresholdMin = hhmmToMinutes(minTime);
      if (generated.date !== expectedDate) {
        summary.reason = `stale_date ${generated.date}`;
      } else if (generatedMin === null || thresholdMin === null) {
        summary.reason = "invalid_time_parse";
      } else if (generatedMin < thresholdMin) {
        summary.reason = `too_early ${generated.time}`;
      } else if (String(latest.status || "").toLowerCase() !== "pass") {
        summary.reason = `latest_status_${latest.status || "unknown"}`;
      } else {
        summary.ok = true;
        summary.reason = "fresh_and_pass";
      }
    }
  }

  let discord = { enabled: !noDiscord, sent: false, reason: "disabled" };
  const icon = summary.ok ? "✅" : "⚠️";
  const message =
    `${icon} NZU Ops Freshness Check ${summary.ok ? "OK" : "FAIL"}\n` +
    `- now_kst: ${summary.now_kst}\n` +
    `- expected_date: ${summary.expected_date}, min_time: ${summary.min_time}\n` +
    `- latest_generated_at: ${summary.latest_generated_at || "-"}\n` +
    `- latest_status: ${summary.latest_status || "-"}\n` +
    `- reason: ${summary.reason}\n` +
    `- latest_json: ${summary.latest_path}`;

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

  console.log(
    JSON.stringify(
      {
        ...summary,
        discord,
      },
      null,
      2
    )
  );

  if (!summary.ok && !alertOnly) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

