// 방/게임 서버: 방 생성·참가·나가기·시작과 윷 던지기·말 이동·아이템 사용을 서버 권한으로 처리한다.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { admin, HttpError, requireUser, serve } from "../_shared/common.ts";
import {
  cryptoRng, doMove, doThrow, forfeit, type GameState, type ItemKind, itemUsable, newGame, type Player, runAi, type Seat, useItem,
} from "../_shared/yut.ts";

interface Room {
  id: string; name: string; mode: "pvp" | "pvc"; host_id: string; status: "waiting" | "playing";
  state: GameState | null; version: number;
}
interface RoomPlayer { room_id: string; user_id: string; username: string; name: string; seat: Seat }

async function getRoom(db: SupabaseClient, id: string): Promise<Room> {
  const { data } = await db.from("rooms").select("*").eq("id", id).maybeSingle();
  if (!data) throw new HttpError(404, "방을 찾을 수 없습니다.");
  return data as Room;
}
async function getMembers(db: SupabaseClient, roomId: string): Promise<RoomPlayer[]> {
  const { data } = await db.from("room_players").select("*").eq("room_id", roomId).order("seat");
  return (data ?? []) as RoomPlayer[];
}

async function save(db: SupabaseClient, room: Room, patch: Partial<Room>) {
  const { data, error } = await db.from("rooms")
    .update({ ...patch, version: room.version + 1, updated_at: new Date().toISOString() })
    .eq("id", room.id).eq("version", room.version).select("id");
  if (error) throw new HttpError(500, error.message);
  if (!data?.length) throw new HttpError(409, "다른 요청과 충돌했습니다. 다시 시도해주세요.");
}

async function recordResults(db: SupabaseClient, state: GameState) {
  for (const p of state.players) {
    if (p.isPC || !p.userId) continue;
    await db.rpc("record_result", { p_user: p.userId, p_win: p.seat === state.winner });
  }
}

async function leaveRoom(db: SupabaseClient, userId: string, roomId: string) {
  const room = await getRoom(db, roomId).catch(() => null);
  if (!room) return;
  const members = await getMembers(db, roomId);
  const me = members.find((m) => m.user_id === userId);
  if (!me) return;

  // 게임 중에 나가면 기권패
  if (room.status === "playing" && room.state && room.state.phase !== "finished") {
    const state = room.state;
    forfeit(state, me.seat);
    await recordResults(db, state);
    await save(db, room, { state, status: "waiting" });
    room.version += 1;
  }
  await db.from("room_players").delete().eq("room_id", roomId).eq("user_id", userId);
  const rest = members.filter((m) => m.user_id !== userId);
  if (room.mode === "pvc" || rest.length === 0) {
    await db.from("rooms").delete().eq("id", roomId);
  } else if (room.host_id === userId) {
    await db.from("rooms").update({ host_id: rest[0].user_id, updated_at: new Date().toISOString() }).eq("id", roomId);
  }
}

async function leaveAll(db: SupabaseClient, userId: string) {
  const { data } = await db.from("room_players").select("room_id").eq("user_id", userId);
  for (const r of data ?? []) await leaveRoom(db, userId, r.room_id);
}

function playerOf(m: RoomPlayer): Player {
  return { seat: m.seat, userId: m.user_id, username: m.username, name: m.name, isPC: false };
}

