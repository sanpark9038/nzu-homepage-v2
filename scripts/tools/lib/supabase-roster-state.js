const { createClient } = require("@supabase/supabase-js");

async function fetchSupabasePlayerMap() {
  const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").trim();
  if (!supabaseUrl || !serviceKey) return null;

  const supabase = createClient(supabaseUrl, serviceKey);
  const { data, error } = await supabase
    .from("players")
    .select("eloboard_id, university, tier")
    .not("eloboard_id", "is", null);

  if (error || !data) return null;

  const map = new Map();
  for (const row of data) {
    const eloboardId = String(row.eloboard_id || "").trim();
    if (!eloboardId) continue;
    map.set(eloboardId, {
      university: String(row.university || "").trim(),
      tier: String(row.tier || "").trim(),
    });
  }
  return map;
}

module.exports = { fetchSupabasePlayerMap };
