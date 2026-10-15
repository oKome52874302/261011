// レシピ（写真・PDF・テキスト）から1人分のカロリー・PFCを計算する（AIなし）
import { BUILTIN_FOODS } from './foods.js';
import { db, save, uid } from './store.js';
import { round, scale } from './calc.js';
import { $, el, toast } from './dom.js';
import { parseRecipeText, matchFood, gramsFor, isZeroIngredient } from './recipeParse.js';
import { recognizeText } from './ocr.js';
import { pdfToText } from './pdf.js';

const dialog = $('#recipeDialog');
let ctx = null; // { meal, addEntries, closeParent }
let rows = [];  // { raw, name, food, grams, use, zero }
let current = { per: null, sv: 1 };

const allFoods = () => [...db.state.customFoods, ...BUILTIN_FOODS];
const foodByName = (name) => allFoods().find((f) => f.name === name) || null;

export function openRecipe(meal, addEntries, closeParent) {
  ctx = { meal, addEntries, closeParent };
  $('#recipeText').value = '';
  $('#recipeName').value = '';
  $('#recipeServings').value = 1;
  $('#recipeStatus').textContent = '';
  $('#foodNameList').replaceChildren(...allFoods().map((f) => el('option', { value: f.name })));
  rows = [];
  render();
  dialog.showModal();
}

$('#recipeClose').onclick = () => dialog.close();

function status(msg, busy = false) {
  $('#recipeStatus').replaceChildren(...(busy ? [el('span', { class: 'spinner' })] : []), msg);
}

// ---------- 入力 ----------
$('#recipePhotoBtn').onclick = () => { $('#recipePhoto').value = ''; $('#recipePhoto').click(); };
$('#recipePdfBtn').onclick = () => { $('#recipePdf').value = ''; $('#recipePdf').click(); };

$('#recipePhoto').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    status('レシピを読み取っています（スマホ内で処理）…', true);
    const text = await recognizeText(file, (m) => status(m, true));
    loadText(text);
  } catch (err) { status(`⚠️ ${err.message}`); }
});

$('#recipePdf').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    status('PDFを読み込んでいます…', true);
    const text = await pdfToText(file, (m) => status(m, true));
    loadText(text);
  } catch (err) { status(`⚠️ PDFを読み込めませんでした: ${err.message}`); }
});

function loadText(text) {
  $('#recipeText').value = text.trim();
  analyze();
  status(rows.length
    ? `${rows.length}個の材料を見つけました。照合結果とグラム数を確認してください。`
    : '⚠️ 材料を見つけられませんでした。「材料」の部分が写るように撮るか、テキストを直接貼り付けてください。');
}

let debounce;
$('#recipeText').addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(analyze, 300); });

function analyze() {
  const r = parseRecipeText($('#recipeText').value);
  if (r.title && !$('#recipeName').value) $('#recipeName').value = r.title;
  if (r.servings) $('#recipeServings').value = r.servings;
  const foods = allFoods();
  rows = r.items.map((it) => {
    const zero = isZeroIngredient(it.name);
    const food = zero ? null : matchFood(it.name, foods);
    const grams = zero ? 0 : food ? gramsFor(it, food) : null;
    return { raw: it.raw, name: it.name, food, grams: grams === null ? null : round(grams, 1), use: !zero, zero };
  });
  render();
}

// ---------- 表示 ----------
function nutOf(row) {
  if (!row.use || !row.food || row.grams === null) return null;
  return scale(row.food, row.food.basis === 'serving' && row.food.unit?.g ? row.grams / row.food.unit.g : row.grams / 100);
}

function render() {
  const ul = $('#recipeRows');
  ul.replaceChildren(...rows.map((row, i) => {
    const n = nutOf(row);
    const warn = row.use && (!row.food || row.grams === null);
    const foodInput = el('input', { list: 'foodNameList', value: row.food?.name || '', placeholder: row.zero ? '（0kcalとして計算）' : '食品を選ぶ', class: 'rc-food' });
    foodInput.onchange = () => { row.food = foodByName(foodInput.value); if (row.food && row.grams === null) row.grams = row.food.unit?.g || 100; row.use = true; render(); };
    const gInput = el('input', { type: 'number', min: '0', step: 'any', inputmode: 'decimal', value: row.grams === null ? '' : String(row.grams), placeholder: 'g', class: 'rc-g' });
    gInput.onchange = () => { row.grams = gInput.value === '' ? null : Number(gInput.value); render(); };
    const cb = el('input', { type: 'checkbox', checked: row.use });
    cb.onchange = () => { row.use = cb.checked; render(); };
    return el('li', { class: `rc-row${warn ? ' warn' : ''}${row.use ? '' : ' off'}` },
      el('div', { class: 'rc-top' }, cb, el('span', { class: 'rc-raw' }, row.raw)),
      el('div', { class: 'rc-bottom' }, foodInput, gInput, el('span', { class: 'muted small rc-k' }, n ? `${n.kcal}kcal` : warn ? '要確認' : '—')));
  }));

  const total = rows.reduce((s, r) => { const n = nutOf(r); if (n) for (const k of ['kcal', 'p', 'f', 'c']) s[k] += n[k]; return s; }, { kcal: 0, p: 0, f: 0, c: 0 });
  const sv = Math.max(1, Number($('#recipeServings').value) || 1);
  const per = scale(total, 1 / sv);
  const unknown = rows.filter((r) => r.use && (!r.food || r.grams === null)).length;
  $('#recipeTotal').replaceChildren(...[
    el('div', {}, el('span', { class: 'muted small' }, '全体 '), `${round(total.kcal)}kcal  P${round(total.p, 1)} F${round(total.f, 1)} C${round(total.c, 1)}`),
    el('div', { class: 'rc-per' }, el('span', { class: 'muted small' }, `1人分（${sv}人分で割る） `), el('b', {}, `${per.kcal}kcal`), `  P${per.p} F${per.f} C${per.c}`),
    unknown > 0 && el('div', { class: 'warn-text' }, `⚠️ ${unknown}個の材料が未確定です（食品とグラム数を入れるか、チェックを外してください）`),
  ].filter(Boolean));
  $('#recipeActions').classList.toggle('hidden', !rows.length);
  current = { per, sv };
}
$('#recipeServings').addEventListener('input', render);

// ---------- 保存 ----------
function recipeName() { return $('#recipeName').value.trim() || 'レシピ'; }

$('#recipeAdd').onclick = () => {
  if (!current.per || current.per.kcal <= 0) return toast('材料を確認してください');
  ctx.addEntries(ctx.meal.id, [{ name: recipeName(), amountLabel: '1人分・レシピ', ...current.per }]);
  toast(`${recipeName()}（1人分）を追加しました`);
  dialog.close();
  ctx.closeParent?.();
};

$('#recipeSave').onclick = () => {
  if (!current.per || current.per.kcal <= 0) return toast('材料を確認してください');
  const id = `custom-${uid()}`;
  db.state.customFoods.unshift({ id, name: recipeName(), custom: true, basis: 'serving', unit: { label: '1人分' }, ...current.per, recipe: true });
  save();
  toast(`「${recipeName()}」をマイ食品に保存しました（1人分）`);
};
