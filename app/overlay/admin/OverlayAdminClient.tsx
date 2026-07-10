"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Copy, Check, Eye, EyeOff,
  Settings, X, Layers, Plus, GripVertical, ClipboardPaste, HelpCircle, Lock, RotateCcw,
} from "lucide-react";
import {
  defaultOverlayState,
  defaultOverlaySet,
  defaultOverlaySide,
  buildDefaultSets,
  defaultBroadcastTitle,
  defaultModeFor,
  setWinnerOf,
  miniAceNeeded,
  type OverlayEntryRow,
  type OverlayMatchFormat,
  type OverlayUniversityFormat,
  type OverlayResult,
  type OverlayPanelLayout,
  type OverlayRace,
  type OverlaySet,
  type OverlayState,
} from "@/lib/overlay-types";
import { getUniversityLabel } from "@/lib/university-config";
import { parseBulk, type ParsedRow } from "@/lib/overlay-bulk-parse";
import { RACES, RACE_COLORS, RACE_BG, raceOfName } from "@/lib/overlay-race";

// ─── 상수 ───
// 종족 색상·매칭 규칙은 lib/overlay-race.ts 한 곳에서 관리 (방송 화면과 항상 동일)

// 스타팅 위치용 "정사각형 시계" 좌표 — 실제 시계처럼 12가 위쪽 정가운데, 3이 오른쪽 정가운데, 6이 아래쪽 정가운데,
// 9가 왼쪽 정가운데. 11·1·5·7은 네 꼭짓점에 정확히 배치해 사각형 윤곽이 뚜렷하게 보이도록 함. x/y는 컨테이너 대비 %
const STARTING_POS = [
  { h: 1,  x: 90, y: 10 }, { h: 2,  x: 90, y: 30 }, { h: 3,  x: 90, y: 50 }, { h: 4,  x: 90, y: 70 },
  { h: 5,  x: 90, y: 90 }, { h: 6,  x: 50, y: 90 }, { h: 7,  x: 10, y: 90 }, { h: 8,  x: 10, y: 70 },
  { h: 9,  x: 10, y: 50 }, { h: 10, x: 10, y: 30 }, { h: 11, x: 10, y: 10 }, { h: 12, x: 50, y: 10 },
];

function genId() { return Math.random().toString(36).slice(2, 9); }

// ─── 일괄 입력 예시 (고정, 4대4) ───
// 브라우저의 font-mono는 한글을 ASCII 2배 폭으로 그리지 않으므로 공백 열맞춤이 불가능.
// → 좌우 2열 대신 위아래 그룹으로 나눠 구분한다.
const VS_SAMPLE_TEXT = [
  "[이름만 — 종족·맵 생략 가능]",
  "영희 vs 숙자",
  "영자 vs 숙희",
  "",
  "[종족·맵 포함]",
  "3 영희 P vs 숙자 T 실",
  "5 영자 Z vs 숙희 T 녹",
  "6 미영 T vs 순희 P 폴",
  "8 정숙 Z vs 말순 T 라",
].join("\n");

// 키캡 표기 (Tab / Enter 등)
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center h-[18px] px-1.5 rounded border border-white/20 bg-white/[0.08] text-[10px] font-bold text-white/70 leading-none align-middle">
      {children}
    </kbd>
  );
}

// 대진표 입력 안내 — Tab/Enter 다음 칸, ✓ 체크 시 다음 경기 자동, 핸들 드래그로 순서 변경
function EntryHint() {
  return (
    <span className="flex items-center gap-1.5 text-[13px] font-semibold text-white/45 flex-wrap">
      <Kbd>Tab</Kbd><Kbd>Enter</Kbd>
      <span>다음 칸</span>
      <span className="text-white/15">·</span>
      <span className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full border border-emerald-400/50 text-emerald-300 text-[10px] font-black">✓</span>
      <span>승패 체크 시 <b className="text-white/65">다음 경기 자동</b></span>
      <span className="text-white/15">·</span>
      <GripVertical size={14} className="text-white/40" />
      <span>드래그로 순서 변경</span>
    </span>
  );
}

// 자동으로 채워지는 값임을 알려주는 배지(자물쇠) — 사용자가 직접 안 채워도 됨을 표시
function AutoBadge({ title }: { title?: string }) {
  return (
    <span
      title={title ?? "자동으로 입력돼요 (직접 입력하면 수동으로 바뀌어요)"}
      className="inline-flex items-center gap-0.5 rounded px-1 py-[1px] bg-emerald-500/12 border border-emerald-500/25 text-emerald-300/80 text-[9px] font-bold leading-none align-middle">
      <Lock size={8} strokeWidth={2.5} />자동
    </span>
  );
}

type FocusedField = { kind: "scoreboard"; side: "left" | "right" };

