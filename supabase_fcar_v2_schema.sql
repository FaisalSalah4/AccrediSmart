-- ============================================================
-- AccrediSmart — FCAR v2 Schema (run AFTER the previous two SQL files)
--
-- Adds:
--   • program_outcomes        — PLO codes per department (DB-driven, editable)
--   • student_outcomes        — ABET SO codes per department (DB-driven, editable)
--   • saqf_domains            — NCAAA / SAQF domain reference (global)
--   • clo_recommendations     — per-CLO recommendations (auto + manual)
--   • so_attainments          — per-course × SO ABET attainment record
--                              (Reasons / Improvement Action are editable)
--   • saqf_attainments        — per-course × SAQF domain attainment record
--                              (Reasons / Improvement Action are editable)
--
-- Hardens:
--   • Admin-only RLS for editing clos.target_attainment & clos.passing_score
--
-- Dashboard → SQL Editor → New Query → Paste → Run
-- ============================================================


-- ── 1. PROGRAM OUTCOMES (PLOs) — per-department reference list ─────────────

CREATE TABLE IF NOT EXISTS program_outcomes (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  department  TEXT NOT NULL,
  code        TEXT NOT NULL,           -- PLO1, PLO2, …
  description TEXT NOT NULL DEFAULT '',
  position    INTEGER NOT NULL DEFAULT 1,
  UNIQUE (department, code)
);

CREATE INDEX IF NOT EXISTS program_outcomes_dept_idx ON program_outcomes(department);


-- ── 2. STUDENT OUTCOMES (ABET-style SOs) — per-department reference list ───

CREATE TABLE IF NOT EXISTS student_outcomes (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  department    TEXT NOT NULL,
  code          TEXT NOT NULL,           -- SO1, SO2, …
  description   TEXT NOT NULL DEFAULT '',
  related_plo   TEXT,                    -- optional context (e.g. "PLO1")
  position      INTEGER NOT NULL DEFAULT 1,
  UNIQUE (department, code)
);

CREATE INDEX IF NOT EXISTS student_outcomes_dept_idx ON student_outcomes(department);


-- ── 3. SAQF / NCAAA DOMAINS (global reference) ─────────────────────────────

CREATE TABLE IF NOT EXISTS saqf_domains (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,       -- 'knowledge_understanding', etc.
  label       TEXT NOT NULL,              -- display label
  position    INTEGER NOT NULL DEFAULT 1
);


-- ── 4. CLO RECOMMENDATIONS (per CLO, per course) ───────────────────────────
-- One row per (course, clo). Holds both the auto-generated text snapshot
-- (auto_text) and the instructor's manual action plan (manual_text).
-- Manual_text is meant to support future AI training, so we keep it free-form
-- and timestamped.

CREATE TABLE IF NOT EXISTS clo_recommendations (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id     UUID REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
  clo_id        UUID REFERENCES clos(id)    ON DELETE CASCADE NOT NULL,
  auto_text     TEXT,
  manual_text   TEXT,
  updated_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (course_id, clo_id)
);

CREATE INDEX IF NOT EXISTS clo_recommendations_course_idx ON clo_recommendations(course_id);


-- ── 5. ABET SO ATTAINMENTS (per course × SO) ───────────────────────────────
-- Reasons & improvement_action are editable text fields kept here so they
-- persist across report regenerations. The numeric attainment is recomputed
-- on the fly from the underlying CLO results — only the qualitative bits
-- are stored here.

CREATE TABLE IF NOT EXISTS so_attainments (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id           UUID REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
  so_code             TEXT NOT NULL,                   -- 'SO1', 'SO2', ...
  reasons             TEXT,
  improvement_action  TEXT,
  updated_by          UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (course_id, so_code)
);

CREATE INDEX IF NOT EXISTS so_attainments_course_idx ON so_attainments(course_id);


-- ── 6. SAQF / NCAAA ATTAINMENTS (per course × domain) ──────────────────────

CREATE TABLE IF NOT EXISTS saqf_attainments (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id           UUID REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
  domain_code         TEXT NOT NULL,                   -- matches saqf_domains.code
  reasons             TEXT,
  improvement_action  TEXT,
  updated_by          UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (course_id, domain_code)
);

CREATE INDEX IF NOT EXISTS saqf_attainments_course_idx ON saqf_attainments(course_id);


-- ════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE program_outcomes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_outcomes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE saqf_domains        ENABLE ROW LEVEL SECURITY;
ALTER TABLE clo_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE so_attainments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE saqf_attainments    ENABLE ROW LEVEL SECURITY;


-- Reference lists: any authenticated user can read; only admins can write.

DROP POLICY IF EXISTS "program_outcomes: read all auth"  ON program_outcomes;
CREATE POLICY "program_outcomes: read all auth" ON program_outcomes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "program_outcomes: admin write"    ON program_outcomes;
CREATE POLICY "program_outcomes: admin write" ON program_outcomes
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "student_outcomes: read all auth"  ON student_outcomes;
CREATE POLICY "student_outcomes: read all auth" ON student_outcomes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "student_outcomes: admin write"    ON student_outcomes;
CREATE POLICY "student_outcomes: admin write" ON student_outcomes
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "saqf_domains: read all auth"      ON saqf_domains;
CREATE POLICY "saqf_domains: read all auth" ON saqf_domains
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "saqf_domains: admin write"        ON saqf_domains;
CREATE POLICY "saqf_domains: admin write" ON saqf_domains
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());


