"use client";

import {
  formatVotes,
  jungmanAxisLabel,
  jungmanDayBoundaries,
  jungmanEmphasis,
  jungmanRankMap,
  JUNGMAN_SEED_CUT,
  JUNGMAN_VOTING_TEAMS,
  JUNGMAN_WILDCARD_CUT,
  teamAccent,
  teamShort,
  type JungmanEmphasis,
  type JungmanRangeKey,
  type JungmanSeries,
  type JungmanSeriesPoint,
} from "@/lib/jungman";

const WIDTH = 780;
const HEIGHT = 320;
const PAD_LEFT = 54;
const PAD_RIGHT = 60; // 마지막 점 오른쪽 약칭 라벨 자리
const PAD_TOP = 22;
const PAD_BOTTOM = 34;
const INNER_W = WIDTH - PAD_LEFT - PAD_RIGHT;
const INNER_H = HEIGHT - PAD_TOP - PAD_BOTTOM;

/** 12개 선을 전부 진하게 그리면 아무것도 안 읽힌다 — 컷라인에 걸린 자리만 살린다(jungmanEmphasis) */
const TIER_STYLE: Record<JungmanEmphasis, { width: number; opacity: number; dot: number }> = {
  lead: { width: 2.4, opacity: 1, dot: 4 },
  edge: { width: 1.8, opacity: 0.75, dot: 3.2 },
  back: { width: 1.1, opacity: 0.25, dot: 2.2 },
};
/** 마지막 점 라벨 최소 세로 간격 */
const LABEL_GAP = 12;
const AXIS_LABELS = 7;

/** 순위 모드 배경 컷라인 — 강조 이유를 눈으로 설명한다 */
const CUT_LINES = [
  { rank: JUNGMAN_SEED_CUT, label: "시드선", color: "#d4a94a" },
  { rank: JUNGMAN_WILDCARD_CUT, label: "와카선", color: "#e0705f" },
];

type ChartMode = "votes" | "rank";

/** 시간 비례 x좌표 — 버킷 간격이 균일하지 않아 인덱스 비례로 그리면 시간이 왜곡된다 */
function timeScale(points: JungmanSeriesPoint[]) {
  const times = points.map((point) => Date.parse(point.at));
  const first = times[0];
  const span = times[times.length - 1] - first;
  return (index: number) => PAD_LEFT + (span > 0 ? (INNER_W * (times[index] - first)) / span : INNER_W / 2);
}

