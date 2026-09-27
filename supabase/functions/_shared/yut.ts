// 윷놀이 게임 엔진 — 서버(Edge Function)와 클라이언트가 공유하는 순수 TypeScript 모듈.
// 판(노드) 번호:
//   외곽 0..19 (0 = 참먹이/출발점, 5·10·15 = 모서리), 대각선 A: 5→20→21→22(중앙)→23→24→15,
//   대각선 B: 10→25→26→22→27→28→0.  HOME = 판에 오르지 않은 말, GOAL = 난 말.

export type Result = "backdo" | "do" | "gae" | "geol" | "yut" | "mo";
export type ItemKind = "extra_throw" | "revive";
export type Seat = 0 | 1;

export const HOME = -1;
export const GOAL = 99;
export const PIECES_PER_PLAYER = 4;

export const STEPS: Record<Result, number> = { backdo: -1, do: 1, gae: 2, geol: 3, yut: 4, mo: 5 };
export const RESULT_NAME: Record<Result, string> = {
  backdo: "빽도", do: "도", gae: "개", geol: "걸", yut: "윷", mo: "모",
};
export const ITEM_NAME: Record<ItemKind, string> = { extra_throw: "한번 더 던지기", revive: "죽은 말 부활하기" };
export const ITEM_PRICE: Record<ItemKind, number> = { extra_throw: 500, revive: 1000 };

export interface Piece { id: number; seat: Seat; pos: number; prev: number | null }
export interface Player { seat: Seat; userId: string | null; username: string; name: string; isPC: boolean }
export interface Death { victim: Seat; pieceIds: number[]; pos: number; prev: number | null }

export type GameEvent =
  | { seq: number; type: "coin"; face: "앞" | "뒤"; first: Seat }
  | { seq: number; type: "throw"; seat: Seat; result: Result; sticks: boolean[] }
  | { seq: number; type: "move"; seat: Seat; pieceIds: number[]; path: number[]; captured: number[]; finished: boolean; result: Result }
  | { seq: number; type: "item"; seat: Seat; item: ItemKind; pieceIds?: number[]; pos?: number }
  | { seq: number; type: "skip"; seat: Seat; result: Result }
  | { seq: number; type: "turn"; seat: Seat }
  | { seq: number; type: "win"; seat: Seat; reason: "finish" | "forfeit" };

export interface GameState {
  mode: "pvp" | "pvc";
  players: [Player, Player];
  pieces: Piece[];
  turn: Seat;
  phase: "throw" | "move" | "finished";
  throwsLeft: number;
  results: Result[];
  thrownThisTurn: boolean;
  extraUsedThisTurn: boolean;
  /** 이번 턴을 시작한 플레이어가 직전 상대 턴에 잡힌 기록 (부활 아이템 대상) */
  reviveOptions: Death[];
  /** 현재 턴 동안 발생한 잡기 기록 (턴이 넘어갈 때 reviveOptions로 이동) */
  deaths: Death[];
  coin: { face: "앞" | "뒤"; faces: ["앞" | "뒤", "앞" | "뒤"]; first: Seat };
  winner: Seat | null;
  turnNo: number;
  seq: number;
  log: GameEvent[];
}

