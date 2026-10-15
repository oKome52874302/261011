// グループ共有に使う Supabase プロジェクト。
// URL と anon（または publishable）キーは公開して問題ない値です（読み書きの制限は supabase/schema.sql の RLS で行う）。
// 空のままでも、設定画面や招待リンクから端末ごとに設定できます。
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';

// ヘルスケア連携用のショートカット
// iPhoneで作成したショートカットの iCloud 共有リンク（https://www.icloud.com/shortcuts/...）を入れると、
// 全員の設定画面に「ワンタップで追加」ボタンが表示されます。
export const SHORTCUT_ICLOUD_URL = '';
// アプリの「同期」ボタンが呼び出すショートカット名（共有リンクのショートカットもこの名前にする）
export const SHORTCUT_NAME = 'MacroLog歩数';
