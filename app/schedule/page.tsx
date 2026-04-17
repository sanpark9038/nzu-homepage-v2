
import { playerService } from "@/lib/player-service";
import { buildTournamentPredictionMatches } from "@/lib/tournament-prediction";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

export const revalidate = 300;

export const metadata = {
  title: "HOSAGA - 대회 일정",
  description: "호사가 HOSAGA 대회 경기 일정 및 상태 안내",
};

function getMatchStatus(startAt: string, lockAt: string) {
  const now = new Date();
  const start = new Date(startAt);
  const lock = new Date(lockAt);

  if (now >= start) {
    return { label: "마감", color: "bg-red-500/10 text-red-500 border-red-500/20" };
  }
  if (now >= lock) {
    return { label: "마감 임박", color: "bg-orange-500/10 text-orange-500 border-orange-500/20" };
  }
  return { label: "투표 중", color: "bg-nzu-green/10 text-nzu-green border-nzu-green/20" };
}

function toKstDate(dateLike: string | Date) {
  const date = typeof dateLike === "string" ? new Date(dateLike) : dateLike;
  return new Date(date.getTime() + 9 * 60 * 60 * 1000);
}

export default async function SchedulePage() {
  const players = await playerService.getCachedPlayersList();
  const matches = buildTournamentPredictionMatches(players);

  // 날짜별로 그룹화
  const groupedMatches: Record<string, typeof matches> = {};
  matches.forEach((m) => {
    const dateKey = format(toKstDate(m.startAt), "yyyy-MM-dd");
    if (!groupedMatches[dateKey]) groupedMatches[dateKey] = [];
    groupedMatches[dateKey].push(m);
  });

  const sortedDates = Object.keys(groupedMatches).sort();

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto w-full max-w-3xl px-4 py-16">
        <header className="mb-12 text-center">
          <h1 className="text-5xl font-black tracking-tighter uppercase italic mb-2">
            Match <span className="gradient-text">Schedule</span>
          </h1>
          <p className="text-muted-foreground text-sm font-medium tracking-wide">공식 경기 일정 안내</p>
        </header>

        <div className="space-y-12">
          {sortedDates.length === 0 ? (
            <div className="text-center py-20 border border-dashed border-border/40 rounded-[2rem] bg-muted/5">
              <p className="text-muted-foreground text-sm">예정된 경기가 없습니다.</p>
            </div>
          ) : (
            sortedDates.map((date) => (
              <section key={date} className="relative">
                <div className="sticky top-20 z-10 mb-6">
                  <div className="inline-flex items-center gap-3 px-4 py-2 bg-card/80 backdrop-blur-xl border border-border/40 rounded-full shadow-sm">
                    <span className="text-sm font-black text-nzu-green">
                      {format(new Date(date), "MM.dd", { locale: ko })}
                    </span>
                    <span className="w-1 h-1 bg-border rounded-full" />
                    <span className="text-xs font-bold text-muted-foreground uppercase">
                      {format(new Date(date), "EEEE", { locale: ko })}
                    </span>
                  </div>
                </div>

                <div className="space-y-4">
                  {groupedMatches[date].map((match) => {
                    const status = getMatchStatus(match.startAt, match.lockAt);
                    return (
                      <div
                        key={match.id}
                        className="group relative bg-card/40 border border-border/40 rounded-3xl p-6 transition-all hover:bg-card/60 hover:border-nzu-green/30"
                      >
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                          <div className="flex items-center gap-6">
                            <div className="text-2xl font-black tracking-tighter text-muted-foreground/50 group-hover:text-nzu-green/50 transition-colors">
                              {format(toKstDate(match.startAt), "HH:mm")}
                            </div>
                            <div>
                              <div className="text-[10px] font-black text-nzu-green uppercase tracking-widest mb-1 opacity-70">
                                {match.title}
                              </div>
                              <div className="flex items-center gap-3 text-lg font-bold tracking-tight">
                                <span className="text-foreground">{match.teamA.teamName}</span>
                                <span className="text-[10px] text-muted-foreground font-black uppercase opacity-30 italic">VS</span>
                                <span className="text-foreground">{match.teamB.teamName}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-end">
                            <span
                              className={`px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider border ${status.color}`}
                            >
                              {status.label}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>

        <footer className="mt-20 pt-8 border-t border-border/10 text-center">
          <p className="text-[10px] text-muted-foreground/40 uppercase font-black tracking-[0.2em]">
            모든 경기 시간은 한국(KST) 기준이며, 현지 상황에 따라 변경될 수 있습니다.
          </p>
        </footer>
      </main>
    </div>
  );
}
