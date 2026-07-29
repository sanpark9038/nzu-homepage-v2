"use client";

import { useEffect } from "react";

/**
 * 부모 문서가 iframe 높이를 내용에 맞출 수 있게 알려준다. 안 들어도 그만이라 부모 코드는 선택이다.
 * 전역 레이아웃이 h-screen이라 document.body는 항상 뷰포트 높이다 — 임베드 루트를 직접 잰다.
 * (서버 컴포넌트에 인라인 <script>를 박는 방법은 못 쓴다 — React가 초기 HTML에 내보내지 않아 실행되지 않는다)
 */
export function JungmanEmbedHeight({ targetId }: { targetId: string }) {
  useEffect(() => {
    const element = document.getElementById(targetId);
    // 최상위 창에서 열면 보낼 부모가 없다
    if (!element || window.parent === window) return;

    let last = 0;
    const send = () => {
      const height = Math.ceil(element.getBoundingClientRect().height);
      if (!height || height === last) return;
      last = height;
      window.parent.postMessage({ type: "jungman-embed-height", height }, "*");
    };

    const observer = new ResizeObserver(send);
    observer.observe(element);
    send();

    return () => observer.disconnect();
  }, [targetId]);

  return null;
}
