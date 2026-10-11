'use strict';

// ---------- 保存 ----------
const STORAGE_KEY = 'macrolog-v1';
const MEALS = [
  { id: 'breakfast', label: '朝食' },
  { id: 'lunch', label: '昼食' },
  { id: 'dinner', label: '夕食' },
  { id: 'snack', label: '間食・プロテイン' },
];
const GOAL_LABEL = { cut: '減量中', maintain: '維持', bulk: '増量中' };

function defaultState() {
  return {
    profile: { sex: 'male', age: 20, height: 170, weight: 65, activity: 1.55, goal: 'maintain', manual: false },
    logs: {},        // { 'YYYY-MM-DD': [entry] }
    weights: {},     // { 'YYYY-MM-DD': kg }
    customFoods: [], // マイ食品
    recent: [],      // 最近使った食品ID
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...defaultState(), ...JSON.parse(raw) } : defaultState();
  } catch {
    return defaultState();
  }
}
let state = load();
const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

// ---------- 計算 ----------
const round = (n, d = 0) => Math.round(n * 10 ** d) / 10 ** d;

function calcTargets(pr) {
  const bmr = 10 * pr.weight + 6.25 * pr.height - 5 * pr.age + (pr.sex === 'male' ? 5 : -161);
  const tdee = bmr * Number(pr.activity);
  const factor = { cut: 0.8, maintain: 1.0, bulk: 1.1 }[pr.goal];
  const proteinPerKg = { cut: 2.2, maintain: 1.8, bulk: 2.0 }[pr.goal];
  let kcal = tdee * factor;
  let p = pr.weight * proteinPerKg;
  let f = (kcal * 0.25) / 9;
  let c = Math.max(0, (kcal - p * 4 - f * 9) / 4);
  if (pr.manual) {
    kcal = Number(pr.mKcal) || kcal;
    p = Number(pr.mP) || p;
    f = Number(pr.mF) || f;
    c = Number(pr.mC) || c;
  }
  return { bmr: round(bmr), tdee: round(tdee), kcal: round(kcal), p: round(p), f: round(f), c: round(c) };
}

function sumEntries(entries) {
  return entries.reduce(
    (s, e) => ({ kcal: s.kcal + e.kcal, p: s.p + e.p, f: s.f + e.f, c: s.c + e.c }),
    { kcal: 0, p: 0, f: 0, c: 0 },
  );
}

function nutrientsFor(food, grams) {
  const r = grams / 100;
  return { kcal: round(food.kcal * r), p: round(food.p * r, 1), f: round(food.f * r, 1), c: round(food.c * r, 1) };
}

// ---------- 日付 ----------
const toKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const shiftKey = (k, n) => { const d = fromKey(k); d.setDate(d.getDate() + n); return toKey(d); };
let currentDate = toKey(new Date());

// ---------- DOM ヘルパ ----------
const $ = (s) => document.querySelector(s);
const el = (tag, attrs = {}, ...children) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const c of children) n.append(c);
  return n;
};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------- 食事画面 ----------
function renderToday() {
  const t = calcTargets(state.profile);
  const entries = state.logs[currentDate] || [];
  const total = sumEntries(entries);

  const today = toKey(new Date());
  const d = fromKey(currentDate);
  const wd = '日月火水木金土'[d.getDay()];
  $('#dateLabel').textContent = currentDate === today ? `今日 ${d.getMonth() + 1}/${d.getDate()}(${wd})` : `${d.getMonth() + 1}/${d.getDate()}(${wd})`;

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
        el('button', { class: 'add-btn', onclick: () => openAdd(m) }, '+ 追加')));
    for (const e of list) {
      card.append(el('div', { class: 'entry' },
        el('div', {},
          el('div', { class: 'name' }, e.amountLabel ? `${e.name}（${e.amountLabel}）` : e.name),
          el('div', { class: 'nut' }, `${e.kcal}kcal  P${e.p} F${e.f} C${e.c}`)),
        el('button', { class: 'del', 'aria-label': '削除', onclick: () => removeEntry(e.id) }, '✕')));
    }
    meals.append(card);
  }
  $('#goalBadge').textContent = `${GOAL_LABEL[state.profile.goal]} ・ 目標 ${t.kcal}kcal`;
}

function setBar(node, value, target) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  node.style.width = `${pct}%`;
  node.classList.toggle('over', target > 0 && value > target * 1.05);
}

function addEntry(entry) {
  (state.logs[currentDate] ||= []).push({ id: uid(), ...entry });
  save();
  renderToday();
}

function removeEntry(id) {
  state.logs[currentDate] = (state.logs[currentDate] || []).filter((e) => e.id !== id);
  save();
  renderToday();
}

