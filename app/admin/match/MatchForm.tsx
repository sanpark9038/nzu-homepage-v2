
"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import type { Player } from "@/lib/player-service";

export function MatchForm({ players }: { players: Player[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    player1_id: "",
    player2_id: "",
    winner_id: "",
    map_name: "",
    event_name: "NZU 대학대전",
    match_date: new Date().toISOString().split('T')[0],
    is_university_battle: true
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSuccess(false);

    try {
      const { error } = await supabase
        .from('matches')
        .insert([formData]);

      if (error) throw error;
      
      setSuccess(true);
      setFormData({
        ...formData,
        player1_id: "",
        player2_id: "",
        winner_id: "",
        map_name: ""
      });
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      alert("전적 등록 중 오류 발생: " + message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        {/* 선수 1 */}
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Player 1 (Left)</label>
          <select 
            required
            value={formData.player1_id}
            onChange={(e) => setFormData({...formData, player1_id: e.target.value})}
            className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm focus:border-nzu-green outline-none transition-all"
          >
            <option value="">선수 선택</option>
            {players.map(p => <option key={p.id} value={p.id}>{p.name} ({p.race})</option>)}
          </select>
        </div>

        {/* 선수 2 */}
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Player 2 (Right)</label>
          <select 
            required
            value={formData.player2_id}
            onChange={(e) => setFormData({...formData, player2_id: e.target.value})}
            className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm focus:border-nzu-green outline-none transition-all"
          >
            <option value="">선수 선택</option>
            {players.map(p => <option key={p.id} value={p.id}>{p.name} ({p.race})</option>)}
          </select>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* 승자 */}
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Winner</label>
          <select 
            required
            value={formData.winner_id}
            onChange={(e) => setFormData({...formData, winner_id: e.target.value})}
            className="w-full bg-nzu-green/5 border border-nzu-green/30 rounded-xl px-4 py-3 text-sm focus:border-nzu-green outline-none transition-all text-nzu-green font-bold"
          >
            <option value="">승자 선택</option>
            {formData.player1_id && (
              <option value={formData.player1_id}>{players.find(p => p.id === formData.player1_id)?.name} (Player 1)</option>
            )}
            {formData.player2_id && (
              <option value={formData.player2_id}>{players.find(p => p.id === formData.player2_id)?.name} (Player 2)</option>
            )}
          </select>
        </div>

        {/* 맵 이름 */}
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Map Name</label>
          <input 
            type="text"
            required
            placeholder="예: 투혼, 서킷브레이커"
            value={formData.map_name}
            onChange={(e) => setFormData({...formData, map_name: e.target.value})}
            className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm focus:border-nzu-green outline-none transition-all"
          />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* 대회명 */}
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Event Name</label>
          <input 
            type="text"
            value={formData.event_name}
            onChange={(e) => setFormData({...formData, event_name: e.target.value})}
            className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm focus:border-nzu-green outline-none transition-all"
          />
        </div>

        {/* 날짜 */}
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Match Date</label>
          <input 
            type="date"
            value={formData.match_date}
            onChange={(e) => setFormData({...formData, match_date: e.target.value})}
            className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm focus:border-nzu-green outline-none transition-all"
          />
        </div>
      </div>

      <div className="pt-4">
        <button 
          disabled={loading}
          type="submit"
          className="w-full py-4 bg-nzu-green text-white font-black uppercase tracking-widest rounded-2xl hover:bg-nzu-green-dim transition-all shadow-lg shadow-nzu-green/20 disabled:opacity-50"
        >
          {loading ? "등록 중..." : "전적 등록하기"}
        </button>
      </div>

      {success && (
        <div className="p-4 bg-nzu-green/10 border border-nzu-green/30 rounded-xl text-nzu-green text-sm font-bold text-center animate-bounce">
          ✓ 전적이 성공적으로 등록되었습니다!
        </div>
      )}
    </form>
  );
}
