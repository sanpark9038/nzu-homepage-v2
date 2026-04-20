import { TournamentTeamsView } from "@/components/home/TournamentTeamsView";

export const revalidate = 60;

export const metadata = {
  title: "HOSAGA - 참가팀",
  description: "대회 참가팀 구성과 선수 명단을 빠르게 확인하는 페이지",
};

export default async function TeamsPage({
  searchParams,
}: {
  searchParams?: Promise<{ team?: string }>;
}) {
  const params = searchParams ? await searchParams : undefined;

  return <TournamentTeamsView selectedTeamCode={String(params?.team || "").trim()} basePath="/teams" />;
}
