"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { playerService } from "@/lib/player-service";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/",       label: "홈" },
  { href: "/live",   label: "라이브" },
  { href: "/tier",   label: "티어표" },
  { href: "/entry",  label: "엔트리" },
  { href: "/players",label: "선수" },
  { href: "/admin/match", label: "어드민" },
];

export default function Navbar() {
  const [liveCount, setLiveCount] = useState(0);
  const pathname = usePathname();

  useEffect(() => {
    // Proactively fetch live player count for the pulse indicator
    const fetchLiveCount = async () => {
      try {
        const players = await playerService.getAllPlayers();
        const count = players.filter(p => p.is_live).length;
        setLiveCount(count);
      } catch (err) {
        console.error("Failed to fetch live count:", err);
      }
    };
    fetchLiveCount();
    const interval = setInterval(fetchLiveCount, 60000); // 1-minute sync
    return () => clearInterval(interval);
  }, []);

  return (

    <header className="sticky top-0 z-[100] w-full border-b border-white/5 bg-[#050706]/90 backdrop-blur-2xl">
      <div className="w-full px-16 h-24 flex items-center justify-between">

        {/* 로고: N.Z.U (대표님 안목 반영 - 훨씬 더 웅장하게) */}
        <Link href="/" className="flex items-center gap-6 group">
          <div className="relative">
            <div className="w-14 h-14 rounded-2xl bg-nzu-green flex items-center justify-center text-[22px] font-black text-white shadow-[0_0_25px_rgba(46,213,115,0.3)] group-hover:shadow-[0_0_40px_rgba(46,213,115,0.6)] group-hover:scale-110 transition-all duration-500">
              N
            </div>
            <div className="absolute -inset-2 bg-nzu-green/20 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
          </div>

          <div className="flex flex-col gap-0.5">
            <span className="font-black text-3xl tracking-tighter text-white leading-tight">
              N.Z.U
            </span>
            <span className="text-[14px] font-black text-nzu-green tracking-[0.2em] uppercase opacity-80">
              늪지대 유니버시티
            </span>
          </div>
        </Link>

        {/* 네비게이션: 시원시원하고 큼직하게 */}
        <nav className="flex items-center gap-4">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const isLive = item.href === '/live';
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative px-8 py-3.5 rounded-2xl text-[17px] font-black transition-all duration-300 tracking-wider uppercase flex items-center gap-2",
                  isActive
                    ? "text-nzu-green bg-nzu-green/10 shadow-[inset_0_0_30px_rgba(46,213,115,0.08)] border border-nzu-green/30 px-10 ring-1 ring-nzu-green/10"
                    : "text-white/50 hover:text-white hover:bg-white/[0.05]"
                )}
              >
                {item.label}
                {isLive && liveCount > 0 && (
                  <div className="flex items-center gap-1.5 ml-1">
                     <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-nzu-live opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-nzu-live"></span>
                     </span>
                     <span className="text-[12px] text-nzu-live tabular-nums font-bold">{liveCount}</span>
                  </div>
                )}
              </Link>
            );
          })}
        </nav>

      </div>
    </header>
  );
}
