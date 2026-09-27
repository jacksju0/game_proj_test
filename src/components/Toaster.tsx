import { useEffect, useState } from "react";
import { onToast, type ToastItem } from "../lib/toast";

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => onToast((t) => {
    setItems((s) => [...s, t]);
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== t.id)), 3200);
  }), []);
  return (
    <div className="toaster">
      {items.map((t) => <div key={t.id} className={`toast toast-${t.kind}`}>{t.msg}</div>)}
    </div>
  );
}
