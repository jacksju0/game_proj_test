import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function admin(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireUser(req: Request, db: SupabaseClient): Promise<User> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "로그인이 필요합니다.");
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "로그인이 만료되었습니다. 다시 로그인해주세요.");
  return data.user;
}

/** 공통 핸들러 래퍼: CORS, JSON 파싱, 에러 → JSON */
export function serve(handler: (req: Request, body: Record<string, unknown>) => Promise<unknown>) {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    try {
      const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
      return json(await handler(req, body as Record<string, unknown>));
    } catch (e) {
      const status = e instanceof HttpError ? e.status : (e as Error)?.name === "GameError" ? 400 : 500;
      if (status === 500) console.error(e);
      return json({ error: (e as Error).message ?? "서버 오류" }, status);
    }
  });
}
