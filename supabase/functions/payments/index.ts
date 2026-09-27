// 토스페이먼츠 테스트 결제: 주문 생성 → (브라우저 결제창) → 결제 승인 → 1원 = 1포인트 적립
// 시크릿 키는 서버 환경변수 TOSS_SECRET_KEY 에서만 읽는다.
import { admin, HttpError, requireUser, serve } from "../_shared/common.ts";

// 토스페이먼츠 문서에 공개된 테스트용 시크릿 키 (TOSS_SECRET_KEY 미설정 시 사용)
const DOCS_TEST_SECRET = "test_sk_zXLkKEypNArWmo50nX3lmeaxYG5R";
const MIN_AMOUNT = 100;
const MAX_AMOUNT = 1_000_000;

serve(async (req, body) => {
  const db = admin();
  const user = await requireUser(req, db);
  const action = String(body.action ?? "");

  if (action === "create") {
    const amount = Math.floor(Number(body.amount));
    if (!Number.isFinite(amount) || amount < MIN_AMOUNT || amount > MAX_AMOUNT)
      throw new HttpError(400, `결제 금액은 ${MIN_AMOUNT.toLocaleString()}원 ~ ${MAX_AMOUNT.toLocaleString()}원 사이여야 합니다.`);
    const orderId = `yut_${Date.now().toString(36)}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const orderName = `윷놀이 포인트 ${amount.toLocaleString()}P`;
    const { error } = await db.from("payments").insert({ order_id: orderId, user_id: user.id, amount, order_name: orderName });
    if (error) throw new HttpError(500, error.message);
    return { orderId, orderName, amount, customerKey: user.id };
  }

  if (action === "confirm") {
    const paymentKey = String(body.paymentKey ?? "");
    const orderId = String(body.orderId ?? "");
    const amount = Number(body.amount);
    const { data: order } = await db.from("payments").select("*").eq("order_id", orderId).maybeSingle();
    if (!order || order.user_id !== user.id) throw new HttpError(404, "주문을 찾을 수 없습니다.");
    if (order.status === "DONE") return { ok: true, already: true, amount: order.amount };
    if (order.amount !== amount) throw new HttpError(400, "결제 금액이 주문 금액과 다릅니다.");

    const secret = Deno.env.get("TOSS_SECRET_KEY") || DOCS_TEST_SECRET;
    const res = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
      method: "POST",
      headers: { Authorization: "Basic " + btoa(secret + ":"), "Content-Type": "application/json", "Idempotency-Key": orderId },
      body: JSON.stringify({ paymentKey, orderId, amount }),
    });
    const toss = await res.json();
    if (!res.ok || toss.status !== "DONE") {
      await db.from("payments").update({ status: "FAILED" }).eq("order_id", orderId).eq("status", "READY");
      throw new HttpError(400, `결제 승인 실패: ${toss.message ?? toss.code ?? res.status}`);
    }

    // READY → DONE 전이에 성공한 요청만 포인트 적립 (중복 적립 방지)
    const { data: updated } = await db.from("payments")
      .update({ status: "DONE", payment_key: paymentKey, method: toss.method ?? null, approved_at: toss.approvedAt ?? new Date().toISOString() })
      .eq("order_id", orderId).eq("status", "READY").select("order_id");
    if (updated?.length) await db.rpc("credit_points", { p_user: user.id, p_amount: order.amount });
    return { ok: true, amount: order.amount };
  }

  throw new HttpError(400, "알 수 없는 요청입니다.");
});
