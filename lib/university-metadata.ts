import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { UNIVERSITY_ALIAS_MAP, UNIVERSITY_MAP, type UniversityKey } from "@/lib/university-config";

export type UniversityMetadataEntry = {
  code: string;
  name: string;
  stars?: number;
  aliases?: string[];
  hidden?: boolean;
};

type UniversityMetadataDoc = {
  schema_version: string;
  updated_at: string;
  universities: UniversityMetadataEntry[];
};

type UniversityMetadataRow = {
  code: string;
  name: string;
  stars: number | null;
  aliases: string[] | null;
  hidden: boolean | null;
};

const ROOT = process.cwd();
const UNIVERSITIES_PATH = path.join(ROOT, "data", "metadata", "universities.v1.json");

let cachedUniversityMetadata:
  | {
      exists: boolean;
      mtimeMs: number | null;
      doc: UniversityMetadataDoc;
    }
  | null = null;

function buildDefaultUniversities(): UniversityMetadataEntry[] {
  const aliasMap = new Map<UniversityKey, string[]>();

  for (const [alias, code] of Object.entries(UNIVERSITY_ALIAS_MAP)) {
    const list = aliasMap.get(code) || [];
    if (!list.includes(alias)) list.push(alias);
    aliasMap.set(code, list);
  }

  return Object.entries(UNIVERSITY_MAP).map(([code, info]) => ({
    code,
    name: info.name,
    stars: info.stars,
    aliases: aliasMap.get(code as UniversityKey) || [code],
    hidden: false,
  }));
}

function normalizeEntry(entry: UniversityMetadataEntry): UniversityMetadataEntry {
  const code = String(entry.code || "").trim();
  return {
    code,
    name: String(entry.name || code).trim() || code,
    stars: Number.isFinite(Number(entry.stars)) ? Number(entry.stars) : undefined,
    aliases: Array.from(
      new Set(
        [code, ...(Array.isArray(entry.aliases) ? entry.aliases : [])]
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      )
    ),
    hidden: Boolean(entry.hidden),
  };
}

function sortUniversityEntries(universities: UniversityMetadataEntry[]) {
  return [...universities].sort((left, right) => {
    const isFaLeft = left.code === "FA" || left.name === "무소속";
    const isFaRight = right.code === "FA" || right.name === "무소속";
    if (isFaLeft !== isFaRight) return isFaLeft ? 1 : -1;

    const isKorean = (value: string) => /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(value);
    if (isKorean(left.name) && !isKorean(right.name)) return -1;
    if (!isKorean(left.name) && isKorean(right.name)) return 1;

    return left.name.localeCompare(right.name, "ko");
  });
}

export function readUniversityMetadata(): UniversityMetadataDoc {
  const fallback: UniversityMetadataDoc = {
    schema_version: "1.0.0",
    updated_at: new Date().toISOString(),
    universities: buildDefaultUniversities(),
  };

  let mtimeMs: number | null = null;
  try {
    mtimeMs = fs.statSync(UNIVERSITIES_PATH).mtimeMs;
  } catch {
    if (cachedUniversityMetadata?.exists === false) return cachedUniversityMetadata.doc;
    cachedUniversityMetadata = { exists: false, mtimeMs: null, doc: fallback };
    return fallback;
  }

  if (cachedUniversityMetadata?.exists === true && cachedUniversityMetadata.mtimeMs === mtimeMs) {
    return cachedUniversityMetadata.doc;
  }

  try {
    const raw = fs.readFileSync(UNIVERSITIES_PATH, "utf8").replace(/^﻿/, "");
    const parsed = JSON.parse(raw) as Partial<UniversityMetadataDoc>;
    const universities = Array.isArray(parsed.universities)
      ? parsed.universities.map(normalizeEntry).filter((entry) => entry.code)
      : fallback.universities;

    const doc = {
      schema_version: String(parsed.schema_version || "1.0.0"),
      updated_at: String(parsed.updated_at || fallback.updated_at),
      universities,
    };
    cachedUniversityMetadata = { exists: true, mtimeMs, doc };
    return doc;
  } catch {
    cachedUniversityMetadata = { exists: true, mtimeMs, doc: fallback };
    return fallback;
  }
}

