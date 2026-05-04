const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env.local"), quiet: true });

const ROOT = path.join(__dirname, "..", "..");
const DEFAULT_FACT_PATH = path.join(ROOT, "data", "warehouse", "fact_matches.csv");
const DEFAULT_OUTPUT_DIR = path.join(ROOT, "tmp", "player-history-artifacts");
const REPORTS_DIR = path.join(ROOT, "tmp", "reports");
const DEFAULT_R2_PREFIX = "player-history";

function argValue(argv, flag, fallback = null) {
  const idx = argv.indexOf(flag);
  if (idx >= 0 && argv[idx + 1]) return argv[idx + 1];
  return fallback;
}

function hasFlag(argv, flag) {
  return argv.includes(flag);
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else if (ch === '"') {
      inQuotes = true;
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function splitCsvRecords(raw) {
  const records = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === '"') {
      cur += ch;
      if (inQuotes && raw[i + 1] === '"') {
        cur += raw[i + 1];
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (cur.length > 0) records.push(cur);
      cur = "";
      if (ch === "\r" && raw[i + 1] === "\n") i += 1;
      continue;
    }
    cur += ch;
  }
  if (cur.length > 0) records.push(cur);
  return records.filter(Boolean);
}

function readCsv(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const records = splitCsvRecords(raw);
  if (!records.length) return [];
  const headers = parseCsvLine(records[0]);
  return records.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = cols[index] ?? "";
    });
    return row;
  });
}

function buildHistoryArtifactKey(entityId) {
  const raw = String(entityId || "").trim().toLowerCase();
  const normalized = raw
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "unknown-player";
}

function toBool(value) {
  const raw = String(value || "").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "win" || raw === "w";
}

function toIntOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function normalizeHistoryItem(row) {
  return {
    match_date: String(row.match_date || "").trim() || null,
    opponent_entity_id: String(row.opponent_entity_id || "").trim() || null,
    opponent_name: String(row.opponent_name || "").trim(),
    opponent_race: String(row.opponent_race || "").trim() || null,
    map_name: String(row.map_name || "").trim() || null,
    is_win: toBool(row.is_win),
    result_text: String(row.result || "").trim() || null,
    note: String(row.memo || "").trim() || null,
    source_file: String(row.source_file || "").trim() || null,
    source_row_no: toIntOrNull(row.source_row_no),
  };
}

function buildSummary(history) {
  const matches = history.length;
  const wins = history.filter((row) => row.is_win).length;
  return {
    matches,
    wins,
    losses: matches - wins,
    latest_match_date: String(history[0] && history[0].match_date ? history[0].match_date : "") || null,
  };
}

