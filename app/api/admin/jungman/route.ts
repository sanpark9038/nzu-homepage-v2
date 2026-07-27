import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { ADMIN_SESSION_COOKIE, assertValidAdminSession } from "@/lib/admin-auth";
import {
  JUNGMAN_CONFIG_KEY,
  JUNGMAN_SNAPSHOTS_KEY,
  JUNGMAN_TEAMS,
  JUNGMAN_VOTING_TEAMS,
  parseJungmanConfig,
  parseJungmanMapping,
  parseJungmanSnapshots,
  suggestJungmanMapping,
  type JungmanConfig,
  type JungmanSnapshot,
} from "@/lib/jungman";
import {
  collectJungmanSnapshot,
  fetchJungmanComments,
  writeJungmanSnapshots,
} from "@/lib/jungman-collector";
import {
  readSettingAdmin as readSetting,
  writeSettingAdmin as writeSetting,
} from "@/lib/site-settings-admin";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

async function requireAdmin() {
  const cookieStore = await cookies();
  assertValidAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
}

async function loadState() {
  const [configRaw, snapshotsRaw] = await Promise.all([
    readSetting(JUNGMAN_CONFIG_KEY),
    readSetting(JUNGMAN_SNAPSHOTS_KEY),
  ]);

  return {
    config: parseJungmanConfig(configRaw),
    snapshots: parseJungmanSnapshots(snapshotsRaw),
  };
}

function respondWith(state: Record<string, unknown>, message: string) {
  revalidatePath("/jungman");
  revalidatePath("/admin/jungman");
  return NextResponse.json({ ok: true, message, ...state });
}

const COLLECT_SKIP_LABEL: Record<string, string> = {
  disabled: "자동 수집이 꺼져 있거나 글·매핑이 없습니다",
  cooldown: "수집 간격이 아직 지나지 않았습니다",
  fetch_failed: "댓글을 불러오지 못했습니다",
  no_match: "매핑된 댓글을 하나도 찾지 못했습니다",
  anomaly: "득표가 비정상적으로 급락했습니다",
  unchanged: "직전과 득표가 같습니다",
  history_lost: "스냅샷 이력을 읽지 못했습니다. 덮어쓰지 않고 멈췄습니다 — jungman_snapshots를 확인해주세요",
  raced: "다른 수집이 방금 기록해 이번 회차는 건너뜁니다",
};

/** https://www.sooplive.com/station/{soopId}/post/{titleNo} */
function parsePostUrl(raw: unknown) {
  const url = String(raw || "").trim();
  const match = url.match(/station\/([A-Za-z0-9_-]+)\/post\/(\d+)/);
  if (!match) {
    return { error: "공지 글 주소 형식이 아닙니다. 예: https://www.sooplive.com/station/ititit/post/202453919" as const };
  }
  return { soopId: match[1], titleNo: Number(match[2]) };
}

/** players.university 문자열 → 팀코드. 팀 사전(name+aliases)을 그대로 재사용한다. */
const TEAM_CODE_BY_LABEL = new Map(
  JUNGMAN_TEAMS.flatMap((team) =>
    [team.name, ...team.aliases].map((label) => [label.trim().toUpperCase(), team.code] as const)
  )
);

/** 숲ID(소문자) → 팀코드. 댓글 작성자의 소속을 알아내는 두 번째 신호. */
async function loadSoopIdentities(): Promise<Record<string, string>> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("players")
    .select("soop_id, university")
    .not("soop_id", "is", null);
  if (error) throw new Error(error.message);

  const map: Record<string, string> = {};
  const conflicted = new Set<string>();
  for (const row of data || []) {
    const soopId = String(row.soop_id || "").trim().toLowerCase();
    const code = TEAM_CODE_BY_LABEL.get(String(row.university || "").trim().toUpperCase());
    if (!soopId || !code) continue;
    // 같은 숲ID가 두 팀으로 등록돼 있으면 어느 쪽도 믿지 않는다
    if (map[soopId] && map[soopId] !== code) conflicted.add(soopId);
    map[soopId] = code;
  }
  for (const soopId of conflicted) delete map[soopId];
  return map;
}

