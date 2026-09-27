import { useEffect, useMemo, useRef, useState } from "react";
import { call } from "../lib/supabase";
import { toast } from "../lib/toast";
import type { Profile, Room } from "../lib/types";
import { Chat } from "../components/Chat";
import { Board3D, SEAT_COLOR } from "./Board3D";
import { CoinOverlay, YutThrowOverlay } from "./Overlays3D";
import {
  computePath, GOAL, HOME, ITEM_NAME, itemUsable, RESULT_NAME, stackOf,
  type GameEvent, type GameState, type ItemKind, type Piece, type Seat,
} from "../../supabase/functions/_shared/yut.ts";

type Overlay =
  | { kind: "throw"; sticks: boolean[]; label: string | null; sub: string; key: number }
  | { kind: "coin"; face: "앞" | "뒤"; text: string; show: boolean; key: number };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clone = (ps: Piece[]) => ps.map((p) => ({ ...p }));

function seenKey(roomId: string) { return `yut-seen-${roomId}`; }
function initialSeen(roomId: string, st: GameState): number {
  let saved: number | null = null;
  try { const v = sessionStorage.getItem(seenKey(roomId)); saved = v === null ? null : Number(v); } catch { /* ignore */ }
  const fresh = st.log[0]?.seq === 1; // 게임 시작부터의 기록이 남아 있음
  if (saved === null || saved > st.seq) return fresh ? 0 : st.seq;
  return saved;
}

