import { useEffect, useState } from "react";
import { loadTossPayments } from "@tosspayments/tosspayments-sdk";
import { Modal } from "./Modal";
import { call, supabase } from "../lib/supabase";
import { toast } from "../lib/toast";
import { TOSS_CLIENT_KEY } from "../config";
import type { Payment, Profile } from "../lib/types";

const PRESETS = [1000, 3000, 5000, 10000, 30000];

export function PointsModal({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const [amount, setAmount] = useState(5000);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Payment[]>([]);

  useEffect(() => {
    supabase.from("payments").select("*").eq("status", "DONE").order("created_at", { ascending: false }).limit(20)
      .then(({ data }) => setHistory((data ?? []) as Payment[]));
  }, []);

  async function pay() {
    if (!Number.isInteger(amount) || amount < 100) return toast("100원 이상 입력해주세요.", "error");
    setBusy(true);
    try {
      const order = await call<{ orderId: string; orderName: string; amount: number; customerKey: string }>("payments", { action: "create", amount });
      const tossPayments = await loadTossPayments(TOSS_CLIENT_KEY);
      const payment = tossPayments.payment({ customerKey: order.customerKey });
      const base = window.location.origin + window.location.pathname;
      await payment.requestPayment({
        method: "CARD",
        amount: { currency: "KRW", value: order.amount },
        orderId: order.orderId,
        orderName: order.orderName,
        customerName: profile.name,
        successUrl: `${base}?pay=success`,
        failUrl: `${base}?pay=fail`,
      });
    } catch (e) {
      const err = e as { code?: string; message?: string };
      if (err.code !== "USER_CANCEL") toast(err.message ?? "결제를 시작하지 못했습니다.", "error");
      setBusy(false);
    }
  }

  return (
    <Modal title="포인트 구매" onClose={onClose}>
      <p className="muted">토스페이먼츠 <b>테스트 결제</b>입니다. 실제로 돈이 빠져나가지 않아요. <b>1원 = 1포인트</b></p>
      <div className="preset-grid">
        {PRESETS.map((p) => (
          <button key={p} className={`chip ${amount === p ? "active" : ""}`} onClick={() => setAmount(p)}>{p.toLocaleString()}원</button>
        ))}
      </div>
      <label className="field">
        <span>직접 입력 (원)</span>
        <input type="number" min={100} step={100} value={amount} onChange={(e) => setAmount(Math.floor(Number(e.target.value)))} />
      </label>
      <div className="pay-summary">
        <span>충전 포인트</span><b>{(amount || 0).toLocaleString()} P</b>
      </div>
      <button className="btn btn-primary btn-block" onClick={pay} disabled={busy}>
        {busy ? "결제창 여는 중..." : `${(amount || 0).toLocaleString()}원 결제하기`}
      </button>

      <h4 className="section-title">최근 충전 내역</h4>
      {history.length === 0 ? <div className="muted small">충전 내역이 없습니다.</div> : (
        <ul className="history">
          {history.map((h) => (
            <li key={h.order_id}>
              <span>{new Date(h.approved_at ?? h.created_at).toLocaleString("ko-KR")}</span>
              <span className="muted small">{h.method ?? ""}</span>
              <b>+{h.amount.toLocaleString()}P</b>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
