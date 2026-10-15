// 部活・サークル・スポーツ・バイトなどの運動を METs で記録する
// METs は「改訂版 身体活動のメッツ表」（国立健康・栄養研究所）等を参考にした目安値
import { db, save, uid, sportsNetFor } from './store.js';
import { round, sessionKcal } from './calc.js';
import { $, el, toast } from './dom.js';

// sport: 同じ競技のまとまり / kind: match（試合）・practice（練習）
const S = (group, id, name, mets, kw, sport, kind) => ({ group, id, name, mets, kw, sport, kind });
export const ACTIVITIES = [
  S('バドミントン', 'bad-match', 'バドミントン（試合・ゲーム）', 7.0, /試合|ゲーム|シングルス|ダブルス/, 'badminton', 'match'),
  S('バドミントン', 'bad-practice', 'バドミントン（練習・ノック・基礎打ち）', 5.5, /ノック|基礎打ち|パターン|半面|ドライブ|スマッシュ|クリア|練習/, 'badminton', 'practice'),
  S('バドミントン', 'footwork', 'フットワーク', 8.0, /フットワーク/, 'badminton'),
  S('走る・跳ぶ', 'run', 'ランニング（約8km/h）', 8.3, /ランニング|ラン(?!チ)|走/),
  S('走る・跳ぶ', 'jog', 'ジョギング', 7.0, /ジョグ|ジョギング/),
  S('走る・跳ぶ', 'dash', 'ダッシュ・インターバル走', 10.0, /ダッシュ|インターバル|シャトルラン|スプリント/),
  S('走る・跳ぶ', 'walk', 'ウォーキング', 3.5, /ウォーキング|散歩/),
  S('走る・跳ぶ', 'fastwalk', '速歩き', 4.3, /速歩|早歩き/),
  S('走る・跳ぶ', 'rope', 'なわとび', 11.8, /なわとび|縄跳び|縄とび/),
  S('トレーニング', 'warmup', 'ウォーミングアップ・体操', 4.0, /アップ|ウォーミング|体操/),
  S('トレーニング', 'weights-hard', '筋トレ（高強度）', 6.0, /筋トレ.*(高|ハード)|ウエイト|ウェイト/),
  S('トレーニング', 'weights', '筋トレ（軽〜中強度）', 3.5, /筋トレ|自重/),
  S('トレーニング', 'circuit', 'サーキット・HIIT', 8.0, /サーキット|HIIT|タバタ/i),
  S('トレーニング', 'core', '体幹トレーニング', 3.8, /体幹|プランク|腹筋/),
  S('トレーニング', 'stretch', 'ストレッチ・ダウン', 2.3, /ストレッチ|ダウン|クールダウン/),
  S('球技', 'soccer-match', 'サッカー（試合）', 10.0, /サッカー.*試合/, 'soccer', 'match'),
  S('球技', 'soccer', 'サッカー（練習）', 7.0, /サッカー/, 'soccer', 'practice'),
  S('球技', 'futsal', 'フットサル', 8.0, /フットサル/),
  S('球技', 'basket-match', 'バスケットボール（試合）', 8.0, /バスケ.*試合/, 'basketball', 'match'),
  S('球技', 'basket', 'バスケットボール（練習）', 6.0, /バスケ/, 'basketball', 'practice'),
  S('球技', 'volley', 'バレーボール', 4.0, /バレー/, 'volleyball'),
  S('球技', 'tennis-s', 'テニス（シングルス）', 8.0, /テニス.*シングルス/, 'tennis', 'match'),
  S('球技', 'tennis', 'テニス（ダブルス・一般）', 6.0, /テニス/, 'tennis', 'practice'),
  S('球技', 'table-tennis', '卓球', 4.0, /卓球/, 'tabletennis'),
  S('球技', 'baseball', '野球・ソフトボール', 5.0, /野球|ソフトボール|キャッチボール/, 'baseball'),
  S('球技', 'handball', 'ハンドボール', 12.0, /ハンドボール/, 'handball'),
  S('その他のスポーツ', 'swim', '水泳（クロール・ふつう）', 8.3, /水泳|クロール|スイム/),
  S('その他のスポーツ', 'swim-easy', '水泳（ゆっくり）', 5.8, /平泳ぎ|ゆっくり泳/),
  S('その他のスポーツ', 'bike', '自転車（ふつうの速さ）', 6.8, /自転車|サイクリング/),
  S('その他のスポーツ', 'dance', 'ダンス', 7.8, /ダンス/),
  S('その他のスポーツ', 'martial', '武道（柔道・空手・剣道）', 10.3, /柔道|空手|剣道|武道/),
  S('その他のスポーツ', 'yoga', 'ヨガ', 2.5, /ヨガ/),
  S('その他のスポーツ', 'hiking', 'ハイキング・登山', 6.0, /ハイキング|登山/),
  S('生活・バイト・音楽', 'keyboard', '楽器演奏（キーボード・ピアノ）', 2.3, /キーボード|ピアノ|鍵盤/),
  S('生活・バイト・音楽', 'guitar', '楽器演奏（立ってギター・ベース）', 3.0, /ギター|ベース/),
  S('生活・バイト・音楽', 'drums', '楽器演奏（ドラム）', 3.8, /ドラム/),
  S('生活・バイト・音楽', 'kitchen', 'バイト：キッチン・ホール（立ち仕事）', 3.0, /キッチン|ホール|デシャップ|調理|接客|バイト/),
  S('生活・バイト・音楽', 'standing', '立ち仕事（軽め）', 2.5, /立ち仕事|レジ/),
];
const byId = (id) => ACTIVITIES.find((a) => a.id === id);
export const SPORT_BASES = [
  ['badminton', 'バドミントン'], ['soccer', 'サッカー'], ['basketball', 'バスケットボール'], ['volleyball', 'バレーボール'],
  ['tennis', 'テニス'], ['tabletennis', '卓球'], ['baseball', '野球'], ['handball', 'ハンドボール'], ['', '指定なし'],
];
const RATIOS = [[100, 'ずっと動いた'], [80, '少し休憩あり（8割）'], [60, '休憩・待ち多め（6割）'], [40, 'ほぼ待ち（4割）']];

