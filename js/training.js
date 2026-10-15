// 筋トレ記録
import { db, save, uid, shiftKey, fromKey } from './store.js';
import { round, e1rm } from './calc.js';
import { $, el, toast } from './dom.js';
import { renderRoutineCard } from './routines.js';
import { renderSportsCard } from './sports.js';

export const PRESET_EXERCISES = [
  'ベンチプレス', 'インクラインベンチプレス', 'ダンベルプレス', 'ダンベルフライ', 'チェストプレス', 'ディップス', '腕立て伏せ',
  'スクワット', 'レッグプレス', 'ブルガリアンスクワット', 'レッグエクステンション', 'レッグカール', 'ルーマニアンデッドリフト', 'カーフレイズ',
  'デッドリフト', '懸垂', 'ラットプルダウン', 'ベントオーバーロウ', 'シーテッドロウ', 'ワンハンドロウ',
  'ショルダープレス', 'サイドレイズ', 'リアレイズ', 'アップライトロウ',
  'バーベルカール', 'ダンベルカール', 'ハンマーカール', 'トライセプスプレスダウン', 'フレンチプレス',
  'クランチ', 'レッグレイズ', 'プランク',
];

export function exerciseNames() {
  const used = new Set();
  for (const list of Object.values(db.state.workouts)) for (const w of list) used.add(w.exercise);
  return [...new Set([...used, ...PRESET_EXERCISES])];
}

const bestOf = (sets) => Math.max(0, ...sets.map((s) => e1rm(s.w, s.r)));
const volumeOf = (sets) => sets.reduce((a, s) => a + s.w * s.r, 0);
const setsText = (sets) => sets.map((s) => `${s.w}kg×${s.r}`).join(', ');

// その日より前の、同じ種目の直近記録
function previousSession(exercise, before) {
  const dates = Object.keys(db.state.workouts).filter((k) => k < before).sort().reverse();
  for (const k of dates) {
    const w = db.state.workouts[k].find((x) => x.exercise === exercise && x.sets.length);
    if (w) return { date: k, sets: w.sets };
  }
  return null;
}

function bestBefore(exercise, before) {
  let best = 0;
  for (const [k, list] of Object.entries(db.state.workouts)) {
    if (k >= before) continue;
    for (const w of list) if (w.exercise === exercise) best = Math.max(best, bestOf(w.sets));
  }
  return best;
}

export function renderTraining() {
  renderSportsCard();
  renderRoutineCard();
  $('#exerciseList').replaceChildren(...exerciseNames().map((n) => el('option', { value: n })));
  const list = db.state.workouts[db.date] || [];
  const box = $('#workoutList');
  box.replaceChildren();
  if (!list.length) {
    box.append(el('p', { class: 'hint center' }, 'この日の記録はまだありません。上から種目を追加しましょう。'));
  }
  for (const w of list) box.append(renderExercise(w));
  renderWeek();
  renderPRs();
}

