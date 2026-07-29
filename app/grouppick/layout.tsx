// 방송 1회성 예측 페이지 — 검색엔진에 남을 이유가 없다
export const metadata = {
  robots: { index: false, follow: false },
};

export default function GroupPickLayout({ children }: { children: React.ReactNode }) {
  return children;
}
