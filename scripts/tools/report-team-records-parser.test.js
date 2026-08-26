const assert = require("node:assert/strict");
const test = require("node:test");

const {
  collectionDisplayTotal,
  parseDisplayStats,
  isSourceOutagePage,
  looksLikeProfilePage,
  isSourceAnomaly,
  extractInitialRows,
  extractMixInitialRows,
  collectMixPages,
  parseWomenYearRows,
  windowYears,
  appendRows,
  selectMode,
  playerCacheKey,
  mergePriorMatches,
  mergePriorOlderThan,
  rowKey,
} = require("./report-team-records");

const FEMALE_SECTION = "\uC5EC\uC131\uBC00\uB9AC\uC804\uC801";
const MIXED_SECTION = "\uD63C\uC131\uBC00\uB9AC\uC804\uC801";

test("extractInitialRows does not mix mixed-section rows into female collection", () => {
  const html = `
    <strong>[${FEMALE_SECTION} - date links open the match]</strong>
    <div class="list-board">
      <table><tbody></tbody></table>
    </div>
    <strong>[${MIXED_SECTION} - date links open the match]</strong>
    <div class="list-board">
      <table><tbody>
        <tr>
          <td style="padding:5px;background:#434348; color:#FFF; text-align:center">2026-05-16</td>
          <td>Opponent(Z)</td>
          <td>Map</td>
          <td>-16.5</td>
          <td></td>
          <td>Loss(3)</td>
        </tr>
      </tbody></table>
    </div>
  `;

  const initial = extractInitialRows(html, {
    mode: "female_or_default",
    endpoint: "view_list.php",
    sectionMarker: FEMALE_SECTION,
  });

  assert.equal(initial.rows.length, 0);
});

test("extractInitialRows refuses explicit mixed collection mode", () => {
  const html = `
    <strong>[${MIXED_SECTION} - date links open the match]</strong>
    <div class="list-board">
      <table><tbody>
        <tr>
          <td style="padding:5px;background:#00ccff; color:#FFF; text-align:center">2026-05-16</td>
          <td>Opponent(P)</td>
          <td>Map</td>
          <td>+16.5</td>
        </tr>
      </tbody></table>
    </div>
  `;

  const initial = extractInitialRows(html, {
    mode: "special_mix",
    endpoint: "mix_view_list.php",
    sectionMarker: MIXED_SECTION,
  });

  assert.equal(initial.rows.length, 0);
  assert.equal(initial.initialLastId, 0);
});

// 2026-08 여자부 개편: ajax_women_record.php(bj_name + target_year) 응답 실측 스니펫.
// 진서(wr_id=1048) 2026년 응답에서 그대로 잘라온 것 — 빈 연도는 이 thead만 돌아온다.
const WOMEN_YEAR_RESPONSE_HEAD = `
<style>#datatable_women thead th { text-align: center !important; }</style>
<div class="list-board">
    <table class="table table-borderless datatable" id="datatable_women">
	<thead>
            <tr>
                <th scope="col" style="width: 90px;">날짜</th>
                <th scope="col" style="width: 120px;">상대</th>
                <th scope="col" style="width: 150px;">맵</th>
                <th scope="col" style="width: 80px;">ELO</th>
                <th scope="col" style="width: 100px;">경기방식</th>
                <th scope="col">메모</th>
            </tr>
        </thead>
        <tbody>`;
const WOMEN_YEAR_RESPONSE_TAIL = `
        </tbody>
    </table>
</div>`;
const WOMEN_YEAR_RESPONSE_ROWS = `
            <tr style="border-bottom:1px solid #CCC;">
                <td width="90" style="background:#434348; color:#FFF; text-align:center; font-weight:normal;">
                    <a href="board.php?bo_table=bj_board&wr_id=253384" target="_blank" style="color:#FFF; font-weight:normal;">2026-08-16</a>
                </td>
                <td><a href='/women/bbs/board.php?bo_table=bj_list&wr_id=1045' target='_blank'>휘연(P)</a></td>
                <td><a href="#" class="text-primary">폴리포이드</a></td>
                <td style="text-align:center">-14.4</td>
                <td>단판</td>
                <td>휘연승</td>
            </tr>
            <tr style="border-bottom:1px solid #CCC;">
                <td width="90" style="background:#0CF; color:#FFF; text-align:center; font-weight:normal;">
                    <a href="board.php?bo_table=bj_board&wr_id=252542" target="_blank" style="color:#FFF; font-weight:normal;">2026-07-28</a>
                </td>
                <td><a href='/women/bbs/board.php?bo_table=bj_list&wr_id=1042' target='_blank'>또아(Z)</a></td>
                <td><a href="#" class="text-primary">투혼</a></td>
                <td style="text-align:center">+21.4</td>
                <td>3/2(1)</td>
                <td>단판 승</td>
            </tr>`;

