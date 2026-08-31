# -*- coding: utf-8 -*-
"""
펨코 '경기결과' 글 하나를 세트 목록으로 옮긴다.

    python scripts/tools/fmkorea-match-result.py 10268937352
    python scripts/tools/fmkorea-match-result.py --file post.html   (받아둔 글 다시 파싱)
    python scripts/tools/fmkorea-match-result.py --self-check       (네트워크 없이 파서만 검사)

관리자 세트 입력에 그대로 넣을 수 있는 JSON을 찍는다. DB는 건드리지 않는다 —
사람이 보고 넣는다. 이름을 못 찾으면 추측하지 않고 unmatched에 남긴다.

왜 Scrapling인가: 펨코는 일반 HTTP(430 밴)와 헤드리스 크롬(챌린지 페이지)을 막는다.
IP가 아니라 브라우저 지문 검사라 스텔스 브라우저만 통과한다. 그래서 Vercel에서는 못 돈다.

주의: '리뷰' 글은 결과가 이미지라 파싱이 안 된다. 제목에 '결과'가 든 글을 써라.
"""
import argparse
import html as ihtml
import io
import json
import re
import sys
import time
import urllib.request

PLAYERS_URL = "https://www.star-hosaga.com/api/players"
# 경기결과 전용 카테고리. 잡담이 안 섞인다
CATEGORY_URL = "https://www.fmkorea.com/index.php?mid=starcraft&category=9602419408"

# 글쓴이가 쓰는 약칭. 못 찾는 약칭은 그대로 두고 경고한다 — 멋대로 고르면 조용히 틀린다
MAPS = {
    "애티": "애티튜드", "에티": "애티튜드", "애": "애티튜드",
    "라데": "라데온", "라": "라데온",
    "녹아": "녹아웃", "녹": "녹아웃",
    "오디": "오디세이", "오": "오디세이",
}

# "1. [에티] 나    린Z (패) vs  (승) 꼬    니P" — 안 치른 세트는 괄호가 비어 있다
# 오른쪽 이름은 줄 끝이나 다음 세트 번호에서 끊는다. 한 줄에 여러 세트가 붙어 있는 글이 있다
SET_RE = re.compile(
    r"(\d+)\s*\.\s*\[\s*([^\]]+?)\s*\]\s*([^()\n]+?)\s*\(\s*(승|패)?\s*\)\s*vs\s*\(\s*(승|패)?\s*\)"
    r"\s*([가-힣A-Za-z0-9 ]+?)\s*(?=\d+\s*\.\s*\[|$)",
    re.M,
)
ENTRY_RE = re.compile(r"\[\s*([A-Za-z가-힣]{2,10})\s*\]\s*([가-힣A-Za-z0-9 ]{6,})")
FINAL_RE = re.compile(r"([A-Za-z가-힣]{2,10})\s*(\d+)\s*대\s*(\d+)\s*승")


def clean_name(raw):
    """'나    린Z' -> '나린'. 두 글자 이름을 세로로 맞추려고 넣은 공백이라 전부 지운다."""
    name = re.sub(r"\s+", "", ihtml.unescape(raw)).strip()
    return re.sub(r"[ZTP]$", "", name) or name


def body_text(raw_html):
    """xe_content부터 '게시판 이력' 앞까지. 댓글이 섞이면 집계가 오염된다."""
    at = raw_html.find("xe_content")
    end = raw_html.find("게시판", at)
    body = raw_html[at : end if end > at else at + 30000]
    body = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", body, flags=re.S)
    body = re.sub(r"<br\s*/?>|</p>|</div>|</li>", "\n", body, flags=re.I)
    text = ihtml.unescape(re.sub(r"<[^>]+>", " ", body))
    # 이름 사이 넓은 공백은 &nbsp;다. 일반 공백으로 펴 두지 않으면 문자 클래스가 이름을
    # 반만 먹고 세트가 통째로 빠진다 — 조용히 몇 세트가 사라지는 방식이라 특히 위험하다
    text = text.replace(" ", " ").replace("​", "")
    return "\n".join(line.strip() for line in text.split("\n") if line.strip())


