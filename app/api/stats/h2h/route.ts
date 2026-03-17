import { NextRequest, NextResponse } from 'next/server'
import { getInstantH2H } from '@/lib/h2h-service'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const p1 = searchParams.get('p1')
  const p2 = searchParams.get('p2')
  const gender = searchParams.get('gender')

  if (!p1 || !p2) {
    return NextResponse.json(
      { error: 'Both p1 and p2 player names are required.' },
      { status: 400 }
    )
  }

  try {
    const stats = await getInstantH2H(p1, p2, gender || undefined)
    
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
