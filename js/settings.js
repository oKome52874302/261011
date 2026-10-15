// 設定画面
import { db, save, replaceState, getApiKey, setApiKey, todayKey } from './store.js';
import { calcTargets } from './calc.js';
import { $, el, toast } from './dom.js';
import { AI_MODELS } from './ai.js';
import {
  hasServer, inGroup, groupCode, serverConfig, newGroupCode, normalizeCode, joinGroup, leaveGroup,
  inviteUrl, inviteText, refreshGroupFoods, shareFood,
} from './group.js';
import { SUPABASE_URL } from './config.js';
import { SHORTCUT_URL_TEMPLATE, SHORTCUT_TEXT_TEMPLATE } from './health.js';

const copyText = async (text, label) => {
  try { await navigator.clipboard.writeText(text); toast(`${label}をコピーしました`); } catch { prompt(label, text); }
};
$('#copyHealthUrl').onclick = () => copyText(SHORTCUT_URL_TEMPLATE, 'URL版ひな形');
$('#copyHealthText').onclick = () => copyText(SHORTCUT_TEXT_TEMPLATE, 'コピー版ひな形');

const pf = $('#profileForm');

export function renderSettings() {
  const p = db.state.profile;
  for (const k of ['sex', 'age', 'height', 'weight', 'activity', 'goal', 'mKcal', 'mP', 'mF', 'mC']) {
    if (p[k] !== undefined) pf.elements[k].value = p[k];
  }
  pf.elements.manual.checked = !!p.manual;
  pf.elements.carbCycle.checked = !!p.carbCycle;
  pf.elements.activityLink.checked = !!p.activityLink;
  $('#manualFields').classList.toggle('hidden', !p.manual);
  renderCalc();

  renderGroup();

  const af = $('#aiForm');
  af.elements.apiKey.value = getApiKey();
  af.elements.model.value = db.state.ai?.model || AI_MODELS[0].id;
}

function renderCalc() {
  const p = db.state.profile;
  const t = calcTargets(p);
  const rows = [['基礎代謝', `${t.bmr} kcal`], [t.linked ? '消費(活動除く)' : '消費(TDEE)', `${t.tdee} kcal`], ['目標カロリー', `${t.kcal} kcal`], ['たんぱく質', `${t.p} g`], ['脂質', `${t.f} g`], ['炭水化物', `${t.c} g`]];
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
    activity: Number(fd.get('activity')), goal: fd.get('goal'), manual: !!fd.get('manual'), carbCycle: !!fd.get('carbCycle'), activityLink: !!fd.get('activityLink'),
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

// ---------- 友達グループ ----------
function serverSettings() {
  if (SUPABASE_URL) return null; // コードに埋め込み済み
  const c = serverConfig();
  const form = el('form', { class: 'form' },
    el('label', {}, 'Supabase Project URL', el('input', { name: 'url', placeholder: 'https://xxxx.supabase.co', value: c.url })),
    el('label', {}, 'anon / publishable key', el('input', { name: 'key', placeholder: 'eyJ... または sb_publishable_...', value: c.key, autocomplete: 'off' })),
    el('button', { class: 'btn ghost full' }, 'サーバー設定を保存'));
  form.onsubmit = (e) => {
    e.preventDefault();
    db.state.group = { ...(db.state.group || {}), url: form.elements.url.value.trim(), key: form.elements.key.value.trim() };
    save();
    toast('サーバー設定を保存しました');
  };
  return el('details', { class: 'server-box', open: !hasServer() }, el('summary', {}, '管理者向け：共有サーバー設定'), form,
    el('p', { class: 'hint' }, 'グループを作る人だけが設定します。参加する友達は招待リンクを開くだけで自動設定されます。'));
}

function nicknameField() {
  const input = el('input', { value: db.state.group?.nickname || '', maxlength: '20', placeholder: '例: まると' });
  input.onchange = () => { db.state.group = { ...(db.state.group || {}), nickname: input.value.trim() }; save(); };
  return el('label', { class: 'stack' }, 'ニックネーム（共有した商品に表示）', input);
}

function renderGroup() {
  const box = $('#groupBody');
  box.replaceChildren();
  if (!hasServer()) {
    box.append(el('p', { class: 'hint' }, '共有サーバーが未設定です。友達から招待リンクをもらった場合は、そのリンクを開いてください。'));
    const s = serverSettings();
    if (s) box.append(s);
    return;
  }
  if (!inGroup()) {
    const joinInput = el('input', { placeholder: '招待コード（例: K7QD-M2XP-9WHA）', autocomplete: 'off' });
    box.append(
      el('p', { class: 'hint' }, 'バーコードで登録した商品を、グループの友達と共有できます。招待コードを知っている人だけが参加・閲覧できます。'),
      nicknameField(),
      el('button', { class: 'btn full', onclick: () => { joinGroup(newGroupCode()); toast('グループを作りました。友達を招待しましょう'); } }, '＋ 新しいグループを作る'),
      el('div', { class: 'row join-row' }, joinInput,
        el('button', {
          class: 'btn ghost', onclick: () => {
            const code = normalizeCode(joinInput.value);
            if (code.replace(/-/g, '').length < 12) return toast('招待コードを確認してください');
            joinGroup(code);
            toast('グループに参加しました');
          },
        }, '参加')));
  } else {
    const count = el('span', { class: 'muted small' }, '共有中の商品：読み込み中…');
    refreshGroupFoods().then((f) => { count.textContent = `共有中の商品：${f.length}件`; })
      .catch((e) => { count.textContent = `⚠️ ${e.message}`; });
    const mineWithBarcode = db.state.customFoods.filter((f) => f.barcode);
    box.append(
      el('div', { class: 'group-code' }, el('span', { class: 'muted small' }, '招待コード'), el('b', {}, groupCode())),
      count,
      el('div', { class: 'row two invite-row' },
        el('button', { class: 'btn line', onclick: () => window.open(`https://line.me/R/share?text=${encodeURIComponent(inviteText())}`, '_blank', 'noopener') }, '📤 LINEで招待'),
        el('button', {
          class: 'btn ghost', onclick: async () => {
            try { await navigator.clipboard.writeText(inviteUrl()); toast('招待リンクをコピーしました'); } catch { prompt('招待リンク', inviteUrl()); }
          },
        }, 'リンクをコピー')),
      nicknameField(),
      mineWithBarcode.length > 0 && el('button', {
        class: 'btn ghost full', onclick: async () => {
          let ok = 0;
          for (const f of mineWithBarcode) { try { if (await shareFood(f)) ok++; } catch { /* 続行 */ } }
          toast(`${ok}件をグループに共有しました`);
          renderGroup();
        },
      }, `手持ちのバーコード商品（${mineWithBarcode.length}件）を共有`),
      el('button', {
        class: 'btn danger full', onclick: () => {
          if (!confirm('グループを抜けますか？（共有された商品は検索に出なくなります。自分のマイ食品は残ります）')) return;
          leaveGroup();
        },
      }, 'グループを抜ける'));
  }
  const s = serverSettings();
  if (s) box.append(s);
}
