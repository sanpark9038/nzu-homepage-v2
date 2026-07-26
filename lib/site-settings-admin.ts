import { createSupabaseAdminClient } from "@/lib/supabase-admin";

/** 서버 전용 — service role로 site_settings KV를 읽고 쓴다. 클라이언트에서 import 금지. */

export const SITE_SETTINGS_MISSING_TABLE_MESSAGE =
  "site_settings 테이블이 없습니다. scripts/sql/create-site-settings.sql 을 Supabase에서 실행해주세요.";

function rethrow(error: { code?: string }): never {
  if (error.code === "PGRST205") throw new Error(SITE_SETTINGS_MISSING_TABLE_MESSAGE);
  throw error;
}

export async function readSettingAdmin(key: string): Promise<string | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("site_settings").select("value").eq("key", key).maybeSingle();

  if (error) rethrow(error);
  return data?.value ?? null;
}

export async function writeSettingAdmin(key: string, value: string): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("site_settings")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });

  if (error) rethrow(error);
}
