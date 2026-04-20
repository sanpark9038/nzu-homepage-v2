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

    const player1Candidates = uniqueCandidates([
      p1,
      player1?.name,
      player1?.nickname,
      ...getPlayerSearchAliases(player1 || { name: p1 }),
    ])
    const player2Candidates = uniqueCandidates([
      p2,
      player2?.name,
      player2?.nickname,
      ...getPlayerSearchAliases(player2 || { name: p2 }),
    ])

    let stats = null

    for (const leftName of player1Candidates) {
      for (const rightName of player2Candidates) {
        const result = await getInstantH2H(leftName, rightName, gender || undefined)
        if (!result) continue
        if (!stats) stats = result
        if ((result.summary?.total || 0) > 0) {
          stats = result
          break
        }
      }
      if ((stats?.summary?.total || 0) > 0) break
    }

    if ((!stats || (stats.summary?.total || 0) === 0) && gender) {
      for (const leftName of player1Candidates) {
        for (const rightName of player2Candidates) {
          const result = await getInstantH2H(leftName, rightName)
          if (!result) continue
          if (!stats) stats = result
          if ((result.summary?.total || 0) > 0) {
            stats = result
            break
          }
        }
        if ((stats?.summary?.total || 0) > 0) break
      }
    }

    if ((!stats || (stats.summary?.total || 0) === 0) && p1Id && p2Id) {
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
