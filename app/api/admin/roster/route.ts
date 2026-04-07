import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { updateTournamentTeamCaptain, updateTournamentTeamName } from "@/lib/tournament-home";

export const runtime = "nodejs";

type ManualMode = "temporary" | "fixed";

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
  display_name?: string;
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
  manual_managed?: boolean;
};

type ProjectRef = {
  code: string;
  filePath: string;
  doc: ProjectDoc;
};

type OverrideRow = {
  entity_id: string;
  team_code?: string;
  tier?: string;
  race?: string;
  name?: string;
  manual_lock?: boolean;
  manual_mode?: ManualMode;
  note?: string;
  updated_at?: string;
};

type ExclusionRow = {
  name?: string;
  wr_id?: number;
  entity_id?: string;
  reason?: string;
  updated_at?: string;
};

type ResumeRow = {
  name?: string;
  wr_id?: number;
  entity_id?: string;
  requested_at?: string;
};

const ROOT = process.cwd();
const PROJECTS_DIR = path.join(ROOT, "data", "metadata", "projects");
const OVERRIDES_PATH = path.join(ROOT, "data", "metadata", "roster_manual_overrides.v1.json");
const EXCLUSIONS_PATH = path.join(ROOT, "data", "metadata", "pipeline_collection_exclusions.v1.json");
const RESUMES_PATH = path.join(ROOT, "data", "metadata", "pipeline_collection_resumes.v1.json");

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "")) as T;
}

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function readOverrides(): OverrideRow[] {
  if (!fs.existsSync(OVERRIDES_PATH)) return [];
  try {
    const doc = readJson<{ overrides?: OverrideRow[] }>(OVERRIDES_PATH);
    return Array.isArray(doc.overrides) ? doc.overrides : [];
  } catch {
    return [];
  }
}

function writeOverrides(rows: OverrideRow[]) {
  writeJson(OVERRIDES_PATH, {
    schema_version: "1.0.0",
    updated_at: new Date().toISOString(),
    description:
      "Manual lock overrides for roster sync. Locked fields take precedence over source sync.",
    overrides: rows,
  });
}

function readExclusions(): ExclusionRow[] {
  if (!fs.existsSync(EXCLUSIONS_PATH)) return [];
  try {
    const doc = readJson<{ players?: ExclusionRow[] }>(EXCLUSIONS_PATH);
    return Array.isArray(doc.players) ? doc.players : [];
  } catch {
    return [];
  }
}

function writeExclusions(rows: ExclusionRow[]) {
  writeJson(EXCLUSIONS_PATH, {
    schema_version: "1.0.0",
    updated_at: new Date().toISOString(),
    description: "Players excluded from match collection pipeline.",
    players: rows,
  });
}

function readResumes(): ResumeRow[] {
  if (!fs.existsSync(RESUMES_PATH)) return [];
  try {
    const doc = readJson<{ players?: ResumeRow[] }>(RESUMES_PATH);
    return Array.isArray(doc.players) ? doc.players : [];
  } catch {
    return [];
  }
}

