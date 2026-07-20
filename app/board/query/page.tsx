import {
  getCachedBoardPostsWithCommentCounts,
  normalizeBoardListFilter,
  normalizeBoardPage,
  normalizeBoardSearchQuery,
  searchBoardPostsWithCommentCounts,
} from "@/lib/board";

import { BoardPageContent } from "../page";

export const runtime = "nodejs";
export const revalidate = 0;
export const dynamic = "force-dynamic";

export default async function BoardQueryPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = ((await searchParams) || {}) as Record<string, string | string[] | undefined>;
  const boardFilter = normalizeBoardListFilter(params.filter);
  const page = normalizeBoardPage(params.page);
  const searchQuery = normalizeBoardSearchQuery(params.q);
  const board = searchQuery
    ? await searchBoardPostsWithCommentCounts(searchQuery, 20, page)
    : await getCachedBoardPostsWithCommentCounts(20, boardFilter, page);
  const loginStatus = typeof params.login === "string" ? params.login : "";
  const downloadStatus = typeof params.download === "string" ? params.download : "";

  return (
    <BoardPageContent
      board={board}
      boardFilter={boardFilter}
      page={page}
      loginStatus={loginStatus}
      downloadStatus={downloadStatus}
      searchQuery={searchQuery}
    />
  );
}
