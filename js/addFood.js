// 食品追加ダイアログ（検索・セット・手入力・写真AI・バーコード）
import { BUILTIN_FOODS, CATEGORIES } from './foods.js';
import { db, save, uid } from './store.js';
import { round, nutrientsFor, scale, sumEntries } from './calc.js';
import { $, $$, el, toast, normalize } from './dom.js';
import { analyzeMealPhoto, readNutritionLabel } from './ai.js';
import { recognizeLabel, parseNutritionText } from './ocr.js';
import { getApiKey } from './store.js';
import { scanBarcode, lookupBarcode } from './barcode.js';
import { inGroup, cachedGroupFoods, refreshGroupFoods, findShared, shareFoodQuietly } from './group.js';

const dialog = $('#addDialog');
let activeMeal = null;
let selectedFood = null;
let category = 'すべて';
let pendingBarcode = null; // 手入力で保存するマイ食品に紐づけるバーコード
let manualUnit = null;     // 成分表示から読んだ基準量

// マイ食品 → グループの共有食品（自分が持っていないもの）→ 内蔵食品
function allFoods() {
  const mine = new Set(db.state.customFoods.map((f) => f.barcode).filter(Boolean));
  const group = cachedGroupFoods().filter((f) => !mine.has(f.barcode));
  return [...db.state.customFoods, ...group, ...BUILTIN_FOODS];
}

export function addEntries(mealId, entries) {
  (db.state.logs[db.date] ||= []).push(...entries.map((e) => ({ ...e, id: uid(), meal: mealId })));
  save();
}

function touchRecent(id) {
  db.state.recent = [id, ...db.state.recent.filter((x) => x !== id)].slice(0, 20);
}

export function openAdd(meal) {
  activeMeal = meal;
  selectedFood = null;
  pendingBarcode = null;
  manualUnit = null;
  $('#addTitle').textContent = `${meal.label}に追加`;
  $('#aiMealNeedKey').classList.toggle('hidden', !!getApiKey());
  $('#foodSearch').value = '';
  $('#amountPanel').classList.add('hidden');
  resetManual();
  renderChips();
  setMode('search');
  dialog.showModal();
  // グループの共有食品を裏で最新化
  if (inGroup()) refreshGroupFoods().then(() => { renderChips(); if (!$('#modeSearch').classList.contains('hidden')) renderFoodList(); }).catch(() => {});
}

$('#closeAdd').onclick = () => dialog.close();
dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

function setMode(mode) {
  $$('#addSeg button').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  $('#addSeg').classList.toggle('hidden', mode === 'ai');
  for (const m of ['search', 'templates', 'manual', 'ai']) {
    $(`#mode${m[0].toUpperCase()}${m.slice(1)}`).classList.toggle('hidden', m !== mode);
  }
  if (mode === 'search') renderFoodList();
  if (mode === 'templates') renderTemplates();
}
$$('#addSeg button').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));

// ---------- 検索 ----------
function renderChips() {
  const box = $('#categoryChips');
  const cats = ['すべて', 'マイ食品', ...(inGroup() ? ['みんなの食品'] : []), ...CATEGORIES];
  if (!cats.includes(category)) category = 'すべて';
  box.replaceChildren(...cats.map((c) =>
    el('button', { class: `chip${c === category ? ' active' : ''}`, onclick: () => { category = c; renderChips(); renderFoodList(); } }, c)));
}

function renderFoodList() {
  const q = normalize($('#foodSearch').value.trim());
  let list = allFoods();
  if (category === 'マイ食品') list = list.filter((f) => f.custom);
  else if (category === 'みんなの食品') list = list.filter((f) => f.shared);
  else if (category !== 'すべて') list = list.filter((f) => f.category === category);
  if (q) {
    list = list.filter((f) => normalize(f.name).includes(q) || (f.yomi && normalize(f.yomi).includes(q)));
  } else if (category === 'すべて') {
    const rank = (f) => { const i = db.state.recent.indexOf(f.id); return i === -1 ? Infinity : i; };
    list = [...list].sort((a, b) => rank(a) - rank(b));
  }
  const ul = $('#foodList');
  ul.replaceChildren();
  if (!list.length) {
    ul.append(el('li', { class: 'muted' }, '見つかりません。「手入力」やバーコード・写真から登録できます'));
    return;
  }
  for (const f of list.slice(0, 80)) {
    const tag = f.custom ? 'マイ' : f.shared ? `みんな${f.addedBy ? `・${f.addedBy}` : ''}` : (!q && db.state.recent.includes(f.id) ? '最近' : null);
    const basis = f.basis === 'serving' ? `${f.unit?.label || '1食'}` : '100g';
    const li = el('li', { onclick: () => selectFood(f) },
      el('span', { class: 'food-name' }, f.name, tag && el('span', { class: 'tag' }, tag)),
      el('span', { class: 'food-meta' },
        el('span', { class: 'muted small' }, `${basis} ${f.kcal}kcal P${f.p}`),
        f.custom && el('button', {
          class: 'icon small-del', 'aria-label': '削除',
          onclick: (e) => { e.stopPropagation(); deleteCustom(f); },
        }, '✕')));
    if (selectedFood?.id === f.id) li.classList.add('selected');
    ul.append(li);
  }
}
$('#foodSearch').addEventListener('input', renderFoodList);

