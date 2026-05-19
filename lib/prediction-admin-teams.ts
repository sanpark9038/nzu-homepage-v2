type PredictionAdminPlayer = {
  id: string;
  name: string;
  nickname?: string | null;
  race?: string | null;
  tier?: string | null;
  university?: string | null;
};

type PredictionAdminTeam = {
  teamCode: string;
  teamName: string;
  players: Array<{
    id: string;
    name: string;
    nickname: string | null;
    race: string | null;
    tier: string | null;
  }>;
};

const FREE_AGENT_CODES = new Set([
  "FA",
  "FREEAGENT",
  "FREEAGENCY",
  "UNASSIGNED",
  "NONE",
  "NOAFFILIATION",
  "무소속",
  "자유계약",
  "자유계약선수",
]);

function normalizeText(value: string | null | undefined) {
  return String(value || "").trim();
}

function normalizeAffiliationKey(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[.\-_/()[\]]+/g, "");
}

function isOfficialAffiliation(value: string) {
  const raw = normalizeText(value);
  if (!raw) return false;
  return !FREE_AGENT_CODES.has(normalizeAffiliationKey(raw)) && !FREE_AGENT_CODES.has(raw);
}

export function buildPredictionUniversityTeams(players: PredictionAdminPlayer[]): PredictionAdminTeam[] {
  const grouped = new Map<string, PredictionAdminTeam>();

  for (const player of players) {
    const university = normalizeText(player.university);
    if (!isOfficialAffiliation(university)) continue;

    if (!grouped.has(university)) {
      grouped.set(university, {
        teamCode: university,
        teamName: university,
        players: [],
      });
    }

    grouped.get(university)?.players.push({
      id: player.id,
      name: player.name,
      nickname: player.nickname ?? null,
      race: player.race ?? null,
      tier: player.tier ?? null,
    });
  }

  return [...grouped.values()].sort((a, b) => a.teamName.localeCompare(b.teamName, "ko-KR"));
}
