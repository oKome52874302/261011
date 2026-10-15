// 週間レポートを作って LINE などに送る
import { db, todayKey, shiftKey, fromKey, dayTargets } from './store.js';
import { sumEntries, e1rm, round, sessionKcal } from './calc.js';
import { $, $$, toast } from './dom.js';
import { computeStats, levelInfo, ACHIEVEMENTS } from './achievements.js';

const APP_URL = location.origin + location.pathname.replace(/index\.html$/, '');
const md = (k) => { const d = fromKey(k); return `${d.getMonth() + 1}/${d.getDate()}`; };

function mondayOf(k) {
  const d = fromKey(k);
  return shiftKey(k, -((d.getDay() + 6) % 7));
}

// monday から7日間（今週なら今日まで）の集計
export function weekReport(monday) {
  const s = db.state;
  const today = todayKey();
  const sunday = shiftKey(monday, 6);
  const end = sunday < today ? sunday : today;
  const days = [];
  for (let k = monday; k <= end; k = shiftKey(k, 1)) days.push(k);

  let logDays = 0, proteinDays = 0, kcalSum = 0, kcalTargetSum = 0, pSum = 0, workoutDays = 0, sets = 0, volume = 0;
  for (const k of days) {
    const entries = s.logs[k] || [];
    if (entries.length) {
      const t = dayTargets(k);
      const tot = sumEntries(entries);
      logDays++;
      kcalSum += tot.kcal; kcalTargetSum += t.kcal; pSum += tot.p;
      if (tot.p >= t.p) proteinDays++;
    }
    const ws = (s.workouts[k] || []).filter((w) => w.sets.length);
    if (ws.length) workoutDays++;
    for (const w of ws) for (const set of w.sets) { sets++; volume += set.w * set.r; }
  }

  // 週内の自己ベスト更新（週の前日までの最高値を基準に、週内で上回ったセット数）
  const best = new Map();
  let prs = 0;
  const prNames = new Set();
  for (const k of Object.keys(s.workouts).filter((x) => x <= end).sort()) {
    for (const w of s.workouts[k]) {
      for (const set of w.sets) {
        const v = e1rm(set.w, set.r);
        const prev = best.get(w.exercise) ?? 0;
        if (k >= monday && prev > 0 && v > prev) { prs++; prNames.add(w.exercise); }
        if (v > prev) best.set(w.exercise, v);
      }
    }
  }

  let stepSum = 0, stepDays = 0, kmSum = 0, sportMin = 0, sportKcal = 0;
  for (const k of days) {
    const a = s.activity?.[k];
    if (a?.steps != null) { stepSum += a.steps; stepDays++; }
    if (a?.distanceKm) kmSum += a.distanceKm;
    for (const x of s.exercises?.[k] || []) { sportMin += x.minutes; sportKcal += sessionKcal(x, s.profile.weight).gross; }
  }

  const weights = Object.keys(s.weights).filter((k) => k >= monday && k <= end).sort();
  const unlocked = ACHIEVEMENTS.filter((a) => {
    const d = s.achievements?.[a.id];
    return d && d >= monday && d <= sunday;
  });

  const st = computeStats();
  return {
    monday, sunday, isCurrent: sunday >= today, dayCount: days.length,
    logDays, proteinDays, workoutDays, sets, volume: round(volume),
    avgKcal: logDays ? round(kcalSum / logDays) : 0,
    kcalRate: kcalTargetSum ? round((kcalSum / kcalTargetSum) * 100) : 0,
    avgP: logDays ? round(pSum / logDays) : 0,
    prs, prNames: [...prNames],
    avgSteps: stepDays ? round(stepSum / stepDays) : 0, totalKm: round(kmSum, 1),
    sportMin, sportKcal: round(sportKcal),
    weightFrom: weights.length ? s.weights[weights[0]] : null,
    weightTo: weights.length > 1 ? s.weights[weights.at(-1)] : null,
    unlocked, streak: st.streak, level: levelInfo(st.xp),
  };
}

const achievementNames = (list) =>
  list.slice(0, 3).map((a) => a.name).join('、') + (list.length > 3 ? ` ほか${list.length - 3}個` : '');

