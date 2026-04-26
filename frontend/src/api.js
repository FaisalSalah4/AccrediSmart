/**
 * AccrediSmart — Supabase API layer
 *
 * All functions return { data } (or throw) so component code
 * using .then(r => r.data) continues to work unchanged.
 */

import { supabase } from './lib/supabase'

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

/** Only target_attainment and passing_score are updatable by faculty */
export const updateCLO = async (cloId, cloData) => {
  const { data, error } = await supabase
    .from('clos').update(cloData).eq('id', cloId).select().single()
  if (error) raise(error)
  return { data }
}

// ── Course CLO Templates ──────────────────────────────────────────────────────

/** Fetch CLOs from any existing course that matches the given course code — used as template source */
export const getCLOTemplateByCode = async (courseCode) => {
  const { data: existingCourses, error: courseError } = await supabase
    .from('courses')
    .select('id')
    .eq('code', courseCode)
    .limit(1)

  if (courseError || !existingCourses?.length) return { data: [] }

  const { data, error } = await supabase
    .from('clos')
    .select('*')
    .eq('course_id', existingCourses[0].id)
    .order('code', { ascending: true })

  if (error) raise(error)
  return { data }
}

/** Copy CLO templates into a newly created course */
export const copyCLOsToNewCourse = async (newCourseId, templateCLOs) => {
  if (!templateCLOs || templateCLOs.length === 0) return { data: [] }

  const newCLOs = templateCLOs.map(clo => ({
    course_id:         newCourseId,
    code:              clo.code,
    description:       clo.description,
    ncaaa_domain:      clo.ncaaa_domain,
    bloom_level:       clo.bloom_level,
    target_attainment: clo.target_attainment,
    passing_score:     clo.passing_score,
    plo_mapping:       clo.plo_mapping,
    so_mapping:        clo.so_mapping,
  }))

  const { data, error } = await supabase
    .from('clos')
    .insert(newCLOs)
    .select()

  if (error) raise(error)
  return { data }
}

/** Returns true if the current instructor already has this course code in the given semester/year */
export const checkCourseDuplicate = async (code, semester, year) => {
  const id = await uid()
  const { data, error } = await supabase
    .from('courses')
    .select('id')
    .eq('code', code)
    .eq('semester', semester)
    .eq('year', year)
    .eq('instructor_id', id)
    .limit(1)
  if (error) raise(error)
  return (data?.length ?? 0) > 0
}

// ════════════════════════════════════════════════════════════════════════════
// FCAR WORKFLOW — Students, Assessments, Items, Mapping, Grades
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

export const createAssessment = async (courseId, payload) => {
  const { data, error } = await supabase
    .from('assessments')
    .insert({
      course_id:  courseId,
      name:       payload.name,
      type:       payload.type,
      weight:     Number(payload.weight)     || 0,
      total_mark: Number(payload.total_mark) || 0,
    })
    .select().single()
  if (error) raise(error)
  return { data }
}

export const updateAssessment = async (assessmentId, payload) => {
  const { data, error } = await supabase
    .from('assessments')
    .update({
      name:       payload.name,
      type:       payload.type,
      weight:     Number(payload.weight)     || 0,
      total_mark: Number(payload.total_mark) || 0,
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

export const createAssessmentItem = async (assessmentId, payload) => {
  const { data: existing } = await supabase
    .from('assessment_items').select('position').eq('assessment_id', assessmentId)
  const nextPos = (existing?.length || 0) + 1

  const { data, error } = await supabase
    .from('assessment_items')
    .insert({
      assessment_id: assessmentId,
      name:          payload.name,
      full_mark:     Number(payload.full_mark) || 0,
      position:      nextPos,
    })
    .select().single()
  if (error) raise(error)
  return { data }
}

export const updateAssessmentItem = async (itemId, payload) => {
  const { data, error } = await supabase
    .from('assessment_items')
    .update({ name: payload.name, full_mark: Number(payload.full_mark) || 0 })
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
  const { data: current } = await getCloItemMap(courseId)
  const key = (p) => `${p.clo_id}|${p.item_id}`

  const desired  = new Map(pairs.map(p => [key(p), p]))
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
  const rows = gradeList
    .filter(g => g.score !== '' && g.score !== null && g.score !== undefined)
    .map(g => ({
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

// ── Attainment Calculation ────────────────────────────────────────────────────

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
  const clos        = closRes.data     || []
  const students    = studentsRes.data || []
  const assessments = assessRes.data   || []
  const items       = itemsRes.data    || []
  const mapping     = mapRes.data      || []
  const gradeMap    = gradesRes.data?.grades || {}

  if (students.length === 0) raise({ message: 'No students enrolled in this course' })
  if (clos.length === 0)     raise({ message: 'No CLOs defined for this course' })

  const itemById   = new Map(items.map(i => [i.id, i]))
  const assessById = new Map(assessments.map(a => [a.id, a]))
  const itemsByClo = new Map()
  const closByItem = new Map()

  for (const m of mapping) {
    if (!itemsByClo.has(m.clo_id))  itemsByClo.set(m.clo_id, [])
    if (!closByItem.has(m.item_id)) closByItem.set(m.item_id, [])
    itemsByClo.get(m.clo_id).push(m.item_id)
    closByItem.get(m.item_id).push(m.clo_id)
  }

  const warnings   = []
  const cloResults = []
  const domainStats = {}
  let missingGradeCount = 0

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
        id:              it.id,
        name:            it.name,
        full_mark:       it.full_mark,
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

  for (const it of items) {
    if (!closByItem.has(it.id)) {
      const a = assessById.get(it.assessment_id)
      warnings.push({
        kind: 'item_no_clo', item_id: it.id,
        message: `Item "${a?.name || ''} → ${it.name}" is not mapped to any CLO.`,
      })
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

  const scored  = cloResults.filter(r => !r.no_mapping)
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