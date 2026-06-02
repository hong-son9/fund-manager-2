-- =====================================================
-- MIGRATION 4: Muc tieu quy (target_amount + target_people) cho workspaces
-- AN TOAN: idempotent, default 0 -> quy cu khong bi anh huong
-- Cach chay: copy paste vao Supabase SQL Editor -> Run
-- =====================================================

-- 1) Tong so tien can dat duoc (chi y nghia voi workspace type='trip')
ALTER TABLE workspaces
    ADD COLUMN IF NOT EXISTS target_amount BIGINT NOT NULL DEFAULT 0;

-- 2) So nguoi du kien dong gop
ALTER TABLE workspaces
    ADD COLUMN IF NOT EXISTS target_people INT NOT NULL DEFAULT 0;

-- 3) Khong am
ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS workspaces_target_amount_check;
ALTER TABLE workspaces
    ADD CONSTRAINT workspaces_target_amount_check CHECK (target_amount >= 0);

ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS workspaces_target_people_check;
ALTER TABLE workspaces
    ADD CONSTRAINT workspaces_target_people_check CHECK (target_people >= 0);

-- =====================================================
-- KIEM TRA:
--
--   SELECT id, name, type, target_amount, target_people FROM workspaces ORDER BY id;
-- =====================================================