def parse(text):
    sets, warnings = [], []
    for _, map_abbr, left, left_mark, right_mark, right in SET_RE.findall(text):
        key = re.sub(r"\s+", "", map_abbr)
        if key not in MAPS:
            warnings.append(f"모르는 맵 약칭: {key}")
        winner = "left" if left_mark == "승" else "right" if right_mark == "승" else None
        # 한쪽만 표시된 글이 있다 — 패만 있으면 반대쪽이 이긴 것이다
        if winner is None and (left_mark or right_mark):
            winner = "right" if left_mark == "패" else "left"
        sets.append(
            {"map": MAPS.get(key, key), "left": clean_name(left), "right": clean_name(right), "winner": winner}
        )

    # 엔트리 줄이 팀 이름을 준다. '[ 9판 5선승 ]' 같은 규칙 줄은 숫자가 있어 안 걸린다
    teams = [t for t, names in ENTRY_RE.findall(text) if len(names.split()) >= 4]
    final = FINAL_RE.search(text)
    return sets, teams, final, warnings


def resolve_names(sets, roster):
    """글의 잘린 이름을 우리 선수 이름으로 편다. 애매하면 고르지 않고 남긴다."""
    unmatched = []
    for row in sets:
        for side in ("left", "right"):
            name = row[side]
            if name in roster:
                continue
            hits = sorted({r for r in roster if r.startswith(name) or name.startswith(r)})
            if len(hits) == 1:
                row[side] = hits[0]
            else:
                unmatched.append(name if not hits else f"{name} -> {hits}")
    return unmatched


def fetch(url):
    from scrapling.fetchers import StealthyFetcher  # 무거워서 필요할 때만 부른다

    if not url.startswith("http"):
        url = f"https://www.fmkorea.com/{url}"
    return StealthyFetcher.fetch(url, headless=True, network_idle=True, timeout=60000).html_content


# 목록 URL이 두 형식으로 나온다. 한쪽만 보면 0건이 나온다 — 실제로 당한 적 있다
LIST_RES = (
    re.compile(r'document_srl=(\d+)"[^>]*>([^<]{2,})</a>'),
    re.compile(r'href="/(\d{8,})"[^>]*>([^<]{2,})</a>'),
)


def list_posts(pages):
    """경기결과 카테고리 목록. 한 페이지 20건 ≈ 이틀치."""
    rows, seen = [], set()
    for page in range(1, pages + 1):
        if page > 1:
            time.sleep(11)  # 붙여 쏘면 다시 밴당한다
        url = CATEGORY_URL if page == 1 else f"{CATEGORY_URL}&page={page}"
        html = fetch(url)
        for pattern in LIST_RES:
            for srl, title in pattern.findall(html):
                title = ihtml.unescape(title).strip()
                if srl not in seen and title:
                    seen.add(srl)
                    rows.append((srl, title))
    return rows


def pick_candidates(rows, keywords):
    """제목에 키워드가 다 든 글. '리뷰' 글은 결과가 이미지라 뒤로 민다."""
    keys = [k.lower() for k in keywords if k]
    hits = [(srl, t) for srl, t in rows if all(k in t.lower() for k in keys)]
    return sorted(hits, key=lambda row: ("리뷰" in row[1], "결과" not in row[1]))


SAMPLE = """
[JSA] 하블리 소심 나린 려원 백원이야 쟈닌 미진이
[BGM] 김쵸아 뚜미 꼬니 엔돌핀 제티 다라츄 황단비
[ 9판 5선승 ]
1. [에티] 나    린Z (패) vs  (승) 꼬    니P
2. [라데]  소    심T (승)  vs (패) 뚜    미T
7. [에티] 쟈    닌Z () vs () 다라츄Z
최종 결과
JSA 5대1 승
"""


