// PDF から文字を取り出す（pdf.js）。文字データの無いスキャンPDFはページを画像にしてOCRする。
import { recognizeText } from './ocr.js';

const BASE = new URL('../vendor/pdfjs/', import.meta.url).href;
const MAX_PAGES = 5;

export async function pdfToText(file, onProgress = () => {}) {
  onProgress('PDFを読み込み中…');
  const pdfjs = await import('../vendor/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = `${BASE}pdf.worker.min.mjs`;
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: `${BASE}cmaps/`, // 日本語フォントの文字対応表
    cMapPacked: true,
  }).promise;

  const pages = Math.min(doc.numPages, MAX_PAGES);
  let text = '';
  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let lastY = null;
    for (const item of content.items) {
      const y = item.transform?.[5];
      // 行が変わったら改行（hasEOL が付かないPDFもあるため座標でも判定）
      if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 2 && !text.endsWith('\n')) text += '\n';
      text += item.str;
      if (item.hasEOL) text += '\n';
      lastY = y ?? lastY;
    }
    text += '\n';
  }
  if (text.replace(/\s/g, '').length >= 20) return text;

  // 文字が取れない（スキャン画像のPDF）→ OCR
  let ocr = '';
  for (let i = 1; i <= pages; i++) {
    onProgress(`スキャンPDFを読み取り中…（${i}/${pages}ページ）`);
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    ocr += `${await recognizeText(blob, onProgress)}\n`;
  }
  return ocr;
}
