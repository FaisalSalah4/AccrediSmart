-- ============================================================
-- AccrediSmart — Seed Data
-- Dashboard → SQL Editor → New Query → Paste → Run
--
-- PREREQUISITE: Register at least one account in the app first.
-- That user becomes the instructor_id for all seeded courses.
-- ============================================================

DO $$
DECLARE
  v_instructor_id  UUID;
  v_cs101_id       UUID;
  v_cs201_id       UUID;
  v_math101_id     UUID;
BEGIN

  -- ── Grab first registered user ────────────────────────────
  SELECT id INTO v_instructor_id FROM profiles LIMIT 1;

  IF v_instructor_id IS NULL THEN
    RAISE EXCEPTION
      'No users found. Create an account in the app first, then re-run this script.';
  END IF;

  RAISE NOTICE 'Seeding as instructor: %', v_instructor_id;


  -- ══════════════════════════════════════════════════════════
  -- COURSES
  -- ══════════════════════════════════════════════════════════

  INSERT INTO courses (code, name, credit_hours, department, semester, year, description, instructor_id)
  VALUES (
    'CS101', 'Introduction to Computer Science', 3,
    'Computer Science', 'Fall', 2025,
    'Fundamental concepts of computing, algorithms, and problem solving.',
    v_instructor_id
  )
  RETURNING id INTO v_cs101_id;

  INSERT INTO courses (code, name, credit_hours, department, semester, year, description, instructor_id)
  VALUES (
    'CS201', 'Data Structures', 3,
    'Computer Science', 'Spring', 2025,
    'Arrays, linked lists, trees, graphs, and algorithm complexity analysis.',
    v_instructor_id
  )
  RETURNING id INTO v_cs201_id;

  INSERT INTO courses (code, name, credit_hours, department, semester, year, description, instructor_id)
  VALUES (
    'MATH101', 'Calculus I', 3,
    'Mathematics', 'Fall', 2025,
    'Limits, derivatives, and integrals with real-world applications.',
    v_instructor_id
  )
  RETURNING id INTO v_math101_id;


  -- ══════════════════════════════════════════════════════════
  -- CLOs — CS101: Introduction to Computer Science
  -- ══════════════════════════════════════════════════════════

  INSERT INTO clos (code, description, ncaaa_domain, bloom_level, target_attainment, passing_score, plo_mapping, so_mapping, course_id)
  VALUES
    (
      'CLO1',
      'Define fundamental computing concepts including hardware components, software layers, and binary data representation.',
      'Knowledge', 'Remember', 70, 60, 'PLO1', 'SO1',
      v_cs101_id
    ),
    (
      'CLO2',
      'Explain algorithmic problem-solving strategies and trace the execution of basic algorithms step by step.',
      'Cognitive Skills', 'Understand', 70, 60, 'PLO2', 'SO2',
      v_cs101_id
    ),
    (
      'CLO3',
      'Write correct programs using a high-level programming language to solve well-defined computational problems.',
      'Cognitive Skills', 'Apply', 70, 60, 'PLO2', 'SO3',
      v_cs101_id
    ),
    (
      'CLO4',
      'Collaborate effectively in team-based programming exercises, demonstrating responsibility and peer support.',
      'Interpersonal Skills & Responsibility', 'Apply', 65, 60, 'PLO3', 'SO5',
      v_cs101_id
    ),
    (
      'CLO5',
      'Communicate technical solutions clearly through structured written lab reports and code documentation.',
      'Communication, IT & Numerical Skills', 'Understand', 65, 60, 'PLO4', 'SO6',
      v_cs101_id
    );


  -- ══════════════════════════════════════════════════════════
  -- CLOs — CS201: Data Structures
  -- ══════════════════════════════════════════════════════════

  INSERT INTO clos (code, description, ncaaa_domain, bloom_level, target_attainment, passing_score, plo_mapping, so_mapping, course_id)
  VALUES
    (
      'CLO1',
      'Identify and describe core data structures: arrays, stacks, queues, linked lists, trees, and graphs.',
      'Knowledge', 'Remember', 70, 60, 'PLO1', 'SO1',
      v_cs201_id
    ),
    (
      'CLO2',
      'Analyze the time and space complexity of standard algorithms using Big-O notation.',
      'Cognitive Skills', 'Analyze', 70, 60, 'PLO2', 'SO2',
      v_cs201_id
    ),
    (
      'CLO3',
      'Implement tree and graph data structures and their traversal algorithms (BFS, DFS, in-order, etc.) in code.',
      'Cognitive Skills', 'Apply', 70, 60, 'PLO2', 'SO3',
      v_cs201_id
    ),
    (
      'CLO4',
      'Evaluate and select the most appropriate data structure for a given computational problem, justifying the choice.',
      'Cognitive Skills', 'Evaluate', 65, 60, 'PLO2', 'SO4',
      v_cs201_id
    ),
    (
      'CLO5',
      'Produce clear technical documentation and present algorithm designs to peers using appropriate terminology.',
      'Communication, IT & Numerical Skills', 'Create', 65, 60, 'PLO4', 'SO6',
      v_cs201_id
    ),
    (
      'CLO6',
      'Design a new abstract data type or algorithm to address a novel problem, with correctness justification.',
      'Cognitive Skills', 'Create', 60, 55, 'PLO2', 'SO4',
      v_cs201_id
    );


  -- ══════════════════════════════════════════════════════════
  -- CLOs — MATH101: Calculus I
  -- ══════════════════════════════════════════════════════════

  INSERT INTO clos (code, description, ncaaa_domain, bloom_level, target_attainment, passing_score, plo_mapping, so_mapping, course_id)
  VALUES
    (
      'CLO1',
      'State the formal definitions of limits, continuity, derivatives, and definite integrals.',
      'Knowledge', 'Remember', 70, 60, 'PLO1', 'SO1',
      v_math101_id
    ),
    (
      'CLO2',
      'Explain the relationship between differentiation and integration through the Fundamental Theorem of Calculus.',
      'Cognitive Skills', 'Understand', 70, 60, 'PLO2', 'SO2',
      v_math101_id
    ),
    (
      'CLO3',
      'Apply standard differentiation and integration techniques (chain rule, substitution, parts) to solve problems.',
      'Cognitive Skills', 'Apply', 70, 60, 'PLO2', 'SO3',
      v_math101_id
    ),
    (
      'CLO4',
      'Analyze real-world problems from physics and engineering using calculus models and interpret the results.',
      'Cognitive Skills', 'Analyze', 65, 60, 'PLO2', 'SO4',
      v_math101_id
    ),
    (
      'CLO5',
      'Present mathematical proofs and solutions with clear, structured reasoning and correct notation.',
      'Communication, IT & Numerical Skills', 'Apply', 65, 60, 'PLO4', 'SO6',
      v_math101_id
    );


  RAISE NOTICE 'Seed complete. Courses: CS101 (%), CS201 (%), MATH101 (%)',
    v_cs101_id, v_cs201_id, v_math101_id;

END $$;
