"use client";

import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { ChevronUp } from "lucide-react";
import { isChromelessRoute } from "@/lib/navigation-config";
import { cn } from "@/lib/utils";

export function ScrollToTop() {
  const pathname = usePathname();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const container = document.getElementById("main-scroll-container");
    if (!container) return;

    const toggleVisibility = () => {
      if (container.scrollTop > 300) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    container.addEventListener("scroll", toggleVisibility);
    return () => container.removeEventListener("scroll", toggleVisibility);
  }, []);

  const scrollToTop = () => {
    const container = document.getElementById("main-scroll-container");
    if (container) {
      container.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    }
  };

  // 오버레이·임베드는 화면 자체가 결과물이다 — 떠 있는 버튼이 끼면 안 된다
  if (isChromelessRoute(pathname)) return null;

  return (
    <button
      onClick={scrollToTop}
      className={cn(
        "fixed bottom-8 right-8 z-[150] p-4 rounded-2xl bg-nzu-green text-black transition-all duration-300 shadow-2xl shadow-nzu-green/20 hover:scale-110 active:scale-95 group",
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10 pointer-events-none"
      )}
      title="상단으로 이동"
    >
      <ChevronUp size={24} strokeWidth={3} className="group-hover:-translate-y-1 transition-transform" />
      <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-foreground text-background text-[10px] font-black rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
        TOP
      </span>
    </button>
  );
}
