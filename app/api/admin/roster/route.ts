import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { getAdminWriteDisabledMessage, isAdminWriteDisabled } from "@/lib/admin-runtime";
import {
  loadMergedRosterAdminState,
  saveRemoteRosterAdminCorrection,
  shouldApplyManualAffiliationOverride,
  shouldApplyManualRaceOverride,
  shouldApplyManualTierOverride,
} from "@/lib/roster-admin-store";
import { updateTournamentTeamCaptain, updateTournamentTeamName } from "@/lib/tournament-home";
import { supabase } from "@/lib/supabase";

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

type DbTournamentPlayer = {
  id: string;
  name: string;
  nickname?: string | null;
  race?: string | null;
  tier?: string | null;
  eloboard_id?: string | null;
  gender?: string | null;
  photo_url?: string | null;
  elo_point?: number | null;
};

type TournamentHomeTeamConfig = {
  team_code?: string;
  team_name?: string;
  player_ids?: string[];
  captain_player_id?: string;
  captain_player_name?: string;
};

type TournamentHomeConfig = {
  teams?: TournamentHomeTeamConfig[];
  updated_at?: string;
};

type RecruitablePlayer = {
  id: string;
  name: string;
};

type OverrideRow = {
  entity_id: string;
  team_code?: string;
  team_name?: string;
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

function findPlayerInProjects(projects: ProjectRef[], entityId: string) {
  const source = projects.find((p) => (p.doc.roster || []).some((r) => r.entity_id === entityId));
  const player = source?.doc.roster.find((r) => r.entity_id === entityId) || null;
  return { source, player };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sourceParam = searchParams.get("source");

  const tournamentConfigPath = path.join(ROOT, "data", "metadata", "tournament_home_teams.v1.json");

  if (sourceParam === "db") {
    // DB상에 존재하는 모든 선수 정보를 가져옵니다. (JSON 로스터에 없는 선수 검색용)
    const { data: dbPlayers, error } = await supabase
      .from("players")
      .select("id, name, nickname, race, tier, eloboard_id, gender, photo_url, elo_point")
      .order("name", { ascending: true });
    
    if (error) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    }

    let tournamentTeams: Array<{
      code: string;
      name: string;
      player_ids: string[];
      players: DbTournamentPlayer[];
      player_count: number;
      captainPlayerId: string;
      is_slot: boolean;
    }> = [];
    if (fs.existsSync(tournamentConfigPath)) {
      const doc = JSON.parse(
        fs.readFileSync(tournamentConfigPath, "utf8").replace(/^\uFEFF/, "")
      ) as TournamentHomeConfig;
      const allPlayersMapped = new Map((dbPlayers || []).map((p) => [p.id, p]));

      tournamentTeams = (doc.teams || []).map((t, idx: number) => {
        const slotPlayers = (t.player_ids || []).reduce<DbTournamentPlayer[]>((acc, id: string) => {
          const player = allPlayersMapped.get(id);
          if (player) acc.push(player);
          return acc;
        }, []);
        return {
          code: t.team_code || `t${idx + 1}`,
          name: t.team_name || `임시 ${idx + 1}팀`,
          player_ids: t.player_ids || [],
          players: slotPlayers, 
          player_count: slotPlayers.length,
          captainPlayerId: t.captain_player_id || "",
          is_slot: true
        };
      });
    }

    return NextResponse.json({ ok: true, players: dbPlayers, tournament_teams: tournamentTeams });
  }

  // 대회 홈 설정(T1-T6 슬롯) 정보를 가져옵니다.
  const { data: dbPlayers } = await supabase
    .from("players")
    .select("id, name, nickname, race, tier, eloboard_id, gender, photo_url, elo_point");

  let tournamentTeams: Array<{
    code: string;
    name: string;
    player_ids: string[];
    players: DbTournamentPlayer[];
    player_count: number;
    captainPlayerId: string;
    is_slot: boolean;
  }> = [];
  if (fs.existsSync(tournamentConfigPath)) {
    const doc = JSON.parse(
      fs.readFileSync(tournamentConfigPath, "utf8").replace(/^\uFEFF/, "")
    ) as TournamentHomeConfig;
    const allPlayersMapped = new Map((dbPlayers || []).map((p) => [p.id, p]));

    tournamentTeams = (doc.teams || []).map((t, idx: number) => {
      const slotPlayers = (t.player_ids || []).reduce<DbTournamentPlayer[]>((acc, id: string) => {
        const player = allPlayersMapped.get(id);
        if (player) acc.push(player);
        return acc;
      }, []);
      return {
        code: t.team_code || `t${idx + 1}`,
        name: t.team_name || `임시 ${idx + 1}팀`,
        player_ids: t.player_ids || [],
        players: slotPlayers,
        player_count: slotPlayers.length,
        captainPlayerId: t.captain_player_id || "",
        is_slot: true
      };
    });
  }

  const projects = loadProjects();
  const rosterAdminState = await loadMergedRosterAdminState();
  const overrides = rosterAdminState.overrides;
  const exclusions = rosterAdminState.exclusions;
  const overrideMap = new Map(overrides.map((row) => [String(row.entity_id), row]));
  const teamMetaByCode = new Map(
    projects.map((project) => [
      String(project.doc.team_code || "").trim(),
      {
        team_code: project.doc.team_code,
        team_name: project.doc.team_name,
      },
    ])
  );

  const rawPlayers = projects.flatMap((p) =>
    (p.doc.roster || []).map((r) => {
      const override = overrideMap.get(String(r.entity_id));
      const exclusion = exclusionInfo(r, exclusions);
      const overrideTeamCode = String(override?.team_code || "").trim();
      const overrideTeamMeta = overrideTeamCode ? teamMetaByCode.get(overrideTeamCode) : null;
      const effectiveTeamCode = shouldApplyManualAffiliationOverride(override) ? overrideTeamCode : p.doc.team_code;
      const effectiveTeamName =
        shouldApplyManualAffiliationOverride(override)
          ? String(override?.team_name || "").trim() ||
            String(overrideTeamMeta?.team_name || "").trim() ||
            p.doc.team_name
          : p.doc.team_name;
      return {
        entity_id: r.entity_id,
        wr_id: r.wr_id,
        gender: r.gender,
        name: String(override?.name || "").trim() || r.name,
        team_code: effectiveTeamCode,
        team_name: effectiveTeamName,
        tier: shouldApplyManualTierOverride(override) ? String(override?.tier || "").trim() || r.tier : r.tier,
        race: shouldApplyManualRaceOverride(override) ? String(override?.race || "").trim() || r.race : r.race,
        manual_lock: Boolean(override),
        manual_mode: override?.manual_mode || null,
        excluded: exclusion.excluded,
        exclusion_reason: exclusion.reason || "",
      };
    })
  );

  // entity_id 중복 제거 (여러 프로젝트 파일에 동일 인물이 있을 수 있음)
  const playerMap = new Map();
  for (const p of rawPlayers) {
    if (!playerMap.has(p.entity_id)) {
      playerMap.set(p.entity_id, p);
    }
  }
  const players = Array.from(playerMap.values());

  const teams = projects.map((p) => ({
    code: p.doc.team_code,
    name: p.doc.team_name,
    players: Array.isArray(p.doc.roster) ? p.doc.roster.length : 0,
    manual_managed: Boolean(p.doc.manual_managed),
  }));

  return NextResponse.json({ ok: true, players, teams, tournament_teams: tournamentTeams });
}