// ─── 메인 컴포넌트 ───
export default function OverlayAdminClient({
  overlayKey, displayName,
}: { overlayKey: string; displayName: string }) {
  const [state, setState]       = useState<OverlayState>(defaultOverlayState());
  const [saving, setSaving]     = useState(false);
  const [dirty, setDirty]       = useState(false);
  const [loaded, setLoaded]     = useState(false);
  const [obsModalOpen, setObsModalOpen] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [removeSetConfirm, setRemoveSetConfirm] = useState(false);
  const [modeConfirm, setModeConfirm] = useState<"team" | "individual" | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const HELP_KEY = `overlay_help_dismissed_${overlayKey}`;
  const [helpDismissed, setHelpDismissed] = useState(true); // SSR 기본 숨김 → 클라에서 보정
  useEffect(() => {
    if (typeof window !== "undefined") setHelpDismissed(localStorage.getItem(HELP_KEY) === "1");
  }, [HELP_KEY]);
  const dismissHelp = () => { setHelpDismissed(true); localStorage.setItem(HELP_KEY, "1"); };
  const [focusedField, setFocusedField] = useState<FocusedField | null>(null);

  // 진행 방식 전환(구조 재구성) 확인 팝오버 — 저장된 함수를 실행하면 재구성됨
  const [formatConfirm, setFormatConfirm] = useState<(() => void) | null>(null);
  // 5판3선(미니대전) 첫 선택 시 안내 배너 + "다시 보지 않기"
  const MINI_INTRO_KEY = `overlay_mini_intro_dismissed_${overlayKey}`;
  const [miniIntroOpen, setMiniIntroOpen] = useState(false);
  const [miniIntroDismissed, setMiniIntroDismissed] = useState(true); // SSR 기본 숨김 → 클라 보정
  useEffect(() => {
    if (typeof window !== "undefined") setMiniIntroDismissed(localStorage.getItem(MINI_INTRO_KEY) === "1");
  }, [MINI_INTRO_KEY]);
  const dismissMiniIntro = () => { setMiniIntroDismissed(true); setMiniIntroOpen(false); localStorage.setItem(MINI_INTRO_KEY, "1"); };

  // 선수 DB (이름/닉네임 ↔ 종족·대학 매칭용) — 일괄 입력·자동 진행 시 종족 자동 인식 + 대학대전 대학 드롭다운에 사용
  const [playerDb, setPlayerDb] = useState<{ name: string; nickname: string | null; race: string; university: string | null }[]>([]);
  useEffect(() => {
    fetch("/api/players").then(r => r.json()).then(p => {
      if (p.ok) setPlayerDb(p.players.map((x: { name: string; nickname?: string | null; race: string; university?: string | null }) =>
        ({ name: x.name, nickname: x.nickname ?? null, race: x.race, university: x.university ?? null })));
    }).catch(() => {});
  }, []);
  const raceOf = useCallback((name: string) => raceOfName(playerDb, name), [playerDb]);
  // 등록된 대학 목록 (대학대전 "내 팀 인식" 드롭다운용)
  const universities = Array.from(new Set(playerDb.map(p => p.university).filter((u): u is string => !!u))).sort();
  const [toast, setToast]       = useState<string | null>(null);
  const [adminTab, setAdminTab] = useState<string | null>(null);
  const saveTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  // 내 팀 인식 (일괄 입력에서 우리팀 줄 판단 기준) — 프로리그=선수 이름, 대학대전=대학 이름. 방식별로 따로 기억.
  const MY_NAME_KEY_PROLEAGUE  = `overlay_myname_proleague_${overlayKey}`;
  const MY_NAME_KEY_UNIVERSITY = `overlay_myname_university_${overlayKey}`;
  const [myNameProleague, setMyNameProleague]   = useState("");
  const [myNameUniversity, setMyNameUniversity] = useState("");
  useEffect(() => {
    if (typeof window === "undefined") return;
    setMyNameProleague(localStorage.getItem(MY_NAME_KEY_PROLEAGUE) ?? displayName ?? "");
    setMyNameUniversity(localStorage.getItem(MY_NAME_KEY_UNIVERSITY) ?? "");
  }, [MY_NAME_KEY_PROLEAGUE, MY_NAME_KEY_UNIVERSITY, displayName]);
  // 대전 및 CK·미니대전은 팀(대학) 단위 → "내 팀 인식"을 대학 드롭다운으로, 일괄입력도 대학 매칭 사용
  const isUniversityFormat = state.matchFormat === "university" || state.matchFormat === "mini";
  const myName = isUniversityFormat ? myNameUniversity : myNameProleague;
  const saveMyName = (v: string) => {
    if (isUniversityFormat) { setMyNameUniversity(v); localStorage.setItem(MY_NAME_KEY_UNIVERSITY, v); }
    else { setMyNameProleague(v); localStorage.setItem(MY_NAME_KEY_PROLEAGUE, v); }
  };
  // (팀명 자동 채움은 제거 — 리셋 후 빈칸이 기본값이어야 하고,
  //  대전 및 CK·미니대전에선 myName이 대학 코드라 "C9팀" 처럼 잘못 채워졌음)

  const scoreboardUrl = typeof window !== "undefined"
    ? `${window.location.origin}/overlay/scoreboard?key=${encodeURIComponent(overlayKey)}`
    : "";

  // ── 초기 로드 ──
  useEffect(() => {
    // 세트가 없으면 기본 1SET / 2SET / 에이스 생성
    const seedSets = (st: OverlayState): OverlayState => {
      if (st.sets.length > 0) return st;
      const s1 = defaultOverlaySet("프로리그 7/4", false);
      const s2 = { ...defaultOverlaySet("위너스리그 9/5", false), winnersMode: true }; // 2세트 기본 위너스
      const sa = defaultOverlaySet("에이스", true);
      return { ...st, sets: [s1, s2, sa], activeSetId: s1.id, mode: "individual", title: st.title || s1.title }; // 프로리그 기본 = 개인전
    };
    fetch(`/api/overlay/state?key=${encodeURIComponent(overlayKey)}`)
      .then(r => r.json())
      .then(p => {
        const d = defaultOverlayState();
        let next: OverlayState = d;
        if (p.ok && p.state) {
          next = {
            ...d,
            ...p.state,
            scoreboardLayout: p.state.scoreboardLayout ?? d.scoreboardLayout,
            entryLayout:      p.state.entryLayout      ?? d.entryLayout,
            favorites:        p.state.favorites        ?? [],
            sets:             p.state.sets             ?? [],
            maps:             p.state.maps             ?? [],
            activeSetId:      p.state.activeSetId      ?? null,
            // 구버전 상태 호환: universityFormat이 없거나 옛 bo5 값이면 bo7로 보정
            universityFormat: p.state.universityFormat === "bo9" ? "bo9" : "bo7",
          };
        }
        next = seedSets(next);
        // 구버전 기본값(흰색)이 그대로 남아있으면 새 기본값(좌 빨강/우 파랑)으로 이전
        if (next.left.startingColor  === "#ffffff") next = { ...next, left:  { ...next.left,  startingColor: "#e0524a" } };
        if (next.right.startingColor === "#ffffff") next = { ...next, right: { ...next.right, startingColor: "#4a7fe0" } };
        // 이미 만들어진 세트 중 제목이 비어있으면 기본 타이틀(프로리그 7/4, 위너스리그 9/5)로 이전
        {
          const nonAce = next.sets.filter(s => !s.isAce);
          next = {
            ...next,
            sets: next.sets.map(s => {
              if (s.isAce || s.title.trim()) return s;
              const idx = nonAce.findIndex(x => x.id === s.id);
              return { ...s, title: idx === 0 ? "프로리그 7/4" : idx === 1 ? "위너스리그 9/5" : s.title };
            }),
          };
        }
        setState(next);
        setAdminTab(next.activeSetId ?? next.sets[0]?.id ?? null);
        setLoaded(true);
      })
      .catch(() => {
        const next = seedSets(defaultOverlayState());
        setState(next);
        setAdminTab(next.sets[0]?.id ?? null);
        setLoaded(true);
      });
  }, [overlayKey]);

  // ── 자동 저장 ──
  useEffect(() => {
    if (!loaded) return;
    setDirty(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => doSave(state), 1500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, loaded]);

  const doSave = useCallback(async (s: OverlayState) => {
    setSaving(true); setDirty(false);
    try {
      await fetch("/api/overlay/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: s }),
      });
    } finally { setSaving(false); }
  }, []);

  // ── 상태 헬퍼 ──
  const upd      = (patch: Partial<OverlayState>)              => setState(s => ({ ...s, ...patch }));
  const updLeft  = (patch: Partial<OverlayState["left"]>)      => setState(s => ({ ...s, left:  { ...s.left,  ...patch } }));
  const updRight = (patch: Partial<OverlayState["right"]>)     => setState(s => ({ ...s, right: { ...s.right, ...patch } }));
  const updLayout = (key: "scoreboardLayout" | "entryLayout", patch: Partial<OverlayPanelLayout>) =>
    setState(s => ({ ...s, [key]: { ...s[key], ...patch } }));

  // ── 맵풀 ── (대진표 맵 칸의 드롭다운 후보로 쓰임)
  // 한 번에 여러 개(공백·쉼표·줄바꿈 구분) 붙여넣기 지원, 중복은 무시
  const addMaps = (raw: string) => {
    const items = raw.split(/[,\t\r\n]+|\s{2,}/).flatMap(s => s.trim().split(/\s+/)).map(s => s.trim()).filter(Boolean);
    if (items.length === 0) return;
    setState(s => {
      const seen = new Set(s.maps.map(m => m.toLowerCase()));
      const next = [...s.maps];
      for (const m of items) if (!seen.has(m.toLowerCase())) { seen.add(m.toLowerCase()); next.push(m); }
      return next.length === s.maps.length ? s : { ...s, maps: next };
    });
  };
  const removeMap = (name: string) => setState(s => ({ ...s, maps: s.maps.filter(m => m !== name) }));

  // ── 세트 ──
  const addSet = (isAce = false) => {
    const nonAceCount = state.sets.filter(s => !s.isAce).length;
    const winnersDefault = state.matchFormat === "proleague" && !isAce && nonAceCount === 1;
    const newSet = { ...defaultOverlaySet(isAce ? "에이스" : "", isAce), winnersMode: winnersDefault };
    setState(s => ({ ...s, sets: [...s.sets, newSet], activeSetId: s.activeSetId ?? newSet.id }));
    setAdminTab(newSet.id);
  };

  // 세트에 선수·맵이 하나도 없는지 (경기 방식 전환 시 "빈 세트만 자동 교체" 판단 기준)
  const isSetEmpty = (set: OverlaySet) => set.entries.every(e => !e.leftPlayer && !e.rightPlayer && !e.map);

  const MATCH_FORMAT_LABEL: Record<OverlayMatchFormat, string> = {
    proleague: "프로리그", university: "대전 및 CK", mini: "미니대전", free: "자유방식",
  };

  const setMatchFormat = (fmt: OverlayMatchFormat) => {
    if (state.matchFormat === fmt) return;
    const apply = () => {
      const newSets = buildDefaultSets(fmt);
      setState(s => ({ ...s, matchFormat: fmt, mode: defaultModeFor(fmt), sets: newSets, activeSetId: newSets[0].id, title: defaultBroadcastTitle(fmt) }));
      setAdminTab(newSets[0].id);
      if (fmt === "mini" && !miniIntroDismissed) setMiniIntroOpen(true);
      showToast(`${MATCH_FORMAT_LABEL[fmt]} 방식으로 전환`);
    };
    // 이미 입력한 내용이 있으면 확인 후 재구성 (방식마다 세트 구조가 달라 기존 대진이 지워짐)
    if (state.sets.some(s => !isSetEmpty(s))) setFormatConfirm(() => apply);
    else apply();
  };

  // 대전 및 CK 판수 전환 (7판4선 ↔ 9판5선) — 단판 세트를 새로 구성
  const setUniversityFormat = (fmt: OverlayUniversityFormat) => {
    if (state.universityFormat === fmt) return;
    const apply = () => {
      const newSets = buildDefaultSets("university");
      setState(s => ({ ...s, universityFormat: fmt, sets: newSets, activeSetId: newSets[0].id }));
      setAdminTab(newSets[0].id);
      showToast(fmt === "bo9" ? "9판5선으로 전환" : "7판4선으로 전환");
    };
    if (state.sets.some(s => !isSetEmpty(s))) setFormatConfirm(() => apply);
    else apply();
  };

  const removeSet = (id: string) => {
    const remaining = state.sets.filter(s => s.id !== id);
    setState(s => ({
      ...s,
      sets: remaining,
      activeSetId: s.activeSetId === id ? (remaining[0]?.id ?? null) : s.activeSetId,
    }));
    setAdminTab(remaining[0]?.id ?? null);
  };

  const patchSet = (id: string, patch: Partial<OverlaySet>) =>
    setState(s => ({ ...s, sets: s.sets.map(set => set.id === id ? { ...set, ...patch } : set) }));

  // ── 엔트리 ──
  const addEntry = (setId: string, entry: { leftPlayer: string; rightPlayer: string; map: string }) => {
    const newEntry: OverlayEntryRow = { ...entry, id: genId(), result: null };
    setState(s => ({
      ...s,
      sets: s.sets.map(set => set.id === setId ? { ...set, entries: [...set.entries, newEntry] } : set),
    }));
  };

  // 일괄 입력: 경기 목록 교체
  // 일괄 입력 결과로 교체. 입력에 종족이 명시돼 있으면 수동 지정으로 함께 반영 (없으면 DB 자동 인식에 맡김)
  const replaceEntries = (setId: string, rows: ParsedRow[]) => {
    setState(s => ({
      ...s,
      sets: s.sets.map(set => set.id === setId
        ? { ...set, currentMatch: null, entries: rows.map(r => ({
            id: genId(),
            leftPlayer: r.leftPlayer, rightPlayer: r.rightPlayer, map: r.map,
            result: null as OverlayResult,
            ...(r.leftRace  ? { leftRace:  r.leftRace }  : {}),
            ...(r.rightRace ? { rightRace: r.rightRace } : {}),
          })) }
        : set),
    }));
  };

  // 경기 행 인라인 수정
  const patchEntry = (setId: string, entryId: string, patch: Partial<OverlayEntryRow>) =>
    setState(s => ({
      ...s,
      sets: s.sets.map(set => set.id === setId
        ? { ...set, entries: set.entries.map(e => e.id === entryId ? { ...e, ...patch } : e) }
        : set),
    }));

  const removeEntry = (setId: string, entryId: string) => {
    setState(s => ({
      ...s,
      sets: s.sets.map(set => {
        if (set.id !== setId) return set;
        const idx  = set.entries.findIndex(e => e.id === entryId);
        const next = set.entries.filter(e => e.id !== entryId);
        let cur    = set.currentMatch;
        if (cur !== null) {
          if (next.length === 0) cur = null;
          else if (cur > idx)   cur = cur - 1;
          else                  cur = Math.min(cur, next.length - 1);
        }
        return { ...set, entries: next, currentMatch: cur };
      }),
    }));
  };

  const setResult = (setId: string, entryId: string, result: "left" | "right") => {
    let msg = "";
    setState(s => {
      const set = s.sets.find(set => set.id === setId);
      if (!set) return s;
      const rowIdx = set.entries.findIndex(e => e.id === entryId);
      if (rowIdx === -1) return s;
      const cur = set.entries[rowIdx];
      const newResult = cur.result === result ? null : result;
      let newEntries = set.entries.map(e => e.id === entryId ? { ...e, result: newResult } : e);

      // 위너스 방식: 승자 지정 시 다음 경기의 '이긴 쪽' 칸에 승자 이름 자동 기입(잔류). 상대 칸은 비워둠.
      // 고정 방식: 잔류 없이 정해진 대진 그대로 진행.
      if (newResult !== null && set.winnersMode && rowIdx + 1 < newEntries.length) {
        const winnerName = newResult === "left" ? cur.leftPlayer : cur.rightPlayer;
        const field: "leftPlayer" | "rightPlayer" = newResult === "left" ? "leftPlayer" : "rightPlayer";
        if (winnerName && !newEntries[rowIdx + 1][field]) {
          newEntries = newEntries.map((e, i) => i === rowIdx + 1 ? { ...e, [field]: winnerName } : e);
        }
      }

      const sL = newEntries.filter(e => e.result === "left").length;
      const sR = newEntries.filter(e => e.result === "right").length;
      msg = newResult ? `${newResult === "left" ? "좌팀" : "우팀"} 승 — ${sL}:${sR}` : `취소 — ${sL}:${sR}`;

      // 승자 지정 시 → 다음 경기로 자동 진행 + 스코어보드 송출 (빈 선수면 직전 이름 유지)
      // 새 경기이므로 스타팅 위치는 선택 해제, 색상은 좌/우 기본값으로 되돌림
      let nextCurrent = newResult !== null ? rowIdx : set.currentMatch;
      let nextLeft = s.left, nextRight = s.right;
      if (newResult !== null && rowIdx + 1 < newEntries.length) {
        const nx = newEntries[rowIdx + 1];
        const lRace = nx.leftRace  ?? raceOf(nx.leftPlayer);
        const rRace = nx.rightRace ?? raceOf(nx.rightPlayer);
        nextCurrent = rowIdx + 1;
        nextLeft  = { ...s.left,  playerName: nx.leftPlayer  || s.left.playerName,  ...(lRace ? { race: lRace } : {}),
                      startingPoint: "", startingColor: defaultOverlaySide("left").startingColor };
        nextRight = { ...s.right, playerName: nx.rightPlayer || s.right.playerName, ...(rRace ? { race: rRace } : {}),
                      startingPoint: "", startingColor: defaultOverlaySide("right").startingColor };
      }
      return {
        ...s,
        ...(newResult !== null ? { activeSetId: setId, title: set.title || s.title, left: nextLeft, right: nextRight } : {}),
        sets: s.sets.map(set => set.id === setId
          ? { ...set, entries: newEntries, currentMatch: nextCurrent }
          : set),
      };
    });
    if (msg) showToast(msg);
  };

  // 스마트 붙여넣기: 한 칸에 여러 토큰 붙여넣으면 그 열을 아래로 채움 (필요 시 행 추가)
  const fillDown = (setId: string, startIdx: number, field: "leftPlayer" | "rightPlayer" | "map", values: string[]) => {
    setState(s => ({
      ...s,
      sets: s.sets.map(set => {
        if (set.id !== setId) return set;
        const arr = set.entries.map(e => ({ ...e }));
        values.forEach((v, k) => {
          const i = startIdx + k;
          if (i >= arr.length) arr.push({ id: genId(), leftPlayer: "", rightPlayer: "", map: "", result: null });
          arr[i] = { ...arr[i], [field]: v };
        });
        return { ...set, entries: arr };
      }),
    }));
  };

  const reorderEntries = (setId: string, from: number, to: number) => {
    setState(s => ({
      ...s,
      sets: s.sets.map(set => {
        if (set.id !== setId || from === to) return set;
        const arr = [...set.entries];
        const curId = set.currentMatch != null ? arr[set.currentMatch]?.id : null;
        const [moved] = arr.splice(from, 1);
        arr.splice(to, 0, moved);
        const cur = curId ? arr.findIndex(e => e.id === curId) : -1;
        return { ...set, entries: arr, currentMatch: cur >= 0 ? cur : null };
      }),
    }));
  };

  // 세트에서 "지금 시작할 경기" = 양쪽 선수가 다 있는 첫 미결 경기.
  // 없으면(선수 미입력) 첫 미결 경기, 그마저 없으면(전부 종료) 마지막 경기를 유지해 방송이 비지 않게 함.
  const firstPendingIdx = (set: OverlaySet): number | null => {
    if (set.entries.length === 0) return null;
    const ready = set.entries.findIndex(e => e.result === null && e.leftPlayer && e.rightPlayer);
    if (ready >= 0) return ready;
    const pending = set.entries.findIndex(e => e.result === null);
    if (pending >= 0) return pending;
    return set.entries.length - 1;
  };

  const loadMatch = (setId: string, idx: number) => {
    setState(s => {
      const set = s.sets.find(set => set.id === setId);
      if (!set) return s;
      const row   = set.entries[idx];
      const lRace = row.leftRace  ?? raceOf(row.leftPlayer);
      const rRace = row.rightRace ?? raceOf(row.rightPlayer);
      // 다른 경기를 불러올 때만 스타팅 위치·색상 초기화 (같은 경기 재송출은 설정 유지)
      const isNewMatch = set.currentMatch !== idx || s.activeSetId !== setId;
      const resetL = isNewMatch ? { startingPoint: "", startingColor: defaultOverlaySide("left").startingColor }  : {};
      const resetR = isNewMatch ? { startingPoint: "", startingColor: defaultOverlaySide("right").startingColor } : {};
      return {
        ...s,
        activeSetId: setId,
        title: set.title || s.title,
        sets: s.sets.map(set => set.id === setId ? { ...set, currentMatch: idx } : set),
        left:  { ...s.left,  playerName: row.leftPlayer  || s.left.playerName,  ...(lRace ? { race: lRace } : {}), ...resetL },
        right: { ...s.right, playerName: row.rightPlayer || s.right.playerName, ...(rRace ? { race: rRace } : {}), ...resetR },
      };
    });
    showToast(`${idx + 1}경기 로드`);
  };

  // 세트 송출: 이미 진행 중인 경기가 있으면 그대로 두고, 아니면 "첫 미결 경기"를 자동 로드
  const broadcastSet = (set: OverlaySet) => {
    const alreadyRunning = set.id === state.activeSetId && set.currentMatch !== null;
    const idx = alreadyRunning ? null : firstPendingIdx(set);
    if (idx !== null) { loadMatch(set.id, idx); return; }
    setState(s => ({ ...s, activeSetId: set.id, title: set.title || s.title }));
  };


  // 리셋 버튼 — 새 경기 시작용.
  // 대진표(선수·맵·결과)를 빈 칸으로 되돌리고, 스코어보드(팀명·선수명·종족·스타팅)도 기본값으로.
  // 맵목록(state.maps)은 매 경기 재사용하므로 유지한다.
  const clearSetEntries = (setId: string, slots: number) => {
    setState(s => ({
      ...s,
      left:  defaultOverlaySide("left"),
      right: defaultOverlaySide("right"),
      sets: s.sets.map(set => set.id === setId
        ? { ...set, currentMatch: null, entries: Array.from({ length: slots }, () => ({ id: genId(), leftPlayer: "", rightPlayer: "", map: "", result: null })) }
        : set),
    }));
    showToast("대진표·스코어보드 초기화 (맵목록은 유지)");
  };


  // ── 파생값 ──
  const activeSet  = state.sets.find(s => s.id === state.activeSetId) ?? null;
  // 현재 송출 중인 경기 행 — 스코어보드 선수명/종족이 여기서 자동으로 들어옴(자동 배지 판단용)
  const activeEntry = activeSet && activeSet.currentMatch != null ? activeSet.entries[activeSet.currentMatch] ?? null : null;
  const scoreLeft  = activeSet?.entries.filter(e => e.result === "left").length  ?? 0;
  const scoreRight = activeSet?.entries.filter(e => e.result === "right").length ?? 0;
  const editingSet = state.sets.find(s => s.id === adminTab) ?? null;
  const activeSetLabel = (() => {
    const idx = state.sets.findIndex(s => s.id === state.activeSetId);
    if (activeSet?.isAce) return state.matchFormat === "mini" ? "슈에" : "에이스";
    return idx >= 0 ? `${idx + 1}SET` : "-";
  })();
  const defaultSlotsOf = (set: OverlaySet) => {
    if (set.isAce) return 1;                                              // 에이스·슈에 = 단판
    const mf = state.matchFormat;
    if (mf === "university") return state.universityFormat === "bo9" ? 9 : 7;
    if (mf === "mini") return 5;                                         // 1·2세트 = 5판3선
    if (mf === "free") return 1;                                         // 자유방식 = 1경기로 시작
    return state.sets.filter(s => !s.isAce).findIndex(s => s.id === set.id) === 1 ? 9 : 7; // 프로리그: 2세트=9, 그 외=7
  };
  // 대전 및 CK는 단판(세트 1개) → 세트 탭 숨김. 대전 및 CK·미니대전은 구조 고정 → +SET/세트삭제 숨김.
  const hideSetTabs   = state.matchFormat === "university";
  const fixedStructure = state.matchFormat === "university" || state.matchFormat === "mini";
  // 미니대전: 슈에 필요 여부(1:1이면 필요, 2:0이면 불필요) + 세트 승자 표시
  const isMini = state.matchFormat === "mini";
  const aceNeeded = miniAceNeeded(state.sets);

  if (!loaded) return (
    <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
      불러오는 중...
    </div>
  );

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-5 pb-20 select-none">

      {/* ── 헤더 ── */}
      <div className="mb-4 rounded-2xl border border-white/10 border-l-[3px] border-l-emerald-500/70">
        <div className="px-5 py-2.5 bg-white/[0.07] border-b border-white/8 rounded-t-2xl flex items-center gap-1.5">
          <div className="w-[3px] h-[13px] rounded-full bg-emerald-400/70" />
          <p className="text-xs font-bold text-emerald-300/85 tracking-tight">타이틀</p>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[11px] font-bold text-white/35">경기 방식</span>
            <div className="flex items-center gap-1 rounded-lg bg-white/5 border border-white/10 p-0.5">
              {([{ v: "proleague", label: "프로리그" }, { v: "university", label: "대전 및 CK" }, { v: "mini", label: "미니대전" }, { v: "free", label: "자유방식" }] as const).map(o => (
                <button key={o.v} onClick={() => setMatchFormat(o.v)}
                  className={`rounded-md px-2.5 h-6 text-[11px] font-bold transition-all ${state.matchFormat === o.v ? "bg-purple-600 text-white" : "text-white/40 hover:text-white/70"}`}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="px-5 py-3.5 bg-white/[0.03] flex items-center gap-3 rounded-b-2xl">
          <div className="relative flex-1 min-w-0 max-w-[44%]">
            <input
              className="w-full bg-white/5 border border-white/12 rounded-xl pl-4 pr-9 py-2.5 text-xl font-black outline-none placeholder:text-white/15 leading-tight focus:border-emerald-500/50 focus:bg-emerald-500/5 transition-colors"
              value={state.title}
              onChange={e => upd({ title: e.target.value })}
              placeholder="타이틀을 입력하세요..."
            />
            {state.title && (
              <button onClick={() => upd({ title: "" })} title="타이틀 지우기"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-md text-white/25 hover:text-red-400 hover:bg-red-500/10 transition-all">
                <X size={15} />
              </button>
            )}
          </div>
          {/* 내 팀 인식 (프로리그=선수 이름 직접 입력 / 대학대전=대학 드롭다운) */}
          <div className="flex-1 min-w-0 flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] px-3 py-2">
            <span className="shrink-0 text-[11px] font-bold text-emerald-300/80 leading-tight">
              내 팀<br/>인식{isUniversityFormat ? " 대학" : " 이름"}
            </span>
            {isUniversityFormat ? (
              <select
                className="flex-1 min-w-0 bg-white/5 border border-white/12 rounded-lg px-3 py-2 text-sm font-bold outline-none focus:border-emerald-500/50 transition-colors cursor-pointer"
                style={{ colorScheme: "dark" }}
                value={myName}
                onChange={e => saveMyName(e.target.value)}>
                <option value="" style={{ background: "#16161a", color: "rgba(255,255,255,0.5)" }}>대학 선택 (일괄 입력 시 우리팀 자동 배치)</option>
                {universities.map(u => <option key={u} value={u} style={{ background: "#16161a", color: "#fff" }}>{getUniversityLabel(u)}</option>)}
              </select>
            ) : (
              <input
                className="flex-1 min-w-0 bg-white/5 border border-white/12 rounded-lg px-3 py-2 text-sm font-bold outline-none placeholder:text-white/15 focus:border-emerald-500/50 transition-colors"
                value={myName}
                onChange={e => saveMyName(e.target.value)}
                placeholder="예: 이재호 (일괄 입력 시 P1 자동 배치)"
              />
            )}
          </div>
          <div className="shrink-0 flex items-end gap-2">
            <UrlCopyBtn url={scoreboardUrl} />
            <button onClick={() => setObsModalOpen(true)}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white/6 border border-white/10 text-white/40 hover:text-white/80 hover:bg-white/10 transition-all">
              <Settings size={13} />
              <span className="text-xs font-semibold">OBS</span>
            </button>
            <span className={`w-[76px] shrink-0 text-xs py-1.5 rounded-lg border font-medium text-center ${saving ? "border-blue-500/50 bg-blue-500/10 text-blue-300" : dirty ? "border-yellow-500/30 bg-yellow-500/5 text-yellow-400/70" : "border-green-500/30 bg-green-500/5 text-green-400/70"}`}>
              {saving ? "저장 중..." : dirty ? "미저장" : "저장됨"}
            </span>
          </div>
        </div>
      </div>


      {/* ── 2컬럼 그리드 ── */}
      <div className="grid lg:grid-cols-[430px_1fr] gap-4">

        {/* ── 좌측: 스코어보드 설정 ── */}
        <div className="space-y-3">

          {/* 스코어 표시 */}
          <div className="rounded-2xl border border-white/10 border-l-[3px] border-l-red-500/60 bg-white/[0.04] overflow-hidden">
            {/* 헤더 */}
            <div className="px-4 py-3 border-b border-white/10 bg-white/[0.05] flex items-center gap-3">
              <span className="text-base font-bold text-white/85 shrink-0">스코어보드</span>

              {/* 팀명표시/선수만 — 여백을 활용해 별도 줄 없이 헤더에 배치 */}
              <div className="relative flex items-center gap-1">
                {(["team", "individual"] as const).map(m => (
                  <button key={m}
                    onClick={() => { if (m !== state.mode) setModeConfirm(m); }}
                    className={`rounded-md px-2.5 h-6 text-[11px] font-bold transition-all ${state.mode === m ? "bg-blue-600 text-white" : "bg-white/8 text-white/40 hover:bg-white/15 hover:text-white"}`}>
                    {m === "team" ? "팀명표시" : "선수만"}
                  </button>
                ))}

                {/* 스코어보드 표시 전환 확인 팝오버 */}
                {modeConfirm && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setModeConfirm(null)} />
                    <div className="absolute left-0 top-full mt-2 z-40 w-[380px] rounded-xl border border-blue-500/30 bg-[#0d1420] shadow-2xl px-5 py-4 text-left">
                      <div className="flex items-start gap-3">
                        <span className="w-2 h-2 rounded-full bg-blue-400 mt-2 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-base font-black text-blue-100">{modeConfirm === "team" ? "팀명표시" : "선수만"}으로 바꿀까요?</p>
                          <p className="text-sm text-blue-100/70 mt-1.5 leading-relaxed">
                            {modeConfirm === "team"
                              ? "대학대전처럼 팀명을 보여주고 싶다면 이 모드예요"
                              : "프로리그처럼 선수 대결 위주라면 이 모드예요"}
                          </p>
                          <div className="mt-3">
                            <ScoreboardModePreview mode={modeConfirm} />
                          </div>
                          <div className="flex items-center gap-2 mt-3.5">
                            <button onClick={() => {
                              upd({ mode: modeConfirm });
                              showToast(modeConfirm === "team" ? "팀명표시로 전환" : "선수만으로 전환");
                              setModeConfirm(null);
                            }} className="h-9 px-4 rounded-lg bg-blue-600 text-sm font-bold text-white hover:bg-blue-500 transition-all">바꿀게요</button>
                            <button onClick={() => setModeConfirm(null)}
                              className="h-9 px-4 rounded-lg text-sm font-bold text-white/40 hover:text-white/70 transition-all">취소</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <span className="ml-auto text-xs font-semibold text-white/35 shrink-0">활성 세트 · {activeSetLabel}</span>
            </div>

            {/* 팀명 입력 + 점수 (한 줄로 병합 — 좌팀칸 0:0 우팀칸) */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-3 border-b border-white/8 bg-black/20">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-1.5 h-7 rounded-full shrink-0" style={{ background: "#c4554d" }} />
                <input className="input-base flex-1 min-w-0 text-sm font-semibold" value={state.left.teamName}
                  onChange={e => updLeft({ teamName: e.target.value })} placeholder="예: A" style={{ textAlign: "left" }} />
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-4xl font-black tabular-nums leading-none" style={{ color: "#d97b73" }}>{scoreLeft}</span>
                <span className="text-2xl font-bold text-white/25 leading-none">:</span>
                <span className="text-4xl font-black tabular-nums leading-none" style={{ color: "#7396cc" }}>{scoreRight}</span>
              </div>
              <div className="flex items-center gap-2 flex-row-reverse min-w-0">
                <span className="w-1.5 h-7 rounded-full shrink-0" style={{ background: "#5577b0" }} />
                <input className="input-base flex-1 min-w-0 text-sm font-semibold" value={state.right.teamName}
                  onChange={e => updRight({ teamName: e.target.value })} placeholder="예: B" style={{ textAlign: "right" }} />
              </div>
            </div>

            {/* 좌/우 선수 대칭 입력 */}
            <div className="grid grid-cols-2">
              {(["left", "right"] as const).map(side => {
                const player = side === "left" ? state.left : state.right;
                const update = side === "left" ? updLeft : updRight;
                const isLeft = side === "left";
                const focused = focusedField?.kind === "scoreboard" && focusedField.side === side;
                const align: "left" | "right" = isLeft ? "left" : "right";
                const lblCls = `block text-[11px] font-bold mb-1 ${isLeft ? "text-left" : "text-right"}`;
                // 자동 배지 판단: 선수명은 현재 송출 경기 행에서, 종족은 선수 DB에서 자동으로 채워짐
                const entryName = isLeft ? activeEntry?.leftPlayer : activeEntry?.rightPlayer;
                const nameAuto  = !!entryName && entryName === player.playerName;
                const detectedRace = raceOf(player.playerName);
                const raceAuto  = !!player.playerName && detectedRace === player.race;
                return (
                  <div key={side}
                    className={`p-3.5 space-y-3 ${isLeft ? "border-r border-white/8" : ""} ${focused ? "bg-white/[0.02]" : ""}`}>
                    {/* 선수명 */}
                    <div>
                      <label className={lblCls} style={{ color: "rgba(255,255,255,0.4)" }}>
                        선수명{nameAuto && <> <AutoBadge title="대진표의 현재 경기에서 자동으로 들어온 선수예요" /></>}
                      </label>
                      <input
                        className={`input-base w-full text-base font-bold transition-all ${focused ? "border-blue-500/60 bg-blue-500/8 ring-1 ring-blue-500/20" : ""}`}
                        value={player.playerName}
                        onChange={e => update({ playerName: e.target.value })}
                        onFocus={() => setFocusedField({ kind: "scoreboard", side })}
                        placeholder={isLeft ? "예: 홍길동" : "예: 철수"}
                        style={{ textAlign: align }}
                      />
                    </div>
                    {/* 종족 */}
                    <div>
                      <label className={lblCls} style={{ color: "rgba(255,255,255,0.4)" }}>
                        종족{raceAuto && <> <AutoBadge title="선수 DB에서 종족을 자동 인식했어요" /></>}
                      </label>
                      <div className={`flex gap-1 ${isLeft ? "" : "flex-row-reverse"}`}>
                        {RACES.map(r => (
                          <button key={r} onClick={() => update({ race: r })}
                            className="flex-1 h-8 rounded-lg text-sm font-black transition-all"
                            style={{
                              background: player.race === r ? RACE_BG[r] : "rgba(255,255,255,0.05)",
                              border: `1px solid ${player.race === r ? RACE_COLORS[r] : "rgba(255,255,255,0.1)"}`,
                              color: player.race === r ? RACE_COLORS[r] : "rgba(255,255,255,0.3)",
                            }}>{r}</button>
                        ))}
                      </div>
                    </div>
                    {/* 스타팅 — 미니맵 방식: 정사각형 맵에서 시계 방향 위치를 한 번에 선택, 중앙 원=선수 색상 */}
                    <div>
                      <label className={lblCls} style={{ color: "rgba(255,255,255,0.4)" }}>스타팅 위치 / 색상</label>
                      <div className="relative w-full max-w-[180px] mx-auto aspect-square rounded-xl border border-white/10 bg-white/[0.02]"
                        style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)", backgroundSize: "14px 14px" }}>
                        {/* 중앙 색상 = 이 선수 */}
                        <input type="color" value={player.startingColor}
                          onChange={e => update({ startingColor: e.target.value })}
                          title="스타팅 색상"
                          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full border-2 border-white/25 bg-transparent cursor-pointer p-0" />
                        {STARTING_POS.map(({ h, x, y }) => {
                          const val = String(h); // 방송 화면엔 숫자만 표시 — "시"는 관리자 UI 표기용
                          const sel = player.startingPoint === val || player.startingPoint === `${h}시`; // 이전 저장값("N시")과도 호환
                          return (
                            <button key={h}
                              title={`${h}시 방향${sel ? " (다시 누르면 해제)" : ""}`}
                              onClick={() => update({ startingPoint: sel ? "" : val })}
                              style={{ left: `${x}%`, top: `${y}%` }}
                              className={`absolute -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full text-xs font-black tabular-nums border transition-all ${
                                sel
                                  ? "bg-emerald-500/35 border-emerald-300/70 text-emerald-50 shadow-[0_0_0_2px_rgba(16,185,129,0.25)]"
                                  : "bg-[#17171c] border-white/15 text-white/45 hover:bg-white/12 hover:text-white/85"
                              }`}>
                              {h}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── 맵풀 ── 대진표 맵 칸의 드롭다운 후보 */}
          <div className="rounded-2xl border border-white/10 border-l-[3px] border-l-sky-500/60 bg-white/[0.04] overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 bg-white/[0.05] flex items-center gap-2">
              <span className="text-base font-bold text-white/85">맵목록</span>
              <span className="text-xs font-semibold text-white/35">{state.maps.length}개</span>
              {state.maps.length > 0 && (
                <button onClick={() => upd({ maps: [] })}
                  className="ml-auto text-[11px] font-semibold text-white/30 hover:text-red-400 transition-colors">
                  전체 지우기
                </button>
              )}
            </div>
            <div className="p-3.5 space-y-2.5">
              <input
                className="input-base w-full text-sm"
                placeholder="맵 이름 입력 후 Enter (여러 개 붙여넣기 가능)"
                onKeyDown={e => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  addMaps(e.currentTarget.value);
                  e.currentTarget.value = "";
                }}
                onPaste={e => {
                  const text = e.clipboardData.getData("text");
                  if (!/[\s,]/.test(text.trim())) return; // 단일 토큰이면 평범하게 붙여넣기
                  e.preventDefault();
                  addMaps(text);
                }}
              />
              {state.maps.length === 0 ? (
                <p className="text-[11px] text-white/25 italic">맵을 추가하면 대진표의 맵 칸에서 골라 쓸 수 있어요</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {state.maps.map(m => (
                    <span key={m} className="group flex items-center gap-1 rounded-lg bg-sky-500/10 border border-sky-400/25 pl-2.5 pr-1.5 py-1">
                      <span className="text-xs font-bold text-sky-100/85">{m}</span>
                      <button onClick={() => removeMap(m)} title="삭제"
                        className="w-4 h-4 flex items-center justify-center rounded text-white/25 hover:text-red-400 hover:bg-red-500/10 transition-all">
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 엔트리 표시 토글 */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-white/55">오버레이 대진표 표시</span>
            <button
              onClick={() => updLayout("entryLayout", { visible: !state.entryLayout.visible })}
              className={`flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-semibold border transition-all ${
                state.entryLayout.visible
                  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                  : "bg-white/5 border-white/10 text-white/30"
              }`}>
              {state.entryLayout.visible ? <Eye size={12} /> : <EyeOff size={12} />}
              {state.entryLayout.visible ? "표시 중" : "숨김"}
            </button>
          </div>

        </div>

        {/* ── 우측: 대진표 ── */}
        <div className="space-y-3">

          {/* 대진표 관리 */}
          <div className="rounded-2xl border border-white/10 border-l-[3px] border-l-purple-500/60 bg-white/[0.04]">
            <div className="px-4 py-2.5 border-b border-white/10 bg-white/[0.05] flex items-center gap-2.5">
              <Layers size={12} className="text-purple-400/60 shrink-0" />
              <span className="text-sm font-bold text-white/65 shrink-0">대진표 관리</span>

              {/* 진행 방식 — 대전 및 CK에서만 7판4선/9판5선 선택 (크게) */}
              {state.matchFormat === "university" && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-white/40 shrink-0">진행 방식</span>
                  <div className="flex rounded-lg bg-white/[0.04] border border-white/10 p-0.5">
                    {([{ v: "bo7", label: "7판4선" }, { v: "bo9", label: "9판5선" }] as const).map(o => (
                      <button key={o.v} onClick={() => setUniversityFormat(o.v)}
                        className={`px-4 h-8 rounded-md text-sm font-bold transition-all ${state.universityFormat === o.v ? "bg-purple-600 text-white" : "text-white/45 hover:text-white/80"}`}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 리셋 — 매일 누르는 CTA, 헤더 가운데 */}
              {editingSet && (
                <div className="relative mx-auto">
                  <button onClick={() => setClearConfirm(true)}
                    title="선수·맵·결과를 모두 지우고 빈 대진표로 되돌립니다"
                    className="flex items-center gap-1.5 h-9 px-5 rounded-xl text-sm font-black bg-amber-500/90 text-black shadow-lg shadow-amber-500/20 hover:bg-amber-400 active:scale-[0.97] transition-all">
                    <RotateCcw size={16} strokeWidth={2.8} /> 리셋
                  </button>

                  {clearConfirm && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setClearConfirm(false)} />
                      <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-40 w-[300px] rounded-xl border border-amber-500/30 bg-[#1a1508] shadow-2xl px-4 py-3 text-left">
                        <div className="flex items-start gap-2.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                          <div>
                            <p className="text-sm font-bold text-amber-100">새 경기로 리셋할까요?</p>
                            <p className="text-xs text-amber-200/60 mt-1 leading-relaxed">
                              대진표({defaultSlotsOf(editingSet)}칸)와 스코어보드(팀명·선수명·종족·스타팅)가 모두 비워집니다.
                              <b className="text-amber-100"> 맵목록은 그대로 유지</b>돼요.
                            </p>
                            <div className="flex items-center gap-2 mt-2.5">
                              <button onClick={() => { clearSetEntries(editingSet.id, defaultSlotsOf(editingSet)); setClearConfirm(false); }}
                                className="h-8 px-3.5 rounded-lg bg-amber-500 text-xs font-bold text-black hover:bg-amber-400 transition-all">리셋할게요</button>
                              <button onClick={() => setClearConfirm(false)}
                                className="h-8 px-3.5 rounded-lg text-xs font-bold text-white/40 hover:text-white/70 transition-all">취소</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              <button onClick={() => setHelpOpen(true)}
                className={`${editingSet ? "" : "ml-auto "}flex items-center gap-1.5 h-7 px-3 rounded-lg bg-blue-500/10 border border-blue-400/25 text-blue-200 hover:bg-blue-500/20 transition-all`}>
                <HelpCircle size={13} /><span className="text-[11px] font-bold">사용법</span>
              </button>
            </div>

            {/* 세트 탭 — 대전 및 CK(단판)는 세트가 하나라 통째로 숨김 */}
            {!hideSetTabs && (
            <div className="flex items-center gap-1 px-3 pt-3 pb-2 border-b border-white/8 flex-wrap">
              {state.sets.map((set, idx) => {
                const winner = isMini ? setWinnerOf(set) : null;         // 이 세트를 이긴 쪽
                const aceUnneeded = isMini && set.isAce && aceNeeded === false; // 슈에 불필요(2:0)
                const aceGo       = isMini && set.isAce && aceNeeded === true;  // 슈에 진행(1:1)
                return (
                <button key={set.id}
                  onClick={() => { setAdminTab(set.id); setRemoveSetConfirm(false); }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center ${
                    aceUnneeded ? "opacity-35 " : ""
                  }${
                    adminTab === set.id
                      ? set.isAce ? "bg-yellow-500/20 border border-yellow-400/40 text-yellow-300" : "bg-purple-500/20 border border-purple-400/40 text-purple-300"
                      : aceGo ? "bg-amber-500/15 border border-amber-400/50 text-amber-200"
                      : "bg-white/5 border border-white/10 text-white/40 hover:bg-white/10"
                  }`}>
                  {set.isAce
                    ? (state.matchFormat === "mini" ? "슈에" : "에이스")
                    : `${idx + 1}SET`}
                  {/* 승리 세트 표시 (미니대전) */}
                  {winner && <span className="ml-1 text-[10px] font-black" style={{ color: winner === "left" ? "#d08a84" : "#8aa6d0" }}>✓</span>}
                  {aceUnneeded && <span className="ml-1 text-[9px] font-semibold text-white/50">불필요</span>}
                  {aceGo && <span className="ml-1 text-[9px] font-bold text-amber-300">진행</span>}
                  {state.activeSetId === set.id && <span className="ml-1 text-[8px] text-emerald-400">●</span>}
                </button>
                );
              })}
              {/* +SET·세트삭제는 구조가 자유로운 방식(프로리그·자유방식)에서만. 대전 및 CK·미니대전은 구조 고정 */}
              {!fixedStructure && (
              <button onClick={() => addSet(false)}
                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white/5 border border-white/10 text-white/35 hover:bg-purple-500/15 hover:text-purple-300 hover:border-purple-400/30 transition-all">
                + SET
              </button>
              )}

              {/* 세트 삭제 — + SET 옆(세트 구조 변경 그룹)에 배치, 실수 방지용 확인 팝오버 포함 */}
              {!fixedStructure && editingSet && (
                <div className="relative ml-1">
                  <button onClick={() => setRemoveSetConfirm(true)}
                    className="h-7 px-2 rounded-lg text-[11px] text-red-400/45 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all">
                    세트 삭제
                  </button>

                  {removeSetConfirm && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setRemoveSetConfirm(false)} />
                      <div className="absolute left-0 top-full mt-2 z-40 w-[280px] rounded-xl border border-red-500/30 bg-[#1a1010] shadow-2xl px-4 py-3 text-left">
                        <div className="flex items-start gap-2.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" />
                          <div>
                            <p className="text-sm font-bold text-red-100">
                              {editingSet.isAce ? "에이스" : editingSet.title || "이 세트"}를 삭제할까요?
                            </p>
                            <p className="text-xs text-red-200/60 mt-1 leading-relaxed">이 세트의 선수·맵·결과가 모두 삭제되고 되돌릴 수 없습니다.</p>
                            <div className="flex items-center gap-2 mt-2.5">
                              <button onClick={() => { removeSet(editingSet.id); setRemoveSetConfirm(false); }}
                                className="h-8 px-3.5 rounded-lg bg-red-600 text-xs font-bold text-white hover:bg-red-500 transition-all">삭제할게요</button>
                              <button onClick={() => setRemoveSetConfirm(false)}
                                className="h-8 px-3.5 rounded-lg text-xs font-bold text-white/40 hover:text-white/70 transition-all">취소</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* 송출 — 방송 제어 액션, 구조 변경 버튼들과 분리해 오른쪽 끝에 배치 */}
              {editingSet && (
                <button onClick={() => broadcastSet(editingSet)}
                  title="이 세트를 송출하고 첫 경기를 자동으로 띄웁니다"
                  className="ml-auto h-8 px-4 rounded-lg text-xs font-black bg-emerald-600 text-white shadow-lg shadow-emerald-600/25 hover:bg-emerald-500 active:scale-[0.97] transition-all">
                  세트 송출
                </button>
              )}
            </div>
            )}

            {/* 5판3선(미니대전) 안내 배너 — 첫 선택 시, "다시 보지 않기"로 닫힘 */}
            {miniIntroOpen && !miniIntroDismissed && (
              <div className="mx-3 mt-3 flex items-start gap-2.5 rounded-xl bg-purple-500/[0.1] border border-purple-400/30 px-3.5 py-2.5">
                <Layers size={18} className="text-purple-300 mt-0.5 shrink-0" />
                <p className="flex-1 text-sm text-purple-100/85 leading-relaxed">
                  <b className="text-purple-200">미니대전</b> — 1세트 · 2세트 <span className="text-white/50">(각 5판3선)</span> + <b className="text-white">슈에</b>
                </p>
                <button onClick={dismissMiniIntro} className="shrink-0 text-xs font-semibold text-white/40 hover:text-white/75 flex items-center gap-0.5">
                  다시 보지 않기 <X size={12} />
                </button>
              </div>
            )}

            {/* 스마트 붙여넣기 안내 (닫기 가능) */}
            {!helpDismissed && editingSet && (
              <div className="mx-3 mt-3 flex items-center gap-2.5 rounded-xl bg-blue-500/[0.08] border border-blue-500/25 px-3.5 py-2.5">
                <ClipboardPaste size={18} className="text-blue-300 shrink-0" />
                <p className="flex-1 text-sm text-blue-100/80 leading-relaxed">
                  <b className="text-blue-200">스마트 붙여넣기</b> — 한 칸에 <b className="text-white">여러 개</b> 붙여넣으면 아래로 자동 채움
                  <button onClick={() => setHelpOpen(true)} className="ml-1 underline text-blue-300 hover:text-blue-200">사용법</button>
                </p>
                <button onClick={dismissHelp} className="shrink-0 text-xs font-semibold text-white/40 hover:text-white/75 flex items-center gap-0.5">
                  다시 보지 않기 <X size={12} />
                </button>
              </div>
            )}

            {/* 세트 에디터 */}
            {editingSet ? (
              <SetEditor
                key={editingSet.id}
                set={editingSet}
                leftTeam={state.left.teamName}
                rightTeam={state.right.teamName}
                leftPool={Array.from(new Set(state.sets.flatMap(s => s.entries.map(e => e.leftPlayer)).filter(Boolean)))}
                rightPool={Array.from(new Set(state.sets.flatMap(s => s.entries.map(e => e.rightPlayer)).filter(Boolean)))}
                mapPool={state.maps}
                myName={myName}
                raceOf={raceOf}
                matchFormat={state.matchFormat}
                defaultSlots={defaultSlotsOf(editingSet)}
                onPatch={patch => patchSet(editingSet.id, patch)}
                onAddEntry={entry => addEntry(editingSet.id, entry)}
                onRemoveEntry={id => removeEntry(editingSet.id, id)}
                onPatchEntry={(id, patch) => patchEntry(editingSet.id, id, patch)}
                onSetResult={(id, r) => setResult(editingSet.id, id, r)}
                onLoad={idx => loadMatch(editingSet.id, idx)}
                onReorder={(from, to) => reorderEntries(editingSet.id, from, to)}
                onFillDown={(startIdx, field, values) => fillDown(editingSet.id, startIdx, field, values)}
                onReplaceEntries={rows => replaceEntries(editingSet.id, rows)}
              />
            ) : (
              <div className="px-4 py-8 text-center text-sm text-white/25">
                + SET 버튼으로 세트를 추가하세요
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── 사용법 모달 ── */}
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}

      {/* ── OBS 모달 ── */}
      {obsModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setObsModalOpen(false)} />
          <div className="relative z-10 w-full max-w-md mx-4 rounded-2xl border border-white/15 bg-[#111114] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-white/[0.04] border-l-[3px] border-l-white/25">
              <div className="flex items-center gap-2.5">
                <Settings size={14} className="text-white/50" />
                <span className="font-bold text-sm text-white/80">OBS 레이아웃 설정</span>
              </div>
              <button onClick={() => setObsModalOpen(false)} className="text-white/30 hover:text-white/70 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-5">
              {/* 패널 표시 */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2.5">패널 표시</p>
                <div className="flex gap-2">
                  {(["scoreboardLayout", "entryLayout"] as const).map(k => (
                    <button key={k}
                      onClick={() => updLayout(k, { visible: !state[k].visible })}
                      className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold border transition-all ${state[k].visible ? "bg-blue-500/20 border-blue-400/50 text-blue-300" : "bg-white/5 border-white/10 text-white/35"}`}>
                      {state[k].visible ? <Eye size={12} /> : <EyeOff size={12} />}
                      {k === "scoreboardLayout" ? "스코어보드" : "대진표"}
                    </button>
                  ))}
                </div>
              </div>
              {/* 위치/크기 */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-3">위치 / 크기 <span className="text-white/20 font-normal">(Y: 스코어보드=하단에서, 대진표=상단에서)</span></p>
                <div className="space-y-4">
                  <LayoutPanel label="스코어보드" layout={state.scoreboardLayout} onChange={p => updLayout("scoreboardLayout", p)} />
                  <LayoutPanel label="대진표"     layout={state.entryLayout}      onChange={p => updLayout("entryLayout",      p)} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 토스트 ── */}
      {/* 경기 방식/진행 방식 전환 확인 — 기존 대진 내용이 있을 때만 (중앙 다이얼로그) */}
      {formatConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setFormatConfirm(null)} />
          <div className="relative z-10 w-[360px] mx-4 rounded-2xl border border-amber-500/30 bg-[#1a1610] shadow-2xl px-5 py-4">
            <div className="flex items-start gap-3">
              <span className="w-2 h-2 rounded-full bg-amber-400 mt-2 shrink-0" />
              <div className="flex-1">
                <p className="text-base font-black text-amber-100">경기 방식을 바꿀까요?</p>
                <p className="text-sm text-amber-200/70 mt-1.5 leading-relaxed">방식마다 세트 구성이 달라서, 지금 입력한 대진 내용은 모두 지워지고 새 구조로 다시 짜여집니다.</p>
                <div className="flex items-center gap-2 mt-3.5">
                  <button onClick={() => { formatConfirm(); setFormatConfirm(null); }}
                    className="h-9 px-4 rounded-lg bg-amber-500 text-sm font-bold text-black hover:bg-amber-400 transition-all">바꿀게요</button>
                  <button onClick={() => setFormatConfirm(null)}
                    className="h-9 px-4 rounded-lg text-sm font-bold text-white/40 hover:text-white/70 transition-all">취소</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <>
          <style>{`@keyframes toastIn{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}`}</style>
          <div className="fixed bottom-8 left-1/2 z-[200] pointer-events-none"
            style={{ animation: "toastIn 0.2s ease-out", transform: "translateX(-50%)" }}>
            <div className="rounded-xl bg-[#17171b] border border-white/15 shadow-2xl shadow-black/70 px-5 py-2.5 flex items-center gap-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
              <span className="text-sm font-semibold text-white/85 whitespace-nowrap">{toast}</span>
            </div>
          </div>
        </>
      )}

    </div>
  );
}


// ─── SetEditor (단순 대진표 + 일괄 입력) ───
function SetEditor({ set, leftTeam, rightTeam, leftPool, rightPool, mapPool, myName, raceOf, matchFormat, defaultSlots, onPatch, onAddEntry, onRemoveEntry, onPatchEntry, onSetResult, onLoad, onReorder, onFillDown, onReplaceEntries }: {
  set: OverlaySet;
  leftTeam: string;
  rightTeam: string;
  leftPool: string[];
  rightPool: string[];
  mapPool: string[];
  myName: string;
  raceOf: (name: string) => OverlayRace | undefined;
  matchFormat: OverlayMatchFormat;
  defaultSlots: number;
  onPatch: (p: Partial<OverlaySet>) => void;
  onAddEntry: (e: { leftPlayer: string; rightPlayer: string; map: string }) => void;
  onRemoveEntry: (id: string) => void;
  onPatchEntry: (id: string, patch: Partial<OverlayEntryRow>) => void;
  onSetResult: (id: string, r: "left" | "right") => void;
  onLoad: (idx: number) => void;
  onReorder: (from: number, to: number) => void;
  onFillDown: (startIdx: number, field: "leftPlayer" | "rightPlayer" | "map", values: string[]) => void;
  onReplaceEntries: (rows: ParsedRow[]) => void;
}) {
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [playerNames, setPlayerNames] = useState<string[]>([]);
  const [raceEditor, setRaceEditor] = useState<{ id: string; side: "left" | "right" } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null); // 드롭될 위치 표시용
  const endDrag = () => { setDragIdx(null); setOverIdx(null); };
  const [confirmFixed, setConfirmFixed] = useState(false);
  // 판수는 고정 설정이 아니라 실제 경기(행) 수로 결정됨
  const winTarget = Math.floor(set.entries.length / 2) + 1;

  // 세트를 처음 열었을 때 비어 있으면 기본 슬롯(1세트 7 / 2세트 9 / 에이스 1) 자동 생성
  // (SetEditor는 세트마다 key={set.id}로 새로 마운트되므로 한 번만 실행됨)
  useEffect(() => {
    if (set.entries.length === 0 && defaultSlots > 0) {
      onReplaceEntries(Array.from({ length: defaultSlots }, () => ({ leftPlayer: "", rightPlayer: "", map: "" })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 이름/닉네임 → 소속 대학 매핑 (대학대전 "내 팀 인식" 매칭용)
  const [univByToken, setUnivByToken] = useState<Record<string, string>>({});
  const normToken = (s: string) => s.toLowerCase().replace(/\s/g, "");
  useEffect(() => {
    fetch("/api/players").then(r => r.json()).then(p => {
      if (p.ok) {
        const names: string[] = [];
        const univMap: Record<string, string> = {};
        for (const pl of p.players) {
          if (pl.name) {
            names.push(pl.name);
            if (pl.name.length >= 3) names.push(pl.name.slice(-2)); // 성 뗀 이름 (조일장 → 일장)
          }
          if (pl.nickname) names.push(pl.nickname);
          if (pl.university) {
            if (pl.name) {
              univMap[normToken(pl.name)] = pl.university;
              if (pl.name.length >= 3) univMap[normToken(pl.name.slice(-2))] = pl.university;
            }
            if (pl.nickname) univMap[normToken(pl.nickname)] = pl.university;
          }
        }
        setPlayerNames(names);
        setUnivByToken(univMap);
      }
    }).catch(() => {});
  }, []);
  const universityOf = useCallback((token: string) => univByToken[normToken(token)] ?? null, [univByToken]);

  const scoreLeft  = set.entries.filter(e => e.result === "left").length;
  const scoreRight = set.entries.filter(e => e.result === "right").length;

  // 대전 및 CK·미니대전은 팀(대학) 단위 → 일괄입력에서 대학 매칭 사용
  const useUnivMatch = matchFormat === "university" || matchFormat === "mini";
  // "N 좌선수 vs 우선수" 형식은 프로리그를 제외한 방식에서 인식 (좌/우가 줄마다 명시돼 있어 안전)
  const allowVsFormat = matchFormat !== "proleague";

  // 붙여넣은 내용 실시간 인식 미리보기
  const preview = useMemo(
    () => (bulkText.trim() ? parseBulk(bulkText, myName, playerNames, useUnivMatch ? universityOf : undefined, allowVsFormat) : null),
    [bulkText, myName, playerNames, useUnivMatch, allowVsFormat, universityOf],
  );

  const applyBulk = () => {
    const parsed = parseBulk(bulkText, myName, playerNames, useUnivMatch ? universityOf : undefined, allowVsFormat);
    if (!parsed) { setNotice("선수 줄을 못 찾았어요. 최소 두 줄(양 팀)을 붙여넣어 주세요."); return; }
    // "vs" 형식은 줄 수가 곧 경기 수 → 기존 대진표 칸 수는 유지하고 앞에서부터 채움 (줄이 더 많으면 칸을 늘림)
    let rows = parsed.rows;
    if (parsed.vsFormat) {
      const slots = Math.max(rows.length, set.entries.length || defaultSlots);
      rows = Array.from({ length: slots }, (_, i) => rows[i] ?? { leftPlayer: "", rightPlayer: "", map: "" });
    }
    onReplaceEntries(rows);
    const warns: string[] = [];
    if (parsed.mapsOnly || parsed.vsFormat) {
      // 맵만 입력 / "vs" 형식(맵 없는 게 정상) — 경고 없음
    } else {
      if (!parsed.detectedP1)   warns.push(useUnivMatch ? "대학 자동인식 실패 → 첫 줄을 P1로 배치" : "내 팀 자동인식 실패 → 첫 줄을 P1로 배치");
      if (!parsed.detectedMaps) warns.push("맵 줄 미인식 → 맵 칸 직접 입력");
    }
    if (warns.length === 0) { setBulkText(""); setBulkOpen(false); setNotice(null); }
    else { setNotice(warns.join(" · ") + " — 표에서 바로 고칠 수 있어요"); }
  };

  return (
    <div className="p-3 space-y-3">
      {/* 진행 방식 (에이스 제외, 방식별로 다른 컨트롤) */}
      {!set.isAce && matchFormat === "proleague" && (
        <div className="relative flex items-center gap-2.5 flex-wrap">
          <span className="text-[11px] font-bold text-white/45">진행 방식</span>
          <div className="flex rounded-lg bg-white/[0.04] border border-white/10 p-0.5">
            {([{ v: false, label: "프로리그" }, { v: true, label: "위너스" }] as const).map(o => {
              const on = !!set.winnersMode === o.v;
              return (
                <button key={String(o.v)}
                  onClick={() => {
                    if (o.v === false && set.winnersMode) { setConfirmFixed(true); return; } // 위너스→프로리그: 예외 상황이라 확인 필요
                    onPatch({ winnersMode: o.v });
                  }}
                  className={`px-3.5 h-7 rounded-md text-xs font-bold transition-all ${on ? "bg-purple-600 text-white" : "text-white/40 hover:text-white/70"}`}>
                  {o.label}
                </button>
              );
            })}
          </div>
          <span className="text-sm font-semibold text-white/55">
            {set.winnersMode ? "승자가 다음 경기에 자동 잔류 · 상대만 선택" : "정해진 대진 순서대로 진행"}
          </span>
          <EntryHint />

          {/* 프로리그 전환 확인 토스트 */}
          {confirmFixed && (
            <div className="absolute left-0 top-full mt-2 z-20 flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-[#1a1610] shadow-2xl px-4 py-3 w-[340px]">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-bold text-amber-100">프로리그 방식으로 전환할까요?</p>
                <p className="text-xs text-amber-200/60 mt-1 leading-relaxed">예외적인 전환이에요. 이후엔 승자가 자동 잔류하지 않고 정해진 대진 순서대로 진행됩니다.</p>
                <div className="flex items-center gap-2 mt-2.5">
                  <button onClick={() => { onPatch({ winnersMode: false }); setConfirmFixed(false); }}
                    className="h-8 px-3.5 rounded-lg bg-amber-600 text-xs font-bold text-white hover:bg-amber-500 transition-all">전환할게요</button>
                  <button onClick={() => setConfirmFixed(false)}
                    className="h-8 px-3.5 rounded-lg text-xs font-bold text-white/40 hover:text-white/70 transition-all">취소</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 프로리그 외 방식: 진행 방식 컨트롤이 없으므로 입력 단축키 안내만 */}
      {matchFormat !== "proleague" && (
        <div className="flex items-center gap-2.5">
          <EntryHint />
        </div>
      )}

      {/* 대진표 (방송 미러) */}
      <div className="rounded-xl border border-white/10 overflow-hidden">
        {/* 팀 헤더 행 */}
        <div className="grid grid-cols-[30px_1fr_30px_64px_30px_1fr_auto] items-center bg-black/30 border-b border-white/10 px-2 py-2 gap-1">
          <span className="text-center text-[10px] font-bold text-white/25">#</span>
          <span className="text-base font-bold truncate text-right pr-1" style={{ color: "#d08a84" }}>{leftTeam || "우리팀"}</span>
          <span />
          <span className="flex flex-col items-center leading-none gap-1">
            <span className="flex items-center gap-1 text-base font-black tabular-nums">
              <span style={{ color: "#d08a84" }}>{scoreLeft}</span>
              <span className="text-white/20 text-[11px]">:</span>
              <span style={{ color: "#8aa6d0" }}>{scoreRight}</span>
            </span>
            <span className="text-[8px] font-bold text-white/30">{winTarget}선승</span>
          </span>
          <span />
          <span className="text-base font-bold truncate text-left pl-1" style={{ color: "#8aa6d0" }}>{rightTeam || "상대팀"}</span>
          <span className="text-[10px] font-bold text-white/25 pl-1 pr-0.5 text-right">조작</span>
        </div>
        {/* 경기 목록 (행=경기) */}
        {set.entries.length === 0 && (
          <div className="px-3 py-5 text-center text-xs text-white/25">아래 &ldquo;경기 추가&rdquo; 또는 일괄 입력으로 채우세요</div>
        )}
        {set.entries.map((entry, idx) => {
          const isCurrent = set.currentMatch === idx;
          const cellInput = (side: "left" | "right") => {
            const lost = side === "left" ? entry.result === "right" : entry.result === "left";
            const base = side === "left" ? "#d9938d" : "#92aede";
            return {
              color: lost ? "rgba(255,255,255,0.22)" : base,
              textDecoration: lost ? "line-through" : "none",
            };
          };
          const fieldCls = "h-8 w-[5.5rem] rounded-md bg-white/[0.06] border border-white/10 px-2 text-base font-bold outline-none focus:bg-emerald-500/[0.12] focus:border-emerald-500/60 transition-colors min-w-0 placeholder:text-white/20";
          // 스마트 붙여넣기: 여러 토큰이면 그 열을 아래로 자동 채움
          const smartPaste = (field: "leftPlayer" | "rightPlayer" | "map") => (e: React.ClipboardEvent<HTMLInputElement>) => {
            const tokens = e.clipboardData.getData("text").split(/[,\t\r\n]+|\s+/).map(t => t.trim()).filter(Boolean);
            if (tokens.length > 1) { e.preventDefault(); onFillDown(idx, field, tokens); }
          };
          // 엔터/탭으로 다음 칸(P1→맵→P2→다음 행 P1) 자동 이동 — 체크/송출 버튼은 건너뜀
          const fieldId = (rowIdx: number, field: "p1" | "map" | "p2") => `f-${set.id}-${rowIdx}-${field}`;
          const jumpTo = (rowIdx: number, field: "p1" | "map" | "p2") => (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key !== "Enter" && !(e.key === "Tab" && !e.shiftKey)) return;
            const el = document.getElementById(fieldId(rowIdx, field)) as HTMLInputElement | null;
            if (!el) return; // 마지막 행의 P2 등 다음 칸이 없으면 기본 동작(탭 이동 등) 유지
            e.preventDefault();
            el.focus();
            el.select();
          };
          // 승리 체크 버튼 (양쪽 선수가 다 채워져야 승패 지정 가능 — 빈 대기 행 오클릭 방지)
          const canCheck = !!entry.leftPlayer && !!entry.rightPlayer;
          const check = (side: "left" | "right") => {
            const on = entry.result === side;
            const c = side === "left" ? "#c4554d" : "#5577b0";
            return (
              <button onClick={() => canCheck && onSetResult(entry.id, side)} disabled={!canCheck}
                title={canCheck ? `${side === "left" ? "우리팀" : "상대팀"} 승` : "양쪽 선수를 먼저 채워주세요"}
                className={`w-6 h-6 mx-auto rounded-full flex items-center justify-center text-[11px] font-black transition-all border ${canCheck ? "" : "opacity-25 cursor-not-allowed"}`}
                style={on
                  ? { background: c, borderColor: c, color: "#fff" }
                  : { background: "transparent", borderColor: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.2)" }}>
                ✓
              </button>
            );
          };
          const waiting = !entry.leftPlayer && !entry.rightPlayer && !!entry.map; // 맵만 있는 대기 경기
          const tint = entry.result === "left" ? "rgba(196,85,77,0.10)" : entry.result === "right" ? "rgba(85,119,176,0.10)" : "";
          // 드롭 표시선: 아래쪽으로 옮기는 중이면 대상 행 "아래", 위쪽이면 "위"에 그림
          const dropLine: "above" | "below" | null =
            dragIdx === null || overIdx !== idx || dragIdx === idx ? null : dragIdx < idx ? "below" : "above";
          return (
            <div key={entry.id}
              onDragOver={e => {
                if (dragIdx === null) return;
                e.preventDefault();                      // 드롭 허용 (안 하면 입력칸에 텍스트로 떨어짐)
                e.dataTransfer.dropEffect = "move";
                if (overIdx !== idx) setOverIdx(idx);
              }}
              onDrop={e => {
                if (dragIdx === null) return;
                e.preventDefault();                      // 입력칸에 드롭 텍스트가 들어가는 것 방지
                if (dragIdx !== idx) onReorder(dragIdx, idx);
                endDrag();
              }}
              className={`group relative grid grid-cols-[30px_1fr_30px_64px_30px_1fr_auto] items-center gap-1 px-2 h-11 border-b border-white/6 last:border-b-0 transition-colors ${isCurrent ? "ring-1 ring-inset ring-emerald-500/40" : "hover:bg-white/[0.02]"} ${dragIdx === idx ? "opacity-40" : waiting ? "opacity-70" : ""}`}
              style={{ background: tint || undefined }}>
              {/* 드롭 위치 표시선 — 아래로 옮기면 행 아래, 위로 옮기면 행 위 */}
              {dropLine && (
                <span className={`pointer-events-none absolute left-0 right-0 h-[3px] rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] ${dropLine === "above" ? "-top-[1.5px]" : "-bottom-[1.5px]"}`} />
              )}
              {/* 번호 배지 = 드래그 핸들 (행 hover 시 그립 표시) */}
              <span className="flex items-center justify-center">
                <span draggable
                  onDragStart={e => {
                    setDragIdx(idx);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", String(idx)); // 파이어폭스는 이게 없으면 드래그가 시작 안 됨
                  }}
                  onDragEnd={endDrag}
                  title="드래그해서 순서 변경"
                  className={`relative w-6 h-6 rounded-md flex items-center justify-center cursor-grab active:cursor-grabbing transition-all ${isCurrent ? "bg-emerald-500/30 text-emerald-300" : "bg-white/8 text-white/45 group-hover:bg-white/20 group-hover:ring-1 group-hover:ring-white/20"}`}>
                  <span className="text-[11px] font-black tabular-nums group-hover:opacity-0 transition-opacity">{idx + 1}</span>
                  <GripVertical size={13} className="absolute opacity-0 group-hover:opacity-100 transition-opacity text-white/70" />
                </span>
              </span>
              {/* P1 */}
              <div className="relative flex items-center justify-end gap-1.5 min-w-0">
                {entry.leftPlayer && (() => {
                  const race = entry.leftRace ?? raceOf(entry.leftPlayer);
                  return race ? (
                    <button onClick={() => setRaceEditor({ id: entry.id, side: "left" })}
                      title={`${entry.leftRace ? "수동 지정" : "자동 인식"}: ${race} — 클릭해서 변경`}
                      className="shrink-0 text-sm font-black hover:opacity-70 transition-opacity"
                      style={{ color: RACE_COLORS[race] }}>{race}</button>
                  ) : (
                    <button onClick={() => setRaceEditor({ id: entry.id, side: "left" })}
                      title="선수 인식 안 됨 — 오타이거나 등록되지 않은 선수일 수 있어요. 클릭해서 종족 직접 설정"
                      className="shrink-0 text-xs font-bold text-white/25 hover:text-white/60 transition-colors">?</button>
                  );
                })()}
                <input id={fieldId(idx, "p1")} value={entry.leftPlayer} onChange={e => onPatchEntry(entry.id, { leftPlayer: e.target.value })}
                  onPaste={smartPaste("leftPlayer")} onKeyDown={jumpTo(idx, "map")}
                  list={`pool-left-${set.id}`} placeholder="선수" spellCheck={false} maxLength={8}
                  className={`${fieldCls} text-right`} style={cellInput("left")} />
                {raceEditor?.id === entry.id && raceEditor.side === "left" && (
                  <RacePicker
                    align="left"
                    current={entry.leftRace}
                    onPick={r => { onPatchEntry(entry.id, { leftRace: r }); setRaceEditor(null); }}
                    onClear={entry.leftRace ? () => { onPatchEntry(entry.id, { leftRace: undefined }); setRaceEditor(null); } : undefined}
                    onClose={() => setRaceEditor(null)}
                  />
                )}
              </div>
              {/* ✓ 좌 */}
              {check("left")}
              {/* 맵 — 맵풀에서 고르거나 직접 입력 */}
              <input id={fieldId(idx, "map")} value={entry.map} onChange={e => onPatchEntry(entry.id, { map: e.target.value })}
                onPaste={smartPaste("map")} onKeyDown={jumpTo(idx, "p2")}
                list={`map-pool-${set.id}`} title="맵풀에서 고르거나 직접 입력 · 여러 맵을 한 번에 붙여넣으면 아래로 자동 채워집니다"
                placeholder="맵" spellCheck={false} maxLength={10}
                className="h-8 w-full rounded-md bg-white/[0.035] border border-white/8 px-1 text-xs font-semibold text-center text-white/55 outline-none focus:bg-emerald-500/[0.1] focus:border-emerald-500/50 focus:text-white/90 transition-colors min-w-0 placeholder:text-white/20" />
              {/* ✓ 우 */}
              {check("right")}
              {/* P2 */}
              <div className="relative flex items-center justify-start gap-1.5 min-w-0">
                <input id={fieldId(idx, "p2")} value={entry.rightPlayer} onChange={e => onPatchEntry(entry.id, { rightPlayer: e.target.value })}
                  onPaste={smartPaste("rightPlayer")} onKeyDown={jumpTo(idx + 1, "p1")}
                  list={`pool-right-${set.id}`} placeholder="선수" spellCheck={false} maxLength={8}
                  className={`${fieldCls} text-left`} style={cellInput("right")} />
                {entry.rightPlayer && (() => {
                  const race = entry.rightRace ?? raceOf(entry.rightPlayer);
                  return race ? (
                    <button onClick={() => setRaceEditor({ id: entry.id, side: "right" })}
                      title={`${entry.rightRace ? "수동 지정" : "자동 인식"}: ${race} — 클릭해서 변경`}
                      className="shrink-0 text-sm font-black hover:opacity-70 transition-opacity"
                      style={{ color: RACE_COLORS[race] }}>{race}</button>
                  ) : (
                    <button onClick={() => setRaceEditor({ id: entry.id, side: "right" })}
                      title="선수 인식 안 됨 — 오타이거나 등록되지 않은 선수일 수 있어요. 클릭해서 종족 직접 설정"
                      className="shrink-0 text-xs font-bold text-white/25 hover:text-white/60 transition-colors">?</button>
                  );
                })()}
                {raceEditor?.id === entry.id && raceEditor.side === "right" && (
                  <RacePicker
                    align="right"
                    current={entry.rightRace}
                    onPick={r => { onPatchEntry(entry.id, { rightRace: r }); setRaceEditor(null); }}
                    onClear={entry.rightRace ? () => { onPatchEntry(entry.id, { rightRace: undefined }); setRaceEditor(null); } : undefined}
                    onClose={() => setRaceEditor(null)}
                  />
                )}
              </div>
              {/* 액션: 송출 · 삭제 */}
              <div className="flex items-center gap-1 shrink-0 pl-0.5">
                {/* 송출 · 삭제 — 행 hover 시에만 나타나므로 배경을 꽉 채워 버튼임을 명확히 */}
                <button onClick={() => onLoad(idx)} title="이 경기로 건너뛰기 (스코어보드에 띄우기)"
                  className="h-7 px-2.5 rounded-md text-[11px] font-black bg-emerald-600 text-white hover:bg-emerald-500 active:scale-[0.97] transition-all opacity-0 group-hover:opacity-100">
                  송출
                </button>
                <button onClick={() => onRemoveEntry(entry.id)} title="삭제"
                  className="h-7 w-7 flex items-center justify-center rounded-md text-[11px] font-black bg-white/12 text-white/70 hover:bg-red-600 hover:text-white active:scale-[0.97] transition-all opacity-0 group-hover:opacity-100">✕</button>
              </div>
            </div>
          );
        })}
        {/* 맨 아래 경기 추가 */}
        <button onClick={() => onAddEntry({ leftPlayer: "", rightPlayer: "", map: "" })}
          className="w-full flex items-center justify-center gap-1.5 h-10 text-sm font-bold text-white/35 hover:text-emerald-300 hover:bg-emerald-500/[0.06] transition-all">
          <Plus size={15} /> 경기 추가
        </button>
      </div>
      {/* 선수 드롭다운 후보 (다른 세트에 등장한 선수들 = 팀 멤버) */}
      <datalist id={`pool-left-${set.id}`}>{leftPool.map(n => <option key={n} value={n} />)}</datalist>
      <datalist id={`pool-right-${set.id}`}>{rightPool.map(n => <option key={n} value={n} />)}</datalist>
      {/* 맵풀 후보 (좌측 맵풀 카드에서 등록한 맵들) */}
      <datalist id={`map-pool-${set.id}`}>{mapPool.map(m => <option key={m} value={m} />)}</datalist>

      {/* 일괄 입력 트리거 */}
      <button onClick={() => { setNotice(null); setBulkOpen(true); }}
        className="w-full flex items-center justify-center gap-2 h-10 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-sm font-bold text-emerald-300 hover:bg-emerald-500/20 transition-all">
        <Plus size={15} /> 일괄 입력 (채팅 붙여넣기)
      </button>

      {/* 일괄 입력 모달 */}
      {bulkOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setBulkOpen(false)} />
          <div className="relative z-10 w-full max-w-3xl mx-4 max-h-[94vh] flex flex-col rounded-2xl border border-white/15 border-l-[3px] border-l-emerald-500/60 bg-[#111114] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-white/[0.04]">
              <div className="flex items-center gap-2.5">
                <Plus size={18} className="text-emerald-400/70" />
                <span className="font-bold text-lg text-white/90">일괄 입력</span>
              </div>
              <button onClick={() => setBulkOpen(false)} className="text-white/30 hover:text-white/70 transition-colors"><X size={20} /></button>
            </div>
            <div className="px-5 py-4 space-y-3 overflow-y-auto">
              {/* 무시되는 것만 한 줄로 */}
              <div className="flex items-center gap-2.5 rounded-xl bg-emerald-500/[0.08] border border-emerald-500/20 px-4 py-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                <span className="text-sm font-semibold text-emerald-100/85">
                  {allowVsFormat
                    ? <>메모장에 적어둔 대로 <b className="text-white font-black">편하게 붙여넣으세요</b> · 한 줄에 <b className="text-white font-black">한 경기</b>씩 ·
                        <b className="text-emerald-200"> 경기번호·채팅 ID·잡담</b>은 알아서 무시돼요</>
                    : <>인게임 채팅을 <b className="text-white font-black">편하게 그대로 붙여넣으세요</b> ·
                        <b className="text-emerald-200"> 채팅 ID·잡담</b>은 알아서 무시돼요</>}
                </span>
              </div>

              {/* 우리팀 기준 이름 — "vs" 형식은 줄마다 좌/우가 명시되므로 불필요 */}
              {!allowVsFormat && (
                <div className="flex items-center gap-2.5">
                  <span className="text-sm text-white/40">우리팀(P1) 기준</span>
                  <span className="text-2xl font-black" style={{ color: myName ? "#d9938d" : "rgba(255,255,255,0.25)" }}>{myName || "미설정"}</span>
                </div>
              )}

              {/* 붙여넣기 */}
              <textarea autoFocus
                className="w-full h-60 rounded-xl bg-white/5 border border-white/12 px-3.5 py-3 text-sm leading-snug font-mono outline-none resize-none focus:border-emerald-500/50 placeholder:text-white/20"
                value={bulkText}
                onChange={e => setBulkText(e.target.value)}
                placeholder={allowVsFormat
                  ? `여기에 붙여넣으세요\n\n${VS_SAMPLE_TEXT}`
                  : "여기에 붙여넣으세요  (우리팀 / 상대팀 / 맵 줄)\n\n[2. lllllll] JSA_Sharp1: 일장 재호 기석 현재 정우\n[2. lllllll] RoyaL1111: 지성 성대 짭제 영재 윤철\n[2. lllllll] RoyaL1111: 매치 실피 옥타 녹아 애티"}
              />

              {/* 인식 미리보기 */}
              <div className="flex items-center gap-2.5">
                <span className="text-sm font-bold text-white/55">인식 미리보기</span>
                {preview && (preview.vsFormat ? (
                  <span className="text-xs font-bold text-emerald-400">
                    &ldquo;vs&rdquo; 형식 ✓ {preview.rows.length}경기{preview.detectedMaps ? " · 맵 인식 ✓" : " · 맵은 표에서 입력"}
                  </span>
                ) : preview.mapsOnly ? (
                  <span className="text-xs font-bold text-emerald-400">맵만 입력 ✓ (선수는 표에서 입력)</span>
                ) : (
                  <span className="flex items-center gap-2.5 text-xs font-bold">
                    <span className={preview.detectedP1 ? "text-emerald-400" : "text-amber-400"}>{useUnivMatch ? "대학" : "내 팀"} {preview.detectedP1 ? "인식 ✓" : "미인식 ✗"}</span>
                    <span className={preview.detectedMaps ? "text-emerald-400" : "text-amber-400"}>맵 {preview.detectedMaps ? "인식 ✓" : "미인식 ✗"}</span>
                  </span>
                ))}
              </div>
              <div className="rounded-xl border border-white/10 overflow-hidden">
                <div className="grid grid-cols-[1fr_84px_1fr] bg-black/30 border-b border-white/10 px-4 py-2 text-sm font-bold">
                  <span className="text-right pr-1" style={{ color: "#d08a84" }}>우리팀 (P1)</span>
                  <span className="text-center text-white/40">맵</span>
                  <span className="text-left pl-1" style={{ color: "#8aa6d0" }}>상대팀 (P2)</span>
                </div>
                {!preview ? (
                  <div className="px-4 py-6 text-center text-sm text-white/25">붙여넣으면 여기에 분류 결과가 표시됩니다</div>
                ) : (
                  preview.rows.map((r, i) => {
                    // 입력에 명시된 종족이 있으면 그것을 우선, 없으면 선수 DB 자동 인식
                    const lRace = r.leftRace  ?? (r.leftPlayer  ? raceOf(r.leftPlayer)  : undefined);
                    const rRace = r.rightRace ?? (r.rightPlayer ? raceOf(r.rightPlayer) : undefined);
                    return (
                      <div key={i} className="grid grid-cols-[1fr_84px_1fr] items-center px-4 py-2 border-b border-white/5 last:border-b-0">
                        <span className="flex items-center justify-end gap-1 pr-1 text-base font-bold truncate" style={{ color: r.leftPlayer ? "#d9938d" : "rgba(255,255,255,0.18)" }}>
                          {r.leftPlayer && (lRace
                            ? <span className="text-[10px] font-black" style={{ color: RACE_COLORS[lRace] }}>{lRace}</span>
                            : <span title="선수 인식 안 됨 — 오타이거나 등록되지 않은 선수일 수 있어요" className="text-[10px] font-bold text-white/25">?</span>)}
                          <span className="truncate">{r.leftPlayer || "—"}</span>
                        </span>
                        <span className="text-center text-sm font-semibold text-white/45 truncate">{r.map || "—"}</span>
                        <span className="flex items-center justify-start gap-1 pl-1 text-base font-bold truncate" style={{ color: r.rightPlayer ? "#92aede" : "rgba(255,255,255,0.18)" }}>
                          <span className="truncate">{r.rightPlayer || "—"}</span>
                          {r.rightPlayer && (rRace
                            ? <span className="text-[10px] font-black" style={{ color: RACE_COLORS[rRace] }}>{rRace}</span>
                            : <span title="선수 인식 안 됨 — 오타이거나 등록되지 않은 선수일 수 있어요" className="text-[10px] font-bold text-white/25">?</span>)}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>

              {notice && <p className="text-sm text-amber-400/90">{notice}</p>}
            </div>
            {/* 하단 고정 액션 */}
            <div className="flex items-center justify-end gap-3 px-5 py-3.5 border-t border-white/10 bg-white/[0.03]">
              <button onClick={applyBulk} disabled={!bulkText.trim()}
                className="h-11 px-6 rounded-xl bg-emerald-600 text-base font-bold text-white hover:bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                적용 (기존 교체)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 사용법 모달 ───
function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-xl mx-4 max-h-[90vh] flex flex-col rounded-2xl border border-white/15 border-l-[3px] border-l-blue-500/60 bg-[#111114] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-white/[0.04]">
          <div className="flex items-center gap-2.5">
            <HelpCircle size={18} className="text-blue-300/80" />
            <span className="font-bold text-lg text-white/90">대진표 사용법</span>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/70 transition-colors"><X size={20} /></button>
        </div>
        <div className="px-5 py-4 space-y-4 overflow-y-auto">

          {/* 스마트 붙여넣기 (시각 예시) — 일괄 입력 설명은 일괄 입력 창 안에 있으므로 여기선 생략 */}
          <div className="rounded-xl bg-white/[0.03] border border-white/8 px-4 py-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="shrink-0 px-2.5 py-1 rounded-md bg-emerald-500/15 border border-emerald-400/25 text-xs font-bold text-emerald-200">스마트 붙여넣기</span>
              <p className="text-base font-bold text-white/90">칸 하나에 여러 개를 한 번에</p>
            </div>
            <p className="text-sm text-white/60 leading-relaxed mb-3">
              맵 칸이나 선수 칸 <b className="text-white underline decoration-emerald-400/60 underline-offset-2">하나</b>에 여러 개를 붙여넣으면 그 칸부터 아래 경기로 순서대로 <b className="text-emerald-200">자동</b> 입력됩니다.
            </p>

            {/* 시각 미리보기: 맵 칸 하나 → 여러 행 */}
            <div className="rounded-lg bg-black/30 border border-white/10 p-3">
              <p className="text-xs font-bold text-white/35 mb-2">예시 — 맵 칸에 붙여넣기</p>
              <div className="flex items-center gap-2 mb-2.5">
                <span className="text-xs text-white/45 shrink-0">클립보드</span>
                <span className="flex-1 rounded-md bg-emerald-500/10 border border-emerald-400/30 px-2 py-1 text-xs font-mono text-emerald-200 truncate">
                  매치 실피 옥타 녹아 애티
                </span>
              </div>
              <div className="flex items-center justify-center text-white/30 text-xs mb-2">↓ 붙여넣기 (Ctrl+V)</div>
              <div className="rounded-md border border-white/10 overflow-hidden">
                {["매치", "실피", "옥타", "녹아", "애티"].map((m, i) => (
                  <div key={m} className={`grid grid-cols-[28px_1fr_60px_1fr] items-center px-2 py-1.5 text-xs ${i < 4 ? "border-b border-white/6" : ""}`}>
                    <span className="text-center text-white/30 font-bold">{i + 1}</span>
                    <span className="text-right pr-1 text-white/25">선수</span>
                    <span className="text-center font-bold text-emerald-300 bg-emerald-500/10 rounded px-1">{m}</span>
                    <span className="text-left pl-1 text-white/25">선수</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-white/35 mt-2">→ 맵 5개가 1~5경기 칸에 한 번에 채워짐</p>
            </div>

            {/* 시각 미리보기: 선수 칸 하나 → 여러 행 */}
            <div className="rounded-lg bg-black/30 border border-white/10 p-3 mt-3">
              <p className="text-xs font-bold text-white/35 mb-2">예시 — 선수(P1) 칸에 붙여넣기</p>
              <div className="flex items-center gap-2 mb-2.5">
                <span className="text-xs text-white/45 shrink-0">클립보드</span>
                <span className="flex-1 rounded-md bg-rose-500/10 border border-rose-400/30 px-2 py-1 text-xs font-mono text-rose-200 truncate">
                  일장 기석 재호 민철 제동
                </span>
              </div>
              <div className="flex items-center justify-center text-white/30 text-xs mb-2">↓ 붙여넣기 (Ctrl+V)</div>
              <div className="rounded-md border border-white/10 overflow-hidden">
                {["일장", "기석", "재호", "민철", "제동"].map((p, i) => (
                  <div key={p} className={`grid grid-cols-[28px_1fr_60px_1fr] items-center px-2 py-1.5 text-xs ${i < 4 ? "border-b border-white/6" : ""}`}>
                    <span className="text-center text-white/30 font-bold">{i + 1}</span>
                    <span className="text-right pr-1 font-bold text-rose-300 bg-rose-500/10 rounded px-1">{p}</span>
                    <span className="text-center text-white/25">맵</span>
                    <span className="text-left pl-1 text-white/25">선수</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-white/35 mt-2">→ 선수 5명이 1~5경기 P1 칸에 한 번에 채워짐 (맵·P2 칸도 동일하게 동작)</p>
            </div>
          </div>

        </div>
        <div className="px-5 py-3.5 border-t border-white/10 bg-white/[0.03] flex justify-end">
          <button onClick={onClose} className="h-10 px-6 rounded-xl bg-blue-600 text-sm font-bold text-white hover:bg-blue-500 transition-all">확인</button>
        </div>
      </div>
    </div>
  );
}

// ─── 종족 수동 지정 팝오버 ───
function RacePicker({ align, current, onPick, onClear, onClose }: {
  align: "left" | "right";
  current: OverlayRace | undefined;
  onPick: (r: OverlayRace) => void;
  onClear?: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className={`absolute z-40 top-full mt-1 flex items-center gap-1 rounded-lg border border-white/15 bg-[#17171b] p-1 shadow-2xl ${align === "left" ? "right-0" : "left-0"}`}>
        {RACES.map(r => (
          <button key={r} onClick={() => onPick(r)}
            title={`종족을 ${r}로 직접 설정`}
            className="w-7 h-7 rounded-md text-xs font-black transition-all"
            style={{
              background: current === r ? RACE_BG[r] : "rgba(255,255,255,0.04)",
              border: `1px solid ${current === r ? RACE_COLORS[r] : "rgba(255,255,255,0.1)"}`,
              color: RACE_COLORS[r],
            }}>{r}</button>
        ))}
        {onClear && (
          <button onClick={onClear} title="수동 설정 해제 (자동 인식으로 되돌리기)"
            className="h-7 px-1.5 rounded-md text-[9px] font-bold text-white/35 hover:text-white/70 border border-white/10 whitespace-nowrap">자동</button>
        )}
      </div>
    </>
  );
}

// ─── 레이아웃 패널 ───
function LayoutPanel({ label, layout, onChange }: {
  label: string; layout: OverlayPanelLayout;
  onChange: (p: Partial<OverlayPanelLayout>) => void;
}) {
  const rows = [
    { label: "X",   unit: "px", value: layout.x,     min: -200, max: 1920, step: 1,    key: "x"     as const },
    { label: "Y",   unit: "px", value: layout.y,     min: -200, max: 1080, step: 1,    key: "y"     as const },
    { label: "크기", unit: "×",  value: layout.scale, min: 0.3,  max: 2,    step: 0.01, key: "scale" as const },
  ];
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground mb-2">{label}</p>
      <div className="space-y-2">
        {rows.map(s => (
          <div key={s.key} className="flex items-center gap-2">
            <span className="w-8 shrink-0 text-xs text-muted-foreground">{s.label}</span>
            <input type="range" min={s.min} max={s.max} step={s.step} value={s.value}
              onChange={e => onChange({ [s.key]: Number(e.target.value) })}
              className="flex-1 accent-blue-500 h-1 min-w-0" />
            <input type="number" min={s.min} max={s.max} step={s.step} value={s.value}
              onChange={e => { const v = Number(e.target.value); if (!isNaN(v)) onChange({ [s.key]: Math.min(s.max, Math.max(s.min, v)) }); }}
              className="w-16 shrink-0 rounded-md bg-white/6 border border-white/10 px-2 py-0.5 text-xs text-right tabular-nums text-white/80 focus:outline-none focus:border-blue-500/60" />
            <span className="text-xs text-white/30 shrink-0">{s.unit}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── 경기 모드 미리보기 (스코어보드 레이아웃 목업) ───
function ScoreboardModePreview({ mode }: { mode: "team" | "individual" }) {
  const isTeam = mode === "team";
  return (
    <div className="rounded-lg overflow-hidden border border-white/10 bg-black/40">
      <div className="text-center py-2 text-xs font-semibold text-white/50 bg-white/[0.04] border-b border-white/8">
        {!isTeam && <span className="text-white/30 mr-1">맵 |</span>}
        타이틀 <span className="text-white/30">| 1SET</span>
      </div>
      {isTeam && (
        <div className="grid grid-cols-3 items-center px-3 py-2 border-b border-white/8 bg-emerald-500/10">
          <span className="text-right text-sm font-bold" style={{ color: "#d9938d" }}>좌팀명</span>
          <span className="text-center text-sm font-black text-white/75">0 : 0</span>
          <span className="text-left text-sm font-bold" style={{ color: "#92aede" }}>우팀명</span>
        </div>
      )}
      <div className="grid grid-cols-3 items-center px-3 py-2.5">
        <span className="text-right text-base font-bold text-white/85">좌선수</span>
        <span className="text-center text-sm font-semibold text-white/45">{isTeam ? "맵" : "0 : 0"}</span>
        <span className="text-left text-base font-bold text-white/85">우선수</span>
      </div>
      {isTeam && <p className="text-center text-[11px] font-bold text-emerald-300/80 pb-2">▲ 이 줄이 추가돼요</p>}
    </div>
  );
}

// ─── URL 복사 버튼 ───
function UrlCopyBtn({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="flex items-center gap-1.5 rounded-lg bg-white/8 px-3 py-1.5 text-xs font-semibold hover:bg-white/15 transition-all" title={url}>
      {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
      {copied ? "복사됨" : "OBS URL"}
    </button>
  );
}
