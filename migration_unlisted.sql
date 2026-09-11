-- =====================================================
-- MIGRATION 8: "Chi qua link" (unlisted) cho workspaces
-- MUC DICH: tach "hien trong danh sach" ra khoi "xem duoc".
--   - is_public = TRUE  -> nguoi CHUA dang nhap xem duoc (RLS da co san).
--   - is_listed = TRUE  -> hien trong danh sach chon quy.
--   3 trang thai:
--     Cong khai   : is_public=TRUE,  is_listed=TRUE   (hien trong list + xem duoc)
--     Chi qua link: is_public=TRUE,  is_listed=FALSE  (AN khoi list, ai co link deu xem duoc)
--     Rieng tu    : is_public=FALSE                   (chi thu quy)
-- AN TOAN: idempotent, default TRUE -> moi quy hien co giu nguyen (van hien trong list).
--   KHONG doi RLS: link "chi qua link" chay duoc vi quy do van is_public=TRUE.
-- Cach chay: Supabase Dashboard -> SQL Editor -> Run
-- =====================================================

ALTER TABLE workspaces
    ADD COLUMN IF NOT EXISTS is_listed BOOLEAN NOT NULL DEFAULT true;

-- =====================================================
-- KIEM TRA:
--   SELECT id, name, slug, is_public, is_listed FROM workspaces ORDER BY id;
--   -- Muon 1 quy "chi qua link": is_public=TRUE, is_listed=FALSE
--   -- Link chia se co dang:  https://<domain>/?ws=<slug>
-- =====================================================
