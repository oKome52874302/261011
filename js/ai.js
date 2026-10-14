// Claude API による写真解析（食事写真の推定・栄養成分表示の読み取り）
// APIキーは各利用者が自分のものを設定し、端末内にのみ保存する。
import Anthropic from '../vendor/anthropic.js';
import { db, getApiKey } from './store.js';

export const AI_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5（高精度・推奨）' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5（バランス）' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5（低コスト）' },
];
// サーバー側フォールバック（拒否時に別モデルで再実行）に対応するモデル
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5']);

const nutrientProps = {
  kcal: { type: 'number', description: 'エネルギー(kcal)' },
  p: { type: 'number', description: 'たんぱく質(g)' },
  f: { type: 'number', description: '脂質(g)' },
  c: { type: 'number', description: '炭水化物(g)。糖質と食物繊維が別記なら合計' },
};

const MEAL_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '料理・食品名（日本語）' },
          grams: { type: 'number', description: '推定重量(g)' },
          ...nutrientProps,
        },
        required: ['name', 'grams', 'kcal', 'p', 'f', 'c'],
        additionalProperties: false,
      },
    },
    note: { type: 'string', description: '推定の前提や不確かな点（1〜2文）' },
  },
  required: ['items', 'note'],
  additionalProperties: false,
};

const LABEL_SCHEMA = {
  type: 'object',
  properties: {
    found: { type: 'boolean', description: '栄養成分表示が読み取れたか' },
    name: { type: 'string', description: '商品名（分からなければ空文字）' },
    basis: { type: 'string', description: '表示の基準量（例: 1本(45g)あたり、100gあたり）' },
    basisGrams: { type: 'number', description: '基準量のグラム数。不明なら0' },
    ...nutrientProps,
  },
  required: ['found', 'name', 'basis', 'basisGrams', 'kcal', 'p', 'f', 'c'],
  additionalProperties: false,
};

const SYSTEM = `あなたは日本の管理栄養士です。筋トレ・ダイエット中のユーザーの食事記録を手伝います。
数値は日本食品標準成分表や一般的な市販品の表示を基準に、現実的な値で答えてください。`;

// 長辺1568px以下のJPEGに縮小してbase64化（通信量とトークンの節約）
async function toBase64Jpeg(file, maxSide = 1568) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const r = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * r);
  canvas.height = Math.round(bmp.height * r);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  return canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
}

async function askWithImage(file, prompt, schema) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('設定画面で Claude の APIキーを登録してください');
  const model = db.state.ai?.model || 'claude-opus-5-5';
  const data = await toBase64Jpeg(file);
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const params = {
    model,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } },
        { type: 'text', text: prompt },
      ],
    }],
  };
  if (FALLBACK_MODELS.has(model)) {
    params.betas = ['server-side-fallback-2026-07-01'];
    params.fallbacks = 'default';
  }

  let res;
  try {
    res = await client.beta.messages.create(params);
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error('APIキーが正しくありません');
    if (e instanceof Anthropic.RateLimitError) throw new Error('利用上限に達しました。少し待ってから再試行してください');
    if (e instanceof Anthropic.APIConnectionError) throw new Error('通信できませんでした。電波状況を確認してください');
    if (e instanceof Anthropic.APIError) throw new Error(`APIエラー (${e.status ?? '?'}): ${e.message}`);
    throw e;
  }
  if (res.stop_reason === 'refusal') throw new Error('この画像は解析できませんでした');
  if (res.stop_reason === 'max_tokens') throw new Error('応答が長すぎて途中で切れました。もう一度試してください');
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return JSON.parse(text);
}

export async function analyzeMealPhoto(file) {
  const out = await askWithImage(file,
    `この食事写真に写っている料理・食品をすべて挙げ、それぞれの推定重量と栄養（kcal・たんぱく質・脂質・炭水化物）を推定してください。
食器の大きさなどから量を見積もり、調理油やソースも含めてください。食事が写っていなければ items は空配列にしてください。`,
    MEAL_SCHEMA);
  return out;
}

export async function readNutritionLabel(file) {
  return askWithImage(file,
    `この写真の「栄養成分表示」を読み取ってください。表示されている基準量（1食・1本・100gあたり等）の値をそのまま返してください。
商品名がパッケージに見えれば name に入れてください。表示が読めない場合は found を false にしてください。`,
    LABEL_SCHEMA);
}
