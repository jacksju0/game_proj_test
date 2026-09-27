import { useCallback, useEffect, useMemo, useState } from "react";
import { call, supabase } from "../lib/supabase";
import { toast } from "../lib/toast";
import type { OnlineUser, Profile, Room } from "../lib/types";
import { Chat } from "../components/Chat";
import { PointsModal } from "../components/PointsModal";
import { ShopModal } from "../components/ShopModal";
import { ProfileBar } from "./ProfileBar";

export function Lobby({ profile, online, onEnterRoom, onProfile }: {
  profile: Profile; online: OnlineUser[]; onEnterRoom: (id: string) => void; onProfile: (p: Profile) => void;
}) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomName, setRoomName] = useState("");
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<"points" | "shop" | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("rooms")
      .select("id,name,mode,status,host_id,version,created_at,updated_at,room_players(user_id,username,name,seat)")
      .eq("mode", "pvp").order("created_at", { ascending: false }).limit(50);
    setRooms((data ?? []) as unknown as Room[]);
  }, []);

  useEffect(() => {
    load();
    let t: ReturnType<typeof setTimeout> | undefined;
    const debounced = () => { clearTimeout(t); t = setTimeout(load, 250); };
    const ch = supabase.channel("lobby-rooms")
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms" }, debounced)
      .on("postgres_changes", { event: "*", schema: "public", table: "room_players" }, debounced)
      .subscribe();
    return () => { clearTimeout(t); supabase.removeChannel(ch); };
  }, [load]);

  // 접속 중인 사람이 한 명도 없는 방은 숨김 (브라우저를 닫고 떠난 방)
  const onlineIds = useMemo(() => new Set(online.map((o) => o.uid)), [online]);
  const visibleRooms = rooms.filter((r) => online.length === 0 || (r.room_players ?? []).some((p) => onlineIds.has(p.user_id)));
  const lobbyUsers = online.filter((o) => o.where === "lobby");

  async function create(mode: "pvp" | "pvc") {
    setBusy(true);
    try {
      const r = await call<{ roomId: string }>("game", { action: "create", mode, name: mode === "pvc" ? "PC 대전" : roomName });
      onEnterRoom(r.roomId);
    } catch (e) { toast((e as Error).message, "error"); setBusy(false); }
  }
  async function join(id: string) {
    setBusy(true);
    try { await call("game", { action: "join", roomId: id }); onEnterRoom(id); }
    catch (e) { toast((e as Error).message, "error"); setBusy(false); load(); }
  }

  return (
    <div className="page">
      <ProfileBar profile={profile}>
        <button className="btn btn-gold" onClick={() => setModal("points")}>💰 포인트 구매</button>
        <button className="btn btn-gold" onClick={() => setModal("shop")}>🎁 아이템 구매</button>
      </ProfileBar>

      <div className="lobby-grid">
        <section className="panel rooms-panel">
          <div className="panel-title">🏠 방 목록 <span className="muted small">({visibleRooms.length})</span></div>
          <div className="create-row">
            <input value={roomName} onChange={(e) => setRoomName(e.target.value)} maxLength={30} placeholder={`${profile.name}의 방`} />
            <button className="btn btn-primary" disabled={busy} onClick={() => create("pvp")}>방 만들기 (사람 vs 사람)</button>
            <button className="btn btn-blue" disabled={busy} onClick={() => create("pvc")}>🤖 사람 vs PC</button>
          </div>
          <div className="room-list">
            {visibleRooms.length === 0 && <div className="empty">아직 만들어진 방이 없어요. 첫 방을 만들어보세요!</div>}
            {visibleRooms.map((r) => {
              const players = (r.room_players ?? []).slice().sort((a, b) => a.seat - b.seat);
              const host = players.find((p) => p.user_id === r.host_id);
              const full = players.length >= 2;
              const playing = r.status === "playing";
              return (
                <div className="room-card" key={r.id}>
                  <div className="room-main">
                    <div className="room-name">{r.name}</div>
                    <div className="muted small">방장 {host?.name ?? "-"} · {players.map((p) => p.name).join(" vs ") || "-"}</div>
                  </div>
                  <span className={`badge ${playing ? "badge-red" : "badge-green"}`}>{playing ? "게임 중" : "대기 중"}</span>
                  <span className="room-count">{players.length}/2</span>
                  <button className="btn" disabled={busy || playing || full} onClick={() => join(r.id)}>
                    {playing ? "진행 중" : full ? "가득 참" : "참가"}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="lobby-side">
          <div className="panel online-panel">
            <div className="panel-title">🟢 대기실 접속자 <span className="muted small">({lobbyUsers.length})</span></div>
            <div className="online-list">
              {lobbyUsers.map((u) => <span key={u.uid} className={`online-user ${u.uid === profile.id ? "me" : ""}`}>{u.name}</span>)}
            </div>
          </div>
          <Chat roomId={null} title="대기실 채팅" myId={profile.id} />
        </aside>
      </div>

      {modal === "points" && <PointsModal profile={profile} onClose={() => setModal(null)} />}
      {modal === "shop" && <ShopModal profile={profile} onClose={() => setModal(null)} onBought={onProfile} />}
    </div>
  );
}
