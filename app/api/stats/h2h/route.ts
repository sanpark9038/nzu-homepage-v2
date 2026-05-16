import { NextRequest, NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { playerService } from '@/lib/player-service'

const getCachedDetailedH2HStats = unstable_cache(
  async (p1Id: string, p2Id: string) => playerService.getDetailedH2HStats(p1Id, p2Id),
  ['public-h2h-stats-v1'],
  {
    revalidate: 300,
    tags: ['public-player-history'],
  }
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const p1 = searchParams.get('p1')
  const p2 = searchParams.get('p2')
  const p1Id = searchParams.get('p1_id')
  const p2Id = searchParams.get('p2_id')

  if (!p1 || !p2) {
    return NextResponse.json(
      { error: 'Both p1 and p2 player names are required.' },
      { status: 400 }
    )
  }

  if (!p1Id || !p2Id) {
    return NextResponse.json(
      { error: 'Both p1_id and p2_id canonical player ids are required.' },
      { status: 400 }
    )
  }

  try {
    const byIdStats = await getCachedDetailedH2HStats(p1Id, p2Id)
    return NextResponse.json(byIdStats)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
