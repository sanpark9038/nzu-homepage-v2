import { type UniversityInfo } from "../types";

export const UNIVERSITY_MAP: Record<string, { name: string; logo: string; color: string; stars?: number }> = {
  'NZU': { name: '늪지대', logo: '🦎', color: 'from-nzu-green/20 to-nzu-green/5', stars: 0 },
  'KU': { name: '케이대', logo: '🦁', color: 'from-blue-600/20 to-blue-600/5', stars: 2 },
  'JSA': { name: 'JSA', logo: '🦅', color: 'from-red-600/20 to-red-600/5', stars: 2 },
  'C9': { name: '씨나인', logo: '☁️', color: 'from-sky-400/20 to-sky-400/5', stars: 1 },
  'TSUCALM': { name: '츠캄몬스타즈', logo: '👹', color: 'from-orange-600/20 to-orange-600/5', stars: 1 },
  'YB': { name: 'YB', logo: '🐻', color: 'from-yellow-600/20 to-yellow-600/5', stars: 1 },
  'SSU': { name: '수술대', logo: '🩺', color: 'from-emerald-600/20 to-emerald-600/5', stars: 0 },
  'BGM': { name: 'BGM', logo: '🎵', color: 'from-purple-600/20 to-purple-600/5', stars: 0 },
  'MBU': { name: '엠비대', logo: '🎙️', color: 'from-indigo-600/20 to-indigo-600/5', stars: 0 },
  'B.A': { name: '흑카데미', logo: '🎓', color: 'from-gray-800/20 to-gray-800/5', stars: 0 },
  'N.C.S': { name: '뉴캣슬', logo: '🏰', color: 'from-slate-600/20 to-slate-600/5', stars: 0 },
  'WFU': { name: '와플대', logo: '🧇', color: 'from-amber-600/20 to-amber-600/5', stars: 0 },
  'HM': { name: 'HM', logo: '⚔️', color: 'from-cyan-600/20 to-cyan-600/5', stars: 0 },
  'FA': { name: '무소속', logo: '🕊️', color: 'from-white/10 to-white/5', stars: 0 },
};

export const getUniversityInfo = (univ: string): UniversityInfo => {
  return UNIVERSITY_MAP[univ] || { name: univ, logo: '🛡️', color: '#57606F' };
};
