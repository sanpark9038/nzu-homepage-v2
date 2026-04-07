
import { supabase } from "./supabase";
import { type Player } from "../types";
export type { Player };

// Public pages should consume website-serving data from Supabase through this layer.
// Local metadata and tmp reports remain admin / pipeline sources, not public page sources.
const PLAYER_SERVING_SELECT = [
  "broadcast_title, broadcast_url, created_at, detailed_stats, elo_point, eloboard_id, id, is_live, last_synced_at, match_history, name, nickname, photo_url, race, soop_id, tier, tier_rank, total_losses, total_wins, university, win_rate, gender, last_checked_at, last_match_at, last_changed_at, check_priority, check_interval_days",
] as const;

const MATCH_SERVING_SELECT =
  "*, player1:players!player1_id(id, name, race, photo_url), player2:players!player2_id(id, name, race, photo_url), winner:players!winner_id(id, name)" as const;

export const playerService = {
  /** 전적(ELO) 순으로 모든 선수 가져오기 */
  async getAllPlayers() {
    const { data, error } = await supabase
      .from("players")
      .select(PLAYER_SERVING_SELECT[0])
      .order("elo_point", { ascending: false, nullsFirst: false })
      .order("tier", { ascending: true });
    
    if (error) throw error;
    return data || [];
  },

  /** 특정 ID의 선수 정보 가져오기 */
  async getPlayerById(id: string) {
    const { data, error } = await supabase
      .from("players")
      .select(PLAYER_SERVING_SELECT[0])
      .eq("id", id)
      .single();
    
    if (error) throw error;
    return data;
  },

  /** UUID 접두사(8자리 등)로 선수 정보 가져오기 */
  async getPlayerByIdPrefix(prefix: string) {
    const normalizedPrefix = String(prefix || "").trim().toLowerCase();
    if (!normalizedPrefix) return null;

    const { data, error } = await supabase
      .from("players")
      .select(PLAYER_SERVING_SELECT[0])
      .order("elo_point", { ascending: false, nullsFirst: false });

    if (error) throw error;
    return (data || []).find((player) => String(player.id || "").toLowerCase().startsWith(normalizedPrefix)) || null;
  },

  /** 현재 방송 중인 선수들만 가져오기 */
  async getLivePlayers() {
    const { data, error } = await supabase
      .from("players")
      .select(PLAYER_SERVING_SELECT[0])
      .eq("is_live", true)
      .order("elo_point", { ascending: false });
    
    if (error) throw error;
    return data || [];
  },

  /** 특정 선수의 매치 기록 가져오기 */
  async getPlayerMatches(playerId: string, limit = 10) {
    const { data, error } = await supabase
      .from('matches')
      .select(MATCH_SERVING_SELECT)
      .or(`player1_id.eq.${playerId},player2_id.eq.${playerId}`)
      .order('match_date', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data || [];
  },

  /** 최근 매치 기록 가져오기 (전역) */
  async getRecentMatches(limit = 10) {
    const { data, error } = await supabase
      .from("matches")
      .select(MATCH_SERVING_SELECT)
      .order("match_date", { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data || [];
  },

  /** 최근 Eloboard 매치 기록 가져오기 (전역) */
  async getRecentEloMatches(limit = 20) {
    const { data, error } = await supabase
      .from("eloboard_matches")
      .select("*")
      .order("match_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data || [];
  },

  /** 모든 선수 검색 (이름 기준) */
  async searchPlayers(query: string) {
    const { data, error } = await supabase
      .from("players")
      .select(PLAYER_SERVING_SELECT[0])
      .ilike("name", `%${query}%`)
      .limit(10);
    
    if (error) throw error;
    return data || [];
  },

  /** 모든 대학 목록 가져오기 */
  async getAllUniversities() {
    const { data, error } = await supabase
      .from("players")
      .select("university")
      .not("university", "is", null);
    
    if (error) throw error;
    const univs = Array.from(new Set(data.map(item => item.university)));
    return (univs as string[]).filter(Boolean).sort();
  },

  /** 특정 대학의 선수 목록 가져오기 */
  async getPlayersByUniversity(univ: string) {
    const { data, error } = await supabase
      .from("players")
      .select(PLAYER_SERVING_SELECT[0])
      .eq("university", univ)
      .order("name", { ascending: true });
    
    if (error) throw error;
    return data || [];
  }
};
