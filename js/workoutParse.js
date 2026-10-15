// 紙のトレーニングメモ（OCR結果・貼り付けテキスト）を種目×セットに変換する
// 対応する書き方の例：
//   ベンチプレス 60kg×10×3        → 60kg×10回を3セット
//   ベンチ 60x10 60x8 55x10        → 3セット
//   スクワット 80kg 10/10/8        → 80kgで10,10,8回
//   スクワット 80kg 10回 3セット
//   懸垂 10回×3セット / 腹筋 20回   → 自重（0kg）
//   （種目名だけの行の次に「60×10」などの行が続く書き方も可）

// よくある略称 → 正式名
const ALIASES = [
  [/^(ベンチ|ベンチプレス|bp|bench)$/i, 'ベンチプレス'],
  [/^(インクライン|インクラインベンチ)$/, 'インクラインベンチプレス'],
  [/^(スクワ|スクワット|sq|squat)$/i, 'スクワット'],
  [/^(デッド|デッドリフト|dl|deadlift)$/i, 'デッドリフト'],
  [/^(ラットプル|ラットプルダウン|ラット)$/, 'ラットプルダウン'],
  [/^(ショルプレ|ショルダー|ショルダープレス)$/, 'ショルダープレス'],
  [/^(サイド|サイドレイズ)$/, 'サイドレイズ'],
  [/^(懸垂|チンニング|けんすい)$/, '懸垂'],
  [/^(レッグプレス|レッグプ)$/, 'レッグプレス'],
  [/^(ダンベルプレス|dbプレス)$/i, 'ダンベルプレス'],
  [/^(アームカール|カール)$/, 'ダンベルカール'],
  [/^(腹筋|クランチ)$/, 'クランチ'],
  [/^(腕立て|腕立て伏せ|プッシュアップ)$/, '腕立て伏せ'],
];

export function canonicalExercise(name) {
  const n = name.trim();
  for (const [re, canon] of ALIASES) if (re.test(n)) return canon;
  return n;
}

// OCRは日本語の文字間に空白を入れがちなので詰める（「ベン チ」→「ベンチ」）
const JA = '\\u3040-\\u30ff\\u3400-\\u9fff';
export function squeezeJa(s) {
  return String(s).normalize('NFKC').replace(new RegExp(`([${JA}])\\s+(?=[${JA}])`, 'g'), '$1');
}

function normalize(s) {
  return squeezeJa(s)
    .replace(/(\d)[OoＯ](?=[\dkgxX×.\s]|$)/g, '$10')
    .replace(/[×✕✖＊*]/g, 'x')
    .replace(/(\d)\s*[xX]\s*(?=\d)/g, '$1x')
    .replace(/キロ|ｋｇ|KG|Kg/g, 'kg')
    .replace(/回|reps?|レップ/gi, 'r')
    .replace(/セット|sets?/gi, 's')
    .replace(/[、，]/g, ',');
}

const num = (s) => Number(s);
const repeat = (n, set) => Array.from({ length: Math.min(Math.max(n, 1), 20) }, () => ({ ...set }));

// 1行の数値部分からセットを取り出す
export function parseSets(rest) {
  const t = normalize(rest).trim();
  if (!t) return [];

  // 80kg 10/10/8 または 80kg 10,10,8
  let m = t.match(/^(\d+(?:\.\d+)?)\s*(?:kg)?\s+((?:\d+\s*[/,]\s*)+\d+)\s*r?$/);
  if (m) return m[2].split(/[/,]/).map((r) => ({ w: num(m[1]), r: num(r) })).filter((s) => s.r > 0);

  // 60x10x3、60kgx10、60x10r x3s（複数並んでいてもOK）
  const sets = [];
  const re = /(\d+(?:\.\d+)?)\s*(?:kg)?\s*x\s*(\d+)\s*r?(?:\s*x\s*(\d+)\s*s?)?/g;
  while ((m = re.exec(t))) {
    if (/r\s*x?\s*$/.test(t.slice(0, m.index)) ) continue;
    const w = num(m[1]), r = num(m[2]);
    // 「10回x3セット」（自重）の形は後段で扱う
    if (/^\d+\s*rx\d+\s*s/.test(t.slice(m.index).replace(/\s/g, ''))) break;
    sets.push(...repeat(m[3] ? num(m[3]) : 1, { w, r }));
  }
  if (sets.length) return sets;

  // 80kg 10r 3s / 80kg 10r
  const re2 = /(\d+(?:\.\d+)?)\s*kg\s*(\d+)\s*r(?:\s*x?\s*(\d+)\s*s)?/g;
  while ((m = re2.exec(t))) sets.push(...repeat(m[3] ? num(m[3]) : 1, { w: num(m[1]), r: num(m[2]) }));
  if (sets.length) return sets;

  // 自重：10r x 3s / 10r3s
  m = t.match(/(\d+)\s*r\s*x?\s*(\d+)\s*s/);
  if (m) return repeat(num(m[2]), { w: 0, r: num(m[1]) });
  // 自重：20r / 10,10,8r
  m = t.match(/^((?:\d+\s*[/,]\s*)*\d+)\s*r$/);
  if (m) return m[1].split(/[/,]/).map((r) => ({ w: 0, r: num(r) }));
  return [];
}

const HEADER = /(の日|曜日?$|メニュー|トレーニング|^day\s*\d*$|^部位)/i;

// 複数行のメモ全体を解析
export function parseWorkoutText(text) {
  const out = [];
  for (const rawLine of String(text).split(/\n|\r/)) {
    const line = squeezeJa(rawLine)
      .replace(/^[\s・●○◯■□•*\-–—]+/, '')   // 箇条書き記号
      .replace(/^\d{1,2}[.)．]\s*/, '')      // 「1.」「2)」などの番号
      .trim();
    if (!line) continue;
    const i = line.search(/\d/);
    const name = (i === -1 ? line : line.slice(0, i)).replace(/[:：\-–—、,。.\s]+$/, '').trim();
    const rest = i === -1 ? '' : line.slice(i);
    const sets = parseSets(rest);
    if (name && !sets.length && HEADER.test(name)) continue; // 「胸の日」「月曜」などの見出し
    if (name && /[^\sxX×]/.test(name) && !/^(kg|r|s)$/i.test(name)) {
      out.push({ exercise: canonicalExercise(name), sets });
    } else if (sets.length && out.length) {
      out.at(-1).sets.push(...sets); // 種目名のない行は直前の種目に追加
    }
  }
  return out.filter((e) => e.exercise.length <= 30);
}

export const setsToText = (sets) => sets.map((s) => (s.w ? `${s.w}x${s.r}` : `${s.r}回`)).join(', ');

// OCRの1〜2文字の読み間違いを、既知の種目名に寄せる（例：「馴垂」→「懸垂」）
export function fuzzyExercise(name, known) {
  if (known.includes(name)) return name;
  const chars = [...name];
  let best = null, bestDiff = Infinity;
  for (const k of known) {
    const kc = [...k];
    if (kc.length !== chars.length) continue;
    const diff = kc.filter((ch, i) => ch !== chars[i]).length;
    if (diff < bestDiff && diff < chars.length) { best = k; bestDiff = diff; }
  }
  return best && bestDiff <= Math.max(1, Math.floor(chars.length / 3)) ? best : name;
}
