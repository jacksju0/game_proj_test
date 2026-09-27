import { useEffect, useRef, useState } from "react";
import { call, supabase } from "../lib/supabase";
import { toast } from "../lib/toast";
import type { ChatMessage } from "../lib/types";

/** roomId 가 없으면 대기실(로비) 전체 채팅, 있으면 해당 방 참가자 전용 채팅 */
export function Chat({ roomId, title, myId }: { roomId: string | null; title: string; myId: string }) {
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const channel = roomId ? `room:${roomId}` : "lobby";

  useEffect(() => {
    let alive = true;
    supabase.from("chat_messages").select("*").eq("channel", channel).order("id", { ascending: false }).limit(50)
      .then(({ data }) => { if (alive && data) setMsgs((data as ChatMessage[]).reverse()); });
    const ch = supabase.channel(`chat-${channel}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "chat_messages",
        filter: roomId ? `room_id=eq.${roomId}` : "channel=eq.lobby",
      }, (p) => {
        const m = p.new as ChatMessage;
        setMsgs((s) => (s.some((x) => x.id === m.id) ? s : [...s, m].slice(-100)));
      })
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, [channel, roomId]);

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [msgs]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const r = await call<{ filtered: boolean }>("chat", { content, roomId });
      setText("");
      if (r.filtered) toast("비속어는 사용 할 수 없습니다.", "error");
    } catch (err) { toast((err as Error).message, "error"); }
    finally { setSending(false); }
  }

  return (
    <div className="chat panel">
      <div className="panel-title">💬 {title}</div>
      <div className="chat-list" ref={listRef}>
        {msgs.length === 0 && <div className="muted small center">아직 대화가 없습니다.</div>}
        {msgs.map((m) => (
          <div key={m.id} className={`chat-msg ${m.user_id === myId ? "mine" : ""}`}>
            <span className="chat-name">{m.name}</span>
            <span className={`chat-text ${m.filtered ? "filtered" : ""}`}>{m.content}</span>
          </div>
        ))}
      </div>
      <form className="chat-form" onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={200} placeholder="메시지를 입력하세요" />
        <button className="btn" disabled={sending || !text.trim()}>전송</button>
      </form>
    </div>
  );
}
