
export const UNIVERSITY_MAP: Record<string, { name: string; logo: string; color: string }> = {
  '씨나인': { name: 'C9 (씨나인)', logo: '☁️', color: '#00A1E9' },
  '케이대': { name: '케이대', logo: '🦁', color: '#004A99' },
  'JSA': { name: 'JSA (저사대)', logo: '🦅', color: '#E41E31' },
  'BGM': { name: 'BGM', logo: '🎵', color: '#FFD700' },
  '엠비대': { name: 'MBD (엠비대)', logo: '👊', color: '#2F3542' },
  '흑카데미': { name: '흑카데미', logo: '🎓', color: '#000000' },
  '정선대': { name: '정선대', logo: '☀️', color: '#FFA500' },
  '츠캄몬스타즈': { name: '츠캄몬스터즈', logo: '👾', color: '#9B59B6' },
  '뉴캣슬': { name: '뉴캣슬', logo: '🏰', color: '#3498DB' },
  '수술대': { name: '수술대', logo: '🩺', color: '#2ED573' },
  '와플대': { name: '와플대', logo: '🧇', color: '#F1C40F' },
  'HM': { name: 'HM', logo: '🛡️', color: '#E67E22' },
  '늪지대': { name: 'NZU (늪지대)', logo: '🏟️', color: '#00A86B' },
  'YB': { name: 'YB', logo: '🌟', color: '#A4B0BE' },
  '무소속': { name: 'FA / 무소속', logo: '👤', color: '#747D8C' }
};

export const getUniversityInfo = (univ: string) => {
  return UNIVERSITY_MAP[univ] || { name: univ, logo: '🛡️', color: '#57606F' };
};
