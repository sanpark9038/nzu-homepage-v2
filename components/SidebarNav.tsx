"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { playerService } from "@/lib/player-service";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/ThemeProvider";
import { 
  Play,
  Compass,
  User,
  Gamepad2,
  ShoppingBag,
  BarChart3,
  Calendar,
  Settings,
  Menu,
  ChevronRight,
  ChevronLeft,
  PanelLeftClose,
} from "lucide-react";

const featureItems = [
  { id: 'live',    label: 'LIVE',     icon: Play, color: 'text-nzu-live' },
  { id: 'explore', label: 'EXPLORE',  icon: Compass },
  { id: 'my',      label: 'MY',       icon: User },
  { id: 'esports', label: 'E-SPORTS', icon: Gamepad2 },
  { id: 'store',   label: 'STORE',    icon: ShoppingBag },
  { id: 'stats',   label: 'STATS',    icon: BarChart3 },
  { id: 'events',  label: 'EVENTS',   icon: Calendar },
];

export default function SidebarNav() {
  const [liveCount, setLiveCount] = useState(0);
  const { theme, toggleTheme } = useTheme();
  const pathname = usePathname();
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
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
    const interval = setInterval(fetchLiveCount, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-width', isExpanded ? '256px' : '80px');
  }, [isExpanded]);

  return (
    <aside 
      className={cn(
        "fixed left-0 top-0 h-screen bg-card/40 backdrop-blur-3xl border-r border-white/5 transition-all duration-500 z-[100] flex flex-col",
        isExpanded ? "w-64" : "w-20"
      )}
    >
      {/* Header Area: Toggle ONLY - FIXED POSITION */}
      <div className="h-16 flex items-center w-full border-b border-white/5">
        {/* Fixed 80px Container to keep toggle consistently centered at the start of the sidebar */}
        <div className="w-20 flex items-center justify-center shrink-0">
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className={cn(
              "p-2.5 rounded-xl transition-all duration-300",
              isExpanded 
                ? "text-foreground/20 hover:text-nzu-green hover:bg-white/5" 
                : "bg-nzu-green/10 text-nzu-green hover:bg-nzu-green hover:text-black"
            )}
            title={isExpanded ? "사이드바 접기" : "사이드바 펼치기"}
          >
            <Menu size={22} strokeWidth={2.5} />
          </button>
        </div>
      </div>



      {/* Features Tray */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-6 custom-scrollbar">
        <nav className="space-y-4">
          {featureItems.map((item) => {
            const Icon = item.icon;
            const isLiveItem = item.id === 'live';

            return (
              <button
                key={item.id}
                className={cn(
                  "w-full flex items-center gap-4 px-3 py-3 rounded-xl transition-all duration-300 group relative",
                  "text-foreground/40 hover:text-foreground hover:bg-white/5"
                )}
              >
                <div className={cn("transition-transform group-hover:scale-110", item.color)}>
                  <Icon size={22} strokeWidth={2} />
                </div>
                {isExpanded && (
                  <span className="text-[11px] font-black tracking-widest whitespace-nowrap fade-in">{item.label}</span>
                )}

                {isLiveItem && liveCount > 0 && (
                  <div className={cn(
                    "flex items-center gap-1.5",
                    isExpanded ? "ml-auto" : "absolute top-2 right-2"
                  )}>
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-nzu-live opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-nzu-live"></span>
                    </span>
                    {isExpanded && <span className="text-[10px] text-nzu-live font-black">{liveCount}</span>}
                  </div>
                )}

                {!isExpanded && (
                  <div className="absolute left-full ml-4 px-3 py-1.5 bg-foreground text-background text-[10px] font-black rounded-md opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-[200] whitespace-nowrap">
                    {item.label}
                  </div>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Actions */}
      <div className="p-3 border-t border-white/5">
        <button className="w-full h-12 flex items-center justify-center rounded-xl text-foreground/20 hover:text-foreground hover:bg-white/5 transition-all">
          <Settings size={20} />
        </button>
      </div>
    </aside>
  );
}
