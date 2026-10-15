// 実績・レベル・連続記録
// 方針：体重の増減やカロリーの少なさではなく「行動」（記録・たんぱく質・トレ）を評価する。
//       連続記録は週1回までの「おやすみ」を許容し、1日抜けただけでゼロにならないようにする。
import { db, save, todayKey, shiftKey, fromKey, dayTargets } from './store.js';
import { sumEntries, e1rm, round } from './calc.js';
import { $, el, toast } from './dom.js';

const FREEZE_INTERVAL = 7; // おやすみは7日に1回まで

export function computeStats() {
  const s = db.state;
  const today = todayKey();
  const logDays = Object.keys(s.logs).filter((k) => s.logs[k].length && k <= today).sort();
  const logged = new Set(logDays);

  const proteinDays = new Set();
  const perfectDays = new Set();
  let aiUses = 0;
  for (const k of logDays) {
    const t = dayTargets(k);
    const tot = sumEntries(s.logs[k]);
    if (tot.p >= t.p) proteinDays.add(k);
    if (tot.p >= t.p && Math.abs(tot.kcal - t.kcal) <= t.kcal * 0.1 && tot.f <= t.f * 1.1) perfectDays.add(k);
    aiUses += s.logs[k].filter((e) => e.src === 'ai').length;
  }

  const workoutDays = Object.keys(s.workouts).filter((k) => k <= today && s.workouts[k].some((w) => w.sets.length)).sort();

  // 自己ベスト更新回数（各種目で過去最高の推定1RMを超えたセット数）
  let prs = 0;
  const best = new Map();
  for (const k of workoutDays) {
    for (const w of s.workouts[k]) {
      for (const set of w.sets) {
        const v = e1rm(set.w, set.r);
        const prev = best.get(w.exercise) ?? 0;
        if (prev > 0 && v > prev) prs++;
        if (v > prev) best.set(w.exercise, v);
      }
    }
  }

  // 連続記録（おやすみ付き）
  let current = 0, bestStreak = 0, lastFreeze = -Infinity, missRun = 0, sinceFreeze = Infinity;
  if (logDays.length) {
    let i = 0;
    for (let k = logDays[0]; k <= today; k = shiftKey(k, 1), i++) {
      if (logged.has(k)) {
        current++; missRun = 0;
      } else if (k === today) {
        // 今日はまだ記録していないだけ
      } else if (missRun === 0 && current > 0 && i - lastFreeze >= FREEZE_INTERVAL) {
        lastFreeze = i; missRun = 1;
      } else {
        current = 0; missRun++;
      }
      bestStreak = Math.max(bestStreak, current);
    }
    sinceFreeze = (i - 1) - lastFreeze; // 今日記録しなかった場合におやすみが使えるか
  }

  // 今週（月曜始まり）
  const d = fromKey(today);
  const monday = shiftKey(today, -((d.getDay() + 6) % 7));
  const week = { log: 0, protein: 0, workout: 0 };
  const wset = new Set(workoutDays);
  for (let i = 0; i < 7; i++) {
    const k = shiftKey(monday, i);
    if (logged.has(k)) week.log++;
    if (proteinDays.has(k)) week.protein++;
    if (wset.has(k)) week.workout++;
  }

  const acts = Object.entries(s.activity || {}).filter(([k]) => k <= today).map(([, v]) => v);
  const steps10kDays = acts.filter((v) => v.steps >= 10000).length;
  const totalKm = acts.reduce((sum, v) => sum + (v.distanceKm || 0), 0);
  const weightDays = Object.keys(s.weights).length;
  const unlocked = Object.keys(s.achievements || {}).length;
  const xp = logDays.length * 10 + proteinDays.size * 10 + perfectDays.size * 5
    + workoutDays.length * 15 + weightDays * 3 + prs * 5 + unlocked * 30;

  return {
    logDays: logDays.length, proteinDays: proteinDays.size, perfectDays: perfectDays.size,
    workoutDays: workoutDays.length, prs, weightDays, aiUses, steps10kDays, totalKm,
    barcode: s.customFoods.filter((f) => f.barcode).length,
    customFoods: s.customFoods.length, templates: s.templates.length,
    streak: current, bestStreak, freezeAvailable: sinceFreeze >= FREEZE_INTERVAL,
    week, xp, unlocked,
  };
}