test("parseWomenYearRows reads the yearly ajax response into match rows", () => {
  const rows = parseWomenYearRows(
    `${WOMEN_YEAR_RESPONSE_HEAD}${WOMEN_YEAR_RESPONSE_ROWS}${WOMEN_YEAR_RESPONSE_TAIL}`
  );

  assert.equal(rows.length, 2);
  assert.equal(rows[0].date, "2026-08-16");
  assert.equal(rows[0].opponent, "휘연(P)");
  assert.equal(rows[0].map, "폴리포이드");
  assert.equal(rows[0].result_text, "-14.4");
  assert.equal(rows[0].set_score, "단판");
  assert.equal(rows[0].note, "휘연승");
  // 최신순으로 오는 응답 순서를 그대로 보존해야 책갈피(latest_key)가 최신 행을 가리킨다.
  assert.equal(rows[1].date, "2026-07-28");
});

// 헤더만 돌아오는 연도는 "그 해 경기 없음"이다(정상). 소스 이상으로 오인하면 안 된다.
test("parseWomenYearRows returns no rows for an empty year response", () => {
  assert.equal(parseWomenYearRows(`${WOMEN_YEAR_RESPONSE_HEAD}${WOMEN_YEAR_RESPONSE_TAIL}`).length, 0);
});

// 승패는 ELO 부호로 판정된다(날짜칸 배경 #434348=패 / #0CF=승은 보조 신호).
test("yearly rows resolve outcome through the shared appendRows path", () => {
  const rows = parseWomenYearRows(
    `${WOMEN_YEAR_RESPONSE_HEAD}${WOMEN_YEAR_RESPONSE_ROWS}${WOMEN_YEAR_RESPONSE_TAIL}`
  );
  const bucket = [];
  appendRows(bucket, new Set(), rows);
  assert.deepEqual(bucket.map((r) => r.is_win), [false, true]);
});

// 개편된 여자부만 연도 조회로 간다. 남자부는 기존 view_list.php 페이지네이션 그대로여야 한다.
test("selectMode routes women boards to the yearly ajax endpoint and leaves men alone", () => {
  const women = selectMode({
    name: "진서",
    profile_url: "https://eloboard.com/women/bbs/board.php?bo_table=bj_list&wr_id=1048",
  });
  assert.equal(women.mode, "women_yearly");
  assert.equal(women.endpoint, "ajax_women_record.php");
  assert.equal(women.collect_matches, true);

  const men = selectMode({
    name: "박상현",
    profile_url: "https://eloboard.com/men/bbs/board.php?bo_table=bj_list&wr_id=22",
  });
  assert.equal(men.mode, "female_or_default");
  assert.equal(men.endpoint, "view_list.php");
});

test("windowYears covers the collection window newest-first", () => {
  const years = windowYears();
  assert.equal(years[0], new Date().getFullYear());
  assert.equal(years[years.length - 1], 2025);
});

test("selectMode disables mixed profile collection instead of using mix endpoint", () => {
  const mode = selectMode({
    name: "Mixed profile",
    profile_url: "https://eloboard.com/women/bbs/board.php?bo_table=bj_m_list&wr_id=531",
  });

  assert.equal(mode.mode, "mixed_collection_disabled");
  assert.equal(mode.endpoint, null);
  assert.equal(mode.collect_matches, false);
});

