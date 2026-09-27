// 회원가입: 이름 / 아이디 / 비밀번호. 비밀번호는 Supabase Auth가 해시로 저장한다.
import { admin, HttpError, serve } from "../_shared/common.ts";

export const emailOf = (username: string) => `${username}@yutnori.game`;

serve(async (_req, body) => {
  const name = String(body.name ?? "").trim();
  const username = String(body.username ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  if (name.length < 1 || name.length > 20) throw new HttpError(400, "이름은 1~20자로 입력해주세요.");
  if (!/^[a-z0-9_]{4,16}$/.test(username)) throw new HttpError(400, "아이디는 영문 소문자/숫자/_ 4~16자로 입력해주세요.");
  if (password.length < 6 || password.length > 72) throw new HttpError(400, "비밀번호는 6자 이상이어야 합니다.");

  const db = admin();
  const { data: exists } = await db.from("profiles").select("id").eq("username", username).maybeSingle();
  if (exists) throw new HttpError(409, "이미 사용 중인 아이디입니다.");

  const { data, error } = await db.auth.admin.createUser({
    email: emailOf(username), password, email_confirm: true, user_metadata: { name, username },
  });
  if (error || !data.user) {
    if (/already/i.test(error?.message ?? "")) throw new HttpError(409, "이미 사용 중인 아이디입니다.");
    throw new HttpError(400, error?.message ?? "회원가입에 실패했습니다.");
  }
  const { error: pErr } = await db.from("profiles").insert({ id: data.user.id, username, name });
  if (pErr) {
    await db.auth.admin.deleteUser(data.user.id);
    throw new HttpError(400, "회원가입에 실패했습니다: " + pErr.message);
  }
  return { ok: true };
});
