// グループ共有に使う Supabase プロジェクト。
// URL と anon（または publishable）キーは公開して問題ない値です（読み書きの制限は supabase/schema.sql の RLS で行う）。
// 空のままでも、設定画面や招待リンクから端末ごとに設定できます。
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';
