import { db, onChange, shiftKey, todayKey, dateLabel } from './store.js';
import { $, $$ } from './dom.js';
import { renderToday, targetsFor } from './today.js';
import { renderTraining } from './training.js';
import { renderWeight } from './weight.js';
import { renderSettings } from './settings.js';
import { renderAchievements, checkAchievements, statusChipText } from './achievements.js';
import { openShare } from './share.js';
import { readInviteFromUrl, joinGroup, groupCode } from './group.js';
import { toast } from './dom.js';
import { readHealthFromUrl, saveActivity, activityText } from './health.js';

const GOAL_LABEL = { cut: '減量中', maintain: '維持', bulk: '増量中' };
const VIEWS = { today: renderToday, training: renderTraining, weight: renderWeight, achievements: renderAchievements, settings: renderSettings };
let view = 'today';

function render() {
  $('#dateLabel').textContent = dateLabel(db.date);
  $('#dateNav').classList.toggle('hidden', !['today', 'training'].includes(view));
  $('#statusChip').textContent = statusChipText();
  const t = targetsFor(db.date);
  $('#goalBadge').textContent = `${GOAL_LABEL[db.state.profile.goal]} ・ 目標 ${t.kcal}kcal`;
  VIEWS[view]();
}

function show(name) {
  view = name;
  $$('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  render();
  window.scrollTo(0, 0);
}

$$('.tabbar button').forEach((b) => (b.onclick = () => show(b.dataset.view)));
$('#statusChip').onclick = () => show('achievements');
// 「結果を送る」ボタン（複数の画面にある）
document.addEventListener('click', (e) => { if (e.target.closest('[data-action=share]')) openShare(); });
$('#prevDay').onclick = () => { db.date = shiftKey(db.date, -1); render(); };
$('#nextDay').onclick = () => { db.date = shiftKey(db.date, 1); render(); };
$('#dateLabel').onclick = () => { db.date = todayKey(); render(); };

// アプリを開いたまま日付が変わったら今日に追従
let lastToday = todayKey();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const now = todayKey();
  if (now !== lastToday) { if (db.date === lastToday) db.date = now; lastToday = now; render(); }
});

onChange(render);
onChange(checkAchievements);
// ショートカットからURLで歩数が渡された場合
const healthRec = readHealthFromUrl();
if (healthRec) {
  saveActivity(healthRec);
  setTimeout(() => toast(`ヘルスケアから取り込みました：${activityText(db.state.activity[healthRec.date])}`), 300);
}

// 招待リンクから開かれたらグループに参加
const invite = readInviteFromUrl();
history.replaceState(null, '', location.pathname);
let startView = db.isFirstRun ? 'settings' : 'today';
if (invite && invite.code !== groupCode()) {
  if (confirm(`友達の食品共有グループ（${invite.code}）に参加しますか？`)) {
    if (invite.shortcut) db.state.healthShortcutUrl = invite.shortcut;
    joinGroup(invite.code, invite.server);
    toast('グループに参加しました');
    startView = 'settings';
  }
}
show(startView);
if (!db.isFirstRun) checkAchievements();
