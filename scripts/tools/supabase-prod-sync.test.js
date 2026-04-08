const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");

const ROOT = path.join(__dirname, "..", "..");
const TMP_DIR = path.join(ROOT, "tmp");

const {
  parseMatchHistoryFromStableCsv,
} = require("./supabase-prod-sync");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function writeStableCsv(fileName, rows) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const filePath = path.join(TMP_DIR, fileName);
  const header = ["날짜", "상대명", "상대종족", "맵", "경기결과(승/패)", "메모"];
  const lines = [
    header.join(","),
    ...rows.map((row) => row.join(",")),
  ];
  fs.writeFileSync(filePath, "\uFEFF" + lines.join("\n"), "utf8");
  return filePath;
}

runTest("parseMatchHistoryFromStableCsv preserves same-day row order from stable csv", () => {
  const fileName = "__test__eloboard_female_808_주하랑_상세전적.csv";
  try {
    writeStableCsv(fileName, [
      ["2026-03-05", "라운이", "P", "네오실피드", "패", "5/3(4)"],
      ["2026-03-02", "비재희", "Z", "라데온", "패", "단판 유이 승"],
      ["2026-03-01", "유이", "T", "라데온", "패", "단판 유이 승"],
      ["2026-03-01", "강덕구", "T", "라데온", "패", "3/2(3)"],
      ["2026-03-01", "강덕구", "T", "폴리포이드", "승", "3/2(2)"],
      ["2026-03-01", "강덕구", "T", "네오실피드", "패", "3/2(1)"],
    ]);

    const actual = parseMatchHistoryFromStableCsv(fileName);
    assert.deepEqual(
      actual.filter((row) => row.match_date === "2026-03-01").map((row) => `${row.opponent_name}|${row.map_name}|${row.note}`),
      [
        "유이|라데온|단판 유이 승",
        "강덕구|라데온|3/2(3)",
        "강덕구|폴리포이드|3/2(2)",
        "강덕구|네오실피드|3/2(1)",
      ]
    );
  } finally {
    try {
      fs.unlinkSync(path.join(TMP_DIR, fileName));
    } catch {}
  }
});
