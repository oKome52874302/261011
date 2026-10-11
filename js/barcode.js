// バーコード読み取り（BarcodeDetector があれば使用、無ければ ZXing を遅延読み込み）と
// Open Food Facts での商品検索
import { $ } from './dom.js';

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

async function nativeDetector() {
  if (!('BarcodeDetector' in window)) return null;
  try {
    const supported = await window.BarcodeDetector.getSupportedFormats();
    const formats = FORMATS.filter((f) => supported.includes(f));
    return formats.length ? new window.BarcodeDetector({ formats }) : null;
  } catch {
    return null;
  }
}

// スキャン用ダイアログを開き、読み取ったコード（またはキャンセルで null）を返す
export function scanBarcode() {
  const dialog = $('#scanDialog');
  const video = $('#scanVideo');
  const status = $('#scanStatus');
  const manual = $('#scanManual');
  manual.reset();
  status.textContent = 'カメラを起動しています…';
  dialog.showModal();

  return new Promise((resolve) => {
    let stream = null;
    let reader = null;
    let timer = null;
    let done = false;

    const finish = (code) => {
      if (done) return;
      done = true;
      clearInterval(timer);
      reader?.reset();
      stream?.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
      dialog.close();
      resolve(code);
    };

    $('#scanCancel').onclick = () => finish(null);
    dialog.oncancel = (e) => { e.preventDefault(); finish(null); };
    manual.onsubmit = (e) => {
      e.preventDefault();
      const code = manual.elements.code.value.replace(/\D/g, '');
      if (code.length >= 8) finish(code);
    };

    (async () => {
      try {
        const detector = await nativeDetector();
        if (detector) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
          if (done) return finish(null);
          video.srcObject = stream;
          await video.play();
          status.textContent = 'バーコードを枠内に映してください';
          timer = setInterval(async () => {
            if (video.readyState < 2) return;
            try {
              const codes = await detector.detect(video);
              if (codes.length) finish(codes[0].rawValue);
            } catch { /* 次のフレームで再試行 */ }
          }, 250);
        } else {
          const { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } = await import('../vendor/zxing.js');
          if (done) return;
          const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS,
            [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]]]);
          reader = new BrowserMultiFormatReader(hints, 300);
          status.textContent = 'バーコードを枠内に映してください';
          await reader.decodeFromConstraints({ video: { facingMode: 'environment' }, audio: false }, video, (result) => {
            if (result) finish(result.getText());
          });
        }
      } catch (e) {
        status.textContent = `カメラを使えません（${e.name === 'NotAllowedError' ? '許可されていません' : e.message}）。下に番号を入力してください。`;
      }
    })();
  });
}

// Open Food Facts から栄養情報（100gあたり）を取得。見つからなければ null
export async function lookupBarcode(code) {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,product_name_ja,brands,nutriments,serving_quantity`;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`商品検索に失敗しました (${res.status})`);
  const json = await res.json();
  const p = json.product;
  const n = p?.nutriments;
  if (!n) return null;
  const kcal = n['energy-kcal_100g'] ?? (n.energy_100g ? n.energy_100g / 4.184 : undefined);
  if (kcal === undefined) return null;
  const name = p.product_name_ja || p.product_name || '名称不明の商品';
  return {
    name: p.brands ? `${name}（${p.brands.split(',')[0]}）` : name,
    kcal: Math.round(kcal),
    p: Math.round((n.proteins_100g ?? 0) * 10) / 10,
    f: Math.round((n.fat_100g ?? 0) * 10) / 10,
    c: Math.round((n.carbohydrates_100g ?? 0) * 10) / 10,
    servingG: Number(p.serving_quantity) || 0,
  };
}
