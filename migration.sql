-- =====================================================
-- MIGRATION: Multi-workspace support
-- AN TOAN: khong xoa du lieu cu. Idempotent (chay lai duoc).
-- Cach chay: copy paste vao Supabase Dashboard -> SQL Editor -> Run
-- =====================================================

-- 1) Bang workspaces
CREATE TABLE IF NOT EXISTS workspaces (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL UNIQUE,
    icon        TEXT NOT NULL DEFAULT '💰',
    sort_order  INT  NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2) Tao workspace 500AE (idempotent: chi insert neu chua co)
INSERT INTO workspaces (name, slug, icon, sort_order)
SELECT 'Quỹ 500 Anh Em', '500ae', '💰', 0
WHERE NOT EXISTS (SELECT 1 FROM workspaces WHERE slug = '500ae');

-- 3) Tao workspace DULICH
INSERT INTO workspaces (name, slug, icon, sort_order)
SELECT 'Quỹ Du Lịch', 'dulich', '✈️', 1
WHERE NOT EXISTS (SELECT 1 FROM workspaces WHERE slug = 'dulich');

-- 4) Them cot workspace_id vao transactions (nullable truoc de khong loi)
ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS workspace_id BIGINT
    REFERENCES workspaces(id) ON DELETE CASCADE;

-- 5) Backfill: gan toan bo transactions cu ve 500AE
--    Chi update nhung row chua co workspace_id (an toan voi nhieu lan chay)
UPDATE transactions
SET workspace_id = (SELECT id FROM workspaces WHERE slug = '500ae')
WHERE workspace_id IS NULL;

-- 6) Sau khi backfill xong, dat NOT NULL de du lieu moi bat buoc co workspace
ALTER TABLE transactions ALTER COLUMN workspace_id SET NOT NULL;

-- 7) Index de query nhanh hon
CREATE INDEX IF NOT EXISTS idx_transactions_workspace_id
    ON transactions(workspace_id);

-- =====================================================
-- 8) RLS cho bang workspaces
-- =====================================================
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

-- Ai cung xem duoc danh sach quy
DROP POLICY IF EXISTS "workspaces_select_all" ON workspaces;
CREATE POLICY "workspaces_select_all" ON workspaces
    FOR SELECT USING (true);

-- Chi admin (da dang nhap) moi them duoc
DROP POLICY IF EXISTS "workspaces_insert_auth" ON workspaces;
CREATE POLICY "workspaces_insert_auth" ON workspaces
    FOR INSERT TO authenticated WITH CHECK (true);

-- Chi admin moi sua duoc
DROP POLICY IF EXISTS "workspaces_update_auth" ON workspaces;
CREATE POLICY "workspaces_update_auth" ON workspaces
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Chi admin moi xoa duoc
DROP POLICY IF EXISTS "workspaces_delete_auth" ON workspaces;
CREATE POLICY "workspaces_delete_auth" ON workspaces
    FOR DELETE TO authenticated USING (true);

-- =====================================================
-- KIEM TRA SAU KHI CHAY (chay tay cau lenh nay de verify):
--
--   SELECT * FROM workspaces;
--   -- phai thay 500ae va dulich
--
--   SELECT COUNT(*) AS total,
--          COUNT(workspace_id) AS has_ws,
--          COUNT(*) - COUNT(workspace_id) AS missing
--   FROM transactions;
--   -- missing phai = 0 (tat ca transactions deu co workspace)
--
--   SELECT w.name, COUNT(t.id) AS so_giao_dich
--   FROM workspaces w
--   LEFT JOIN transactions t ON t.workspace_id = w.id
--   GROUP BY w.id, w.name;
--   -- 500ae phai co toan bo so transactions cu, dulich = 0
-- =====================================================
