import { existsSync } from "node:fs";
import path from "node:path";

import { jungmanLogoPath } from "@/lib/jungman";

/**
 * 404난 <image>/<img>는 브라우저가 깨진 아이콘을 그린다 — 파일이 실제로 있을 때만 로고를 렌더한다.
 * fs를 쓰므로 서버 컴포넌트 전용. 클라이언트 조각(보드)은 이 결과를 props로 받는다.
 */
export function jungmanLogoSrc(code: string): string | null {
  const src = jungmanLogoPath(code);
  return existsSync(path.join(process.cwd(), "public", src)) ? src : null;
}
