import { supabase } from './supabase'
import { type EloMatch, type H2HStats } from '../types'

/**
 * 인스턴트 상대전적 조회 함수 (Pre-synced Eloboard Data 기반)
 * @param p1PlayerName 메인 플레이어 이름
 * @param p2OpponentName 상대 플레이어 이름
 * @param gender 성별 (옵션, 명시할 경우 해당 성별 데이터 내에서만 조회)
 */
export async function getInstantH2H(
  p1PlayerName: string, 
  p2OpponentName: string,
  gender?: string
): Promise<H2HStats | null> {
  // 1. Both directions with optional gender filter
  let query = supabase
    .from('eloboard_matches')
    .select('*')
    .or(`and(player_name.eq."${p1PlayerName}",opponent_name.eq."${p2OpponentName}"),and(player_name.eq."${p2OpponentName}",opponent_name.eq."${p1PlayerName}")`)

  if (gender) {
    query = query.eq('gender', gender)
  }

  const { data: rawMatches, error } = await query.order('match_date', { ascending: false })

  if (error) {
    console.error('H2H Lookup Error:', error)
    return null
  }

  // 2. Filter & Deduplicate
  const seen = new Set();
  const allMatchesAfter2025: EloMatch[] = [];
  let olderHistoryExists = false;
  const startOf2025 = new Date('2025-01-01');

  for (const m of rawMatches ?? []) {
    if (!m.result_text || !m.player_name || !m.opponent_name || !m.match_date || !m.map) continue;
    
    // Deduplication Key
    const scoreVal = m.result_text.replace(/[+-]/g, '').trim();
    const sortedPlayers = [m.player_name, m.opponent_name].sort();
    const key = `${m.match_date}|${m.map}|${sortedPlayers.join('-')}|${scoreVal}|${m.note || ''}`;
    
    if (seen.has(key)) continue;
    seen.add(key);

    const mDate = new Date(m.match_date as string);
    if (mDate < startOf2025) {
      olderHistoryExists = true;
      continue;
    }

    // Normalize: always relative to P1
    if (m.player_name === p1PlayerName) {
      allMatchesAfter2025.push(m);
    } else {
      allMatchesAfter2025.push({
        ...m,
        is_win: !m.is_win,
        result_text: m.result_text.startsWith('+') ? m.result_text.replace('+', '-') : 
                     m.result_text.startsWith('-') ? m.result_text.replace('-', '+') : m.result_text
      });
    }
  }

  // 3. 통계 계산 (Since 2025-01-01)
  const total = allMatchesAfter2025.length
  const wins = allMatchesAfter2025.filter(m => m.is_win).length
  const losses = allMatchesAfter2025.filter(m => !m.is_win).length
  const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : '0.0'

  // 4. 최근 폼 (90일 이내)
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const recent90Matches = allMatchesAfter2025.filter(m => new Date(m.match_date as string) >= ninetyDaysAgo);
  const r90Wins = recent90Matches.filter(m => m.is_win).length;
  const r90Losses = recent90Matches.filter(m => !m.is_win).length;

  // 5. 맵별 승률 (2025년 이후 전체 기반)
  const mapStats: Record<string, { w: number, l: number }> = {}
  allMatchesAfter2025.forEach(m => {
    const mapName = m.map || 'Unknown Map';
    if (!mapStats[mapName]) mapStats[mapName] = { w: 0, l: 0 }
    if (m.is_win) mapStats[mapName].w++
    else mapStats[mapName].l++
  })

  return {
    summary: {
      total,
      wins,
      losses,
      winRate,
      olderHistoryExists,
      momentum90: {
        total: recent90Matches.length,
        wins: r90Wins,
        losses: r90Losses,
        winRate: recent90Matches.length > 0 ? ((r90Wins / recent90Matches.length) * 100).toFixed(1) : '0.0'
      }
    },
    mapStats,
    recentMatches: allMatchesAfter2025.slice(0, 10)
  }
}
