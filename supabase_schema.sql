-- ============================================================
-- AccrediSmart — Supabase Schema
-- Run this entire file in your Supabase SQL Editor
-- Dashboard → SQL Editor → New Query → Paste → Run
-- ============================================================


-- ── 1. PROFILES (extends Supabase Auth users) ──────────────────────────────

CREATE TABLE IF NOT EXISTS profiles (
  id          UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  name        TEXT NOT NULL DEFAULT '',
  role        TEXT NOT NULL DEFAULT 'faculty',   -- faculty | admin | reviewer
  department  TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create a profile row whenever a new user registers
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, name, role, department)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name',       'User'),
    COALESCE(NEW.raw_user_meta_data->>'role',       'faculty'),
    COALESCE(NEW.raw_user_meta_data->>'department', '')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ── 2. COURSES ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS courses (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code          TEXT NOT NULL,
  name          TEXT NOT NULL,
  credit_hours  INTEGER NOT NULL DEFAULT 3,
  department    TEXT NOT NULL DEFAULT '',
  semester      TEXT NOT NULL DEFAULT 'Fall',   -- Fall | Spring | Summer
  year          INTEGER NOT NULL,
  description   TEXT,
  instructor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);


-- ── 3. DOCUMENTS (Evidence Storage) ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS documents (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  filename      TEXT NOT NULL,          -- path in Supabase Storage bucket
  original_name TEXT NOT NULL,
  file_type     TEXT NOT NULL,          -- pdf | docx | doc | xlsx | xls
  file_size     INTEGER NOT NULL,       -- bytes
  document_type TEXT NOT NULL DEFAULT 'other',  -- syllabus | assessment_report | grade_sheet | student_work | other
  description   TEXT,
  course_id     UUID REFERENCES courses(id)  ON DELETE CASCADE NOT NULL,
  uploaded_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  uploaded_at   TIMESTAMPTZ DEFAULT NOW()
);


-- ── 4. CLOs (Course Learning Outcomes) ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS clos (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code               TEXT NOT NULL,          -- CLO1, CLO2, …
  description        TEXT NOT NULL,
  ncaaa_domain       TEXT NOT NULL,
  bloom_level        TEXT NOT NULL,
  target_attainment  FLOAT NOT NULL DEFAULT 70.0,  -- % of students expected to pass
  passing_score      FLOAT NOT NULL DEFAULT 60.0,  -- min % score to "pass" this CLO
  plo_mapping        TEXT,
  so_mapping         TEXT,
  course_id          UUID REFERENCES courses(id) ON DELETE CASCADE NOT NULL
);


-- ── 5. STUDENTS ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS students (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id  TEXT NOT NULL,    -- university ID number (e.g. S001)
  name        TEXT NOT NULL,
  course_id   UUID REFERENCES courses(id) ON DELETE CASCADE NOT NULL
);


-- ── 6. GRADE RECORDS ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS grade_records (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id  UUID REFERENCES students(id)  ON DELETE CASCADE NOT NULL,
  clo_id      UUID REFERENCES clos(id)      ON DELETE CASCADE NOT NULL,
  score       FLOAT NOT NULL,
  max_score   FLOAT NOT NULL DEFAULT 100.0,
  UNIQUE (student_id, clo_id)   -- one grade per student per CLO
);


-- ════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- Each user can only access data belonging to their own courses.
-- Admins can access everything.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses       ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents     ENABLE ROW LEVEL SECURITY;
ALTER TABLE clos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE students      ENABLE ROW LEVEL SECURITY;
ALTER TABLE grade_records ENABLE ROW LEVEL SECURITY;


-- Helper: is the current user an admin?
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;


-- ── Profiles ─────────────────────────────────────────────────────────────────

CREATE POLICY "profiles: own row" ON profiles
  FOR ALL USING (auth.uid() = id OR is_admin());


-- ── Courses ───────────────────────────────────────────────────────────────────

CREATE POLICY "courses: own or admin" ON courses
  FOR ALL USING (instructor_id = auth.uid() OR is_admin());


-- ── Documents ─────────────────────────────────────────────────────────────────

CREATE POLICY "documents: via course ownership" ON documents
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = documents.course_id
        AND (courses.instructor_id = auth.uid() OR is_admin())
    )
  );


-- ── CLOs ──────────────────────────────────────────────────────────────────────

CREATE POLICY "clos: via course ownership" ON clos
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = clos.course_id
        AND (courses.instructor_id = auth.uid() OR is_admin())
    )
  );


-- ── Students ──────────────────────────────────────────────────────────────────

CREATE POLICY "students: via course ownership" ON students
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = students.course_id
        AND (courses.instructor_id = auth.uid() OR is_admin())
    )
  );


-- ── Grade Records ─────────────────────────────────────────────────────────────

CREATE POLICY "grade_records: via course ownership" ON grade_records
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM students
      JOIN courses ON courses.id = students.course_id
      WHERE students.id = grade_records.student_id
        AND (courses.instructor_id = auth.uid() OR is_admin())
    )
  );


-- ════════════════════════════════════════════════════════════════════════════
-- STORAGE BUCKET
-- Run this after creating the bucket named "evidence-files" in your
-- Supabase Dashboard → Storage → New Bucket (public OFF, name: evidence-files)
-- ════════════════════════════════════════════════════════════════════════════

-- Allow authenticated users to upload/read/delete files
INSERT INTO storage.buckets (id, name, public)
VALUES ('evidence-files', 'evidence-files', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "storage: authenticated upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'evidence-files');

CREATE POLICY "storage: authenticated read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'evidence-files');

CREATE POLICY "storage: authenticated delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'evidence-files');