def self_check():
    sets, teams, final, _ = parse(SAMPLE)
    assert len(sets) == 3, sets
    assert sets[0] == {"map": "애티튜드", "left": "나린", "right": "꼬니", "winner": "right"}, sets[0]
    assert sets[1]["winner"] == "left" and sets[1]["right"] == "뚜미", sets[1]
    # 안 치른 세트는 승자가 없다 — 여기서 아무나 이긴 것으로 만들면 점수가 부풀어 오른다
    assert sets[2]["winner"] is None, sets[2]
    assert teams == ["JSA", "BGM"], teams
    assert final.groups() == ("JSA", "5", "1"), final.groups()
    # 잘린 이름은 유일할 때만 편다
    rows = [{"left": "꼬니", "right": "백원이", "map": "", "winner": None}]
    assert not resolve_names(rows, {"꼬니부깅", "백원이야"}) and rows[0]["left"] == "꼬니부깅", rows
    # 후보가 여럿이면 '결과' 글이 먼저, '리뷰'(이미지) 글이 꼴찌여야 한다
    listing = [
        ("1", "[ K-중만컵 ] BGM vs JSA 리뷰(결과+조별순위+NEXT)"),
        ("2", "[K-중만컵] JSA vs BGM B조 3경기 결과"),
        ("3", "[중장전] 이제동Z vs 김택용P 경기 결과"),
    ]
    assert [s for s, _ in pick_candidates(listing, ["bgm", "jsa"])] == ["2", "1"], pick_candidates(listing, ["bgm", "jsa"])
    print("self-check ok")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("srl", nargs="?", help="글 번호 또는 URL")
    ap.add_argument("--find", nargs="+", metavar="말", help='제목으로 찾기. 예: --find BGM JSA')
    ap.add_argument("--pages", type=int, default=2, help="--find가 뒤질 목록 페이지 수 (기본 2 ≈ 나흘치)")
    ap.add_argument("--file", help="받아둔 HTML 파일로 파싱")
    ap.add_argument("--self-check", action="store_true")
    args = ap.parse_args()

    if args.self_check:
        return self_check()
    if not (args.srl or args.file or args.find):
        ap.error("글 번호, --find, --file 중 하나는 있어야 한다")

    # 후보를 순서대로 열어 본다. 결과가 이미지뿐인 글은 세트가 안 나오니 다음 후보로 넘어간다
    candidates = []
    if args.find:
        candidates = pick_candidates(list_posts(args.pages), args.find)
        if not candidates:
            print(f"'{' '.join(args.find)}' 로 찾은 글이 없다. --pages 를 늘려봐라.", file=sys.stderr)
            return 1
        print(f"후보 {len(candidates)}건:", file=sys.stderr)
        for srl, title in candidates:
            print(f"  {srl}  {title}", file=sys.stderr)

    sets = []
    for attempt, (srl, title) in enumerate(candidates[:3] or [(args.srl, "")]):
        if attempt:
            time.sleep(11)
        raw = io.open(args.file, encoding="utf-8").read() if args.file else fetch(srl)
        sets, teams, final, warnings = parse(body_text(raw))
        if sets:
            if args.find:
                print(f"-> {srl} {title}", file=sys.stderr)
            break
        print(f"세트 없음(결과가 이미지인 글): {srl} {title}", file=sys.stderr)
    if not sets:
        print("세트를 못 찾았다. '리뷰' 글이면 결과가 이미지라 파싱이 안 된다.", file=sys.stderr)
        return 1

    with urllib.request.urlopen(PLAYERS_URL, timeout=30) as res:
        payload = json.loads(res.read().decode("utf-8"))
    # 배열로 줄 때도, {players: [...]}로 감쌀 때도 있다
    rows = payload if isinstance(payload, list) else payload.get("players") or payload.get("data") or []
    roster = {p["name"] for p in rows if isinstance(p, dict) and p.get("name")}
    if not roster:
        print("선수 목록을 못 읽었다 — 이름 대조 없이는 넣지 마라.", file=sys.stderr)
        return 1
    unmatched = resolve_names(sets, roster)

    won = {"left": sum(s["winner"] == "left" for s in sets), "right": sum(s["winner"] == "right" for s in sets)}
    out = {
        "teams": {"left": teams[0] if teams else None, "right": teams[1] if len(teams) > 1 else None},
        "score": won,
        "sets": sets,
        "unmatched": unmatched,
        "warnings": warnings,
    }
    # 글이 적은 최종 스코어와 세트 승수를 대조한다. 어긋나면 파싱이 샌 것이다
    if final:
        said = sorted((int(final.group(2)), int(final.group(3))))
        if said != sorted(won.values()):
            out["warnings"].append(f"글의 최종 결과 {final.group(2)}:{final.group(3)} 와 세트 승수 {won} 가 다르다")
    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
