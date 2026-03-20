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
    <header className="sticky top-0 z-[100] w-full border-b border-white/5 bg-[#050706]/80 backdrop-blur-xl">
      <div className="w-full px-12 h-20 flex items-center justify-between">

        {/* 로고: N.Z.U (대표님 안목 반영) */}
        <Link href="/" className="flex items-center gap-4 group">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-nzu-green flex items-center justify-center text-[15px] font-black text-white shadow-[0_0_20px_rgba(46,213,115,0.2)] group-hover:shadow-[0_0_30px_rgba(46,213,115,0.5)] group-hover:scale-110 transition-all duration-500">
              N
            </div>
            <div className="absolute -inset-1 bg-nzu-green/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
          </div>
          <div className="flex flex-col">
            <span className="font-black text-xl tracking-tighter text-white italic leading-none">
              N.Z.U
            </span>
            <span className="text-[10px] font-bold text-nzu-green/60 tracking-[0.3em] uppercase mt-1">
              늪지대 유니버시티
            </span>
          </div>
        </Link>

        {/* 네비게이션 */}
        <nav className="flex items-center gap-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const isLive = item.href === '/live';
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative px-6 py-2.5 rounded-2xl text-[11px] font-black transition-all duration-300 tracking-widest uppercase flex items-center gap-2",
                  isActive
                    ? "text-nzu-green bg-nzu-green/10 shadow-[inset_0_0_20px_rgba(46,213,115,0.05)] border border-nzu-green/20"
                    : "text-white/40 hover:text-white hover:bg-white/[0.03]"
                )}
              >
                {item.label}
                {isLive && liveCount > 0 && (
                  <div className="flex items-center gap-1.5 ml-1">
                     <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-nzu-live opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-nzu-live"></span>
                     </span>
                     <span className="text-[9px] text-nzu-live tabular-nums">{liveCount}</span>
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
