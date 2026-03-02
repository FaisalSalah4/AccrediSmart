/**
 * AccrediSmart — Supabase API layer
 *
 * All functions return { data } (or throw) so existing component code
 * using .then(r => r.data) continues to work unchanged.
 */

import { supabase } from './lib/supabase'

// ── helpers ───────────────────────────────────────────────────────────────────

/** Throw a readable error from a Supabase { error } response */
function raise(error) {
  throw { response: { data: { detail: error.message } } }
}

/** Return the currently authenticated user's UUID */
async function uid() {
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id
}

async function myProfile() {
  const id = await uid()
  const { data } = await supabase.from('profiles').select('role').eq('id', id).single()
  return data
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export const getDashboardStats = async () => {
  const id      = await uid()
  const profile = await myProfile()

  let query = supabase.from('courses').select('id')
  if (profile?.role !== 'admin') query = query.eq('instructor_id', id)
  const { data: courses, error } = await query
  if (error) raise(error)

  const courseIds = courses.map(c => c.id)

  if (courseIds.length === 0) {
    return { data: { total_courses: 0, total_documents: 0, total_clos: 0, total_students: 0 } }
  }

  const [docsRes, closRes, studentsRes] = await Promise.all([
    supabase.from('documents').select('*', { count: 'exact', head: true }).in('course_id', courseIds),
    supabase.from('clos').select('*',      { count: 'exact', head: true }).in('course_id', courseIds),
    supabase.from('students').select('*',  { count: 'exact', head: true }).in('course_id', courseIds),
  ])

  return {
    data: {
      total_courses:   courseIds.length,
      total_documents: docsRes.count    ?? 0,
      total_clos:      closRes.count    ?? 0,
      total_students:  studentsRes.count ?? 0,
    }
  }
}

// ── Courses ───────────────────────────────────────────────────────────────────

export const getCourses = async () => {
  const id      = await uid()
  const profile = await myProfile()

  let query = supabase.from('courses').select('*').order('created_at', { ascending: false })
  if (profile?.role !== 'admin') query = query.eq('instructor_id', id)

  const { data, error } = await query
  if (error) raise(error)
  return { data }
}

export const getCourse = async (courseId) => {
  const { data, error } = await supabase
    .from('courses').select('*').eq('id', courseId).single()
  if (error) raise(error)
  return { data }
}

export const createCourse = async (courseData) => {
  const id = await uid()
  const { data, error } = await supabase
    .from('courses')
    .insert({ ...courseData, instructor_id: id })
    .select().single()
  if (error) raise(error)
  return { data }
}

export const updateCourse = async (courseId, courseData) => {
  const { data, error } = await supabase
    .from('courses').update(courseData).eq('id', courseId).select().single()
  if (error) raise(error)
  return { data }
}

export const deleteCourse = async (courseId) => {
  const { error } = await supabase.from('courses').delete().eq('id', courseId)
  if (error) raise(error)
  return { data: { message: 'Course deleted' } }
}

// ── Documents ─────────────────────────────────────────────────────────────────

export const getDocuments = async (courseId) => {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('course_id', courseId)
    .order('uploaded_at', { ascending: false })
  if (error) raise(error)
  return { data }
}

export const uploadDocument = async (courseId, file, documentType, description) => {
  const ext      = file.name.split('.').pop().toLowerCase()
  const filePath = `${courseId}/${crypto.randomUUID()}.${ext}`

  // 1. Upload file to Supabase Storage
  const { error: storageError } = await supabase.storage
    .from('evidence-files')
    .upload(filePath, file)
  if (storageError) raise(storageError)

  // 2. Insert document metadata into DB
  const currentUid = await uid()
  const { data, error } = await supabase
    .from('documents')
    .insert({
      filename:      filePath,
      original_name: file.name,
      file_type:     ext,
      file_size:     file.size,
      document_type: documentType,
      description:   description || null,
      course_id:     courseId,
      uploaded_by:   currentUid,
    })
    .select().single()
  if (error) raise(error)
  return { data }
}

/** Returns a temporary signed download URL (1-hour expiry) */
export const getDocumentUrl = async (filename) => {
  const { data, error } = await supabase.storage
    .from('evidence-files')
    .createSignedUrl(filename, 3600)
  if (error) raise(error)
  return data.signedUrl
}

export const deleteDocument = async (docId) => {
  const { data: doc, error: fetchErr } = await supabase
    .from('documents').select('filename').eq('id', docId).single()
  if (fetchErr) raise(fetchErr)

  await supabase.storage.from('evidence-files').remove([doc.filename])

  const { error } = await supabase.from('documents').delete().eq('id', docId)
  if (error) raise(error)
  return { data: { message: 'Document deleted' } }
}

// ── CLOs ──────────────────────────────────────────────────────────────────────

export const getCLOs = async (courseId) => {
  const { data, error } = await supabase
    .from('clos').select('*').eq('course_id', courseId)
  if (error) raise(error)
  return { data }
}

export const createCLO = async (courseId, cloData) => {
  const { data, error } = await supabase
    .from('clos').insert({ ...cloData, course_id: courseId }).select().single()
  if (error) raise(error)
  return { data }
}

export const updateCLO = async (cloId, cloData) => {
  const { data, error } = await supabase
    .from('clos').update(cloData).eq('id', cloId).select().single()
  if (error) raise(error)
  return { data }
}

export const deleteCLO = async (cloId) => {
  const { error } = await supabase.from('clos').delete().eq('id', cloId)
  if (error) raise(error)
  return { data: { message: 'CLO deleted' } }
}

// ── Students ──────────────────────────────────────────────────────────────────

export const getStudents = async (courseId) => {
  const { data, error } = await supabase
    .from('students').select('*').eq('course_id', courseId)
  if (error) raise(error)
  return { data }
}

export const addStudent = async (courseId, studentData) => {
  const { data, error } = await supabase
    .from('students').insert({ ...studentData, course_id: courseId }).select().single()
  if (error) raise(error)
  return { data }
}

export const bulkAddStudents = async (courseId, students) => {
  const rows = students.map(s => ({ ...s, course_id: courseId }))
  const { error } = await supabase.from('students').insert(rows)
  if (error) raise(error)
  return { data: { message: `Added ${students.length} students` } }
}

export const deleteStudent = async (studentId) => {
  const { error } = await supabase.from('students').delete().eq('id', studentId)
  if (error) raise(error)
  return { data: { message: 'Student deleted' } }
}

// ── Grades ────────────────────────────────────────────────────────────────────
// Key format: `${studentId}|${cloId}`  (pipe — safe separator for UUIDs)

export const getGrades = async (courseId) => {
  const [studentsRes, closRes] = await Promise.all([
    supabase.from('students').select('*').eq('course_id', courseId),
    supabase.from('clos').select('id, code, passing_score').eq('course_id', courseId),
  ])

  const students   = studentsRes.data || []
  const clos       = closRes.data     || []
  const studentIds = students.map(s => s.id)

  let grades = {}
  if (studentIds.length > 0) {
    const { data: records } = await supabase
      .from('grade_records').select('*').in('student_id', studentIds)
    for (const g of (records || [])) {
      grades[`${g.student_id}|${g.clo_id}`] = { score: g.score, max_score: g.max_score }
    }
  }

  return {
    data: {
      students: students.map(s => ({ id: s.id, student_id: s.student_id, name: s.name })),
      clos:     clos.map(c => ({ id: c.id, code: c.code, passing_score: c.passing_score })),
      grades,
    }
  }
}

export const saveGrades = async (_courseId, gradeList) => {
  const records = gradeList.map(g => ({
    student_id: g.student_id,
    clo_id:     g.clo_id,
    score:      g.score,
    max_score:  g.max_score,
  }))
  const { error } = await supabase
    .from('grade_records')
    .upsert(records, { onConflict: 'student_id,clo_id' })
  if (error) raise(error)
  return { data: { message: `Saved ${gradeList.length} grade records` } }
}

// ── Attainment Calculation (client-side, no backend needed) ──────────────────

export const calculateAttainment = async (courseId) => {
  const [courseRes, closRes, studentsRes] = await Promise.all([
    supabase.from('courses').select('*').eq('id', courseId).single(),
    supabase.from('clos').select('*').eq('course_id', courseId),
    supabase.from('students').select('id').eq('course_id', courseId),
  ])

  const course        = courseRes.data
  const clos          = closRes.data    || []
  const students      = studentsRes.data || []
  const totalStudents = students.length

  if (!course)              raise({ message: 'Course not found' })
  if (totalStudents === 0)  raise({ message: 'No students enrolled in this course' })
  if (clos.length === 0)    raise({ message: 'No CLOs defined for this course' })

  const studentIds = students.map(s => s.id)
  const { data: allGrades } = await supabase
    .from('grade_records').select('*').in('student_id', studentIds)

  const cloResults  = []
  const domainStats = {}

  for (const clo of clos) {
    const grades          = (allGrades || []).filter(g => g.clo_id === clo.id)
    const studentsPassing = grades.filter(g => (g.score / g.max_score * 100) >= clo.passing_score).length
    const attainment      = (studentsPassing / totalStudents) * 100
    const avgScore        = grades.length > 0
      ? grades.reduce((sum, g) => sum + (g.score / g.max_score * 100), 0) / grades.length
      : 0

    const result = {
      clo_id:                clo.id,
      clo_code:              clo.code,
      description:           clo.description,
      ncaaa_domain:          clo.ncaaa_domain,
      bloom_level:           clo.bloom_level,
      target_attainment:     clo.target_attainment,
      passing_score:         clo.passing_score,
      total_students:        totalStudents,
      students_passing:      studentsPassing,
      attainment_percentage: Math.round(attainment * 100) / 100,
      status:                attainment >= clo.target_attainment ? 'Met' : 'Not Met',
      average_score:         Math.round(avgScore * 100) / 100,
    }
    cloResults.push(result)

    const d = clo.ncaaa_domain
    if (!domainStats[d]) domainStats[d] = { met: 0, total: 0, attainments: [] }
    domainStats[d].total++
    domainStats[d].attainments.push(attainment)
    if (result.status === 'Met') domainStats[d].met++
  }

  const domainSummary = {}
  for (const [d, s] of Object.entries(domainStats)) {
    domainSummary[d] = {
      met:               s.met,
      total:             s.total,
      average_attainment: Math.round(
        (s.attainments.reduce((a, b) => a + b, 0) / s.attainments.length) * 100
      ) / 100,
    }
  }

  const overall = cloResults.reduce((sum, r) => sum + r.attainment_percentage, 0) / cloResults.length

  return {
    data: {
      course_id:            course.id,
      course_code:          course.code,
      course_name:          course.name,
      total_students:       totalStudents,
      clo_results:          cloResults,
      overall_attainment:   Math.round(overall * 100) / 100,
      ncaaa_domain_summary: domainSummary,
    }
  }
}
