import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseAnonKey)

/**
 * 인스턴트 상대전적 조회 함수 (Pre-synced Eloboard Data 기반)
 * @param p1PlayerName 메인 플레이어 이름
 * @param p2OpponentName 상대 플레이어 이름
 */
export async function getInstantH2H(p1PlayerName: string, p2OpponentName: string) {
  // 1. P1 기준 P2와 붙은 모든 전적 (eloboard_matches 테이블 활용)
  const { data: matches, error } = await supabase
    .from('eloboard_matches')
    .select('*')
    .eq('player_name', p1PlayerName)
    .eq('opponent_name', p2OpponentName)
    .order('match_date', { ascending: false })

  if (error) {
    console.error('H2H Lookup Error:', error)
    return null
  }

  // 2. 통계 계산
  const wins = matches.filter(m => m.is_win).length
  const losses = matches.filter(m => !m.is_win).length
  const total = matches.length
  const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : '0.0'

  // 3. 맵별 승률 분석
  const mapStats: Record<string, { w: number, l: number }> = {}
  matches.forEach(m => {
    if (!mapStats[m.map]) mapStats[m.map] = { w: 0, l: 0 }
    if (m.is_win) mapStats[m.map].w++
    else mapStats[m.map].l++
  })

  // 4. 최근 폼 (기세) 분석 (30일 이내)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recent30Matches = matches.filter(m => new Date(m.match_date) >= thirtyDaysAgo);
  const r30Wins = recent30Matches.filter(m => m.is_win).length;
  const r30Losses = recent30Matches.filter(m => !m.is_win).length;

  return {
    summary: {
      total,
      wins,
      losses,
      winRate,
      momentum: {
        total: recent30Matches.length,
        wins: r30Wins,
        losses: r30Losses,
        winRate: recent30Matches.length > 0 ? ((r30Wins / recent30Matches.length) * 100).toFixed(1) : '0.0'
      }
    },
    mapStats,
    recentMatches: matches.slice(0, 10)
  }
}
