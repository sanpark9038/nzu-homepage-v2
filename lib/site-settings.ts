import { supabase } from "@/lib/supabase";

/**
 * site_settings KV 범용 읽기.
 * 테이블이 아직 없으면(PGRST205) 조용히 fallback — 배포 순서에 사이트가 죽지 않게.
 */
export async function getSetting(key: string, fallback: string | null = null): Promise<string | null> {
  const { data, error } = await supabase.from("site_settings").select("value").eq("key", key).maybeSingle();

  if (error) {
    if (error.code !== "PGRST205") {
      console.error(`failed to load site setting ${key}`, error);
    }
    return fallback;
  }

  const value = data?.value?.trim();
  return value ? value : fallback;
}
