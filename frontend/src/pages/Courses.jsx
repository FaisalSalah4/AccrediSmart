import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, BookOpen, Trash2, X, ChevronRight, ChevronDown, ChevronUp, AlertCircle, Upload, FileSearch } from 'lucide-react'
import mammoth from 'mammoth'
import {
  getCourses, createCourse, deleteCourse,
  getCLOTemplateByCode, copyCLOsToNewCourse, checkCourseDuplicate,
} from '../api'
import { PREDEFINED_COURSES } from '../constants/courses'
import { DEPARTMENTS } from '../constants'

const SEMESTERS    = ['Fall', 'Spring', 'Summer']
const CURRENT_YEAR = new Date().getFullYear()
const YEARS        = Array.from({ length: 6 }, (_, i) => 2024 + i)
const YEAR_ORDER   = ['Freshman', 'Sophomore', 'Junior', 'Senior']

const YEAR_LABELS = {
  'Freshman':  '🎓 Freshman Year',
  'Sophomore': '📚 Sophomore Year',
  'Junior':    '🔬 Junior Year',
  'Senior':    '🏆 Senior Year',
}

function getCourseYearLabel(code) {
  const match = code.match(/\d+/)
  if (!match) return 'Other'
  const num = parseInt(match[0])
  if (num >= 100 && num < 200) return YEAR_LABELS['Freshman']
  if (num >= 200 && num < 300) return YEAR_LABELS['Sophomore']
  if (num >= 300 && num < 400) return YEAR_LABELS['Junior']
  if (num >= 400 && num < 500) return YEAR_LABELS['Senior']
  return 'Other'
}

const ORDERED_YEAR_LABELS = [...Object.values(YEAR_LABELS), 'Other']

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function extractCourseFromDocument(file) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('VITE_ANTHROPIC_API_KEY is not set. Add it to your .env file.')

  const extractionPrompt = `Extract the following course information from this document and return ONLY a valid JSON object with these exact keys:
{
  "course_name": "full course name",
  "course_code": "course code (e.g. SE101, CS201)",
  "credit_hours": 3,
  "department": "department abbreviation (e.g. SE, CS, IS, CE, EE, ME)",
  "semester": "one of: Fall, Spring, Summer",
  "year": ${CURRENT_YEAR}
}
Use null for any field that cannot be found. Return ONLY the JSON, no explanation.`

  const ext = file.name.split('.').pop().toLowerCase()
  let messages

  if (ext === 'pdf') {
    const base64 = await fileToBase64(file)
    messages = [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
        { type: 'text', text: extractionPrompt },
      ],
    }]
  } else {
    // DOCX — extract text with mammoth
    const arrayBuffer = await file.arrayBuffer()
    const result = await mammoth.extractRawText({ arrayBuffer })
    const text = result.value?.slice(0, 8000) || ''
    messages = [{
      role: 'user',
      content: `${extractionPrompt}\n\nDocument content:\n${text}`,
    }]
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      ...(ext === 'pdf' ? { 'anthropic-beta': 'pdfs-2024-09-25' } : {}),
    },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 512, messages }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err?.error?.message || `API error ${response.status}`)
  }

  const result2 = await response.json()
  const text2   = result2.content?.[0]?.text || ''
  const jsonMatch = text2.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Could not parse JSON from API response')
  return JSON.parse(jsonMatch[0])
}

// ── Course creation modal ─────────────────────────────────────────────────────