serve(async (req, body) => {
  const db = admin();
  const user = await requireUser(req, db);
  const action = String(body.action ?? "");
  const roomId = body.roomId ? String(body.roomId) : "";

  const { data: profile } = await db.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) throw new HttpError(403, "회원 정보를 찾을 수 없습니다.");

  switch (action) {
    case "create": {
      const mode = body.mode === "pvc" ? "pvc" : "pvp";
      const name = String(body.name ?? "").trim().slice(0, 30) || `${profile.name}의 방`;
      await leaveAll(db, user.id);
      // 오래 방치된 방 정리
      await db.from("rooms").delete().lt("updated_at", new Date(Date.now() - 3 * 3600_000).toISOString());

      const { data: room, error } = await db.from("rooms").insert({ name, mode, host_id: user.id }).select("*").single();
      if (error) throw new HttpError(500, error.message);
      const me: RoomPlayer = { room_id: room.id, user_id: user.id, username: profile.username, name: profile.name, seat: 0 };
      await db.from("room_players").insert(me);

      if (mode === "pvc") {
        const pc: Player = { seat: 1, userId: null, username: "pc", name: "컴퓨터", isPC: true };
        const state = newGame("pvc", [playerOf(me), pc], cryptoRng);
        runAi(state, cryptoRng);
        await save(db, room as Room, { state, status: "playing" });
      }
      return { roomId: room.id };
    }

    case "join": {
      const room = await getRoom(db, roomId);
      const members = await getMembers(db, roomId);
      if (members.some((m) => m.user_id === user.id)) return { roomId };
      if (room.mode !== "pvp") throw new HttpError(400, "참가할 수 없는 방입니다.");
      if (room.status !== "waiting") throw new HttpError(400, "이미 게임이 진행 중인 방입니다.");
      if (members.length >= 2) throw new HttpError(400, "방이 가득 찼습니다.");
      await leaveAll(db, user.id);
      const seat = members.some((m) => m.seat === 0) ? 1 : 0;
      const { error } = await db.from("room_players").insert({
        room_id: roomId, user_id: user.id, username: profile.username, name: profile.name, seat,
      });
      if (error) throw new HttpError(409, "방이 가득 찼습니다.");
      await db.from("rooms").update({ updated_at: new Date().toISOString() }).eq("id", roomId);
      return { roomId };
    }

    case "leave": {
      if (roomId) await leaveRoom(db, user.id, roomId);
      else await leaveAll(db, user.id);
      return { ok: true };
    }

    case "start": {
      const room = await getRoom(db, roomId);
      if (room.host_id !== user.id) throw new HttpError(403, "방장만 게임을 시작할 수 있습니다.");
      if (room.status !== "waiting") throw new HttpError(400, "이미 게임이 진행 중입니다.");
      const members = await getMembers(db, roomId);
      if (members.length < 2) throw new HttpError(400, "상대가 들어와야 시작할 수 있습니다.");
      const bySeat = [members.find((m) => m.seat === 0)!, members.find((m) => m.seat === 1)!];
      const state = newGame("pvp", [playerOf(bySeat[0]), playerOf(bySeat[1])], cryptoRng);
      await save(db, room, { state, status: "playing" });
      return { ok: true };
    }

    case "throw":
    case "move":
    case "item": {
      const room = await getRoom(db, roomId);
      const state = room.state;
      if (room.status !== "playing" || !state || state.phase === "finished") throw new HttpError(400, "진행 중인 게임이 없습니다.");
      const me = state.players.find((p) => p.userId === user.id);
      if (!me) throw new HttpError(403, "이 게임의 참가자가 아닙니다.");

      if (action === "throw") doThrow(state, me.seat, cryptoRng);
      else if (action === "move") doMove(state, me.seat, Number(body.resultIndex), Number(body.pieceId));
      else {
        const item = String(body.item) as ItemKind;
        if (item !== "extra_throw" && item !== "revive") throw new HttpError(400, "존재하지 않는 아이템입니다.");
        const err = itemUsable(state, me.seat, item);
        if (err) throw new HttpError(400, err);
        const { data: ok } = await db.rpc("consume_item", { p_user: user.id, p_item: item });
        if (!ok) throw new HttpError(400, "보유한 아이템이 없습니다. 대기실에서 구입해주세요.");
        useItem(state, me.seat, item, Number(body.reviveIndex ?? 0));
      }
      runAi(state, cryptoRng);

      const finished = state.phase === "finished";
      await save(db, room, { state, status: finished ? "waiting" : "playing" });
      if (finished) await recordResults(db, state);
      return { ok: true };
    }

    default:
      throw new HttpError(400, "알 수 없는 요청입니다.");
  }
});
