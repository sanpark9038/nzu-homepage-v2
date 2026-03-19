const { createClient } = require("@supabase/supabase-js");
const path = require("path");
require("dotenv").config({ path: path.join(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing Supabase env vars in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const playerName = "아링";
  const from = "2025-01-01";
  const to = "2026-03-19";

  const { data, error } = await supabase
    .from("eloboard_matches")
    .select("match_date,is_win,result_text,player_name")
    .eq("player_name", playerName)
    .gte("match_date", from)
    .lte("match_date", to);

  if (error) {
    console.error("Supabase query failed:", error.message);
    process.exit(1);
  }

  const rows = Array.isArray(data) ? data : [];
  const validRows = rows.filter((r) => typeof r.is_win === "boolean");
  const wins = validRows.filter((r) => r.is_win).length;
  const losses = validRows.filter((r) => !r.is_win).length;
  const total = wins + losses;
  const winRate = total > 0 ? ((wins / total) * 100).toFixed(2) : "0.00";

  const unknown = rows.length - validRows.length;

  console.log(
    JSON.stringify(
      {
        player_name: playerName,
        period: { from, to },
        queried_rows: rows.length,
        counted_rows: total,
        unknown_is_win_rows: unknown,
        wins,
        losses,
        win_rate_percent: Number(winRate),
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error("Unexpected error:", err.message);
  process.exit(1);
});
