-- ============================================================
-- AccrediSmart — Admin Features Migration
-- Run this in the Supabase SQL Editor before testing.
-- ============================================================

-- ── Work Queue ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS work_queue (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id    UUID        REFERENCES courses(id)  ON DELETE CASCADE,
  faculty_id   UUID        REFERENCES profiles(id),
  status       TEXT        NOT NULL DEFAULT 'pending',   -- pending | reviewed | approved
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at  TIMESTAMPTZ,
  reviewed_by  UUID        REFERENCES profiles(id),
  UNIQUE(course_id)
);

-- ── Document Comments ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS document_comments (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id      UUID        REFERENCES courses(id)  ON DELETE CASCADE,
  category_index INTEGER     NOT NULL,   -- 0–8 matching the 9 evidence categories
  admin_id       UUID        REFERENCES profiles(id),
  comment        TEXT        NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── RLS: work_queue ───────────────────────────────────────────

ALTER TABLE work_queue ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read (faculty see their own, admin sees all)
CREATE POLICY "work_queue_select"
  ON work_queue FOR SELECT
  TO authenticated
  USING (true);

-- Faculty can insert their own entries (ignoreDuplicates handles repeat triggers)
CREATE POLICY "work_queue_insert_faculty"
  ON work_queue FOR INSERT
  TO authenticated
  WITH CHECK (faculty_id = auth.uid());

-- Admin can update any entry (status changes)
CREATE POLICY "work_queue_update_admin"
  ON work_queue FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── RLS: document_comments ────────────────────────────────────

ALTER TABLE document_comments ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read comments
CREATE POLICY "document_comments_select"
  ON document_comments FOR SELECT
  TO authenticated
  USING (true);

-- Only admin can insert comments
CREATE POLICY "document_comments_insert_admin"
  ON document_comments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
