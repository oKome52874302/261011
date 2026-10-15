// 手ばかり（目分量）：はかりが無くても手のひら・こぶし・親指で量を選べるようにする
// 基準は一般的な成人の手の目安。設定の「手の大きさ」で全体を補正する。
import { db } from './store.js';

const RICE = new Set(['rice', 'brown-rice', 'pack-rice']);
const NUTS = new Set(['almond', 'walnut', 'mixed-nuts']);
const FIST_EXTRA = new Set(['tofu', 'silken-tofu', 'atsuage', 'edamame', 'natto', 'kimchi']);

export const handScale = () => Number(db.state.profile?.handScale) || 1;

// { key, label, short, g } の配列を返す
export function portionOptions(food) {
  if (food.basis !== '100g' && !food.unit?.g) return [];
  const s = handScale();
  const r = (g) => Math.round(g * s);
  const id = food.id;
  const out = [];
  if (RICE.has(id)) {
    out.push(
      { key: 'rice-s', label: '🍚 小盛り（約100g）', short: '小盛り', g: 100 },
      { key: 'rice-m', label: '🍚 普通盛り（約150g）', short: '普通盛り', g: 150 },
      { key: 'rice-l', label: '🍚 大盛り（約250g）', short: '大盛り', g: 250 },
    );
  }
  switch (food.category) {
    case '肉': case '魚': case '外食・惣菜':
      out.push({ key: 'palm', label: `✋ 手のひら（約${r(100)}g）`, short: '手のひら', g: r(100) });
      break;
    case '主食':
      out.push({ key: 'fist', label: `✊ こぶし（約${r(150)}g）`, short: 'こぶし', g: r(150) });
      break;
    case '野菜': case '果物':
      out.push({ key: 'fist', label: `✊ こぶし（約${r(100)}g）`, short: 'こぶし', g: r(100), secondary: FIST_EXTRA.has(id) });
      out.push({ key: 'hands', label: `🤲 両手いっぱい（約${r(200)}g）`, short: '両手', g: r(200), secondary: FIST_EXTRA.has(id) });
      break;
    case 'ナッツ・油':
      if (NUTS.has(id)) out.push({ key: 'grab', label: `🤏 片手ひとつかみ（約${r(25)}g）`, short: 'ひとつかみ', g: r(25) });
      else out.push({ key: 'thumb', label: `👍 親指1本分（約${r(10)}g）`, short: '親指', g: r(10) });
      break;
    default:
      // 豆腐・納豆などは「1パック」などの単位の方が自然なので、写真モードでも初期選択にしない
      if (FIST_EXTRA.has(id)) out.push({ key: 'fist', label: `✊ こぶし（約${r(100)}g）`, short: 'こぶし', g: r(100), secondary: true });
  }
  return out;
}

// 「手のひら1.5枚分」などの表示
export function portionLabel(opt, amount) {
  const n = amount === 1 ? '1' : String(amount);
  if (opt.key.startsWith('rice')) return amount === 1 ? opt.short : `${opt.short}×${n}`;
  const unit = { palm: '枚分', fist: '個分', hands: '杯分', thumb: '本分', grab: '回分' }[opt.key] || '';
  return `${opt.short}${n}${unit}`;
}