function deleteCustom(f) {
  if (!confirm(`マイ食品「${f.name}」を削除しますか？（記録済みの食事は消えません）`)) return;
  db.state.customFoods = db.state.customFoods.filter((x) => x.id !== f.id);
  save();
  if (selectedFood?.id === f.id) { selectedFood = null; $('#amountPanel').classList.add('hidden'); }
  renderFoodList();
}

function selectFood(food) {
  setMode('search');
  selectedFood = food;
  renderFoodList();
  $('#selName').textContent = food.name;
  const unit = $('#amountUnit');
  unit.replaceChildren();
  const hasUnit = food.unit && !(food.basis === '100g' && food.unit.g === 100);
  if (hasUnit) unit.append(el('option', { value: 'unit' }, `× ${food.unit.label}${food.unit.g ? `（${food.unit.g}g）` : ''}`));
  if (food.basis === '100g' || food.unit?.g) unit.append(el('option', { value: 'g' }, 'g'));
  $('#amountValue').value = unit.value === 'g' ? 100 : 1;
  $('#amountPanel').classList.remove('hidden');
  updatePreview();
  $('#amountPanel').scrollIntoView({ block: 'nearest' });
}

function currentSelection() {
  const v = Number($('#amountValue').value) || 0;
  const u = $('#amountUnit').value;
  const f = selectedFood;
  const label = u === 'g' ? `${v}g` : `${v === 1 ? '' : `${v}×`}${f.unit.label}`;
  return { nut: nutrientsFor(f, v, u), label };
}

function updatePreview() {
  if (!selectedFood) return;
  const { nut } = currentSelection();
  $('#preview').replaceChildren(el('b', {}, `${nut.kcal}kcal`), `  P ${nut.p}g / F ${nut.f}g / C ${nut.c}g`);
}
$('#amountValue').addEventListener('input', updatePreview);
$('#amountUnit').addEventListener('change', () => {
  $('#amountValue').value = $('#amountUnit').value === 'g' ? (selectedFood.unit?.g || 100) : 1;
  updatePreview();
});

$('#addSelected').onclick = () => {
  if (!selectedFood) return;
  const { nut, label } = currentSelection();
  if (!(Number($('#amountValue').value) > 0)) return toast('量を入力してください');
  touchRecent(selectedFood.id);
  addEntries(activeMeal.id, [{ name: selectedFood.name, amountLabel: label, ...nut }]);
  toast(`${selectedFood.name} を追加しました`);
  dialog.close();
};

// ---------- セット ----------
function renderTemplates() {
  const ul = $('#templateList');
  ul.replaceChildren();
  if (!db.state.templates.length) ul.append(el('li', { class: 'muted' }, 'まだセットがありません'));
  for (const t of db.state.templates) {
    const s = sumEntries(t.items);
    ul.append(el('li', {},
      el('div', {},
        el('div', {}, t.name),
        el('div', { class: 'muted small' }, `${t.items.length}品 ${round(s.kcal)}kcal P${round(s.p, 1)} F${round(s.f, 1)} C${round(s.c, 1)}`)),
      el('span', { class: 'food-meta' },
        el('button', {
          class: 'btn small', onclick: () => {
            addEntries(activeMeal.id, t.items.map((i) => ({ ...i })));
            toast(`「${t.name}」を追加しました`);
            dialog.close();
          },
        }, '追加'),
        el('button', {
          class: 'icon', 'aria-label': '削除', onclick: () => {
            if (!confirm(`セット「${t.name}」を削除しますか？`)) return;
            db.state.templates = db.state.templates.filter((x) => x.id !== t.id);
            save();
            renderTemplates();
          },
        }, '✕'))));
  }
}

export function saveTemplate(entries, defaultName) {
  const name = prompt('セット名を入力してください', defaultName);
  if (!name) return;
  db.state.templates.unshift({
    id: uid(), name: name.trim(),
    items: entries.map(({ name: n, amountLabel, kcal, p, f, c }) => ({ name: n, amountLabel, kcal, p, f, c })),
  });
  save();
  toast(`セット「${name}」を保存しました`);
}

// ---------- 手入力 ----------
function resetManual(note) {
  $('#modeManual').reset();
  manualUnit = null;
  $('#pasteBox').open = false;
  $('#labelAiRetry').classList.add('hidden');
  $('#manualNote').textContent = note || '';
  $('#manualNote').classList.toggle('hidden', !note);
}

