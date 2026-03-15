
import { supabase } from "./supabase";
import { Database } from "./database.types";

export type Player = Database['public']['Tables']['players']['Row'];

export const playerService = {
  /** 전적(ELO) 순으로 모든 선수 가져오기 */
  async getAllPlayers() {
    const { data, error } = await supabase
      .from("players")
      .select("*")
      .order("elo_point", { ascending: false, nullsFirst: false })
      .order("tier", { ascending: true });
    
    if (error) throw error;
    return data || [];
  },

  /** 특정 ID의 선수 정보 가져오기 */
  async getPlayerById(id: string) {
    const { data, error } = await supabase
      .from("players")
      .select("*")
      .eq("id", id)
      .single();
    
    if (error) throw error;
    return data;
  },

  /** 현재 방송 중인 선수들만 가져오기 */
  async getLivePlayers() {
    const { data, error } = await supabase
      .from("players")
      .select("*")
      .eq("is_live", true)
      .order("elo_point", { ascending: false });
    
    if (error) throw error;
    return data || [];
  },

  /** 특정 선수의 매치 기록 가져오기 */
  async getPlayerMatches(playerId: string, limit = 10) {
    const { data, error } = await supabase
      .from('matches')
      .select('*, player1:players!player1_id(id, name, race, photo_url), player2:players!player2_id(id, name, race, photo_url)')
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
      .select(`
        *,
        player1:player1_id(id, name, race, photo_url),
        player2:player2_id(id, name, race, photo_url),
        winner:winner_id(id, name)
      `)
      .order("match_date", { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data || [];
  },

  /** 모든 선수 검색 (이름 기준) */
  async searchPlayers(query: string) {
    const { data, error } = await supabase
      .from("players")
      .select("*")
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
      .select("*")
      .eq("university", univ)
      .order("name", { ascending: true });
    
    if (error) throw error;
    return data || [];
  }
};
