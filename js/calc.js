export const round = (n, d = 0) => Math.round(n * 10 ** d) / 10 ** d;

// 基礎代謝(Mifflin-St Jeor) → TDEE → 目的別の目標 kcal / PFC
export function calcTargets(pr, { training = false } = {}) {
  const bmr = 10 * pr.weight + 6.25 * pr.height - 5 * pr.age + (pr.sex === 'male' ? 5 : -161);
  const tdee = bmr * Number(pr.activity);
  const factor = { cut: 0.8, maintain: 1.0, bulk: 1.1 }[pr.goal] ?? 1;
  const proteinPerKg = { cut: 2.2, maintain: 1.8, bulk: 2.0 }[pr.goal] ?? 1.8;
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
  // カーボサイクル：トレ日は+10%、休養日は-10%を炭水化物で調整（たんぱく質・脂質は固定）
  let cycle = 0;
  if (pr.carbCycle) {
    const delta = Math.min((kcal * 0.1) / 4, c);
    cycle = training ? delta : -delta;
    c += cycle;
    kcal += cycle * 4;
  }
  return { bmr: round(bmr), tdee: round(tdee), kcal: round(kcal), p: round(p), f: round(f), c: round(c), cycle: round(cycle) };
}

export function sumEntries(entries) {
  return entries.reduce(
    (s, e) => ({ kcal: s.kcal + e.kcal, p: s.p + e.p, f: s.f + e.f, c: s.c + e.c }),
    { kcal: 0, p: 0, f: 0, c: 0 },
  );
}

export function scale(food, ratio) {
  return { kcal: round(food.kcal * ratio), p: round(food.p * ratio, 1), f: round(food.f * ratio, 1), c: round(food.c * ratio, 1) };
}

// 食品と量から栄養を計算。unit: 'g' | 'unit'
export function nutrientsFor(food, amount, unit) {
  if (food.basis === 'serving') {
    const servings = unit === 'g' ? amount / food.unit.g : amount;
    return scale(food, servings);
  }
  const grams = unit === 'g' ? amount : amount * food.unit.g;
  return scale(food, grams / 100);
}

// 推定1RM（Epley式）
export const e1rm = (w, r) => (r <= 0 ? 0 : r === 1 ? w : w * (1 + r / 30));
