"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type ChatMessage = {
  id: string;
  sender: string;
  text: string;
  ts: number;
};

function buildRoomKey(id1: string, id2: string): string {
  const [a, b] = [id1, id2].sort();
  return `duelview-${a}-${b}`;
}

function getGuestId(): string {
  try {
    const key = "duelview_guest_id";
    let id = sessionStorage.getItem(key);
    if (!id) {
      id = `관전자_${Math.floor(1000 + Math.random() * 9000)}`;
      sessionStorage.setItem(key, id);
    }
    return id;
  } catch {
    return `관전자_${Math.floor(1000 + Math.random() * 9000)}`;
  }
}

export function useDuelviewRoom(p1Id: string | null, p2Id: string | null) {
  const [viewerCount, setViewerCount] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const guestIdRef = useRef<string>("");

  useEffect(() => {
    guestIdRef.current = getGuestId();
  }, []);

  useEffect(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
      setViewerCount(0);
      setMessages([]);
    }

    if (!p1Id || !p2Id) return;

    const roomKey = buildRoomKey(p1Id, p2Id);
    const guestId = guestIdRef.current || getGuestId();

    const channel = supabase.channel(roomKey, {
      config: { presence: { key: guestId } },
    });

    channel.on("presence", { event: "sync" }, () => {
      setViewerCount(Object.keys(channel.presenceState()).length);
    });

    channel.on("broadcast", { event: "chat" }, ({ payload }) => {
      setMessages((prev) => [...prev, payload as ChatMessage].slice(-60));
    });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({ online_at: new Date().toISOString() });
      }
    });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [p1Id, p2Id]);

  const sendMessage = useCallback((text: string) => {
    if (!channelRef.current || !text.trim()) return;
    const guestId = guestIdRef.current;
    const msg: ChatMessage = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
      sender: guestId,
      text: text.trim(),
      ts: Date.now(),
    };
    channelRef.current.send({ type: "broadcast", event: "chat", payload: msg });
    setMessages((prev) => [...prev.slice(-59), msg]);
  }, []);

  return { viewerCount, messages, sendMessage, guestId: guestIdRef.current };
}
