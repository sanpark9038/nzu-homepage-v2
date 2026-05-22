const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env.local"), quiet: true });

const ROOT = path.join(__dirname, "..", "..");
const REPORTS_DIR = path.join(ROOT, "tmp", "reports");
const DEFAULT_PREFIX = "ops-review";
const REPORT_FILES = [
  "daily_pipeline_alerts_latest.json",
  "roster_change_review_latest.json",
  "manual_refresh_latest.json",
  "ops_pipeline_latest.json",
  "team_roster_sync_report.json",
];
const MANIFEST_FILE = "ops_review_reports_manifest.json";

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

function deriveSiblingPublicBaseUrl(value, sourcePrefix, targetPrefix) {
  const baseUrl = normalizeBaseUrl(value);
  if (!baseUrl) return "";

  const normalizedSourcePrefix = String(sourcePrefix || "player-history").trim().replace(/^\/+|\/+$/g, "") || "player-history";
  const normalizedTargetPrefix = normalizePrefix(targetPrefix);
  const suffix = `/${normalizedSourcePrefix}`;
  const rootBaseUrl = baseUrl.endsWith(suffix) ? baseUrl.slice(0, -suffix.length) : baseUrl;
  return rootBaseUrl ? `${rootBaseUrl}/${normalizedTargetPrefix}` : "";
}

function getOpsReviewReportsPublicBaseUrl(env = process.env, prefix = DEFAULT_PREFIX) {
  const explicitBaseUrl = normalizeBaseUrl(env.OPS_REVIEW_REPORTS_PUBLIC_BASE_URL);
  if (explicitBaseUrl) return explicitBaseUrl;

  const normalizedPrefix = normalizePrefix(prefix);
  const rootBaseUrl = normalizeBaseUrl(env.OPS_REVIEW_REPORTS_R2_PUBLIC_BASE_URL);
  if (rootBaseUrl) return `${rootBaseUrl}/${normalizedPrefix}`;

  return deriveSiblingPublicBaseUrl(
    env.PLAYER_HISTORY_PUBLIC_BASE_URL || env.PLAYER_HISTORY_R2_PUBLIC_BASE_URL,
    env.PLAYER_HISTORY_R2_PREFIX || "player-history",
    normalizedPrefix
  );
}

function getOpsReviewReportsR2Config(env = process.env, prefix = DEFAULT_PREFIX) {
  const normalizedPrefix = normalizePrefix(prefix);
  const accountId = String(
    env.OPS_REVIEW_REPORTS_R2_ACCOUNT_ID ||
      env.PLAYER_HISTORY_R2_ACCOUNT_ID ||
      env.R2_ACCOUNT_ID ||
      ""
  ).trim();
  const accessKeyId = String(
    env.OPS_REVIEW_REPORTS_R2_ACCESS_KEY_ID ||
      env.PLAYER_HISTORY_R2_ACCESS_KEY_ID ||
      env.R2_ACCESS_KEY_ID ||
      ""
  ).trim();
  const secretAccessKey = String(
    env.OPS_REVIEW_REPORTS_R2_SECRET_ACCESS_KEY ||
      env.PLAYER_HISTORY_R2_SECRET_ACCESS_KEY ||
      env.R2_SECRET_ACCESS_KEY ||
      ""
  ).trim();
  const bucketName = String(
    env.OPS_REVIEW_REPORTS_R2_BUCKET_NAME ||
      env.PLAYER_HISTORY_R2_BUCKET_NAME ||
      env.R2_BUCKET_NAME ||
      ""
  ).trim();
  const publicBaseUrl = getOpsReviewReportsPublicBaseUrl(env, normalizedPrefix);

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !publicBaseUrl) {
    throw new Error(
      "Ops review report sync requires R2 account/key env, a bucket, and OPS_REVIEW_REPORTS_PUBLIC_BASE_URL or an ops-review R2 public base URL."
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

function hasOpsReviewReportsR2Config(env = process.env, prefix = DEFAULT_PREFIX) {
  try {
    getOpsReviewReportsR2Config(env, prefix);
    return true;
  } catch {
    return false;
  }
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
}

function buildManifest(reportsDir = REPORTS_DIR) {
  const files = REPORT_FILES.filter((file) => fs.existsSync(path.join(reportsDir, file)));
  const generatedAts = files
    .map((file) => readJsonIfExists(path.join(reportsDir, file)))
    .map((doc) => String((doc && doc.generated_at) || "").trim())
    .filter(Boolean)
    .sort();

  return {
    generated_at: new Date().toISOString(),
    source_latest_generated_at: generatedAts[generatedAts.length - 1] || null,
    workflow_run_id: String(process.env.GITHUB_RUN_ID || "").trim() || null,
    workflow_run_url:
      String(process.env.GITHUB_SERVER_URL || "").trim() &&
      String(process.env.GITHUB_REPOSITORY || "").trim() &&
      String(process.env.GITHUB_RUN_ID || "").trim()
        ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
        : null,
    files,
  };
}

async function uploadOpsReviewReportsToR2(options = {}) {
  const reportsDir = options.reportsDir || REPORTS_DIR;
  const prefix = options.prefix || process.env.OPS_REVIEW_REPORTS_R2_PREFIX || DEFAULT_PREFIX;
  const config = getOpsReviewReportsR2Config(options.env || process.env, prefix);
  const manifest = buildManifest(reportsDir);
  if (!manifest.files.length) {
    throw new Error("ops_review_report_files_missing");
  }

  const manifestPath = path.join(reportsDir, MANIFEST_FILE);
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  const { PutObjectCommand, S3Client } = require("@aws-sdk/client-s3");
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  const filesToUpload = [...manifest.files, MANIFEST_FILE];
  for (const file of filesToUpload) {
    await client.send(
      new PutObjectCommand({
        Bucket: config.bucketName,
        Key: `${config.prefix}/${file}`,
        Body: fs.readFileSync(path.join(reportsDir, file)),
        ContentType: "application/json; charset=utf-8",
        CacheControl: "public, max-age=300",
      })
    );
  }

  return {
    uploaded_files: filesToUpload.length,
    public_base_url: config.publicBaseUrl,
    prefix: config.prefix,
    files: filesToUpload,
  };
}

async function main(rawArgv = process.argv.slice(2)) {
  const reportsDir = argValue(rawArgv, "--reports-dir", REPORTS_DIR);
  const prefix = argValue(rawArgv, "--r2-prefix", process.env.OPS_REVIEW_REPORTS_R2_PREFIX || DEFAULT_PREFIX);
  const report = {
    generated_at: new Date().toISOString(),
    reports_dir: reportsDir,
  };

  if (hasFlag(rawArgv, "--upload-r2") || hasFlag(rawArgv, "--upload-r2-if-configured")) {
    if (hasFlag(rawArgv, "--upload-r2") || hasOpsReviewReportsR2Config(process.env, prefix)) {
      report.r2 = await uploadOpsReviewReportsToR2({ reportsDir, prefix });
    } else {
      report.r2 = {
        skipped: true,
        reason: "missing_r2_env",
      };
    }
  } else {
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
  MANIFEST_FILE,
  REPORT_FILES,
  buildManifest,
  deriveSiblingPublicBaseUrl,
  getOpsReviewReportsPublicBaseUrl,
  getOpsReviewReportsR2Config,
  hasOpsReviewReportsR2Config,
  uploadOpsReviewReportsToR2,
};
