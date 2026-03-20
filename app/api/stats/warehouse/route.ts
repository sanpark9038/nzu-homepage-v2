import { NextRequest, NextResponse } from "next/server";
import { getWarehouseStats, warehouseDataHealth } from "@/lib/warehouse-stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isIsoDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function toBool(v: string | null, defaultValue: boolean): boolean {
  if (v === null) return defaultValue;
  const normalized = v.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes") return true;
  if (normalized === "0" || normalized === "false" || normalized === "no") return false;
  return defaultValue;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;
  const team = searchParams.get("team") || undefined;
  const playerEntityId = searchParams.get("playerEntityId") || undefined;
  const playerName = searchParams.get("playerName") || undefined;
  const includeDaily = toBool(searchParams.get("includeDaily"), true);
  const includePlayerDetails = toBool(searchParams.get("includePlayerDetails"), true);

  if (from && !isIsoDate(from)) {
    return NextResponse.json(
      { error: "Invalid 'from' date format. Use YYYY-MM-DD." },
      { status: 400 }
    );
  }
  if (to && !isIsoDate(to)) {
    return NextResponse.json(
      { error: "Invalid 'to' date format. Use YYYY-MM-DD." },
      { status: 400 }
    );
  }
  if (from && to && from > to) {
    return NextResponse.json(
      { error: "'from' must be less than or equal to 'to'." },
      { status: 400 }
    );
  }

  const health = warehouseDataHealth();
  if (!health.exists) {
    return NextResponse.json(
      {
        error: "Warehouse files are missing. Build aggregates first.",
        health,
      },
      { status: 503 }
    );
  }

  try {
    const stats = getWarehouseStats({
      from,
      to,
      team,
      playerEntityId,
      playerName,
      includeDaily,
      includePlayerDetails,
    });

    return NextResponse.json(
      {
        ok: true,
        ...stats,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json(
      {
        error: message,
      },
      { status: 500 }
    );
  }
}
