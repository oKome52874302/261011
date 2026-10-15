// レシピの材料テキスト → 食品データベースとの照合・グラム換算（AIなし）
import { normalize } from './dom.js';
import { squeezeJa } from './workoutParse.js';

// ---------- 材料名のゆれを内蔵食品の名前に寄せる ----------
const SYNONYMS = [
  [/醤油|しょう油|濃口しょうゆ|薄口しょうゆ/, 'しょうゆ'],
  [/味噌/, 'みそ'],
  [/鶏胸肉|鶏むね|とりむね|鶏ムネ/, '鶏むね肉'],
  [/鶏もも|とりもも|鶏腿|鶏モモ/, '鶏もも肉'],
  [/ささ身|ササミ/, 'ささみ'],
  [/鶏ひき|鶏挽/, '鶏ひき肉'],
  [/合いびき|合挽|合びき|ひき肉|挽肉|挽き肉/, '合いびき肉'],
  [/豚バラ/, '豚バラ'],
  [/豚ロース/, '豚ロース'],
  [/豚ヒレ|豚フィレ/, '豚ヒレ'],
  [/豚こま|豚小間|豚切り落とし|豚肉/, '豚こま切れ'],
  [/牛バラ|カルビ/, '牛バラ'],
  [/牛肩ロース/, '牛肩ロース'],
  [/牛こま|牛切り落とし|牛もも|牛肉/, '牛もも'],
  [/玉ねぎ|玉葱|たまねぎ|タマネギ|新玉/, '玉ねぎ'],
  [/人参|ニンジン/, 'にんじん'],
  [/じゃが芋|ジャガイモ|馬鈴薯/, 'じゃがいも'],
  [/さつま芋|サツマイモ/, 'さつまいも'],
  [/長葱|長ネギ|白ねぎ|青ねぎ|万能ねぎ|小ねぎ|^ネギ$|^ねぎ$|長ねぎ/, '長ねぎ'],
  [/生姜|ショウガ/, 'しょうが'],
  [/大蒜|ニンニク/, 'にんにく'],
  [/茄子|ナス/, 'なす'],
  [/白菜|ハクサイ/, '白菜'],
  [/キムチ/, 'キムチ'],
  [/ご飯|ごはん|白飯|白米|米飯/, '白米'],
  [/玉子|たまご|卵/, '卵'],
  [/薄力粉|強力粉|小麦粉/, '小麦粉'],
  [/片栗粉|かたくり粉/, '片栗粉'],
  [/上白糖|グラニュー糖|きび砂糖|三温糖|砂糖/, '砂糖'],
  [/料理酒|日本酒|清酒|^酒$|酒(?!粕)/, '料理酒'],
  [/本みりん|みりん/, 'みりん'],
  [/塩こしょう|塩コショウ|塩胡椒|こしょう|コショウ|胡椒|ブラックペッパー|塩/, '塩'],
  [/鮭|さけ|サーモン/, '鮭'],
  [/鯖缶|サバ缶|さば缶/, 'サバ缶'],
  [/ツナ/, 'ツナ缶'],
  [/オリーブ油|オリーブオイル/, 'オリーブオイル'],
  [/ごま油|胡麻油/, 'ごま油'],
  [/サラダ油|植物油|^油$/, 'サラダ油'],
  [/鶏ガラ|鶏がら|中華スープの素|中華だし/, '鶏がらスープの素'],
  [/コンソメ|ブイヨン/, 'コンソメ'],
  [/マヨネーズ|マヨ/, 'マヨネーズ'],
  [/ケチャップ/, 'ケチャップ'],
  [/ウスターソース|中濃ソース|とんかつソース|ソース/, '中濃ソース'],
  [/焼肉のたれ|焼き肉のたれ|焼肉のタレ/, '焼肉のたれ'],
  [/蜂蜜|ハチミツ/, 'はちみつ'],
  [/牛乳|ミルク/, '牛乳'],
  [/豆腐/, '木綿豆腐'],
];
// カロリーが実質ゼロのもの
const ZERO = /^(水|お湯|湯|熱湯|氷|だし汁|出汁)$/;