export function reportText(r) {
  const lines = [`【MacroLog 週間レポート】${md(r.monday)}〜${md(r.sunday)}${r.isCurrent ? '（途中経過）' : ''}`];
  lines.push(`📝 記録 ${r.logDays}/7日`);
  if (r.logDays) {
    lines.push(`🥩 たんぱく質達成 ${r.proteinDays}日（平均 ${r.avgP}g）`);
    lines.push(`🍚 平均 ${r.avgKcal.toLocaleString()}kcal（目標の${r.kcalRate}%）`);
  }
  lines.push(r.workoutDays ? `🏋️ 筋トレ ${r.workoutDays}日・${r.sets}セット・総ボリューム ${r.volume.toLocaleString()}kg` : '🏋️ 筋トレ 0日');
  if (r.sportMin) lines.push(`🏸 運動 ${r.sportMin}分・約${r.sportKcal.toLocaleString()}kcal`);
  if (r.avgSteps || r.totalKm) lines.push(`👟 平均 ${r.avgSteps.toLocaleString()}歩・合計 ${r.totalKm}km`);
  if (r.prs) lines.push(`🎉 自己ベスト更新 ${r.prs}回（${r.prNames.join('・')}）`);
  if (r.unlocked.length) lines.push(`🏆 実績解除：${achievementNames(r.unlocked)}`);
  lines.push(`🔥 連続記録 ${r.streak}日 ・ Lv${r.level.lv} ${r.level.title}`);
  lines.push('', `一緒に記録しよう → ${APP_URL}`);
  return lines.join('\n');
}

// ---------- 画像カード ----------
function drawCard(r) {
  const W = 1080, H = 1350;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const font = (size, weight = 400) => `${weight} ${size}px -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif`;
  const C = { bg: '#0f172a', card: '#1e293b', line: '#334155', text: '#f1f5f9', muted: '#94a3b8', accent: '#22c55e', p: '#ef4444', blue: '#3b82f6', gold: '#eab308' };

  g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
  g.fillStyle = C.accent; g.font = font(44, 800); g.fillText('MacroLog', 80, 120);
  g.fillStyle = C.muted; g.font = font(34); g.fillText('週間レポート', 80, 175);
  g.fillStyle = C.text; g.font = font(64, 800);
  g.fillText(`${md(r.monday)} 〜 ${md(r.sunday)}`, 80, 260);
  if (r.isCurrent) { g.fillStyle = C.muted; g.font = font(30); g.fillText('途中経過', 80, 310); }

  // レベル・連続記録
  g.textAlign = 'right';
  g.fillStyle = C.text; g.font = font(56, 800); g.fillText(`Lv${r.level.lv}`, W - 80, 130);
  g.fillStyle = C.muted; g.font = font(32); g.fillText(r.level.title, W - 80, 178);
  g.fillStyle = C.gold; g.font = font(40, 700); g.fillText(`🔥 ${r.streak}日連続`, W - 80, 250);
  g.textAlign = 'left';

  const round2 = (x, y, w, h, rad, color) => { g.fillStyle = color; g.beginPath(); g.roundRect(x, y, w, h, rad); g.fill(); };

  // 3つの達成バー
  const rows = [
    ['📝 記録', r.logDays, 7, C.accent],
    ['🥩 たんぱく質達成', r.proteinDays, 7, C.p],
    ['🏋️ 筋トレ', r.workoutDays, 7, C.blue],
  ];
  let y = 370;
  round2(60, y - 20, W - 120, 420, 36, C.card);
  y += 40;
  for (const [label, v, max, color] of rows) {
    g.fillStyle = C.text; g.font = font(38, 700); g.fillText(label, 100, y + 30);
    g.textAlign = 'right'; g.font = font(44, 800); g.fillText(`${v}`, W - 160, y + 32);
    g.fillStyle = C.muted; g.font = font(30); g.fillText(`/${max}日`, W - 100, y + 32);
    g.textAlign = 'left';
    round2(100, y + 56, W - 200, 20, 10, C.line);
    if (v > 0) round2(100, y + 56, (W - 200) * Math.min(1, v / max), 20, 10, color);
    y += 128;
  }

  // 数値タイル
  const tiles = [
    ['平均カロリー', r.logDays ? `${r.avgKcal.toLocaleString()}` : '-', r.logDays ? `kcal（目標の${r.kcalRate}%）` : ''],
    ['平均たんぱく質', r.logDays ? `${r.avgP}` : '-', 'g / 日'],
    ['総ボリューム', r.volume ? r.volume.toLocaleString() : '0', `kg（${r.sets}セット）`],
    ['自己ベスト更新', `${r.prs}`, '回'],
  ];
  const tw = (W - 120 - 30) / 2, th = 190;
  tiles.forEach(([label, val, unit], i) => {
    const x = 60 + (i % 2) * (tw + 30), ty = 830 + Math.floor(i / 2) * (th + 30);
    round2(x, ty, tw, th, 32, C.card);
    g.fillStyle = C.muted; g.font = font(30); g.fillText(label, x + 36, ty + 56);
    g.fillStyle = C.text; g.font = font(64, 800); g.fillText(val, x + 36, ty + 136);
    const vw = g.measureText(val).width;
    g.fillStyle = C.muted; g.font = font(26); g.fillText(unit, x + 46 + vw, ty + 136);
  });

  g.fillStyle = C.muted; g.font = font(28);
  const footer = r.unlocked.length ? `🏆 今週の実績：${achievementNames(r.unlocked)}` : '';
  if (footer) g.fillText(footer.length > 34 ? `${footer.slice(0, 33)}…` : footer, 80, 1300);
  return c;
}

