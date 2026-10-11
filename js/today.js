// 食事画面
import { db, save, uid, shiftKey, isTrainingDay } from './store.js';
import { calcTargets, sumEntries, round } from './calc.js';
import { $, el, setBar, toast } from './dom.js';
import { openAdd, saveTemplate } from './addFood.js';

export const MEALS = [
  { id: 'breakfast', label: '朝食' },
  { id: 'lunch', label: '昼食' },
  { id: 'dinner', label: '夕食' },
  { id: 'snack', label: '間食・プロテイン' },
];

export function targetsFor(dateKey) {
  return calcTargets(db.state.profile, { training: isTrainingDay(dateKey) });
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