// ---------- テキスト（部活のメニュー）の解析 ----------
function minutesOf(t) {
  const s = t.normalize('NFKC');
  let min = 0;
  const h = s.match(/(\d+(?:\.\d+)?)\s*(時間|h|hr)/i);
  if (h) min += Number(h[1]) * 60;
  const m = s.match(/(\d+)\s*(分|min|m(?![a-z]))/i);
  if (m) min += Number(m[1]);
  const rep = s.match(/[×x]\s*(\d+)\s*(本|セット|回)?\s*$/i); // 「15分×2」
  if (rep && min) min *= Number(rep[1]);
  return min || null;
}

// 1行の名前から活動を推定（「ゲーム」「ノック」などは選んだ競技の試合／練習に）
const GENERIC_MATCH = /試合|ゲーム|紅白戦|ミニゲーム/;
const GENERIC_PRACTICE = /練習|ドリル|パス|シュート|ノック|基礎|レシーブ|サーブ|スパイク|バッティング/;

export function guessActivity(name, base) {
  const n = name.normalize('NFKC');
  const sameSport = ACTIVITIES.filter((a) => a.sport && a.sport === base);
  // 1. 選んだ競技の固有の言葉（「ノック」「フットワーク」など）
  for (const a of sameSport) if (a.kw.test(n)) return a;
  // 2. 競技に関係ない活動（ランニング・アップ・筋トレなど）
  for (const a of ACTIVITIES) if (!a.sport && a.kw.test(n)) return a;
  // 3. 「試合」「練習」などの汎用語は、選んだ競技の試合／練習に
  if (sameSport.length) {
    const match = sameSport.find((a) => a.kind === 'match');
    const practice = sameSport.find((a) => a.kind === 'practice') || sameSport[0];
    if (GENERIC_MATCH.test(n)) return match || practice;
    if (GENERIC_PRACTICE.test(n)) return practice;
  }
  // 4. 他の競技名が書かれている場合（「サッカー」など）
  for (const a of ACTIVITIES) if (a.kw.test(n)) return a;
  return sameSport.find((a) => a.kind === 'practice') || sameSport[0] || null;
}

export function parseMenuText(text, base) {
  const out = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.normalize('NFKC').replace(/^[\s・●○◎☆★■□◆◇•*\-–—]+|^\d{1,2}[.)．]\s*/g, '').trim();
    if (!line) continue;
    const minutes = minutesOf(line);
    if (!minutes) continue;
    const name = line.replace(/[(（].*?[)）]/g, '').split(/\d/)[0].replace(/[:：\s…]+$/, '').trim() || line;
    const act = guessActivity(name, base);
    out.push({ label: name, activity: act?.id || 'bad-practice', mets: act?.mets ?? 5.0, minutes, ratio: 100 });
  }
  return out;
}

