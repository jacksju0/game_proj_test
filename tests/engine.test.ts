import { newGame, runAi, computePath, HOME, GOAL, doThrow, useItem, itemUsable, type Player, type GameState } from "../supabase/functions/_shared/yut.ts";
const rng = Math.random;
const assert = (c: unknown, m: string) => { if (!c) { throw new Error("FAIL: " + m); } };
const pc = (seat: 0|1): Player => ({ seat, userId: null, username: "pc"+seat, name: "PC"+seat, isPC: true });

// 경로 규칙
const P = (pos: number, prev: number|null = null) => ({ id: 0, seat: 0 as const, pos, prev });
assert(JSON.stringify(computePath(P(HOME), "do")!.path) === "[1]", "home do");
assert(JSON.stringify(computePath(P(HOME), "mo")!.path) === "[1,2,3,4,5]", "home mo");
assert(JSON.stringify(computePath(P(5,4), "gae")!.path) === "[20,21]", "corner5 shortcut");
assert(JSON.stringify(computePath(P(4,3), "gae")!.path) === "[5,6]", "pass corner5");
assert(JSON.stringify(computePath(P(20,5), "mo")!.path) === "[21,22,23,24,15]", "pass center via A");
assert(JSON.stringify(computePath(P(22,21), "geol")!.path) === `[27,28,${GOAL}]`, "stop center -> goal");
assert(JSON.stringify(computePath(P(10,9), "yut")!.path) === "[25,26,22,27]", "corner10 shortcut");
assert(JSON.stringify(computePath(P(19,18), "do")!.path) === `[${GOAL}]`, "19 -> goal");
assert(computePath(P(HOME), "backdo") === null, "home backdo");
assert(JSON.stringify(computePath(P(1,0), "backdo")!.path) === "[0]", "1 backdo -> 0");
assert(JSON.stringify(computePath(P(0,null), "do")!.path) === `[${GOAL}]`, "0 forward -> goal");
assert(JSON.stringify(computePath(P(15,24), "backdo")!.path) === "[24]", "backdo uses prev");

let wins = [0,0], turns = 0, captures = 0;
for (let g = 0; g < 2000; g++) {
  const s = newGame("pvc", [pc(0), pc(1)], rng);
  // runAi는 한 번에 최대 200 동작만 진행하므로 PC끼리의 전체 게임은 반복 호출
  for (let k = 0; k < 50 && s.phase !== "finished"; k++) runAi(s, rng);
  assert(s.phase === "finished", "game did not finish " + g);
  assert(s.pieces.filter(p => p.seat === s.winner).every(p => p.pos === GOAL), "winner all goal");
  wins[s.winner!]++; turns += s.turnNo;
  captures += s.log.filter(e => e.type === "move" && e.captured.length).length;
}
console.log("2000 games ok. wins", wins, "avg turns", (turns/2000).toFixed(1));

// 부활 아이템: 잡힌 직후 턴에만
const human = (seat: 0|1): Player => ({ seat, userId: "u"+seat, username: "u"+seat, name: "U"+seat, isPC: false });
let found = false;
for (let t = 0; t < 500 && !found; t++) {
  const s: GameState = newGame("pvp", [human(0), human(1)], rng);
  for (let k = 0; k < 400 && s.phase !== "finished"; k++) {
    if (s.reviveOptions.length) {
      const d = s.reviveOptions[0];
      assert(itemUsable(s, s.turn, "revive") === null, "revive usable");
      useItem(s, s.turn, "revive", 0);
      assert(d.pieceIds.every(id => s.pieces[id].pos === d.pos), "revived at death pos");
      found = true; break;
    }
    // 사람 차례도 AI로 진행
    s.players[s.turn].isPC = true; runAi(s, rng); s.players[0].isPC = false; s.players[1].isPC = false;
  }
}
assert(found, "revive scenario");
const s2 = newGame("pvp", [human(0), human(1)], rng);
useItem(s2, s2.turn, "extra_throw");
assert(s2.throwsLeft === 2, "extra throw");
doThrow(s2, s2.turn, rng);
assert(itemUsable(s2, s2.turn, "extra_throw") !== null, "no item after throw");
console.log("item tests ok");
