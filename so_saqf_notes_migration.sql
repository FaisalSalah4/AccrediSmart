-- Run this in the Supabase SQL Editor.
-- Safe to re-run: tables use IF NOT EXISTS, policies use DROP IF EXISTS.

-- ── Tables ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS so_attainment_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  so_code TEXT NOT NULL,
  reasons TEXT,
  improvement_action TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(course_id, so_code)
);

CREATE TABLE IF NOT EXISTS saqf_attainment_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  domain_code TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(course_id, domain_code)
);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE so_attainment_notes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE saqf_attainment_notes ENABLE ROW LEVEL SECURITY;

-- so_attainment_notes: instructors manage notes for their own courses; admins manage all
DROP POLICY IF EXISTS "Users manage SO notes for own courses" ON so_attainment_notes;
CREATE POLICY "Users manage SO notes for own courses" ON so_attainment_notes
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM courses   WHERE courses.id   = so_attainment_notes.course_id AND courses.instructor_id = auth.uid())
    OR
    EXISTS (SELECT 1 FROM profiles  WHERE profiles.id  = auth.uid() AND profiles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM courses   WHERE courses.id   = so_attainment_notes.course_id AND courses.instructor_id = auth.uid())
    OR
    EXISTS (SELECT 1 FROM profiles  WHERE profiles.id  = auth.uid() AND profiles.role = 'admin')
  );

-- saqf_attainment_notes: same pattern
DROP POLICY IF EXISTS "Users manage SAQF notes for own courses" ON saqf_attainment_notes;
CREATE POLICY "Users manage SAQF notes for own courses" ON saqf_attainment_notes
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM courses   WHERE courses.id   = saqf_attainment_notes.course_id AND courses.instructor_id = auth.uid())
    OR
    EXISTS (SELECT 1 FROM profiles  WHERE profiles.id  = auth.uid() AND profiles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM courses   WHERE courses.id   = saqf_attainment_notes.course_id AND courses.instructor_id = auth.uid())
    OR
    EXISTS (SELECT 1 FROM profiles  WHERE profiles.id  = auth.uid() AND profiles.role = 'admin')
  );
