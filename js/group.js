// 友達グループでバーコード商品を共有する（Supabase の REST API を直接呼ぶ）
import { db, save } from './store.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, SHORTCUT_ICLOUD_URL } from './config.js';

const CACHE_KEY = 'macrolog-group-cache';
const APP_URL = location.origin + location.pathname.replace(/index\.html$/, '');

export function serverConfig() {
  const g = db.state.group || {};
  return { url: (SUPABASE_URL || g.url || '').replace(/\/$/, ''), key: SUPABASE_ANON_KEY || g.key || '' };
}
export const hasServer = () => { const c = serverConfig(); return !!(c.url && c.key); };
export const groupCode = () => db.state.group?.code || '';
export const inGroup = () => hasServer() && !!groupCode();

// 読みやすく推測されにくい招待コード（例: K7QD-M2XP-9WHA、約60bit）
export function newGroupCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const s = [...bytes].map((b) => chars[b % chars.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}
export const normalizeCode = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/(.{4})(?=.)/g, '$1-');

function headers(extra = {}) {
  const { key } = serverConfig();
  const h = { apikey: key, 'x-group-code': groupCode(), 'Content-Type': 'application/json', ...extra };
  // 従来の anon キー（JWT）は Authorization にも付ける。新しい publishable キーは apikey のみ
  if (key.startsWith('eyJ')) h.Authorization = `Bearer ${key}`;
  return h;
}

async function request(path, opts = {}) {
  const { url } = serverConfig();
  const res = await fetch(`${url}/rest/v1/${path}`, { ...opts, headers: headers(opts.headers) });
  if (!res.ok) {
    let msg = `${res.status}`;
    try { msg = (await res.json()).message || msg; } catch { /* noop */ }
    throw new Error(`共有サーバーエラー: ${msg}`);
  }
  return res.status === 204 ? null : res.json();
}

const toFood = (r) => ({
  id: `g-${r.barcode}`, shared: true, barcode: r.barcode, name: r.name,
  kcal: r.kcal, p: r.p, f: r.f, c: r.c, basis: r.basis,
  unit: r.basis === '100g' ? { label: r.unit_label || '100g', g: r.unit_g || 100 } : { label: r.unit_label || '1食', ...(r.unit_g ? { g: r.unit_g } : {}) },
  addedBy: r.added_by || '',
});

// ---------- 読み込み ----------
let memCache = null;
export function cachedGroupFoods() {
  if (!inGroup()) return [];
  if (!memCache) {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      memCache = c?.code === groupCode() ? c.foods : [];
    } catch { memCache = []; }
  }
  return memCache;
}

export async function refreshGroupFoods() {
  if (!inGroup()) return [];
  const rows = await request('shared_foods?select=*&order=updated_at.desc&limit=1000');
  memCache = rows.map(toFood);
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ code: groupCode(), foods: memCache })); } catch { /* 容量不足など */ }
  return memCache;
}

export async function findShared(barcode) {
  if (!inGroup()) return null;
  try {
    const rows = await request(`shared_foods?select=*&barcode=eq.${encodeURIComponent(barcode)}`);
    return rows[0] ? toFood(rows[0]) : null;
  } catch {
    // オフラインならキャッシュから
    return cachedGroupFoods().find((f) => f.barcode === barcode) || null;
  }
}

// ---------- 書き込み ----------
export async function shareFood(food) {
  if (!inGroup() || !/^\d{8,14}$/.test(food.barcode || '')) return false;
  const row = {
    group_code: groupCode(), barcode: food.barcode, name: String(food.name).slice(0, 80),
    kcal: food.kcal, p: food.p, f: food.f, c: food.c, basis: food.basis === '100g' ? '100g' : 'serving',
    unit_label: food.unit?.label ? String(food.unit.label).slice(0, 30) : null,
    unit_g: food.unit?.g || null,
    added_by: (db.state.group?.nickname || '').slice(0, 20) || null,
    updated_at: new Date().toISOString(),
  };
  await request('shared_foods?on_conflict=group_code,barcode', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(row),
  });
  const f = toFood(row);
  memCache = [f, ...cachedGroupFoods().filter((x) => x.barcode !== f.barcode)];
  return true;
}

// 共有は失敗しても記録の邪魔をしない
export function shareFoodQuietly(food, onDone) {
  shareFood(food).then((ok) => ok && onDone?.()).catch(() => { /* オフライン等は無視 */ });
}

// ---------- 参加・招待 ----------
export function joinGroup(code, server) {
  db.state.group = { ...(db.state.group || {}), code: normalizeCode(code), ...(server || {}) };
  memCache = null;
  save();
}
export function leaveGroup() {
  db.state.group = { nickname: db.state.group?.nickname || '', url: db.state.group?.url, key: db.state.group?.key };
  memCache = null;
  try { localStorage.removeItem(CACHE_KEY); } catch { /* noop */ }
  save();
}

const b64url = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

export function inviteUrl() {
  const p = new URLSearchParams({ join: groupCode() });
  // サーバー設定がコードに埋め込まれていない場合は招待リンクに含める
  if (!SUPABASE_URL) { const c = serverConfig(); p.set('s', b64url(JSON.stringify({ u: c.url, k: c.key }))); }
  // ヘルスケア用ショートカットの共有リンクも一緒に配る
  if (!SHORTCUT_ICLOUD_URL && db.state.healthShortcutUrl) p.set('sc', db.state.healthShortcutUrl);
  return `${APP_URL}?${p}`;
}

export function inviteText() {
  return `MacroLog の食品共有グループに招待します💪\nこのリンクを開くと参加できます（バーコードで登録した商品をみんなで使えます）\n${inviteUrl()}`;
}

// 招待リンクから開かれた場合の情報
export function readInviteFromUrl() {
  const p = new URLSearchParams(location.search);
  const code = p.get('join');
  if (!code) return null;
  let server = null;
  try { if (p.get('s')) { const j = JSON.parse(unb64url(p.get('s'))); server = { url: j.u, key: j.k }; } } catch { /* 壊れたリンク */ }
  const sc = p.get('sc');
  return { code: normalizeCode(code), server, shortcut: sc && /^https:\/\/www\.icloud\.com\/shortcuts\//.test(sc) ? sc : null };
}
