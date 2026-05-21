const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env.local"), quiet: true });

const ROOT = path.join(__dirname, "..", "..");
const DEFAULT_WAREHOUSE_DIR = path.join(ROOT, "data", "warehouse");
const DEFAULT_PREFIX = "warehouse";
const AGGREGATE_FILES = [
  "agg_daily_player.csv",
  "agg_daily_team.csv",
  "agg_player_detail_breakdowns.csv",
];

function argValue(argv, flag, fallback = null) {
  const idx = argv.indexOf(flag);
  if (idx >= 0 && argv[idx + 1]) return argv[idx + 1];
  return fallback;
}

function hasFlag(argv, flag) {
  return argv.includes(flag);
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizePrefix(value) {
  return String(value || DEFAULT_PREFIX).trim().replace(/^\/+|\/+$/g, "") || DEFAULT_PREFIX;
}

function getWarehouseAggregatePublicBaseUrl(env = process.env, prefix = DEFAULT_PREFIX) {
  const explicitBaseUrl = normalizeBaseUrl(env.WAREHOUSE_AGGREGATES_PUBLIC_BASE_URL);
  if (explicitBaseUrl) return explicitBaseUrl;

  const normalizedPrefix = normalizePrefix(prefix);
  const rootBaseUrl = normalizeBaseUrl(
    env.WAREHOUSE_AGGREGATES_R2_PUBLIC_BASE_URL ||
      env.PLAYER_HISTORY_R2_PUBLIC_BASE_URL ||
      env.R2_PUBLIC_BASE_URL
  );
  return rootBaseUrl ? `${rootBaseUrl}/${normalizedPrefix}` : "";
}

function getWarehouseAggregateR2Config(env = process.env, prefix = DEFAULT_PREFIX) {
  const normalizedPrefix = normalizePrefix(prefix);
  const accountId = String(
    env.WAREHOUSE_AGGREGATES_R2_ACCOUNT_ID ||
      env.PLAYER_HISTORY_R2_ACCOUNT_ID ||
      env.R2_ACCOUNT_ID ||
      ""
  ).trim();
  const accessKeyId = String(
    env.WAREHOUSE_AGGREGATES_R2_ACCESS_KEY_ID ||
      env.PLAYER_HISTORY_R2_ACCESS_KEY_ID ||
      env.R2_ACCESS_KEY_ID ||
      ""
  ).trim();
  const secretAccessKey = String(
    env.WAREHOUSE_AGGREGATES_R2_SECRET_ACCESS_KEY ||
      env.PLAYER_HISTORY_R2_SECRET_ACCESS_KEY ||
      env.R2_SECRET_ACCESS_KEY ||
      ""
  ).trim();
  const bucketName = String(
    env.WAREHOUSE_AGGREGATES_R2_BUCKET_NAME ||
      env.PLAYER_HISTORY_R2_BUCKET_NAME ||
      env.R2_BUCKET_NAME ||
      ""
  ).trim();
  const publicBaseUrl = getWarehouseAggregatePublicBaseUrl(env, normalizedPrefix);

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !publicBaseUrl) {
    throw new Error(
      "Warehouse aggregate R2 sync requires R2 account/key env, a bucket, and WAREHOUSE_AGGREGATES_PUBLIC_BASE_URL or an R2 public base URL."
    );
  }

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    publicBaseUrl,
    prefix: normalizedPrefix,
  };
}

function hasWarehouseAggregateR2Config(env = process.env, prefix = DEFAULT_PREFIX) {
  try {
    getWarehouseAggregateR2Config(env, prefix);
    return true;
  } catch {
    return false;
  }
}

function listMissingAggregateFiles(warehouseDir = DEFAULT_WAREHOUSE_DIR) {
  return AGGREGATE_FILES.filter((file) => !fs.existsSync(path.join(warehouseDir, file)));
}