function CourseModal({ onClose }) {
  const navigate  = useNavigate()
  const fileRef   = useRef()

  // Mode: 'predefined' or 'upload'
  const [mode, setMode] = useState('predefined')

  // Predefined mode state
  const [selectedCourse, setSelectedCourse] = useState(null)
  const [templateCLOs,   setTemplateCLOs]    = useState(null)
  const [loadingCLOs,    setLoadingCLOs]     = useState(false)

  // Upload mode state
  const [uploadFile,     setUploadFile]      = useState(null)
  const [extracting,     setExtracting]      = useState(false)
  const [extractError,   setExtractError]    = useState('')
  const [extracted,      setExtracted]       = useState(false)

  // Shared editable fields (used in upload mode)
  const [courseName,    setCourseName]    = useState('')
  const [courseCode,    setCourseCode]    = useState('')
  const [creditHours,   setCreditHours]   = useState(3)
  const [department,    setDepartment]    = useState('SE')

  // Common state
  const [semester,     setSemester]      = useState('Fall')
  const [year,         setYear]          = useState(CURRENT_YEAR)
  const [description,  setDescription]   = useState('')
  const [saving,       setSaving]        = useState(false)
  const [savingText,   setSavingText]    = useState('')
  const [error,        setError]         = useState('')

  const groupedCourses = YEAR_ORDER.reduce((acc, yl) => {
    acc[yl] = PREDEFINED_COURSES.filter(c => c.year_level === yl)
    return acc
  }, {})

  const handleCourseChange = async (e) => {
    const code = e.target.value
    setError('')
    if (!code) { setSelectedCourse(null); setTemplateCLOs(null); return }
    const course = PREDEFINED_COURSES.find(c => c.code === code)
    setSelectedCourse(course || null)
    if (!course) return
    setLoadingCLOs(true); setTemplateCLOs(null)
    try {
      const { data } = await getCLOTemplateByCode(code)
      setTemplateCLOs(data)
    } catch { setTemplateCLOs([]) }
    finally { setLoadingCLOs(false) }
  }

  const handleFileSelect = (file) => {
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (ext !== 'pdf' && ext !== 'docx') {
      setExtractError('Only PDF (.pdf) and Word (.docx) files are accepted.')
      return
    }
    setUploadFile(file)
    setExtractError('')
    setExtracted(false)
  }

  const handleExtract = async () => {
    if (!uploadFile) return
    setExtracting(true); setExtractError('')
    try {
      const info = await extractCourseFromDocument(uploadFile)
      setCourseName(info.course_name   || '')
      setCourseCode(info.course_code   || '')
      setCreditHours(info.credit_hours || 3)
      setDepartment(info.department    || 'SE')
      if (info.semester && SEMESTERS.includes(info.semester)) setSemester(info.semester)
      if (info.year && info.year >= 2024) setYear(info.year)
      setExtracted(true)
    } catch (err) {
      setExtractError(err.message || 'Extraction failed. Please fill in the fields manually.')
      setExtracted(true) // still show form for manual entry
    } finally { setExtracting(false) }
  }

  const canSavePredefined = selectedCourse && !saving
  const canSaveUpload     = mode === 'upload' && courseName && courseCode && !saving

  const handleSave = async () => {
    if (saving) return
    setError(''); setSaving(true)

    try {
      if (mode === 'predefined') {
        if (!selectedCourse) return
        const isDuplicate = await checkCourseDuplicate(selectedCourse.code, semester, Number(year))
        if (isDuplicate) {
          setError(`${selectedCourse.code} already exists for ${semester} ${year}.`)
          return
        }
        setSavingText(templateCLOs?.length > 0 ? 'Creating course and loading CLOs…' : 'Creating course…')
        const { data: newCourse } = await createCourse({
          code:         selectedCourse.code,
          name:         selectedCourse.name,
          department:   selectedCourse.department,
          credit_hours: selectedCourse.credit_hours,
          semester, year: Number(year), description: description || null,
        })
        if (templateCLOs?.length > 0) await copyCLOsToNewCourse(newCourse.id, templateCLOs)
        navigate(`/courses/${newCourse.id}`)
        onClose()
      } else {
        // Upload mode
        if (!courseName || !courseCode) { setError('Course name and code are required.'); return }
        const isDuplicate = await checkCourseDuplicate(courseCode.trim(), semester, Number(year))
        if (isDuplicate) {
          setError(`${courseCode} already exists for ${semester} ${year}.`)
          return
        }
        setSavingText('Creating course…')
        const { data: newCourse } = await createCourse({
          code:         courseCode.trim(),
          name:         courseName.trim(),
          department:   department,
          credit_hours: Number(creditHours) || 3,
          semester, year: Number(year), description: description || null,
        })
        // Try to copy CLO template if code matches
        try {
          const { data: tplCLOs } = await getCLOTemplateByCode(courseCode.trim())
          if (tplCLOs?.length > 0) await copyCLOsToNewCourse(newCourse.id, tplCLOs)
        } catch { /* no template — that's fine */ }
        navigate(`/courses/${newCourse.id}`)
        onClose()
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create course')
    } finally { setSaving(false); setSavingText('') }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <h3 className="font-semibold text-gray-900">New Course</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" disabled={saving}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-6 space-y-5">

          {/* Mode toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => { setMode('predefined'); setError('') }}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                mode === 'predefined' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              Select Predefined Course
            </button>
            <button
              onClick={() => { setMode('upload'); setError('') }}
              className={`flex-1 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
                mode === 'upload' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              <Upload size={13} /> Upload Course Document
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* ── PREDEFINED MODE ── */}
          {mode === 'predefined' && (
            <>
              <div>
                <label className="label">Select Course *</label>
                <select className="input" value={selectedCourse?.code || ''} onChange={handleCourseChange} disabled={saving}>
                  <option value="">— Choose a course —</option>
                  {YEAR_ORDER.map(yl => (
                    <optgroup key={yl} label={`${yl} Year`}>
                      {groupedCourses[yl].map(c => (
                        <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {selectedCourse && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div><p className="label">Course Code</p><p className="text-sm font-mono font-semibold text-gray-900">{selectedCourse.code}</p></div>
                    <div><p className="label">Department</p><p className="text-sm text-gray-900">{selectedCourse.department}</p></div>
                    <div><p className="label">Credit Hours</p><p className="text-sm text-gray-900">{selectedCourse.credit_hours}</p></div>
                  </div>
                  <div><p className="label">Course Name</p><p className="text-sm text-gray-900">{selectedCourse.name}</p></div>
                </div>
              )}

              {selectedCourse && (
                <>
                  {loadingCLOs && (
                    <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 text-sm text-indigo-600">Loading CLO template…</div>
                  )}
                  {!loadingCLOs && templateCLOs?.length > 0 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
                      <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">CLOs will be automatically loaded from the database</p>
                      <ul className="space-y-1.5">
                        {templateCLOs.map(clo => (
                          <li key={clo.id} className="flex gap-2 text-xs">
                            <span className="font-mono font-semibold text-blue-700 shrink-0 w-10">{clo.code}</span>
                            <span className="text-blue-600 line-clamp-1">{clo.description}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {!loadingCLOs && templateCLOs !== null && templateCLOs.length === 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-700">
                      No CLO template found. CLOs can be added manually after creation.
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ── UPLOAD MODE ── */}
          {mode === 'upload' && (
            <>
              {/* File drop zone */}
              <div>
                <label className="label">Course Document (PDF or Word) *</label>
                <div
                  onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed border-gray-300 rounded-xl p-5 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors"
                >
                  <FileSearch size={28} className="mx-auto mb-2 text-gray-400" />
                  {uploadFile ? (
                    <p className="text-sm font-medium text-indigo-700">{uploadFile.name}</p>
                  ) : (
                    <>
                      <p className="text-sm text-gray-500">Click to select a PDF or Word file</p>
                      <p className="text-xs text-gray-400 mt-1">.pdf or .docx only</p>
                    </>
                  )}
                </div>
                <input
                  ref={fileRef} type="file" className="hidden"
                  accept=".pdf,.docx"
                  onChange={e => handleFileSelect(e.target.files?.[0])}
                />
              </div>

              {extractError && (
                <div className="bg-amber-50 text-amber-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <span>{extractError}</span>
                </div>
              )}

              {uploadFile && !extracted && (
                <button
                  onClick={handleExtract}
                  disabled={extracting}
                  className="btn-primary text-sm flex items-center gap-2 w-full justify-center"
                >
                  {extracting
                    ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Extracting course info…</>
                    : <><FileSearch size={15} /> Extract Course Information</>
                  }
                </button>
              )}

              {/* Editable fields (shown after extraction or if extraction failed) */}
              {(extracted || extractError) && (
                <div className="space-y-3 border border-indigo-100 bg-indigo-50/30 rounded-xl p-4">
                  <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">
                    {extractError ? 'Enter course details manually' : 'Review and edit extracted information'}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="label">Course Name *</label>
                      <input className="input text-sm" value={courseName} onChange={e => setCourseName(e.target.value)} placeholder="e.g. Software Engineering" />
                    </div>
                    <div>
                      <label className="label">Course Code *</label>
                      <input className="input text-sm" value={courseCode} onChange={e => setCourseCode(e.target.value)} placeholder="e.g. SE301" />
                    </div>
                    <div>
                      <label className="label">Credit Hours</label>
                      <input type="number" min={1} max={6} className="input text-sm" value={creditHours} onChange={e => setCreditHours(e.target.value)} />
                    </div>
                    <div>
                      <label className="label">Department</label>
                      <select className="input text-sm" value={department} onChange={e => setDepartment(e.target.value)}>
                        {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Semester + Year (both modes) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Semester *</label>
              <select className="input" value={semester} onChange={e => setSemester(e.target.value)} disabled={saving}>
                {SEMESTERS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Year *</label>
              <select className="input" value={year} onChange={e => setYear(e.target.value)} disabled={saving}>
                {YEARS.map(y => <option key={y}>{y}</option>)}
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="label">Description</label>
            <textarea className="input" rows={2} placeholder="Optional…" value={description} onChange={e => setDescription(e.target.value)} disabled={saving} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t shrink-0">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={saving}>Cancel</button>
          <button
            type="button"
            onClick={handleSave}
            disabled={mode === 'predefined' ? !canSavePredefined : !canSaveUpload}
            className="btn-primary flex items-center gap-2"
          >
            {saving
              ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />{savingText || 'Creating…'}</>
              : 'Save Course'
            }
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Collapsible year-level section ────────────────────────────────────────────

function YearSection({ label, courses, onDelete, deleting }) {
  const [open, setOpen] = useState(true)

  return (
    <div className="border border-gray-100 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-800">{label}</span>
          <span className="text-xs bg-indigo-100 text-indigo-700 rounded-full px-2 py-0.5 font-medium">
            {courses.length} course{courses.length !== 1 ? 's' : ''}
          </span>
        </div>
        {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </button>

      {open && (
        <div className="divide-y divide-gray-50">
          {courses.map(c => (
            <div key={c.id} className="flex items-center gap-4 px-5 py-4 bg-white hover:bg-gray-50/60 transition-colors">
              <div className="w-10 h-10 bg-indigo-100 text-indigo-700 rounded-xl flex items-center justify-center font-bold text-xs shrink-0">
                {c.code.replace(/\s/, '').slice(0, 4)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm">{c.code} — {c.name}</p>
                <p className="text-xs text-gray-400">{c.semester} {c.year} · {c.credit_hours} cr</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => onDelete(c.id)}
                  disabled={deleting === c.id}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 size={15} />
                </button>
                <Link to={`/courses/${c.id}`} className="flex items-center gap-1 btn-secondary text-xs">
                  Open <ChevronRight size={13} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Courses() {
  const [courses,   setCourses]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [deleting,  setDeleting]  = useState(null)

  const load = () =>
    getCourses().then(r => setCourses(r.data)).finally(() => setLoading(false))

  useEffect(() => { load() }, [])

  const handleDelete = async (id) => {
    if (!confirm('Delete this course and all its data? This cannot be undone.')) return
    setDeleting(id)
    await deleteCourse(id)
    setCourses(cs => cs.filter(c => c.id !== id))
    setDeleting(null)
  }

  const grouped = {}
  ORDERED_YEAR_LABELS.forEach(lbl => { grouped[lbl] = [] })
  courses.forEach(c => {
    const lbl = getCourseYearLabel(c.code)
    if (!grouped[lbl]) grouped[lbl] = []
    grouped[lbl].push(c)
  })
  const activeLabels = ORDERED_YEAR_LABELS.filter(lbl => grouped[lbl]?.length > 0)

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Courses</h1>
          <p className="text-gray-500 text-sm mt-0.5">{courses.length} course{courses.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> New Course
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 bg-white rounded-xl animate-pulse border border-gray-100" />)}
        </div>
      ) : courses.length === 0 ? (
        <div className="card text-center py-16">
          <BookOpen size={48} className="mx-auto mb-4 text-gray-300" />
          <h3 className="font-semibold text-gray-700 mb-1">No courses yet</h3>
          <p className="text-gray-400 text-sm mb-6">Create your first course to start the accreditation workflow.</p>
          <button onClick={() => setShowModal(true)} className="btn-primary inline-flex items-center gap-2">
            <Plus size={16} /> Create Course
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {activeLabels.map(lbl => (
            <YearSection key={lbl} label={lbl} courses={grouped[lbl]} onDelete={handleDelete} deleting={deleting} />
          ))}
        </div>
      )}

      {showModal && <CourseModal onClose={() => { setShowModal(false); load() }} />}
    </div>
  )
}
