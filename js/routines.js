// トレーニングメニュー（決まったメニューを登録して、ワンタップで当日の記録に展開）
import { db, save, uid } from './store.js';
import { $, el, toast } from './dom.js';
import { openImport } from './workoutImport.js';

const dialog = $('#routineDialog');
let editing = null; // 編集中のメニュー（新規は null）

export function renderRoutineCard() {
  const card = $('#routineCard');
  const routines = db.state.routines || [];
  const today = (db.state.workouts[db.date] || []).filter((w) => w.sets.length || w.plan);
  card.replaceChildren(...[
    el('h2', {}, '筋トレメニュー'),
    routines.length
      ? el('ul', { class: 'list routine-list' }, routines.map((r) => el('li', {},
        el('div', { class: 'routine-info' },
          el('div', { class: 'title' }, r.name),
          el('div', { class: 'muted small' }, r.items.map((it) => it.exercise).join('・'))),
        el('span', { class: 'food-meta' },
          el('button', { class: 'btn small', onclick: () => startRoutine(r) }, '▶ 開始'),
          el('button', { class: 'icon', 'aria-label': '編集', onclick: () => openRoutineEditor(r) }, '✎')))))
      : el('p', { class: 'hint' }, '「胸の日」「脚の日」など、いつものメニューを登録すると、ワンタップでその日の種目と目標がセットされます。'),
    el('div', { class: 'row two' },
      el('button', { class: 'btn ghost', onclick: () => openRoutineEditor(null) }, '＋ メニュー作成'),
      el('button', { class: 'btn ghost', onclick: () => openImport() }, '📷 紙のメモを読み込む')),
    today.length > 0 && el('button', {
      class: 'link-btn', onclick: () => openRoutineEditor(null, today.map(workoutToItem)),
    }, 'この日の内容をメニューとして保存'),
  ].filter(Boolean));
}

// 記録（セット一覧）からメニューの1行を作る
export function workoutToItem(w) {
  if (!w.sets.length && w.plan) return { exercise: w.exercise, ...w.plan };
  const first = w.sets[0] || { w: 0, r: 10 };
  return { exercise: w.exercise, sets: w.sets.length || 3, reps: first.r, weight: first.w || 0 };
}

export function startRoutine(r) {
  const day = (db.state.workouts[db.date] ||= []);
  let added = 0;
  for (const it of r.items) {
    const existing = day.find((w) => w.exercise === it.exercise);
    const plan = { sets: it.sets, reps: it.reps, weight: it.weight || 0 };
    if (existing) { existing.plan ||= plan; continue; }
    day.push({ id: uid(), exercise: it.exercise, sets: [], plan });
    added++;
  }
  db.state.trainingDays[db.date] = true;
  save();
  toast(`「${r.name}」をセットしました（${added}種目）`);
}

// ---------- 編集ダイアログ ----------
function row(it = { exercise: '', sets: 3, reps: 10, weight: '' }) {
  const num = (name, value, ph, step = '1') => el('input', { type: 'number', name, min: '0', step, inputmode: 'decimal', placeholder: ph, value: value === '' || value === undefined || value === null ? '' : String(value) });
  const li = el('li', { class: 'routine-row' },
    el('input', { name: 'exercise', list: 'exerciseList', placeholder: '種目', value: it.exercise, autocomplete: 'off' }),
    num('sets', it.sets, 'セット'), el('span', { class: 'muted' }, '×'), num('reps', it.reps, '回'),
    num('weight', it.weight || '', 'kg', 'any'),
    el('button', { type: 'button', class: 'icon', 'aria-label': '削除', onclick: () => li.remove() }, '✕'));
  return li;
}

export function openRoutineEditor(routine, presetItems) {
  editing = routine;
  $('#routineTitle').textContent = routine ? 'メニューを編集' : 'メニューを作成';
  const form = $('#routineForm');
  form.elements.name.value = routine?.name || '';
  const items = routine?.items || presetItems || [{ exercise: '', sets: 3, reps: 10, weight: '' }];
  $('#routineRows').replaceChildren(...items.map(row));
  $('#routineDelete').classList.toggle('hidden', !routine);
  dialog.showModal();
}

$('#routineAddRow').onclick = () => {
  const li = row();
  $('#routineRows').append(li);
  li.querySelector('input').focus();
};
$('#routineClose').onclick = () => dialog.close();
$('#routineDelete').onclick = () => {
  if (!editing || !confirm(`メニュー「${editing.name}」を削除しますか？`)) return;
  db.state.routines = db.state.routines.filter((r) => r.id !== editing.id);
  save();
  dialog.close();
};

$('#routineForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = e.target.elements.name.value.trim();
  const items = [...$('#routineRows').children].map((li) => {
    const v = (n) => li.querySelector(`[name=${n}]`).value;
    return {
      exercise: v('exercise').trim(),
      sets: Math.max(1, Math.round(Number(v('sets')) || 1)),
      reps: Math.max(1, Math.round(Number(v('reps')) || 1)),
      weight: Number(v('weight')) || 0,
    };
  }).filter((it) => it.exercise);
  if (!name) return toast('メニュー名を入力してください');
  if (!items.length) return toast('種目を1つ以上入力してください');
  db.state.routines ||= [];
  if (editing) Object.assign(editing, { name, items });
  else db.state.routines.push({ id: uid(), name, items });
  save();
  toast(`メニュー「${name}」を保存しました`);
  dialog.close();
});

