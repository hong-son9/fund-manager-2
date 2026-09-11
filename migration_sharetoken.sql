-- =====================================================
-- MIGRATION 9: Link chia se BAO MAT bang token (share_token)
-- MUC DICH: quy de "Rieng tu" (is_public=FALSE, khong ai do ra),
--   nhung ai co LINK kem MA BI MAT (token) thi van xem duoc.
--   Client gui token qua header 'x-share-token'; RLS cho phep doc dung quy do.
-- AN TOAN: chi THEM policy SELECT (cong don voi policy cu). Khong sua du lieu.
-- Cach chay: Supabase Dashboard -> SQL Editor -> Run
-- =====================================================

-- 1) Cot token cho moi quy (32 ky tu hex, tao ngau nhien).
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS share_token TEXT;
UPDATE workspaces
    SET share_token = replace(gen_random_uuid()::text, '-', '')
    WHERE share_token IS NULL;
ALTER TABLE workspaces
    ALTER COLUMN share_token SET DEFAULT replace(gen_random_uuid()::text, '-', '');

-- 2) Ham doc token tu header cua request (PostgREST expose 'request.headers').
CREATE OR REPLACE FUNCTION public.current_share_token()
RETURNS text
LANGUAGE sql
STABLE
AS $$
    SELECT NULLIF(
        COALESCE(current_setting('request.headers', true)::json ->> 'x-share-token', ''),
        ''
    )
$$;

-- 3) Policy SELECT theo token (cong don voi policy public/admin da co).
--    workspaces
DROP POLICY IF EXISTS "workspaces_select_by_share_token" ON workspaces;
CREATE POLICY "workspaces_select_by_share_token" ON workspaces
    FOR SELECT
    USING (
        share_token IS NOT NULL
        AND share_token = public.current_share_token()
    );

--    transactions (theo quy cha)
DROP POLICY IF EXISTS "transactions_select_by_share_token" ON transactions;
CREATE POLICY "transactions_select_by_share_token" ON transactions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM workspaces w
            WHERE w.id = transactions.workspace_id
              AND w.share_token IS NOT NULL
              AND w.share_token = public.current_share_token()
        )
    );

--    debtors (con no) — chi co neu da chay migration_debt.sql
DROP POLICY IF EXISTS "debtors_select_by_share_token" ON debtors;
CREATE POLICY "debtors_select_by_share_token" ON debtors
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM workspaces w
            WHERE w.id = debtors.workspace_id
              AND w.share_token IS NOT NULL
              AND w.share_token = public.current_share_token()
        )
    );

--    debt_entries (cac lan vay/tra)
DROP POLICY IF EXISTS "debt_entries_select_by_share_token" ON debt_entries;
CREATE POLICY "debt_entries_select_by_share_token" ON debt_entries
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM debtors d
            JOIN workspaces w ON w.id = d.workspace_id
            WHERE d.id = debt_entries.debtor_id
              AND w.share_token IS NOT NULL
              AND w.share_token = public.current_share_token()
        )
    );

-- =====================================================
-- KIEM TRA:
--   SELECT id, name, slug, is_public, share_token FROM workspaces ORDER BY id;
--   -- De quy o "Rieng tu" (is_public=FALSE). Link chia se:
--   --   https://<domain>/?ws=<slug>&t=<share_token>
--   -- Mo o tab an danh (chua dang nhap) van vao xem duoc dung quy do,
--   -- nhung KHONG the do/liet ke vi is_public=FALSE.
-- =====================================================