// ---------- レベル ----------
// Lv n に必要な累計XP = 50 × n × (n−1)（Lv2:100, Lv3:300, Lv5:1000, Lv10:4500）
const xpFor = (lv) => 50 * lv * (lv - 1);
const TITLES = [[1, 'ビギナー'], [3, 'ルーキー'], [5, 'レギュラー'], [8, 'アスリート'], [12, 'ベテラン'], [16, 'マスター'], [20, 'レジェンド']];
export function levelInfo(xp) {
  let lv = 1;
  while (xp >= xpFor(lv + 1)) lv++;
  const title = TITLES.filter(([l]) => lv >= l).at(-1)[1];
  const base = xpFor(lv), next = xpFor(lv + 1);
  return { lv, title, cur: xp - base, need: next - base };
}

// ---------- 実績一覧 ----------
const A = (id, group, icon, name, desc, goal, value) => ({ id, group, icon, name, desc, goal, value });
export const ACHIEVEMENTS = [
  A('log1', '記録', '📝', 'はじめの一歩', '食事を記録した', 1, (s) => s.logDays),
  A('streak3', '記録', '🔥', '三日坊主卒業', '3日連続で記録', 3, (s) => s.bestStreak),
  A('streak7', '記録', '🔥', '1週間継続', '7日連続で記録', 7, (s) => s.bestStreak),
  A('streak21', '記録', '🌱', '習慣化', '21日連続で記録', 21, (s) => s.bestStreak),
  A('streak60', '記録', '🌳', '生活の一部', '60日連続で記録', 60, (s) => s.bestStreak),
  A('log30', '記録', '📅', '30日分の記録', '記録した日が累計30日', 30, (s) => s.logDays),
  A('log100', '記録', '💯', '100日分の記録', '記録した日が累計100日', 100, (s) => s.logDays),
  A('log365', '記録', '👑', '1年分の記録', '記録した日が累計365日', 365, (s) => s.logDays),

  A('protein1', '栄養', '🥩', 'たんぱく質クリア', 'たんぱく質の目標を達成', 1, (s) => s.proteinDays),
  A('protein10', '栄養', '🍗', 'たんぱく質の鬼', 'たんぱく質目標を累計10日達成', 10, (s) => s.proteinDays),
  A('protein50', '栄養', '🦾', 'プロテインマスター', 'たんぱく質目標を累計50日達成', 50, (s) => s.proteinDays),
  A('perfect1', '栄養', '🎯', 'パーフェクトデー', 'P達成・kcal±10%・脂質オーバーなし', 1, (s) => s.perfectDays),
  A('perfect10', '栄養', '🏹', 'スナイパー', 'パーフェクトデーを累計10日', 10, (s) => s.perfectDays),
  A('weekProtein5', '栄養', '⭐', '今週のたんぱく質王', '1週間で5日たんぱく質目標を達成', 5, (s) => s.week.protein),

  A('workout1', '筋トレ', '🏋️', '初トレーニング', '筋トレを記録した', 1, (s) => s.workoutDays),
  A('workout10', '筋トレ', '💪', 'ジム通い', '筋トレ累計10日', 10, (s) => s.workoutDays),
  A('workout50', '筋トレ', '🔩', '鉄の意志', '筋トレ累計50日', 50, (s) => s.workoutDays),
  A('workout100', '筋トレ', '🗿', '百戦錬磨', '筋トレ累計100日', 100, (s) => s.workoutDays),
  A('weekWorkout3', '筋トレ', '📆', '週3トレーニー', '1週間で3日トレーニング', 3, (s) => s.week.workout),
  A('pr1', '筋トレ', '🎉', '自己ベスト更新', '推定1RMを更新', 1, (s) => s.prs),
  A('pr10', '筋トレ', '🚀', '成長期', '自己ベストを累計10回更新', 10, (s) => s.prs),

  A('steps1', '歩数', '👟', '1万歩', '1日1万歩を達成', 1, (s) => s.steps10kDays),
  A('steps10', '歩数', '🚶', 'よく歩く人', '1万歩の日が累計10日', 10, (s) => s.steps10kDays),
  A('km100', '歩数', '🗾', '100km踏破', '歩いた距離が累計100km', 100, (s) => Math.floor(s.totalKm)),

  A('weight1', '体重', '⚖️', '現状把握', '体重を記録した', 1, (s) => s.weightDays),
  A('weight14', '体重', '📈', 'データ派', '体重を累計14日記録', 14, (s) => s.weightDays),

  A('ai1', '機能', '📷', 'AIにおまかせ', '写真AIで食事を記録', 1, (s) => s.aiUses),
  A('barcode1', '機能', '▥', 'スキャナー', 'バーコードで商品を登録', 1, (s) => s.barcode),
  A('template1', '機能', '🍱', 'いつものやつ', '食事セットを作成', 1, (s) => s.templates),
  A('custom5', '機能', '📚', 'コレクター', 'マイ食品を5個登録', 5, (s) => s.customFoods),
];

