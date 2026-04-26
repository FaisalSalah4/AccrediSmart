-- ============================================================
-- AccrediSmart — FCAR Assessment Workflow Schema
--
-- Run this AFTER supabase_schema.sql has been applied. It adds
-- the tables that drive the new FCAR workflow:
--
--   assessments         — quizzes, exams, projects, etc.
--   assessment_items    — individual questions / sub-items
--   clo_item_map        — which items measure which CLOs
--   student_item_grades — score per student per assessment item
--
-- Grades live at the ITEM level only. CLO attainment is DERIVED
-- by the application from the mapping + student item grades.
-- (See frontend/src/api.js → calculateAttainment.)
--
-- Dashboard → SQL Editor → New Query → Paste → Run
-- ============================================================


-- ── 1. ASSESSMENTS ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS assessments (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id   UUID REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL,                -- Quiz | Assignment | Midterm | Final Exam | Project | Lab | Presentation
  weight      FLOAT NOT NULL DEFAULT 0,     -- 0–100, course-grade weight (informational)
  total_mark  FLOAT NOT NULL DEFAULT 0,     -- total marks for this assessment
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS assessments_course_idx ON assessments(course_id);


-- ── 2. ASSESSMENT ITEMS (Q1, Q2, etc. under an assessment) ──────────────────

CREATE TABLE IF NOT EXISTS assessment_items (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  assessment_id  UUID REFERENCES assessments(id) ON DELETE CASCADE NOT NULL,
  name           TEXT NOT NULL,
  full_mark      FLOAT NOT NULL DEFAULT 0,
  position       INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS assessment_items_assessment_idx ON assessment_items(assessment_id);


-- ── 3. CLO ↔ ITEM MAPPING ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS clo_item_map (
  id        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clo_id    UUID REFERENCES clos(id)            ON DELETE CASCADE NOT NULL,
  item_id   UUID REFERENCES assessment_items(id) ON DELETE CASCADE NOT NULL,
  UNIQUE (clo_id, item_id)
);

CREATE INDEX IF NOT EXISTS clo_item_map_clo_idx  ON clo_item_map(clo_id);
CREATE INDEX IF NOT EXISTS clo_item_map_item_idx ON clo_item_map(item_id);


-- ── 4. STUDENT ITEM GRADES (per student × per assessment item) ──────────────

CREATE TABLE IF NOT EXISTS student_item_grades (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id  UUID REFERENCES students(id)         ON DELETE CASCADE NOT NULL,
  item_id     UUID REFERENCES assessment_items(id) ON DELETE CASCADE NOT NULL,
  score       FLOAT NOT NULL,
  UNIQUE (student_id, item_id)
);

CREATE INDEX IF NOT EXISTS student_item_grades_student_idx ON student_item_grades(student_id);
CREATE INDEX IF NOT EXISTS student_item_grades_item_idx    ON student_item_grades(item_id);


-- ════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- Same pattern as the existing tables: faculty can only read/write rows that
-- belong to their own courses; admins see everything.
-- (is_admin() is defined in supabase_schema.sql.)
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE assessments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE clo_item_map        ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_item_grades ENABLE ROW LEVEL SECURITY;


-- ── Assessments ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "assessments: via course ownership" ON assessments;
CREATE POLICY "assessments: via course ownership" ON assessments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = assessments.course_id
        AND (courses.instructor_id = auth.uid() OR is_admin())
    )
  );


-- ── Assessment Items ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "assessment_items: via assessment ownership" ON assessment_items;
CREATE POLICY "assessment_items: via assessment ownership" ON assessment_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM assessments
      JOIN courses ON courses.id = assessments.course_id
      WHERE assessments.id = assessment_items.assessment_id
        AND (courses.instructor_id = auth.uid() OR is_admin())
    )
  );


-- ── CLO ↔ Item Mapping ──────────────────────────────────────────────────────

DROP POLICY IF EXISTS "clo_item_map: via course ownership" ON clo_item_map;
CREATE POLICY "clo_item_map: via course ownership" ON clo_item_map
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM clos
      JOIN courses ON courses.id = clos.course_id
      WHERE clos.id = clo_item_map.clo_id
        AND (courses.instructor_id = auth.uid() OR is_admin())
    )
  );


-- ── Student Item Grades ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS "student_item_grades: via course ownership" ON student_item_grades;
CREATE POLICY "student_item_grades: via course ownership" ON student_item_grades
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM students
      JOIN courses ON courses.id = students.course_id
      WHERE students.id = student_item_grades.student_id
        AND (courses.instructor_id = auth.uid() OR is_admin())
    )
  );