// ---------- ダイアログ ----------
const dialog = $('#shareDialog');
let current = { text: '', file: null, url: null };

async function build(which) {
  $$('#shareSeg button').forEach((b) => b.classList.toggle('active', b.dataset.week === which));
  const thisMonday = mondayOf(todayKey());
  const r = weekReport(which === 'last' ? shiftKey(thisMonday, -7) : thisMonday);
  current.text = reportText(r);
  $('#shareText').textContent = current.text;
  const canvas = drawCard(r);
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  if (current.url) URL.revokeObjectURL(current.url);
  current.url = URL.createObjectURL(blob);
  current.file = new File([blob], `macrolog-${r.monday}.png`, { type: 'image/png' });
  $('#sharePreview').src = current.url;
  const canShareFile = !!navigator.canShare?.({ files: [current.file] });
  $('#shareNative').classList.toggle('hidden', !canShareFile);
  // 画像共有に対応していない端末では、テキスト送信をメインのボタンにする
  $('#shareLine').classList.toggle('line', !canShareFile);
  $('#shareLine').classList.toggle('ghost', canShareFile);
}

export function openShare() {
  // 月曜で今週の記録がまだ無ければ先週を初期表示
  const thisMonday = mondayOf(todayKey());
  const s = db.state;
  const has = (obj, ok) => Object.keys(obj || {}).some((k) => k >= thisMonday && ok(obj[k]));
  const empty = !has(s.logs, (v) => v.length) && !has(s.workouts, (v) => v.some((w) => w.sets.length)) && !has(s.activity, () => true) && !has(s.exercises, (v) => v.length);
  build(empty ? 'last' : 'this');
  dialog.showModal();
}

$$('#shareSeg button').forEach((b) => (b.onclick = () => build(b.dataset.week)));
$('#closeShare').onclick = () => dialog.close();
dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

// 画像付きで共有（共有シートから LINE を選ぶ）
$('#shareNative').onclick = async () => {
  try {
    await navigator.share({ files: [current.file], text: current.text });
  } catch (e) {
    if (e.name !== 'AbortError') toast(`共有できませんでした: ${e.message}`);
  }
};

// LINE にテキストで送る（LINE公式の共有URL）
$('#shareLine').onclick = () => {
  window.open(`https://line.me/R/share?text=${encodeURIComponent(current.text)}`, '_blank', 'noopener');
};

$('#shareCopy').onclick = async () => {
  try {
    await navigator.clipboard.writeText(current.text);
    toast('テキストをコピーしました');
  } catch {
    toast('コピーできませんでした');
  }
};

$('#shareSave').onclick = () => {
  const a = document.createElement('a');
  a.href = current.url;
  a.download = current.file.name;
  a.click();
};
