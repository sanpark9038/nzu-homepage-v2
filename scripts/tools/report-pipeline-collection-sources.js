const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const SOURCES_PATH = path.join(ROOT, "data", "metadata", "pipeline_collection_sources.v1.json");

function readSourcesDoc() {
  return JSON.parse(fs.readFileSync(SOURCES_PATH, "utf8").replace(/^\uFEFF/, ""));
}

function summarizeSources(doc) {
  const sources = Array.isArray(doc.sources) ? doc.sources : [];
  return {
    generated_at: new Date().toISOString(),
    sources_path: SOURCES_PATH,
    version: doc.version || null,
    total_sources: sources.length,
    roles: [...new Set(sources.map((source) => String(source.role || "").trim()).filter(Boolean))],
    sources: sources.map((source) => ({
      id: source.id,
      role: source.role || null,
      consumed_by_count: Array.isArray(source.consumed_by) ? source.consumed_by.length : 0,
      output_count: Array.isArray(source.outputs) ? source.outputs.length : 0,
      has_url: Boolean(source.url || source.url_pattern),
    })),
  };
}

function main() {
  const summary = summarizeSources(readSourcesDoc());
  console.log(JSON.stringify(summary, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  SOURCES_PATH,
  readSourcesDoc,
  summarizeSources,
};