test("collectionDisplayTotal uses female section total instead of mixed page total", () => {
  const displayStats = {
    total: { total: 3, wins: 0, losses: 3 },
    female: { total: 0, wins: 0, losses: 0 },
    male: null,
  };

  const total = collectionDisplayTotal(
    {
      name: "Female default profile",
      profile_url: "https://eloboard.com/women/bbs/board.php?bo_table=bj_list&wr_id=1036",
    },
    {
      mode: "female_or_default",
      endpoint: "view_list.php",
      collect_matches: true,
    },
    displayStats
  );

  assert.equal(total, 0);
});

test("collectionDisplayTotal treats ambiguous women total as section-empty", () => {
  const displayStats = {
    total: { total: 3, wins: 0, losses: 3 },
    female: null,
    male: null,
  };

  const total = collectionDisplayTotal(
    {
      name: "Female default profile",
      profile_url: "https://eloboard.com/women/bbs/board.php?bo_table=bj_list&wr_id=1036",
    },
    {
      mode: "female_or_default",
      endpoint: "view_list.php",
      collect_matches: true,
    },
    displayStats
  );

  assert.equal(total, 0);
});

test("collectionDisplayTotal keeps total fallback for men profile guardrail", () => {
  const displayStats = {
    total: { total: 10, wins: 6, losses: 4 },
    female: null,
    male: null,
  };

  const total = collectionDisplayTotal(
    {
      name: "Men default profile",
      profile_url: "https://eloboard.com/men/bbs/board.php?bo_table=bj_list&wr_id=37",
    },
    {
      mode: "female_or_default",
      endpoint: "view_list.php",
      collect_matches: true,
    },
    displayStats
  );

  assert.equal(total, 10);
});

// 2026-08-13 장애: 엘로보드가 HTTP 200에 mysqli 오류 본문(~378바이트)을 실어 보냈다.
// 이걸 정상 페이지로 읽으면 경기 0건이 되고 상위가 "조용한 삭제 의심"으로 수십 건 오탐한다.
test("isSourceOutagePage detects the mysqli overload body and passes normal pages", () => {
  const outage =
    "<br />\n<b>Warning</b>:  mysqli_connect(): (HY000/1226): User 'mimesys' has exceeded the " +
    "'max_user_connections' resource in <b>/home/mimesys/public_html/lib/mysqli.lib.php</b>\n" +
    "Connect Error: User mimesys already has more than 'max_user_connections' active connections";

  assert.equal(isSourceOutagePage(outage), true);
  assert.equal(isSourceOutagePage("<html><div class=\"list-board\">정상</div></html>"), false);
  assert.equal(isSourceOutagePage(""), false);
  assert.equal(isSourceOutagePage(null), false);
});

// 2026-08-22~25 사고: 엘로보드가 Cloudflare 검문을 켰는데 러너에서는 그게 "경기 0건인 정상
// 응답"으로 읽혔고, 나흘 밤 동안 tmp 캐시의 선수 파일이 0건으로 덮여 전 팀 total이 붕괴했다
// (BGM 7,782→241 등). 검문 HTML엔 표시 카운터가 없어 displayTotal=0이라 SOURCE_ANOMALY도
// 통과해버렸다. 아래 조각은 2026-08-26 로컬 fetch(403, 5510바이트) 실측본에서 잘라온 것이다.
const CLOUDFLARE_CHALLENGE_HTML = [
  '<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title>',
  '<meta http-equiv="content-security-policy" content="default-src &#39;none&#39;; ',
  'script-src &#39;nonce-9JPZnNZxkNbhbYwtsmWhO6&#39; https://challenges.cloudflare.com">',
  "</head><body><div class=\"main-content\"><noscript><span id=\"challenge-error-text\">",
  "Enable JavaScript and cookies to continue</span></noscript></div>",
  "<script nonce=\"9JPZnNZxkNbhbYwtsmWhO6\">(function(){window._cf_chl_opt = {cRay: 'a3135315194c196e',",
  "cType: 'managed', cZone: 'eloboard.com', cUPMDTk:\"/women/bbs/board.php?bo_table=bj_list&wr_id=1048",
  "&__cf_chl_tk=rIeI4vkKekwMXLWNp4zuZk20seVurb5D\"};var a = document.createElement('script');",
  "a.src = '/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1?ray=a3135315194c196e';",
  "}());</script></body></html>",
].join("");