function readPlayerHistoryArtifact(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function buildPlayerHistoryArtifacts(options = {}) {
  const inputPath = options.inputPath || DEFAULT_FACT_PATH;
  const outputDir = options.outputDir || DEFAULT_OUTPUT_DIR;
  const generatedAt = options.generatedAt || new Date().toISOString();
  const rows = Array.isArray(options.rows) ? options.rows : readCsv(inputPath);

  fs.mkdirSync(outputDir, { recursive: true });
  const byPlayer = new Map();
  for (const row of rows) {
    const entityId = String(row.player_entity_id || "").trim();
    if (!entityId) continue;
    const key = buildHistoryArtifactKey(entityId);
    const bucket =
      byPlayer.get(key) ||
      {
        key,
        entityId,
        playerName: String(row.player_name || "").trim(),
        team: String(row.team || "").trim(),
        tier: String(row.tier || "").trim(),
        race: String(row.race || "").trim(),
        history: [],
      };
    bucket.history.push(normalizeHistoryItem(row));
    byPlayer.set(key, bucket);
  }

  const players = [];
  let matchRowsWritten = 0;
  for (const bucket of byPlayer.values()) {
    bucket.history.sort((left, right) => {
      const byDate = String(right.match_date || "").localeCompare(String(left.match_date || ""));
      if (byDate !== 0) return byDate;
      return Number(left.source_row_no || 0) - Number(right.source_row_no || 0);
    });
    const file = `${bucket.key}.json`;
    const artifact = {
      generated_at: generatedAt,
      player: {
        entity_id: bucket.entityId,
        name: bucket.playerName,
        team: bucket.team || null,
        tier: bucket.tier || null,
        race: bucket.race || null,
      },
      summary: buildSummary(bucket.history),
      match_history: bucket.history,
    };
    fs.writeFileSync(path.join(outputDir, file), JSON.stringify(artifact), "utf8");
    matchRowsWritten += bucket.history.length;
    players.push({
      history_key: bucket.key,
      file,
      player_entity_id: bucket.entityId,
      player_name: bucket.playerName,
      summary: artifact.summary,
    });
  }

  players.sort((a, b) => String(a.history_key).localeCompare(String(b.history_key)));
  const index = {
    generated_at: generatedAt,
    players,
  };
  fs.writeFileSync(path.join(outputDir, "index.json"), JSON.stringify(index), "utf8");

  return {
    generated_at: generatedAt,
    output_dir: outputDir,
    players_written: players.length,
    match_rows_written: matchRowsWritten,
    index_path: path.join(outputDir, "index.json"),
  };
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function getR2Config(env = process.env, prefix = DEFAULT_R2_PREFIX) {
  const normalizedPrefix = String(prefix || DEFAULT_R2_PREFIX).replace(/^\/+|\/+$/g, "");
  const accountId = String(env.PLAYER_HISTORY_R2_ACCOUNT_ID || env.R2_ACCOUNT_ID || "").trim();
  const accessKeyId = String(env.PLAYER_HISTORY_R2_ACCESS_KEY_ID || env.R2_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = String(env.PLAYER_HISTORY_R2_SECRET_ACCESS_KEY || env.R2_SECRET_ACCESS_KEY || "").trim();
  const bucketName = String(env.PLAYER_HISTORY_R2_BUCKET_NAME || env.R2_BUCKET_NAME || "").trim();
  const explicitHistoryBaseUrl = normalizeBaseUrl(env.PLAYER_HISTORY_PUBLIC_BASE_URL);
  const rootBaseUrl = normalizeBaseUrl(env.PLAYER_HISTORY_R2_PUBLIC_BASE_URL || env.R2_PUBLIC_BASE_URL);
  const publicBaseUrl = explicitHistoryBaseUrl || (rootBaseUrl ? `${rootBaseUrl}/${normalizedPrefix}` : "");
  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !publicBaseUrl) {
    throw new Error(
      "R2 player history upload requires R2 account/key env, PLAYER_HISTORY_R2_BUCKET_NAME or R2_BUCKET_NAME, and PLAYER_HISTORY_PUBLIC_BASE_URL or an R2 public base URL."
    );
  }
  return { accountId, accessKeyId, secretAccessKey, bucketName, publicBaseUrl };
}

function hasR2Config(env = process.env, prefix = DEFAULT_R2_PREFIX) {
  try {
    getR2Config(env, prefix);
    return true;
  } catch {
    return false;
  }
}

async function uploadArtifactsToR2(options = {}) {
  const outputDir = options.outputDir || DEFAULT_OUTPUT_DIR;
  const prefix = String(options.prefix || DEFAULT_R2_PREFIX).replace(/^\/+|\/+$/g, "");
  const config = getR2Config(options.env || process.env, prefix);
  const { PutObjectCommand, S3Client } = require("@aws-sdk/client-s3");
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  const files = fs.readdirSync(outputDir).filter((file) => file.endsWith(".json")).sort();
  for (const file of files) {
    const body = fs.readFileSync(path.join(outputDir, file));
    await client.send(
      new PutObjectCommand({
        Bucket: config.bucketName,
        Key: `${prefix}/${file}`,
        Body: body,
        ContentType: "application/json; charset=utf-8",
        CacheControl: "public, max-age=300",
      })
    );
  }

  return {
    uploaded_files: files.length,
    public_base_url: config.publicBaseUrl,
    prefix,
  };
}

async function main(rawArgv = process.argv.slice(2)) {
  const outputDir = argValue(rawArgv, "--output-dir", DEFAULT_OUTPUT_DIR);
  const inputPath = argValue(rawArgv, "--fact-path", DEFAULT_FACT_PATH);
  const uploadR2 = hasFlag(rawArgv, "--upload-r2");
  const uploadR2IfConfigured = hasFlag(rawArgv, "--upload-r2-if-configured");
  const r2Prefix = argValue(rawArgv, "--r2-prefix", process.env.PLAYER_HISTORY_R2_PREFIX || DEFAULT_R2_PREFIX);

  const report = buildPlayerHistoryArtifacts({ inputPath, outputDir });
  if (uploadR2 || (uploadR2IfConfigured && hasR2Config())) {
    report.r2 = await uploadArtifactsToR2({ outputDir, prefix: r2Prefix });
  } else if (uploadR2IfConfigured) {
    report.r2 = {
      skipped: true,
      reason: "missing_r2_env",
    };
  }

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const latestPath = path.join(REPORTS_DIR, "player_history_artifacts_latest.json");
  fs.writeFileSync(latestPath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({ ...report, report_path: latestPath }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  buildHistoryArtifactKey,
  buildPlayerHistoryArtifacts,
  getR2Config,
  readCsv,
  readPlayerHistoryArtifact,
  hasR2Config,
  uploadArtifactsToR2,
};
