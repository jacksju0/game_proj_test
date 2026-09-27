import { useState } from "react";
import { call, emailOf, supabase } from "../lib/supabase";
import { toast } from "../lib/toast";

export function AuthScreen() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        if (password !== password2) throw new Error("비밀번호가 일치하지 않습니다.");
        await call("signup", { name, username, password });
        toast("회원가입 완료! 바로 입장합니다.", "success");
      }
      const { error } = await supabase.auth.signInWithPassword({ email: emailOf(username), password });
      if (error) throw new Error(error.message.includes("Invalid") ? "아이디 또는 비밀번호가 올바르지 않습니다." : error.message);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-hero">
        <div className="logo">윷놀이</div>
        <div className="logo-sub">3D 전통 윷놀이 · 사람 vs 사람 · 사람 vs PC</div>
        <div className="hero-sticks" aria-hidden>
          <span /><span /><span /><span />
        </div>
      </div>
      <form className="auth-card panel" onSubmit={submit}>
        <div className="tabs">
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>로그인</button>
          <button type="button" className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>회원가입</button>
        </div>
        {mode === "signup" && (
          <label className="field"><span>이름</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} required placeholder="홍길동" />
          </label>
        )}
        <label className="field"><span>아이디</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="username"
            pattern="[A-Za-z0-9_]{4,16}" title="영문/숫자/_ 4~16자" placeholder="영문·숫자 4~16자" />
        </label>
        <label className="field"><span>비밀번호</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6}
            autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="6자 이상" />
        </label>
        {mode === "signup" && (
          <label className="field"><span>비밀번호 확인</span>
            <input type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} required minLength={6} autoComplete="new-password" />
          </label>
        )}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? "처리 중…" : mode === "login" ? "로그인" : "가입하고 시작하기"}</button>
        <p className="muted small center">회원가입 후 게임을 할 수 있습니다.</p>
      </form>
    </div>
  );
}
