// 端末内OCR（Tesseract.js）で栄養成分表示を読み取る。画像は外部に送信しない。
// 初回のみ OCRエンジンと日本語データ（合計約6MB）をこのサイトから読み込み、以降はキャッシュされる。

const BASE = new URL('../vendor/tesseract/', import.meta.url).href;
let workerPromise = null;
let progressCb = () => {};

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { default: Tesseract } = await import('../vendor/tesseract/tesseract.esm.min.js');
      return Tesseract.createWorker('jpn', 1, {
        workerPath: `${BASE}worker.min.js`,
        corePath: `${BASE}core/`,
        langPath: `${BASE}lang/`,
        workerBlobURL: false,
        logger: (m) => progressCb(m),
      });
    })().catch((e) => { workerPromise = null; throw e; });
  }
  return workerPromise;
}

// グレースケール化＋拡大して文字を読みやすくする
async function preprocess(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const long = Math.max(bmp.width, bmp.height);
  const r = Math.min(2400 / long, Math.max(1, 1600 / long));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * r);
  c.height = Math.round(bmp.height * r);
  const g = c.getContext('2d');
  g.filter = 'grayscale(1) contrast(1.4)';
  g.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return c;
}

const STATUS_JA = {
  'loading tesseract core': 'OCRエンジンを準備中',
  'initializing tesseract': 'OCRエンジンを準備中',
  'loading language traineddata': '日本語データを読み込み中',
  'initializing api': '準備中',
  'recognizing text': '文字を読み取り中',
};

// 画像から文字を読み取る（成分表示・トレーニングメモ共通）
export async function recognizeText(file, onProgress = () => {}) {
  progressCb = (m) => onProgress(`${STATUS_JA[m.status] || '処理中'}… ${Math.round((m.progress || 0) * 100)}%`);
  const [worker, canvas] = await Promise.all([getWorker(), preprocess(file)]);
  const { data } = await worker.recognize(canvas);
  return data.text;
}

export async function recognizeLabel(file, onProgress = () => {}) {
  const text = await recognizeText(file, onProgress);
  return { text, ...parseNutritionText(text) };
}

// ---------- テキスト解析 ----------
// OCR結果や、iPhoneの「テキスト認識表示」でコピーした文字列から kcal / P / F / C を取り出す
export function parseNutritionText(raw) {
  const t = String(raw)
    .normalize('NFKC')
    .replace(/[ \t　]+/g, '')        // OCRは文字間に空白が入りがち
    .replace(/[，,](?=\d{1,2}\D)/g, '.') // 「4,5g」→「4.5g」
    .replace(/(\d)[oO](?=\d|g|k)/g, '$10')
    .replace(/kcaI|kca1|Kcal|KCAL/g, 'kcal')
    // 行末の「8.18」「8.19」は単位の g を 8/9 と誤認識したもの（成分表示は小数1桁が普通）
    .replace(/(\d+\.\d)[89](?=\n|$)/g, '$1g');

  // キーワードの直後（12文字以内）にある最初の数値
  const after = (re) => {
    const m = t.match(re);
    if (!m) return null;
    const rest = t.slice(m.index + m[0].length, m.index + m[0].length + 14).replace(/[lI|]/g, '1');
    const n = rest.match(/(\d+(?:\.\d+)?)/);
    return n ? Number(n[1]) : null;
  };

  let kcal = after(/(エネルギー|エネル|ネルギー|熱量)/);
  if (kcal === null) {
    const m = t.match(/(\d+(?:\.\d+)?)kcal/);
    kcal = m ? Number(m[1]) : null;
  }
  const p = after(/(たんぱく質|タンパク質|蛋白質|たんぱく|タンパク|ぱく質|パク質)/);
  const f = after(/(脂質|脂肪|脂)/);
  let c = after(/(炭水化物|炭水|水化物)/);
  if (c === null) {
    const sugar = after(/(糖質)/);
    const fiber = after(/(食物繊維|繊維)/);
    if (sugar !== null) c = sugar + (fiber || 0);
  }

  // 基準量：「1本(45g)当たり」「100gあたり」「1食分当たり」など
  let basis = '';
  let basisGrams = 0;
  const bi = t.search(/当たり|あたり|当り/);
  if (bi >= 0) {
    basis = t.slice(Math.max(0, bi - 16), bi).split('\n').pop()
      .replace(/^.*表示/, '')
      .replace(/^[(（]/, '');
    // OCRで閉じかっこが落ちた場合を補う
    if ((basis.match(/[(（]/g) || []).length > (basis.match(/[)）]/g) || []).length) basis += ')';
    const gm = basis.match(/(\d+(?:\.\d+)?)(g|ml|mL)/);
    if (gm) basisGrams = Number(gm[1]);
  }

  const found = [kcal, p, f, c].filter((v) => v !== null).length;
  return { kcal, p, f, c, basis, basisGrams, found };
}
