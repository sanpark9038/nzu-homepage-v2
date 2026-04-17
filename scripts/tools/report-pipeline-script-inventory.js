const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const INVENTORY_PATH = path.join(ROOT, "data", "metadata", "pipeline_script_inventory.v1.json");

function readInventory() {
  return JSON.parse(fs.readFileSync(INVENTORY_PATH, "utf8").replace(/^\uFEFF/, ""));
}

function summarizeInventory(doc) {
  const groups = Array.isArray(doc.groups) ? doc.groups : [];
  const seen = new Set();

  const summarizedGroups = groups.map((group) => {
    const scripts = Array.isArray(group.scripts) ? group.scripts : [];
    const rows = scripts.map((relPath) => {
      const normalizedPath = String(relPath || "").replace(/\//g, path.sep);
      const absPath = path.join(ROOT, normalizedPath);
      const exists = fs.existsSync(absPath);
      const duplicate = seen.has(relPath);
      seen.add(relPath);
      return {
        path: relPath,
        exists,
        duplicate,
      };
    });

    return {
      id: group.id,
      label: group.label,
      description: group.description || "",
      script_count: rows.length,
      missing_count: rows.filter((row) => !row.exists).length,
      duplicate_count: rows.filter((row) => row.duplicate).length,
      scripts: rows,
    };
  });

  return {
    generated_at: new Date().toISOString(),
    inventory_path: INVENTORY_PATH,
    version: doc.version || null,
    total_groups: summarizedGroups.length,
    total_scripts: summarizedGroups.reduce((acc, group) => acc + group.script_count, 0),
    total_missing: summarizedGroups.reduce((acc, group) => acc + group.missing_count, 0),
    total_duplicates: summarizedGroups.reduce((acc, group) => acc + group.duplicate_count, 0),
    groups: summarizedGroups,
  };
}

function main() {
  const summary = summarizeInventory(readInventory());
  console.log(JSON.stringify(summary, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  INVENTORY_PATH,
  readInventory,
  summarizeInventory,
};
