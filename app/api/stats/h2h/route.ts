import { NextRequest, NextResponse } from 'next/server'
import { getInstantH2H } from '@/lib/h2h-service'
import { getPlayerSearchAliases } from '@/lib/player-serving-metadata'
import { playerService } from '@/lib/player-service'
import type { H2HStats } from '@/types'

function uniqueCandidates(values: Array<string | null | undefined>) {
  const seen = new Set<string>()
  const candidates: string[] = []

  for (const value of values) {
    const normalized = String(value || '').trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    candidates.push(normalized)
  }

  return candidates
}

function pairFromStats(values: readonly number[] | null | undefined): [number, number] {
  return [Number(values?.[0] || 0), Number(values?.[1] || 0)]
}

function hasH2HSample(stats: H2HStats | null | undefined) {
  return (stats?.summary?.total || 0) > 0
}

function buildPlayerH2HCandidates(
  requestedName: string,
  player?: { name?: string | null; nickname?: string | null } | null
) {
  const name = String(player?.name || '').trim()
  const nickname = String(player?.nickname || '').trim()
  const normalizedPlayer = {
    name: name || undefined,
    nickname: nickname || undefined,
  }

  return uniqueCandidates([
    requestedName,
    name,
    nickname,
    ...getPlayerSearchAliases(name || nickname ? normalizedPlayer : { name: requestedName }),
    ...getPlayerSearchAliases(name ? { name } : {}),
    ...getPlayerSearchAliases(nickname ? { name: nickname, nickname } : {}),
    ...getPlayerSearchAliases(requestedName ? { name: requestedName } : {}),
  ])
}

function toH2HStatsFromPlayerService(payload: {
  overall: readonly number[]
  recent: readonly number[]
}): H2HStats {
  const [overallWins, overallLosses] = pairFromStats(payload.overall)
  const [recentWins, recentLosses] = pairFromStats(payload.recent)
  const overallTotal = overallWins + overallLosses
  const recentTotal = recentWins + recentLosses

  return {
    summary: {
      total: overallTotal,
      wins: overallWins,
      losses: overallLosses,
      winRate: overallTotal > 0 ? ((overallWins / overallTotal) * 100).toFixed(1) : '0.0',
      momentum90: {
        total: recentTotal,
        wins: recentWins,
        losses: recentLosses,
        winRate: recentTotal > 0 ? ((recentWins / recentTotal) * 100).toFixed(1) : '0.0',
      },
    },
    mapStats: {},
    recentMatches: [],
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const p1 = searchParams.get('p1')
  const p2 = searchParams.get('p2')
  const p1Id = searchParams.get('p1_id')
  const p2Id = searchParams.get('p2_id')
  const gender = searchParams.get('gender')

  if (!p1 || !p2) {
    return NextResponse.json(
      { error: 'Both p1 and p2 player names are required.' },
      { status: 400 }
    )
  }

  try {
    const players = await playerService.getCachedPlayersList()
    const player1 = p1Id ? players.find((player) => player.id === p1Id) : null
    const player2 = p2Id ? players.find((player) => player.id === p2Id) : null
    const player1Candidates = buildPlayerH2HCandidates(p1, player1)
    const player2Candidates = buildPlayerH2HCandidates(p2, player2)
    let expandedPlayer1Candidates = player1Candidates
    let expandedPlayer2Candidates = player2Candidates

    let stats = null
    let byIdStats: H2HStats | null = null

    if (p1Id && p2Id) {
      byIdStats = await playerService.getDetailedH2HStats(p1Id, p2Id)
      if (hasH2HSample(byIdStats)) {
        stats = byIdStats
      }
    }

    if (!hasH2HSample(stats) && p1Id && p2Id) {
      const historyCandidateBundle = await playerService.getH2HNameCandidatesByIds(p1Id, p2Id)
      expandedPlayer1Candidates = uniqueCandidates([
        ...player1Candidates,
        ...(historyCandidateBundle.player1Candidates || []),
      ])
      expandedPlayer2Candidates = uniqueCandidates([
        ...player2Candidates,
        ...(historyCandidateBundle.player2Candidates || []),
      ])
    }

    if (!hasH2HSample(stats)) {
      for (const leftName of expandedPlayer1Candidates) {
        for (const rightName of expandedPlayer2Candidates) {
          const result = await getInstantH2H(leftName, rightName, gender || undefined)
          if (!result) continue
          if (!stats) stats = result
          if (hasH2HSample(result)) {
            stats = result
            break
          }
        }
        if (hasH2HSample(stats)) break
      }
    }

    if (!hasH2HSample(stats) && gender) {
      for (const leftName of expandedPlayer1Candidates) {
        for (const rightName of expandedPlayer2Candidates) {
          const result = await getInstantH2H(leftName, rightName)
          if (!result) continue
          if (!stats) stats = result
          if (hasH2HSample(result)) {
            stats = result
            break
          }
        }
        if (hasH2HSample(stats)) break
      }
    }

    if (!hasH2HSample(stats) && byIdStats) {
      stats = byIdStats
    }

    if (!hasH2HSample(stats) && p1Id && p2Id) {
      const byId = await playerService.getH2HStats(p1Id, p2Id)
      if ((byId.overall[0] + byId.overall[1]) > 0 || (byId.recent[0] + byId.recent[1]) > 0) {
        stats = toH2HStatsFromPlayerService(byId)
      }
    }
    
    if (!stats) {
      return NextResponse.json(
        { error: 'Failed to fetch Head-to-Head stats.' },
        { status: 500 }
      )
    }

    return NextResponse.json(stats)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