$('#modeManual').addEventListener('submit', (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const base = { kcal: round(Number(fd.get('kcal'))), p: round(Number(fd.get('p')), 1), f: round(Number(fd.get('f')), 1), c: round(Number(fd.get('c')), 1) };
  const qty = Number(fd.get('qty')) || 1;
  const name = String(fd.get('name')).trim();
  if (fd.get('save')) {
    const id = `custom-${uid()}`;
    const food = {
      id, name, custom: true, basis: 'serving', ...base,
      unit: manualUnit || { label: '1食' },
      ...(pendingBarcode ? { barcode: pendingBarcode } : {}),
    };
    db.state.customFoods.unshift(food);
    touchRecent(id);
    if (food.barcode) shareFoodQuietly(food, () => toast('グループに共有しました'));
  }
  const unitLabel = manualUnit?.label || '';
  addEntries(activeMeal.id, [{ name, amountLabel: qty === 1 ? '' : `${qty}×${unitLabel || '食分'}`, ...scale(base, qty) }]);
  toast(`${name} を追加しました`);
  dialog.close();
});

// ---------- 写真AI ----------
let photoMode = 'meal';
$('#aiMealBtn').onclick = () => {
  if (!getApiKey()) {
    setMode('ai');
    $('#aiStatus').textContent = '食事写真から料理と量を推定するには、設定画面で Claude のAPIキーを登録してください。';
    $('#aiNote').textContent = '料理の判別と量の推定は、スマホ内だけで処理すると精度が大きく落ちるため、AI（APIキー）が必要です。キーなしでも「🏷 成分表示を撮影」「▥ バーコード」「セット」は使えます。';
    return;
  }
  photoMode = 'meal';
  pickPhoto();
};
$('#aiLabelBtn').onclick = () => { photoMode = 'label'; pickPhoto(); };

function pickPhoto() {
  const input = $('#photoInput');
  input.value = '';
  input.click();
}

function aiBusy(msg) {
  setMode('ai');
  $('#aiStatus').replaceChildren(el('span', { class: 'spinner' }), msg);
  $('#aiItems').replaceChildren();
  $('#aiNote').textContent = '';
  $('#aiAdd').classList.add('hidden');
}

$('#photoInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (photoMode === 'label') return handleLabel(file);
  aiBusy('AIが写真を解析しています…（10〜30秒）');
  try {
    const out = await analyzeMealPhoto(file);
    showMealResult(out);
  } catch (err) {
    $('#aiStatus').textContent = `⚠️ ${err.message}`;
  }
});

function showMealResult(out) {
  if (!out.items.length) {
    $('#aiStatus').textContent = '食事が見つかりませんでした。別の写真で試してください。';
    return;
  }
  $('#aiStatus').textContent = '推定結果（数値は編集できます）';
  const ul = $('#aiItems');
  ul.replaceChildren();
  for (const it of out.items) {
    const num = (k, v, label) => el('label', {}, label, el('input', { type: 'number', step: 'any', min: '0', name: k, value: String(v), inputmode: 'decimal' }));
    ul.append(el('li', { class: 'ai-item' },
      el('label', { class: 'check' }, el('input', { type: 'checkbox', name: 'use', checked: true }),
        el('input', { name: 'name', value: it.name, class: 'ai-name' }),
        el('span', { class: 'muted small nowrap' }, `約${round(it.grams)}g`)),
      el('div', { class: 'grid4 compact' },
        num('kcal', round(it.kcal), 'kcal'), num('p', round(it.p, 1), 'P'), num('f', round(it.f, 1), 'F'), num('c', round(it.c, 1), 'C')),
      el('input', { type: 'hidden', name: 'grams', value: String(round(it.grams)) })));
  }
  $('#aiNote').textContent = `${out.note ? `${out.note} ` : ''}※写真からの推定は誤差が大きい（±20〜30%程度）ので、気になる値は修正してください。`;
  $('#aiAdd').classList.remove('hidden');
}

$('#aiAdd').onclick = () => {
  const entries = $$('#aiItems li.ai-item')
    .filter((li) => $('input[name=use]', li).checked)
    .map((li) => {
      const v = (k) => Number($(`input[name=${k}]`, li).value) || 0;
      return {
        name: $('input[name=name]', li).value.trim() || '食品',
        amountLabel: `約${v('grams')}g・AI推定`, src: 'ai',
        kcal: round(v('kcal')), p: round(v('p'), 1), f: round(v('f'), 1), c: round(v('c'), 1),
      };
    });
  if (!entries.length) return toast('追加する食品をチェックしてください');
  addEntries(activeMeal.id, entries);
  toast(`${entries.length}品を追加しました`);
  dialog.close();
};

