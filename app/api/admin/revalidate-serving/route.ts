import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

type RevalidatePayload = {
  secret?: string;
  tags?: string[];
};

export async function POST(request: Request) {
  const expectedSecret = String(process.env.SERVING_REVALIDATE_SECRET || "").trim();
  if (!expectedSecret) {
    return NextResponse.json(
      { ok: false, error: "missing_revalidate_secret" },
      { status: 503 }
    );
  }

  let payload: RevalidatePayload;
  try {
    payload = (await request.json()) as RevalidatePayload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (String(payload.secret || "").trim() !== expectedSecret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const tags = Array.isArray(payload.tags)
    ? payload.tags.map((tag) => String(tag || "").trim()).filter(Boolean)
    : [];

  if (tags.length === 0) {
    return NextResponse.json({ ok: false, error: "missing_tags" }, { status: 400 });
  }

  for (const tag of tags) {
    revalidateTag(tag, "max");
  }

  return NextResponse.json({ ok: true, revalidated: tags });
}