function writeResumes(rows: ResumeRow[]) {
  writeJson(RESUMES_PATH, {
    schema_version: "1.0.0",
    updated_at: new Date().toISOString(),
    description: "Players that should be forcibly recollected once after exclusion is cleared.",
    players: rows,
  });
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

function normalizeDoc(doc: ProjectDoc) {
  doc.generated_at = new Date().toISOString();
  doc.roster_count = Array.isArray(doc.roster) ? doc.roster.length : 0;
  sortRoster(doc);
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

function exclusionInfo(player: RosterPlayer, rows: ExclusionRow[]) {
  const entityId = String(player.entity_id || "").trim();
  const wrId = Number(player.wr_id);
  const name = String(player.name || "").trim();
  const hit = rows.find((row) => {
    if (String(row.entity_id || "").trim() && String(row.entity_id).trim() === entityId) return true;
    if (Number.isFinite(Number(row.wr_id)) && Number(row.wr_id) === wrId) return true;
    if (String(row.name || "").trim() && String(row.name).trim() === name) return true;
    return false;
  });
  return {
    excluded: Boolean(hit),
    reason: String(hit?.reason || ""),
  };
}

function matchesExclusion(row: ExclusionRow, player: Pick<RosterPlayer, "entity_id" | "wr_id" | "name">) {
  const rowEntityId = String(row.entity_id || "").trim();
  const playerEntityId = String(player.entity_id || "").trim();
  if (rowEntityId && playerEntityId && rowEntityId === playerEntityId) return true;
  const rowWrId = Number(row.wr_id);
  const playerWrId = Number(player.wr_id);
  if (Number.isFinite(rowWrId) && Number.isFinite(playerWrId) && rowWrId === playerWrId) return true;
  const rowName = String(row.name || "").trim();
  const playerName = String(player.name || "").trim();
  if (rowName && playerName && rowName === playerName) return true;
  return false;
}

function baseTeamDoc(teamCode: string, teamName: string, teamNameEn?: string): ProjectDoc {
  return {
    schema_version: "1.0.0",
    generated_at: new Date().toISOString(),
    project: teamCode,
    team_name: teamName,
    team_code: teamCode,
    team_name_en: teamNameEn || teamCode.toUpperCase(),
    roster_count: 0,
    roster: [],
    manual_managed: true,
  };
}

export async function GET() {
  const projects = loadProjects();
  const overrides = readOverrides();
  const exclusions = readExclusions();
  const overrideMap = new Map(overrides.map((row) => [String(row.entity_id), row]));

  const players = projects.flatMap((p) =>
    (p.doc.roster || []).map((r) => {
      const override = overrideMap.get(String(r.entity_id));
      const exclusion = exclusionInfo(r, exclusions);
      return {
        entity_id: r.entity_id,
        wr_id: r.wr_id,
        gender: r.gender,
        name: r.name,
        team_code: p.doc.team_code,
        team_name: p.doc.team_name,
        tier: r.tier,
        race: r.race,
        manual_lock: Boolean(override),
        manual_mode: override?.manual_mode || null,
        excluded: exclusion.excluded,
        exclusion_reason: exclusion.reason || "",
      };
    })
  );

  const teams = projects.map((p) => ({
    code: p.doc.team_code,
    name: p.doc.team_name,
    players: Array.isArray(p.doc.roster) ? p.doc.roster.length : 0,
    manual_managed: Boolean(p.doc.manual_managed),
  }));

  return NextResponse.json({ ok: true, players, teams });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    team_code?: string;
    team_name?: string;
    team_name_en?: string;
  };

  if (body.action === "delete_team") {
    const teamCode = slug(String(body.team_code || ""));
    if (!teamCode) {
      return NextResponse.json({ ok: false, message: "team_code is required" }, { status: 400 });
    }

    const projects = loadProjects();
    const target = projects.find((p) => p.doc.team_code === teamCode);
    if (!target) {
      return NextResponse.json({ ok: false, message: "team not found" }, { status: 404 });
    }
    if (!target.doc.manual_managed) {
      return NextResponse.json({ ok: false, message: "only manual-managed teams can be deleted" }, { status: 400 });
    }
    if (Array.isArray(target.doc.roster) && target.doc.roster.length > 0) {
      return NextResponse.json({ ok: false, message: "move players out before deleting this team" }, { status: 409 });
    }

    const dirPath = path.dirname(target.filePath);
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }

    return NextResponse.json({ ok: true, deleted: { team_code: teamCode, team_name: target.doc.team_name } });
  }

  if (body.action !== "create_team") {
    return NextResponse.json({ ok: false, message: "unsupported action" }, { status: 400 });
  }

  const teamCode = slug(String(body.team_code || ""));
  const teamName = String(body.team_name || "").trim();
  const teamNameEn = String(body.team_name_en || "").trim();

  if (!teamCode || !teamName) {
    return NextResponse.json({ ok: false, message: "team_code and team_name are required" }, { status: 400 });
  }

  const projects = loadProjects();
  const dup = projects.find(
    (p) => p.doc.team_code === teamCode || String(p.doc.team_name || "").trim() === teamName
  );
  if (dup) {
    return NextResponse.json({ ok: false, message: "existing team code or name already exists" }, { status: 409 });
  }

  const filePath = path.join(PROJECTS_DIR, teamCode, `players.${teamCode}.v1.json`);
  writeJson(filePath, baseTeamDoc(teamCode, teamName, teamNameEn));
  return NextResponse.json({ ok: true, created: { team_code: teamCode, team_name: teamName } });
}