export async function POST(req: Request) {
  if (isAdminWriteDisabled()) {
    return NextResponse.json(
      { ok: false, message: getAdminWriteDisabledMessage("로스터 편집") },
      { status: 403 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    team_code?: string;
    team_name?: string;
    team_name_en?: string;
    slot_code?: string; // 추가
    player_id?: string; // 추가
    player?: RecruitablePlayer;
  };

  if (body.action === "recruit_player") {
    const { player, team_code } = body;
    if (!player || !team_code) {
      return NextResponse.json({ ok: false, message: "player and team_code are required" }, { status: 400 });
    }

    const configPath = path.join(ROOT, "data", "metadata", "tournament_home_teams.v1.json");
    if (!fs.existsSync(configPath)) {
      return NextResponse.json({ ok: false, message: "tournament config not found" }, { status: 404 });
    }

    const config = JSON.parse(fs.readFileSync(configPath, "utf8").replace(/^\uFEFF/, "")) as TournamentHomeConfig;
    const normalizedTeamCode = String(team_code).trim().toLowerCase();
    const targetTeam = (config.teams || []).find((t) => String(t.team_code).trim().toLowerCase() === normalizedTeamCode);
    
    if (!targetTeam) {
      return NextResponse.json({ ok: false, message: "target slot not found" }, { status: 404 });
    }

    // 1. 중복 체크 (해당 슬롯에 이미 있는지)
    targetTeam.player_ids = targetTeam.player_ids || [];
    if (targetTeam.player_ids.includes(player.id)) {
      return NextResponse.json({ ok: false, message: "이미 이 팀에 소속된 선수입니다." }, { status: 409 });
    }

    // 2. 선수 추가 (ID 기반 영입)
    targetTeam.player_ids.push(player.id);
    config.updated_at = new Date().toISOString();
    
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");

    return NextResponse.json({ ok: true, recruited: player.name });
  }

  if (body.action === "remove_player_from_slot") {
    const { slot_code, player_id } = body;
    if (!slot_code || !player_id) {
      return NextResponse.json({ ok: false, message: "slot_code and player_id are required" }, { status: 400 });
    }

    const configPath = path.join(ROOT, "data", "metadata", "tournament_home_teams.v1.json");
    if (!fs.existsSync(configPath)) {
      return NextResponse.json({ ok: false, message: "tournament config not found" }, { status: 404 });
    }

    const config = JSON.parse(fs.readFileSync(configPath, "utf8").replace(/^\uFEFF/, "")) as TournamentHomeConfig;
    const normalizedSlotCode = String(slot_code).trim().toLowerCase();
    const targetTeam = (config.teams || []).find((t) => String(t.team_code).trim().toLowerCase() === normalizedSlotCode);
    
    if (!targetTeam) {
      return NextResponse.json({ ok: false, message: "target slot not found" }, { status: 404 });
    }

    targetTeam.player_ids = (targetTeam.player_ids || []).filter((id: string) => String(id) !== String(player_id));
    if (String(targetTeam.captain_player_id || "").trim() === String(player_id).trim()) {
      targetTeam.captain_player_id = "";
      targetTeam.captain_player_name = "";
    }
    config.updated_at = new Date().toISOString();
    
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");

    return NextResponse.json({ ok: true });
  }


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
  const parsedBody = (await req.json().catch(() => ({}))) as {
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
  const preAction = String(parsedBody.action || "").trim();
  const preEntityId = String(parsedBody.entity_id || "").trim();
  const preTeamCode = String(parsedBody.team_code || "").trim().toLowerCase();
  const allowRosterCorrectionWrite =
    preAction === "set_exclusion" || (!preAction && Boolean(preEntityId) && Boolean(preTeamCode));
  if (isAdminWriteDisabled() && !allowRosterCorrectionWrite) {
    return NextResponse.json(
      { ok: false, message: getAdminWriteDisabledMessage("로스터 편집") },
      { status: 403 }
    );
  }

  const body = parsedBody;

  const entityId = String(body.entity_id || "").trim();
  const nextTeamCode = String(body.team_code || "").trim().toLowerCase();
  const nextTier = String(body.tier || "").trim();
  const manualMode = body.manual_mode === "fixed" ? "fixed" : "temporary";
  const excluded = body.excluded === true;
  const exclusionReason = String(body.exclusion_reason || "").trim() || "user_excluded";
  const action = String(body.action || "").trim();

  if (allowRosterCorrectionWrite) {
    const projects = loadProjects();
    const { player } = findPlayerInProjects(projects, entityId);
    if (!player) {
      return NextResponse.json({ ok: false, message: "player not found" }, { status: 404 });
    }
    const overrideTier = manualMode === "fixed" ? null : nextTier || null;
    const overrideRace = manualMode === "fixed" ? null : player.race || null;

    const updatedAt = new Date().toISOString();

    if (action === "set_exclusion") {
      const remoteSaved = await saveRemoteRosterAdminCorrection(entityId, {
        entity_id: entityId,
        name: player.name,
        wr_id: player.wr_id,
        excluded,
        exclusion_reason: excluded ? exclusionReason : null,
        resume_requested_at: null,
        updated_at: updatedAt,
      });

      if (!remoteSaved) {
        const exclusions = readExclusions().filter((row) => !matchesExclusion(row, player));
        if (excluded) {
          exclusions.push({
            entity_id: player.entity_id,
            wr_id: player.wr_id,
            name: player.name,
            reason: exclusionReason,
            updated_at: updatedAt,
          });
        }
        writeExclusions(exclusions);
      }

      return NextResponse.json({
        ok: true,
        updated: {
          entity_id: player.entity_id,
          excluded,
          exclusion_reason: excluded ? exclusionReason : "",
        },
      });
    }

    const target = projects.find((project) => project.doc.team_code === nextTeamCode);
    if (!target) {
      return NextResponse.json({ ok: false, message: "target team not found" }, { status: 404 });
    }

    const remoteSaved = await saveRemoteRosterAdminCorrection(entityId, {
      entity_id: entityId,
      name: player.name,
      wr_id: player.wr_id,
      team_code: target.doc.team_code,
      team_name: target.doc.team_name,
      tier: overrideTier,
      race: overrideRace,
      manual_lock: true,
      manual_mode: manualMode,
      excluded,
      exclusion_reason: excluded ? exclusionReason : null,
      resume_requested_at: null,
      updated_at: updatedAt,
    });

    if (!remoteSaved) {
      const overrides = readOverrides().filter((row) => String(row.entity_id || "").trim() !== entityId);
      overrides.push({
        entity_id: entityId,
        name: player.name,
        team_code: target.doc.team_code,
        team_name: target.doc.team_name,
        tier: overrideTier || undefined,
        race: overrideRace || undefined,
        manual_lock: true,
        manual_mode: manualMode,
        updated_at: updatedAt,
      });
      writeOverrides(overrides);

      const exclusions = readExclusions().filter((row) => !matchesExclusion(row, player));
      if (excluded) {
        exclusions.push({
          entity_id: player.entity_id,
          wr_id: player.wr_id,
          name: player.name,
          reason: exclusionReason,
          updated_at: updatedAt,
        });
      }
      writeExclusions(exclusions);
    }

    return NextResponse.json({
      ok: true,
      updated: {
        entity_id: player.entity_id,
        name: player.name,
        wr_id: player.wr_id,
        team_code: target.doc.team_code,
        team_name: target.doc.team_name,
        tier: overrideTier || player.tier,
        manual_mode: manualMode,
        excluded,
        exclusion_reason: excluded ? exclusionReason : "",
      },
    });
  }

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
  const parsedBody = (await req.json().catch(() => ({}))) as {
    entity_id?: string;
    clear_override?: boolean;
    clear_exclusion?: boolean;
  };

  const allowRosterCorrectionWrite =
    parsedBody.clear_override === true || parsedBody.clear_exclusion === true;

  if (isAdminWriteDisabled() && !allowRosterCorrectionWrite) {
    return NextResponse.json(
      { ok: false, message: getAdminWriteDisabledMessage("로스터 편집") },
      { status: 403 }
    );
  }

  const body = parsedBody;

  const entityId = String(body.entity_id || "").trim();
  if (!entityId) {
    return NextResponse.json({ ok: false, message: "entity_id is required" }, { status: 400 });
  }

  if (allowRosterCorrectionWrite) {
    if (body.clear_override) {
      const remoteSaved = await saveRemoteRosterAdminCorrection(entityId, {
        team_code: null,
        team_name: null,
        tier: null,
        race: null,
        manual_lock: false,
        manual_mode: null,
        note: null,
        updated_at: new Date().toISOString(),
      });

      if (!remoteSaved) {
        const overrides = readOverrides().filter((row) => String(row.entity_id || "").trim() !== entityId);
        writeOverrides(overrides);
      }
    }

    if (body.clear_exclusion) {
      const projects = loadProjects();
      const { player } = findPlayerInProjects(projects, entityId);
      const updatedAt = new Date().toISOString();
      const remoteSaved = await saveRemoteRosterAdminCorrection(entityId, {
        excluded: false,
        exclusion_reason: null,
        resume_requested_at: player ? updatedAt : null,
        updated_at: updatedAt,
        name: player?.name,
        wr_id: player?.wr_id,
      });

      if (!remoteSaved) {
        const exclusions = readExclusions().filter((row) =>
          player ? !matchesExclusion(row, player) : String(row.entity_id || "").trim() !== entityId
        );
        writeExclusions(exclusions);
      }

      if (player && !remoteSaved) {
        const resumes = readResumes().filter((row) => !matchesExclusion(row, player));
        resumes.push({
          entity_id: player.entity_id,
          wr_id: player.wr_id,
          name: player.name,
          requested_at: updatedAt,
        });
        writeResumes(resumes);
      }
    }

    return NextResponse.json({ ok: true });
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
