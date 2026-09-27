import type { GameState, Seat } from "../../supabase/functions/_shared/yut.ts";

export interface Profile {
  id: string; username: string; name: string;
  total_games: number; wins: number; losses: number;
  points: number; item_extra_throw: number; item_revive: number;
}
export interface RoomPlayer { room_id: string; user_id: string; username: string; name: string; seat: Seat }
export interface Room {
  id: string; name: string; mode: "pvp" | "pvc"; host_id: string; status: "waiting" | "playing";
  state: GameState | null; version: number; created_at: string; updated_at: string;
  room_players?: RoomPlayer[];
}
export interface ChatMessage { id: number; channel: string; user_id: string; username: string; name: string; content: string; filtered: boolean; created_at: string }
export interface Payment { order_id: string; amount: number; order_name: string; status: string; method: string | null; approved_at: string | null; created_at: string }
export interface OnlineUser { uid: string; name: string; username: string; where: "lobby" | "room" }
