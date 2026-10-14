// 状態の保存・読み込み
export const STORAGE_KEY = 'macrolog-v1';
const API_KEY_STORAGE = 'macrolog-apikey'; // 書き出しJSONに含めないよう別キーで保存

export function defaultState() {
  return {
    profile: { sex: 'male', age: 20, height: 170, weight: 65, activity: 1.55, goal: 'maintain', manual: false, carbCycle: false },
    logs: {},          // { 'YYYY-MM-DD': [entry] }
    weights: {},       // { 'YYYY-MM-DD': kg }
    customFoods: [],   // マイ食品（basis: 'serving' | '100g'、barcode 付きもあり）
    recent: [],        // 最近使った食品ID
    templates: [],     // 食事セット { id, name, items: [{name, amountLabel, kcal, p, f, c}] }
    workouts: {},      // { 'YYYY-MM-DD': [{ id, exercise, sets: [{ w, r }] }] }
    trainingDays: {},  // { 'YYYY-MM-DD': true/false } 手動で切り替えた日
    ai: { model: 'claude-opus-5-5' },
    achievements: {}, // { 実績ID: 解除日 }
    level: 1,
  };
}

function migrate(data) {
  const s = { ...defaultState(), ...data };
  s.profile = { ...defaultState().profile, ...s.profile };
  // v1 のマイ食品は「1食分」の値
  s.customFoods = s.customFoods.map((f) => ({ basis: 'serving', unit: { label: '1食' }, ...f, custom: true }));
  return s;
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? migrate(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

const listeners = new Set();
const loaded = load();

export const db = {
  state: loaded || defaultState(),
  isFirstRun: !loaded,
  date: todayKey(),
};

export function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db.state));
  } catch (e) {
    alert(`保存に失敗しました: ${e.message}`);
  }
  listeners.forEach((fn) => fn());
}
export const onChange = (fn) => listeners.add(fn);

export function replaceState(data) {
  db.state = data ? migrate(data) : defaultState();
  save();
}

export function getApiKey() {
  try { return localStorage.getItem(API_KEY_STORAGE) || ''; } catch { return ''; }
}
export function setApiKey(key) {
  try {
    if (key) localStorage.setItem(API_KEY_STORAGE, key);
    else localStorage.removeItem(API_KEY_STORAGE);
  } catch { /* プライベートモード等 */ }
}

// ---------- 日付 ----------
export function toKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function todayKey() { return toKey(new Date()); }
export function fromKey(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
export function shiftKey(k, n) { const d = fromKey(k); d.setDate(d.getDate() + n); return toKey(d); }
export function dateLabel(k) {
  const d = fromKey(k);
  const s = `${d.getMonth() + 1}/${d.getDate()}(${'日月火水木金土'[d.getDay()]})`;
  return k === todayKey() ? `今日 ${s}` : s;
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// トレ日判定：手動切替 > その日に筋トレ記録があるか
export function isTrainingDay(k) {
  const o = db.state.trainingDays[k];
  if (o !== undefined) return o;
  return (db.state.workouts[k] || []).length > 0;
}
