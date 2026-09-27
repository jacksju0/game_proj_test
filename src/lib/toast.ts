type Kind = "info" | "error" | "success";
export interface ToastItem { id: number; msg: string; kind: Kind }
type Listener = (t: ToastItem) => void;
const listeners = new Set<Listener>();
let n = 0;
export function toast(msg: string, kind: Kind = "info") {
  const t = { id: ++n, msg, kind };
  listeners.forEach((l) => l(t));
}
export function onToast(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; }