export function JungmanChart({
  points,
  mode,
  selected,
}: {
  points: JungmanSeriesPoint[];
  mode: ChartMode;
  selected: string | null;
}) {
  if (points.length < 2) {
    return (
      <p className="flex h-[220px] items-center justify-center text-sm font-bold text-[#7a8299]">
        이 구간에는 아직 표시할 집계가 없습니다
      </p>
    );
  }

  const x = timeScale(points);
  const last = points[points.length - 1];
  const teamCount = JUNGMAN_VOTING_TEAMS.length;

  const maxVotes = Math.max(
    1,
    ...points.flatMap((point) => JUNGMAN_VOTING_TEAMS.map((team) => point.votes[team.code] || 0))
  );
  const ranksPerPoint = mode === "rank" ? points.map((point) => jungmanRankMap(point)) : null;

  const y = (index: number, code: string) =>
    ranksPerPoint
      ? PAD_TOP + (INNER_H * ((ranksPerPoint[index].get(code) || teamCount) - 1)) / Math.max(1, teamCount - 1)
      : PAD_TOP + INNER_H * (1 - (points[index].votes[code] || 0) / maxVotes);

  // 순서는 최신 시점 기준 — 선 굵기·라벨·그리는 순서가 전부 이걸 따른다
  const lastRanks = jungmanRankMap(last);
  const ranked = JUNGMAN_VOTING_TEAMS.slice().sort(
    (a, b) => (lastRanks.get(a.code) || 0) - (lastRanks.get(b.code) || 0)
  );
  // 선택이 있으면 그 팀만 — 없으면 컷라인 규칙
  const tierOf = (code: string): JungmanEmphasis =>
    selected ? (selected === code ? "lead" : "back") : jungmanEmphasis(lastRanks.get(code) || teamCount);
  const styleOf = (code: string) =>
    selected && selected === code
      ? { width: 3, opacity: 1, dot: 4.5 }
      : selected
        ? { width: 1.1, opacity: 0.1, dot: 2.2 }
        : TIER_STYLE[tierOf(code)];
  // 강조 팀을 뒤에 그려 위로 올린다
  const drawOrder = ranked
    .slice()
    .sort((a, b) => styleOf(a.code).opacity - styleOf(b.code).opacity);

  // 마지막 값이 붙어 있으면 라벨이 겹친다 — 위에서 아래로 최소 간격을 밀어낸다.
  // (아래에서 위로 밀면 선두 4팀처럼 값이 붙었을 때 천장에 전부 포개진다)
  const labels = ranked
    .filter((team) => tierOf(team.code) === "lead")
    .map((team) => ({ team, y: y(points.length - 1, team.code) }))
    .sort((a, b) => a.y - b.y);
  let floor = PAD_TOP + 5;
  for (const label of labels) {
    label.y = Math.max(label.y, floor);
    floor = label.y + LABEL_GAP;
  }

  const step = Math.max(1, Math.ceil((points.length - 1) / (AXIS_LABELS - 1)));
  const axisIndexes = points.map((_, index) => index).filter((index) => index % step === 0);
  if (axisIndexes[axisIndexes.length - 1] !== points.length - 1) axisIndexes.push(points.length - 1);

  const days = jungmanDayBoundaries(points);
  // 컷라인은 순위 모드에서만 — 두 등수 사이(3.5·10.5)에 긋는다
  const cutLines = ranksPerPoint
    ? CUT_LINES.map((cut) => ({
        ...cut,
        y: PAD_TOP + (INNER_H * (cut.rank - 0.5)) / Math.max(1, teamCount - 1),
      }))
    : [];

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={mode === "rank" ? "시간대별 팀 순위 변동" : "시간대별 팀 득표 추이"}
      className="block h-auto w-full"
    >
      {(ranksPerPoint ? [1, 4, 8, teamCount] : [0, 0.5, 1]).map((tick) => {
        const lineY = ranksPerPoint
          ? PAD_TOP + (INNER_H * (tick - 1)) / Math.max(1, teamCount - 1)
          : PAD_TOP + INNER_H * tick;
        return (
          <g key={tick}>
            <line x1={PAD_LEFT} y1={lineY} x2={WIDTH - PAD_RIGHT} y2={lineY} stroke="rgba(155,185,240,0.12)" />
            <text x={PAD_LEFT - 10} y={lineY + 4} textAnchor="end" fontSize="12" fill="#7a8299">
              {ranksPerPoint ? `${tick}위` : formatVotes(Math.round(maxVotes * (1 - tick)))}
            </text>
          </g>
        );
      })}

      {/* 컷라인 — 순위 모드에서만. 왜 이 팀들만 진한지를 배경이 설명한다 */}
      {cutLines.map(({ y: lineY, color, label }) => (
        <line
          key={label}
          x1={PAD_LEFT}
          y1={lineY}
          x2={WIDTH - PAD_RIGHT}
          y2={lineY}
          stroke={color}
          strokeOpacity={0.3}
          strokeDasharray="2 5"
        />
      ))}

      {/* 날짜 경계 — 78시간짜리 투표라 일봉은 무의미하다. 대신 하루가 넘어간 지점만 세로선으로 */}
      {days.map(({ index, day }) => (
        <g key={`day-${index}`}>
          <line
            x1={x(index)}
            y1={PAD_TOP - 8}
            x2={x(index)}
            y2={PAD_TOP + INNER_H}
            stroke="rgba(212,169,74,0.34)"
            strokeDasharray="4 4"
          />
          <text x={x(index) + 5} y={PAD_TOP - 10} fontSize="11.5" fontWeight="800" fill="#d4a94a">
            {day}일차
          </text>
        </g>
      ))}

      {/* 날짜는 직전 "라벨" 기준으로 붙인다 — 직전 점과 비교하면 솎여나간 자리에서 날짜가 사라진다 */}
      {axisIndexes.map((index, order) => (
        <text
          key={points[index].at}
          x={x(index)}
          y={HEIGHT - 11}
          textAnchor="middle"
          fontSize="11.5"
          fill="#7a8299"
        >
          {jungmanAxisLabel(points[index].at, order > 0 ? points[axisIndexes[order - 1]].at : null)}
        </text>
      ))}

      {drawOrder.map((team) => {
        const style = styleOf(team.code);
        const path = points.map((_, index) => `${x(index)},${y(index, team.code)}`);

        return (
          <g key={team.code}>
            {/* 선택 팀만 면적을 채워 한 팀 이야기가 되게 한다 */}
            {selected === team.code && !ranksPerPoint ? (
              <polygon
                points={`${PAD_LEFT},${PAD_TOP + INNER_H} ${path.join(" ")} ${x(points.length - 1)},${PAD_TOP + INNER_H}`}
                fill={teamAccent(team)}
                fillOpacity={0.14}
              />
            ) : null}
            <polyline
              points={path.join(" ")}
              fill="none"
              stroke={teamAccent(team)}
              strokeWidth={style.width}
              strokeOpacity={style.opacity}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <circle
              cx={x(points.length - 1)}
              cy={y(points.length - 1, team.code)}
              r={style.dot}
              fill={teamAccent(team)}
              fillOpacity={Math.min(1, style.opacity + 0.1)}
              stroke="#0b0f1a"
              strokeWidth={1.5}
            />
          </g>
        );
      })}

      {/* 컷라인 이름표는 12개 선 위에 얹힌다 — 바탕을 깔지 않으면 안 읽힌다 */}
      {cutLines.map(({ y: lineY, color, label }) => (
        <g key={label}>
          <rect
            x={WIDTH - PAD_RIGHT - 42}
            y={lineY - 14}
            width={40}
            height={13}
            rx={2}
            fill="#0b0f1a"
            fillOpacity={0.85}
          />
          <text
            x={WIDTH - PAD_RIGHT - 5}
            y={lineY - 4}
            textAnchor="end"
            fontSize="10.5"
            fontWeight="800"
            fill={color}
            fillOpacity={0.85}
          >
            {label}
          </text>
        </g>
      ))}

      {labels.map((label) => (
        <text
          key={label.team.code}
          x={x(points.length - 1) + 8}
          y={label.y + 3.5}
          fontSize="12"
          fontWeight="800"
          fill={teamAccent(label.team)}
        >
          {teamShort(label.team)}
        </text>
      ))}
    </svg>
  );
}