$('#prevDay').onclick = () => { currentDate = shiftKey(currentDate, -1); renderToday(); };
$('#nextDay').onclick = () => { currentDate = shiftKey(currentDate, 1); renderToday(); };
$('#dateLabel').onclick = () => { currentDate = toKey(new Date()); renderToday(); };
$('#copyPrev').onclick = () => {
  const prev = state.logs[shiftKey(currentDate, -1)] || [];
  if (!prev.length) return alert('前日の記録がありません');
  if (!confirm(`前日の${prev.length}件をこの日に追加しますか？`)) return;
  state.logs[currentDate] = [...(state.logs[currentDate] || []), ...prev.map((e) => ({ ...e, id: uid() }))];
  save();
  renderToday();
};

// ---------- 食品追加ダイアログ ----------
const dialog = $('#addDialog');
let activeMeal = null;
let selectedFood = null;

const allFoods = () => [...state.customFoods, ...BUILTIN_FOODS];

function openAdd(meal) {
  activeMeal = meal;
  selectedFood = null;
  $('#addTitle').textContent = `${meal.label}に追加`;
  $('#foodSearch').value = '';
  $('#amountPanel').classList.add('hidden');
  $('#modeManual').reset();
  setMode('search');
  renderFoodList();
  dialog.showModal();
}
$('#closeAdd').onclick = () => dialog.close();
dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

function setMode(mode) {
  document.querySelectorAll('.seg button').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  $('#modeSearch').classList.toggle('hidden', mode !== 'search');
  $('#modeManual').classList.toggle('hidden', mode !== 'manual');
}
document.querySelectorAll('.seg button').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));

function renderFoodList() {
  const q = $('#foodSearch').value.trim().toLowerCase();
  const foods = allFoods();
  let list = q ? foods.filter((f) => f.name.toLowerCase().includes(q)) : foods;
  if (!q) {
    // 最近使った順を先頭に
    const rank = (f) => { const i = state.recent.indexOf(f.id); return i === -1 ? Infinity : i; };
    list = [...list].sort((a, b) => rank(a) - rank(b));
  }
  const ul = $('#foodList');
  ul.replaceChildren();
  if (!list.length) {
    ul.append(el('li', { class: 'muted' }, '見つかりません。「手入力」から登録できます'));
    return;
  }
  for (const f of list) {
    const name = el('span', {}, f.name);
    if (f.custom) name.append(el('span', { class: 'tag' }, 'マイ'));
    else if (state.recent.includes(f.id) && !q) name.append(el('span', { class: 'tag' }, '最近'));
    const li = el('li', { onclick: () => selectFood(f, li) }, name,
      el('span', { class: 'muted small' }, f.custom ? `1食 ${f.kcal}kcal P${f.p}` : `100g ${f.kcal}kcal P${f.p}`));
    if (selectedFood && selectedFood.id === f.id) li.classList.add('selected');
    ul.append(li);
  }
}
$('#foodSearch').addEventListener('input', renderFoodList);

function selectFood(food, li) {
  selectedFood = food;
  document.querySelectorAll('#foodList li').forEach((n) => n.classList.remove('selected'));
  li.classList.add('selected');
  $('#selName').textContent = food.name;
  const unit = $('#amountUnit');
  unit.replaceChildren();
  if (food.custom) {
    unit.append(el('option', { value: 'serving' }, '食分'));
    $('#amountValue').value = 1;
  } else {
    unit.append(el('option', { value: 'unit' }, `× ${food.unit.label}（${food.unit.g}g）`));
    unit.append(el('option', { value: 'g' }, 'g'));
    $('#amountValue').value = 1;
  }
  $('#amountPanel').classList.remove('hidden');
  updatePreview();
  $('#amountPanel').scrollIntoView({ block: 'nearest' });
}

function currentSelection() {
  const v = Number($('#amountValue').value) || 0;
  const u = $('#amountUnit').value;
  const f = selectedFood;
  if (f.custom) {
    return { nut: { kcal: round(f.kcal * v), p: round(f.p * v, 1), f: round(f.f * v, 1), c: round(f.c * v, 1) }, label: v === 1 ? '' : `${v}食分` };
  }
  const grams = u === 'g' ? v : v * f.unit.g;
  const label = u === 'g' ? `${v}g` : `${v === 1 ? '' : `${v}×`}${f.unit.label}`;
  return { nut: nutrientsFor(f, grams), label };
}

function updatePreview() {
  if (!selectedFood) return;
  const { nut } = currentSelection();
  $('#preview').innerHTML = '';
  $('#preview').append(
    el('b', {}, `${nut.kcal}kcal`), `  P ${nut.p}g / F ${nut.f}g / C ${nut.c}g`);
}
$('#amountValue').addEventListener('input', updatePreview);
$('#amountUnit').addEventListener('change', () => {
  // 単位切替時は分かりやすい初期値に
  $('#amountValue').value = $('#amountUnit').value === 'g' ? selectedFood.unit.g : 1;
  updatePreview();
});

