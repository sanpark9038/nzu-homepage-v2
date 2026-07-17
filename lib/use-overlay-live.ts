"use client";

// 방송 오버레이 페이지 공용 — 오버레이 상태 폴링 + 선수 DB 기반 종족 조회 + 배경 투명 처리.
// 스코어보드/엔트리보드가 같은 데이터를 봐야 하므로 한 곳에서 관리한다.
import { useCallback, useEffect, useRef, useState } from "react";
import { defaultOverlayState, type OverlayRace, type OverlayState } from "./overlay-types";
import { raceOfName, type RaceLookupPlayer } from "./overlay-race";

const POLL_INTERVAL = 500;

export function useOverlayLive(overlayKey: string): {
  state: OverlayState;
  raceOf: (name: string) => OverlayRace | undefined;
} {
  const [state, setState] = useState<OverlayState>(defaultOverlayState());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 선수 DB — 대진표의 이름을 종족 색으로 칠하기 위해 한 번만 불러옴
  const [playerDb, setPlayerDb] = useState<RaceLookupPlayer[]>([]);
  useEffect(() => {
    fetch("/api/players")
      .then(r => r.json())
      .then(p => { if (p.ok) setPlayerDb(p.players.map((x: RaceLookupPlayer) => ({ name: x.name, nickname: x.nickname ?? null, race: x.race }))); })
      .catch(() => {});
  }, []);
  const raceOf = useCallback((name: string) => raceOfName(playerDb, name), [playerDb]);

  // 오버레이 위젯 바깥은 전부 투명해야 함 — 앱 레이아웃(body, #main-scroll-container)이
  // 배경을 칠하므로 페이지마다 지우지 말고 여기서 한 번에 덮는다.
  useEffect(() => {
    const el = document.createElement("style");
    el.textContent = `
      html, body, body > * { background: transparent !important; }
      #main-scroll-container { background: transparent !important; overflow: visible !important; }
    `;
    document.head.appendChild(el);
    return () => { el.remove(); };
  }, []);

  useEffect(() => {
    if (!overlayKey) return;
    const poll = () =>
      fetch(`/api/overlay/state?key=${encodeURIComponent(overlayKey)}`, { cache: "no-store" })
        .then(r => r.json())
        .then(p => { if (p.ok) setState({ ...defaultOverlayState(), ...p.state }); })
        .catch(() => {});
    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [overlayKey]);

  return { state, raceOf };
}
