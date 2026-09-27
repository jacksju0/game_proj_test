import type { ReactNode } from "react";
import { supabase } from "../lib/supabase";
import type { Profile } from "../lib/types";

export function ProfileBar({ profile, children, compact }: { profile: Profile; children?: ReactNode; compact?: boolean }) {
  const rate = profile.total_games ? Math.round((profile.wins / profile.total_games) * 100) : 0;
  return (
    <header className={`topbar ${compact ? "compact" : ""}`}>
      <div className="brand">윷놀이</div>
      <div className="me-card">
        <div className="me-name">{profile.name} <span className="muted small">@{profile.username}</span></div>
        <div className="me-stats">
          <span>총 {profile.total_games}판</span>
          <span className="win">{profile.wins}승</span>
          <span className="lose">{profile.losses}패</span>
          <span className="muted">승률 {rate}%</span>
        </div>
      </div>
      <div className="me-wallet">
        <span className="pill">💰 {profile.points.toLocaleString()}P</span>
        <span className="pill" title="한번 더 던지기">🎯 {profile.item_extra_throw}</span>
        <span className="pill" title="죽은 말 부활하기">💫 {profile.item_revive}</span>
      </div>
      <div className="topbar-actions">
        {children}
        {!compact && <button className="btn btn-ghost" onClick={() => supabase.auth.signOut()}>로그아웃</button>}
      </div>
    </header>
  );
}
