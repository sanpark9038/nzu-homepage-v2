'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { ChevronDown, Plus, RotateCcw, Trophy, X } from 'lucide-react'

import { RaceLetterBadge } from '@/components/ui/race-letter-badge'
import { TierBadge, getTierTone } from '@/components/ui/nzu-badges'
import {
  buildH2HCacheKey,
  fetchH2HStats,
  filterMatchupPlayers,
  reportMatchupRuntimeIssue,
  unpackMatchupPlayersPayload,
  unpackMatchupPlayerSummaries,
  type MatchupPlayerSummary,
  type PackedMatchupPlayersPayload,
  type PackedMatchupPlayerSummary,
} from '@/lib/matchup-helpers'
import { getTierSortWeight } from '@/lib/tier-order'
import { getUniversityLabel, UNIVERSITY_MAP } from '@/lib/university-config'
import { cn, normalizeTier } from '@/lib/utils'
import type { H2HStats } from '@/types'

type Player = MatchupPlayerSummary

type UniversityOption = {
  code: string
  name: string
  stars?: number
}

type Match = {
  id: string
  p1: Player
  p2: Player
  h2h?: H2HStats | null
  h2hStatus?: 'idle' | 'loading' | 'ready' | 'empty' | 'error'
}

type H2HLookupProps = {
  players?: MatchupPlayerSummary[]
  packedPlayers?: PackedMatchupPlayerSummary[]
  packedPlayersPayload?: PackedMatchupPlayersPayload
  recentMatches?: unknown[]
  universityOptions?: UniversityOption[]
}

const EXCLUDED_TIERS = ['잭', '조커', '스페이드', '9', '미정']
const EMPTY_PACKED_PLAYERS: PackedMatchupPlayerSummary[] = []

function getMatchupStats(stats: H2HStats | null | undefined) {
  if (!stats) return null
  return {
    overall: [stats.summary.wins, stats.summary.losses] as const,
    recent: [stats.summary.momentum90.wins, stats.summary.momentum90.losses] as const,
  }
}

const EMPTY_H2H_STATS: H2HStats = {
  summary: {
    total: 0,
    wins: 0,
    losses: 0,
    winRate: '0.0',
    momentum90: {
      total: 0,
      wins: 0,
      losses: 0,
      winRate: '0.0',
    },
  },
  mapStats: {},
  recentMatches: [],
}

function buildGroupedMatches(matchList: Match[]) {
  const groups: { p1Id: string; entries: Array<{ match: Match; index: number }> }[] = []

  matchList.forEach((match, index) => {
    const last = groups[groups.length - 1]
    if (last && last.p1Id === match.p1.id) {
      last.entries.push({ match, index })
      return
    }

    groups.push({ p1Id: match.p1.id, entries: [{ match, index }] })
  })

  return groups
}

function SortableMatchGroup({
  groupKey,
  isGrouped,
  tone,
  children,
}: {
  groupKey: string
  isGrouped: boolean
  tone: { hex: string }
  children: (isDragging: boolean) => React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: groupKey })
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        borderLeft: `8px solid ${isGrouped ? '#2ed573' : tone.hex}`,
      }}
      {...attributes}
      {...listeners}
      className={cn(
        'overflow-hidden rounded-2xl border transition-[background-color,border-color,box-shadow,ring-color,border-radius]',
        isGrouped
          ? 'border-nzu-green/30 bg-nzu-green/[0.03] shadow-[0_0_30px_rgba(46,213,115,0.05)]'
          : 'border-white/5 bg-white/[0.02] shadow-xl',
        isDragging && 'z-50 rounded-2xl bg-[#1A221F] ring-2 ring-nzu-green/50',
      )}
    >
      {children(isDragging)}
    </div>
  )
}

