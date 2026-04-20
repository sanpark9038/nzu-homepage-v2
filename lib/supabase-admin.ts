import { createClient } from "@supabase/supabase-js";
import { Database } from "@/lib/database.types";

export function createSupabaseAdminClient() {
  const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const supabaseServiceKey = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || ""
  ).trim();

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("missing_supabase_admin_env");
  }

  return createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