export function GameScreen({ room, profile, onRefresh, onLeave, onBackToRoom, onPlayAgain }: {
  room: Room; profile: Profile; onRefresh: () => Promise<void>; onLeave: () => void;
  onBackToRoom?: () => void; onPlayAgain?: () => void;
}) {
  const state = room.state!;
  const mySeat = state.players.findIndex((p) => p.userId === profile.id) as Seat | -1;
  const names = state.players.map((p) => (p.userId === profile.id ? `${p.name}(나)` : p.name));

  const [shown, setShown] = useState<Piece[]>(() => clone(state.pieces));
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [selResult, setSelResult] = useState(0);
  const [showChat, setShowChat] = useState(true);

  const seen = useRef<number>(initialSeen(room.id, state));
  const [played, setPlayed] = useState(seen.current); // 애니메이션까지 끝난 이벤트 seq
  const queue = useRef<GameEvent[]>([]);
  const running = useRef(false);
  const work = useRef<Piece[]>(clone(state.pieces));
  const latest = useRef(state);
  latest.current = state;
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  // 이벤트 → 애니메이션 큐
  useEffect(() => {
    const evs = state.log.filter((e) => e.seq > seen.current);
    if (evs.length === 0) {
      if (!running.current) { work.current = clone(state.pieces); setShown(clone(state.pieces)); }
      return;
    }
    if (!running.current && seen.current === 0) {
      // 게임 시작부터 재생: 모든 말을 대기 상태로
      work.current = state.pieces.map((p) => ({ ...p, pos: HOME, prev: null }));
      setShown(clone(work.current));
    }
    seen.current = state.seq;
    try { sessionStorage.setItem(seenKey(room.id), String(state.seq)); } catch { /* ignore */ }
    queue.current.push(...evs);
    if (!running.current) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.seq]);

  async function run() {
    running.current = true;
    setBusy(true);
    while (queue.current.length && alive.current) {
      const ev = queue.current.shift()!;
      await play(ev);
      setPlayed(ev.seq);
    }
    if (!alive.current) return;
    work.current = clone(latest.current.pieces);
    setShown(clone(latest.current.pieces));
    running.current = false;
    setBusy(false);
  }

  async function play(ev: GameEvent) {
    const nm = (s: Seat) => latest.current.players[s].name;
    switch (ev.type) {
      case "coin": {
        const text = `${ev.face}면! ${nm(ev.first)}님이 먼저 시작합니다`;
        setOverlay({ kind: "coin", face: ev.face, text, show: false, key: ev.seq });
        await sleep(2000);
        setOverlay({ kind: "coin", face: ev.face, text, show: true, key: ev.seq });
        await sleep(1500);
        setOverlay(null);
        break;
      }
      case "turn":
        setBanner(`${nm(ev.seat)}님의 차례`);
        await sleep(750);
        setBanner(null);
        break;
      case "throw": {
        const sub = `${nm(ev.seat)}님이 윷을 던집니다`;
        setOverlay({ kind: "throw", sticks: ev.sticks, label: null, sub, key: ev.seq });
        await sleep(1250);
        const extra = ev.result === "yut" || ev.result === "mo" ? " · 한 번 더!" : "";
        setOverlay({ kind: "throw", sticks: ev.sticks, label: `${RESULT_NAME[ev.result]}!${extra}`, sub, key: ev.seq });
        await sleep(850);
        setOverlay(null);
        break;
      }
      case "move": {
        for (const node of ev.path) {
          for (const id of ev.pieceIds) {
            const p = work.current.find((x) => x.id === id);
            if (p) p.pos = node;
          }
          setShown(clone(work.current));
          await sleep(260);
        }
        if (ev.captured.length) {
          for (const id of ev.captured) { const p = work.current.find((x) => x.id === id); if (p) p.pos = HOME; }
          setShown(clone(work.current));
          setBanner(`💥 ${nm(ev.seat)}님이 말을 잡았습니다! 한 번 더!`);
          await sleep(1000);
          setBanner(null);
        } else if (ev.finished) {
          setBanner(`🏁 말이 났습니다!`);
          await sleep(700);
          setBanner(null);
        }
        break;
      }
      case "item": {
        if (ev.item === "revive" && ev.pieceIds && ev.pos !== undefined) {
          for (const id of ev.pieceIds) { const p = work.current.find((x) => x.id === id); if (p) p.pos = ev.pos!; }
          setShown(clone(work.current));
        }
        setBanner(`✨ ${nm(ev.seat)}님이 [${ITEM_NAME[ev.item]}] 사용!`);
        await sleep(1100);
        setBanner(null);
        break;
      }
      case "skip":
        setBanner(`${RESULT_NAME[ev.result]} — 움직일 말이 없어 넘어갑니다`);
        await sleep(1000);
        setBanner(null);
        break;
      case "win":
        break;
    }
  }

  // ----- 조작 -----
  const myTurn = mySeat !== -1 && state.turn === mySeat && state.phase !== "finished";
  const canAct = myTurn && !busy && !pending;
  useEffect(() => { setSelResult(0); }, [state.results.length, state.turn]);
  const curResult = state.results[Math.min(selResult, state.results.length - 1)];

  const selectable = useMemo(() => {
    const s = new Set<number>();
    if (!canAct || state.phase !== "move" || !curResult) return s;
    let homeAdded = false;
    for (const p of state.pieces) {
      if (p.seat !== mySeat || !computePath(p, curResult)) continue;
      if (p.pos === HOME) { if (homeAdded) continue; homeAdded = true; }
      s.add(p.id);
    }
    return s;
  }, [canAct, state, curResult, mySeat]);

  const destOf = (id: number) => {
    const p = state.pieces.find((x) => x.id === id);
    const mv = p && curResult ? computePath(p, curResult) : null;
    return mv ? mv.path[mv.path.length - 1] : null;
  };

  async function act(body: Record<string, unknown>) {
    setPending(true);
    try { await call("game", { roomId: room.id, ...body }); await onRefresh(); }
    catch (e) { toast((e as Error).message, "error"); }
    finally { setPending(false); }
  }

  const onPieceClick = (id: number) => {
    if (!selectable.has(id)) return;
    const idx = state.results.indexOf(curResult);
    void act({ action: "move", pieceId: id, resultIndex: idx });
  };

  const inv: Record<ItemKind, number> = { extra_throw: profile.item_extra_throw, revive: profile.item_revive };
  const itemBlock = (item: ItemKind) => (mySeat === -1 ? "관전 중" : inv[item] <= 0 ? "보유 아이템 없음" : itemUsable(state, mySeat, item));

  // ----- 표시용 -----
  const counts = (seat: Seat) => {
    const ps = shown.filter((p) => p.seat === seat);
    return { home: ps.filter((p) => p.pos === HOME).length, goal: ps.filter((p) => p.pos === GOAL).length, board: ps.filter((p) => p.pos !== HOME && p.pos !== GOAL).length };
  };
  const finished = state.phase === "finished" && !busy;
  const iWon = state.winner === mySeat;
  const lastWin = [...state.log].reverse().find((e) => e.type === "win") as Extract<GameEvent, { type: "win" }> | undefined;
  const logLines = state.log.filter((e) => e.seq <= played && ["throw", "move", "item", "skip"].includes(e.type)).slice(-8).reverse();

  const stackInfo = (() => {
    if (state.phase !== "move" || !myTurn) return null;
    const onBoard = state.pieces.filter((p) => p.seat === mySeat && p.pos !== HOME && p.pos !== GOAL);
    const stacked = onBoard.filter((p) => stackOf(state, p).length > 1);
    return stacked.length ? "업힌 말은 함께 움직입니다" : null;
  })();

  return (
    <div className="game-page">
      <div className="game-stage">
        <Board3D pieces={shown} selectable={selectable} onPieceClick={onPieceClick} destOf={destOf} />
        {banner && <div className="banner pop" key={banner}>{banner}</div>}
        {!busy && myTurn && (
          <div className="turn-hint">
            {state.phase === "throw" ? "내 차례! 윷을 던지세요" : "움직일 말을 선택하세요 (반짝이는 말)"}
          </div>
        )}
        {!busy && !myTurn && state.phase !== "finished" && (
          <div className="turn-hint muted-hint">{state.players[state.turn].name}님의 차례를 기다리는 중…</div>
        )}
        {overlay?.kind === "throw" && <YutThrowOverlay key={overlay.key} sticks={overlay.sticks} label={overlay.label} sub={overlay.sub} />}
        {overlay?.kind === "coin" && <CoinOverlay key={overlay.key} face={overlay.face} text={overlay.text} showResult={overlay.show} />}
      </div>

      <aside className="game-side">
        <div className="panel">
          <div className="panel-title">🎲 {room.name} <span className="muted small">{state.mode === "pvc" ? "사람 vs PC" : "사람 vs 사람"}</span></div>
          {([0, 1] as Seat[]).map((s) => {
            const c = counts(s);
            return (
              <div key={s} className={`player-row ${state.turn === s && state.phase !== "finished" ? "active" : ""}`}>
                <span className="dot" style={{ background: SEAT_COLOR[s] }} />
                <div className="player-main">
                  <div className="player-name">{names[s]} {state.players[s].isPC && "🤖"}</div>
                  <div className="muted small">동전 {state.coin.faces[s]}면 · 대기 {c.home} · 판 {c.board} · 완주 {c.goal}/4</div>
                </div>
                {state.turn === s && state.phase !== "finished" && <span className="badge badge-gold">차례</span>}
              </div>
            );
          })}
        </div>

        {mySeat !== -1 && state.phase !== "finished" && (
          <div className="panel controls">
            <div className="panel-title">내 조작</div>
            <div className="results-row">
              <span className="muted small">나온 윷</span>
              {(!myTurn || busy || state.results.length === 0) && <span className="muted small">-</span>}
              {myTurn && !busy && state.results.map((r, i) => (
                <button key={i} className={`chip ${i === Math.min(selResult, state.results.length - 1) ? "active" : ""}`}
                  onClick={() => setSelResult(i)} disabled={state.phase !== "move"}>{RESULT_NAME[r]}</button>
              ))}
            </div>
            {stackInfo && <div className="muted small">{stackInfo}</div>}
            <button className="btn btn-primary btn-lg btn-block" disabled={!canAct || state.phase !== "throw"} onClick={() => act({ action: "throw" })}>
              {pending ? "…" : state.phase === "throw" && myTurn ? `🥢 윷 던지기${state.throwsLeft > 1 ? ` (${state.throwsLeft}번)` : ""}` : "윷 던지기"}
            </button>
            <div className="items-row">
              {(["extra_throw", "revive"] as ItemKind[]).map((item) => {
                const why = itemBlock(item);
                if (item === "revive" && !why && state.reviveOptions.length > 1) {
                  return state.reviveOptions.map((d, i) => (
                    <button key={i} className="btn btn-item" disabled={!canAct} onClick={() => act({ action: "item", item, reviveIndex: i })}>
                      💫 부활 (말 {d.pieceIds.length}개) <span className="muted small">보유 {inv[item]}</span>
                    </button>
                  ));
                }
                return (
                  <button key={item} className="btn btn-item" disabled={!canAct || !!why} title={why ?? ""}
                    onClick={() => act({ action: "item", item, reviveIndex: 0 })}>
                    {item === "extra_throw" ? "🎯" : "💫"} {ITEM_NAME[item]} <span className="muted small">보유 {inv[item]}</span>
                  </button>
                );
              })}
            </div>
            <div className="muted tiny">아이템은 내 턴에 윷을 던지기 전에만 쓸 수 있어요.</div>
          </div>
        )}

        <div className="panel log-panel">
          <div className="panel-title">📜 기록</div>
          <ul className="log">
            {logLines.map((e) => <li key={e.seq}>{describe(e, names)}</li>)}
          </ul>
        </div>

        <div className="side-actions">
          <button className="btn btn-ghost" onClick={() => setShowChat((v) => !v)}>{showChat ? "채팅 숨기기" : "채팅 보기"}</button>
          <button className="btn btn-danger" onClick={onLeave}>{state.phase === "finished" ? "나가기" : "기권하고 나가기"}</button>
        </div>
        {showChat && <Chat roomId={room.id} title="게임 채팅 (이 방 참가자만)" myId={profile.id} />}
      </aside>

      {finished && (
        <div className="modal-backdrop">
          <div className="modal result-modal">
            <div className={`result-title ${iWon ? "win" : "lose"}`}>{mySeat === -1 ? "게임 종료" : iWon ? "🎉 승리!" : "😢 패배"}</div>
            <p>{state.winner !== null && `${state.players[state.winner].name}님이 이겼습니다.`}{lastWin?.reason === "forfeit" && " (상대 기권)"}</p>
            <p className="muted small">전적: 총 {profile.total_games}판 · {profile.wins}승 {profile.losses}패</p>
            <div className="result-actions">
              {onBackToRoom && <button className="btn btn-primary" onClick={onBackToRoom}>방으로 돌아가기</button>}
              {onPlayAgain && <button className="btn btn-primary" onClick={onPlayAgain}>한 판 더</button>}
              <button className="btn btn-ghost" onClick={onLeave}>로비로</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function describe(e: GameEvent, names: string[]): string {
  switch (e.type) {
    case "throw": return `${names[e.seat]}: ${RESULT_NAME[e.result]}`;
    case "move": return `${names[e.seat]}: ${RESULT_NAME[e.result]}로 말 ${e.pieceIds.length > 1 ? `${e.pieceIds.length}개(업음) ` : ""}이동${e.captured.length ? " · 잡기!" : ""}${e.finished ? " · 완주!" : ""}`;
    case "item": return `${names[e.seat]}: [${ITEM_NAME[e.item]}] 사용`;
    case "skip": return `${names[e.seat]}: ${RESULT_NAME[e.result]} (이동 불가)`;
    default: return "";
  }
}
