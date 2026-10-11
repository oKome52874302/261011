// 体重記録
import { db, save, todayKey, fromKey, shiftKey } from './store.js';
import { round } from './calc.js';
import { $, el } from './dom.js';

export function renderWeight() {
  const keys = Object.keys(db.state.weights).sort();
  const ul = $('#weightList');
  ul.replaceChildren();
  if (!keys.length) ul.append(el('li', { class: 'muted' }, 'まだ記録がありません'));
  for (const k of [...keys].reverse().slice(0, 60)) {
    ul.append(el('li', {},
      el('span', {}, k.replaceAll('-', '/')),
      el('span', {}, el('b', {}, `${db.state.weights[k]} kg`),
        el('button', { class: 'icon', 'aria-label': '削除', onclick: () => { delete db.state.weights[k]; save(); } }, '✕'))));
  }
  renderChart(keys);
}

// 対象日から過去7日以内の記録の平均
function movingAvg(keys, i) {
  const end = fromKey(keys[i]);
  const vals = keys.filter((k) => { const diff = (end - fromKey(k)) / 864e5; return diff >= 0 && diff < 7; }).map((k) => db.state.weights[k]);
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function renderChart(allKeys) {
  const box = $('#weightChart');
  const keys = allKeys.slice(-60);
  if (keys.length < 2) {
    box.replaceChildren(el('p', { class: 'hint' }, '2日分以上記録するとグラフが表示されます。'));
    $('#weightTrend').textContent = '';
    return;
  }
  const W = 320, H = 160, pad = 28;
  const vals = keys.map((k) => db.state.weights[k]);
  const avgs = keys.map((k) => movingAvg(allKeys, allKeys.indexOf(k)));
  const min = Math.min(...vals, ...avgs) - 0.5, max = Math.max(...vals, ...avgs) + 0.5;
  const t0 = fromKey(keys[0]).getTime(), t1 = fromKey(keys.at(-1)).getTime();
  const x = (k) => pad + ((fromKey(k).getTime() - t0) / (t1 - t0)) * (W - pad - 8);
  const y = (v) => 8 + (1 - (v - min) / (max - min)) * (H - 28);
  const path = (arr) => arr.map((v, i) => `${i ? 'L' : 'M'}${x(keys[i]).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const md = (k) => k.slice(5).replace('-', '/');
  box.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="体重推移">
      <text x="2" y="${y(max) + 10}" fill="#94a3b8" font-size="9">${max.toFixed(1)}</text>
      <text x="2" y="${y(min)}" fill="#94a3b8" font-size="9">${min.toFixed(1)}</text>
      <text x="${pad}" y="${H - 4}" fill="#94a3b8" font-size="9">${md(keys[0])}</text>
      <text x="${W - 8}" y="${H - 4}" fill="#94a3b8" font-size="9" text-anchor="end">${md(keys.at(-1))}</text>
      <path d="${path(vals)}" fill="none" stroke="#22c55e" stroke-width="2"/>
      <path d="${path(avgs)}" fill="none" stroke="#f1f5f9" stroke-width="1.5" stroke-dasharray="4 3"/>
      ${vals.map((v, i) => `<circle cx="${x(keys[i]).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.5" fill="#22c55e"/>`).join('')}
    </svg>`;

  // 直近の7日平均と、その7日前時点の7日平均を比べて週あたりの変化を出す
  const weekAgo = shiftKey(allKeys.at(-1), -7);
  const idxPrev = allKeys.findLastIndex((k) => k <= weekAgo);
  if (idxPrev < 0) {
    $('#weightTrend').textContent = '1週間以上記録すると、週あたりのペースと調整アドバイスを表示します。';
    return;
  }
  const prevAvg = movingAvg(allKeys, idxPrev);
  const diff = movingAvg(allKeys, allKeys.length - 1) - prevAvg;
  const pct = (diff / prevAvg) * 100;
  const g = db.state.profile.goal;
  let advice = '';
  if (g === 'cut') advice = pct < -1 ? '落ちるペースが速め。筋肉を守るため少し摂取量を増やしても◎' : pct > -0.25 ? 'ペースが緩やか。停滞が2週続くなら100〜200kcal減らす目安' : '理想的なペース（週0.5〜1%減）';
  if (g === 'bulk') advice = pct > 0.5 ? '増えるペースが速め。脂肪がつきやすいので少し控えめに' : pct < 0.1 ? 'あまり増えていません。100〜200kcal増やす目安' : '良いペース（週0.25〜0.5%増）';
  if (g === 'maintain') advice = Math.abs(pct) < 0.3 ? '安定しています' : '少し変動しています。摂取量を見直してみましょう';
  $('#weightTrend').textContent = `7日平均の変化: ${diff >= 0 ? '+' : ''}${diff.toFixed(2)}kg/週（${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%） … ${advice}`;
}

$('#weightForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const k = $('#weightDate').value;
  db.state.weights[k] = round(Number($('#weightValue').value), 2);
  // 最新の体重はプロフィールにも反映（目標計算が自動で追従）
  const latest = Object.keys(db.state.weights).sort().at(-1);
  db.state.profile.weight = db.state.weights[latest];
  $('#weightValue').value = '';
  save();
});

$('#weightDate').value = todayKey();
