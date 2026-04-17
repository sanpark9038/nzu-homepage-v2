const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const FLOW_PATH = path.join(ROOT, "data", "metadata", "pipeline_runtime_flow.v1.json");

function readFlowDoc() {
  return JSON.parse(fs.readFileSync(FLOW_PATH, "utf8").replace(/^\uFEFF/, ""));
}

function summarizeRuntimeFlow(doc) {
  const flows = Array.isArray(doc.flows) ? doc.flows : [];
  const allOutputs = new Set();

  const summarizedFlows = flows.map((flow) => {
    const steps = Array.isArray(flow.steps) ? flow.steps : [];
    const outputs = Array.isArray(flow.outputs) ? flow.outputs : [];
    const strictFailurePoints = Array.isArray(flow.strict_failure_points) ? flow.strict_failure_points : [];
    for (const output of outputs) {
      allOutputs.add(output);
    }
    return {
      id: flow.id,
      entrypoint: flow.entrypoint,
      mode: flow.mode || null,
      step_count: steps.length,
      output_count: outputs.length,
      strict_failure_point_count: strictFailurePoints.length,
      has_guard: Boolean(flow.guard),
    };
  });

  return {
    generated_at: new Date().toISOString(),
    flow_path: FLOW_PATH,
    version: doc.version || null,
    total_flows: summarizedFlows.length,
    total_unique_outputs: allOutputs.size,
    flows: summarizedFlows,
  };
}

function main() {
  const summary = summarizeRuntimeFlow(readFlowDoc());
  console.log(JSON.stringify(summary, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  FLOW_PATH,
  readFlowDoc,
  summarizeRuntimeFlow,
};
