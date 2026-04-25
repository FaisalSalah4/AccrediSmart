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

// ── Course CLO templates ───────────────────────────────────────────────────────

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
