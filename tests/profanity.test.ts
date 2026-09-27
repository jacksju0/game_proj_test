import { hasProfanity } from "../supabase/functions/_shared/profanity.ts";
const bad = ["씨발", "씨 1 발 뭐야", "ㅅㅂ", "병.신", "개새끼야", "존나 좋네", "f.u.c.k", "sh1t", "미친놈"];
const ok = ["안녕하세요", "좋은 게임이었어요", "새끼손가락 걸고 약속", "수박씨발라먹기", "윷 나와라!", "모 나왔다", "hello"];
let fail = 0;
for (const t of bad) if (!hasProfanity(t)) { console.log("MISSED:", t); fail++; }
for (const t of ok) if (hasProfanity(t)) { console.log("FALSE POSITIVE:", t); fail++; }
console.log(fail ? `${fail} failures` : "profanity ok");
if (fail) process.exit(1);
