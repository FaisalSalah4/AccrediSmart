/**
 * AccrediSmart — Supabase API layer
 *
 * All functions return { data } (or throw) so component code
 * using .then(r => r.data) continues to work unchanged.
 */

import { supabase } from './lib/supabase'
import { DEPT_CLOS } from './constants'

// ── helpers ───────────────────────────────────────────────────────────────────

function raise(error) {
  throw { response: { data: { detail: error.message } } }
}

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
    return { data: { total_courses: 0, total_documents: 0, total_clos: 0 } }
  }

  const [docsRes, closRes] = await Promise.all([
    supabase.from('documents').select('*', { count: 'exact', head: true }).in('course_id', courseIds),
    supabase.from('clos').select('*',      { count: 'exact', head: true }).in('course_id', courseIds),
  ])

  return {
    data: {
      total_courses:   courseIds.length,
      total_documents: docsRes.count ?? 0,
      total_clos:      closRes.count ?? 0,
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

  // Auto-populate CLOs based on department
  const template = DEPT_CLOS[courseData.department] || DEPT_CLOS.DEFAULT
  const cloRows  = template.map(c => ({ ...c, course_id: data.id }))
  const { error: cloErr } = await supabase.from('clos').insert(cloRows)
  if (cloErr) raise(cloErr)

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

/** Upload path: {courseId}/{evidenceType}/{uuid}.{ext} */
export const uploadDocument = async (courseId, file, documentType, description) => {
  const ext      = file.name.split('.').pop().toLowerCase()
  const filePath = `${courseId}/${documentType}/${crypto.randomUUID()}.${ext}`

  const { error: storageError } = await supabase.storage
    .from('evidence-files')
    .upload(filePath, file)
  if (storageError) raise(storageError)

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
    .from('clos').select('*').eq('course_id', courseId).order('code')
  if (error) raise(error)
  return { data }
}

/**
 * Update a CLO. target_attainment and passing_score are admin-only — we
 * check the current user's profile role and raise a friendly error if a
 * non-admin tries to change those fields. Defense-in-depth is provided by
 * an RLS WITH CHECK policy in supabase_fcar_v2_schema.sql.
 */
export const updateCLO = async (cloId, cloData) => {
  const wantsThresholdChange =
    cloData.target_attainment !== undefined || cloData.passing_score !== undefined
  if (wantsThresholdChange) {
    const profile = await myProfile()
    if (profile?.role !== 'admin') {
      raise({ message: 'Only an administrator can change Target Attainment or Passing Score.' })
    }
  }
  const { data, error } = await supabase
    .from('clos').update(cloData).eq('id', cloId).select().single()
  if (error) raise(error)
  return { data }
}

// ════════════════════════════════════════════════════════════════════════════
// FCAR v2 — DB-driven PLO / SO / SAQF reference + per-course rec & attainment
// (Tables defined in supabase_fcar_v2_schema.sql)
// ════════════════════════════════════════════════════════════════════════════

export const getProgramOutcomes = async (department) => {
  const { data, error } = await supabase
    .from('program_outcomes').select('*').eq('department', department).order('position')
  if (error) raise(error)
  return { data }
}

export const getStudentOutcomes = async (department) => {
  const { data, error } = await supabase
    .from('student_outcomes').select('*').eq('department', department).order('position')
  if (error) raise(error)
  return { data }
}

export const getSAQFDomains = async () => {
  const { data, error } = await supabase
    .from('saqf_domains').select('*').order('position')
  if (error) raise(error)
  return { data }
}

// ── CLO Recommendations ─────────────────────────────────────────────────────

export const getCloRecommendations = async (courseId) => {
  const { data, error } = await supabase
    .from('clo_recommendations').select('*').eq('course_id', courseId)
  if (error) raise(error)
  // Return as a map keyed by clo_id for convenience
  const byClo = {}
  for (const r of (data || [])) byClo[r.clo_id] = r
  return { data: byClo }
}

export const upsertCloRecommendation = async (courseId, cloId, payload) => {
  const id = await uid()
  const row = {
    course_id:   courseId,
    clo_id:      cloId,
    auto_text:   payload.auto_text   ?? null,
    manual_text: payload.manual_text ?? null,
    updated_by:  id,
    updated_at:  new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('clo_recommendations')
    .upsert(row, { onConflict: 'course_id,clo_id' })
    .select().single()
  if (error) raise(error)
  return { data }
}

// ── ABET SO Attainments (qualitative reasons + improvement action) ──────────

export const getSOAttainments = async (courseId) => {
  const { data, error } = await supabase
    .from('so_attainments').select('*').eq('course_id', courseId)
  if (error) raise(error)
  const byCode = {}
  for (const r of (data || [])) byCode[r.so_code] = r
  return { data: byCode }
}

export const upsertSOAttainment = async (courseId, soCode, payload) => {
  const id = await uid()
  const row = {
    course_id:          courseId,
    so_code:            soCode,
    reasons:            payload.reasons            ?? null,
    improvement_action: payload.improvement_action ?? null,
    updated_by:         id,
    updated_at:         new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('so_attainments')
    .upsert(row, { onConflict: 'course_id,so_code' })
    .select().single()
  if (error) raise(error)
  return { data }
}

// ── SAQF / NCAAA Attainments ────────────────────────────────────────────────

export const getSAQFAttainments = async (courseId) => {
  const { data, error } = await supabase
    .from('saqf_attainments').select('*').eq('course_id', courseId)
  if (error) raise(error)
  const byCode = {}
  for (const r of (data || [])) byCode[r.domain_code] = r
  return { data: byCode }
}

export const upsertSAQFAttainment = async (courseId, domainCode, payload) => {
  const id = await uid()
  const row = {
    course_id:          courseId,
    domain_code:        domainCode,
    reasons:            payload.reasons            ?? null,
    improvement_action: payload.improvement_action ?? null,
    updated_by:         id,
    updated_at:         new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('saqf_attainments')
    .upsert(row, { onConflict: 'course_id,domain_code' })
    .select().single()
  if (error) raise(error)
  return { data }
}

// ════════════════════════════════════════════════════════════════════════════
// FCAR WORKFLOW — Assessments, Items, Mapping, Students, Item Grades
// (Tables defined in supabase_assessments_schema.sql)
// ════════════════════════════════════════════════════════════════════════════

// ── Students ─────────────────────────────────────────────────────────────────

export const getStudents = async (courseId) => {
  const { data, error } = await supabase
    .from('students').select('*').eq('course_id', courseId).order('student_id')
  if (error) raise(error)
  return { data }
}

export const addStudent = async (courseId, studentData) => {
  const { data, error } = await supabase
    .from('students')
    .insert({ ...studentData, course_id: courseId })
    .select().single()
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

// ── Assessments ──────────────────────────────────────────────────────────────

export const getAssessments = async (courseId) => {
  const { data, error } = await supabase
    .from('assessments').select('*').eq('course_id', courseId).order('created_at')
  if (error) raise(error)
  return { data }
}

// ── Numeric guards (server-side defense matching the UI rules) ─────────────
const MAX_TOTAL_MARK = 1000   // cap on assessment.total_mark
const MAX_WEIGHT     = 100    // course weight is a percentage

function validateMark(label, raw, max, { allowZero = true } = {}) {
  const n = Number(raw)
  if (!Number.isFinite(n)) raise({ message: `${label} must be a number.` })
  if (n < 0)               raise({ message: `${label} cannot be negative.` })
  if (!allowZero && n === 0) raise({ message: `${label} must be greater than 0.` })
  if (n > max)             raise({ message: `${label} (${n}) exceeds the allowed maximum of ${max}.` })
  return n
}

export const createAssessment = async (courseId, payload) => {
  const weight    = validateMark('Course weight %', payload.weight,     MAX_WEIGHT)
  const totalMark = validateMark('Assessment total mark', payload.total_mark, MAX_TOTAL_MARK)
  const { data, error } = await supabase
    .from('assessments')
    .insert({
      course_id:  courseId,
      name:       payload.name,
      type:       payload.type,
      weight,
      total_mark: totalMark,
    })
    .select().single()
  if (error) raise(error)
  return { data }
}

export const updateAssessment = async (assessmentId, payload) => {
  const weight    = validateMark('Course weight %', payload.weight,     MAX_WEIGHT)
  const totalMark = validateMark('Assessment total mark', payload.total_mark, MAX_TOTAL_MARK)
  const { data, error } = await supabase
    .from('assessments')
    .update({
      name:       payload.name,
      type:       payload.type,
      weight,
      total_mark: totalMark,
    })
    .eq('id', assessmentId)
    .select().single()
  if (error) raise(error)
  return { data }
}

export const deleteAssessment = async (assessmentId) => {
  const { error } = await supabase.from('assessments').delete().eq('id', assessmentId)
  if (error) raise(error)
  return { data: { message: 'Assessment deleted' } }
}

// ── Assessment Items ─────────────────────────────────────────────────────────

/** Returns ALL items for the given course (across every assessment). */
export const getAssessmentItems = async (courseId) => {
  // Pull assessments first, then items in those assessments.
  const { data: assess, error: aErr } = await supabase
    .from('assessments').select('id').eq('course_id', courseId)
  if (aErr) raise(aErr)
  const ids = (assess || []).map(a => a.id)
  if (ids.length === 0) return { data: [] }

  const { data, error } = await supabase
    .from('assessment_items').select('*').in('assessment_id', ids).order('position')
  if (error) raise(error)
  return { data }
}

/** Item full_mark must not exceed the parent assessment's total_mark — guard
 *  here so a bad value cannot poison later attainment math. */
async function assertItemMarkValid(assessmentId, fullMark, ignoreItemId = null) {
  const fm = validateMark('Item full mark', fullMark, MAX_TOTAL_MARK, { allowZero: false })

  const { data: a, error: aErr } = await supabase
    .from('assessments').select('total_mark').eq('id', assessmentId).single()
  if (aErr) raise(aErr)
  const total = Number(a?.total_mark) || 0

  if (total > 0 && fm > total) {
    raise({ message: `Item full mark (${fm}) cannot exceed assessment total (${total}).` })
  }

  // Σ existing items + this new value must also not exceed total.
  const { data: siblings } = await supabase
    .from('assessment_items').select('id, full_mark').eq('assessment_id', assessmentId)
  const siblingSum = (siblings || [])
    .filter(s => s.id !== ignoreItemId)
    .reduce((s, it) => s + (Number(it.full_mark) || 0), 0)

  if (total > 0 && siblingSum + fm > total + 0.01) {
    raise({
      message:
        `Sum of item full marks (${siblingSum + fm}) would exceed assessment total (${total}). ` +
        `Reduce one of the existing items first.`,
    })
  }

  return fm
}

export const createAssessmentItem = async (assessmentId, payload) => {
  const fm = await assertItemMarkValid(assessmentId, payload.full_mark)
  const { data: existing } = await supabase
    .from('assessment_items').select('position').eq('assessment_id', assessmentId)
  const nextPos = (existing?.length || 0) + 1

  const { data, error } = await supabase
    .from('assessment_items')
    .insert({
      assessment_id: assessmentId,
      name:          payload.name,
      full_mark:     fm,
      position:      nextPos,
    })
    .select().single()
  if (error) raise(error)
  return { data }
}

export const updateAssessmentItem = async (itemId, payload) => {
  const { data: existing, error: exErr } = await supabase
    .from('assessment_items').select('assessment_id').eq('id', itemId).single()
  if (exErr) raise(exErr)
  const fm = await assertItemMarkValid(existing.assessment_id, payload.full_mark, itemId)
  const { data, error } = await supabase
    .from('assessment_items')
    .update({ name: payload.name, full_mark: fm })
    .eq('id', itemId)
    .select().single()
  if (error) raise(error)
  return { data }
}

export const deleteAssessmentItem = async (itemId) => {
  const { error } = await supabase.from('assessment_items').delete().eq('id', itemId)
  if (error) raise(error)
  return { data: { message: 'Item deleted' } }
}

// ── CLO ↔ Item Mapping ───────────────────────────────────────────────────────

export const getCloItemMap = async (courseId) => {
  // Limit to mapping rows whose CLO and item both belong to this course.
  const [closRes, itemsRes] = await Promise.all([
    supabase.from('clos').select('id').eq('course_id', courseId),
    getAssessmentItems(courseId),
  ])
  if (closRes.error) raise(closRes.error)
  const cloIds  = (closRes.data || []).map(c => c.id)
  const itemIds = (itemsRes.data || []).map(i => i.id)
  if (cloIds.length === 0 || itemIds.length === 0) return { data: [] }

  const { data, error } = await supabase
    .from('clo_item_map').select('*')
    .in('clo_id',  cloIds)
    .in('item_id', itemIds)
  if (error) raise(error)
  return { data }
}

/** Replaces all mapping rows for this course with the supplied pairs. */
export const setCloItemMap = async (courseId, pairs) => {
  // Pull the current set so we know which rows to keep, add, or remove.
  const { data: current } = await getCloItemMap(courseId)
  const key = (p) => `${p.clo_id}|${p.item_id}`

  const desired = new Map(pairs.map(p => [key(p), p]))
  const existing = new Map((current || []).map(r => [key(r), r]))

  const toDelete = []
  for (const [k, row] of existing) if (!desired.has(k)) toDelete.push(row.id)

  const toInsert = []
  for (const [k, p] of desired) if (!existing.has(k)) toInsert.push(p)

  if (toDelete.length) {
    const { error } = await supabase.from('clo_item_map').delete().in('id', toDelete)
    if (error) raise(error)
  }
  if (toInsert.length) {
    const { error } = await supabase.from('clo_item_map').insert(toInsert)
    if (error) raise(error)
  }
  return { data: { added: toInsert.length, removed: toDelete.length } }
}

// ── Item Grades (per student × per assessment item) ──────────────────────────

/** Returns a flat lookup `${studentId}|${itemId}` → score for the whole course. */
export const getItemGrades = async (courseId) => {
  const [studentsRes, itemsRes] = await Promise.all([
    supabase.from('students').select('id').eq('course_id', courseId),
    getAssessmentItems(courseId),
  ])
  if (studentsRes.error) raise(studentsRes.error)
  const studentIds = (studentsRes.data || []).map(s => s.id)
  const itemIds    = (itemsRes.data    || []).map(i => i.id)
  if (studentIds.length === 0 || itemIds.length === 0) return { data: { grades: {} } }

  const { data, error } = await supabase
    .from('student_item_grades').select('*')
    .in('student_id', studentIds)
    .in('item_id',    itemIds)
  if (error) raise(error)

  const grades = {}
  for (const row of (data || [])) grades[`${row.student_id}|${row.item_id}`] = row.score
  return { data: { grades } }
}

export const saveItemGrades = async (_courseId, gradeList) => {
  const filtered = gradeList
    .filter(g => g.score !== '' && g.score !== null && g.score !== undefined)

  // Validate scores against each item's full_mark before any upsert. This is
  // the "no mismatch between Students & Grades and the report" guarantee.
  if (filtered.length > 0) {
    const itemIds = [...new Set(filtered.map(g => g.item_id))]
    const { data: itemRows, error: iErr } = await supabase
      .from('assessment_items').select('id, name, full_mark').in('id', itemIds)
    if (iErr) raise(iErr)
    const fullMarkById = new Map((itemRows || []).map(r => [r.id, Number(r.full_mark) || 0]))

    const offenders = []
    for (const g of filtered) {
      const n = Number(g.score)
      if (!Number.isFinite(n) || n < 0) {
        raise({ message: `Score must be a non-negative number (got "${g.score}").` })
      }
      const max = fullMarkById.get(g.item_id) ?? 0
      if (max > 0 && n > max) offenders.push({ ...g, max })
    }
    if (offenders.length) {
      const first = offenders[0]
      raise({
        message:
          `Score (${first.score}) exceeds the item's full mark (${first.max}). ` +
          `Fix ${offenders.length} cell${offenders.length === 1 ? '' : 's'} highlighted in red and try again.`,
      })
    }
  }

  const rows = filtered.map(g => ({
    student_id: g.student_id,
    item_id:    g.item_id,
    score:      Number(g.score),
  }))
  if (rows.length === 0) return { data: { message: 'No grades to save' } }

  const { error } = await supabase
    .from('student_item_grades')
    .upsert(rows, { onConflict: 'student_id,item_id' })
  if (error) raise(error)
  return { data: { message: `Saved ${rows.length} grade entries` } }
}

// ── Attainment Calculation (DERIVED from item grades + mapping) ──────────────
//
// For each CLO:
//   items_c = items mapped to this CLO
//   For each student:
//     scored = items_c with a recorded grade for this student
//     pct    = Σ score(s,i) / Σ full_mark(i)        across `scored`
//     passed = pct ≥ clo.passing_score
//   actual_attainment = passed_count / total_students × 100
//   status            = "Achieved" if actual_attainment ≥ clo.target_attainment
//
// NOTE: pct uses WEIGHTED item marks (Σ score / Σ full_mark) — items with larger
// full_mark contribute more weight, exactly as the spec requires. We do not
// average item percentages.
//
// Warnings emitted:
//   • CLO has no mapped assessment items                    (clo_no_items)
//   • Assessment item not mapped to any CLO                 (item_no_clo)
//   • Assessment has no items                               (assessment_no_items)
//   • Σ item full_marks ≠ assessment.total_mark             (item_marks_total_mismatch)
//   • Recorded score exceeds the item's full_mark           (score_over_full_mark)
//   • Missing student grades on items mapped to a CLO       (missing_grades)
// ─────────────────────────────────────────────────────────────────────────────
export const calculateAttainment = async (courseId) => {
  const [courseRes, closRes, studentsRes, assessRes, itemsRes, mapRes, gradesRes] =
    await Promise.all([
      supabase.from('courses').select('*').eq('id', courseId).single(),
      supabase.from('clos').select('*').eq('course_id', courseId).order('code'),
      supabase.from('students').select('*').eq('course_id', courseId),
      supabase.from('assessments').select('*').eq('course_id', courseId),
      getAssessmentItems(courseId),
      getCloItemMap(courseId),
      getItemGrades(courseId),
    ])
  if (courseRes.error)   raise(courseRes.error)
  if (closRes.error)     raise(closRes.error)
  if (studentsRes.error) raise(studentsRes.error)
  if (assessRes.error)   raise(assessRes.error)

  const course      = courseRes.data
  const clos        = closRes.data    || []
  const students    = studentsRes.data || []
  const assessments = assessRes.data   || []
  const items       = itemsRes.data    || []
  const mapping     = mapRes.data      || []
  const gradeMap    = gradesRes.data?.grades || {}

  if (students.length === 0) raise({ message: 'No students enrolled in this course' })
  if (clos.length === 0)     raise({ message: 'No CLOs defined for this course' })

  const itemById     = new Map(items.map(i => [i.id, i]))
  const assessById   = new Map(assessments.map(a => [a.id, a]))
  const itemsByClo   = new Map()
  const closByItem   = new Map()
  for (const m of mapping) {
    if (!itemsByClo.has(m.clo_id))  itemsByClo.set(m.clo_id, [])
    if (!closByItem.has(m.item_id)) closByItem.set(m.item_id, [])
    itemsByClo.get(m.clo_id).push(m.item_id)
    closByItem.get(m.item_id).push(m.clo_id)
  }

  const warnings    = []
  const cloResults  = []
  const domainStats = {}
  let   missingGradeCount = 0

  for (const clo of clos) {
    const cloItemIds = itemsByClo.get(clo.id) || []
    if (cloItemIds.length === 0) {
      warnings.push({
        kind: 'clo_no_items', clo_id: clo.id, clo_code: clo.code,
        message: `${clo.code} has no mapped assessment items.`,
      })
      cloResults.push({
        clo_id: clo.id, clo_code: clo.code, description: clo.description,
        ncaaa_domain: clo.ncaaa_domain, bloom_level: clo.bloom_level,
        target_attainment: clo.target_attainment, passing_score: clo.passing_score,
        total_students: students.length, students_passing: 0,
        attainment_percentage: 0, average_score: 0,
        status: 'Not Achieved', no_mapping: true, mapped_items: [],
      })
      continue
    }

    const cloItems = cloItemIds.map(id => itemById.get(id)).filter(Boolean)

    let passing  = 0
    let pctSum   = 0
    let pctCount = 0
    for (const s of students) {
      let earned = 0
      let denom  = 0
      let missingForStudent = 0
      for (const it of cloItems) {
        const score = gradeMap[`${s.id}|${it.id}`]
        if (score === undefined || score === null || score === '') {
          missingForStudent++
          continue
        }
        earned += Number(score)
        denom  += Number(it.full_mark) || 0
      }
      missingGradeCount += missingForStudent
      if (denom > 0) {
        const pct = (earned / denom) * 100
        pctSum += pct; pctCount++
        if (pct >= clo.passing_score) passing++
      }
    }

    const attainment = (passing / students.length) * 100
    const avgScore   = pctCount > 0 ? pctSum / pctCount : 0
    const result = {
      clo_id:                clo.id,
      clo_code:              clo.code,
      description:           clo.description,
      ncaaa_domain:          clo.ncaaa_domain,
      bloom_level:           clo.bloom_level,
      target_attainment:     clo.target_attainment,
      passing_score:         clo.passing_score,
      total_students:        students.length,
      students_passing:      passing,
      attainment_percentage: Math.round(attainment * 100) / 100,
      average_score:         Math.round(avgScore   * 100) / 100,
      status:                attainment >= clo.target_attainment ? 'Achieved' : 'Not Achieved',
      mapped_items: cloItems.map(it => ({
        id:        it.id,
        name:      it.name,
        full_mark: it.full_mark,
        assessment_name: assessById.get(it.assessment_id)?.name || '',
      })),
    }
    cloResults.push(result)

    const d = clo.ncaaa_domain
    if (!domainStats[d]) domainStats[d] = { met: 0, total: 0, attainments: [] }
    domainStats[d].total++
    domainStats[d].attainments.push(attainment)
    if (result.status === 'Achieved') domainStats[d].met++
  }

  // Items with no CLO mapping
  for (const it of items) {
    if (!closByItem.has(it.id)) {
      const a = assessById.get(it.assessment_id)
      warnings.push({
        kind: 'item_no_clo', item_id: it.id,
        message: `Item "${a?.name || ''} → ${it.name}" is not mapped to any CLO.`,
      })
    }
  }

  // Assessments that have no items, and assessments whose item-mark sum ≠ total_mark
  const itemsByAssessment = new Map()
  for (const a of assessments) itemsByAssessment.set(a.id, [])
  for (const it of items) {
    if (!itemsByAssessment.has(it.assessment_id)) itemsByAssessment.set(it.assessment_id, [])
    itemsByAssessment.get(it.assessment_id).push(it)
  }
  for (const a of assessments) {
    const aItems = itemsByAssessment.get(a.id) || []
    if (aItems.length === 0) {
      warnings.push({
        kind: 'assessment_no_items', assessment_id: a.id,
        message: `Assessment "${a.name}" has no items.`,
      })
      continue
    }
    const sum = aItems.reduce((s, it) => s + (Number(it.full_mark) || 0), 0)
    const total = Number(a.total_mark) || 0
    if (total > 0 && Math.abs(sum - total) > 0.01) {
      warnings.push({
        kind: 'item_marks_total_mismatch', assessment_id: a.id,
        message: `Assessment "${a.name}" item marks total ${sum} but the assessment total is ${total}.`,
      })
    }
  }

  // Scores that exceed an item's full_mark
  for (const it of items) {
    for (const s of students) {
      const score = gradeMap[`${s.id}|${it.id}`]
      if (score === undefined || score === null || score === '') continue
      const max = Number(it.full_mark) || 0
      if (Number(score) > max) {
        const a = assessById.get(it.assessment_id)
        warnings.push({
          kind: 'score_over_full_mark', item_id: it.id, student_id: s.id,
          message: `${s.student_id} ${s.name}: score ${score} on "${a?.name || ''} → ${it.name}" exceeds full mark ${max}.`,
        })
      }
    }
  }

  if (missingGradeCount > 0) {
    warnings.push({
      kind: 'missing_grades', count: missingGradeCount,
      message: `Missing ${missingGradeCount} grade entr${missingGradeCount === 1 ? 'y' : 'ies'} on CLO-mapped items.`,
    })
  }

  const domainSummary = {}
  for (const [d, s] of Object.entries(domainStats)) {
    domainSummary[d] = {
      met:                s.met,
      total:              s.total,
      average_attainment: Math.round(
        (s.attainments.reduce((a, b) => a + b, 0) / s.attainments.length) * 100
      ) / 100,
    }
  }

  const scored = cloResults.filter(r => !r.no_mapping)
  const overall = scored.length > 0
    ? scored.reduce((sum, r) => sum + r.attainment_percentage, 0) / scored.length
    : 0

  return {
    data: {
      course_id:            course.id,
      course_code:          course.code,
      course_name:          course.name,
      total_students:       students.length,
      clo_results:          cloResults,
      overall_attainment:   Math.round(overall * 100) / 100,
      ncaaa_domain_summary: domainSummary,
      warnings,
    },
  }
}
