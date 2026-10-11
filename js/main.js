import { db, onChange, shiftKey, todayKey, dateLabel } from './store.js';
import { $, $$ } from './dom.js';
import { renderToday, targetsFor } from './today.js';
import { renderTraining } from './training.js';
import { renderWeight } from './weight.js';
import { renderSettings } from './settings.js';

const GOAL_LABEL = { cut: '減量中', maintain: '維持', bulk: '増量中' };
const VIEWS = { today: renderToday, training: renderTraining, weight: renderWeight, settings: renderSettings };
let view = 'today';

function render() {
  $('#dateLabel').textContent = dateLabel(db.date);
  $('#dateNav').classList.toggle('hidden', view === 'weight' || view === 'settings');
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
show(db.isFirstRun ? 'settings' : 'today');
