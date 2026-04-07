'use client'

import React, { useRef, useState } from 'react'
import { Plus, X, GripVertical, ArrowLeftRight, MonitorUp, RadioTower, LayoutPanelLeft, Link2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { RaceLetterBadge } from "@/components/ui/race-letter-badge"
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'

// --- Types ---
interface Player {
  id: string;
  name: string;
  race: string;
}

interface MatchRow {
  id: string;
  p1: Player | null;
  p2: Player | null;
  p1Input: string;
  p2Input: string;
}

const DUMMY_PLAYERS: Player[] = [
  { id: '1', name: '이영호', race: 'T' },
  { id: '2', name: '김택용', race: 'P' },
  { id: '3', name: '이제동', race: 'Z' },
  { id: '4', name: '송병구', race: 'T' },
  { id: '5', name: '허영무', race: 'P' },
  { id: '6', name: '박성준', race: 'Z' },
  { id: '7', name: '윤용태', race: 'T' },
  { id: '8', name: '김명운', race: 'Z' },
  { id: '9', name: '강민', race: 'P' },
  { id: '10', name: '홍진호', race: 'Z' },
];

const SHOW_ENTRY_BOARD_PANEL = false;

function normalizeRaceCode(race: string) {
  const raw = String(race || '').trim().toUpperCase();
  if (!raw) return 'R';
  if (raw.startsWith('T')) return 'T';
  if (raw.startsWith('Z')) return 'Z';
  if (raw.startsWith('P')) return 'P';
  return 'R';
}

function raceToneClasses(race: string, side: 1 | 2) {
  const raceCode = normalizeRaceCode(race);
  const base = side === 1
    ? "focus-within:border-nzu-green/40"
    : "focus-within:border-red-500/30";

  if (raceCode === 'T') {
    return side === 1
      ? "border-blue-500/40 bg-blue-500/[0.05] shadow-[inset_0_0_0_1px_rgba(59,130,246,0.08)]"
      : "border-blue-500/30 bg-blue-500/[0.04] shadow-[inset_0_0_0_1px_rgba(59,130,246,0.06)]";
  }
  if (raceCode === 'Z') {
    return side === 1
      ? "border-purple-500/40 bg-purple-500/[0.05] shadow-[inset_0_0_0_1px_rgba(168,85,247,0.08)]"
      : "border-purple-500/30 bg-purple-500/[0.04] shadow-[inset_0_0_0_1px_rgba(168,85,247,0.06)]";
  }
  if (raceCode === 'P') {
    return side === 1
      ? "border-yellow-500/40 bg-yellow-500/[0.05] shadow-[inset_0_0_0_1px_rgba(234,179,8,0.08)]"
      : "border-yellow-500/30 bg-yellow-500/[0.04] shadow-[inset_0_0_0_1px_rgba(234,179,8,0.06)]";
  }
  return base;
}

function getMockStats(p1: Player | null, p2: Player | null) {
  if (!p1 || !p2) return null;

  const leftId = Number(p1.id);
  const rightId = Number(p2.id);
  const lowId = Math.min(leftId, rightId);
  const highId = Math.max(leftId, rightId);
  const seed = lowId * 13 + highId * 7;
  const baseOverall: [number, number] = [10 + (seed % 4), 9 + ((seed * 3) % 4)];
  const baseRecent: [number, number] = [2 + (seed % 2), 1 + ((seed * 5) % 2)];

  if (leftId <= rightId) {
    return { overall: baseOverall, recent: baseRecent };
  }

  return {
    overall: [baseOverall[1], baseOverall[0]] as [number, number],
    recent: [baseRecent[1], baseRecent[0]] as [number, number],
  };
}

function getMockInsights(player: Player, opponent: Player) {
  const playerId = Number(player.id);
  const opponentId = Number(opponent.id);
  const seed = playerId * 17 + opponentId * 11;
  const maps = ["투혼", "폴리포이드", "실피드", "네오문글레이브", "녹아웃"];
  const strongMap = maps[seed % maps.length];
  const mapWins = 3 + (seed % 4);
  const mapLosses = seed % 3;
  const recentWins = 4 + ((seed * 3) % 4);
  const recentLosses = 1 + ((seed * 5) % 3);
  const recentTone = recentWins > recentLosses ? "상승 흐름" : "주춤한 흐름";
  const recentSummary =
    recentWins > recentLosses
      ? `${opponent.race} 상대로 최근 흐름이 좋습니다.`
      : `${opponent.race} 상대로 최근 흐름은 조금 더 확인이 필요합니다.`;

  return {
    strongMap,
    mapRecord: `${mapWins}승 ${mapLosses}패`,
    raceTarget: `vs ${opponent.race}`,
    recentRecord: `${recentWins}승 ${recentLosses}패`,
    recentTone,
    recentSummary,
  };
}

function getRaceCount(players: Player[]) {
  return players.reduce<Record<string, number>>((acc, player) => {
    const race = normalizeRaceCode(player.race);
    acc[race] = (acc[race] || 0) + 1;
    return acc;
  }, {});
}

function formatRaceSummary(players: Player[]) {
  const counts = getRaceCount(players);
  const order = ['T', 'Z', 'P'];
  const parts = order
    .filter((race) => counts[race])
    .map((race) => `${race} ${counts[race]}`);
  return parts.length ? parts.join(' · ') : '미배치';
}

function EntryBoardSidePanel({ rows }: { rows: MatchRow[] }) {
  const confirmedRows = rows.filter((row) => row.p1 && row.p2) as Array<MatchRow & { p1: Player; p2: Player }>;
  const teamAPlayers = confirmedRows.map((row) => row.p1);
  const teamBPlayers = confirmedRows.map((row) => row.p2);
  const aggregate = confirmedRows.reduce(
    (acc, row) => {
      const stats = getMockStats(row.p1, row.p2);
      if (!stats) return acc;
      acc.left += stats.overall[0];
      acc.right += stats.overall[1];
      return acc;
    },
    { left: 0, right: 0 }
  );
  const balanceText =
    confirmedRows.length === 0
      ? '선수 선택 후 밸런스 계산'
      : aggregate.left === aggregate.right
        ? '현재 기준 완전 균형'
        : aggregate.left > aggregate.right
          ? `A팀 우세 ${aggregate.left - aggregate.right}포인트`
          : `B팀 우세 ${aggregate.right - aggregate.left}포인트`;

  return (
    <aside className="flex flex-col gap-3 xl:sticky xl:top-6 xl:self-start">
      <section className="overflow-hidden rounded-[2rem] border border-white/8 bg-[linear-gradient(180deg,rgba(8,17,18,0.94),rgba(6,10,11,0.92))] shadow-[0_24px_80px_rgba(0,0,0,0.34)]">
        <div className="border-b border-white/7 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[0.8rem] font-[1000] uppercase tracking-[0.22em] text-nzu-green/78">
                <LayoutPanelLeft size={14} />
                Broadcast Side Panel
              </div>
              <h2 className="mt-2 text-[1.45rem] font-[1000] tracking-tight text-white">
                엔트리보드 송출 패널
              </h2>
              <p className="mt-1 text-[0.94rem] text-white/44">
                실제 생성 로직 전 단계. 현재 편성 상태를 방송용 구조로 먼저 고정합니다.
              </p>
            </div>
            <div className="rounded-full border border-amber-300/20 bg-amber-300/[0.07] px-3 py-1 text-[0.72rem] font-[1000] tracking-[0.16em] text-amber-100">
              UI SHELL
            </div>
          </div>
        </div>

        <div className="grid gap-3 px-4 py-4">
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
            <div className="rounded-[1.35rem] border border-white/8 bg-white/[0.03] px-4 py-3">
              <div className="flex items-center gap-2 text-[0.78rem] font-[1000] uppercase tracking-[0.18em] text-white/32">
                <MonitorUp size={14} />
                현재 편성
              </div>
              <div className="mt-3 text-[1.9rem] font-[1000] italic tracking-tight text-white">
                {confirmedRows.length}
                <span className="ml-2 text-[0.95rem] not-italic text-white/35">확정 매치</span>
              </div>
              <div className="mt-2 text-[0.9rem] text-white/46">
                전체 슬롯 {rows.length}개 중 {rows.length - confirmedRows.length}개 미완성
              </div>
            </div>

            <div className="rounded-[1.35rem] border border-nzu-green/14 bg-nzu-green/[0.05] px-4 py-3">
              <div className="flex items-center gap-2 text-[0.78rem] font-[1000] uppercase tracking-[0.18em] text-nzu-green/62">
                <RadioTower size={14} />
                밸런스
              </div>
              <div className="mt-3 text-[1.1rem] font-[1000] tracking-tight text-white">{balanceText}</div>
              <div className="mt-2 text-[0.9rem] text-white/46">
                전체 상대전적 합산 기준 임시 지표
              </div>
            </div>

            <div className="rounded-[1.35rem] border border-white/8 bg-white/[0.03] px-4 py-3">
              <div className="flex items-center gap-2 text-[0.78rem] font-[1000] uppercase tracking-[0.18em] text-white/32">
                <Link2 size={14} />
                예정 URL
              </div>
              <div className="mt-3 break-all text-[0.92rem] font-[1000] text-white/78">
                /overlay/entry-board?session=match-live
              </div>
              <div className="mt-2 text-[0.9rem] text-white/46">
                생성 버튼 연결 전 placeholder 경로
              </div>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <div className="rounded-[1.4rem] border border-nzu-green/14 bg-[linear-gradient(180deg,rgba(0,255,163,0.08),rgba(0,255,163,0.02))] px-4 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[0.78rem] font-[1000] uppercase tracking-[0.18em] text-nzu-green/62">A팀 보드 요약</div>
                  <div className="mt-2 text-[1.15rem] font-[1000] tracking-tight text-white">좌측 선수 라인업</div>
                </div>
                <div className="rounded-full border border-nzu-green/18 bg-nzu-green/[0.07] px-3 py-1 text-[0.76rem] font-[1000] text-nzu-green">
                  {teamAPlayers.length}명
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <div className="text-[0.9rem] text-white/48">종족 분포</div>
                <div className="text-[1rem] font-[1000] text-white">{formatRaceSummary(teamAPlayers)}</div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {teamAPlayers.length > 0 ? (
                  teamAPlayers.slice(0, 6).map((player) => (
                    <div key={`left-${player.id}`} className="flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.04] px-3 py-1.5">
                      <RaceLetterBadge race={player.race} size="sm" />
                      <span className="text-[0.92rem] font-[1000] text-white/82">{player.name}</span>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[1rem] border border-dashed border-white/10 px-3 py-2 text-[0.9rem] text-white/32">
                    아직 A팀 엔트리가 확정되지 않았습니다.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[1.4rem] border border-red-500/14 bg-[linear-gradient(180deg,rgba(239,68,68,0.08),rgba(239,68,68,0.02))] px-4 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[0.78rem] font-[1000] uppercase tracking-[0.18em] text-red-400/62">B팀 보드 요약</div>
                  <div className="mt-2 text-[1.15rem] font-[1000] tracking-tight text-white text-right">우측 선수 라인업</div>
                </div>
                <div className="rounded-full border border-red-500/18 bg-red-500/[0.08] px-3 py-1 text-[0.76rem] font-[1000] text-red-200">
                  {teamBPlayers.length}명
                </div>
              </div>
              <div className="mt-4 space-y-2 text-right">
                <div className="text-[0.9rem] text-white/48">종족 분포</div>
                <div className="text-[1rem] font-[1000] text-white">{formatRaceSummary(teamBPlayers)}</div>
              </div>
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                {teamBPlayers.length > 0 ? (
                  teamBPlayers.slice(0, 6).map((player) => (
                    <div key={`right-${player.id}`} className="flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.04] px-3 py-1.5">
                      <span className="text-[0.92rem] font-[1000] text-white/82">{player.name}</span>
                      <RaceLetterBadge race={player.race} size="sm" />
                    </div>
                  ))
                ) : (
                  <div className="rounded-[1rem] border border-dashed border-white/10 px-3 py-2 text-[0.9rem] text-white/32">
                    아직 B팀 엔트리가 확정되지 않았습니다.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-[1.45rem] border border-white/8 bg-[#081213]/82 px-4 py-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[0.78rem] font-[1000] uppercase tracking-[0.18em] text-white/30">보드 프리뷰</div>
                <div className="mt-2 text-[1.1rem] font-[1000] tracking-tight text-white">방송 송출용 사이드 리스트</div>
              </div>
              <div className="text-[0.82rem] font-[1000] text-white/34">OBS 브라우저 소스 영역 placeholder</div>
            </div>

            <div className="mt-4 grid gap-2">
              {rows.map((row, index) => (
                <div
                  key={`preview-${row.id}`}
                  className="grid grid-cols-[56px_minmax(0,1fr)_56px] items-center gap-3 rounded-[1.15rem] border border-white/7 bg-white/[0.03] px-3 py-3"
                >
                  <div className="text-[0.86rem] font-[1000] tracking-tight text-white/38">
                    {index + 1}SET
                  </div>
                  <div className="min-w-0 text-center">
                    <div className="flex items-center justify-center gap-2 text-[0.96rem] font-[1000] tracking-tight text-white">
                      <span className="truncate">{row.p1?.name || 'A팀 선수'}</span>
                      <span className="text-white/22">vs</span>
                      <span className="truncate">{row.p2?.name || 'B팀 선수'}</span>
                    </div>
                    <div className="mt-1 text-[0.82rem] text-white/34">
                      {row.p1 && row.p2 ? '엔트리보드 표기 가능' : '입력 대기 중'}
                    </div>
                  </div>
                  <div className="text-right text-[0.75rem] font-[1000] tracking-[0.18em] text-white/30">
                    {row.p1 && row.p2 ? 'READY' : 'HOLD'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <div className="rounded-[1.35rem] border border-white/8 bg-white/[0.03] px-4 py-4">
              <div className="text-[0.78rem] font-[1000] uppercase tracking-[0.18em] text-white/30">송출 메모 슬롯</div>
              <div className="mt-3 grid gap-2">
                <div className="rounded-[1rem] border border-dashed border-white/10 px-3 py-2 text-[0.92rem] text-white/38">스폰서 라인 / 행사명</div>
                <div className="rounded-[1rem] border border-dashed border-white/10 px-3 py-2 text-[0.92rem] text-white/38">캐스터 / 해설 태그</div>
                <div className="rounded-[1rem] border border-dashed border-white/10 px-3 py-2 text-[0.92rem] text-white/38">라운드명 / 진행 멘트</div>
              </div>
            </div>

            <div className="rounded-[1.35rem] border border-white/8 bg-white/[0.03] px-4 py-4">
              <div className="text-[0.78rem] font-[1000] uppercase tracking-[0.18em] text-white/30">다음 액션</div>
              <div className="mt-3 grid gap-2">
                <button className="h-[46px] rounded-[1rem] border border-white/8 bg-white/[0.03] text-[0.94rem] font-[1000] text-white/36 transition-all hover:border-white/14 hover:text-white/52">
                  엔트리보드 URL 복사
                </button>
                <button className="h-[46px] rounded-[1rem] border border-white/8 bg-white/[0.03] text-[0.94rem] font-[1000] text-white/36 transition-all hover:border-white/14 hover:text-white/52">
                  송출 프리셋 저장
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </aside>
  );
}

// --- Sortable Item Component ---
interface SortableItemProps {
  row: MatchRow;
  updateRow: (id: string, field: 'p1' | 'p2' | 'p1Input' | 'p2Input', value: Player | null | string) => void;
  removeRow: (id: string) => void;
  swapPlayers: (id: string) => void;
  allPlayers: Player[];
  matchNumber: number;
}

const SortableMatchRow = ({ row, updateRow, removeRow, swapPlayers, allPlayers, matchNumber }: SortableItemProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const [s1, setS1] = useState<Player[]>([]);
  const [s2, setS2] = useState<Player[]>([]);
  const [show1, setShow1] = useState(false);
  const [show2, setShow2] = useState(false);
  const [showMomentum, setShowMomentum] = useState(false);
  const p1InputRef = useRef<HTMLInputElement | null>(null);
  const p2InputRef = useRef<HTMLInputElement | null>(null);
  const hasOpenDropdown = show1 || show2;

  const style = {
    transform: CSS.Translate.toString(transform),
    transition: transition || 'transform 150ms cubic-bezier(0.2, 0, 0, 1)',
    zIndex: isDragging ? 60 : hasOpenDropdown ? 40 : 0,
  };

  const handleSearch = (val: string, side: 1 | 2) => {
    if (!val.trim()) {
      if (side === 1) {
        setS1([]);
        setShow1(false);
      } else {
        setS2([]);
        setShow2(false);
      }
      return;
    }
    const filtered = allPlayers.filter(p => p.name.includes(val)).slice(0, 5);
    if (side === 1) {
      setS1(filtered);
      setShow1(filtered.length > 0);
    } else {
      setS2(filtered);
      setShow2(filtered.length > 0);
    }
  };

  const handleInputChange = (side: 1 | 2, value: string) => {
    const selectedPlayer = side === 1 ? row.p1 : row.p2;
    const inputField = side === 1 ? 'p1Input' : 'p2Input';
    const playerField = side === 1 ? 'p1' : 'p2';

    updateRow(row.id, inputField, value);
    if (selectedPlayer && selectedPlayer.name !== value) {
      updateRow(row.id, playerField, null);
    }
    handleSearch(value, side);
  };

  const handleEnterSelect = (side: 1 | 2) => {
    const suggestions = side === 1 ? s1 : s2;
    const nextPlayer = suggestions[0];
    if (!nextPlayer) return;

    if (side === 1) {
      updateRow(row.id, 'p1', nextPlayer);
      updateRow(row.id, 'p1Input', nextPlayer.name);
      setShow1(false);
      setTimeout(() => p2InputRef.current?.focus(), 0);
      return;
    }

    updateRow(row.id, 'p2', nextPlayer);
    updateRow(row.id, 'p2Input', nextPlayer.name);
    setShow2(false);
  };

  const isConfirmed = row.p1 && row.p2;
  const mockStats = getMockStats(row.p1, row.p2);
  const leftInsight = row.p1 && row.p2 ? getMockInsights(row.p1, row.p2) : null;
  const rightInsight = row.p1 && row.p2 ? getMockInsights(row.p2, row.p1) : null;
  const isMomentumVisible = showMomentum && isConfirmed && leftInsight && rightInsight;

  return (
    <div ref={setNodeRef} style={style} className={cn("group relative flex flex-col gap-2 overflow-visible bg-white/[0.02] backdrop-blur-xl p-2 rounded-[2rem] border transition-all", isDragging ? "border-nzu-green/40 shadow-2xl scale-[1.01]" : "border-white/5 hover:border-white/10")}>
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-2.5 md:pl-1">
      <div className="ml-1 flex items-center gap-2 self-start md:self-auto">
        <div
          {...attributes}
          {...listeners}
          className="flex h-[42px] w-[42px] items-center justify-center rounded-[0.95rem] border border-white/6 bg-white/[0.03] text-white/10 cursor-grab active:cursor-grabbing transition-all hover:border-nzu-green/22 hover:bg-nzu-green/[0.05] hover:text-nzu-green"
        >
          <GripVertical size={17} />
        </div>
        <div className="min-w-[56px] text-center">
          <div className="text-[1rem] font-[1000] italic tracking-tight text-white/88">
            {matchNumber}경기
          </div>
        </div>
      </div>

      <div className="flex w-full flex-col items-stretch gap-2.5 md:flex-1 md:flex-row md:items-center md:justify-center md:gap-3">
        
        {/* P1 Section - (Triple-Box Layout for Icon Safety) */}
        <div className="relative flex-1">
          <div className={cn(
            "relative flex items-center h-[56px] bg-[#0a1112]/88 border border-white/10 rounded-[1.15rem] transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
            row.p1 ? raceToneClasses(row.p1.race, 1) : "focus-within:border-nzu-green/40"
          )}>
            {/* 중앙 입력창 */}
            <input 
              ref={p1InputRef}
              type="text" 
              value={row.p1Input}
              onChange={(e) => handleInputChange(1, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && show1 && s1.length > 0) {
                  e.preventDefault();
                  handleEnterSelect(1);
                }
              }}
              onFocus={() => { if (row.p1Input) handleSearch(row.p1Input, 1); }}
              onBlur={() => setTimeout(() => setShow1(false), 200)}
              placeholder="A팀 선수" 
              className="flex-1 h-full bg-transparent pl-4.5 pr-[3.35rem] text-[1.45rem] font-[1000] text-left text-white placeholder:text-white/14 focus:outline-none uppercase tracking-tighter w-full min-w-0"
            />
            
            {/* 우측 아이콘 고정 영역 */}
            <div className="absolute inset-y-0 right-4 w-6 h-full flex items-center justify-center pointer-events-none">
               {row.p1 && (
                 <div className="animate-in zoom-in-95 fade-in duration-300">
                    <RaceLetterBadge race={row.p1.race} size="sm" />
                 </div>
               )}
            </div>
          </div>
          {/* Autocomplete 1 */}
          {show1 && (
            <div className="absolute top-[64px] left-0 z-[100] w-full overflow-hidden rounded-[1.1rem] border border-white/10 bg-[#05090a]/95 p-1.5 shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl animate-in fade-in slide-in-from-top-1">
               {s1.map(p => (
                 <button
                   key={p.id}
                   onClick={() => {
                     updateRow(row.id, 'p1', p);
                     updateRow(row.id, 'p1Input', p.name);
                     setShow1(false);
                     setTimeout(() => p2InputRef.current?.focus(), 0);
                   }}
                   className="w-full flex items-center justify-between rounded-[0.9rem] px-4 py-2.5 text-[1rem] font-[1000] text-white/72 transition-all hover:bg-nzu-green/[0.09] hover:text-white"
                 >
                   <span className="truncate pr-3">{p.name}</span>
                   <RaceLetterBadge race={p.race} size="sm" />
                 </button>
               ))}
               {s1.length === 0 && row.p1Input.trim() && (
                 <div className="px-4 py-3 text-[0.92rem] font-[1000] text-white/32">
                   일치하는 선수가 없습니다.
                 </div>
               )}
            </div>
          )}
        </div>
        
        {/* VS / Swap Area */}
        <div className="relative flex min-w-[112px] flex-col items-center justify-center rounded-[1.15rem] border border-white/6 bg-white/[0.02] px-3 pb-2 pt-5 md:border-none md:bg-transparent md:px-0 md:pb-0">
           <button onClick={() => swapPlayers(row.id)} className="absolute top-0 bg-[#101718]/95 border border-white/15 p-1.5 rounded-full text-white/40 hover:text-nzu-green hover:border-nzu-green/40 transition-all active:scale-90 group/swap shadow-[0_10px_24px_rgba(0,0,0,0.45)] z-20 backdrop-blur-sm">
              <ArrowLeftRight size={13} strokeWidth={3.5} className="group-hover/swap:rotate-180 transition-transform duration-500" />
           </button>
           {isConfirmed && mockStats ? (
             <div className="flex flex-col items-center animate-in fade-in zoom-in-90 duration-300">
                <div className="flex min-w-[104px] items-center justify-center gap-2">
                   <span className="min-w-[26px] text-right text-[1.65rem] font-[1000] italic text-nzu-green leading-none tabular-nums">{mockStats.overall[0]}</span>
                   <span className="min-w-[34px] px-1 text-center text-[11px] font-[1000] italic text-nzu-green/68">전체</span>
                   <span className="min-w-[26px] text-left text-[1.65rem] font-[1000] italic text-nzu-green leading-none tabular-nums">{mockStats.overall[1]}</span>
                </div>
                <div className="my-1 h-px w-[92px] bg-gradient-to-r from-transparent via-white/7 to-transparent" />
                <div className="flex min-w-[104px] items-center justify-center gap-2 opacity-75">
                   <span className="min-w-[22px] text-right text-[1.28rem] font-[1000] italic text-red-500/85 leading-none tabular-nums">{mockStats.recent[0]}</span>
                   <span className="min-w-[34px] text-center text-[11px] font-[1000] italic text-red-500/45">최근</span>
                   <span className="min-w-[22px] text-left text-[1.28rem] font-[1000] italic text-red-500/85 leading-none tabular-nums">{mockStats.recent[1]}</span>
                </div>
             </div>
           ) : (
             <div className="flex flex-col items-center gap-1.5 pt-1">
               <div className="h-[1px] w-[92px] bg-gradient-to-r from-transparent via-white/6 to-transparent group-hover:via-nzu-green/20 transition-colors" />
               <div className="flex min-w-[104px] items-center justify-center gap-3 opacity-60">
                 <span className="text-[12px] font-[1000] italic text-white/12">전체</span>
                 <span className="text-[11px] font-[1000] italic text-white/10">최근</span>
               </div>
             </div>
           )}
        </div>

        {/* P2 Section - (Triple-Box Layout for Icon Safety) */}
        <div className="relative flex-1">
          <div className={cn(
            "relative flex items-center h-[56px] bg-[#0a1112]/88 border border-white/10 rounded-[1.15rem] transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
            row.p2 ? raceToneClasses(row.p2.race, 2) : "focus-within:border-red-500/30"
          )}>
            {/* 좌측 아이콘 고정 영역 */}
            <div className="absolute inset-y-0 left-4 w-6 h-full flex items-center justify-center pointer-events-none">
               {row.p2 && (
                 <div className="animate-in zoom-in-95 fade-in duration-300">
                    <RaceLetterBadge race={row.p2.race} size="sm" />
                 </div>
               )}
            </div>
            
            {/* 중앙 입력창 */}
            <input 
              ref={p2InputRef}
              type="text" 
              value={row.p2Input}
              onChange={(e) => handleInputChange(2, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && show2 && s2.length > 0) {
                  e.preventDefault();
                  handleEnterSelect(2);
                }
              }}
              onFocus={() => { if (row.p2Input) handleSearch(row.p2Input, 2); }}
              onBlur={() => setTimeout(() => setShow2(false), 200)}
              placeholder="B팀 선수" 
              className="flex-1 h-full bg-transparent pl-[3.35rem] pr-4.5 text-[1.45rem] font-[1000] text-right text-white placeholder:text-white/14 focus:outline-none uppercase tracking-tighter w-full min-w-0"
            />
          </div>
          {/* Autocomplete 2 */}
          {show2 && (
            <div className="absolute top-[64px] left-0 z-[100] w-full overflow-hidden rounded-[1.1rem] border border-white/10 bg-[#05090a]/95 p-1.5 shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl animate-in fade-in slide-in-from-top-1">
               {s2.map(p => (
                 <button
                   key={p.id}
                   onClick={() => { updateRow(row.id, 'p2', p); updateRow(row.id, 'p2Input', p.name); setShow2(false); }}
                   className="w-full flex items-center justify-between rounded-[0.9rem] px-4 py-2.5 text-[1rem] font-[1000] text-white/72 transition-all hover:bg-red-500/[0.09] hover:text-white"
                 >
                   <RaceLetterBadge race={p.race} size="sm" />
                   <span className="truncate pl-3 text-right">{p.name}</span>
                 </button>
               ))}
               {s2.length === 0 && row.p2Input.trim() && (
                 <div className="px-4 py-3 text-right text-[0.92rem] font-[1000] text-white/32">
                   일치하는 선수가 없습니다.
                 </div>
               )}
            </div>
          )}
        </div>
      </div>

      {/* ✅ Action Buttons: Sized Appropriately */}
      <div className="flex w-full items-center gap-2 pt-1 md:w-auto md:pr-3 md:pt-0">
        <button 
          disabled={!isConfirmed} 
          onClick={() => {
            if (isConfirmed) setShowMomentum((prev) => !prev);
          }}
          className={cn(
            "h-[56px] flex-1 px-4 rounded-[1.15rem] font-[1000] uppercase tracking-tight transition-all flex items-center justify-center border md:min-w-[110px] md:flex-none",
            isConfirmed 
              ? "bg-white/[0.04] border-white/10 text-white/78 hover:border-nzu-green/30 hover:bg-nzu-green/[0.06] hover:text-nzu-green text-[1.02rem]" 
              : "bg-white/[0.03] border-white/5 text-white/10 cursor-not-allowed text-[0.98rem]"
          )}
        >
          기세 분석
        </button>
        <button onClick={() => removeRow(row.id)} className="h-[56px] w-[56px] shrink-0 bg-white/[0.03] hover:bg-red-500/[0.08] text-white/15 hover:text-red-400 rounded-[1.15rem] border border-white/6 hover:border-red-500/25 transition-all flex items-center justify-center group/del"><X size={17} /></button>
      </div>
      </div>

      {isMomentumVisible && (
        <div className="rounded-[1.4rem] border border-white/8 bg-[#071011]/92 px-3 py-3 md:px-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[0.82rem] font-[1000] tracking-tight text-white/32">현재 선택 기준 즉시 요약</div>
            <button
              onClick={() => setShowMomentum(false)}
              className="rounded-full border border-white/6 px-2.5 py-1 text-[0.76rem] font-[1000] text-white/28 transition-all hover:border-white/12 hover:text-white/58"
            >
              닫기
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_104px_minmax(0,1fr)]">
            <div className="rounded-[1.1rem] border border-nzu-green/12 bg-nzu-green/[0.04] px-4 py-3">
              <div className="text-[1rem] font-[1000] text-white">{row.p1?.name}</div>
              <div className="mt-2 space-y-2">
                <div>
                  <div className="text-[0.84rem] font-[1000] text-white/35">강한 맵</div>
                  <div className="mt-1 text-[0.98rem] font-[1000] text-white">{leftInsight.strongMap} · {leftInsight.mapRecord}</div>
                  <div className="text-[0.88rem] text-white/55">{leftInsight.raceTarget}</div>
                </div>
                <div>
                  <div className="text-[0.84rem] font-[1000] text-white/35">최근 폼</div>
                  <div className="mt-1 text-[0.98rem] font-[1000] text-white">{leftInsight.recentTone} · {leftInsight.recentRecord}</div>
                </div>
              </div>
            </div>

            <div className="flex flex-row items-center justify-center gap-3 rounded-[1.1rem] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] px-3 py-3 text-center md:flex-col md:gap-2 md:px-2">
              <div className="text-[1.2rem] font-[1000] tracking-tight text-nzu-green drop-shadow-[0_0_12px_rgba(0,255,163,0.22)]">기세</div>
              <div className="h-px w-10 bg-nzu-green/18 md:w-12" />
              <div className="text-[0.92rem] font-[1000] tracking-tight text-white/78">강한 맵</div>
              <div className="hidden h-px w-6 bg-white/8 md:block" />
              <div className="text-[0.92rem] font-[1000] tracking-tight text-white/78">최근 폼</div>
            </div>

            <div className="rounded-[1.1rem] border border-red-500/12 bg-red-500/[0.04] px-4 py-3">
              <div className="text-[1rem] font-[1000] text-white text-right">{row.p2?.name}</div>
              <div className="mt-2 space-y-2 text-right">
                <div>
                  <div className="text-[0.84rem] font-[1000] text-white/35">강한 맵</div>
                  <div className="mt-1 text-[0.98rem] font-[1000] text-white">{rightInsight.strongMap} · {rightInsight.mapRecord}</div>
                  <div className="text-[0.88rem] text-white/55">{rightInsight.raceTarget}</div>
                </div>
                <div>
                  <div className="text-[0.84rem] font-[1000] text-white/35">최근 폼</div>
                  <div className="mt-1 text-[0.98rem] font-[1000] text-white">{rightInsight.recentTone} · {rightInsight.recentRecord}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Page ---
export default function MultiH2HPage() {
  const [rows, setRows] = useState<MatchRow[]>([{ id: crypto.randomUUID(), p1: null, p2: null, p1Input: '', p2Input: '' }]);
  const [allPlayers] = useState<Player[]>(DUMMY_PLAYERS);
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const addRow = () => setRows([...rows, { id: crypto.randomUUID(), p1: null, p2: null, p1Input: '', p2Input: '' }]);
  const removeRow = (id: string) => rows.length > 1 ? setRows(rows.filter(r => r.id !== id)) : setRows([{ id: crypto.randomUUID(), p1: null, p2: null, p1Input: '', p2Input: '' }]);
  const swapPlayers = (id: string) => setRows((prev) => prev.map(r => r.id === id ? { ...r, p1: r.p2, p2: r.p1, p1Input: r.p2Input, p2Input: r.p1Input } : r));
  const updateRow = (id: string, field: keyof MatchRow, value: Player | null | string) => setRows((prev) => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setRows((items) => {
        const oldIndex = items.findIndex(i => i.id === active.id);
        const newIndex = items.findIndex(i => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-[1520px] px-6 py-6 animate-in fade-in duration-700">
        <header className="mb-4 ml-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-baseline justify-center gap-x-4 gap-y-1 md:justify-start">
            <h1 className="text-[2.25rem] font-[1000] tracking-tighter italic text-white">
              매치 <span className="text-nzu-green drop-shadow-[0_0_15px_#00ffa344]">편성</span>
            </h1>
            <p className="text-[14px] font-semibold text-white/45">
              빠르게 매치를 배치하고 팀밸런스를 확인합니다.
            </p>
          </div>

          {SHOW_ENTRY_BOARD_PANEL ? (
            <button className="h-[46px] self-center rounded-[1rem] border border-amber-300/22 bg-amber-300/[0.08] px-4 text-[0.94rem] font-[1000] tracking-tight text-amber-100 transition-all hover:border-amber-200/38 hover:bg-amber-300/[0.14] hover:text-white md:self-auto">
              방송용 엔트리보드 URL
            </button>
          ) : null}
        </header>

        <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-1 px-2">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-nzu-green shadow-[0_0_12px_rgba(0,255,163,0.6)]" />
            <span className="text-[13px] font-black text-nzu-green tracking-wide">전체: 2025.01.01 ~ 현재</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.5)]" />
            <span className="text-[13px] font-black text-red-500 tracking-wide">최근: 최근 3개월 전적</span>
          </div>
        </div>
        <div className={cn("grid gap-4", SHOW_ENTRY_BOARD_PANEL ? "xl:grid-cols-[minmax(0,1fr)_400px]" : "")}>
          <section className="min-w-0">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} modifiers={[restrictToVerticalAxis]}>
              <div className="flex flex-col gap-2.5">
                <SortableContext items={rows.map(r => r.id)} strategy={verticalListSortingStrategy}>
                  {rows.map((row, index) => (
                    <SortableMatchRow key={row.id} row={row} updateRow={updateRow} removeRow={removeRow} swapPlayers={swapPlayers} allPlayers={allPlayers} matchNumber={index + 1} />
                  ))}
                </SortableContext>
                
                <button onClick={addRow} className="w-full py-3.5 mt-0.5 rounded-[1.45rem] border border-nzu-green/18 bg-nzu-green/[0.05] hover:border-nzu-green/40 hover:bg-nzu-green/[0.1] text-nzu-green transition-all flex items-center justify-center gap-3 group">
                   <div className="p-2.5 rounded-[1rem] bg-nzu-green/14 group-hover:bg-nzu-green group-hover:text-black transition-all shadow-xl"><Plus size={18} strokeWidth={4} /></div>
                   <span className="text-[1rem] font-[1000] uppercase tracking-[0.3em]">매치 추가</span>
                </button>
              </div>
            </DndContext>
          </section>

          {SHOW_ENTRY_BOARD_PANEL ? <EntryBoardSidePanel rows={rows} /> : null}
        </div>
      </main>
    </div>
  );
}
