export function isVercelDeployment(): boolean {
  return (
    process.env.VERCEL === "1" ||
    Boolean(process.env.VERCEL_ENV) ||
    Boolean(process.env.VERCEL_URL)
  );
}

export function isAdminWriteDisabled(): boolean {
  if (String(process.env.ALLOW_VERCEL_ADMIN_WRITES || "").trim().toLowerCase() === "true") {
    return false;
  }
  return isVercelDeployment();
}

export function getAdminWriteDisabledMessage(feature = "이 관리자 기능"): string {
  return `${feature}은 Vercel 배포 환경에서 읽기 전용입니다. 수정이나 실행 작업은 로컬 또는 GitHub Actions 운영 경로에서 진행해주세요.`;
}
