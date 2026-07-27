import { supabase } from "@/lib/supabase";

/**
 * site_settings KV 범용 읽기.
 * 테이블이 아직 없으면(PGRST205) 조용히 fallback — 배포 순서에 사이트가 죽지 않게.
 *
 * 그 밖의 읽기 실패는 던진다. "값 없음"으로 삼키면 호출부가 빈 화면을 정상 상태로 착각해
 * 그대로 렌더하고 ISR 캐시에 굳는다 — 실패와 미설정은 구분돼야 한다.
 */
export async function getSetting(key: string, fallback: string | null = null): Promise<string | null> {
  const { data, error } = await supabase.from("site_settings").select("value").eq("key", key).maybeSingle();

  if (error) {
    if (error.code === "PGRST205") return fallback;
    console.error(`failed to load site setting ${key}`, error);
    throw new Error(`site_settings read failed: ${key}`);
  }

  const value = data?.value?.trim();
  return value ? value : fallback;
}
