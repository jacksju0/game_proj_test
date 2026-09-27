import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { call, supabase } from "./lib/supabase";
import { toast } from "./lib/toast";
import { usePresence } from "./lib/usePresence";
import type { Profile } from "./lib/types";
import { Toaster } from "./components/Toaster";
import { AuthScreen } from "./screens/AuthScreen";
import { Lobby } from "./screens/Lobby";
import { RoomScreen } from "./screens/RoomScreen";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const uid = session?.user.id;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!uid) return;
    const { data } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
    if (data) setProfile(data as Profile);
  }, [uid]);

  // 로그인 시: 프로필 로드, 참여 중이던 방 복귀, 프로필 실시간 반영
  useEffect(() => {
    if (!uid) { setProfile(null); setRoomId(null); return; }
    refreshProfile();
    supabase.from("room_players").select("room_id").eq("user_id", uid).limit(1)
      .then(({ data }) => setRoomId(data?.[0]?.room_id ?? null));
    const ch = supabase.channel(`profile-${uid}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${uid}` },
        (p) => setProfile(p.new as Profile))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [uid, refreshProfile]);

  // 토스페이먼츠 결제창에서 돌아온 경우 (?pay=success&paymentKey=..&orderId=..&amount=..)
  useEffect(() => {
    if (!uid) return;
    const q = new URLSearchParams(window.location.search);
    const pay = q.get("pay");
    if (!pay) return;
    window.history.replaceState(null, "", window.location.pathname);
    if (pay === "success") {
      call<{ amount: number }>("payments", {
        action: "confirm", paymentKey: q.get("paymentKey"), orderId: q.get("orderId"), amount: Number(q.get("amount")),
      })
        .then((r) => { toast(`${r.amount.toLocaleString()}P 충전 완료!`, "success"); refreshProfile(); })
        .catch((e) => toast((e as Error).message, "error"));
    } else {
      toast(`결제가 완료되지 않았습니다. ${q.get("message") ?? ""}`, "error");
    }
  }, [uid, refreshProfile]);

  const online = usePresence(profile, roomId ? "room" : "lobby");

  let screen;
  if (!ready) screen = <div className="splash">불러오는 중…</div>;
  else if (!session) screen = <AuthScreen />;
  else if (!profile) screen = <div className="splash">회원 정보를 불러오는 중…</div>;
  else if (roomId) screen = <RoomScreen key={roomId} roomId={roomId} profile={profile} onLeave={() => setRoomId(null)} onSwitchRoom={setRoomId} />;
  else screen = <Lobby profile={profile} online={online} onEnterRoom={setRoomId} onProfile={setProfile} />;

  return (<>{screen}<Toaster /></>);
}
