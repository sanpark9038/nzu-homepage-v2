const { createClient } = require("@supabase/supabase-js");
const path = require("path");
require("dotenv").config({ path: path.join(process.cwd(), ".env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
  const { data: players, error: pErr } = await supabase
    .from("players")
    .select("id,name,eloboard_id,gender,university")
    .eq("eloboard_id", "953");

  if (pErr) {
    console.error("players query failed:", pErr.message);
    process.exit(1);
  }

  console.log("players_by_eloboard_id_953:", JSON.stringify(players, null, 2));

  if (!players || players.length === 0) return;

  for (const p of players) {
    const { data: ms, error: mErr } = await supabase
      .from("eloboard_matches")
      .select("match_date,is_win,player_name,result_text")
      .eq("player_name", p.name)
      .gte("match_date", "2025-01-01")
      .lte("match_date", "2026-03-19");

    if (mErr) {
      console.log(`matches query failed for [${p.name}]: ${mErr.message}`);
      continue;
    }
    const rows = ms || [];
    const valid = rows.filter((r) => typeof r.is_win === "boolean");
    const wins = valid.filter((r) => r.is_win).length;
    const losses = valid.length - wins;
    const winRate = valid.length ? ((wins / valid.length) * 100).toFixed(2) : "0.00";
    console.log(
      JSON.stringify(
        {
          name_used: p.name,
          queried_rows: rows.length,
          counted_rows: valid.length,
          wins,
          losses,
          win_rate_percent: Number(winRate),
        },
        null,
        2
      )
    );
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