test("isSourceOutagePage detects the Cloudflare challenge page", () => {
  assert.equal(isSourceOutagePage(CLOUDFLARE_CHALLENGE_HTML), true);
  // 검문이 아닌 차단(1020) 페이지도 잡는다.
  assert.equal(
    isSourceOutagePage("<html><body>Attention Required! | Cloudflare<br>Ray ID: 8f0</body></html>"),
    true
  );
  // "cloudflare" 단어 하나로는 판정하지 않는다 — 정상 페이지 오탐 금지.
  assert.equal(isSourceOutagePage("<html><p>cloudflare 도입 안내</p></html>"), false);
  // 연도 응답의 "빈 연도"는 정상이다(테이블 구조가 그대로 온다).
  assert.equal(
    isSourceOutagePage(`${WOMEN_YEAR_RESPONSE_HEAD}${WOMEN_YEAR_RESPONSE_TAIL}`),
    false
  );
});

// 안전망: 표식 목록은 "이번 검문 형태"를 아는 것이고 다음 개편·차단 모습은 모른다. 그래서
// 프로필은 반대로 판정한다 — 엘로보드 페이지라면 반드시 있는 표식이 하나도 없으면 실패시킨다.
test("looksLikeProfilePage rejects alien pages and accepts real board pages", () => {
  assert.equal(looksLikeProfilePage(CLOUDFLARE_CHALLENGE_HTML), false);
  assert.equal(looksLikeProfilePage("<html><body>whatever</body></html>"), false);
  assert.equal(looksLikeProfilePage(""), false);
  assert.equal(looksLikeProfilePage(null), false);

  // 남자부 실측(wr_id=37 아카이브 스냅샷)의 표 형태 전적 라벨 + 사이트 메타.
  assert.equal(
    looksLikeProfilePage(
      '<meta name="publisher" content="스타크래프트 남성전적사이트" />' +
        "<th>총전적</th><td>4,098전 2,294승 1,804패(56.0%)</td>"
    ),
    true
  );
  // 여자부/혼성 프로필은 경기 표 컨테이너(list-board)를 그대로 쓴다.
  assert.equal(looksLikeProfilePage(`${WOMEN_YEAR_RESPONSE_HEAD}${WOMEN_YEAR_RESPONSE_TAIL}`), true);
  // 글 삭제/이동 안내는 "아는 페이지"다 — 혼성 보드 폴백이 처리하므로 외계 페이지가 아니다.
  assert.equal(
    looksLikeProfilePage("<html><body>오류안내 페이지<br>글이 존재하지 않습니다.</body></html>"),
    true
  );
});

// 표시 카운터는 살아 있는데 목록이 0행이면 소스 이상이다(장애 중 view_list.php가 빈 응답).
// 이 결과를 쓰면 멀쩡한 기존 전적이 0으로 덮이거나 "경기 수 감소" 오탐이 된다.
test("isSourceAnomaly flags counter>0 with zero collected rows only", () => {
  assert.equal(isSourceAnomaly(8, 0), true);
  assert.equal(isSourceAnomaly(8, 8), false);
  // 카운터도 0이면 정상적인 "경기 없음"이다(혼성 보드 선수는 displayTotal이 0으로 계산된다).
  assert.equal(isSourceAnomaly(0, 0), false);
});

// 책갈피 키는 팀·프로필 URL과 무관해야 한다. 예전 키(name|wr_id|profile_url) + 팀별 버킷은
// 프로필 URL이 바뀌거나 선수가 팀을 옮기면 앵커를 잃었고, c9/씨나인처럼 같은 팀이 두 벌로 쌓였다.
test("playerCacheKey is team- and url-independent, falling back to wr identity", () => {
  const a = { entity_id: "eloboard:female:9", name: "김선수", wr_id: 9, gender: "female", profile_url: "https://a/x?wr_id=9" };
  const b = { entity_id: "eloboard:female:9", name: "닉변", wr_id: 9, gender: "female", profile_url: "https://b/y?wr_id=9" };
  assert.equal(playerCacheKey(a), playerCacheKey(b));
  assert.equal(playerCacheKey(a), "eloboard:female:9");

  assert.equal(playerCacheKey({ name: "무명", wr_id: 37, gender: "male" }), "wr_male_37");
  assert.equal(playerCacheKey({ name: "무명" }), "무명");
});