// 保存のたびに呼ばれ、新しく条件を満たした実績を解除する
export function checkAchievements() {
  const s = db.state;
  s.achievements ||= {};
  let st = computeStats();
  const newly = ACHIEVEMENTS.filter((a) => !s.achievements[a.id] && a.value(st) >= a.goal);
  const prevLevel = s.level || 1;
  if (newly.length) {
    for (const a of newly) s.achievements[a.id] = todayKey();
    st = computeStats();
  }
  const { lv } = levelInfo(st.xp);
  if (!newly.length && lv === prevLevel) return;
  s.level = lv;
  save();
  const msgs = [];
  if (newly.length === 1) msgs.push(`🏆 実績解除「${newly[0].name}」`);
  else if (newly.length > 1) msgs.push(`🏆 実績を${newly.length}個解除！`);
  if (lv > prevLevel) msgs.push(`⬆️ Lv${lv} にレベルアップ！`);
  // 「◯◯を追加しました」などの通知に上書きされないよう、少し後に出す
  if (msgs.length) setTimeout(() => toast(msgs.join(' ')), 50);
}

// ---------- 画面 ----------
export function statusChipText() {
  const st = computeStats();
  return `🔥${st.streak} ・ Lv${levelInfo(st.xp).lv}`;
}

export function renderAchievements() {
  const st = computeStats();
  const info = levelInfo(st.xp);
  const unlocked = db.state.achievements || {};

  $('#levelCard').replaceChildren(
    el('div', { class: 'level-row' },
      el('div', { class: 'level-num' }, `Lv${info.lv}`),
      el('div', { class: 'level-body' },
        el('div', { class: 'level-title' }, info.title),
        el('div', { class: 'bar' }, el('div', { class: 'bar-fill xp-fill', style: `width:${(info.cur / info.need) * 100}%` })),
        el('div', { class: 'muted small' }, `次のレベルまで ${info.need - info.cur} XP（累計 ${st.xp} XP）`))),
    el('div', { class: 'stat-row' },
      stat('🔥', `${st.streak}日`, '連続記録'),
      stat('🏅', `${st.bestStreak}日`, '最長記録'),
      stat('🏆', `${Object.keys(unlocked).length}/${ACHIEVEMENTS.length}`, '実績')),
    el('p', { class: 'hint' }, st.freezeAvailable
      ? '💤 おやすみ 使用可：7日に1回まで、1日記録を忘れても連続記録が続きます。'
      : '💤 おやすみ 使用済み：次に使えるのは最後に使ってから7日後です。'));

  const goals = [['📝 記録', st.week.log, 5], ['🥩 たんぱく質達成', st.week.protein, 4], ['🏋️ 筋トレ', st.week.workout, 3]];
  $('#weeklyCard').replaceChildren(
    el('h2', {}, '今週のチャレンジ'),
    ...goals.map(([label, v, goal]) => el('div', { class: 'weekly-row' },
      el('div', { class: 'weekly-label' }, el('span', {}, label), el('span', { class: v >= goal ? 'done' : 'muted' }, v >= goal ? '✅ 達成' : `${v} / ${goal}日`)),
      el('div', { class: 'bar' }, el('div', { class: 'bar-fill xp-fill', style: `width:${Math.min(100, (v / goal) * 100)}%` })))),
    el('p', { class: 'hint' }, '毎週月曜にリセットされます。'),
    el('button', { class: 'btn line full', 'data-action': 'share' }, '📤 今週の結果を LINE で送る'));

  const box = $('#achievementList');
  box.replaceChildren();
  for (const group of [...new Set(ACHIEVEMENTS.map((a) => a.group))]) {
    box.append(el('h3', { class: 'ach-group' }, group));
    box.append(el('div', { class: 'ach-grid' }, ACHIEVEMENTS.filter((a) => a.group === group).map((a) => {
      const got = unlocked[a.id];
      const v = Math.min(a.value(st), a.goal);
      return el('div', { class: `ach${got ? ' got' : ''}` },
        el('div', { class: 'ach-icon' }, got ? a.icon : '🔒'),
        el('div', { class: 'ach-name' }, a.name),
        el('div', { class: 'ach-desc' }, a.desc),
        got
          ? el('div', { class: 'ach-date' }, `${got.slice(5).replace('-', '/')} 解除`)
          : a.goal > 1 && el('div', { class: 'ach-progress' }, el('div', { class: 'bar' }, el('div', { class: 'bar-fill xp-fill', style: `width:${(v / a.goal) * 100}%` })), `${round(v)}/${a.goal}`));
    })));
  }
}

const stat = (icon, value, label) => el('div', { class: 'stat' }, el('div', { class: 'stat-val' }, `${icon} ${value}`), el('div', { class: 'muted small' }, label));
