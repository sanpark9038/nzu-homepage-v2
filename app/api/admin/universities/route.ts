import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, assertValidAdminSession } from "@/lib/admin-auth";
import {
  readUniversityMetadata,
  writeUniversityMetadata,
  type UniversityMetadataEntry,
} from "@/lib/university-metadata";

export const runtime = "nodejs";

function normalizePayloadEntry(value: unknown): UniversityMetadataEntry {
  const row = (value || {}) as Partial<UniversityMetadataEntry>;
  return {
    code: String(row.code || "").trim(),
    name: String(row.name || "").trim(),
    stars: Number.isFinite(Number(row.stars)) ? Number(row.stars) : undefined,
    aliases: Array.isArray(row.aliases)
      ? row.aliases.map((alias) => String(alias || "").trim()).filter(Boolean)
      : [],
    hidden: Boolean(row.hidden),
  };
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    assertValidAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
    const doc = readUniversityMetadata();
    return NextResponse.json({ ok: true, universities: doc.universities, updated_at: doc.updated_at });
  } catch (error) {
    const status = error instanceof Error && error.message === "unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, message: status === 401 ? "unauthorized" : "failed to load universities" }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    assertValidAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
    const body = (await req.json().catch(() => ({}))) as { university?: unknown };
    const entry = normalizePayloadEntry(body.university);

    if (!entry.code || !entry.name) {
      return NextResponse.json({ ok: false, message: "code and name are required" }, { status: 400 });
    }

    const doc = readUniversityMetadata();
    if (doc.universities.some((row) => row.code === entry.code)) {
      return NextResponse.json({ ok: false, message: "university code already exists" }, { status: 409 });
    }

    doc.universities.push(entry);
    const next = writeUniversityMetadata(doc.universities);
    return NextResponse.json({ ok: true, universities: next.universities, updated_at: next.updated_at });
  } catch (error) {
    const status = error instanceof Error && error.message === "unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, message: status === 401 ? "unauthorized" : "failed to create university" }, { status });
  }
}

export async function PATCH(req: Request) {
  try {
    const cookieStore = await cookies();
    assertValidAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
    const body = (await req.json().catch(() => ({}))) as { university?: unknown };
    const entry = normalizePayloadEntry(body.university);

    if (!entry.code || !entry.name) {
      return NextResponse.json({ ok: false, message: "code and name are required" }, { status: 400 });
    }

    const doc = readUniversityMetadata();
    const index = doc.universities.findIndex((row) => row.code === entry.code);
    if (index < 0) {
      return NextResponse.json({ ok: false, message: "university not found" }, { status: 404 });
    }

    doc.universities[index] = entry;
    const next = writeUniversityMetadata(doc.universities);
    return NextResponse.json({ ok: true, universities: next.universities, updated_at: next.updated_at });
  } catch (error) {
    const status = error instanceof Error && error.message === "unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, message: status === 401 ? "unauthorized" : "failed to update university" }, { status });
  }
}

export async function DELETE(req: Request) {
  try {
    const cookieStore = await cookies();
    assertValidAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
    const body = (await req.json().catch(() => ({}))) as { code?: string };
    const code = String(body.code || "").trim();

    if (!code) {
      return NextResponse.json({ ok: false, message: "code is required" }, { status: 400 });
    }

    const doc = readUniversityMetadata();
    const nextRows = doc.universities.filter((row) => row.code !== code);
    if (nextRows.length === doc.universities.length) {
      return NextResponse.json({ ok: false, message: "university not found" }, { status: 404 });
    }

    const next = writeUniversityMetadata(nextRows);
    return NextResponse.json({ ok: true, universities: next.universities, updated_at: next.updated_at });
  } catch (error) {
    const status = error instanceof Error && error.message === "unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, message: status === 401 ? "unauthorized" : "failed to delete university" }, { status });
  }
}
