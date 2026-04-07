"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { visibleNavbarLinks } from "@/lib/navigation-config";

import { User, Grid } from "lucide-react";

export default function Navbar() {
  const pathname = usePathname();

  return (

    <header className="sticky top-0 z-[100] w-full border-b border-white/5 bg-background/60 backdrop-blur-3xl transition-all duration-300">
      <div className="flex h-16 w-full items-center justify-between gap-8 px-8">
        {/* --- Left Brand Logo (Text Only) --- */}
        <Link href="/" className="flex items-center group shrink-0">
          <span className="text-xl font-black text-white tracking-tighter group-hover:text-nzu-green transition-colors duration-300">
            N.Z.U
          </span>
        </Link>

        {/* --- Center: Main Navigation --- */}
        <nav className="flex flex-1 items-center justify-center gap-2">
          {visibleNavbarLinks.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative px-6 py-2 rounded-full text-[14px] font-black transition-all duration-300 tracking-tight flex items-center gap-2",
                  isActive
                    ? "text-nzu-green bg-nzu-green/10"
                    : "text-foreground/40 hover:text-foreground hover:bg-white/5"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* --- Right: Utils --- */}
        <div className="flex items-center gap-4 text-foreground/40">
           <div className="mx-2 h-6 w-[1px] bg-white/10" />
           <button className="flex items-center gap-2 px-4 py-2 hover:bg-white/5 rounded-lg text-sm font-black text-foreground transition-all">
              <User size={18} />
              <span>LOGIN</span>
           </button>
           <button className="p-2 hover:bg-white/5 rounded-lg hover:text-foreground transition-all"><Grid size={20} /></button>
        </div>

      </div>
    </header>
  );
}
