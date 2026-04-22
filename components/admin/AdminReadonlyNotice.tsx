type Props = {
  className?: string;
  title?: string;
  body?: string;
};

export function AdminReadonlyNotice({
  className = "",
  title = "읽기 전용 모드",
  body = "현재 배포 환경에서는 관리자 쓰기 기능이 비활성화되어 있습니다. 실제 수정이나 실행 작업은 로컬 또는 별도 운영 경로에서 진행해주세요.",
}: Props) {
  return (
    <div
      className={`rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 ${className}`.trim()}
    >
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-amber-50/80">{body}</p>
    </div>
  );
}
