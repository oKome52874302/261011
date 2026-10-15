// 紙のトレーニングメモを写真・テキストから読み込む
import { db, save, uid, getApiKey } from './store.js';
import { $, el, toast } from './dom.js';
import { parseWorkoutText, parseSets, setsToText, fuzzyExercise } from './workoutParse.js';
import { exerciseNames } from './training.js';
import { recognizeText } from './ocr.js';
import { readWorkoutPhoto } from './ai.js';
import { openRoutineEditor, workoutToItem } from './routines.js';

const dialog = $('#importDialog');

export function openImport() {
  $('#importText').value = '';
  $('#importStatus').textContent = '';
  renderPreview([]);
  $('#importAiHint').classList.toggle('hidden', !getApiKey());
  dialog.showModal();
}

$('#importClose').onclick = () => dialog.close();
$('#importPhotoBtn').onclick = () => { $('#importPhoto').value = ''; $('#importPhoto').click(); };

function status(msg, busy = false) {
  $('#importStatus').replaceChildren(...(busy ? [el('span', { class: 'spinner' })] : []), msg);
}

$('#importPhoto').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    if (getApiKey()) {
      // APIキーがあれば手書きにも強いAIで読み取る
      status('AIでメモを読み取っています…', true);
      const out = await readWorkoutPhoto(file);
      $('#importText').value = out.exercises.map((x) => `${x.exercise} ${setsToText(x.sets)}`).join('\n');
      renderPreview(out.exercises);
      status(out.exercises.length ? '読み取り結果を確認してください。' : '⚠️ 種目を読み取れませんでした。');
    } else {
      status('メモを読み取っています（スマホ内で処理）…', true);
      const text = await recognizeText(file, (m) => status(m, true));
      $('#importText').value = text.trim();
      const parsed = parseWorkoutText(text);
      renderPreview(parsed);
      status(parsed.length
        ? '読み取り結果を確認してください。違うところは上のテキストか下の欄を直せます。'
        : '⚠️ うまく読み取れませんでした。手書きの文字は読みにくいので、上の欄に直接入力するか、iPhoneのテキスト認識でコピーして貼り付けてください。');
    }
  } catch (err) {
    status(`⚠️ ${err.message}`);
  }
});

$('#importText').addEventListener('input', (e) => renderPreview(parseWorkoutText(e.target.value)));

function renderPreview(list) {
  const known = exerciseNames();
  list = list.map((x) => ({ ...x, exercise: fuzzyExercise(x.exercise, known) }));
  const ul = $('#importPreview');
  ul.replaceChildren(...list.map((x) => el('li', { class: 'import-item' },
    el('label', { class: 'check' },
      el('input', { type: 'checkbox', name: 'use', checked: true }),
      el('input', { name: 'exercise', value: x.exercise, list: 'exerciseList', class: 'ai-name' })),
    el('input', { name: 'sets', value: setsToText(x.sets), placeholder: '例: 60x10, 60x8（空欄なら種目だけ）', class: 'sets-input' }))));
  $('#importActions').classList.toggle('hidden', !list.length);
}

function collect() {
  return [...$('#importPreview').children]
    .filter((li) => li.querySelector('[name=use]').checked)
    .map((li) => ({
      exercise: li.querySelector('[name=exercise]').value.trim(),
      sets: parseSets(li.querySelector('[name=sets]').value),
    }))
    .filter((x) => x.exercise);
}

$('#importToDay').onclick = () => {
  const items = collect();
  if (!items.length) return toast('追加する種目をチェックしてください');
  const day = (db.state.workouts[db.date] ||= []);
  for (const it of items) {
    const existing = day.find((w) => w.exercise === it.exercise);
    if (existing) existing.sets.push(...it.sets);
    else day.push({ id: uid(), exercise: it.exercise, sets: it.sets });
  }
  save();
  toast(`${items.length}種目を記録しました`);
  dialog.close();
};

$('#importToRoutine').onclick = () => {
  const items = collect();
  if (!items.length) return toast('メニューにする種目をチェックしてください');
  dialog.close();
  openRoutineEditor(null, items.map((it) => workoutToItem({ exercise: it.exercise, sets: it.sets })));
};