// ---------- 運動カード（筋トレ画面） ----------
function activitySelect(value) {
  const groups = [...new Set(ACTIVITIES.map((a) => a.group))];
  const sel = el('select', { name: 'activity' }, groups.map((g) => el('optgroup', { label: g },
    ACTIVITIES.filter((a) => a.group === g).map((a) => el('option', { value: a.id }, `${a.name}（${a.mets}）`)))));
  if (value) sel.value = value;
  return sel;
}
const ratioSelect = (value = 100) => {
  const s = el('select', { name: 'ratio' }, RATIOS.map(([v, l]) => el('option', { value: String(v) }, l)));
  s.value = String(value);
  return s;
};

export function renderSportsCard() {
  const card = $('#sportsCard');
  const list = db.state.exercises?.[db.date] || [];
  const w = db.state.profile.weight;
  const linked = !!db.state.profile.activityLink;
  const totalMin = list.reduce((s, x) => s + x.minutes, 0);
  const totalKcal = list.reduce((s, x) => s + sessionKcal(x, w).gross, 0);
  const net = sportsNetFor(db.date);

  const form = el('form', { class: 'sport-form' },
    activitySelect(db.state.lastActivity || 'bad-practice'),
    el('div', { class: 'row' },
      el('input', { type: 'number', name: 'minutes', min: '1', step: '1', inputmode: 'numeric', placeholder: '分', required: true }),
      el('span', { class: 'muted small nowrap' }, '分'),
      ratioSelect()),
    el('label', { class: 'check small-check' }, el('input', { type: 'checkbox', name: 'inHealth' }), 'スマートウォッチで計測済み（ヘルスケアの活動カロリーに含まれる）'),
    el('button', { class: 'btn full' }, '＋ 記録'));
  form.onsubmit = (e) => {
    e.preventDefault();
    const a = byId(form.elements.activity.value);
    const minutes = Number(form.elements.minutes.value);
    if (!a || !(minutes > 0)) return;
    addSessions([{ name: a.name, activity: a.id, mets: a.mets, minutes, ratio: Number(form.elements.ratio.value), inHealth: form.elements.inHealth.checked }]);
    db.state.lastActivity = a.id;
    save();
  };

  const menus = db.state.exerciseMenus || [];
  card.replaceChildren(...[
    el('h2', {}, '運動（部活・スポーツ・バイト）'),
    list.length > 0 && el('ul', { class: 'list sport-list' }, list.map((x) => el('li', {},
      el('div', {},
        el('div', {}, x.menu ? `📋 ${x.name}` : x.name),
        el('div', { class: 'muted small' }, `${x.minutes}分${x.ratio < 100 ? `・動いた割合${x.ratio}%` : ''}・約${round(sessionKcal(x, w).gross)}kcal${x.inHealth ? '・時計計測済み' : ''}`),
        x.items && el('div', { class: 'muted small sport-items' }, x.items.map((it) => `${it.label || it.name.replace(/（.*$/, '')}${it.minutes}分`).join('・'))),
      el('button', { class: 'icon', 'aria-label': '削除', onclick: () => removeSession(x.id) }, '✕')))),
    list.length > 0 && el('p', { class: 'sport-total' },
      `合計 ${totalMin}分・約${round(totalKcal)}kcal`,
      el('span', { class: 'muted small' }, linked ? `（今日の目標に +${round(net)}kcal）` : '（設定で「歩数・活動カロリーを目標に反映」をオンにすると目標に加算）')),
    menus.length > 0 && el('div', { class: 'chips sport-menus' }, menus.map((m) => el('button', {
      class: 'chip', onclick: () => {
        // メニューは1件の記録にまとめる（内訳は items）
        addSessions([{ name: m.name, menu: true, minutes: m.items.reduce((s, it) => s + it.minutes, 0), items: m.items.map((it) => ({ ...it })), inHealth: false }]);
        toast(`「${m.name}」を記録しました`);
      },
    }, `▶ ${m.name}`))),
    form,
    el('div', { class: 'row two sport-menu-actions' },
      el('button', { class: 'btn ghost', onclick: () => openMenuEditor(null) }, '＋ 部活メニュー作成'),
      menus.length > 0 && el('button', { class: 'btn ghost', onclick: () => openMenuPicker() }, '✎ メニューを編集')),
  ].filter(Boolean));
}

