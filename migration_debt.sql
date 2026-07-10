-- =====================================================
-- MIGRATION 6: Workspace kieu 'debt' (Danh sach con no)
-- AN TOAN: idempotent, KHONG dung toi cac quy/transactions cu.
--   - Chi mo rong constraint type de them 'debt'
--   - Them 2 bang moi: debtors (con no) + debt_entries (cac lan vay/tra)
-- Cach chay: copy paste vao Supabase SQL Editor -> Run
-- LUU Y: chay migration.sql (va cac migration truoc) truoc neu chua chay.
-- =====================================================

-- 1) Mo rong rang buoc type: cho phep them 'debt' (giu 'cashflow','trip')
ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS workspaces_type_check;
ALTER TABLE workspaces
    ADD CONSTRAINT workspaces_type_check CHECK (type IN ('cashflow', 'trip', 'debt'));

-- =====================================================
-- 2) Bang debtors (moi con no = 1 dong trong grid)
-- =====================================================
CREATE TABLE IF NOT EXISTS debtors (
    id            BIGSERIAL PRIMARY KEY,
    workspace_id  BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    note          TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_debtors_workspace_id ON debtors(workspace_id);

-- =====================================================
-- 3) Bang debt_entries (cac lan ghi no / tra tien cua 1 con no)
--    kind = 'debt'    -> vay them (tang no)
--    kind = 'payment' -> tra tien  (giam no)
-- =====================================================
CREATE TABLE IF NOT EXISTS debt_entries (
    id          BIGSERIAL PRIMARY KEY,
    debtor_id   BIGINT NOT NULL REFERENCES debtors(id) ON DELETE CASCADE,
    kind        TEXT   NOT NULL DEFAULT 'payment',
    amount      BIGINT NOT NULL DEFAULT 0,
    ngay        DATE,
    note        TEXT,
    anh_url     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE debt_entries DROP CONSTRAINT IF EXISTS debt_entries_kind_check;
ALTER TABLE debt_entries
    ADD CONSTRAINT debt_entries_kind_check CHECK (kind IN ('debt', 'payment'));

ALTER TABLE debt_entries DROP CONSTRAINT IF EXISTS debt_entries_amount_check;
ALTER TABLE debt_entries
    ADD CONSTRAINT debt_entries_amount_check CHECK (amount >= 0);

CREATE INDEX IF NOT EXISTS idx_debt_entries_debtor_id ON debt_entries(debtor_id);

-- =====================================================
-- 4) RLS cho debtors (giong logic transactions:
--    khach chi thay con no cua quy cong khai, admin thay het)
-- =====================================================
ALTER TABLE debtors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "debtors_select_public_or_admin" ON debtors;
CREATE POLICY "debtors_select_public_or_admin" ON debtors
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM workspaces w
            WHERE w.id = debtors.workspace_id
              AND (w.is_public = TRUE OR auth.uid() IS NOT NULL)
        )
    );

DROP POLICY IF EXISTS "debtors_insert_auth" ON debtors;
CREATE POLICY "debtors_insert_auth" ON debtors
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "debtors_update_auth" ON debtors;
CREATE POLICY "debtors_update_auth" ON debtors
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "debtors_delete_auth" ON debtors;
CREATE POLICY "debtors_delete_auth" ON debtors
    FOR DELETE TO authenticated USING (true);

-- =====================================================
-- 5) RLS cho debt_entries (bam theo quyen cua con no -> quy)
-- =====================================================
ALTER TABLE debt_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "debt_entries_select_public_or_admin" ON debt_entries;
CREATE POLICY "debt_entries_select_public_or_admin" ON debt_entries
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM debtors d
            JOIN workspaces w ON w.id = d.workspace_id
            WHERE d.id = debt_entries.debtor_id
              AND (w.is_public = TRUE OR auth.uid() IS NOT NULL)
        )
    );

DROP POLICY IF EXISTS "debt_entries_insert_auth" ON debt_entries;
CREATE POLICY "debt_entries_insert_auth" ON debt_entries
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "debt_entries_update_auth" ON debt_entries;
CREATE POLICY "debt_entries_update_auth" ON debt_entries
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "debt_entries_delete_auth" ON debt_entries;
CREATE POLICY "debt_entries_delete_auth" ON debt_entries
    FOR DELETE TO authenticated USING (true);

-- =====================================================
-- KIEM TRA SAU KHI CHAY:
--
--   -- type da cho phep 'debt':
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint WHERE conname = 'workspaces_type_check';
--
--   -- 2 bang moi da co:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_name IN ('debtors','debt_entries');
--
--   -- Tao thu 1 quy con no tren giao dien -> them Thuy, Linh -> kiem tra:
--   SELECT * FROM debtors;
--   SELECT * FROM debt_entries;
-- =====================================================