export function writeUniversityMetadata(entries: UniversityMetadataEntry[]) {
  const doc: UniversityMetadataDoc = {
    schema_version: "1.0.0",
    updated_at: new Date().toISOString(),
    universities: entries.map(normalizeEntry).filter((entry) => entry.code),
  };

  fs.mkdirSync(path.dirname(UNIVERSITIES_PATH), { recursive: true });
  fs.writeFileSync(UNIVERSITIES_PATH, JSON.stringify(doc, null, 2), "utf8");
  cachedUniversityMetadata = {
    exists: true,
    mtimeMs: fs.statSync(UNIVERSITIES_PATH).mtimeMs,
    doc,
  };
  return doc;
}

// ── Supabase-backed async functions ──────────────────────────────────────────

function createUniversityReadClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function createUniversityWriteClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!key) throw new Error("missing_supabase_service_key");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}

async function fetchUniversitiesFromDB(): Promise<UniversityMetadataDoc | null> {
  try {
    const db = createUniversityReadClient();
    const { data, error } = await db
      .from("university_metadata")
      .select("code, name, stars, aliases, hidden")
      .order("code");
    if (error || !Array.isArray(data)) return null;
    return {
      schema_version: "1.0.0",
      updated_at: new Date().toISOString(),
      universities: (data as UniversityMetadataRow[]).map((row) =>
        normalizeEntry({
          code: row.code,
          name: row.name,
          stars: row.stars ?? undefined,
          aliases: row.aliases ?? [row.code],
          hidden: row.hidden ?? false,
        })
      ),
    };
  } catch {
    return null;
  }
}

export async function writeUniversityMetadataToDB(
  entries: UniversityMetadataEntry[]
): Promise<UniversityMetadataDoc> {
  const db = createUniversityWriteClient();
  const normalized = entries.map(normalizeEntry).filter((e) => e.code);

  const { data: existing } = await db.from("university_metadata").select("code");
  const existingCodes = new Set<string>(
    ((existing ?? []) as { code: string }[]).map((r) => r.code)
  );
  const newCodes = new Set(normalized.map((e) => e.code));

  const toDelete = [...existingCodes].filter((code) => !newCodes.has(code));
  if (toDelete.length > 0) {
    await db.from("university_metadata").delete().in("code", toDelete);
  }

  if (normalized.length > 0) {
    const { error } = await db.from("university_metadata").upsert(
      normalized.map((entry) => ({
        code: entry.code,
        name: entry.name,
        stars: entry.stars ?? null,
        aliases: entry.aliases ?? [entry.code],
        hidden: entry.hidden ?? false,
        updated_at: new Date().toISOString(),
      }))
    );
    if (error) throw error;
  }

  return {
    schema_version: "1.0.0",
    updated_at: new Date().toISOString(),
    universities: normalized,
  };
}

export async function readUniversityMetadataFromDB(): Promise<UniversityMetadataDoc> {
  const dbDoc = await fetchUniversitiesFromDB();
  return dbDoc ?? readUniversityMetadata();
}

export async function getUniversityOptionsFromDB(includeHidden = false) {
  const { universities } = await readUniversityMetadataFromDB();
  const visible = includeHidden ? universities : universities.filter((entry) => !entry.hidden);
  return sortUniversityEntries(visible);
}

// ── Sync file-based functions (local dev / scripts) ──────────────────────────

export function getUniversityOptions(includeHidden = false) {
  const { universities } = readUniversityMetadata();
  const visible = includeHidden ? universities : universities.filter((entry) => !entry.hidden);
  return sortUniversityEntries(visible);
}

export function getUniversityNameMap(includeHidden = false) {
  return Object.fromEntries(getUniversityOptions(includeHidden).map((entry) => [entry.code, entry.name]));
}

export function ensureUniversityMetadataFile() {
  if (!fs.existsSync(UNIVERSITIES_PATH)) {
    writeUniversityMetadata(buildDefaultUniversities());
  }
}
