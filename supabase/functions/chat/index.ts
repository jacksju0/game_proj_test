// 채팅 전송: Gemini로 비속어를 판단하고, 탐지되면 원문 대신 안내 문구를 저장·전파한다.
import { admin, HttpError, requireUser, serve } from "../_shared/common.ts";
import { detectProfanity, PROFANITY_NOTICE } from "../_shared/profanity.ts";

serve(async (req, body) => {
  const db = admin();
  const user = await requireUser(req, db);
  const content = String(body.content ?? "").trim();
  const roomId = body.roomId ? String(body.roomId) : null;
  if (!content) throw new HttpError(400, "메시지를 입력해주세요.");
  if (content.length > 200) throw new HttpError(400, "메시지는 200자 이하로 입력해주세요.");

  const { data: profile } = await db.from("profiles").select("username,name").eq("id", user.id).single();
  if (!profile) throw new HttpError(403, "회원 정보를 찾을 수 없습니다.");

  if (roomId) {
    const { data: member } = await db.from("room_players").select("user_id").eq("room_id", roomId).eq("user_id", user.id).maybeSingle();
    if (!member) throw new HttpError(403, "이 방의 참가자만 채팅할 수 있습니다.");
  }

  const { profane: filtered, source } = await detectProfanity(content);
  const { error } = await db.from("chat_messages").insert({
    channel: roomId ? `room:${roomId}` : "lobby",
    room_id: roomId,
    user_id: user.id,
    username: profile.username,
    name: profile.name,
    content: filtered ? PROFANITY_NOTICE : content,
    filtered,
  });
  if (error) throw new HttpError(500, error.message);
  return { ok: true, filtered, source };
});
