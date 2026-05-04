'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd'
import { Activity, Plus, RotateCcw, Swords, Trophy, X, Zap } from 'lucide-react'

import { RaceLetterBadge } from '@/components/ui/race-letter-badge'
import { TierBadge, getTierTone } from '@/components/ui/nzu-badges'
import { buildH2HCacheKey, fetchH2HStats, filterMatchupPlayers, reportMatchupRuntimeIssue, type MatchupPlayerSummary } from '@/lib/matchup-helpers'
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
  recentMatches?: unknown[]
  universityOptions?: UniversityOption[]
}

const EXCLUDED_TIERS = ['미정', '조커', '스페이드']

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

export default function H2HLookup({
  players: initialPlayers = [],
  universityOptions = [],
}: H2HLookupProps) {
  const [p1, setP1] = useState<Player | null>(null)
  const [p2, setP2] = useState<Player | null>(null)
  const [results, setResults] = useState<H2HStats | null>(null)
  const [resultResolvedKey, setResultResolvedKey] = useState<string | null>(null)
  const [resultFailedKey, setResultFailedKey] = useState<string | null>(null)
  const [u1, setU1] = useState('')
  const [u2, setU2] = useState('')
  const [hideEmptyTiers, setHideEmptyTiers] = useState(true)
  const [matches, setMatches] = useState<Match[]>([])

  const matchIdCounter = useRef(0)
  const h2hRequestCacheRef = useRef<Map<string, Promise<H2HStats | null>>>(new Map())
  const activeResultRequestKeyRef = useRef<string | null>(null)

  const resetEntryBoard = useCallback(() => {
    setMatches([])
    setP1(null)
    setP2(null)
    setResults(null)
    setResultResolvedKey(null)
    setResultFailedKey(null)
    activeResultRequestKeyRef.current = null
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

  const selectedResultKey = useMemo(() => {
    if (!p1 || !p2) return null
    return buildH2HCacheKey(p1, p2)
  }, [p1, p2])

  const currentResult = selectedResultKey && resultResolvedKey === selectedResultKey ? results : null
  const resultStatus = !selectedResultKey
    ? 'idle'
    : resultFailedKey === selectedResultKey
      ? 'error'
      : resultResolvedKey === selectedResultKey
        ? (currentResult?.summary?.total || 0) > 0
          ? 'ready'
          : 'empty'
        : 'loading'
  const displayResult = resultStatus === 'empty' ? EMPTY_H2H_STATS : currentResult

  const selectP1 = useCallback((player: Player) => {
    setResults(null)
    setResultResolvedKey(null)
    setResultFailedKey(null)
    activeResultRequestKeyRef.current = null
    setP1((current) => (current?.id === player.id ? null : player))
  }, [])

  const selectP2 = useCallback((player: Player) => {
    setResults(null)
    setResultResolvedKey(null)
    setResultFailedKey(null)
    activeResultRequestKeyRef.current = null
    setP2((current) => (current?.id === player.id ? null : player))
  }, [])

  useEffect(() => {
    if (!p1 || !p2 || !selectedResultKey) return

    activeResultRequestKeyRef.current = selectedResultKey
    requestH2HStats(p1, p2)
      .then((data) => {
        if (activeResultRequestKeyRef.current !== selectedResultKey) return
        setResults(data)
        setResultResolvedKey(selectedResultKey)
        setResultFailedKey(null)
      })
      .catch((error) => {
        if (activeResultRequestKeyRef.current !== selectedResultKey) return
        reportMatchupRuntimeIssue('Entry H2H fetch failed', error)
        setResults(null)
        setResultResolvedKey(null)
        setResultFailedKey(selectedResultKey)
      })
  }, [p1, p2, requestH2HStats, selectedResultKey])

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
    if (!u1 || !u2) {
      alert('양쪽 학교를 모두 선택해 주세요.')
      return
    }

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

  const handleDragEnd = useCallback((result: DropResult) => {
    if (!result.destination || result.destination.index === result.source.index) return
    const destination = result.destination

    setMatches((prev) => {
      const groups = buildGroupedMatches(prev).map((group) => group.entries.map((entry) => entry.match))
      const [reorderedGroup] = groups.splice(result.source.index, 1)
      groups.splice(destination.index, 0, reorderedGroup)
      return groups.flat()
    })
  }, [])

  const groupedMatches = useMemo(() => buildGroupedMatches(matches), [matches])

  return (
    <div className="w-full space-y-16">
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        <div className="flex-1 space-y-6">
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
                    className="w-full appearance-none rounded-2xl border-2 border-nzu-green/20 bg-black px-6 py-4 text-base font-black text-white outline-none transition-all focus:border-nzu-green focus:ring-4 focus:ring-nzu-green/10"
                  >
                    <option value="">왼쪽 학교 선택</option>
                    {sortedUniversities.map((code) => (
                      <option key={code} value={code}>
                        {getUniversityDisplayName(code)}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-nzu-green/40">v</div>
                </div>
              </div>

              <div className="flex shrink-0 gap-3">
                <button
                  onClick={() => setHideEmptyTiers((value) => !value)}
                  className={cn(
                    'rounded-2xl px-6 py-4 text-sm font-black uppercase tracking-widest shadow-lg transition-all active:scale-95',
                    hideEmptyTiers
                      ? 'bg-nzu-green text-black hover:brightness-110'
                      : 'border border-white/10 bg-white/5 text-white/40 hover:bg-white/10'
                  )}
                >
                  대전용필터
                </button>
                <button
                  onClick={autoMatch}
                  className="flex items-center gap-2 rounded-2xl bg-white px-7 py-4 text-base font-bold text-black shadow-xl transition-all hover:bg-nzu-green hover:text-black active:scale-95"
                >
                  <Plus className="h-5 w-5" />
                  자동 매치
                </button>
                <button
                  onClick={() => setMatches([])}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4 text-white/20 shadow-lg transition-all hover:bg-red-500/10 hover:text-red-500"
                >
                  <RotateCcw className="h-5 w-5" />
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
                    className="w-full appearance-none rounded-2xl border-2 border-nzu-green/20 bg-black px-6 py-4 text-base font-black text-white outline-none transition-all focus:border-nzu-green focus:ring-4 focus:ring-nzu-green/10"
                  >
                    <option value="">오른쪽 학교 선택</option>
                    {sortedUniversities.map((code) => (
                      <option key={code} value={code}>
                        {getUniversityDisplayName(code)}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-nzu-green/40">v</div>
                </div>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 border-t-2 border-t-nzu-green/30 bg-[#050706] shadow-[0_0_50px_rgba(0,0,0,0.5)]">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-nzu-green/50 to-transparent shadow-[0_0_15px_#2ed573]" />
            <div className="grid grid-cols-[1fr_120px_1fr] items-center border-b border-white/5 bg-white/[0.04] px-10 py-7 text-left backdrop-blur-md">
              <span className="truncate text-2xl font-black tracking-tight text-white/90">
                {getUniversityDisplayName(u1) || '왼쪽 학교'}
              </span>
              <div className="text-center" />
              <span className="truncate text-right text-2xl font-black tracking-tight text-white/90">
                {getUniversityDisplayName(u2) || '오른쪽 학교'}
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
                      className="grid min-h-[90px] grid-cols-[1fr_120px_1fr] border-b border-white/[0.03] transition-colors hover:bg-white/[0.01]"
                    >
                      <div className="flex flex-wrap items-center justify-end gap-3 p-4 pr-6">
                        {leftGroup?.players.map((player) => (
                          <button
                            key={player.id}
                            onClick={() => selectP1(player)}
                            className={cn(
                              'relative flex items-center gap-4 rounded-xl border-2 px-5 py-3 text-base font-black shadow-lg transition-all duration-300',
                              p1?.id === player.id
                                ? 'z-10 scale-105 border-nzu-green bg-nzu-green text-black'
                                : 'border-white/5 bg-[#0D1210] text-white/40 hover:border-white/20 hover:text-white'
                            )}
                          >
                            <span>{player.name}</span>
                            <RaceLetterBadge race={player.race} size="sm" />
                          </button>
                        ))}
                      </div>

                      <div className="relative flex items-center justify-center border-x border-white/[0.03] bg-black/40">
                        <TierBadge tier={tier} size="sm" className="min-w-[72px] justify-center shadow-2xl" />
                      </div>

                      <div className="flex flex-wrap items-center justify-start gap-3 p-4 pl-6">
                        {rightGroup?.players.map((player) => (
                          <button
                            key={player.id}
                            onClick={() => selectP2(player)}
                            className={cn(
                              'relative flex items-center gap-4 rounded-xl border-2 px-5 py-3 text-base font-black shadow-lg transition-all duration-300',
                              p2?.id === player.id
                                ? 'z-10 scale-105 border-nzu-green bg-nzu-green text-black'
                                : 'border-white/5 bg-[#0D1210] text-white/40 hover:border-white/20 hover:text-white'
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

        <div className="mt-2 flex h-[760px] w-full flex-col overflow-hidden rounded-[2.5rem] border border-white/10 bg-background shadow-[0_30px_60px_rgba(0,0,0,0.8)] lg:sticky lg:top-8 lg:w-[520px]">
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
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="entry-list">
                {(provided) => (
                  <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-4">
                    {groupedMatches.map((group, groupIndex) => {
                      const isGrouped = group.entries.length > 1
                      const tierKey = normalizeTier(group.entries[0].match.p1.tier)
                      const tone = getTierTone(tierKey)
                      const groupKey = `${group.p1Id}:${group.entries[0].match.id}`

                      return (
                        <Draggable key={groupKey} draggableId={groupKey} index={groupIndex}>
                          {(dragProvided, snapshot) => (
                            <div
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              {...dragProvided.dragHandleProps}
                              className={cn(
                                'overflow-hidden rounded-2xl border transition-[background-color,border-color,box-shadow,ring-color,border-radius]',
                                isGrouped
                                  ? 'border-nzu-green/30 bg-nzu-green/[0.03] shadow-[0_0_30px_rgba(46,213,115,0.05)]'
                                  : 'border-white/5 bg-white/[0.02] shadow-xl',
                                snapshot.isDragging && 'z-50 rounded-2xl bg-[#1A221F] ring-2 ring-nzu-green/50',
                                snapshot.isDropAnimating && 'ring-1 ring-nzu-green/30'
                              )}
                              style={{
                                ...dragProvided.draggableProps.style,
                                borderLeft: `8px solid ${isGrouped ? '#2ed573' : tone.hex}`,
                              }}
                            >
                              {group.entries.map(({ match }, index) => {
                                const matchupStats = getMatchupStats(match.h2h)
                                const displayMatchupStats =
                                  matchupStats || (match.h2hStatus === 'empty' ? getMatchupStats(EMPTY_H2H_STATS) : null)

                                return (
                                  <div
                                    key={match.id}
                                    className={cn(
                                      'group relative grid grid-cols-[44px_minmax(0,1fr)_82px_minmax(0,1fr)_24px] items-center gap-x-1.5 px-3 py-2.5 transition-[background-color,box-shadow,ring-color,border-radius]',
                                      index !== 0 && 'border-t border-white/[0.02]',
                                      !snapshot.isDragging && 'hover:bg-white/[0.05]'
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
                                            <span className="min-w-[18px] text-right text-[1.28rem] font-[1000] italic leading-none tabular-nums text-nzu-green md:text-[1.45rem]">
                                              {displayMatchupStats.overall[0]}
                                            </span>
                                            <span className="min-w-[34px] px-1 text-center text-[11px] font-[1000] italic text-nzu-green/68">
                                              전체
                                            </span>
                                            <span className="min-w-[18px] text-left text-[1.28rem] font-[1000] italic leading-none tabular-nums text-nzu-green md:text-[1.45rem]">
                                              {displayMatchupStats.overall[1]}
                                            </span>
                                          </div>
                                          <div className="my-0.5 h-px w-[74px] bg-gradient-to-r from-transparent via-white/7 to-transparent" />
                                          <div className="flex min-w-[82px] items-center justify-center gap-1 opacity-75">
                                            <span className="min-w-[16px] text-right text-[1rem] font-[1000] italic leading-none tabular-nums text-red-500/85 md:text-[1.08rem]">
                                              {displayMatchupStats.recent[0]}
                                            </span>
                                            <span className="min-w-[34px] text-center text-[11px] font-[1000] italic text-red-500/45">
                                              최근
                                            </span>
                                            <span className="min-w-[16px] text-left text-[1rem] font-[1000] italic leading-none tabular-nums text-red-500/85 md:text-[1.08rem]">
                                              {displayMatchupStats.recent[1]}
                                            </span>
                                          </div>
                                        </div>
                                      ) : match.h2hStatus === 'error' ? (
                                        <div className="flex min-w-[82px] flex-col items-center gap-1">
                                          <span className="text-[10px] font-[1000] uppercase tracking-[0.18em] text-red-400/80">
                                            조회 실패
                                          </span>
                                          <span className="text-[11px] font-[1000] italic text-white/18">
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
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        removeMatch(match.id)
                                      }}
                                      className="flex justify-center rounded-lg p-1 text-white/20 opacity-0 transition-all group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-500"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </Draggable>
                      )
                    })}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          </div>
        </div>
      </div>

      {p1 && p2 && resultStatus !== 'idle' && (
        <section className="relative overflow-hidden rounded-[3rem] border-2 border-nzu-green/40 bg-black/80 p-12 shadow-[0_0_100px_rgba(46,213,115,0.1)] fade-in">
          <div className="absolute right-0 top-0 p-8 opacity-10">
            <Swords className="h-64 w-64 rotate-12 text-nzu-green" />
          </div>

          <div className="relative z-10 space-y-12">
            {resultStatus === 'loading' ? (
              <div className="flex min-h-[280px] flex-col items-center justify-center gap-4 text-center">
                <div className="h-12 w-12 animate-spin rounded-full border-2 border-white/10 border-t-nzu-green" />
                <div className="text-lg font-black text-white">상대전적 불러오는 중</div>
                <div className="text-sm font-bold text-white/35">2025 이후 표본과 최근 90일 전적을 확인하고 있습니다.</div>
              </div>
            ) : resultStatus === 'error' ? (
              <div className="flex min-h-[280px] flex-col items-center justify-center gap-4 text-center">
                <div className="text-lg font-black text-red-300">상대전적 조회 실패</div>
                <div className="text-sm font-bold text-white/35">잠시 후 다시 시도해 주세요.</div>
              </div>
            ) : displayResult ? (
            <>
            <div className="flex items-center justify-between border-b border-white/10 pb-8">
              <div className="flex items-center gap-6">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-nzu-green/20 bg-nzu-green/10">
                  <Activity className="h-8 w-8 text-nzu-green" />
                </div>
                <div>
                  <h3 className="mb-1 text-3xl font-black uppercase tracking-tighter text-white">상세 분석 리포트</h3>
                  <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white/40">
                    <span className="h-2 w-2 animate-ping rounded-full bg-nzu-green" />
                    상대전적 기반 비교 분석
                  </p>
                </div>
              </div>

              <div className="text-right">
                <span className="mb-2 block text-sm font-bold text-white/40">예상 승률</span>
                <div className="text-5xl font-black tracking-tighter text-white tabular-nums">
                  {Math.round((displayResult.summary.wins / (displayResult.summary.wins + displayResult.summary.losses || 1)) * 100)}%
                  <span className="text-nzu-green"> 우세</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-3">
              <div className="space-y-4 rounded-[2rem] border border-white/5 bg-white/[0.02] p-8 text-center">
                <TierBadge tier={p1.tier} size="lg" />
                <h4 className="text-4xl font-black text-white">{p1.name}</h4>
                <div className="flex justify-center gap-3">
                  <span className="rounded-lg border border-terran/20 bg-terran/10 px-4 py-1.5 text-xs font-black text-terran">
                    {p1.race}
                  </span>
                  <span className="rounded-lg border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-black text-white/40">
                    {getUniversityLabel(p1.university)}
                  </span>
                </div>
              </div>

              <div className="flex flex-col items-center space-y-8">
                <div className="flex items-center gap-8">
                  <div className="text-center">
                    <div className="mb-2 text-7xl font-black text-white">{displayResult.summary.wins}</div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-nzu-green">승</div>
                  </div>
                  <div className="text-4xl font-black text-white/10">VS</div>
                  <div className="text-center">
                    <div className="mb-2 text-7xl font-black text-white/40">{displayResult.summary.losses}</div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-white/10">패</div>
                  </div>
                </div>

                <div className="relative h-4 w-full overflow-hidden rounded-full bg-white/5">
                  <div className="absolute inset-0 bg-gradient-to-r from-nzu-green/20 to-transparent" />
                  <div
                    className="h-full bg-nzu-green shadow-[0_0_20px_#2ed573] transition-all duration-1000"
                    style={{ width: `${(displayResult.summary.wins / (displayResult.summary.wins + displayResult.summary.losses || 1)) * 100}%` }}
                  />
                </div>
              </div>

              <div className="space-y-4 rounded-[2rem] border border-white/5 bg-white/[0.02] p-8 text-center">
                <TierBadge tier={p2.tier} size="lg" />
                <h4 className="text-4xl font-black text-white/60">{p2.name}</h4>
                <div className="flex justify-center gap-3">
                  <span className="rounded-lg border border-zerg/20 bg-zerg/10 px-4 py-1.5 text-xs font-black text-zerg">
                    {p2.race}
                  </span>
                  <span className="rounded-lg border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-black text-white/40">
                    {getUniversityLabel(p2.university)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-center pt-8">
              <button
                onClick={() => addMatch(p1, p2)}
                className="group relative overflow-hidden rounded-3xl bg-white px-12 py-5 text-xl font-black uppercase tracking-tighter text-black shadow-[0_0_50px_rgba(46,213,115,0.3)] transition-all hover:scale-105 active:scale-95"
              >
                <div className="absolute inset-0 translate-x-[-100%] bg-nzu-green transition-transform duration-500 group-hover:translate-x-0" />
                <span className="relative z-10 flex items-center gap-3 group-hover:text-black">
                  <Zap className="h-6 w-6 fill-current" />
                  현재 매치에 추가
                </span>
              </button>
            </div>
            </>
            ) : null}
          </div>
        </section>
      )}
    </div>
  )
}
