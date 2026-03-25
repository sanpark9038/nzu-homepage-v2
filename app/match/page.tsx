'use client'

import React, { useState, useEffect } from 'react'
import { Plus, X, Sparkles, GripVertical, ArrowLeftRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { RaceLetterBadge } from "@/components/ui/race-letter-badge"
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'

// --- Types ---
interface Player {
  id: string;
  name: string;
  race: string;
}

interface MatchRow {
  id: string;
  p1: Player | null;
  p2: Player | null;
  p1Input: string;
  p2Input: string;
}

function normalizeRaceCode(race: string) {
  const raw = String(race || '').trim().toUpperCase();
  if (!raw) return 'R';
  if (raw.startsWith('T')) return 'T';
  if (raw.startsWith('Z')) return 'Z';
  if (raw.startsWith('P')) return 'P';
  return 'R';
}

function raceToneClasses(race: string, side: 1 | 2) {
  const raceCode = normalizeRaceCode(race);
  const base = side === 1
    ? "focus-within:border-nzu-green/40"
    : "focus-within:border-red-500/30";

  if (raceCode === 'T') {
    return side === 1
      ? "border-blue-500/40 bg-blue-500/[0.05] shadow-[inset_0_0_0_1px_rgba(59,130,246,0.08)]"
      : "border-blue-500/30 bg-blue-500/[0.04] shadow-[inset_0_0_0_1px_rgba(59,130,246,0.06)]";
  }
  if (raceCode === 'Z') {
    return side === 1
      ? "border-purple-500/40 bg-purple-500/[0.05] shadow-[inset_0_0_0_1px_rgba(168,85,247,0.08)]"
      : "border-purple-500/30 bg-purple-500/[0.04] shadow-[inset_0_0_0_1px_rgba(168,85,247,0.06)]";
  }
  if (raceCode === 'P') {
    return side === 1
      ? "border-yellow-500/40 bg-yellow-500/[0.05] shadow-[inset_0_0_0_1px_rgba(234,179,8,0.08)]"
      : "border-yellow-500/30 bg-yellow-500/[0.04] shadow-[inset_0_0_0_1px_rgba(234,179,8,0.06)]";
  }
  return base;
}

// --- Sortable Item Component ---
interface SortableItemProps {
  row: MatchRow;
  updateRow: (id: string, field: 'p1' | 'p2' | 'p1Input' | 'p2Input', value: any) => void;
  removeRow: (id: string) => void;
  swapPlayers: (id: string) => void;
  allPlayers: Player[];
}

const SortableMatchRow = ({ row, updateRow, removeRow, swapPlayers, allPlayers }: SortableItemProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const [s1, setS1] = useState<Player[]>([]);
  const [s2, setS2] = useState<Player[]>([]);
  const [show1, setShow1] = useState(false);
  const [show2, setShow2] = useState(false);

  const style = { transform: CSS.Translate.toString(transform), transition: transition || 'transform 150ms cubic-bezier(0.2, 0, 0, 1)', zIndex: isDragging ? 50 : 0 };

  const handleSearch = (val: string, side: 1 | 2) => {
    if (!val.trim()) { side === 1 ? (setS1([]), setShow1(false)) : (setS2([]), setShow2(false)); return; }
    const filtered = allPlayers.filter(p => p.name.includes(val)).slice(0, 5);
    side === 1 ? (setS1(filtered), setShow1(filtered.length > 0)) : (setS2(filtered), setShow2(filtered.length > 0));
  };

  const handleInputChange = (side: 1 | 2, value: string) => {
    const selectedPlayer = side === 1 ? row.p1 : row.p2;
    const inputField = side === 1 ? 'p1Input' : 'p2Input';
    const playerField = side === 1 ? 'p1' : 'p2';

    updateRow(row.id, inputField, value);
    if (selectedPlayer && selectedPlayer.name !== value) {
      updateRow(row.id, playerField, null);
    }
    handleSearch(value, side);
  };

  const isConfirmed = row.p1 && row.p2;
  const mockStats = isConfirmed ? { overall: [12, 11], recent: [3, 2] } : null;

  return (
    <div ref={setNodeRef} style={style} className={cn("group relative flex items-center gap-4 bg-white/[0.02] backdrop-blur-xl p-3 pl-1 rounded-[2.5rem] border transition-all", isDragging ? "border-nzu-green/40 shadow-2xl scale-[1.01]" : "border-white/5 hover:border-white/10")}>
      <div {...attributes} {...listeners} className="p-2 text-white/5 hover:text-nzu-green cursor-grab active:cursor-grabbing transition-colors ml-2"><GripVertical size={18} /></div>

      <div className="flex-1 flex items-center justify-center gap-3 w-full">
        
        {/* P1 Section - (Triple-Box Layout for Icon Safety) */}
        <div className="flex-1 relative">
          <div className={cn(
            "relative flex items-center h-[72px] bg-black/40 border border-white/10 rounded-2xl transition-all shadow-sm",
            row.p1 ? raceToneClasses(row.p1.race, 1) : "focus-within:border-nzu-green/40"
          )}>
            {/* 좌측 여백 (균형용) */}
            <div className="w-12 shrink-0 h-full invisible" />
            
            {/* 중앙 입력창 */}
            <input 
              type="text" 
              value={row.p1Input}
              onChange={(e) => handleInputChange(1, e.target.value)}
              onFocus={() => { if (row.p1Input) handleSearch(row.p1Input, 1); }}
              onBlur={() => setTimeout(() => setShow1(false), 200)}
              placeholder="PLAYER 1" 
              className="flex-1 bg-transparent text-2xl font-[1000] text-center text-white placeholder:text-white/5 focus:outline-none uppercase tracking-tighter w-full min-w-0"
            />
            
            {/* 우측 아이콘 고정 영역 (shrink-0) */}
            <div className="w-12 shrink-0 h-full flex items-center justify-start pr-2">
               {row.p1 && (
                 <div className="animate-in zoom-in-95 fade-in duration-300">
                    <RaceLetterBadge race={row.p1.race} size="sm" />
                 </div>
               )}
            </div>
          </div>
          {/* Autocomplete 1 */}
          {show1 && (
            <div className="absolute top-[80px] left-0 w-full bg-black border border-white/10 rounded-xl p-2 z-[100] shadow-2xl animate-in fade-in slide-in-from-top-1">
               {s1.map(p => (
                 <button key={p.id} onClick={() => { updateRow(row.id, 'p1', p); updateRow(row.id, 'p1Input', p.name); setShow1(false); }} className="w-full flex items-center justify-between px-4 py-3 hover:bg-nzu-green/10 rounded-lg text-base font-[1000] text-white/40 hover:text-nzu-green transition-all"><span>{p.name}</span><RaceLetterBadge race={p.race} size="sm" /></button>
               ))}
            </div>
          )}
        </div>
        
        {/* VS / Swap Area */}
        <div className="flex flex-col items-center justify-center min-w-[110px] relative">
           <button onClick={() => swapPlayers(row.id)} className="absolute -top-6 bg-black/80 border border-white/10 p-2 rounded-full text-white/10 hover:text-nzu-green hover:border-nzu-green/40 transition-all active:scale-90 group/swap shadow-xl z-20">
              <ArrowLeftRight size={14} strokeWidth={4} className="group-hover/swap:rotate-180 transition-transform duration-500" />
           </button>
           {isConfirmed && mockStats ? (
             <div className="flex flex-col items-center animate-in fade-in zoom-in-90 duration-300">
                <div className="flex items-center gap-3">
                   <span className="text-3xl font-[1000] italic text-nzu-green leading-none">{mockStats.overall[0]}</span>
                   <span className="text-[10px] font-black text-white/10 tracking-[0.2em] px-2 border-x border-white/5">TOTAL</span>
                   <span className="text-3xl font-[1000] italic text-nzu-green leading-none">{mockStats.overall[1]}</span>
                </div>
                <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-white/5 to-transparent my-1" />
                <div className="flex items-center gap-3 opacity-60">
                   <span className="text-lg font-[1000] italic text-red-500/80 leading-none">{mockStats.recent[0]}</span>
                   <span className="text-[9px] font-black text-red-500/20 tracking-[0.2em]">REC</span>
                   <span className="text-lg font-[1000] italic text-red-500/80 leading-none">{mockStats.recent[1]}</span>
                </div>
             </div>
           ) : (
             <div className="flex flex-col items-center gap-1.5 pt-2">
               <span className="text-[10px] font-[1000] italic uppercase tracking-[0.5em] text-white/10 group-hover:text-nzu-green transition-all">VERSUS</span>
               <div className="h-[1px] w-12 bg-white/5 group-hover:bg-nzu-green/20" />
             </div>
           )}
        </div>

        {/* P2 Section - (Triple-Box Layout for Icon Safety) */}
        <div className="flex-1 relative">
          <div className={cn(
            "relative flex items-center h-[72px] bg-black/40 border border-white/10 rounded-2xl transition-all shadow-sm",
            row.p2 ? raceToneClasses(row.p2.race, 2) : "focus-within:border-red-500/30"
          )}>
            {/* 좌측 아이콘 고정 영역 (shrink-0) */}
            <div className="w-12 shrink-0 h-full flex items-center justify-end pl-2">
               {row.p2 && (
                 <div className="animate-in zoom-in-95 fade-in duration-300">
                    <RaceLetterBadge race={row.p2.race} size="sm" />
                 </div>
               )}
            </div>
            
            {/* 중앙 입력창 */}
            <input 
              type="text" 
              value={row.p2Input}
              onChange={(e) => handleInputChange(2, e.target.value)}
              onFocus={() => { if (row.p2Input) handleSearch(row.p2Input, 2); }}
              onBlur={() => setTimeout(() => setShow2(false), 200)}
              placeholder="PLAYER 2" 
              className="flex-1 bg-transparent text-2xl font-[1000] text-center text-white placeholder:text-white/5 focus:outline-none uppercase tracking-tighter w-full min-w-0"
            />

            {/* 우측 여백 (균형용) */}
            <div className="w-12 shrink-0 h-full invisible" />
          </div>
          {/* Autocomplete 2 */}
          {show2 && (
            <div className="absolute top-[80px] left-0 w-full bg-black border border-white/10 rounded-xl p-2 z-[100] shadow-2xl animate-in fade-in slide-in-from-top-1">
               {s2.map(p => (
                 <button key={p.id} onClick={() => { updateRow(row.id, 'p2', p); updateRow(row.id, 'p2Input', p.name); setShow2(false); }} className="w-full flex items-center justify-between px-4 py-3 hover:bg-red-500/10 rounded-lg text-base font-[1000] text-white/40 hover:text-red-500 transition-all"><span>{p.name}</span><RaceLetterBadge race={p.race} size="sm" /></button>
               ))}
            </div>
          )}
        </div>
      </div>

      {/* ✅ Action Buttons: Sized Appropriately */}
      <div className="flex items-center gap-2 pr-4">
        <button 
          disabled={!isConfirmed} 
          className={cn(
            "h-[72px] min-w-[150px] px-8 rounded-2xl font-[1000] uppercase tracking-tighter transition-all shadow-xl flex items-center justify-center",
            isConfirmed 
              ? "bg-nzu-green text-black hover:bg-white text-2xl" 
              : "bg-white/[0.03] text-white/5 cursor-not-allowed text-xl"
          )}
        >
          상세분석
        </button>
        <button onClick={() => removeRow(row.id)} className="h-[72px] w-[72px] bg-red-500/5 hover:bg-red-500/10 text-white/5 hover:text-red-500 rounded-2xl border border-white/5 hover:border-red-500/20 transition-all flex items-center justify-center group/del"><X size={20} /></button>
      </div>
    </div>
  );
}

// --- Page ---
export default function MultiH2HPage() {
  const [rows, setRows] = useState<MatchRow[]>([{ id: crypto.randomUUID(), p1: null, p2: null, p1Input: '', p2Input: '' }]);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  useEffect(() => {
    // 🔥 데이터 연동 전 더미 (P1/P2 종족 아이콘 테스트용)
    const dummyPlayers: Player[] = [
      { id: '1', name: '이영호', race: 'T' },
      { id: '2', name: '김택용', race: 'P' },
      { id: '3', name: '이제동', race: 'Z' },
      { id: '4', name: '송병구', race: 'T' },
      { id: '5', name: '허영무', race: 'P' },
      { id: '6', name: '박성준', race: 'Z' },
      { id: '7', name: '윤용태', race: 'T' },
      { id: '8', name: '김명운', race: 'Z' },
      { id: '9', name: '강민', race: 'P' },
      { id: '10', name: '홍진호', race: 'Z' },
    ];
    setAllPlayers(dummyPlayers);
    setIsLoading(false);
  }, []);

  const addRow = () => setRows([...rows, { id: crypto.randomUUID(), p1: null, p2: null, p1Input: '', p2Input: '' }]);
  const removeRow = (id: string) => rows.length > 1 ? setRows(rows.filter(r => r.id !== id)) : setRows([{ id: crypto.randomUUID(), p1: null, p2: null, p1Input: '', p2Input: '' }]);
  const swapPlayers = (id: string) => setRows((prev) => prev.map(r => r.id === id ? { ...r, p1: r.p2, p2: r.p1, p1Input: r.p2Input, p2Input: r.p1Input } : r));
  const updateRow = (id: string, field: keyof MatchRow, value: any) => setRows((prev) => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setRows((items) => {
        const oldIndex = items.findIndex(i => i.id === active.id);
        const newIndex = items.findIndex(i => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }

  return (
    <div className="min-h-screen bg-[#020403] text-foreground">
      <main className="max-w-[1250px] mx-auto px-6 py-20 animate-in fade-in duration-700">
        <header className="mb-14 flex flex-col items-center md:items-start ml-2">
           <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-nzu-green/10 border border-nzu-green/20 text-nzu-green text-[10px] font-[1000] uppercase tracking-[0.4em] mb-4">
              <Sparkles size={12} strokeWidth={3} /> TACTICAL PRE-VIEW
           </div>
           <h1 className="text-5xl font-[1000] tracking-tighter italic uppercase flex items-center gap-5">
              전술 <span className="text-nzu-green drop-shadow-[0_0_15px_#00ffa344]">분석실</span>
              <span className="text-white/5 text-3xl font-black">/</span>
              <span className="text-white/20 text-base not-italic font-bold tracking-[0.2em] font-mono">MATCH ROOM v4.5</span>
           </h1>
        </header>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} modifiers={[restrictToVerticalAxis]}>
          <div className="flex flex-col gap-6">
            <SortableContext items={rows.map(r => r.id)} strategy={verticalListSortingStrategy}>
              {rows.map((row) => (
                <SortableMatchRow key={row.id} row={row} updateRow={updateRow} removeRow={removeRow} swapPlayers={swapPlayers} allPlayers={allPlayers} />
              ))}
            </SortableContext>
            
            <button onClick={addRow} className="w-full py-12 mt-4 rounded-3xl border border-dashed border-white/5 hover:border-nzu-green/40 hover:bg-nzu-green/[0.04] text-white/5 hover:text-nzu-green transition-all flex items-center justify-center gap-8 group">
               <div className="p-4 rounded-2xl bg-white/5 group-hover:bg-nzu-green group-hover:text-black transition-all shadow-xl"><Plus size={28} strokeWidth={4} /></div>
               <span className="text-2xl font-[1000] uppercase tracking-[0.6em]">매치 추가</span>
            </button>
          </div>
        </DndContext>
      </main>
      
      <footer className="border-t border-white/5 py-14 mt-20 bg-black/80">
        <div className="max-w-[1200px] mx-auto px-10 flex justify-between items-center opacity-30">
          <div className="text-[10px] font-black uppercase tracking-[0.4em] flex items-center gap-5">
            <span className="w-2.5 h-2.5 rounded-full bg-nzu-green shadow-[0_0_20px_#00ffa3cc]" /> NZU ENGINE v4.5
          </div>
          <div className="text-[10px] font-black uppercase tracking-[0.4em]">© 2026 NZU · EL-RADE PARK</div>
        </div>
      </footer>
    </div>
  );
}
