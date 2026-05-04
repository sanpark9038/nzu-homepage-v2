import { NextRequest, NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { getInstantH2H } from '@/lib/h2h-service'
import { getPlayerSearchAliases } from '@/lib/player-serving-metadata'
import { playerService } from '@/lib/player-service'
import type { H2HStats } from '@/types'

const getCachedDetailedH2HStats = unstable_cache(
  async (p1Id: string, p2Id: string) => playerService.getDetailedH2HStats(p1Id, p2Id),
  ['public-h2h-stats-v1'],
  {
    revalidate: 300,
    tags: ['public-player-history'],
  }
)

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
    if (p1Id && p2Id) {
      const byIdStats = await getCachedDetailedH2HStats(p1Id, p2Id)
      return NextResponse.json(byIdStats)
    }

    const players = p1Id || p2Id ? await playerService.getCachedPlayersList() : []
    const player1 = p1Id ? players.find((player) => player.id === p1Id) : null
    const player2 = p2Id ? players.find((player) => player.id === p2Id) : null
    const player1Candidates = buildPlayerH2HCandidates(p1, player1)
    const player2Candidates = buildPlayerH2HCandidates(p2, player2)

    let stats: H2HStats | null = null

    if (!hasH2HSample(stats)) {
      for (const leftName of player1Candidates) {
        for (const rightName of player2Candidates) {
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
      for (const leftName of player1Candidates) {
        for (const rightName of player2Candidates) {
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
