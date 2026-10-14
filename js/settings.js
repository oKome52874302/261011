// 設定画面
import { db, save, replaceState, getApiKey, setApiKey, todayKey } from './store.js';
import { calcTargets } from './calc.js';
import { $, el, toast } from './dom.js';
import { AI_MODELS } from './ai.js';

const pf = $('#profileForm');

export function renderSettings() {
  const p = db.state.profile;
  for (const k of ['sex', 'age', 'height', 'weight', 'activity', 'goal', 'mKcal', 'mP', 'mF', 'mC']) {
    if (p[k] !== undefined) pf.elements[k].value = p[k];
  }
  pf.elements.manual.checked = !!p.manual;
  pf.elements.carbCycle.checked = !!p.carbCycle;
  $('#manualFields').classList.toggle('hidden', !p.manual);
  renderCalc();

  const af = $('#aiForm');
  af.elements.apiKey.value = getApiKey();
  af.elements.model.value = db.state.ai?.model || AI_MODELS[0].id;
}

function renderCalc() {
  const p = db.state.profile;
  const t = calcTargets(p);
  const rows = [['基礎代謝', `${t.bmr} kcal`], ['消費(TDEE)', `${t.tdee} kcal`], ['目標カロリー', `${t.kcal} kcal`], ['たんぱく質', `${t.p} g`], ['脂質', `${t.f} g`], ['炭水化物', `${t.c} g`]];
  if (p.carbCycle) {
    const tr = calcTargets(p, { training: true });
    rows.push(['トレ日', `${tr.kcal} kcal（C ${tr.c} g）`], ['休養日', `${t.kcal} kcal（C ${t.c} g）`]);
    rows[2] = ['基準カロリー', `${calcTargets({ ...p, carbCycle: false }).kcal} kcal`];
  }
  $('#calcResult').replaceChildren(...rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]));
}

$('#manualToggle').addEventListener('change', (e) => {
  $('#manualFields').classList.toggle('hidden', !e.target.checked);
  if (e.target.checked) {
    // 自動計算値を初期値として入れておく
    const t = calcTargets({ ...db.state.profile, manual: false, carbCycle: false });
    pf.elements.mKcal.value ||= t.kcal; pf.elements.mP.value ||= t.p;
    pf.elements.mF.value ||= t.f; pf.elements.mC.value ||= t.c;
  }
});

pf.addEventListener('submit', (e) => {
  e.preventDefault();
  const fd = new FormData(pf);
  db.state.profile = {
    sex: fd.get('sex'), age: Number(fd.get('age')), height: Number(fd.get('height')), weight: Number(fd.get('weight')),
    activity: Number(fd.get('activity')), goal: fd.get('goal'), manual: !!fd.get('manual'), carbCycle: !!fd.get('carbCycle'),
    mKcal: fd.get('mKcal'), mP: fd.get('mP'), mF: fd.get('mF'), mC: fd.get('mC'),
  };
  save();
  toast('プロフィールを保存しました');
});

$('#aiModel').replaceChildren(...AI_MODELS.map((m) => el('option', { value: m.id }, m.label)));
$('#aiForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  setApiKey(String(fd.get('apiKey')).trim());
  db.state.ai = { ...db.state.ai, model: fd.get('model') };
  save();
  toast('AI設定を保存しました');
});

$('#exportBtn').onclick = () => {
  const blob = new Blob([JSON.stringify(db.state, null, 2)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `macrolog-${todayKey()}.json` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

$('#importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data.logs || !data.profile) throw new Error('MacroLog のデータではありません');
    if (!confirm('現在のデータを上書きして読み込みますか？')) return;
    replaceState(data);
    toast('読み込みました');
  } catch (err) {
    alert(`読み込みに失敗しました: ${err.message}`);
  } finally {
    e.target.value = '';
  }
});

$('#resetBtn').onclick = () => {
  if (!confirm('本当に全データを削除しますか？（元に戻せません）')) return;
  replaceState(null);
  toast('全データを削除しました');
};
