
import Image from "next/image";
import Link from "next/link";
import { LiveBadge, RaceTag, type Race } from "../ui/nzu-badges";

export interface LiveStream {
  id: string;
  streamer_name: string;
  photo_url: string;
  stream_title: string;
  viewer_count: number;
  category: string;
  race: string;
  soop_url: string;
  thumbnail_url?: string;
}

export function LiveStreamCard({ stream }: { stream: LiveStream }) {
  return (
    <div className="group relative bg-card rounded-2xl border border-border/40 overflow-hidden hover:border-nzu-green/40 transition-all duration-300 hover:shadow-[0_0_20px_rgba(0,168,107,0.1)]">
      {/* 썸네일 영역 (SOOP 공식 이미지 느낌) */}
      <div className="relative aspect-video bg-muted/20 overflow-hidden">
        {stream.thumbnail_url ? (
          <Image 
            src={stream.thumbnail_url} 
            alt={stream.stream_title} 
            fill 
            className="object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-nzu-green/5 to-card">
            <span className="text-nzu-green/20 font-black text-2xl italic">HOSAGA LIVE</span>
          </div>
        )}
        
        {/* 상단 오버레이 (시청자 수 + 라이브 배지) */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5">
           <LiveBadge />
           <div className="px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-md text-[10px] font-bold text-white flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-slate-300" />
              {stream.viewer_count.toLocaleString()}
           </div>
        </div>

        {/* 하단 타이틀 오버레이 */}
        <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
           <h3 className="text-sm font-bold text-white line-clamp-1 group-hover:text-nzu-green transition-colors">
              {stream.stream_title}
           </h3>
        </div>
      </div>

      {/* 스트리머 정보 영역 */}
      <div className="p-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative w-8 h-8 rounded-full border border-border/60 overflow-hidden flex-shrink-0">
            <Image src={stream.photo_url} alt={stream.streamer_name} fill className="object-cover object-top" />
          </div>
          <div className="flex flex-col min-w-0">
             <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-foreground truncate">{stream.streamer_name}</span>
                <RaceTag race={stream.race as Race} size="xs" />
             </div>
             <span className="text-[10px] text-muted-foreground uppercase tracking-tight">{stream.category}</span>
          </div>
        </div>
        
        <Link 
          href={stream.soop_url} 
          target="_blank"
          className="px-3 py-1.5 rounded-lg bg-nzu-green/10 text-nzu-green text-[10px] font-bold hover:bg-nzu-green hover:text-white transition-all whitespace-nowrap"
        >
          입장하기
        </Link>
      </div>
    </div>
  );
}
