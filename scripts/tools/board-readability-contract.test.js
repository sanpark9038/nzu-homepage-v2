const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..", "..");

function readProjectFile(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), "utf8");
}

test("board list avoids internal reference and placeholder copy", () => {
  const boardPage = readProjectFile("app/board/page.tsx");

  for (const text of ["FMKorea", "TABLE BOARD MVP", "No Posts Yet", "추천수와 댓글수"]) {
    assert.equal(boardPage.includes(text), false, `${text} should not be visible on the board list`);
  }
});

test("board write page keeps introduction concise", () => {
  const writePage = readProjectFile("app/board/write/page.tsx");

  for (const text of ["심플한 게시판 폼", "SOOP Login Required", "무거운 에디터", "게시글 읽기는 모두에게"]) {
    assert.equal(writePage.includes(text), false, `${text} should not be visible on the write page`);
  }
});

test("board composer content field has a programmatic label", () => {
  const composer = readProjectFile("components/board/BoardPostComposer.tsx");

  assert.match(composer, /<label htmlFor="board-post-content"/);
  assert.match(composer, /id="board-post-content"/);
});