export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    entity_id?: string;
    team_code?: string;
    tier?: string;
    manual_mode?: ManualMode;
    excluded?: boolean;
    exclusion_reason?: string;
    captain_player_id?: string;
    team_name?: string;
  };

  const entityId = String(body.entity_id || "").trim();
  const nextTeamCode = String(body.team_code || "").trim().toLowerCase();
  const nextTier = String(body.tier || "").trim();
  const manualMode = body.manual_mode === "fixed" ? "fixed" : "temporary";
  const excluded = body.excluded === true;
  const exclusionReason = String(body.exclusion_reason || "").trim() || "user_excluded";
  const action = String(body.action || "").trim();

  if (action === "set_team_captain") {
    const teamCode = String(body.team_code || "").trim();
    const captainPlayerId = String(body.captain_player_id || "").trim() || null;

    if (!teamCode) {
      return NextResponse.json({ ok: false, message: "team_code is required" }, { status: 400 });
    }

    try {
      updateTournamentTeamCaptain(teamCode, captainPlayerId);
      return NextResponse.json({
        ok: true,
        updated: {
          team_code: teamCode,
          captain_player_id: captainPlayerId,
        },
      });
    } catch (error) {
      return NextResponse.json(
        { ok: false, message: error instanceof Error ? error.message : "failed to update captain" },
        { status: 400 }
      );
    }
  }

  if (action === "update_team_name") {
    const teamCode = String(body.team_code || "").trim();
    const teamName = String(body.team_name || "").trim();

    if (!teamCode || !teamName) {
      return NextResponse.json({ ok: false, message: "team_code and team_name are required" }, { status: 400 });
    }

    try {
      updateTournamentTeamName(teamCode, teamName);
      return NextResponse.json({
        ok: true,
        updated: {
          team_code: teamCode,
          team_name: teamName,
        },
      });
    } catch (error) {
      return NextResponse.json(
        { ok: false, message: error instanceof Error ? error.message : "failed to update team name" },
        { status: 400 }
      );
    }
  }

  if (!entityId) {
    return NextResponse.json({ ok: false, message: "entity_id is required" }, { status: 400 });
  }

  if (action === "set_exclusion") {
    const projects = loadProjects();
    const source = projects.find((p) => (p.doc.roster || []).some((r) => r.entity_id === entityId));
    const player = source?.doc.roster.find((r) => r.entity_id === entityId);
    if (!player) {
      return NextResponse.json({ ok: false, message: "player not found" }, { status: 404 });
    }

    const exclusions = readExclusions().filter((row) => !matchesExclusion(row, player));
    if (excluded) {
      exclusions.push({
        entity_id: player.entity_id,
        wr_id: player.wr_id,
        name: player.name,
        reason: exclusionReason,
        updated_at: new Date().toISOString(),
      });
    }
    writeExclusions(exclusions);

    return NextResponse.json({
      ok: true,
      updated: {
        entity_id: player.entity_id,
        excluded,
        exclusion_reason: excluded ? exclusionReason : "",
      },
    });
  }

  if (!nextTeamCode || !nextTier) {
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

  const overrides = readOverrides().filter((r) => String(r.entity_id) !== entityId);
  overrides.push({
    entity_id: entityId,
    name: moving.name,
    team_code: nextTeamCode,
    tier: nextTier,
    race: moving.race,
    manual_lock: true,
    manual_mode: manualMode,
    updated_at: new Date().toISOString(),
  });
  writeOverrides(overrides);

  const exclusions = readExclusions().filter((row) => !matchesExclusion(row, moving));
  if (excluded) {
    exclusions.push({
      entity_id: moving.entity_id,
      wr_id: moving.wr_id,
      name: moving.name,
      reason: exclusionReason,
      updated_at: new Date().toISOString(),
    });
  }
  writeExclusions(exclusions);

  return NextResponse.json({
    ok: true,
    updated: {
      entity_id: moving.entity_id,
      name: moving.name,
      wr_id: moving.wr_id,
      team_code: moving.team_code,
      team_name: moving.team_name,
      tier: moving.tier,
      manual_mode: manualMode,
      excluded,
      exclusion_reason: excluded ? exclusionReason : "",
    },
  });
}

export async function DELETE(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    entity_id?: string;
    clear_override?: boolean;
    clear_exclusion?: boolean;
  };

  const entityId = String(body.entity_id || "").trim();
  if (!entityId) {
    return NextResponse.json({ ok: false, message: "entity_id is required" }, { status: 400 });
  }

  if (body.clear_override) {
    const overrides = readOverrides().filter((row) => String(row.entity_id || "").trim() !== entityId);
    writeOverrides(overrides);
  }

  if (body.clear_exclusion) {
    const projects = loadProjects();
    const source = projects.find((p) => (p.doc.roster || []).some((r) => r.entity_id === entityId));
    const player = source?.doc.roster.find((r) => r.entity_id === entityId);
    const exclusions = readExclusions().filter((row) =>
      player ? !matchesExclusion(row, player) : String(row.entity_id || "").trim() !== entityId
    );
    writeExclusions(exclusions);
    if (player) {
      const resumes = readResumes().filter((row) => !matchesExclusion(row, player));
      resumes.push({
        entity_id: player.entity_id,
        wr_id: player.wr_id,
        name: player.name,
        requested_at: new Date().toISOString(),
      });
      writeResumes(resumes);
    }
  }

  return NextResponse.json({ ok: true });
}