export function canonicalIngredient(name) {
  const n = name.trim();
  for (const [re, canon] of SYNONYMS) if (re.test(n)) return canon;
  return n;
}

const core = (foodName) => foodName.replace(/[（(][^）)]*[）)]/g, '').trim();

// 材料名に最も合う食品を探す（見つからなければ null）
export function matchFood(name, foods) {
  const ing = normalize(canonicalIngredient(name));
  if (!ing) return null;
  let best = null;
  let bestScore = 0;
  for (const f of foods) {
    const c = normalize(core(f.name));
    if (!c) continue;
    let score = 0;
    if (c === ing) score = 1000;
    else if (ing.includes(c)) score = 500 + c.length;         // 材料名が食品名を含む（「鶏むね肉（皮なし）」→「鶏むね肉」）
    else if (ing.length >= 2 && c.includes(ing)) score = 300 - c.length; // 食品名が材料名を含む
    else if (f.yomi && f.yomi.split(/\s+/).some((y) => y && normalize(y) === ing)) score = 200;
    if (score > 0 && f.custom) score += 1; // 同点なら自分のマイ食品を優先
    if (score > bestScore) { bestScore = score; best = f; }
  }
  if (best) return best;
  // OCRの1文字違い（「脱ロース」→「豚ロース」）を救う
  if (ing.length >= 3) {
    for (const f of foods) {
      const c = [...normalize(core(f.name))];
      const g = [...ing];
      if (c.length === g.length && c.filter((ch, i) => ch !== g[i]).length === 1) return f;
    }
  }
  return null;
}

// ---------- 分量 ----------
function fraction(s) {
  if (!s) return 1;
  const t = s.replace(/⁄/g, '/');
  if (t === '半') return 0.5;
  let m = t.match(/^(\d+)と(\d+)\/(\d+)$/);
  if (m) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  m = t.match(/^(\d+)\/(\d+)$/);
  if (m) return Number(m[1]) / Number(m[2]);
  return Number(t) || 0;
}

// 大さじ1杯のグラム数（食品の単位から。無ければ水と同じ15g）
function spoonGrams(food) {
  const u = food?.unit;
  if (u?.label === '大さじ1') return u.g;
  if (u?.label === '小さじ1') return u.g * 3;
  return 15;
}

const PIECE_FALLBACK = { 片: 5, かけ: 15, 房: 15, 束: 200, 袋: 200, 缶: 150, 切れ: 80, 尾: 15, 枚: 100, 個: 100, 本: 100 };

// 「1個」「1/2個」「10粒」のような食品の単位から、1つあたりのグラム数
function pieceGrams(food, word) {
  const u = food?.unit;
  if (u?.g) {
    const m = u.label.match(/(\d+(?:\/\d+)?)?\s*(個|本|枚|玉|株|丁|パック|切れ|尾|缶|杯|粒|片|かけ|房|束|袋)/);
    if (m && (m[2] === word || (['個', '玉'].includes(m[2]) && ['個', '玉'].includes(word)))) return u.g / fraction(m[1] || '1');
  }
  if (food?.basis === '100g' && PIECE_FALLBACK[word] && ['片', 'かけ', '房', '束', '袋', '缶', '切れ', '尾'].includes(word)) return PIECE_FALLBACK[word];
  return null;
}

const NUM = '(\\d+(?:\\.\\d+)?(?:と\\d+\\/\\d+|\\/\\d+)?|半)';
const QTY_RE = new RegExp(
  `(大さじ|小さじ|大匙|小匙|カップ)\\s*${NUM}?`
  + `|${NUM}\\s*(kg|g|グラム|ml|mL|cc|l|L|個|本|枚|玉|株|丁|パック|切れ|尾|缶|杯|粒|片|かけ|房|束|袋|合|cm)`
  + '|(少々|適量|適宜|お好みで|好みで|ひとつまみ|少量|少し)',
);

