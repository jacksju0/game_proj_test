import { useState } from "react";
import { Modal } from "./Modal";
import { supabase } from "../lib/supabase";
import { toast } from "../lib/toast";
import type { Profile } from "../lib/types";
import { ITEM_NAME, ITEM_PRICE, type ItemKind } from "../../supabase/functions/_shared/yut.ts";

const DESC: Record<ItemKind, string> = {
  extra_throw: "내 턴 시작 시 윷을 던지기 전에 사용하면 윷을 한 번 더 던질 수 있어요. (턴당 1회)",
  revive: "상대에게 내 말이 잡힌 직후, 다음 내 턴에 윷을 던지기 전에 사용하면 잡힌 자리에서 부활해요.",
};
const ICON: Record<ItemKind, string> = { extra_throw: "🎯", revive: "💫" };

export function ShopModal({ profile, onClose, onBought }: { profile: Profile; onClose: () => void; onBought: (p: Profile) => void }) {
  const [qty, setQty] = useState<Record<ItemKind, number>>({ extra_throw: 1, revive: 1 });
  const [busy, setBusy] = useState(false);
  const owned: Record<ItemKind, number> = { extra_throw: profile.item_extra_throw, revive: profile.item_revive };

  async function buy(item: ItemKind) {
    setBusy(true);
    const { data, error } = await supabase.rpc("buy_item", { p_item: item, p_qty: qty[item] });
    setBusy(false);
    if (error) return toast(error.message, "error");
    onBought(data as Profile);
    toast(`${ITEM_NAME[item]} ${qty[item]}개를 구입했습니다.`, "success");
  }

  return (
    <Modal title="아이템 구매" onClose={onClose} width={520}>
      <div className="pay-summary"><span>보유 포인트</span><b>{profile.points.toLocaleString()} P</b></div>
      {(Object.keys(ITEM_NAME) as ItemKind[]).map((item) => (
        <div className="shop-item" key={item}>
          <div className="shop-icon">{ICON[item]}</div>
          <div className="shop-info">
            <div className="shop-name">{ITEM_NAME[item]} <span className="badge">보유 {owned[item]}개</span></div>
            <div className="muted small">{DESC[item]}</div>
            <div className="shop-buy">
              <b>{ITEM_PRICE[item].toLocaleString()}P</b>
              <input type="number" min={1} max={99} value={qty[item]}
                onChange={(e) => setQty((q) => ({ ...q, [item]: Math.max(1, Math.min(99, Math.floor(Number(e.target.value) || 1))) }))} />
              <button className="btn btn-primary" disabled={busy || profile.points < ITEM_PRICE[item] * qty[item]} onClick={() => buy(item)}>
                {(ITEM_PRICE[item] * qty[item]).toLocaleString()}P 구입
              </button>
            </div>
          </div>
        </div>
      ))}
      {profile.points < ITEM_PRICE.extra_throw && <p className="muted small">포인트가 부족하면 "포인트 구매"에서 충전하세요.</p>}
    </Modal>
  );
}
