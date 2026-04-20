import fs from "node:fs";
import path from "node:path";
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

const ROOT = process.cwd();
const UNIVERSITIES_PATH = path.join(ROOT, "data", "metadata", "universities.v1.json");

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

export function readUniversityMetadata(): UniversityMetadataDoc {
  const fallback: UniversityMetadataDoc = {
    schema_version: "1.0.0",
    updated_at: new Date().toISOString(),
    universities: buildDefaultUniversities(),
  };

  if (!fs.existsSync(UNIVERSITIES_PATH)) {
    return fallback;
  }

  try {
    const raw = fs.readFileSync(UNIVERSITIES_PATH, "utf8").replace(/^\uFEFF/, "");
    const parsed = JSON.parse(raw) as Partial<UniversityMetadataDoc>;
    const universities = Array.isArray(parsed.universities)
      ? parsed.universities.map(normalizeEntry).filter((entry) => entry.code)
      : fallback.universities;

    return {
      schema_version: String(parsed.schema_version || "1.0.0"),
      updated_at: String(parsed.updated_at || fallback.updated_at),
      universities,
    };
  } catch {
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
  return doc;
}

export function getUniversityOptions(includeHidden = false) {
  const { universities } = readUniversityMetadata();
  const visible = includeHidden ? universities : universities.filter((entry) => !entry.hidden);

  return [...visible].sort((left, right) => {
    const isFaLeft = left.code === "FA" || left.name === "무소속";
    const isFaRight = right.code === "FA" || right.name === "무소속";
    if (isFaLeft !== isFaRight) return isFaLeft ? 1 : -1;

    const isKorean = (value: string) => /[\u3131-\u314e\u314f-\u3163\uac00-\ud7a3]/.test(value);
    if (isKorean(left.name) && !isKorean(right.name)) return -1;
    if (!isKorean(left.name) && isKorean(right.name)) return 1;

    return left.name.localeCompare(right.name, "ko");
  });
}

export function getUniversityNameMap(includeHidden = false) {
  return Object.fromEntries(getUniversityOptions(includeHidden).map((entry) => [entry.code, entry.name]));
}

export function ensureUniversityMetadataFile() {
  if (!fs.existsSync(UNIVERSITIES_PATH)) {
    writeUniversityMetadata(buildDefaultUniversities());
  }
}