// 날짜 단위 무효화: 이번에 읽은 날짜의 과거 행은 버리고 새로 읽은 것으로 대체한다.
// 같은 날 경기가 뒤늦게 정정·추가돼도 반영되게 하는 안전장치다.
test("mergePriorMatches drops prior rows on dates re-read this run", () => {
  const fresh = [
    { date: "2026-07-25", opponent: "A", map: "M", result_text: "+1", set_score: "", note: "", is_win: true },
    { date: "2026-07-24", opponent: "B", map: "M", result_text: "-1", set_score: "", note: "", is_win: false },
  ];
  const seen = new Set(fresh.map(rowKey));
  const prior = [
    // 같은 날짜(2026-07-24)의 낡은 행 — 폐기되어야 한다.
    { date: "2026-07-24", opponent: "STALE", map: "M", result_text: "+1", set_score: "", note: "", is_win: true },
    // 더 오래된 행 — 그대로 이어 붙는다.
    { date: "2026-07-01", opponent: "C", map: "M", result_text: "+1", set_score: "", note: "", is_win: true },
    // 새로 읽은 것과 완전히 같은 행 — 중복 없이 한 번만.
    { date: "2026-07-25", opponent: "A", map: "M", result_text: "+1", set_score: "", note: "", is_win: true },
  ];

  const merged = mergePriorMatches(fresh, seen, prior);
  assert.deepEqual(merged.map((m) => `${m.date}|${m.opponent}`), [
    "2026-07-25|A",
    "2026-07-24|B",
    "2026-07-01|C",
  ]);
});

// 매일 경로(여자부): 올해만 POST하고 과거 연도는 기존 파일에서 이어 붙인다.
// 컷오프(올해 1/1) 위쪽은 방금 전량 재읽었으므로 prior에서 절대 부활시키지 않는다.
const row = (date, opponent, extra = {}) => ({
  date,
  opponent,
  map: "M",
  result_text: "+1",
  set_score: "",
  note: "",
  is_win: true,
  ...extra,
});

test("mergePriorOlderThan only pulls prior rows from before the cutoff", () => {
  const matches = [row("2026-08-16", "A")];
  const seen = new Set(matches.map(rowKey));
  const prior = [
    // 올해 행 — 부활 금지(엘로보드에서 지워진 경기일 수 있다).
    row("2026-03-01", "DELETED"),
    // 새로 읽은 것과 같은 행 — 중복 없이 한 번만.
    row("2026-08-16", "A"),
    // 과거 연도 — 이어 붙는다.
    row("2025-12-31", "OLD"),
    // 윈도(START_DATE=2025-01-01) 밖 — 버린다.
    row("2024-12-31", "TOOOLD"),
    // is_win이 없는 깨진 행 — 버린다(재파싱 대상이 아니다).
    row("2025-05-05", "BROKEN", { is_win: undefined }),
  ];

  const merged = mergePriorOlderThan(matches, seen, prior, "2026-01-01");
  assert.deepEqual(merged.map((m) => `${m.date}|${m.opponent}`), [
    "2026-08-16|A",
    "2025-12-31|OLD",
  ]);
});

// 함정 방지: 혼성 탭은 윈도 전체를 다시 읽으므로 과거 날짜 행이 fresh에 섞인다.
// mergePriorMatches(날짜 단위 무효화)를 쓰면 그 날짜의 prior 여성전 행까지 버려 경기 수가
// 줄고 회귀 가드가 오작동한다. 컷오프 병합은 같은 날짜라도 다른 행이면 그대로 살린다.
test("mergePriorOlderThan keeps prior rows sharing a date with a re-read mixed row", () => {
  const matches = [row("2025-06-01", "MIXED_OPPONENT")];
  const seen = new Set(matches.map(rowKey));
  const prior = [row("2025-06-01", "FEMALE_OPPONENT")];

  const merged = mergePriorOlderThan(matches, seen, prior, "2026-01-01");
  assert.deepEqual(merged.map((m) => m.opponent), ["MIXED_OPPONENT", "FEMALE_OPPONENT"]);
  // 대조: 날짜 무효화 버전은 같은 행을 버린다(그래서 여기 쓰면 안 된다).
  assert.equal(mergePriorMatches([row("2025-06-01", "MIXED_OPPONENT")], new Set(), prior).length, 1);
});

