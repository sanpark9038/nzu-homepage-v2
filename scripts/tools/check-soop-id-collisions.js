const { loadProjectPlayerMetadata, trim } = require("./lib/project-player-metadata");

function main() {
  const rows = loadProjectPlayerMetadata();

  const bySoopId = new Map();
  for (const row of rows) {
    const soopId = trim(row && row.soop_user_id).toLowerCase();
    if (!soopId) continue;
    const bucket = bySoopId.get(soopId) || [];
    bucket.push({
      wr_id: Number(row && row.wr_id),
      gender: trim(row && row.gender) || null,
      name: trim(row && row.name) || null,
      entity_id: trim(row && row.entity_id) || null,
      team_code: trim(row && row.team_code) || null,
    });
    bySoopId.set(soopId, bucket);
  }

  const conflicts = [];
  for (const [soopId, bucket] of bySoopId.entries()) {
    const identityKeys = [...new Set(bucket.map((row) => row.entity_id || `${row.wr_id}:${row.gender}:${row.name}`))];
    if (identityKeys.length <= 1) continue;
    conflicts.push({
      soop_id: soopId,
      rows: bucket.sort((a, b) => a.wr_id - b.wr_id),
    });
  }

  if (!conflicts.length) {
    console.log("PASS soop_id collision check");
    console.log(`- checked_soop_ids: ${bySoopId.size}`);
    return;
  }

  console.error("FAIL soop_id collision check");
  for (const conflict of conflicts) {
    console.error(`- ${conflict.soop_id}`);
    for (const row of conflict.rows) {
      console.error(
        `  entity_id=${row.entity_id || "-"} wr_id=${row.wr_id} gender=${row.gender || "-"} team=${
          row.team_code || "-"
        } name=${row.name || "-"}`
      );
    }
  }
  process.exitCode = 1;
}

main();