let lastLabelFile = null;

// 読み取り結果を手入力フォームに反映（null の項目は空欄のまま）
function fillManualFromLabel(r, note) {
  const keepBarcode = pendingBarcode;
  resetManual(note);
  pendingBarcode = keepBarcode;
  manualUnit = r.basis ? { label: r.basis, ...(r.basisGrams > 0 ? { g: r.basisGrams } : {}) } : null;
  applyParsed(r);
  const form = $('#modeManual');
  if (r.name) form.elements.name.value = r.name;
  $('#labelAiRetry').classList.toggle('hidden', !getApiKey() || !lastLabelFile);
  setMode('manual');
}

function applyParsed(r) {
  const form = $('#modeManual');
  for (const [k, d] of [['kcal', 0], ['p', 1], ['f', 1], ['c', 1]]) {
    if (r[k] !== null && r[k] !== undefined) form.elements[k].value = round(r[k], d);
  }
}

// 端末内OCR（無料・オフライン・画像は送信しない）
async function handleLabel(file) {
  lastLabelFile = file;
  aiBusy('成分表示を読み取っています（スマホ内で処理）…');
  try {
    const r = await recognizeLabel(file, (msg) => {
      $('#aiStatus').replaceChildren(el('span', { class: 'spinner' }), msg);
    });
    const ok = r.found >= 2;
    fillManualFromLabel(r, ok
      ? `📋 読み取り結果（${r.basis ? `${r.basis}あたり` : '基準量不明'}・${r.found}/4項目）。数値が合っているか確認して「追加」してください。`
      : '⚠️ 数値をうまく読み取れませんでした。成分表示だけを画面いっぱいに、まっすぐ・明るく撮り直すか、下の読み取りテキストを直してください。');
    $('#pasteText').value = r.text.trim();
    $('#pasteBox').open = !ok;
    $('#modeManual').elements.name.focus();
  } catch (err) {
    $('#aiStatus').textContent = `⚠️ 読み取りに失敗しました: ${err.message}`;
  }
}

// APIキーがある場合の高精度読み取り
async function handleLabelAi(file) {
  aiBusy('AIで栄養成分表示を読み取っています…');
  try {
    const r = await readNutritionLabel(file);
    if (!r.found) {
      $('#aiStatus').textContent = '⚠️ 栄養成分表示を読み取れませんでした。表示部分を大きく、ピントを合わせて撮影してください。';
      return;
    }
    const basis = r.basis ? r.basis.replace(/あたり|当たり/g, '') : '';
    fillManualFromLabel({ ...r, basis }, `📋 AIの読み取り結果（${r.basis || '基準量不明'}）。内容を確認して「追加」してください。`);
    $('#labelAiRetry').classList.add('hidden');
  } catch (err) {
    $('#aiStatus').textContent = `⚠️ ${err.message}`;
  }
}
$('#labelAiRetry').onclick = () => lastLabelFile && handleLabelAi(lastLabelFile);

// 貼り付けたテキストから自動入力
$('#pasteText').addEventListener('input', (e) => {
  const r = parseNutritionText(e.target.value);
  applyParsed(r);
  if (r.basis && !manualUnit) manualUnit = { label: r.basis, ...(r.basisGrams > 0 ? { g: r.basisGrams } : {}) };
});

// ---------- バーコード ----------
$('#barcodeBtn').onclick = async () => {
  const code = await scanBarcode();
  if (!code) return;
  const mine = db.state.customFoods.find((f) => f.barcode === code);
  if (mine) return selectFood(mine);

  aiBusy(`商品を検索しています…（${code}）`);
  const shared = await findShared(code);
  if (shared) {
    toast(`グループで登録済みの商品です${shared.addedBy ? `（${shared.addedBy}さん）` : ''}`);
    return selectFood(shared);
  }
  let info = null;
  try {
    info = await lookupBarcode(code);
  } catch (err) {
    toast(err.message);
  }
  if (info) {
    const food = {
      id: `bc-${code}`, custom: true, barcode: code, basis: '100g',
      name: info.name, kcal: info.kcal, p: info.p, f: info.f, c: info.c,
      unit: info.servingG ? { label: '1食', g: info.servingG } : { label: '100g', g: 100 },
    };
    db.state.customFoods = [food, ...db.state.customFoods.filter((f) => f.id !== food.id)];
    save();
    toast('商品が見つかりました（マイ食品に保存）');
    shareFoodQuietly(food);
    selectFood(food);
  } else {
    resetManual(`バーコード ${code} の商品はデータベースにありませんでした。「🏷 成分表示を撮影」で読み取るか、手入力してください。保存すると次回からこのバーコードで呼び出せます${inGroup() ? '（グループの友達にも共有されます）' : ''}。`);
    pendingBarcode = code;
    setMode('manual');
  }
};

renderChips();