/**
 * 12팀 범례 — 선 끝 약칭만으로는 라벨이 붙은 팀 말고는 누가 누군지 알 수 없다.
 * 칩 클릭이 곧 팀 선택(재클릭 해제)이라 밝기는 차트와 같은 jungmanEmphasis를 쓴다.
 */
function TeamLegend({
  points,
  selected,
  onSelect,
}: {
  points: JungmanSeriesPoint[];
  selected: string | null;
  onSelect: (code: string) => void;
}) {
  const last = points[points.length - 1];
  const ranks = jungmanRankMap(last ?? { votes: {} });
  const ranked = JUNGMAN_VOTING_TEAMS.slice().sort(
    (a, b) => (ranks.get(a.code) || 0) - (ranks.get(b.code) || 0)
  );
  const tierOf = (code: string): JungmanEmphasis =>
    selected ? (selected === code ? "lead" : "back") : jungmanEmphasis(ranks.get(code) || JUNGMAN_VOTING_TEAMS.length);

  return (
    <div className="mt-2 flex flex-wrap gap-x-1 gap-y-1.5 border-t border-[rgba(155,185,240,0.1)] pt-3">
      {ranked.map((team) => {
        const tier = tierOf(team.code);
        return (
          <button
            key={team.code}
            type="button"
            aria-pressed={selected === team.code}
            onClick={() => onSelect(team.code)}
            className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-bold transition-colors ${
              selected === team.code
                ? "border-[#d4a94a] bg-[rgba(212,169,74,0.14)] text-[#e8ebf2]"
                : tier === "lead"
                  ? "border-[rgba(155,185,240,0.2)] bg-[rgba(10,15,28,0.6)] text-[#e8ebf2] hover:border-[rgba(155,185,240,0.45)]"
                  : tier === "edge"
                    ? "border-[rgba(155,185,240,0.12)] bg-[rgba(10,15,28,0.5)] text-[#b3bbd0] hover:text-[#e8ebf2]"
                    : "border-transparent bg-[rgba(10,15,28,0.4)] text-[#616a80] hover:text-[#e8ebf2]"
            }`}
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: teamAccent(team), opacity: TIER_STYLE[tier].opacity }}
            />
            {team.name}
          </button>
        );
      })}
    </div>
  );
}

/** 차트 컨트롤과 시세판 정렬 토글이 같은 세그먼트 컨트롤을 쓴다 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { key: T; label: string; disabled?: boolean }[];
  value: T;
  onChange: (next: T) => void;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex rounded-full border border-[rgba(155,185,240,0.16)] bg-[rgba(10,15,28,0.6)] p-1 text-xs font-bold"
    >
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          disabled={option.disabled}
          onClick={() => onChange(option.key)}
          aria-pressed={value === option.key}
          className={`rounded-full px-3 py-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
            value === option.key ? "bg-[#d4a94a] text-[#0b0f1a]" : "text-[#7a8299] hover:enabled:text-[#e8ebf2]"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** 표시 모드(득표/순위) × 구간(1시간/6시간/전체) 전환. 시리즈는 서버가 버킷까지 끝내 내려준다. */
export function JungmanChartPanel({
  series,
  selected,
  onSelectTeam,
  mode,
  onModeChange,
  range,
  onRangeChange,
  closed = false,
}: {
  series: JungmanSeries[];
  selected: string | null;
  onSelectTeam: (code: string) => void;
  mode: ChartMode;
  onModeChange: (next: ChartMode) => void;
  range: JungmanRangeKey;
  onRangeChange: (next: JungmanRangeKey) => void;
  /** 투표 마감 — 득표수 축이 곧 표수 노출이다. 순위 모드로 고정하고 토글을 내린다 */
  closed?: boolean;
}) {
  const active = series.find((entry) => entry.key === range) ?? series[series.length - 1];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-black tracking-tight">
          추이
          {selected ? (
            <span className="ml-2 text-sm font-bold text-[#d4a94a]">
              {JUNGMAN_VOTING_TEAMS.find((team) => team.code === selected)?.name ?? selected} 강조
            </span>
          ) : null}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {closed ? null : (
            <Segmented
              label="표시 모드"
              value={mode}
              onChange={onModeChange}
              options={[
                { key: "votes", label: "득표수" },
                { key: "rank", label: "순위" },
              ]}
            />
          )}
          <Segmented
            label="구간"
            value={active.key}
            onChange={onRangeChange}
            options={series.map((entry) => ({
              key: entry.key,
              label: entry.label,
              disabled: entry.points.length < 2,
            }))}
          />
        </div>
      </div>
      <div className="mt-3">
        <JungmanChart points={active.points} mode={mode} selected={selected} />
      </div>
      <TeamLegend points={active.points} selected={selected} onSelect={onSelectTeam} />
    </>
  );
}