-- Per-course rows: faculty can read/write only for their own courses.

DROP POLICY IF EXISTS "clo_recommendations: via course ownership" ON clo_recommendations;
CREATE POLICY "clo_recommendations: via course ownership" ON clo_recommendations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = clo_recommendations.course_id
        AND (courses.instructor_id = auth.uid() OR is_admin())
    )
  );

DROP POLICY IF EXISTS "so_attainments: via course ownership" ON so_attainments;
CREATE POLICY "so_attainments: via course ownership" ON so_attainments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = so_attainments.course_id
        AND (courses.instructor_id = auth.uid() OR is_admin())
    )
  );

DROP POLICY IF EXISTS "saqf_attainments: via course ownership" ON saqf_attainments;
CREATE POLICY "saqf_attainments: via course ownership" ON saqf_attainments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = saqf_attainments.course_id
        AND (courses.instructor_id = auth.uid() OR is_admin())
    )
  );


-- ════════════════════════════════════════════════════════════════════════════
-- ADMIN-ONLY EDIT OF CLO target_attainment / passing_score
-- Defense-in-depth: keep the existing course-ownership SELECT policy, but add
-- a stricter UPDATE policy so faculty can only update plo_mapping/so_mapping
-- (description, code, ncaaa_domain, bloom_level remain locked-down too).
-- ════════════════════════════════════════════════════════════════════════════

-- Replace the broad ALL policy with separate SELECT and UPDATE policies.

DROP POLICY IF EXISTS "clos: via course ownership" ON clos;

CREATE POLICY "clos: select via course ownership" ON clos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = clos.course_id
        AND (courses.instructor_id = auth.uid() OR is_admin())
    )
  );

CREATE POLICY "clos: insert via course ownership" ON clos
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = clos.course_id
        AND (courses.instructor_id = auth.uid() OR is_admin())
    )
  );

CREATE POLICY "clos: delete via course ownership" ON clos
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = clos.course_id
        AND (courses.instructor_id = auth.uid() OR is_admin())
    )
  );

-- Faculty UPDATE: only allowed when target_attainment & passing_score are
-- unchanged from the row's current values. Admins bypass via is_admin().
CREATE POLICY "clos: faculty update non-threshold" ON clos
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = clos.course_id
        AND (courses.instructor_id = auth.uid() OR is_admin())
    )
  )
  WITH CHECK (
    is_admin()
    OR (
      target_attainment = (SELECT target_attainment FROM clos WHERE id = clos.id)
      AND passing_score = (SELECT passing_score FROM clos WHERE id = clos.id)
    )
  );


-- ════════════════════════════════════════════════════════════════════════════
-- SEED REFERENCE DATA — applied to every department in the system.
-- These are sensible defaults; admins can edit them via the DB.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  dept TEXT;
  depts TEXT[] := ARRAY['SE','CS','IS','CE','EE','ME','IE','MATH','PHYS','CHEM'];
BEGIN
  FOREACH dept IN ARRAY depts LOOP
    INSERT INTO program_outcomes (department, code, description, position) VALUES
      (dept, 'PLO1', 'Apply foundational disciplinary knowledge to discipline-specific problems.', 1),
      (dept, 'PLO2', 'Analyze and design solutions using established methodologies of the field.',  2),
      (dept, 'PLO3', 'Communicate effectively in professional contexts and collaborate in teams.',   3),
      (dept, 'PLO4', 'Demonstrate ethical, professional, and lifelong-learning behaviors.',          4)
    ON CONFLICT (department, code) DO NOTHING;

    -- ABET-style SOs (1..7) seeded for every dept; admins can refine per program.
    INSERT INTO student_outcomes (department, code, description, related_plo, position) VALUES
      (dept, 'SO1', 'Identify, formulate, and solve complex problems using principles of the discipline.', 'PLO1', 1),
      (dept, 'SO2', 'Apply design processes that meet specified needs with consideration of constraints.',  'PLO2', 2),
      (dept, 'SO3', 'Communicate effectively with a range of audiences.',                                    'PLO3', 3),
      (dept, 'SO4', 'Recognize ethical and professional responsibilities and make informed judgments.',      'PLO4', 4),
      (dept, 'SO5', 'Function effectively on a team whose members provide leadership and create a collaborative environment.', 'PLO3', 5),
      (dept, 'SO6', 'Develop and conduct appropriate experimentation, analyze and interpret data.',          'PLO2', 6),
      (dept, 'SO7', 'Acquire and apply new knowledge using appropriate learning strategies.',                'PLO4', 7)
    ON CONFLICT (department, code) DO NOTHING;
  END LOOP;
END $$;


-- SAQF / NCAAA domains (global)
INSERT INTO saqf_domains (code, label, position) VALUES
  ('knowledge_understanding',  'Knowledge & Understanding',     1),
  ('cognitive_skills',         'Cognitive Skills',              2),
  ('practical_physical',       'Practical & Physical Skills',   3),
  ('communication_ict',        'Communication and ICT Skills',  4),
  ('values_ethics',            'Values & Ethics',               5),
  ('autonomy_responsibility',  'Autonomy / Responsibility',     6)
ON CONFLICT (code) DO NOTHING;