$('#addSelected').onclick = () => {
  if (!selectedFood) return;
  const { nut, label } = currentSelection();
  if (nut.kcal === 0 && nut.p === 0) return;
  addEntry({ meal: activeMeal.id, name: selectedFood.name, amountLabel: label, ...nut });
  state.recent = [selectedFood.id, ...state.recent.filter((id) => id !== selectedFood.id)].slice(0, 15);
  save();
  dialog.close();
};

$('#modeManual').addEventListener('submit', (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const nut = { kcal: round(Number(fd.get('kcal'))), p: round(Number(fd.get('p')), 1), f: round(Number(fd.get('f')), 1), c: round(Number(fd.get('c')), 1) };
  const name = String(fd.get('name')).trim();
  if (fd.get('save')) {
    const id = `custom-${uid()}`;
    state.customFoods.unshift({ id, name, custom: true, ...nut });
    state.recent = [id, ...state.recent].slice(0, 15);
  }
  addEntry({ meal: activeMeal.id, name, amountLabel: '', ...nut });
  dialog.close();
});

// ---------- 体重 ----------
function renderWeight() {
  const keys = Object.keys(state.weights).sort();
  const ul = $('#weightList');
  ul.replaceChildren();
  for (const k of [...keys].reverse()) {
    ul.append(el('li', {},
      el('span', {}, k.replaceAll('-', '/')),
      el('span', {}, el('b', {}, `${state.weights[k]} kg`),
        el('button', { class: 'icon', 'aria-label': '削除', onclick: () => { delete state.weights[k]; save(); renderWeight(); } }, '✕'))));
  }
  renderWeightChart(keys);
}