// 실측 레이아웃(2026-08-17): 여자부 프로필은 "여성 : 9전 0승 9패" 인라인("전적" 없음),
// 남자부는 <th>총전적</th><td>4,098전 …</td> 표 형태(콜론 없음). 예전 정규식("여성전적 :" 등
// 인라인 전용)은 두 보드 모두에서 매치 실패 → displayTotal이 항상 0 → 소스 이상 감지와
// 강제 페이지네이션이 전부 무력화됐다(가드가 배포 첫날 발동하지 않은 원인).
test("parseDisplayStats reads the real women inline layout", () => {
  const html = `
    <span class="medium float-right">총전적 : 9전 0승 9패</span>
    <span class="medium float-right">여성 : 9전 0승 9패</span>
    <span class="medium float-right">혼성 : 0전 0승 0패</span>
  `;
  const stats = parseDisplayStats(html);
  assert.deepEqual(stats.total, { total: 9, wins: 0, losses: 9 });
  assert.deepEqual(stats.female, { total: 9, wins: 0, losses: 9 });
});

test("parseDisplayStats reads the real men th/td layout", () => {
  const html = `
    <th scope="row" style="background:#f6f6f6;border:1px solid #ccc;padding:5px">총전적</th>
    <td style="border:1px solid #ccc;padding:5px">4,098전 2,294승 1,804패(56.0%)</td>
  `;
  const stats = parseDisplayStats(html);
  assert.deepEqual(stats.total, { total: 4098, wins: 2294, losses: 1804 });
});

test("parseDisplayStats still reads the legacy inline labels", () => {
  const html = "여성전적 : 12전 7승 5패 / 남성전적 : 3전 1승 2패";
  const stats = parseDisplayStats(html);
  assert.deepEqual(stats.female, { total: 12, wins: 7, losses: 5 });
  assert.deepEqual(stats.male, { total: 3, wins: 1, losses: 2 });
});


// 2026-08 실측(안아 wr_id=175): 여성 섹션은 AJAX 스켈레톤 div만 남고, 혼성 섹션만 서버가
// 렌더링한다. 혼성 마커 뒤 첫 div.list-board가 최신 30행이다.
const MIX_PROFILE_HTML = `
  <strong>[${FEMALE_SECTION} - 날짜 클릭]</strong>
  <div id="women_record_area" style="min-height:250px;"></div>
  <strong>[${MIXED_SECTION} - 날짜 클릭]</strong>
  <div class="list-board">
    <table><tbody>
      <tr style="border-bottom:1px solid #CCC; ">
        <td width="90" style="padding:5px;background:#00ccff; color:#FFF; text-align:center"><a href="/women/bbs/board.php?bo_table=mix_bat&wr_id=41000" target="_blank">2026-08-18</a></td>
        <td width="120" style="padding:5px 5px 5px 15px; text-align:left"><a href='/women/bbs/board.php?bo_table=bj_m_list&wr_id=1' target='_blank'>라히(T)</a></td>
        <td width="150">투하컘</td>
        <td width="80" style="text-align:center">+10.5</td>
        <td width="100"></td>
        <td style="text-align:left">안아 승</td>
      </tr>
      <tr style="border-bottom:1px solid #CCC; ">
        <td width="90" style="padding:5px;background:#434348; color:#FFF; text-align:center"><a href="/women/bbs/board.php?bo_table=mix_bat&wr_id=31085" target="_blank">2025-06-11</a></td>
        <td width="120" style="padding:5px 5px 5px 15px; text-align:left"><a href='/women/bbs/board.php?bo_table=bj_m_list&wr_id=913' target='_blank'>빡재 TV(T)</a></td>
        <td width="150">데자 뷰</td>
        <td width="80" style="text-align:center">-11.1</td>
        <td width="100"></td>
        <td style="text-align:left">쉬터 CK 6경기</td>
      </tr>
    </tbody></table>
  </div>
  <div class="list-row"><div id="morem30" class="morebox"><a href="#" class="morem" id="30"></a></div></div>
`;

