// 食事画面
import { db, save, uid, shiftKey, isTrainingDay, dayTargets } from './store.js';
import { sumEntries, round } from './calc.js';
import { $, el, setBar, toast } from './dom.js';
import { openAdd, saveTemplate } from './addFood.js';
import { activityText, readHealthFromClipboard, saveActivity, isIOS, runShortcut, justReturnedFromShortcut, clearShortcutRun } from './health.js';

export const MEALS = [
  { id: 'breakfast', label: '朝食' },
  { id: 'lunch', label: '昼食' },
  { id: 'dinner', label: '夕食' },
  { id: 'snack', label: '間食・プロテイン' },
];

export function targetsFor(dateKey) {
  return dayTargets(dateKey);
}

export function renderToday() {
  const t = targetsFor(db.date);
  const entries = db.state.logs[db.date] || [];
  const total = sumEntries(entries);
  const training = isTrainingDay(db.date);

  $('#dayTypeBtn').textContent = training ? '🏋️ トレ日' : '😴 休養日';
  $('#dayTypeBtn').classList.toggle('active', training);
  $('#dayTypeNote').textContent = db.state.profile.carbCycle
    ? `炭水化物 ${t.cycle >= 0 ? '+' : ''}${t.cycle}g で調整中（タップで切替）`
    : 'タップで切替';

  $('#kcalEaten').textContent = round(total.kcal);
  $('#kcalTarget').textContent = t.kcal;
  const remain = t.kcal - round(total.kcal);
  $('#kcalRemain').textContent = remain >= 0 ? remain : `+${-remain}`;
  $('#kcalRemain').classList.toggle('over', remain < 0);
  setBar($('#kcalBar'), total.kcal, t.kcal);

  const box = $('#macroBars');
  box.replaceChildren();
  for (const [key, label] of [['p', 'たんぱく質'], ['f', '脂質'], ['c', '炭水化物']]) {
    const fill = el('div', { class: 'bar-fill' });
    box.append(el('div', { class: `macro ${key}` },
      el('div', { class: 'label' }, label),
      el('div', { class: 'val' }, `${round(total[key])} / ${t[key]}g`),
      el('div', { class: 'bar' }, fill)));
    setBar(fill, total[key], t[key]);
  }

  const pLeft = round(t.p - total.p);
  $('#proteinHint').textContent = pLeft > 0
    ? `たんぱく質あと ${pLeft}g（鶏むね肉なら約${round(pLeft / 0.233)}g、プロテインなら約${Math.ceil(pLeft / 22.5)}杯）`
    : 'たんぱく質の目標を達成しました 💪';

  renderActivity(t);

  const meals = $('#meals');
  meals.replaceChildren();
  for (const m of MEALS) {
    const list = entries.filter((e) => e.meal === m.id);
    const s = sumEntries(list);
    const card = el('div', { class: 'meal' },
      el('div', { class: 'meal-head' },
        el('div', {}, el('div', { class: 'title' }, m.label),
          el('div', { class: 'sub' }, `${round(s.kcal)}kcal  P${round(s.p, 1)} F${round(s.f, 1)} C${round(s.c, 1)}`)),
        el('div', { class: 'meal-actions' },
          list.length > 0 && el('button', { class: 'link-btn', onclick: () => saveTemplate(list, `いつもの${m.label}`) }, 'セット保存'),
          el('button', { class: 'add-btn', onclick: () => openAdd(m) }, '+ 追加'))));
    for (const e of list) {
      card.append(el('div', { class: 'entry' },
        el('div', {},
          el('div', { class: 'name' }, e.amountLabel ? `${e.name}（${e.amountLabel}）` : e.name),
          el('div', { class: 'nut' }, `${e.kcal}kcal  P${e.p} F${e.f} C${e.c}`)),
        el('button', { class: 'del', 'aria-label': '削除', onclick: () => removeEntry(e.id) }, '✕')));
    }
    meals.append(card);
  }
}

function removeEntry(id) {
  db.state.logs[db.date] = (db.state.logs[db.date] || []).filter((e) => e.id !== id);
  save();
}

$('#dayTypeBtn').onclick = () => {
  db.state.trainingDays[db.date] = !isTrainingDay(db.date);
  save();
};

$('#copyPrev').onclick = () => {
  const prev = db.state.logs[shiftKey(db.date, -1)] || [];
  if (!prev.length) return toast('前日の記録がありません');
  if (!confirm(`前日の${prev.length}件をこの日に追加しますか？`)) return;
  db.state.logs[db.date] = [...(db.state.logs[db.date] || []), ...prev.map((e) => ({ ...e, id: uid() }))];
  save();
  toast('前日の食事をコピーしました');
};

// ---------- 歩数・活動 ----------
let editingActivity = false;
let pendingImport = false;
// 「同期」でショートカットを実行して戻ってきたら、取り込みボタンを目立たせる（クリップボードの読み取りはタップが必要）
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && justReturnedFromShortcut()) {
    clearShortcutRun();
    pendingImport = true;
    toast('「📋 取り込む」を押すと歩数を反映します');
    renderToday();
  }
});
function renderActivity(t) {
  const a = db.state.activity?.[db.date];
  const card = $('#activityCard');
  const head = el('div', { class: 'activity-row' },
    el('div', {},
      el('div', { class: a ? 'activity-val' : 'muted' }, a ? activityText(a) : '👟 歩数・距離は未記録'),
      t.linked && el('div', { class: 'muted small' }, a ? `活動消費 +${t.exercise}kcal を目標に反映中` : '歩数を取り込むと目標に活動分が加算されます')),
    el('div', { class: 'meal-actions' },
      isIOS() && el('button', { class: 'add-btn', onclick: runShortcut, title: 'ショートカットを実行して歩数を取得' }, '🔄 同期'),
      el('button', { class: `add-btn${pendingImport ? ' pulse' : ''}`, onclick: importFromClipboard }, '📋 取り込む'),
      el('button', { class: 'icon', 'aria-label': '手入力', onclick: () => { editingActivity = !editingActivity; renderActivity(t); } }, '✎')));
  const children = [head];
  if (editingActivity) {
    const num = (name, ph, v) => el('label', {}, ph, el('input', { type: 'number', name, min: '0', step: 'any', inputmode: 'decimal', value: v == null ? '' : String(v) }));
    const form = el('form', { class: 'grid4 compact activity-form' },
      num('steps', '歩数', a?.steps), num('dist', '距離km', a?.distanceKm), num('kcal', '活動kcal', a?.activeKcal),
      el('button', { class: 'btn small' }, '保存'));
    form.onsubmit = (e) => {
      e.preventDefault();
      const v = (n) => (form.elements[n].value === '' ? null : Number(form.elements[n].value));
      editingActivity = false;
      saveActivity({ date: db.date, steps: v('steps'), distanceKm: v('dist'), activeKcal: v('kcal') }, 'manual');
    };
    children.push(form);
  }
  card.replaceChildren(...children.filter(Boolean));
}

async function importFromClipboard() {
  pendingImport = false;
  const rec = await readHealthFromClipboard();
  if (!rec) return toast('ヘルスケアのデータが見つかりませんでした（ショートカットでコピーしてから押してください）');
  saveActivity(rec);
  if (rec.date !== db.date) db.date = rec.date;
  toast(`取り込みました：${activityText(db.state.activity[rec.date])}`);
}
