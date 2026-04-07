"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type PlayerSearchFormProps = {
  initialQuery?: string;
};

export default function PlayerSearchForm({ initialQuery = "" }: PlayerSearchFormProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      router.push("/player");
      return;
    }
    router.push(`/player?query=${encodeURIComponent(trimmed)}`);
  }

  return (
    <form className="mx-auto mt-5 flex w-full max-w-5xl flex-col gap-2.5 md:flex-row xl:max-w-6xl" onSubmit={handleSubmit}>
      <input
        type="text"
        name="query"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="선수 이름을 입력하세요"
        className="h-[56px] flex-1 rounded-[1.15rem] border border-white/10 bg-[#0a1112]/88 px-5 text-[1rem] font-[1000] tracking-tight text-white placeholder:text-white/14 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-all focus:border-nzu-green/40 focus:outline-none md:h-[58px] md:text-[1.04rem] xl:h-[60px] xl:text-[1.06rem]"
      />
      <button
        type="submit"
        className="h-[56px] shrink-0 rounded-[1.15rem] border border-nzu-green/20 bg-nzu-green/[0.08] px-6 text-[0.98rem] font-[1000] tracking-tight text-nzu-green transition-all hover:border-nzu-green/40 hover:bg-nzu-green/[0.14] hover:text-white md:h-[58px] md:w-[132px] md:text-[1rem] xl:h-[60px] xl:w-[140px]"
      >
        검색
      </button>
    </form>
  );
}
