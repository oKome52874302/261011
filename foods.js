// 内蔵食品データ（100gあたり）
// 値は「日本食品標準成分表（八訂）」等を参考にした概算の目安値です。
// 市販品（プロテイン・サラダチキンなど）は商品ごとに差が大きいので、パッケージ表示での登録を推奨。
// unit: よく使う1単位の重さ(g)
const BUILTIN_FOODS = [
  // 主食
  { id: 'rice', name: '白米（炊飯）', kcal: 156, p: 2.5, f: 0.3, c: 37.1, unit: { label: '茶碗1杯', g: 150 } },
  { id: 'brown-rice', name: '玄米（炊飯）', kcal: 152, p: 2.8, f: 1.0, c: 35.6, unit: { label: '茶碗1杯', g: 150 } },
  { id: 'oatmeal', name: 'オートミール', kcal: 350, p: 13.7, f: 5.7, c: 69.1, unit: { label: '1食', g: 30 } },
  { id: 'bread', name: '食パン', kcal: 248, p: 8.9, f: 4.1, c: 46.4, unit: { label: '6枚切1枚', g: 60 } },
  { id: 'pasta', name: 'パスタ（ゆで）', kcal: 150, p: 5.8, f: 0.9, c: 32.2, unit: { label: '1人前', g: 240 } },
  { id: 'udon', name: 'うどん（ゆで）', kcal: 95, p: 2.6, f: 0.4, c: 21.6, unit: { label: '1玉', g: 200 } },
  { id: 'soba', name: 'そば（ゆで）', kcal: 130, p: 4.8, f: 1.0, c: 26.0, unit: { label: '1玉', g: 180 } },
  { id: 'sweet-potato', name: 'さつまいも（蒸し）', kcal: 131, p: 1.2, f: 0.2, c: 31.9, unit: { label: '中1/2本', g: 100 } },
  // 肉
  { id: 'chicken-breast', name: '鶏むね肉（皮なし）', kcal: 105, p: 23.3, f: 1.9, c: 0.1, unit: { label: '1枚', g: 250 } },
  { id: 'chicken-thigh', name: '鶏もも肉（皮なし）', kcal: 113, p: 19.0, f: 5.0, c: 0.0, unit: { label: '1枚', g: 250 } },
  { id: 'sasami', name: 'ささみ', kcal: 98, p: 23.9, f: 0.8, c: 0.1, unit: { label: '1本', g: 50 } },
  { id: 'salad-chicken', name: 'サラダチキン（市販・目安）', kcal: 109, p: 22.7, f: 1.4, c: 0.5, unit: { label: '1個', g: 110 } },
  { id: 'pork-loin', name: '豚ロース（脂身つき）', kcal: 248, p: 19.3, f: 19.2, c: 0.2, unit: { label: '1枚', g: 100 } },
  { id: 'pork-fillet', name: '豚ヒレ', kcal: 118, p: 22.2, f: 3.7, c: 0.3, unit: { label: '1人前', g: 100 } },
  { id: 'beef-round', name: '牛もも（赤身）', kcal: 140, p: 21.2, f: 4.6, c: 0.4, unit: { label: '1人前', g: 100 } },
  // 魚
  { id: 'salmon', name: '鮭（生）', kcal: 124, p: 22.3, f: 4.1, c: 0.1, unit: { label: '1切れ', g: 80 } },
  { id: 'mackerel', name: 'サバ（生）', kcal: 211, p: 20.6, f: 16.8, c: 0.3, unit: { label: '半身', g: 100 } },
  { id: 'tuna-can', name: 'ツナ缶（水煮）', kcal: 70, p: 16.0, f: 0.7, c: 0.2, unit: { label: '1缶', g: 70 } },
  // 卵・大豆・乳
  { id: 'egg', name: '卵（全卵）', kcal: 142, p: 12.2, f: 10.2, c: 0.4, unit: { label: '1個', g: 50 } },
  { id: 'natto', name: '納豆', kcal: 190, p: 16.5, f: 10.0, c: 12.1, unit: { label: '1パック', g: 45 } },
  { id: 'tofu', name: '木綿豆腐', kcal: 73, p: 7.0, f: 4.9, c: 1.5, unit: { label: '1/2丁', g: 150 } },
  { id: 'milk', name: '牛乳', kcal: 61, p: 3.3, f: 3.8, c: 4.8, unit: { label: 'コップ1杯', g: 200 } },
  { id: 'yogurt', name: 'ヨーグルト（無糖）', kcal: 56, p: 3.6, f: 3.0, c: 4.9, unit: { label: '1食', g: 100 } },
  { id: 'whey', name: 'ホエイプロテイン（目安）', kcal: 400, p: 75.0, f: 5.0, c: 10.0, unit: { label: '1杯', g: 30 } },
  // 野菜・果物・その他
  { id: 'broccoli', name: 'ブロッコリー', kcal: 37, p: 5.4, f: 0.6, c: 6.6, unit: { label: '1/4株', g: 60 } },
  { id: 'banana', name: 'バナナ', kcal: 93, p: 1.1, f: 0.2, c: 22.5, unit: { label: '1本', g: 100 } },
  { id: 'avocado', name: 'アボカド', kcal: 178, p: 2.1, f: 17.5, c: 7.9, unit: { label: '1/2個', g: 70 } },
  { id: 'almond', name: 'アーモンド', kcal: 609, p: 19.6, f: 51.8, c: 20.9, unit: { label: '10粒', g: 12 } },
  { id: 'olive-oil', name: 'オリーブオイル', kcal: 894, p: 0, f: 100, c: 0, unit: { label: '大さじ1', g: 12 } },
];