export default function H2HLookup({
  players,
  packedPlayers = EMPTY_PACKED_PLAYERS,
  packedPlayersPayload,
  universityOptions = [],
}: H2HLookupProps) {
  const initialPlayers = useMemo(() => {
    if (players) return players
    if (packedPlayersPayload) return unpackMatchupPlayersPayload(packedPlayersPayload)
    return unpackMatchupPlayerSummaries(packedPlayers)
  }, [packedPlayers, packedPlayersPayload, players])
  const [p1, setP1] = useState<Player | null>(null)
  const [p2, setP2] = useState<Player | null>(null)
  const [u1, setU1] = useState('')
  const [u2, setU2] = useState('')
  const [hideEmptyTiers, setHideEmptyTiers] = useState(true)
  const [matches, setMatches] = useState<Match[]>([])
  // 결과 패널 너비. null이면 CSS 기본값(lg:w-[520px]) 사용, 리사이즈하면 px 고정.
  const [panelWidth, setPanelWidth] = useState<number | null>(null)
  const [isDesktop, setIsDesktop] = useState(false)

  const matchIdCounter = useRef(0)
  const h2hRequestCacheRef = useRef<Map<string, Promise<H2HStats | null>>>(new Map())

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const update = () => setIsDesktop(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  // 엔트리↔결과 패널 사이 핸들로 결과 패널 너비 조절. 왼쪽으로 끌수록 패널이 넓어진다.
  const clampPanelWidth = (width: number) => Math.min(820, Math.max(340, width))

  const beginResize = useCallback((startX: number) => {
    const startWidth = panelWidth ?? 520
    const onMouseMove = (e: MouseEvent) => setPanelWidth(clampPanelWidth(startWidth + (startX - e.clientX)))
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      setPanelWidth(clampPanelWidth(startWidth + (startX - e.touches[0].clientX)))
    }
    const stop = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', stop)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', stop)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', stop)
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('touchend', stop)
  }, [panelWidth])

  const onResizeKeyDown = useCallback((e: React.KeyboardEvent) => {
    const current = panelWidth ?? 520
    if (e.key === 'ArrowLeft') { e.preventDefault(); setPanelWidth(clampPanelWidth(current + 24)) }
    else if (e.key === 'ArrowRight') { e.preventDefault(); setPanelWidth(clampPanelWidth(current - 24)) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPanelWidth(null) }
  }, [panelWidth])

  const resetEntryBoard = useCallback(() => {
    setMatches([])
    setP1(null)
    setP2(null)
  }, [])

  const nextMatchId = useCallback(() => {
    matchIdCounter.current += 1
    return `m_${matchIdCounter.current}`
  }, [])

  const requestH2HStats = useCallback((left: Player, right: Player) => {
    const queryKey = buildH2HCacheKey(left, right)
    const cached = h2hRequestCacheRef.current.get(queryKey)
    if (cached) return cached

    const promise = fetchH2HStats(left, right).then((payload) => {
      if (!payload) {
        h2hRequestCacheRef.current.delete(queryKey)
      }
      return payload
    })
    h2hRequestCacheRef.current.set(queryKey, promise)
    promise.catch(() => {
      h2hRequestCacheRef.current.delete(queryKey)
    })
    return promise
  }, [])

  const groupPlayers = useCallback((players: Player[]) => {
    const groups: Record<string, Player[]> = {}

    players.forEach((player) => {
      const tier = player.tier || '미정'
      if (!groups[tier]) groups[tier] = []
      groups[tier].push(player)
    })

    return Object.keys(groups)
      .sort((a, b) => getTierSortWeight(a) - getTierSortWeight(b))
      .map((tier) => ({
        tier,
        players: [...groups[tier]].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko')),
      }))
  }, [])

  const universityNameMap = useMemo(
    () => Object.fromEntries(universityOptions.map((option) => [option.code, option.name])) as Record<string, string>,
    [universityOptions]
  )

  const getUniversityDisplayName = useCallback(
    (code: string) => universityNameMap[code] || getUniversityLabel(code),
    [universityNameMap]
  )

  const sortedUniversities = useMemo(() => {
    const codes = universityOptions.length > 0 ? universityOptions.map((option) => option.code) : Object.keys(UNIVERSITY_MAP)

    return codes.sort((a, b) => {
      const nameA = getUniversityDisplayName(a)
      const nameB = getUniversityDisplayName(b)
      const isFaA = nameA === '무소속'
      const isFaB = nameB === '무소속'

      if (isFaA !== isFaB) return isFaA ? 1 : -1

      const isKorean = (value: string) => /[\u3131-\u314e\u314f-\u3163\uac00-\ud7a3]/.test(value)
      if (isKorean(nameA) !== isKorean(nameB)) return isKorean(nameA) ? -1 : 1
      return nameA.localeCompare(nameB, 'ko')
    })
  }, [getUniversityDisplayName, universityOptions])

  const players1 = useMemo(() => {
    if (!u1) return []
    return filterMatchupPlayers(initialPlayers, { university: u1 }).map((player) => ({
      ...player,
      tier: normalizeTier(player.tier),
    }))
  }, [initialPlayers, u1])

  const players2 = useMemo(() => {
    if (!u2) return []
    return filterMatchupPlayers(initialPlayers, { university: u2 }).map((player) => ({
      ...player,
      tier: normalizeTier(player.tier),
    }))
  }, [initialPlayers, u2])

  const groups1 = useMemo(() => groupPlayers(players1), [groupPlayers, players1])
  const groups2 = useMemo(() => groupPlayers(players2), [groupPlayers, players2])

  const arenaTiers = useMemo(() => {
    const allUniqueTiers = Array.from(new Set([...groups1.map((group) => group.tier), ...groups2.map((group) => group.tier)]))
    const sortedTiers = allUniqueTiers.sort((a, b) => getTierSortWeight(a) - getTierSortWeight(b))

    return sortedTiers.filter((tier) => {
      const leftGroup = groups1.find((group) => group.tier === tier)
      const rightGroup = groups2.find((group) => group.tier === tier)
      const hasPlayers = (leftGroup?.players.length || 0) + (rightGroup?.players.length || 0) > 0

      if (!hasPlayers) return false
      if (!hideEmptyTiers) return true
      if (EXCLUDED_TIERS.includes(tier)) return false
      if (u1 && u2) return (leftGroup?.players.length || 0) > 0 && (rightGroup?.players.length || 0) > 0
      return true
    })
  }, [groups1, groups2, hideEmptyTiers, u1, u2])

  const addMatch = useCallback(
    (left: Player, right: Player) => {
      if (matches.some((match) => match.p1.id === left.id && match.p2.id === right.id)) return

      const newMatch: Match = { id: nextMatchId(), p1: left, p2: right, h2hStatus: 'loading' }
      setMatches((prev) => [...prev, newMatch])

      requestH2HStats(left, right).then((data) => {
        setMatches((prev) =>
          prev.map((match) =>
            match.id === newMatch.id
              ? {
                  ...match,
                  h2h: data,
                  h2hStatus: (data?.summary?.total || 0) > 0 ? 'ready' : 'empty',
                }
              : match
          )
        )
      }).catch((error) => {
        reportMatchupRuntimeIssue('Entry quick-add H2H fetch failed', error)
        setMatches((prev) =>
          prev.map((match) => (match.id === newMatch.id ? { ...match, h2h: null, h2hStatus: 'error' } : match))
        )
      })
    },
    [matches, nextMatchId, requestH2HStats]
  )

  const autoMatch = useCallback(() => {
    if (!u1 || !u2) return

    const newMatches: Match[] = []

    arenaTiers.forEach((tier) => {
      const leftGroup = groups1.find((group) => group.tier === tier)
      const rightGroup = groups2.find((group) => group.tier === tier)
      if (!leftGroup || !rightGroup) return

      leftGroup.players.forEach((left) => {
        rightGroup.players.forEach((right) => {
          if (!matches.some((match) => match.p1.id === left.id && match.p2.id === right.id)) {
            newMatches.push({ id: nextMatchId(), p1: left, p2: right, h2hStatus: 'loading' })
          }
        })
      })
    })

    if (newMatches.length === 0) return

    setMatches((prev) => [...prev, ...newMatches])
    newMatches.forEach((match) => {
      requestH2HStats(match.p1, match.p2).then((data) => {
        setMatches((prev) =>
          prev.map((entry) =>
            entry.id === match.id
              ? {
                  ...entry,
                  h2h: data,
                  h2hStatus: (data?.summary?.total || 0) > 0 ? 'ready' : 'empty',
                }
              : entry
          )
        )
      }).catch((error) => {
        reportMatchupRuntimeIssue('Entry auto-match H2H fetch failed', error)
        setMatches((prev) =>
          prev.map((entry) => (entry.id === match.id ? { ...entry, h2h: null, h2hStatus: 'error' } : entry))
        )
      })
    })
  }, [arenaTiers, groups1, groups2, matches, nextMatchId, requestH2HStats, u1, u2])

  const removeMatch = useCallback((id: string) => {
    setMatches((prev) => prev.filter((match) => match.id !== id))
  }, [])

  // 왼쪽·오른쪽 한 명씩 찍으면 그 대진을 바로 매치 목록에 추가한다. 같은 선수 재클릭은 선택 해제.
  const pickLeft = useCallback((player: Player) => {
    if (p2) {
      addMatch(player, p2)
      setP1(null)
      setP2(null)
      return
    }
    setP1((current) => (current?.id === player.id ? null : player))
  }, [p2, addMatch])

  const pickRight = useCallback((player: Player) => {
    if (p1) {
      addMatch(p1, player)
      setP1(null)
      setP2(null)
      return
    }
    setP2((current) => (current?.id === player.id ? null : player))
  }, [p1, addMatch])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setMatches((prev) => {
      const groups = buildGroupedMatches(prev)
      const ids = groups.map(g => `${g.p1Id}:${g.entries[0].match.id}`)
      const oldIndex = ids.indexOf(String(active.id))
      const newIndex = ids.indexOf(String(over.id))
      if (oldIndex === -1 || newIndex === -1) return prev
      return arrayMove(groups, oldIndex, newIndex).flatMap(g => g.entries.map(e => e.match))
    })
  }, [])

  // distance 임계값 없이는 dnd-kit 포인터 센서가 카드 안 X 버튼 클릭을 삼킨다. 8px 이동 전엔 클릭으로 통과.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const groupedMatches = useMemo(() => buildGroupedMatches(matches), [matches])

  return (
    <div className="w-full space-y-16">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-0">
        <div className="min-w-0 flex-1 space-y-6">
          <div className="rounded-[2rem] border border-white/10 bg-[#0A100D] p-6 shadow-2xl">
            <div className="flex flex-col gap-6 md:flex-row md:items-center">
              <div className="flex-1">
                <div className="relative">
                  <select
                    value={u1}
                    onChange={(event) => {
                      resetEntryBoard()
                      setU1(event.target.value)
                    }}
                    className="e-select"
                  >
                    <option value="">왼쪽 학교 선택</option>
                    {sortedUniversities.map((code) => (
                      <option key={code} value={code}>
                        {getUniversityDisplayName(code)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="e-caret h-4 w-4" />
                </div>
              </div>

              <div className="flex shrink-0 gap-3">
                <button
                  onClick={() => setHideEmptyTiers((value) => !value)}
                  className={cn(
                    'rounded-2xl px-6 py-4 text-lg font-black tracking-tight shadow-lg transition-all active:scale-95',
                    hideEmptyTiers
                      ? 'bg-nzu-green text-black hover:brightness-110'
                      : 'border border-white/10 bg-white/5 text-white/40 hover:bg-white/10'
                  )}
                >
                  대전용필터
                </button>
                <button
                  onClick={autoMatch}
                  disabled={!u1 || !u2}
                  className={cn(
                    'flex items-center gap-2 rounded-2xl px-7 py-4 text-lg font-bold shadow-xl transition-all',
                    !u1 || !u2
                      ? 'cursor-not-allowed bg-white/10 text-white/30'
                      : 'bg-white text-black hover:bg-nzu-green hover:text-black active:scale-95'
                  )}
                >
                  <Plus className="h-6 w-6" />
                  자동 매치
                </button>
                <button
                  onClick={() => setMatches([])}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4 text-white/20 shadow-lg transition-all hover:bg-red-500/10 hover:text-red-500"
                >
                  <RotateCcw className="h-6 w-6" />
                </button>
              </div>

              <div className="flex-1">
                <div className="relative">
                  <select
                    value={u2}
                    onChange={(event) => {
                      resetEntryBoard()
                      setU2(event.target.value)
                    }}
                    className="e-select"
                  >
                    <option value="">오른쪽 학교 선택</option>
                    {sortedUniversities.map((code) => (
                      <option key={code} value={code}>
                        {getUniversityDisplayName(code)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="e-caret h-4 w-4" />
                </div>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 border-t-2 border-t-nzu-green/30 bg-[#050706] shadow-[0_0_50px_rgba(0,0,0,0.5)]">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-nzu-green/50 to-transparent shadow-[0_0_15px_#2ed573]" />
            <div className="grid grid-cols-[1fr_84px_1fr] items-center border-b border-white/5 bg-white/[0.04] px-6 py-4 text-left backdrop-blur-md">
              <span className="truncate text-xl font-black tracking-tight text-white/90">
                {u1 ? getUniversityDisplayName(u1) : '왼쪽 학교'}
              </span>
              <div className="text-center" />
              <span className="truncate text-right text-xl font-black tracking-tight text-white/90">
                {u2 ? getUniversityDisplayName(u2) : '오른쪽 학교'}
              </span>
            </div>

            <div className="h-[700px] overflow-y-auto p-2 custom-scrollbar">
              {arenaTiers.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <p className="text-sm font-bold text-white/20">학교를 선택하면 대전용 필터 결과가 여기에 표시됩니다.</p>
                </div>
              ) : (
                arenaTiers.map((tier) => {
                  const leftGroup = groups1.find((group) => group.tier === tier)
                  const rightGroup = groups2.find((group) => group.tier === tier)

                  return (
                    <div
                      key={tier}
                      className="grid min-h-[68px] grid-cols-[1fr_84px_1fr] border-b border-white/[0.03] transition-colors hover:bg-white/[0.01]"
                    >
                      <div className="flex flex-wrap items-center justify-end gap-2.5 p-3 pr-4">
                        {leftGroup?.players.map((player) => (
                          <button
                            key={player.id}
                            onClick={() => pickLeft(player)}
                            className={cn(
                              'relative flex items-center gap-3 rounded-xl border-2 px-4 py-2.5 text-base font-black shadow-lg transition-all duration-200',
                              p1?.id === player.id
                                ? 'z-10 scale-105 border-nzu-green bg-nzu-green text-black'
                                : 'border-white/5 bg-[#0D1210] text-white/70 hover:border-white/25 hover:text-white'
                            )}
                          >
                            <span>{player.name}</span>
                            <RaceLetterBadge race={player.race} size="sm" />
                          </button>
                        ))}
                      </div>

                      <div className="relative flex items-center justify-center border-x border-white/[0.03] bg-black/40">
                        <TierBadge tier={tier} size="sm" className="min-w-[56px] justify-center shadow-2xl" />
                      </div>

                      <div className="flex flex-wrap items-center justify-start gap-2.5 p-3 pl-4">
                        {rightGroup?.players.map((player) => (
                          <button
                            key={player.id}
                            onClick={() => pickRight(player)}
                            className={cn(
                              'relative flex items-center gap-3 rounded-xl border-2 px-4 py-2.5 text-base font-black shadow-lg transition-all duration-200',
                              p2?.id === player.id
                                ? 'z-10 scale-105 border-nzu-green bg-nzu-green text-black'
                                : 'border-white/5 bg-[#0D1210] text-white/70 hover:border-white/25 hover:text-white'
                            )}
                          >
                            <RaceLetterBadge race={player.race} size="sm" />
                            <span>{player.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="결과 패널 너비 조절"
          tabIndex={0}
          onMouseDown={(e) => { e.preventDefault(); beginResize(e.clientX) }}
          onTouchStart={(e) => beginResize(e.touches[0].clientX)}
          onKeyDown={onResizeKeyDown}
          onDoubleClick={() => setPanelWidth(null)}
          title="드래그·좌우 화살표로 너비 조절 · 더블클릭/Enter로 초기화"
          className="group hidden shrink-0 cursor-col-resize items-center justify-center self-stretch px-1.5 lg:flex"
        >
          <div className="h-28 w-1.5 rounded-full bg-white/10 transition-colors group-hover:bg-nzu-green/60 group-focus-visible:bg-nzu-green/60" />
        </div>

        <div
          style={isDesktop && panelWidth != null ? { width: panelWidth } : undefined}
          className="mt-2 flex h-[760px] w-full flex-col overflow-hidden rounded-[2.5rem] border border-white/10 bg-background shadow-[0_30px_60px_rgba(0,0,0,0.8)] lg:sticky lg:top-8 lg:w-[520px]"
        >
          <div className="flex items-center justify-between border-b border-white/5 bg-gradient-to-b from-white/[0.04] to-transparent p-7">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-nzu-gold/20 bg-nzu-gold/10">
                <Trophy className="h-5 w-5 text-nzu-gold" />
              </div>
              <div>
                <h2 className="text-2xl font-black uppercase tracking-tighter text-white">자동 매치 결과</h2>
              </div>
            </div>

            <div className="cursor-default rounded-xl border border-nzu-green/30 bg-gradient-to-r from-nzu-green/20 to-nzu-green/5 px-5 py-2 shadow-inner">
              <span className="text-sm font-black tabular-nums text-nzu-green">
                {matches.length} <span className="text-[10px] opacity-60">매치</span>
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
            {matches.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
                <div className="text-sm font-bold text-white/45">아직 추가된 대진이 없습니다</div>
                <p className="text-xs font-medium leading-relaxed text-white/25">
                  양쪽에서 선수를 하나씩 클릭하면 대진이 추가됩니다.
                  <br />
                  또는 <span className="font-bold text-nzu-green/70">자동 매치</span>로 한 번에 채우세요.
                </p>
              </div>
            ) : (
            <DndContext sensors={sensors} onDragEnd={handleDragEnd} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]}>
              <SortableContext
                items={groupedMatches.map(g => `${g.p1Id}:${g.entries[0].match.id}`)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-4">
                    {groupedMatches.map((group) => {
                      const isGrouped = group.entries.length > 1
                      const tierKey = normalizeTier(group.entries[0].match.p1.tier)
                      const tone = getTierTone(tierKey)
                      const groupKey = `${group.p1Id}:${group.entries[0].match.id}`

                      return (
                        <SortableMatchGroup key={groupKey} groupKey={groupKey} isGrouped={isGrouped} tone={tone}>
                          {(isDragging) => (
                            <>
                              {group.entries.map(({ match }, index) => {
                                const matchupStats = getMatchupStats(match.h2h)
                                const displayMatchupStats =
                                  matchupStats || (match.h2hStatus === 'empty' ? getMatchupStats(EMPTY_H2H_STATS) : null)

                                return (
                                  <div
                                    key={match.id}
                                    className={cn(
                                      'group relative grid grid-cols-[44px_minmax(0,1fr)_82px_minmax(0,1fr)_34px] items-center gap-x-1.5 px-3 py-2.5 transition-[background-color,box-shadow,ring-color,border-radius]',
                                      index !== 0 && 'border-t border-white/[0.02]',
                                      !isDragging && 'hover:bg-white/[0.05]'
                                    )}
                                  >
                                    <div className="flex justify-center">
                                      <TierBadge tier={match.p1.tier} size="sm" className="min-w-[40px] px-1 shadow-inner" />
                                    </div>

                                    <div className="flex min-w-0 items-center gap-1 truncate px-0.5 text-left">
                                      <span
                                        className={cn(
                                          'block min-w-0 truncate text-lg font-black transition-colors md:text-xl',
                                          index === 0 ? 'text-white' : 'text-white/30'
                                        )}
                                      >
                                        {match.p1.name}
                                      </span>
                                      <RaceLetterBadge race={match.p1.race} size="sm" />
                                    </div>

                                    <div className="flex items-center justify-center">
                                      {displayMatchupStats ? (
                                        <div className="flex min-w-[82px] flex-col items-center animate-in fade-in zoom-in-90 duration-300">
                                          <div className="flex min-w-[82px] items-center justify-center gap-1">
                                            <span className="min-w-[18px] text-right text-[1.28rem] font-bold italic leading-none tabular-nums text-nzu-green md:text-[1.45rem]">
                                              {displayMatchupStats.overall[0]}
                                            </span>
                                            <span className="min-w-[34px] px-1 text-center text-[11px] font-semibold italic text-nzu-green/68">
                                              전체
                                            </span>
                                            <span className="min-w-[18px] text-left text-[1.28rem] font-bold italic leading-none tabular-nums text-nzu-green md:text-[1.45rem]">
                                              {displayMatchupStats.overall[1]}
                                            </span>
                                          </div>
                                          <div className="my-0.5 h-px w-[74px] bg-gradient-to-r from-transparent via-white/7 to-transparent" />
                                          <div className="flex min-w-[82px] items-center justify-center gap-1 opacity-75">
                                            <span className="min-w-[16px] text-right text-[1rem] font-bold italic leading-none tabular-nums text-red-500/85 md:text-[1.08rem]">
                                              {displayMatchupStats.recent[0]}
                                            </span>
                                            <span className="min-w-[34px] text-center text-[11px] font-semibold italic text-red-500/45">
                                              최근
                                            </span>
                                            <span className="min-w-[16px] text-left text-[1rem] font-bold italic leading-none tabular-nums text-red-500/85 md:text-[1.08rem]">
                                              {displayMatchupStats.recent[1]}
                                            </span>
                                          </div>
                                        </div>
                                      ) : match.h2hStatus === 'error' ? (
                                        <div className="flex min-w-[82px] flex-col items-center gap-1">
                                          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-red-400/80">
                                            조회 실패
                                          </span>
                                          <span className="text-[11px] font-semibold italic text-white/18">
                                            재시도 필요
                                          </span>
                                        </div>
                                      ) : (
                                        <div className="flex min-w-[82px] flex-col items-center gap-1.5">
                                          <div className="h-5 w-16 animate-pulse rounded-full bg-white/5" />
                                          <div className="h-4 w-14 animate-pulse rounded-full bg-white/[0.04]" />
                                        </div>
                                      )}
                                    </div>

                                    <div className="flex min-w-0 items-center justify-end gap-1 truncate px-0.5">
                                      <RaceLetterBadge race={match.p2.race} size="sm" />
                                      <span className="min-w-0 truncate text-lg font-black text-white transition-colors group-hover:text-nzu-green md:text-xl">
                                        {match.p2.name}
                                      </span>
                                    </div>

                                    <button
                                      aria-label="이 대진 제거"
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        removeMatch(match.id)
                                      }}
                                      className="flex justify-center rounded-lg p-1.5 text-white/35 opacity-100 transition-all hover:bg-red-500/10 hover:text-red-500 md:opacity-0 md:group-hover:opacity-100"
                                    >
                                      <X className="h-5 w-5" />
                                    </button>
                                  </div>
                                )
                              })}
                            </>
                          )}
                        </SortableMatchGroup>
                      )
                    })}
                </div>
              </SortableContext>
            </DndContext>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