/** 12팀 표수 검증 — 음수·비정수·모르는 코드는 여기서 막는다(공개 파서에 기대지 않음). */
function normalizeVotes(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "표수 입력이 없습니다." as const };
  }

  const input = raw as Record<string, unknown>;
  const votes: Record<string, number> = {};

  for (const team of JUNGMAN_VOTING_TEAMS) {
    const value = input[team.code];
    const count = value === "" || value === null || value === undefined ? 0 : Number(value);
    if (!Number.isFinite(count) || count < 0 || !Number.isInteger(count)) {
      return { error: `${team.name} 표수가 올바르지 않습니다. 0 이상 정수만 입력해주세요.` as const };
    }
    votes[team.code] = count;
  }

  return { votes };
}

export async function GET() {
  try {
    await requireAdmin();
    const state = await loadState();
    return NextResponse.json({ ok: true, ...state });
  } catch (error) {
    return errorResponse(error, "중만컵 현황을 불러오지 못했습니다.");
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      votes?: unknown;
      voteCloseAt?: string;
      nextRevealAt?: string | null;
      postUrl?: string;
      mapping?: unknown;
      autoCollect?: boolean;
    };
    const action = String(body.action || "").trim();

    if (action === "save-snapshot") {
      const normalized = normalizeVotes(body.votes);
      if ("error" in normalized) {
        return NextResponse.json({ ok: false, message: normalized.error }, { status: 400 });
      }

      const { config, snapshots } = await loadState();
      const nextRound = (snapshots[snapshots.length - 1]?.round || 0) + 1;
      const next: JungmanSnapshot[] = [
        ...snapshots,
        { round: nextRound, at: new Date().toISOString(), votes: normalized.votes },
      ];

      await writeJungmanSnapshots(next);
      return respondWith({ config, snapshots: next }, `${nextRound}차 개표를 저장했습니다.`);
    }

    if (action === "save-config") {
      const voteCloseAt = String(body.voteCloseAt || "").trim();
      if (!voteCloseAt || !Number.isFinite(Date.parse(voteCloseAt))) {
        return NextResponse.json({ ok: false, message: "투표 마감 시각이 올바르지 않습니다." }, { status: 400 });
      }

      const rawReveal = String(body.nextRevealAt || "").trim();
      if (rawReveal && !Number.isFinite(Date.parse(rawReveal))) {
        return NextResponse.json({ ok: false, message: "다음 개표 시각이 올바르지 않습니다." }, { status: 400 });
      }

      // 수집 설정(soopId·titleNo·mapping…)을 덮어쓰지 않도록 기존 config 위에 얹는다.
      const { config: current, snapshots } = await loadState();
      const config: JungmanConfig = {
        ...current,
        voteCloseAt: new Date(voteCloseAt).toISOString(),
        nextRevealAt: rawReveal ? new Date(rawReveal).toISOString() : null,
      };

      await writeSetting(JUNGMAN_CONFIG_KEY, JSON.stringify(config));
      return respondWith({ config, snapshots }, "일정 설정을 저장했습니다.");
    }

    if (action === "fetch-comments") {
      const target = parsePostUrl(body.postUrl);
      if ("error" in target) {
        return NextResponse.json({ ok: false, message: target.error }, { status: 400 });
      }

      const fetched = await fetchJungmanComments(target.soopId, target.titleNo);
      if (!fetched.ok) {
        return NextResponse.json(
          { ok: false, message: `댓글을 불러오지 못했습니다. (${fetched.reason})` },
          { status: 502 }
        );
      }

      // 글이 바뀌었으면 여기서 대상까지 굳힌다 — 매핑 저장 때 또 파싱하지 않도록.
      const { config: current, snapshots } = await loadState();
      const config: JungmanConfig = { ...current, soopId: target.soopId, titleNo: target.titleNo };
      await writeSetting(JUNGMAN_CONFIG_KEY, JSON.stringify(config));

      // 선수 명부 대조는 보조 신호다 — 실패해도 추정 자체는 돌아가야 한다.
      let identities: Record<string, string> = {};
      let identityNote = "";
      try {
        identities = await loadSoopIdentities();
      } catch {
        identityNote = " (선수 명부를 읽지 못해 숲ID 대조는 건너뛰었습니다)";
      }

      const comments = fetched.comments.slice().sort((a, b) => b.likes - a.likes);
      const { guesses } = suggestJungmanMapping(comments, identities);
      return respondWith(
        { config, snapshots, comments, guesses },
        `댓글 ${comments.length}개를 불러왔습니다. ${Object.keys(guesses).length}팀을 자동 인식했습니다.${identityNote}`
      );
    }

    if (action === "save-mapping") {
      const mapping = parseJungmanMapping(body.mapping);

      const seen = new Map<string, string>();
      for (const [commentNo, code] of Object.entries(mapping)) {
        const already = seen.get(code);
        if (already) {
          const team = JUNGMAN_VOTING_TEAMS.find((item) => item.code === code);
          return NextResponse.json(
            {
              ok: false,
              message: `${team?.name || code}이(가) 두 댓글(${already}, ${commentNo})에 중복 지정됐습니다.`,
            },
            { status: 400 }
          );
        }
        seen.set(code, commentNo);
      }

      const { config: current, snapshots } = await loadState();
      const config: JungmanConfig = { ...current, mapping };
      await writeSetting(JUNGMAN_CONFIG_KEY, JSON.stringify(config));
      return respondWith({ config, snapshots }, `팀 ${Object.keys(mapping).length}개를 매핑했습니다.`);
    }

    if (action === "set-auto-collect") {
      const { config: current, snapshots } = await loadState();
      const config: JungmanConfig = { ...current, autoCollect: body.autoCollect === true };
      await writeSetting(JUNGMAN_CONFIG_KEY, JSON.stringify(config));
      return respondWith(
        { config, snapshots },
        config.autoCollect ? "자동 수집을 켰습니다." : "자동 수집을 껐습니다."
      );
    }

    if (action === "collect-now") {
      const result = await collectJungmanSnapshot(true);
      const { config, snapshots } = await loadState();
      return respondWith(
        { config, snapshots },
        result.ok
          ? `${result.round}차로 기록했습니다.${
              result.carried.length
                ? ` (댓글을 못 찾아 직전 값을 이어받음: ${result.carried.join(", ")})`
                : ""
            }`
          : `기록하지 않았습니다 — ${COLLECT_SKIP_LABEL[result.skipped] || result.skipped}${
              result.reason ? ` (${result.reason})` : ""
            }`
      );
    }

    if (action === "delete-last-snapshot") {
      const { config, snapshots } = await loadState();
      if (!snapshots.length) {
        return NextResponse.json({ ok: false, message: "삭제할 개표 기록이 없습니다." }, { status: 400 });
      }

      const next = snapshots.slice(0, -1);
      await writeJungmanSnapshots(next);
      return respondWith({ config, snapshots: next }, `${snapshots[snapshots.length - 1].round}차 개표를 삭제했습니다.`);
    }

    return NextResponse.json({ ok: false, message: "알 수 없는 요청입니다." }, { status: 400 });
  } catch (error) {
    return errorResponse(error, "중만컵 현황 저장에 실패했습니다.");
  }
}

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  if (message === "unauthorized") {
    return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  }
  if (message === "missing_supabase_admin_env") {
    return NextResponse.json({ ok: false, message: "Supabase 관리자 환경변수가 없습니다." }, { status: 500 });
  }
  return NextResponse.json({ ok: false, message: message || fallback }, { status: 500 });
}
