const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const {
  AGGREGATE_FILES,
  downloadWarehouseAggregates,
  getWarehouseAggregateR2Config,
} = require("./sync-warehouse-aggregates");

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "warehouse-aggregate-sync-"));
}

function writeAllAggregates(dir) {
  fs.mkdirSync(dir, { recursive: true });
  for (const file of AGGREGATE_FILES) {
    fs.writeFileSync(path.join(dir, file), `${file}\nlocal\n`, "utf8");
  }
}

(async () => {
  await runTest("warehouse aggregate R2 config derives public URL from dedicated root and prefix", () => {
    const config = getWarehouseAggregateR2Config(
      {
        WAREHOUSE_AGGREGATES_R2_ACCOUNT_ID: "account",
        WAREHOUSE_AGGREGATES_R2_ACCESS_KEY_ID: "access",
        WAREHOUSE_AGGREGATES_R2_SECRET_ACCESS_KEY: "secret",
        WAREHOUSE_AGGREGATES_R2_BUCKET_NAME: "data-bucket",
        WAREHOUSE_AGGREGATES_R2_PUBLIC_BASE_URL: "https://data.example.com/",
      },
      "warehouse-stats"
    );

    assert.equal(config.bucketName, "data-bucket");
    assert.equal(config.publicBaseUrl, "https://data.example.com/warehouse-stats");
    assert.equal(config.prefix, "warehouse-stats");
  });

  await runTest("warehouse aggregate download skips existing local serving snapshots by default", async () => {
    const warehouseDir = makeTempDir();
    try {
      writeAllAggregates(warehouseDir);
      const result = await downloadWarehouseAggregates({
        warehouseDir,
        env: {
          WAREHOUSE_AGGREGATES_PUBLIC_BASE_URL: "https://data.example.com/warehouse",
        },
        fetchImpl: async () => {
          throw new Error("fetch should not be called when local aggregate files exist");
        },
      });

      assert.equal(result.skipped, true);
      assert.equal(result.reason, "local_aggregates_present");
      assert.equal(result.downloaded_files, 0);
    } finally {
      fs.rmSync(warehouseDir, { recursive: true, force: true });
    }
  });

  await runTest("warehouse aggregate download writes the three serving snapshots from public base URL", async () => {
    const warehouseDir = makeTempDir();
    const requested = [];
    try {
      const result = await downloadWarehouseAggregates({
        warehouseDir,
        env: {
          WAREHOUSE_AGGREGATES_PUBLIC_BASE_URL: "https://data.example.com/warehouse/",
        },
        fetchImpl: async (url) => {
          requested.push(url);
          return {
            ok: true,
            status: 200,
            text: async () => `downloaded:${path.basename(new URL(url).pathname)}`,
          };
        },
      });

      assert.equal(result.skipped, false);
      assert.equal(result.downloaded_files, AGGREGATE_FILES.length);
      assert.deepEqual(
        requested,
        AGGREGATE_FILES.map((file) => `https://data.example.com/warehouse/${file}`)
      );
      for (const file of AGGREGATE_FILES) {
        assert.equal(
          fs.readFileSync(path.join(warehouseDir, file), "utf8"),
          `downloaded:${file}`
        );
      }
    } finally {
      fs.rmSync(warehouseDir, { recursive: true, force: true });
    }
  });

  await runTest("warehouse aggregate sync is wired into prebuild and predeploy verification", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

    assert.match(
      String(pkg.scripts.prebuild || ""),
      /sync-warehouse-aggregates\.js --download-if-configured/,
      "prebuild should materialize warehouse aggregate snapshots when a public base URL is configured"
    );
    assert.match(
      String(pkg.scripts["verify:predeploy"] || ""),
      /npm run test:warehouse:aggregate-sync/,
      "predeploy verification should include the warehouse aggregate sync contract"
    );
  });
})();
