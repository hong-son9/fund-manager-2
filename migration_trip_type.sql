-- =====================================================
-- MIGRATION 3: Workspace type + ghi_chu cho transactions
-- AN TOAN: idempotent, default cu tat ca = 'cashflow' (giu hanh vi cu)
-- Cach chay: copy paste vao Supabase SQL Editor -> Run
-- =====================================================

-- 1) Them cot type cho workspaces (default 'cashflow' -> 500AE va moi quy cu giu nguyen UI)
ALTER TABLE workspaces
    ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'cashflow';

-- 2) Rang buoc gia tri hop le (idempotent: drop neu da co roi tao lai)
ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS workspaces_type_check;
ALTER TABLE workspaces
    ADD CONSTRAINT workspaces_type_check CHECK (type IN ('cashflow', 'trip'));

-- 3) Set DULICH = type 'trip' (chi update neu dang la cashflow, idempotent)
UPDATE workspaces SET type = 'trip'
WHERE slug = 'dulich' AND type = 'cashflow';

-- 4) Them cot ghi_chu cho transactions (nullable)
ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS ghi_chu TEXT;

-- =====================================================
-- KIEM TRA SAU KHI CHAY:
--
--   SELECT id, name, slug, type FROM workspaces ORDER BY id;
--   -- 500ae phai la cashflow, dulich phai la trip
--
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'transactions' AND column_name = 'ghi_chu';
--   -- phai thay 1 dong: ghi_chu | text
-- =====================================================
