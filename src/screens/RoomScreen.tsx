import { useCallback, useEffect, useRef, useState } from "react";
import { call, supabase } from "../lib/supabase";
import { toast } from "../lib/toast";
import type { Profile, Room, RoomPlayer } from "../lib/types";
import { Chat } from "../components/Chat";
import { GameScreen } from "../game/GameScreen";
import { ProfileBar } from "./ProfileBar";

export function RoomScreen({ roomId, profile, onLeave, onSwitchRoom }: {
  roomId: string; profile: Profile; onLeave: () => void; onSwitchRoom: (id: string) => void;
}) {
  const [room, setRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<RoomPlayer[]>([]);
  const [gameOpen, setGameOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const leftRef = useRef(false);

  const acceptRoom = useCallback((r: Room) => {
    setRoom((prev) => (!prev || r.version >= prev.version ? r : prev));
  }, []);

  const load = useCallback(async () => {
    const [{ data: r }, { data: m }] = await Promise.all([
      supabase.from("rooms").select("*").eq("id", roomId).maybeSingle(),
      supabase.from("room_players").select("*").eq("room_id", roomId).order("seat"),
    ]);
    const mine = (m ?? []).some((x) => x.user_id === profile.id);
    if (!r || !mine) {
      if (!leftRef.current) { leftRef.current = true; toast("방에서 나왔습니다.", "info"); onLeave(); }
      return;
    }
    acceptRoom(r as Room);
    setMembers((m ?? []) as RoomPlayer[]);
  }, [roomId, profile.id, onLeave, acceptRoom]);

  useEffect(() => {
    load();
    const ch = supabase.channel(`room-${roomId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
        (p) => acceptRoom(p.new as Room))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "rooms" },
        (p) => { if ((p.old as { id?: string }).id === roomId) load(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "room_players" },
        (p) => {
          const row = (p.new && "room_id" in p.new ? p.new : p.old) as Partial<RoomPlayer>;
          if (!row.room_id || row.room_id === roomId) load();
        })
      .subscribe();
    // 실시간 연결이 끊겨도 상태가 맞도록 주기적으로 동기화
    const iv = setInterval(load, 8000);
    return () => { supabase.removeChannel(ch); clearInterval(iv); };
  }, [roomId, load, acceptRoom]);

  useEffect(() => { if (room?.status === "playing") setGameOpen(true); }, [room?.status]);

  async function leave() {
    if (room?.status === "playing" && room.state?.phase !== "finished" && !window.confirm("게임 중에 나가면 기권패 처리됩니다. 나갈까요?")) return;
    setBusy(true);
    leftRef.current = true;
    try { await call("game", { action: "leave", roomId }); } catch (e) { toast((e as Error).message, "error"); }
    onLeave();
  }
  async function start() {
    setBusy(true);
    try { await call("game", { action: "start", roomId }); await load(); }
    catch (e) { toast((e as Error).message, "error"); }
    finally { setBusy(false); }
  }
  async function playPcAgain() {
    leftRef.current = true;
    try {
      const r = await call<{ roomId: string }>("game", { action: "create", mode: "pvc", name: "PC 대전" });
      onSwitchRoom(r.roomId);
    } catch (e) { toast((e as Error).message, "error"); }
  }

  if (!room) return <div className="splash">방에 들어가는 중…</div>;

  if (room.state && (gameOpen || room.mode === "pvc")) {
    return (
      <GameScreen
        room={room} profile={profile}
        onRefresh={load}
        onLeave={leave}
        onBackToRoom={room.mode === "pvp" ? () => setGameOpen(false) : undefined}
        onPlayAgain={room.mode === "pvc" ? playPcAgain : undefined}
      />
    );
  }

  const isHost = room.host_id === profile.id;
  const seats = [0, 1].map((s) => members.find((m) => m.seat === s));
  return (
    <div className="page">
      <ProfileBar profile={profile} compact />
      <div className="room-grid">
        <section className="panel waiting-panel">
          <div className="panel-title">🏠 {room.name}</div>
          <div className="seats">
            {seats.map((m, i) => (
              <div key={i} className={`seat seat-${i} ${m ? "" : "empty"}`}>
                <div className="seat-piece" />
                <div className="seat-name">{m ? m.name : "상대를 기다리는 중…"}</div>
                {m && <div className="muted small">@{m.username}</div>}
                <div className="seat-tags">
                  {m && m.user_id === room.host_id && <span className="badge badge-gold">👑 방장</span>}
                  <span className="badge">동전 {i === 0 ? "앞면" : "뒷면"}</span>
                </div>
              </div>
            ))}
            <div className="vs">VS</div>
          </div>
          <p className="muted center">게임을 시작하면 동전을 던져 나온 면의 주인이 먼저 시작합니다.</p>
          <div className="waiting-actions">
            {isHost ? (
              <button className="btn btn-primary btn-lg" disabled={busy || members.length < 2} onClick={start}>
                {members.length < 2 ? "상대를 기다리는 중…" : "🎲 게임 시작"}
              </button>
            ) : <div className="muted">방장이 게임을 시작하기를 기다리는 중…</div>}
            <button className="btn btn-ghost" disabled={busy} onClick={leave}>방 나가기</button>
          </div>
        </section>
        <Chat roomId={room.id} title="방 채팅 (이 방 참가자만)" myId={profile.id} />
      </div>
    </div>
  );
}
