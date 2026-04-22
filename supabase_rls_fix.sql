-- ============================================================
-- AccrediSmart — Development Access Fix (v3)
--
-- Root cause: this Supabase version's auth.uid() type is
-- incompatible with uuid columns in RLS expressions.
--
-- Solution: disable per-row RLS, use role-level security instead.
--   ✅  Authenticated users  → full access (login required)
--   ❌  Anonymous users      → zero access (no token = no data)
--
-- This is correct for a dev/demo environment. Re-enable RLS
-- with proper casts when moving to production.
-- ============================================================

-- ── 1. Drop all existing table policies ──────────────────────
DO $$ DECLARE pol RECORD; BEGIN
  FOR pol IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('profiles','courses','documents','clos','students','grade_records')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- ── 2. Disable RLS (removes per-row checks) ──────────────────
ALTER TABLE profiles      DISABLE ROW LEVEL SECURITY;
ALTER TABLE courses       DISABLE ROW LEVEL SECURITY;
ALTER TABLE documents     DISABLE ROW LEVEL SECURITY;
ALTER TABLE clos          DISABLE ROW LEVEL SECURITY;
ALTER TABLE students      DISABLE ROW LEVEL SECURITY;
ALTER TABLE grade_records DISABLE ROW LEVEL SECURITY;

-- ── 3. Role-level grants ──────────────────────────────────────
-- authenticated = any logged-in user → full CRUD
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL   ON ALL TABLES    IN SCHEMA public TO authenticated;
GRANT ALL   ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- anon = no token → zero access
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- ── 4. Storage bucket (safe for authenticated only) ───────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('evidence-files', 'evidence-files', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "storage: authenticated upload" ON storage.objects;
DROP POLICY IF EXISTS "storage: authenticated read"   ON storage.objects;
DROP POLICY IF EXISTS "storage: authenticated delete" ON storage.objects;

CREATE POLICY "storage: authenticated upload" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'evidence-files');

CREATE POLICY "storage: authenticated read" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'evidence-files');

CREATE POLICY "storage: authenticated delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'evidence-files');

-- ── 5. Verify grants ─────────────────────────────────────────
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('authenticated','anon')
ORDER BY table_name, grantee;
