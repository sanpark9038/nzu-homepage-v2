import { supabase } from "./supabase";

export const playerService = {
  // ... existing methods ...

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
    // 중복 제거
    const univs = Array.from(new Set(data.map(item => item.university)));
    return univs.filter(Boolean).sort();
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
