-- =====================================================
-- MIGRATION 7: Siet quyen GHI cho bang transactions
-- MUC DICH: truoc khi deploy public, dam bao NGUOI LA (anon) KHONG the
--   them / sua / xoa giao dich. Chi ADMIN (da dang nhap) moi ghi duoc.
-- AN TOAN: idempotent, khong dung du lieu. Chi chinh policy (RLS).
-- Cach chay: Supabase Dashboard -> SQL Editor -> Run
-- =====================================================

-- 1) Bat RLS (neu chua bat). Neu da bat roi thi lenh nay khong lam gi.
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- 2) Go cac policy GHI pho bien do Supabase tu tao (thuong cho phep ca anon).
--    Ten policy auto-generate hay gap:
DROP POLICY IF EXISTS "Enable insert for all users"                 ON transactions;
DROP POLICY IF EXISTS "Enable update for all users"                 ON transactions;
DROP POLICY IF EXISTS "Enable delete for all users"                 ON transactions;
DROP POLICY IF EXISTS "Enable insert for authenticated users only"  ON transactions;
DROP POLICY IF EXISTS "Enable update for authenticated users only"  ON transactions;
DROP POLICY IF EXISTS "Enable delete for authenticated users only"  ON transactions;
DROP POLICY IF EXISTS "transactions_insert_all"                     ON transactions;
DROP POLICY IF EXISTS "transactions_update_all"                     ON transactions;
DROP POLICY IF EXISTS "transactions_delete_all"                     ON transactions;

-- 3) Tao lai policy GHI dung chuan: CHI authenticated (admin da dang nhap).
DROP POLICY IF EXISTS "transactions_insert_auth" ON transactions;
CREATE POLICY "transactions_insert_auth" ON transactions
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "transactions_update_auth" ON transactions;
CREATE POLICY "transactions_update_auth" ON transactions
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "transactions_delete_auth" ON transactions;
CREATE POLICY "transactions_delete_auth" ON transactions
    FOR DELETE TO authenticated USING (true);

-- 4) Dam bao policy SELECT public/admin van con (tao lai cho chac).
--    Khach chi doc duoc giao dich cua quy cong khai; admin doc het.
DROP POLICY IF EXISTS "transactions_select_public_or_admin" ON transactions;
CREATE POLICY "transactions_select_public_or_admin" ON transactions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM workspaces w
            WHERE w.id = transactions.workspace_id
              AND (w.is_public = TRUE OR auth.uid() IS NOT NULL)
        )
    );

-- =====================================================
-- KIEM TRA SAU KHI CHAY:
--
-- (a) Liet ke toan bo policy cua transactions -> khong duoc co policy GHI
--     (INSERT/UPDATE/DELETE) nao target {public} hoac {anon}:
--
--   SELECT policyname, cmd, roles
--   FROM pg_policies
--   WHERE tablename = 'transactions'
--   ORDER BY cmd;
--
--   -- Ky vong:
--   --   SELECT  -> transactions_select_public_or_admin  {public}   (chi doc, OK)
--   --   INSERT  -> transactions_insert_auth             {authenticated}
--   --   UPDATE  -> transactions_update_auth             {authenticated}
--   --   DELETE  -> transactions_delete_auth             {authenticated}
--   -- Neu thay policy GHI nao co roles = {public} hoac {anon} -> XOA no di.
--
-- (b) Test thuc te (mo trang da deploy o tab an danh, CHUA dang nhap),
--     mo Console trinh duyet (F12) va chay:
--       await db.from('transactions').insert({ngay:'2026-01-01',tien_vao:1,workspace_id:1})
--     -> PHAI tra ve { error: ... } (khong chen duoc). Neu chen duoc = van con lo hong.
--     (Bien `db` la Supabase client cua app, khai bao trong script.js)
-- =====================================================
