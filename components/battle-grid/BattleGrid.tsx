"use client";

import { useState, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Player } from '@/lib/player-service';
import { TeamSelector } from './TeamSelector';
import { TierRow } from './TierRow';
import { TIERS } from '@/lib/constants';
import { normalizeTier } from '@/lib/utils';

interface BattleGridProps {
  players: Player[];
  universities: string[];
  initialTeamA?: string;
  initialTeamB?: string;
}

export function BattleGrid({ players, universities, initialTeamA, initialTeamB }: BattleGridProps) {
  const router = useRouter();
  const pathname = usePathname();
  
  const [teamA, setTeamA] = useState<string | null>(initialTeamA || null);
  const [teamB, setTeamB] = useState<string | null>(initialTeamB || null);
  const [hideEmptyTiers, setHideEmptyTiers] = useState(true);

  const handleTeamChange = (team: 'A' | 'B', univ: string | null) => {
    const currentParams = new URLSearchParams();
    const newTeamA = team === 'A' ? univ : teamA;
    const newTeamB = team === 'B' ? univ : teamB;
    
    if (newTeamA) currentParams.set('teamA', newTeamA);
    if (newTeamB) currentParams.set('teamB', newTeamB);

    router.push(`${pathname}?${currentParams.toString()}`);
    
    if (team === 'A') setTeamA(univ);
    if (team === 'B') setTeamB(univ);
  };

  const playersByTier = useMemo(() => {
    const grouped: Record<string, { teamA: Player[], teamB: Player[] }> = {};

    for (const tier of TIERS) {
      const normTier = normalizeTier(tier);
      grouped[normTier] = { teamA: [], teamB: [] };
    }

    players.forEach(p => {
      const pTier = normalizeTier(p.tier);
      if (!pTier || !p.university) return;

      if (!grouped[pTier]) {
        grouped[pTier] = { teamA: [], teamB: [] };
      }

      if (p.university === teamA) {
        grouped[pTier].teamA.push(p);
      }
      if (p.university === teamB) {
        grouped[pTier].teamB.push(p);
      }
    });

    return grouped;
  }, [players, teamA, teamB]);

  return (
    <div className="w-full">
      <div className="grid grid-cols-2 gap-4 mb-8">
        <TeamSelector universities={universities} selectedTeam={teamA} onSelect={(univ) => handleTeamChange('A', univ)} title="좌측 팀 선택" />
        <TeamSelector universities={universities} selectedTeam={teamB} onSelect={(univ) => handleTeamChange('B', univ)} title="우측 팀 선택" />
      </div>
      
      <div className="flex justify-end mb-4">
        <label className="flex items-center gap-2 text-xs font-bold cursor-pointer text-white/40 hover:text-white/60 transition-colors">
          <input 
            type="checkbox" 
            checked={hideEmptyTiers}
            onChange={(e) => setHideEmptyTiers(e.target.checked)}
            className="form-checkbox h-4 w-4 rounded bg-card text-nzu-green border-border focus:ring-nzu-green/50"
          />
          미사용 티어 라인 숨기기
        </label>

      </div>

      <div className="space-y-2">
        {TIERS.map(tier => {
          const normTier = normalizeTier(tier);
          const tierData = playersByTier[normTier];
          if (!tierData) return null;

          if (hideEmptyTiers && tierData.teamA.length === 0 && tierData.teamB.length === 0) {
            return null;
          }
          
          return (
            <TierRow 
              key={tier}
              tier={normTier}
              teamAPlayers={tierData.teamA}
              teamBPlayers={tierData.teamB}
            />
          )
        })}
      </div>
    </div>
  );
}
