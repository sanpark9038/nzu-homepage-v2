import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type RosterPlayer = {
  entity_id: string;
  wr_id: number;
  gender: string;
  name: string;
  tier: string;
  race: string;
  team_code: string;
  team_name: string;
  team_name_en?: string;
  tier_key?: string;
  meta_tags?: string[];
  role_title?: string;
  role_priority?: number | null;
  source?: string;
  missing_in_master?: boolean;
};

type ProjectDoc = {
  schema_version?: string;
  generated_at?: string;
  project: string;
  team_name: string;
  team_code: string;
  team_name_en?: string;
  roster_count?: number;
  roster: RosterPlayer[];
  fetch_univ_name?: string;
};

type ProjectRef = {
  code: string;
  filePath: string;
  doc: ProjectDoc;
};

const ROOT = process.cwd();
const PROJECTS_DIR = path.join(ROOT, "data", "metadata", "projects");

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "")) as T;
}

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function slug(v: string) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function tierKey(tier: string) {
  const raw = String(tier || "").trim();
  const map: Record<string, string> = {
    갓: "god",
    GOD: "god",
    킹: "king",
    KING: "king",
    킹티어: "king",
    잭: "jack",
    JACK: "jack",
    잭티어: "jack",
    조커: "joker",
    JOKER: "joker",
    스페이드: "spade",
    SPADE: "spade",
    유스: "9",
    베이비: "9",
  };
  if (map[raw]) return map[raw];
  if (/^\d+$/.test(raw)) return raw;
  return "unknown";
}

function tierRank(tier: string) {
  const key = tierKey(tier);
  const order = ["god", "king", "jack", "joker", "spade", "0", "1", "2", "3"];
  const idx = order.indexOf(key);
  if (idx >= 0) return idx;
  if (/^\d+$/.test(key)) return 100 + Number(key);
  return 999;
}

function ensureTags(player: RosterPlayer, teamCode: string, teamName: string, teamNameEn: string) {
  const tags = new Set(Array.isArray(player.meta_tags) ? player.meta_tags : []);
  const next = [...tags].filter(
    (t) =>
      !/^team:/.test(t) &&
      !/^team_code:/.test(t) &&
      !/^team_ko:/.test(t) &&
      !/^team_en:/.test(t) &&
      !/^project:/.test(t) &&
      !/^tier:/.test(t)
  );
  next.push(`project:${teamCode}`);
  next.push(`team:${teamCode}`);
  next.push(`team_code:${teamCode}`);
  next.push(`team_ko:${teamName}`);
  next.push(`team_en:${slug(teamNameEn || teamCode) || teamCode}`);
  next.push(`tier:${tierKey(player.tier)}`);
  player.meta_tags = [...new Set(next)];
}

function sortRoster(doc: ProjectDoc) {
  const roster = Array.isArray(doc.roster) ? doc.roster : [];
  roster.sort((a, b) => {
    const ap = Number.isFinite(Number(a.role_priority)) ? Number(a.role_priority) : 9999;
    const bp = Number.isFinite(Number(b.role_priority)) ? Number(b.role_priority) : 9999;
    if (ap !== bp) return ap - bp;
    const at = tierRank(a.tier);
    const bt = tierRank(b.tier);
    if (at !== bt) return at - bt;
    return String(a.name || "").localeCompare(String(b.name || ""), "ko");
  });
  doc.roster = roster;
}

function loadProjects(): ProjectRef[] {
  if (!fs.existsSync(PROJECTS_DIR)) return [];
  return fs
    .readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b))
    .map((code) => {
      const filePath = path.join(PROJECTS_DIR, code, `players.${code}.v1.json`);
      return { code, filePath };
    })
    .filter((p) => fs.existsSync(p.filePath))
    .map((p) => ({ ...p, doc: readJson<ProjectDoc>(p.filePath) }));
}

function normalizeDoc(doc: ProjectDoc) {
  doc.generated_at = new Date().toISOString();
  doc.roster_count = Array.isArray(doc.roster) ? doc.roster.length : 0;
  sortRoster(doc);
}

export async function GET() {
  const projects = loadProjects();
  const players = projects.flatMap((p) =>
    (p.doc.roster || []).map((r) => ({
      entity_id: r.entity_id,
      wr_id: r.wr_id,
      gender: r.gender,
      name: r.name,
      team_code: p.doc.team_code,
      team_name: p.doc.team_name,
      tier: r.tier,
      race: r.race,
    }))
  );
  const teams = projects.map((p) => ({
    code: p.doc.team_code,
    name: p.doc.team_name,
    players: Array.isArray(p.doc.roster) ? p.doc.roster.length : 0,
  }));
  return NextResponse.json({ ok: true, players, teams });
}

export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    entity_id?: string;
    team_code?: string;
    tier?: string;
  };

  const entityId = String(body.entity_id || "").trim();
  const nextTeamCode = String(body.team_code || "").trim().toLowerCase();
  const nextTier = String(body.tier || "").trim();
  if (!entityId || !nextTeamCode || !nextTier) {
    return NextResponse.json(
      { ok: false, message: "entity_id, team_code, tier are required" },
      { status: 400 }
    );
  }

  const projects = loadProjects();
  const source = projects.find((p) => (p.doc.roster || []).some((r) => r.entity_id === entityId));
  const target = projects.find((p) => p.doc.team_code === nextTeamCode);
  if (!source) {
    return NextResponse.json({ ok: false, message: "player not found" }, { status: 404 });
  }
  if (!target) {
    return NextResponse.json({ ok: false, message: "target team not found" }, { status: 404 });
  }

  const srcRoster = source.doc.roster || [];
  const srcIdx = srcRoster.findIndex((r) => r.entity_id === entityId);
  if (srcIdx < 0) {
    return NextResponse.json({ ok: false, message: "player not found in source roster" }, { status: 404 });
  }

  const moving = { ...srcRoster[srcIdx] };
  moving.tier = nextTier;
  moving.tier_key = tierKey(nextTier);
  moving.team_code = target.doc.team_code;
  moving.team_name = target.doc.team_name;
  ensureTags(moving, target.doc.team_code, target.doc.team_name, target.doc.team_name_en || target.doc.team_code);

  srcRoster.splice(srcIdx, 1);
  source.doc.roster = srcRoster;

  const targetRoster = target.doc.roster || [];
  const existingTargetIdx = targetRoster.findIndex((r) => r.entity_id === entityId);
  if (existingTargetIdx >= 0) targetRoster[existingTargetIdx] = moving;
  else targetRoster.push(moving);
  target.doc.roster = targetRoster;

  normalizeDoc(source.doc);
  normalizeDoc(target.doc);
  writeJson(source.filePath, source.doc);
  if (source.filePath !== target.filePath) writeJson(target.filePath, target.doc);

  return NextResponse.json({
    ok: true,
    updated: {
      entity_id: moving.entity_id,
      name: moving.name,
      wr_id: moving.wr_id,
      team_code: moving.team_code,
      team_name: moving.team_name,
      tier: moving.tier,
    },
  });
}