function renderExercise(w) {
  const prev = previousSession(w.exercise, db.date);
  const best = bestOf(w.sets);
  const prevBest = bestBefore(w.exercise, db.date);
  const isPR = w.sets.length > 0 && best > prevBest && prevBest > 0;
  const plan = w.plan;
  // 入力欄の初期値：この日の直前のセット → メニューの目標 → 前回の記録
  const last = w.sets.at(-1) || (plan ? { w: plan.weight || prev?.sets.at(-1)?.w || '', r: plan.reps } : prev?.sets.at(-1));

  const form = el('form', { class: 'row set-form' },
    el('input', { type: 'number', name: 'w', step: 'any', min: '0', placeholder: 'kg', inputmode: 'decimal', value: last ? String(last.w) : '' }),
    el('span', { class: 'muted' }, '×'),
    el('input', { type: 'number', name: 'r', step: '1', min: '1', placeholder: '回', inputmode: 'numeric', value: last ? String(last.r) : '' }),
    el('button', { class: 'btn small' }, '＋セット'));
  form.onsubmit = (e) => {
    e.preventDefault();
    const wt = Number(form.elements.w.value);
    const r = Math.round(Number(form.elements.r.value));
    if (!(wt >= 0) || !(r > 0)) return;
    const before = bestOf(w.sets);
    w.sets.push({ w: wt, r });
    const now = e1rm(wt, r);
    if (prevBest > 0 && now > Math.max(prevBest, before)) toast(`🎉 ${w.exercise} 自己ベスト更新！（推定1RM ${round(now, 1)}kg）`);
    save();
  };

  return el('div', { class: 'card exercise' },
    el('div', { class: 'ex-head' },
      el('div', {},
        el('div', { class: 'title' }, w.exercise, isPR && el('span', { class: 'tag pr' }, 'PR')),
        plan && el('div', { class: `plan${w.sets.length >= plan.sets ? ' done' : ''}` },
          `🎯 目標 ${plan.sets}セット×${plan.reps}回${plan.weight ? ` @${plan.weight}kg` : ''}　${w.sets.length >= plan.sets ? '✅ 完了' : `${w.sets.length}/${plan.sets}`}`),
        el('div', { class: 'muted small' }, prev ? `前回 ${prev.date.slice(5).replace('-', '/')}: ${setsText(prev.sets)}` : '初めての記録')),
      el('button', {
        class: 'icon', 'aria-label': '種目を削除', onclick: () => {
          if (w.sets.length && !confirm(`${w.exercise} の記録を削除しますか？`)) return;
          db.state.workouts[db.date] = db.state.workouts[db.date].filter((x) => x.id !== w.id);
          save();
        },
      }, '✕')),
    el('ol', { class: 'sets' }, w.sets.map((s, i) => el('li', {},
      el('span', {}, `${s.w}kg × ${s.r}回`),
      el('span', { class: 'muted small' }, `1RM≈${round(e1rm(s.w, s.r), 1)}`),
      el('button', { class: 'icon', 'aria-label': 'セットを削除', onclick: () => { w.sets.splice(i, 1); save(); } }, '✕')))),
    w.sets.length > 0 && el('div', { class: 'muted small' }, `${w.sets.length}セット ・ ボリューム ${round(volumeOf(w.sets))}kg ・ 推定1RM ${round(best, 1)}kg`),
    form);
}

function renderWeek() {
  // 選択日を含む週（月曜始まり）
  const d = fromKey(db.date);
  const monday = shiftKey(db.date, -((d.getDay() + 6) % 7));
  let days = 0, sets = 0, volume = 0;
  const marks = [];
  for (let i = 0; i < 7; i++) {
    const k = shiftKey(monday, i);
    const list = (db.state.workouts[k] || []).filter((w) => w.sets.length);
    if (list.length) days++;
    for (const w of list) { sets += w.sets.length; volume += volumeOf(w.sets); }
    marks.push(el('span', { class: `day-dot${list.length ? ' on' : ''}${k === db.date ? ' cur' : ''}` }, '月火水木金土日'[i]));
  }
  $('#weekSummary').replaceChildren(
    el('div', { class: 'week-dots' }, marks),
    el('p', { class: 'muted small' }, `トレーニング ${days}日 ・ ${sets}セット ・ 総ボリューム ${round(volume).toLocaleString()}kg`));
}

function renderPRs() {
  const best = new Map();
  for (const [k, list] of Object.entries(db.state.workouts)) {
    for (const w of list) {
      for (const s of w.sets) {
        const v = e1rm(s.w, s.r);
        if (v > (best.get(w.exercise)?.v ?? 0)) best.set(w.exercise, { v, s, k });
      }
    }
  }
  const ul = $('#prList');
  ul.replaceChildren();
  if (!best.size) ul.append(el('li', { class: 'muted' }, '記録するとここに表示されます'));
  for (const [name, { v, s, k }] of [...best].sort((a, b) => b[1].v - a[1].v)) {
    ul.append(el('li', {},
      el('span', {}, name),
      el('span', {}, el('b', {}, `${round(v, 1)}kg`), el('span', { class: 'muted small' }, ` (${s.w}×${s.r}, ${k.slice(5).replace('-', '/')})`))));
  }
}

$('#exerciseForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#exerciseName').value.trim();
  if (!name) return;
  (db.state.workouts[db.date] ||= []).push({ id: uid(), exercise: name, sets: [] });
  $('#exerciseName').value = '';
  save();
});