function addSessions(items) {
  const day = (db.state.exercises ||= {})[db.date] ||= [];
  for (const it of items) day.push({ id: uid(), ...it });
  save();
}
function removeSession(id) {
  db.state.exercises[db.date] = (db.state.exercises[db.date] || []).filter((x) => x.id !== id);
  save();
}

// ---------- 部活メニューの編集 ----------
const dialog = $('#sportMenuDialog');
let editing = null;

function menuRow(it = { label: '', activity: 'bad-practice', minutes: 30, ratio: 100 }) {
  const li = el('li', { class: 'sm-row' },
    el('input', { name: 'label', value: it.label || '', placeholder: '内容（例: ノック）' }),
    activitySelect(it.activity),
    el('div', { class: 'row' },
      el('input', { type: 'number', name: 'minutes', min: '1', step: '1', inputmode: 'numeric', value: String(it.minutes || '') }),
      el('span', { class: 'muted small nowrap' }, '分'),
      ratioSelect(it.ratio),
      el('button', { type: 'button', class: 'icon', 'aria-label': '削除', onclick: () => li.remove() }, '✕')));
  return li;
}

export function openMenuEditor(menu) {
  editing = menu;
  $('#smTitle').textContent = menu ? '部活メニューを編集' : '部活メニューを作成';
  $('#smName').value = menu?.name || '';
  $('#smBase').value = menu?.base ?? 'badminton';
  $('#smText').value = '';
  $('#smRows').replaceChildren(...(menu?.items || [{ label: 'ウォーミングアップ', activity: 'warmup', minutes: 15 }, {}]).map((it) => menuRow(it.activity ? it : undefined)));
  $('#smDelete').classList.toggle('hidden', !menu);
  dialog.showModal();
}

function openMenuPicker() {
  const menus = db.state.exerciseMenus || [];
  const name = prompt(`編集するメニューの番号を入力してください\n${menus.map((m, i) => `${i + 1}. ${m.name}`).join('\n')}`, '1');
  const m = menus[Number(name) - 1];
  if (m) openMenuEditor(m);
}

$('#smBase').replaceChildren(...SPORT_BASES.map(([v, l]) => el('option', { value: v }, l)));
$('#smClose').onclick = () => dialog.close();
$('#smAddRow').onclick = () => $('#smRows').append(menuRow());
$('#smParse').onclick = () => {
  const items = parseMenuText($('#smText').value, $('#smBase').value);
  if (!items.length) return toast('「ランニング 20分」のように、内容と時間を1行ずつ書いてください');
  $('#smRows').replaceChildren(...items.map(menuRow));
  toast(`${items.length}項目を読み込みました。種目の当てはめを確認してください`);
};
$('#smDelete').onclick = () => {
  if (!editing || !confirm(`「${editing.name}」を削除しますか？`)) return;
  db.state.exerciseMenus = db.state.exerciseMenus.filter((m) => m.id !== editing.id);
  save();
  dialog.close();
};
$('#smForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#smName').value.trim();
  const items = [...$('#smRows').children].map((li) => {
    const a = byId(li.querySelector('[name=activity]').value);
    return {
      label: li.querySelector('[name=label]').value.trim(),
      name: a.name, activity: a.id, mets: a.mets,
      minutes: Number(li.querySelector('[name=minutes]').value) || 0,
      ratio: Number(li.querySelector('[name=ratio]').value) || 100,
    };
  }).filter((it) => it.minutes > 0);
  if (!name) return toast('メニュー名を入力してください');
  if (!items.length) return toast('時間を入れた項目を1つ以上作ってください');
  db.state.exerciseMenus ||= [];
  if (editing) Object.assign(editing, { name, base: $('#smBase').value, items });
  else db.state.exerciseMenus.push({ id: uid(), name, base: $('#smBase').value, items });
  save();
  const w = db.state.profile.weight;
  toast(`「${name}」を保存しました（約${round(items.reduce((s, it) => s + sessionKcal(it, w).gross, 0))}kcal）`);
  dialog.close();
});

// 食事画面の活動カード用
export function sportsSummary(k) {
  const list = db.state.exercises?.[k] || [];
  if (!list.length) return '';
  const w = db.state.profile.weight;
  return `🏸 運動 ${list.reduce((s, x) => s + x.minutes, 0)}分・約${round(list.reduce((s, x) => s + sessionKcal(x, w).gross, 0))}kcal`;
}
