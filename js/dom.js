export const $ = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => [...root.querySelectorAll(s)];

// textContent で組み立てるので、ユーザー入力をそのまま渡しても安全
export function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k in n && typeof v !== 'string') n[k] = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) n.append(c);
  return n;
}

let toastTimer;
export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  // popover にしてダイアログより手前（トップレイヤー）に出す
  try { t.hidePopover?.(); t.showPopover?.(); } catch { /* 未対応ブラウザは通常表示 */ }
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.remove('show'); setTimeout(() => { try { t.hidePopover?.(); } catch { /* noop */ } }, 300); }, 2400);
}

export function setBar(node, value, target) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  node.style.width = `${pct}%`;
  node.classList.toggle('over', target > 0 && value > target * 1.05);
}

// ひらがな・カタカナ・全角英数を同一視して検索
export function normalize(s) {
  return String(s)
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0).toLowerCase())
    .replace(/\s+/g, '');
}
