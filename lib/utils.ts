import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function calculateWinRate(wins: number | null, losses: number | null): number {
  const total = (wins ?? 0) + (losses ?? 0);
  if (total === 0) return 0;
  return Math.round(((wins ?? 0) / total) * 100);
}

/**
 * 티어 문자열을 내부 로직용(비교, 정렬, 매핑 키)으로 정규화합니다.
 * 'god' -> '갓', '1' -> '1', '미정' -> '미정' 등
 */
export function normalizeTier(tier: string | null | undefined): string {
  if (!tier || tier === '미정' || tier === 'N/A' || tier === 'null') return '미정';
  
  const t = tier.toLowerCase().trim();
  
  const logicalMap: Record<string, string> = {
    'god': '갓',
    '갓': '갓',
    'king': '킹',
    '킹': '킹',
    'jack': '잭',
    '잭': '잭',
    'queen': '퀸',
    '퀸': '퀸',
    'joker': '조커',
    '조커': '조커',
    'spade': '스페이드',
    '스페이드': '스페이드',
    '9': '베이비',
    'baby': '베이비',
    '아기': '베이비',
    '베이비': '베이비'
  };

  if (logicalMap[t]) return logicalMap[t];
  
  // 숫자 티어는 "1", "2" 등 순순 숫자 문자열만 반환 ( Number() 변환 및 소팅용 )
  const numMatch = t.match(/^\d+$/);
  if (numMatch) return numMatch[0];


  return t;
}

/**
 * 화면 표시용 한글 티어 라벨을 반환합니다.
 */
export function getTierLabel(tier: string | null | undefined): string {
  const norm = normalizeTier(tier);
  
  if (norm === '미정') return '미정';
  if (['갓', '킹', '잭', '퀸', '조커', '스페이드', '베이비'].includes(norm)) return norm;
  
  // 숫자 티어인 경우 "N티어" 붙임
  if (!isNaN(Number(norm))) return `${norm}티어`;
  
  return norm;
}


/**
 * 종족 코드를 표준 대문자로 정규화합니다.
 */
export function normalizeRace(race: string | null | undefined): "T" | "Z" | "P" {
  if (!race) return "T"; // 기본값
  const r = race.toUpperCase().substring(0, 1);
  if (r === "T" || r === "Z" || r === "P") return r as "T" | "Z" | "P";
  return "T";
}

/**
 * 인자로 받은 날짜부터 현재까지의 시간을 '방금 전', 'n분 전' 등으로 반환합니다.
 */
export function formatTimeAgo(dateString: string | null | undefined): string {
  if (!dateString) return '';
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return '방금 전';
    
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes}분 전`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}시간 전`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 30) return `${diffInDays}일 전`;
    
    return date.toLocaleDateString('ko-KR').replace(/\. /g, '.').replace(/\.$/, '');
  } catch (e) {
    return '';
  }
}
