import { NextResponse } from "next/server";

const ALLOWED_HOSTS = new Set([
  "liveimg.sooplive.co.kr",
  "liveimg.sooplive.com",
]);

function normalizeSource(value: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.startsWith("//")) return `https:${raw}`;
  return raw;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const normalized = normalizeSource(searchParams.get("src"));
  if (!normalized) {
    return new NextResponse("missing src", { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(normalized);
  } catch {
    return new NextResponse("invalid src", { status: 400 });
  }

  if (!ALLOWED_HOSTS.has(target.hostname)) {
    return new NextResponse("forbidden host", { status: 403 });
  }

  const upstream = await fetch(target.toString(), {
    headers: {
      "user-agent": "Mozilla/5.0",
      accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    },
    cache: "force-cache",
  }).catch(() => null);

  if (!upstream || !upstream.ok) {
    return new NextResponse("thumbnail unavailable", { status: 502 });
  }

  const contentType = upstream.headers.get("content-type") || "image/jpeg";
  const buffer = await upstream.arrayBuffer();

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
