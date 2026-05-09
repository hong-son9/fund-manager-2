-- =====================================================
-- MIGRATION 2: Per-workspace visibility (cong khai/an)
-- AN TOAN: idempotent, default = TRUE (giu nguyen behavior cu cua moi quy)
-- Cach chay: copy paste vao Supabase Dashboard -> SQL Editor -> Run
-- LUU Y: chay file `migration.sql` truoc neu chua chay.
-- =====================================================

-- 1) Them cot is_public (default TRUE -> khong anh huong cac quy hien co)
ALTER TABLE workspaces
    ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT TRUE;

-- 2) Cap nhat policy SELECT cho workspaces:
--    - Khach (anon): chi thay quy is_public = TRUE
--    - Admin (authenticated): thay TAT CA (de quan ly)
DROP POLICY IF EXISTS "workspaces_select_all"             ON workspaces;
DROP POLICY IF EXISTS "workspaces_select_public_or_admin" ON workspaces;

CREATE POLICY "workspaces_select_public_or_admin" ON workspaces
    FOR SELECT
    USING (is_public = TRUE OR auth.uid() IS NOT NULL);

-- 3) Cap nhat policy SELECT cho transactions:
--    Chi cho doc transactions cua nhung workspace cong khai
--    (hoac neu user da dang nhap admin -> doc duoc het).
--    Day la lop bao ve backend, nguoi xem khong the lay du lieu cua quy bi an
--    ngay ca khi guess workspace_id qua URL/console.
--
--    Dieu kien: chi tao policy moi neu RLS dang bat tren transactions.
--    Neu RLS chua bat thi DROP/CREATE policy se khong co tac dung,
--    nhung chay van khong loi.

-- Xoa cac policy SELECT cu pho bien (auto-generated boi Supabase) neu co
DROP POLICY IF EXISTS "Enable read access for all users"         ON transactions;
DROP POLICY IF EXISTS "transactions_select_all"                  ON transactions;
DROP POLICY IF EXISTS "transactions_select_public_or_admin"      ON transactions;

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
--   SELECT id, name, slug, is_public FROM workspaces ORDER BY id;
--   -- tat ca quy hien co phai co is_public = TRUE
--
--   -- Test thu (chay tay, voi 1 quy bat ky):
--   --   UPDATE workspaces SET is_public = FALSE WHERE slug = 'dulich';
--   -- Sau do mo trang trong tab an danh (chua dang nhap) -> chi thay 500AE.
--   -- Quay lai chay: UPDATE workspaces SET is_public = TRUE WHERE slug = 'dulich';
-- =====================================================