async function downloadWarehouseAggregates(options = {}) {
  const warehouseDir = options.warehouseDir || DEFAULT_WAREHOUSE_DIR;
  const env = options.env || process.env;
  const prefix = options.prefix || env.WAREHOUSE_AGGREGATES_R2_PREFIX || DEFAULT_PREFIX;
  const force = Boolean(options.force);
  const fetchImpl = options.fetchImpl || fetch;
  const missingFiles = listMissingAggregateFiles(warehouseDir);

  if (!force && missingFiles.length === 0) {
    return {
      skipped: true,
      reason: "local_aggregates_present",
      downloaded_files: 0,
      files: AGGREGATE_FILES.slice(),
    };
  }

  const publicBaseUrl = getWarehouseAggregatePublicBaseUrl(env, prefix);
  if (!publicBaseUrl) {
    return {
      skipped: true,
      reason: "missing_public_base_url",
      downloaded_files: 0,
      files: [],
    };
  }

  fs.mkdirSync(warehouseDir, { recursive: true });
  const targetFiles = force ? AGGREGATE_FILES : missingFiles;
  const downloaded = [];
  for (const file of targetFiles) {
    const url = `${publicBaseUrl}/${file}`;
    const response = await fetchImpl(url);
    if (!response || !response.ok) {
      const status = response && typeof response.status !== "undefined" ? response.status : "unknown";
      throw new Error(`warehouse_aggregate_download_failed:${file}:${status}`);
    }
    const text = await response.text();
    fs.writeFileSync(path.join(warehouseDir, file), text, "utf8");
    downloaded.push(file);
  }

  return {
    skipped: false,
    reason: null,
    public_base_url: publicBaseUrl,
    downloaded_files: downloaded.length,
    files: downloaded,
  };
}

async function uploadWarehouseAggregatesToR2(options = {}) {
  const warehouseDir = options.warehouseDir || DEFAULT_WAREHOUSE_DIR;
  const prefix = options.prefix || process.env.WAREHOUSE_AGGREGATES_R2_PREFIX || DEFAULT_PREFIX;
  const config = getWarehouseAggregateR2Config(options.env || process.env, prefix);
  const missingFiles = listMissingAggregateFiles(warehouseDir);
  if (missingFiles.length) {
    throw new Error(`warehouse_aggregate_files_missing:${missingFiles.join(",")}`);
  }

  const { PutObjectCommand, S3Client } = require("@aws-sdk/client-s3");
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  for (const file of AGGREGATE_FILES) {
    const body = fs.readFileSync(path.join(warehouseDir, file));
    await client.send(
      new PutObjectCommand({
        Bucket: config.bucketName,
        Key: `${config.prefix}/${file}`,
        Body: body,
        ContentType: "text/csv; charset=utf-8",
        CacheControl: "public, max-age=300",
      })
    );
  }

  return {
    uploaded_files: AGGREGATE_FILES.length,
    public_base_url: config.publicBaseUrl,
    prefix: config.prefix,
  };
}

async function main(rawArgv = process.argv.slice(2)) {
  const warehouseDir = argValue(rawArgv, "--warehouse-dir", DEFAULT_WAREHOUSE_DIR);
  const prefix = argValue(rawArgv, "--r2-prefix", process.env.WAREHOUSE_AGGREGATES_R2_PREFIX || DEFAULT_PREFIX);
  const report = {
    generated_at: new Date().toISOString(),
    warehouse_dir: warehouseDir,
  };

  if (hasFlag(rawArgv, "--download") || hasFlag(rawArgv, "--download-if-configured")) {
    const download = await downloadWarehouseAggregates({
      warehouseDir,
      prefix,
      force: hasFlag(rawArgv, "--force"),
    });
    report.download = download;
    if (hasFlag(rawArgv, "--download") && download.skipped) {
      console.error(JSON.stringify(report, null, 2));
      process.exit(1);
    }
  }

  if (hasFlag(rawArgv, "--upload-r2") || hasFlag(rawArgv, "--upload-r2-if-configured")) {
    if (hasFlag(rawArgv, "--upload-r2") || hasWarehouseAggregateR2Config(process.env, prefix)) {
      report.r2 = await uploadWarehouseAggregatesToR2({ warehouseDir, prefix });
    } else {
      report.r2 = {
        skipped: true,
        reason: "missing_r2_env",
      };
    }
  }

  if (!report.download && !report.r2) {
    report.skipped = true;
    report.reason = "no_action_requested";
  }

  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  AGGREGATE_FILES,
  downloadWarehouseAggregates,
  getWarehouseAggregatePublicBaseUrl,
  getWarehouseAggregateR2Config,
  hasWarehouseAggregateR2Config,
  listMissingAggregateFiles,
  uploadWarehouseAggregatesToR2,
};