function movingAvg(keys, i) {
  // 対象日から過去7日以内の記録の平均
  const end = fromKey(keys[i]);
  const vals = keys.filter((k) => { const diff = (end - fromKey(k)) / 864e5; return diff >= 0 && diff < 7; }).map((k) => state.weights[k]);
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function renderWeightChart(allKeys) {
  const box = $('#weightChart');
  const keys = allKeys.slice(-60);
  if (keys.length < 2) {
    box.innerHTML = '<p class="hint">2日分以上記録するとグラフが表示されます。</p>';
    $('#weightTrend').textContent = '';
    return;
  }
  const W = 320, H = 160, pad = 28;
  const vals = keys.map((k) => state.weights[k]);
  const avgs = keys.map((_, i) => movingAvg(keys, i));
  const min = Math.min(...vals, ...avgs) - 0.5, max = Math.max(...vals, ...avgs) + 0.5;
  const t0 = fromKey(keys[0]).getTime(), t1 = fromKey(keys.at(-1)).getTime();
  const x = (k) => pad + ((fromKey(k).getTime() - t0) / (t1 - t0)) * (W - pad - 8);
  const y = (v) => 8 + (1 - (v - min) / (max - min)) * (H - 28);
  const path = (arr) => arr.map((v, i) => `${i ? 'L' : 'M'}${x(keys[i]).toFixed(1)},${y(v).toFixed(1)}`).join('');
  box.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="体重推移">
      <text x="2" y="${y(max) + 10}" fill="#94a3b8" font-size="9">${max.toFixed(1)}</text>
      <text x="2" y="${y(min)}" fill="#94a3b8" font-size="9">${min.toFixed(1)}</text>
      <text x="${pad}" y="${H - 4}" fill="#94a3b8" font-size="9">${keys[0].slice(5).replace('-', '/')}</text>
      <text x="${W - 8}" y="${H - 4}" fill="#94a3b8" font-size="9" text-anchor="end">${keys.at(-1).slice(5).replace('-', '/')}</text>
      <path d="${path(vals)}" fill="none" stroke="#22c55e" stroke-width="2"/>
      <path d="${path(avgs)}" fill="none" stroke="#f1f5f9" stroke-width="1.5" stroke-dasharray="4 3"/>
      ${vals.map((v, i) => `<circle cx="${x(keys[i]).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.5" fill="#22c55e"/>`).join('')}
    </svg>`;

  // 直近の7日平均と、その7日前の7日平均を比べて週あたりの変化を出す
  const lastKey = keys.at(-1);
  const weekAgo = shiftKey(lastKey, -7);
  const idxPrev = allKeys.findLastIndex((k) => k <= weekAgo);
  if (idxPrev >= 0) {
    const diff = movingAvg(allKeys, allKeys.length - 1) - movingAvg(allKeys, idxPrev);
    const pct = (diff / movingAvg(allKeys, idxPrev)) * 100;
    let advice = '';
    const g = state.profile.goal;
    if (g === 'cut') advice = pct < -1 ? '落ちるペースが速め。筋肉を守るため少し摂取量を増やしても◎' : pct > -0.25 ? 'ペースが緩やか。停滞が2週続くなら100〜200kcal減らす目安' : '理想的なペース（週0.5〜1%減）';
    if (g === 'bulk') advice = pct > 0.5 ? '増えるペースが速め。脂肪がつきやすいので少し控えめに' : pct < 0.1 ? 'あまり増えていません。100〜200kcal増やす目安' : '良いペース（週0.25〜0.5%増）';
    if (g === 'maintain') advice = Math.abs(pct) < 0.3 ? '安定しています' : '少し変動しています。摂取量を見直してみましょう';
    $('#weightTrend').textContent = `7日平均の変化: ${diff >= 0 ? '+' : ''}${diff.toFixed(2)}kg/週（${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%） … ${advice}`;
  } else {
    $('#weightTrend').textContent = '1週間以上記録すると、週あたりのペースと調整アドバイスを表示します。';
  }
}

$('#weightForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const k = $('#weightDate').value;
  const v = round(Number($('#weightValue').value), 1);
  state.weights[k] = v;
  // 最新の体重はプロフィールにも反映（目標計算が自動で追従）
  const latest = Object.keys(state.weights).sort().at(-1);
  state.profile.weight = state.weights[latest];
  save();
  $('#weightValue').value = '';
  renderWeight();
});

// ---------- 設定 ----------
const pf = $('#profileForm');
function fillProfile() {
  const p = state.profile;
  for (const k of ['sex', 'age', 'height', 'weight', 'activity', 'goal', 'mKcal', 'mP', 'mF', 'mC']) {
    if (p[k] !== undefined) pf.elements[k].value = p[k];
  }
  pf.elements.manual.checked = !!p.manual;
  $('#manualFields').classList.toggle('hidden', !p.manual);
  renderCalc();
}
function renderCalc() {
  const t = calcTargets(state.profile);
  const dl = $('#calcResult');
  dl.replaceChildren();
  for (const [k, v] of [['基礎代謝', `${t.bmr} kcal`], ['消費(TDEE)', `${t.tdee} kcal`], ['目標カロリー', `${t.kcal} kcal`], ['たんぱく質', `${t.p} g`], ['脂質', `${t.f} g`], ['炭水化物', `${t.c} g`]]) {
    dl.append(el('dt', {}, k), el('dd', {}, v));
  }
}
$('#manualToggle').addEventListener('change', (e) => {
  $('#manualFields').classList.toggle('hidden', !e.target.checked);
  if (e.target.checked) {
    // 自動計算値を初期値として入れておく
    const t = calcTargets({ ...state.profile, manual: false });
    pf.elements.mKcal.value ||= t.kcal; pf.elements.mP.value ||= t.p;
    pf.elements.mF.value ||= t.f; pf.elements.mC.value ||= t.c;
  }
});
pf.addEventListener('submit', (e) => {
  e.preventDefault();
  const fd = new FormData(pf);
  state.profile = {
    sex: fd.get('sex'), age: Number(fd.get('age')), height: Number(fd.get('height')), weight: Number(fd.get('weight')),
    activity: Number(fd.get('activity')), goal: fd.get('goal'), manual: !!fd.get('manual'),
    mKcal: fd.get('mKcal'), mP: fd.get('mP'), mF: fd.get('mF'), mC: fd.get('mC'),
  };
  save();
  renderCalc();
  renderToday();
  alert('保存しました');
});

$('#exportBtn').onclick = () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `macrolog-${toKey(new Date())}.json` });
  a.click();
  URL.revokeObjectURL(a.href);
};
$('#importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data.logs || !data.profile) throw new Error('形式が違います');
    if (!confirm('現在のデータを上書きして読み込みますか？')) return;
    state = { ...defaultState(), ...data };
    save();
    fillProfile(); renderToday(); renderWeight();
    alert('読み込みました');
  } catch (err) {
    alert(`読み込みに失敗しました: ${err.message}`);
  } finally {
    e.target.value = '';
  }
});
$('#resetBtn').onclick = () => {
  if (!confirm('本当に全データを削除しますか？（元に戻せません）')) return;
  state = defaultState();
  save();
  fillProfile(); renderToday(); renderWeight();
};

// ---------- タブ ----------
document.querySelectorAll('.tabbar button').forEach((b) => (b.onclick = () => {
  document.querySelectorAll('.tabbar button').forEach((x) => x.classList.toggle('active', x === b));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${b.dataset.view}`));
  if (b.dataset.view === 'weight') renderWeight();
  window.scrollTo(0, 0);
}));

// ---------- 起動 ----------
$('#weightDate').value = toKey(new Date());
fillProfile();
renderToday();
renderWeight();
if (!localStorage.getItem(STORAGE_KEY)) {
  // 初回はプロフィール設定へ誘導
  document.querySelector('.tabbar button[data-view="settings"]').click();
}
