const sections = [
  {
    title: "GitHub Actions",
    items: [
      "SOOP Live Sync latest run: success",
      "NZU Ops Pipeline latest run: success",
      "Node 20 deprecation warning remains non-blocking but should be tracked",
    ],
  },
  {
    title: "UI Watchpoints",
    items: [
      "/tier: live badge, thumbnail, and channel link",
      "/player: exact search, tier label, and match history",
      "/match: actual players list, H2H stats, and no NaN warnings",
    ],
  },
  {
    title: "Pipeline Reports",
    items: [
      "tmp/reports/team_roster_sync_report.json",
      "tmp/reports/pipeline_collection_sources_health_latest.json",
      "tmp/reports/daily_pipeline_snapshot_latest.json",
      "tmp/reports/daily_pipeline_alerts_latest.json",
      "tmp/reports/low_sample_review_latest.json",
    ],
  },
  {
    title: "Local Commands",
    items: [
      "npm run pipeline:status",
      "npm run pipeline:verify:discord",
      "npm run pipeline:collection-sources:health -- --write",
      "npm run maintenance:check",
      "npm run report:low-sample",
    ],
  },
];

console.log("NZU Ops Watch Checklist");
console.log("");

for (const section of sections) {
  console.log(`[${section.title}]`);
  for (const item of section.items) {
    console.log(`- ${item}`);
  }
  console.log("");
}
