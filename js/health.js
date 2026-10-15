// ヘルスケア（iPhone）の歩数・距離・消費カロリーを取り込む
// Webアプリはヘルスケアに直接アクセスできないため、iPhoneの「ショートカット」アプリで値を読み出し、
//   ・URL（?health=1&steps=…）でこのアプリを開く（Safariで使う場合）
//   ・クリップボードにコピーして、アプリの「取り込む」ボタンで読む（ホーム画面アプリで使う場合）
// のどちらかで受け取る。
import { db, save, todayKey } from './store.js';
import { round } from './calc.js';
import { SHORTCUT_ICLOUD_URL, SHORTCUT_NAME } from './config.js';

const APP_URL = location.origin + location.pathname.replace(/index\.html$/, '');

// 「8,123」「5.6km」「320 kcal」のような値を数値に
const numOf = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).normalize('NFKC').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)?.[0]);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

// 日付の表記ゆれを YYYY-MM-DD に（「2026/10/15」「2026年10月15日」など）
function dateOf(v) {
  if (!v) return todayKey();
  const m = String(v).normalize('NFKC').match(/(\d{4})\D(\d{1,2})\D(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : todayKey();
}

// URL・クエリ文字列・「steps=…&dist=…」形式のテキストを解析
export function parseHealthPayload(text) {
  const s = String(text || '').trim();
  const q = s.includes('?') ? s.slice(s.indexOf('?') + 1) : s;
  if (!/(^|[&\s])(steps|dist|kcal)=/.test(q)) return null;
  const p = new URLSearchParams(q.replace(/\s+/g, '&'));
  let dist = numOf(p.get('dist'));
  // 単位がメートルで来た場合（1000以上ならmとみなす）
  if (dist !== null && (p.get('unit') === 'm' || dist >= 1000)) dist /= 1000;
  if (dist !== null && p.get('unit') === 'mi') dist *= 1.609;
  const rec = {
    date: dateOf(p.get('date')),
    steps: numOf(p.get('steps')),
    distanceKm: dist === null ? null : round(dist, 2),
    activeKcal: numOf(p.get('kcal')),
  };
  return rec.steps === null && rec.distanceKm === null && rec.activeKcal === null ? null : rec;
}

export function saveActivity(rec, source = 'health') {
  db.state.activity ||= {};
  const prev = db.state.activity[rec.date] || {};
  db.state.activity[rec.date] = {
    steps: rec.steps ?? prev.steps ?? null,
    distanceKm: rec.distanceKm ?? prev.distanceKm ?? null,
    activeKcal: rec.activeKcal ?? prev.activeKcal ?? null,
    source,
  };
  save();
}

export function activityText(a) {
  if (!a) return '';
  return [
    a.steps != null && `👟 ${Math.round(a.steps).toLocaleString()}歩`,
    a.distanceKm != null && `${round(a.distanceKm, 1)}km`,
    a.activeKcal != null && `🔥 ${Math.round(a.activeKcal)}kcal`,
  ].filter(Boolean).join(' ・ ');
}

// 起動時：URLで渡された場合
export function readHealthFromUrl() {
  const p = new URLSearchParams(location.search);
  // 「同期」ボタンから実行したショートカットの出力（x-success に result として付く）
  if (p.has('result')) return parseHealthPayload(p.get('result'));
  if (!p.has('health') && !p.has('steps')) return null;
  return parseHealthPayload(location.search);
}

export const shortcutLink = () => SHORTCUT_ICLOUD_URL || db.state.healthShortcutUrl || '';
export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

// アプリからショートカットを実行する。
// Safari では x-callback-url で終了後にこのページへ戻り、出力（result）をそのまま取り込む。
// ホーム画面アプリは戻り先に指定できないため、ショートカットがコピーした内容を戻ってから取り込む。
let ranAt = 0;
export function runShortcut() {
  ranAt = Date.now();
  const name = encodeURIComponent(SHORTCUT_NAME);
  location.href = isStandalone()
    ? `shortcuts://run-shortcut?name=${name}`
    : `shortcuts://x-callback-url/run-shortcut?name=${name}&x-success=${encodeURIComponent(`${APP_URL}?health=cb`)}`;
}
// ショートカット実行から2分以内にアプリへ戻ってきたか
export const justReturnedFromShortcut = () => ranAt && Date.now() - ranAt < 120000;
export const clearShortcutRun = () => { ranAt = 0; };

// クリップボードから（ボタン押下時に呼ぶ）
export async function readHealthFromClipboard() {
  let text = '';
  try {
    text = await navigator.clipboard.readText();
  } catch {
    text = prompt('ショートカットでコピーしたテキストを貼り付けてください') || '';
  }
  return parseHealthPayload(text);
}

export const SHORTCUT_TEXT_TEMPLATE = 'health=1&date=［日付］&steps=［歩数］&dist=［距離］&kcal=［アクティブエネルギー］';