// ---------- 판 좌표 (클라이언트 3D 배치용, 단위: 판 한 변 = 10) ----------
export const NODE_XY: Record<number, [number, number]> = (() => {
  const m: Record<number, [number, number]> = {};
  const h = 5; // half size
  // 외곽: 0 = 오른쪽 아래, 반시계 방향
  for (let i = 0; i <= 5; i++) m[i] = [h, h - (i * 2 * h) / 5];          // 오른쪽 변 (아래→위)
  for (let i = 6; i <= 10; i++) m[i] = [h - ((i - 5) * 2 * h) / 5, -h];  // 위쪽 변 (오른→왼)
  for (let i = 11; i <= 15; i++) m[i] = [-h, -h + ((i - 10) * 2 * h) / 5]; // 왼쪽 변 (위→아래)
  for (let i = 16; i <= 19; i++) m[i] = [-h + ((i - 15) * 2 * h) / 5, h]; // 아래 변 (왼→오른)
  const lerp = (a: [number, number], b: [number, number], t: number): [number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const c: [number, number] = [0, 0];
  m[20] = lerp(m[5], c, 1 / 3); m[21] = lerp(m[5], c, 2 / 3); m[22] = c;
  m[23] = lerp(c, m[15], 1 / 3); m[24] = lerp(c, m[15], 2 / 3);
  m[25] = lerp(m[10], c, 1 / 3); m[26] = lerp(m[10], c, 2 / 3);
  m[27] = lerp(c, m[0], 1 / 3); m[28] = lerp(c, m[0], 2 / 3);
  return m;
})();
export const NODE_COUNT = 29;
export const BIG_NODES = new Set([0, 5, 10, 15, 22]);
export const BOARD_LINES: [number, number][] = (() => {
  const l: [number, number][] = [];
  for (let i = 0; i < 20; i++) l.push([i, (i + 1) % 20]);
  l.push([5, 20], [20, 21], [21, 22], [22, 23], [23, 24], [24, 15]);
  l.push([10, 25], [25, 26], [26, 22], [22, 27], [27, 28], [28, 0]);
  return l;
})();

// ---------- 이동 규칙 ----------
const DEFAULT_BACK: Record<number, number> = (() => {
  const b: Record<number, number> = { 0: 19 };
  for (let i = 1; i <= 19; i++) b[i] = i - 1;
  Object.assign(b, { 20: 5, 21: 20, 22: 21, 23: 22, 24: 23, 25: 10, 26: 25, 27: 22, 28: 27 });
  return b;
})();

function stepForward(cur: number, from: number | null, first: boolean): number {
  if (cur === HOME) return 1;
  if (cur === 0) return GOAL; // 참먹이에 서 있는 말은 앞으로 가면 난다
  if (first && cur === 5) return 20;
  if (first && cur === 10) return 25;
  if (cur === 22) return first ? 27 : from === 21 ? 23 : 27;
  if (cur >= 1 && cur <= 18) return cur + 1;
  if (cur === 19) return GOAL;
  const t: Record<number, number> = { 20: 21, 21: 22, 23: 24, 24: 15, 25: 26, 26: 22, 27: 28, 28: GOAL };
  return t[cur];
}

/** 말 하나를 result만큼 옮겼을 때의 경로. 불가능하면 null */
export function computePath(piece: Piece, result: Result): { path: number[]; prev: number | null } | null {
  if (piece.pos === GOAL) return null;
  const steps = STEPS[result];
  if (steps < 0) {
    if (piece.pos === HOME) return null;
    const back = piece.prev ?? DEFAULT_BACK[piece.pos];
    return { path: [back], prev: null };
  }
  const path: number[] = [];
  let cur = piece.pos;
  let from = piece.prev;
  for (let i = 0; i < steps; i++) {
    const nxt = stepForward(cur, from, i === 0);
    path.push(nxt);
    if (nxt === GOAL) break;
    from = cur;
    cur = nxt;
  }
  const last = path[path.length - 1];
  const prev = last === GOAL ? null : path.length >= 2 ? path[path.length - 2] : piece.pos === HOME ? 0 : piece.pos;
  return { path, prev };
}

/** 골까지 남은 거리 (AI 평가용) */
export function distToGoal(pos: number, prev: number | null): number {
  if (pos === GOAL) return 0;
  let d = 0;
  let p: Piece = { id: -1, seat: 0, pos, prev };
  // 모(5칸)씩 반복해서 골까지 센다
  for (let guard = 0; guard < 10; guard++) {
    const c = computePath(p, "mo");
    if (!c) break;
    const gi = c.path.indexOf(GOAL);
    if (gi >= 0) return d + gi + 1;
    d += 5;
    p = { ...p, pos: c.path[c.path.length - 1], prev: c.prev };
  }
  return 30;
}

export function stackOf(state: GameState, piece: Piece): Piece[] {
  if (piece.pos === HOME || piece.pos === GOAL) return [piece];
  return state.pieces.filter((p) => p.seat === piece.seat && p.pos === piece.pos);
}

export function canMove(state: GameState, seat: Seat, result: Result): boolean {
  return state.pieces.some((p) => p.seat === seat && computePath(p, result) !== null);
}

// ---------- 난수 ----------
export type Rng = () => number; // [0,1)
export const cryptoRng: Rng = () => {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 4294967296;
};

/** 윷가락 4개 던지기. true = 평평한 면(배)이 위. 0번 가락에 빽도 표시 */
export function throwSticks(rng: Rng): { sticks: boolean[]; result: Result } {
  const sticks = [0, 1, 2, 3].map(() => rng() < 0.5);
  const flat = sticks.filter(Boolean).length;
  let result: Result;
  if (flat === 0) result = "mo";
  else if (flat === 1) result = sticks[0] ? "backdo" : "do";
  else if (flat === 2) result = "gae";
  else if (flat === 3) result = "geol";
  else result = "yut";
  return { sticks, result };
}

// ---------- 상태 전이 ----------
export class GameError extends Error { name = "GameError"; }

type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

function push(state: GameState, ev: DistOmit<GameEvent, "seq">) {
  state.seq += 1;
  state.log.push({ ...(ev as GameEvent), seq: state.seq });
  if (state.log.length > 80) state.log.splice(0, state.log.length - 80);
}

export function newGame(mode: "pvp" | "pvc", players: [Player, Player], rng: Rng): GameState {
  const face: "앞" | "뒤" = rng() < 0.5 ? "앞" : "뒤";
  const faces: ["앞" | "뒤", "앞" | "뒤"] = ["앞", "뒤"]; // 0번 좌석(방장/사람) = 앞면
  const first: Seat = face === "앞" ? 0 : 1;
  const pieces: Piece[] = [];
  for (const seat of [0, 1] as Seat[])
    for (let i = 0; i < PIECES_PER_PLAYER; i++) pieces.push({ id: seat * PIECES_PER_PLAYER + i, seat, pos: HOME, prev: null });
  const state: GameState = {
    mode, players, pieces, turn: first, phase: "throw", throwsLeft: 1, results: [],
    thrownThisTurn: false, extraUsedThisTurn: false, reviveOptions: [], deaths: [],
    coin: { face, faces, first }, winner: null, turnNo: 1, seq: 0, log: [],
  };
  push(state, { type: "coin", face, first });
  push(state, { type: "turn", seat: first });
  return state;
}

function endTurn(state: GameState) {
  const next: Seat = state.turn === 0 ? 1 : 0;
  state.reviveOptions = state.deaths.filter((d) => d.victim === next);
  state.deaths = [];
  state.turn = next;
  state.phase = "throw";
  state.throwsLeft = 1;
  state.results = [];
  state.thrownThisTurn = false;
  state.extraUsedThisTurn = false;
  state.turnNo += 1;
  push(state, { type: "turn", seat: next });
}

/** 쓸 수 없는 결과(말이 없는데 빽도 등)를 정리하고 필요하면 턴을 넘긴다 */
function settle(state: GameState) {
  if (state.phase === "finished") return;
  if (state.throwsLeft > 0) { state.phase = "throw"; return; }
  state.results = state.results.filter((r) => {
    if (canMove(state, state.turn, r)) return true;
    push(state, { type: "skip", seat: state.turn, result: r });
    return false;
  });
  if (state.results.length === 0) endTurn(state);
  else state.phase = "move";
}

export function doThrow(state: GameState, seat: Seat, rng: Rng) {
  if (state.phase !== "throw" || state.turn !== seat) throw new GameError("지금은 윷을 던질 수 없습니다.");
  const { sticks, result } = throwSticks(rng);
  state.thrownThisTurn = true;
  state.reviveOptions = []; // 부활은 던지기 전에만
  state.results.push(result);
  if (result !== "yut" && result !== "mo") state.throwsLeft -= 1;
  push(state, { type: "throw", seat, result, sticks });
  settle(state);
}

export function doMove(state: GameState, seat: Seat, resultIndex: number, pieceId: number) {
  if (state.phase !== "move" || state.turn !== seat) throw new GameError("지금은 말을 움직일 수 없습니다.");
  const result = state.results[resultIndex];
  if (!result) throw new GameError("잘못된 윷 결과입니다.");
  const piece = state.pieces.find((p) => p.id === pieceId);
  if (!piece || piece.seat !== seat) throw new GameError("내 말이 아닙니다.");
  const mv = computePath(piece, result);
  if (!mv) throw new GameError("그 말은 움직일 수 없습니다.");

  const group = stackOf(state, piece);
  const dest = mv.path[mv.path.length - 1];
  const captured: Piece[] = [];
  if (dest === GOAL) {
    for (const p of group) { p.pos = GOAL; p.prev = null; }
  } else {
    for (const p of state.pieces) if (p.seat !== seat && p.pos === dest) captured.push(p);
    if (captured.length) {
      state.deaths.push({ victim: captured[0].seat, pieceIds: captured.map((p) => p.id), pos: dest, prev: captured[0].prev });
      for (const p of captured) { p.pos = HOME; p.prev = null; }
      state.throwsLeft += 1; // 잡으면 한 번 더
    }
    for (const p of group) { p.pos = dest; p.prev = mv.prev; }
  }
  state.results.splice(resultIndex, 1);
  push(state, {
    type: "move", seat, result, pieceIds: group.map((p) => p.id), path: mv.path,
    captured: captured.map((p) => p.id), finished: dest === GOAL,
  });

  if (state.pieces.filter((p) => p.seat === seat).every((p) => p.pos === GOAL)) {
    state.phase = "finished";
    state.winner = seat;
    push(state, { type: "win", seat, reason: "finish" });
    return;
  }
  settle(state);
}

/** 아이템 사용 가능 여부 (인벤토리 수량은 호출자가 확인) */
export function itemUsable(state: GameState, seat: Seat, item: ItemKind): string | null {
  if (state.turn !== seat || state.phase !== "throw") return "내 턴에만 사용할 수 있습니다.";
  if (state.thrownThisTurn) return "윷을 던지기 전에만 사용할 수 있습니다.";
  if (item === "extra_throw" && state.extraUsedThisTurn) return "이번 턴에 이미 사용했습니다.";
  if (item === "revive" && state.reviveOptions.length === 0) return "직전에 잡힌 말이 없습니다.";
  return null;
}

export function useItem(state: GameState, seat: Seat, item: ItemKind, reviveIndex = 0) {
  const err = itemUsable(state, seat, item);
  if (err) throw new GameError(err);
  if (item === "extra_throw") {
    state.throwsLeft += 1;
    state.extraUsedThisTurn = true;
    push(state, { type: "item", seat, item });
    return;
  }
  const d = state.reviveOptions[reviveIndex];
  if (!d) throw new GameError("부활할 말을 찾을 수 없습니다.");
  const revived: number[] = [];
  for (const id of d.pieceIds) {
    const p = state.pieces.find((x) => x.id === id)!;
    if (p.pos === HOME) { p.pos = d.pos; p.prev = d.prev; revived.push(id); }
  }
  state.reviveOptions.splice(reviveIndex, 1);
  push(state, { type: "item", seat, item, pieceIds: revived, pos: d.pos });
}

export function forfeit(state: GameState, loser: Seat) {
  if (state.phase === "finished") return;
  const w: Seat = loser === 0 ? 1 : 0;
  state.phase = "finished";
  state.winner = w;
  push(state, { type: "win", seat: w, reason: "forfeit" });
}

// ---------- PC(AI) ----------
export function chooseAiMove(state: GameState, seat: Seat): { resultIndex: number; pieceId: number } | null {
  const opp: Seat = seat === 0 ? 1 : 0;
  let best: { resultIndex: number; pieceId: number; score: number } | null = null;
  const seen = new Set<string>();
  for (let ri = 0; ri < state.results.length; ri++) {
    const r = state.results[ri];
    for (const p of state.pieces) {
      if (p.seat !== seat) continue;
      const key = `${r}:${p.pos === HOME ? "h" + p.id : p.pos}`;
      if (p.pos !== HOME && seen.has(key)) continue;
      seen.add(key);
      const mv = computePath(p, r);
      if (!mv) continue;
      const group = stackOf(state, p);
      const dest = mv.path[mv.path.length - 1];
      let score = 0;
      if (dest === GOAL) score += 60 * group.length;
      else {
        const caps = state.pieces.filter((x) => x.seat === opp && x.pos === dest).length;
        score += caps * 45;
        if (state.pieces.some((x) => x.seat === seat && x.pos === dest && x.pos !== HOME)) score += 8;
        const before = distToGoal(p.pos === HOME ? HOME : p.pos, p.prev);
        const after = distToGoal(dest, mv.prev);
        score += (before - after) * 2 * group.length;
        // 상대 말 1~5칸 뒤에 있으면 위험
        const danger = state.pieces.some((x) => {
          if (x.seat !== opp || x.pos === GOAL) return false;
          return (["do", "gae", "geol", "yut", "mo"] as Result[]).some((rr) => {
            const m = computePath(x, rr);
            return m && m.path[m.path.length - 1] === dest;
          });
        });
        if (danger) score -= 12 * group.length;
        if ([5, 10, 22].includes(dest)) score += 4; // 지름길
      }
      score += Math.random() * 0.5;
      if (!best || score > best.score) best = { resultIndex: ri, pieceId: p.id, score };
    }
  }
  return best && { resultIndex: best.resultIndex, pieceId: best.pieceId };
}

/** PC 턴이면 PC가 턴을 마칠 때까지 자동 진행 */
export function runAi(state: GameState, rng: Rng) {
  for (let guard = 0; guard < 200; guard++) {
    if (state.phase === "finished") return;
    const pl = state.players[state.turn];
    if (!pl.isPC) return;
    if (state.phase === "throw") doThrow(state, state.turn, rng);
    else {
      const m = chooseAiMove(state, state.turn);
      if (!m) { state.results = []; settle(state); continue; }
      doMove(state, state.turn, m.resultIndex, m.pieceId);
    }
  }
}