// 1行の材料を解析
export function parseIngredientLine(line) {
  let t = line.normalize('NFKC').replace(/⁄/g, '/')
    .replace(/^[\s・●○◎☆★■□◆◇◯•*\-–—]+/, '')
    .replace(/^[(（【<＜\[]?[A-ZＡ-Ｚ][)）】>＞\]]\s*/, '') // (A) 【B】 などの合わせ調味料記号
    .replace(/^[A-Z]\s+/, '')
    .trim();
  if (!t) return null;
  const paren = t.match(/[(（]\s*(?:約)?(\d+(?:\.\d+)?)\s*(g|ml|mL|cc)\s*[)）]/);
  const m = t.match(QTY_RE);
  let name = (m ? t.slice(0, m.index) : t)
    .replace(/[(（][^)）]*[)）]/g, '') // 「にんにく（すりおろし）」の補足を除く
    .replace(/[…‥:：・\s.]+$/g, '')
    .replace(/\s*(茶碗|お茶碗|お椀|どんぶり)$/, '') // 「ご飯 茶碗2杯」
    .trim();
  if (!name || name.length > 24 || /^\d/.test(name)) return null;
  const q = { kind: 'unknown' };
  if (paren) Object.assign(q, { kind: 'mass', value: Number(paren[1]), unit: paren[2].toLowerCase() });
  else if (m?.[1]) Object.assign(q, { kind: 'spoon', unit: m[1].replace('匙', 'さじ'), value: fraction(m[2] || '1') });
  else if (m?.[4]) {
    const u = m[4];
    if (/^(kg|g|グラム|ml|cc|l)$/i.test(u)) Object.assign(q, { kind: 'mass', value: fraction(m[3]), unit: u.toLowerCase().replace('グラム', 'g') });
    else Object.assign(q, { kind: 'piece', value: fraction(m[3]), unit: u });
  } else if (m?.[5]) q.kind = 'pinch';
  return { raw: line.trim(), name, qty: q };
}

// 材料1行のグラム数（分からなければ null）
export function gramsFor(item, food) {
  const q = item.qty;
  if (q.kind === 'pinch') return 0;
  if (q.kind === 'mass') {
    if (q.unit === 'kg') return q.value * 1000;
    if (q.unit === 'l') return q.value * 1000 * (spoonGrams(food) / 15);
    if (q.unit === 'ml' || q.unit === 'cc') return q.value * (spoonGrams(food) / 15);
    return q.value;
  }
  if (q.kind === 'spoon') {
    const big = spoonGrams(food);
    if (q.unit === '大さじ') return q.value * big;
    if (q.unit === '小さじ') return (q.value * big) / 3;
    if (q.unit === 'カップ') return (q.value * big * 200) / 15;
  }
  if (q.kind === 'piece') {
    if (q.unit === 'cm' && /しょうが|にんにく/.test(food?.name || '')) return q.value * 5;
    const pg = pieceGrams(food, q.unit);
    return pg ? q.value * pg : null;
  }
  return null;
}

// レシピ全文を解析：{ title, servings, items:[{raw,name,qty}] }
export function parseRecipeText(text) {
  const lines = squeezeJa(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let servings = null;
  let title = '';
  const items = [];
  let inIngredients = !lines.some((l) => /^[【\[(（<＜■●◆]*\s*(材料|食材)/.test(l));
  for (const l of lines) {
    const sv = l.match(/(\d+)\s*(?:[〜~～-]\s*\d+\s*)?(?:人分|人前|名分)/);
    if (sv && !servings) servings = Number(sv[1]);
    if (/^[【\[(（<＜■●◆]*\s*(材料|食材)/.test(l)) { inIngredients = true; continue; }
    if (/^[【\[(（<＜■●◆]*\s*(作り方|手順|つくり方|下準備|ポイント|コツ)/.test(l)) { inIngredients = false; continue; }
    if (!inIngredients) { if (!title && !sv && l.length <= 30) title = l; continue; }
    if (/^\d+[.)．、]\s*\S{10,}/.test(l)) continue; // 番号付きの手順文
    const it = parseIngredientLine(l);
    if (it && (it.qty.kind !== 'unknown' || it.name.length <= 12)) items.push(it);
    else if (!title && l.length <= 30) title = l;
  }
  return { title: title.replace(/[【】\[\]]/g, ''), servings, items };
}

export const isZeroIngredient = (name) => ZERO.test(canonicalIngredient(name));
