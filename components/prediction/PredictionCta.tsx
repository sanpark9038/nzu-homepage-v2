import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * 승부예측으로 보내는 공용 버튼. /jungman 커버와 /asl 커버가 같은 옷을 입는다 —
 * 스타일을 두 벌로 적으면 한쪽만 고쳐져 조용히 어긋난다.
 * 사이트 안 이동이라 <a>가 아니라 Link다 — <a>로 나가면 페이지를 통째로 다시 받는다.
 */
export function PredictionCta({ className }: { className?: string }) {
  return (
    <Link
      href="/prediction"
      className={cn(
        "inline-flex min-h-8 shrink-0 items-center gap-1 self-start rounded-full bg-nzu-green px-3 text-[0.6875rem] font-black text-black md:text-xs",
        className
      )}
    >
      승부예측 <span aria-hidden>→</span>
    </Link>
  );
}