test("extractMixInitialRows reads the server-rendered mixed tab", () => {
  const rows = extractMixInitialRows(MIX_PROFILE_HTML);
  assert.deepEqual(rows.map((r) => r.date), ["2026-08-18", "2025-06-11"]);
  assert.equal(rows[0].result_text, "+10.5");

  const matches = [];
  const seen = new Set();
  const stats = appendRows(matches, seen, rows);
  assert.equal(stats.unknownOutcomeRows, 0);
  assert.deepEqual(matches.map((m) => m.is_win), [true, false]);
});

test("extractMixInitialRows returns nothing when the mixed marker is absent", () => {
  assert.deepEqual(extractMixInitialRows('<div class="list-board"><table><tbody></tbody></table></div>'), []);
});

function mixRow(date, tag = "X") {
  return { date, opponent: tag, map: "M", result_text: "+1", set_score: "", note: "", style0: "", row_text: "" };
}
// 행마다 상대를 달리 둔다 — rowKey가 같으면 appendRows가 중복으로 묶어 행 수 검증이 무의미해진다.
function mixPage(size, date) {
  return Array.from({ length: size }, (_, i) => mixRow(date, `X${i}`));
}

test("collectMixPages walks 30-row offsets and stops on an empty response", async () => {
  const asked = [];
  const pages = await collectMixPages(mixPage(30, "2026-08-18"), async (offset) => {
    asked.push(offset);
    return offset === 30 ? mixPage(30, "2026-05-01") : [];
  });
  // last_id는 날짜가 아니라 30·60 오프셋이다.
  assert.deepEqual(asked, [30, 60]);
  assert.equal(pages.length, 2);
});

test("collectMixPages stops at the first page reaching past the window start", async () => {
  const asked = [];
  const pages = await collectMixPages(
    [...mixPage(29, "2025-03-01"), mixRow("2024-12-31", "OLD")],
    async (offset) => {
      asked.push(offset);
      return mixPage(30, "2024-01-01");
    }
  );
  assert.deepEqual(asked, []);
  assert.equal(pages.length, 1);

  // 윈도 밖 행은 appendRows가 걷어낸다 -> no_out_of_range 유지.
  const matches = [];
  appendRows(matches, new Set(), pages[0]);
  assert.equal(matches.length, 29);
});

test("collectMixPages does not paginate a short first block", async () => {
  let calls = 0;
  const pages = await collectMixPages(mixPage(12, "2026-08-18"), async () => {
    calls += 1;
    return [];
  });
  assert.equal(calls, 0);
  assert.equal(pages.length, 1);
});

test("collectMixPages yields nothing for a player with no mixed matches", async () => {
  let calls = 0;
  const pages = await collectMixPages([], async () => {
    calls += 1;
    return [];
  });
  assert.equal(calls, 0);
  assert.deepEqual(pages, []);
});

// 여성전·혼성전을 같은 matches/seen에 이어 붙여도 rowKey 중복 제거가 겹침을 처리한다.
test("mixed rows append onto the yearly female rows without duplicating overlaps", () => {
  const female = parseWomenYearRows(
    WOMEN_YEAR_RESPONSE_HEAD + WOMEN_YEAR_RESPONSE_ROWS + WOMEN_YEAR_RESPONSE_TAIL
  );
  const matches = [];
  const seen = new Set();
  appendRows(matches, seen, female);
  const femaleCount = matches.length;
  assert.ok(femaleCount > 0);

  // 첫 행은 여성전과 완전히 같은 행(겹침), 둘째는 새 혼성전.
  const mixed = [{ ...female[0] }, mixRow("2026-08-18")];
  appendRows(matches, seen, mixed);
  assert.equal(matches.length, femaleCount + 1);
  assert.equal(matches[matches.length - 1].date, "2026-08-18");
});
