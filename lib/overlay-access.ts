// 오버레이 관리자(/overlay/admin) 접근 판정 — 서버 전용.
// 등록 선수(players.soop_id ↔ 숲 로그인 ID)는 자동 통과,
// 그 외엔 overlay_access 신청·승인 상태를 본다. (테스트 기간: 일부에게만 개방)
import { createSupabaseAdminClient } from "./supabase-admin";

export type OverlayAccessStatus =
  | "player"    // 등록 선수 — 자동 허용
  | "approved"  // 신청 후 승인됨 — 허용
  | "pending"   // 신청했고 승인 대기
  | "none";     // 신청 이력 없음

export async function getOverlayAccessStatus(providerUserId: string): Promise<OverlayAccessStatus> {
  // ilike의 와일드카드(%·_)가 섞이면 오판 가능 — 숲 ID엔 어차피 없는 문자라 제거
  const id = providerUserId.trim().replace(/[%_]/g, "");
  if (!id) return "none";
  const db = createSupabaseAdminClient();

  // 1) 등록 선수인가 — 숲 ID 대소문자 차이를 흡수하기 위해 ilike(와일드카드 없는 ilike = 대소문자 무시 일치)
  const { data: player } = await db
    .from("players")
    .select("id")
    .ilike("soop_id", id)
    .limit(1)
    .maybeSingle();
  if (player) return "player";

  // 2) 신청·승인 상태
  const { data: access } = await db
    .from("overlay_access")
    .select("status")
    .eq("provider_user_id", id)
    .maybeSingle();
  if (access?.status === "approved") return "approved";
  if (access?.status === "pending") return "pending";
  return "none";
}
