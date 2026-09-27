import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { OnlineUser, Profile } from "./types";

/** 접속 중인 사용자 목록 (Supabase Realtime Presence) */
export function usePresence(profile: Profile | null, where: "lobby" | "room") {
  const [online, setOnline] = useState<OnlineUser[]>([]);
  const chRef = useRef<RealtimeChannel | null>(null);
  const uid = profile?.id;

  useEffect(() => {
    if (!uid) return;
    const ch = supabase.channel("online", { config: { presence: { key: uid } } });
    ch.on("presence", { event: "sync" }, () => {
      const st = ch.presenceState<OnlineUser>();
      setOnline(Object.values(st).map((arr) => arr[0]).filter(Boolean));
    }).subscribe();
    chRef.current = ch;
    return () => { supabase.removeChannel(ch); chRef.current = null; setOnline([]); };
  }, [uid]);

  useEffect(() => {
    const ch = chRef.current;
    if (!ch || !profile) return;
    const track = () => ch.track({ uid: profile.id, name: profile.name, username: profile.username, where });
    // 구독 완료 전이면 잠시 후 재시도
    const t = setInterval(() => { if (ch.state === "joined") { track(); clearInterval(t); } }, 300);
    return () => clearInterval(t);
  }, [uid, profile?.name, where]);

  return online;
}
