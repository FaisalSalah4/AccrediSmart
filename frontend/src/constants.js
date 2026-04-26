// ── Departments ───────────────────────────────────────────────────────────────
export const DEPARTMENTS = ['SE', 'CS', 'IS', 'CE', 'EE', 'ME', 'IE', 'MATH', 'PHYS', 'CHEM']

// ── Assessment types (FCAR workflow) ─────────────────────────────────────────
export const ASSESSMENT_TYPES = [
  'Quiz',
  'Assignment',
  'Midterm',
  'Final Exam',
  'Project',
  'Lab',
  'Presentation',
]

// ── Evidence file categories (UG Course Portfolio template) ───────────────────
export const EVIDENCE_TYPES = [
  { value: 'course_specification', label: 'Course Specification'                      },
  { value: 'course_syllabus',      label: 'Course Syllabus'                           },
  { value: 'course_reports',       label: 'Course Reports'                            },
  { value: 'teaching_materials',   label: 'Copies of Teaching Materials'              },
  { value: 'attendance_records',   label: "Students' Attendance Records"              },
  { value: 'graded_work',          label: "Samples of Students' Graded Work"          },
  { value: 'answer_keys',          label: "Exams' Answer Keys or Assessment Rubrics"  },
  { value: 'clo_assessment',       label: 'Course Learning Outcomes Assessment'       },
  { value: 'grades_distribution',  label: 'Grades and Grade Distribution'             },
]

// ── Pre-populated CLOs by department ─────────────────────────────────────────
// SE department gets its own standard set; all other departments use DEFAULT.
// Faculty may only adjust target_attainment (60–90) and passing_score (50–80).

export const DEPT_CLOS = {
  SE: [
    {
      code: 'CLO1',
      description: 'Analyze and design software systems using appropriate methodologies',
      ncaaa_domain: 'Cognitive Skills',
      bloom_level: 'Analyze',
      target_attainment: 75,
      passing_score: 60,
      plo_mapping: 'PLO1',
      so_mapping: 'SO1',
    },
    {
      code: 'CLO2',
      description: 'Implement software solutions using industry-standard practices',
      ncaaa_domain: 'Knowledge',
      bloom_level: 'Apply',
      target_attainment: 70,
      passing_score: 60,
      plo_mapping: 'PLO2',
      so_mapping: 'SO2',
    },
    {
      code: 'CLO3',
      description: 'Evaluate software quality and performance metrics',
      ncaaa_domain: 'Cognitive Skills',
      bloom_level: 'Evaluate',
      target_attainment: 70,
      passing_score: 60,
      plo_mapping: 'PLO2',
      so_mapping: 'SO3',
    },
    {
      code: 'CLO4',
      description: 'Communicate technical concepts effectively to diverse audiences',
      ncaaa_domain: 'Communication, IT & Numerical Skills',
      bloom_level: 'Apply',
      target_attainment: 75,
      passing_score: 60,
      plo_mapping: 'PLO3',
      so_mapping: 'SO4',
    },
    {
      code: 'CLO5',
      description: 'Collaborate effectively in team-based software development',
      ncaaa_domain: 'Interpersonal Skills & Responsibility',
      bloom_level: 'Apply',
      target_attainment: 80,
      passing_score: 60,
      plo_mapping: 'PLO4',
      so_mapping: 'SO5',
    },
  ],

  DEFAULT: [
    {
      code: 'CLO1',
      description: 'Demonstrate foundational knowledge of core concepts in the discipline',
      ncaaa_domain: 'Knowledge',
      bloom_level: 'Remember',
      target_attainment: 70,
      passing_score: 60,
      plo_mapping: 'PLO1',
      so_mapping: 'SO1',
    },
    {
      code: 'CLO2',
      description: 'Apply theoretical principles to solve practical problems in the field',
      ncaaa_domain: 'Cognitive Skills',
      bloom_level: 'Apply',
      target_attainment: 70,
      passing_score: 60,
      plo_mapping: 'PLO2',
      so_mapping: 'SO2',
    },
    {
      code: 'CLO3',
      description: 'Analyze and evaluate outcomes using appropriate domain methodologies',
      ncaaa_domain: 'Cognitive Skills',
      bloom_level: 'Analyze',
      target_attainment: 70,
      passing_score: 60,
      plo_mapping: 'PLO2',
      so_mapping: 'SO3',
    },
    {
      code: 'CLO4',
      description: 'Communicate findings and solutions effectively in written and oral formats',
      ncaaa_domain: 'Communication, IT & Numerical Skills',
      bloom_level: 'Apply',
      target_attainment: 70,
      passing_score: 60,
      plo_mapping: 'PLO3',
      so_mapping: 'SO4',
    },
    {
      code: 'CLO5',
      description: 'Work responsibly and ethically in collaborative and individual professional settings',
      ncaaa_domain: 'Interpersonal Skills & Responsibility',
      bloom_level: 'Apply',
      target_attainment: 70,
      passing_score: 60,
      plo_mapping: 'PLO4',
      so_mapping: 'SO5',
    },
  ],
}
