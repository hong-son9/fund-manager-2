-- =====================================================
-- MIGRATION 5: Toggle hien thi o tim kiem & loc theo tung quy
-- AN TOAN: idempotent, default true -> quy cu giu hanh vi cu (co filter)
-- Cach chay: copy paste vao Supabase SQL Editor -> Run
-- =====================================================

ALTER TABLE workspaces
    ADD COLUMN IF NOT EXISTS show_filter BOOLEAN NOT NULL DEFAULT true;

-- =====================================================
-- KIEM TRA:
--
--   SELECT id, name, type, show_filter FROM workspaces ORDER BY id;
-- =====================================================
