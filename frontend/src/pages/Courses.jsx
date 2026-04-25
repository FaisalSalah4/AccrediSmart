import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, BookOpen, Trash2, X, ChevronRight, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react'
import {
  getCourses, createCourse, deleteCourse,
  getCLOTemplateByCode, copyCLOsToNewCourse, checkCourseDuplicate,
} from '../api'
import { PREDEFINED_COURSES } from '../constants/courses'

const SEMESTERS    = ['Fall', 'Spring', 'Summer']
const CURRENT_YEAR = new Date().getFullYear()
const YEARS        = Array.from({ length: 6 }, (_, i) => 2024 + i)
const YEAR_ORDER   = ['Freshman', 'Sophomore', 'Junior', 'Senior']

// ── Year-level section labels ─────────────────────────────────────────────────

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

// ── Course creation modal ─────────────────────────────────────────────────────

function CourseModal({ onClose }) {
  const navigate = useNavigate()

  const [selectedCourse, setSelectedCourse] = useState(null)
  const [semester,       setSemester]        = useState('Fall')
  const [year,           setYear]            = useState(CURRENT_YEAR)
  const [description,    setDescription]     = useState('')
  const [templateCLOs,   setTemplateCLOs]    = useState(null)  // null = not yet fetched
  const [loadingCLOs,    setLoadingCLOs]     = useState(false)
  const [saving,         setSaving]          = useState(false)
  const [savingText,     setSavingText]       = useState('')
  const [error,          setError]           = useState('')

  // Group predefined courses by year level for the optgroup dropdown
  const groupedCourses = YEAR_ORDER.reduce((acc, yl) => {
    acc[yl] = PREDEFINED_COURSES.filter(c => c.year_level === yl)
    return acc
  }, {})

  const handleCourseChange = async (e) => {
    const code = e.target.value
    setError('')

    if (!code) {
      setSelectedCourse(null)
      setTemplateCLOs(null)
      return
    }

    const course = PREDEFINED_COURSES.find(c => c.code === code)
    setSelectedCourse(course || null)
    if (!course) return

    setLoadingCLOs(true)
    setTemplateCLOs(null)
    try {
      const { data } = await getCLOTemplateByCode(code)
      setTemplateCLOs(data)
    } catch {
      setTemplateCLOs([])
    } finally {
      setLoadingCLOs(false)
    }
  }

  const handleSave = async () => {
    if (!selectedCourse || saving) return
    setError('')
    setSaving(true)

    try {
      // Step A — duplicate check
      const isDuplicate = await checkCourseDuplicate(selectedCourse.code, semester, Number(year))
      if (isDuplicate) {
        setError(
          `${selectedCourse.code} already exists for ${semester} ${year}. ` +
          `Each course can only be added once per semester.`
        )
        return
      }

      // Step B — create the course row
      setSavingText(
        templateCLOs?.length > 0
          ? 'Creating course and loading CLOs...'
          : 'Creating course...'
      )
      const { data: newCourse } = await createCourse({
        code:         selectedCourse.code,
        name:         selectedCourse.name,
        department:   selectedCourse.department,
        credit_hours: selectedCourse.credit_hours,
        semester,
        year:         Number(year),
        description:  description || null,
      })

      // Step C — copy CLO templates into the new course
      if (templateCLOs?.length > 0) {
        await copyCLOsToNewCourse(newCourse.id, templateCLOs)
      }

      // Step D — redirect to the new course detail page
      navigate(`/courses/${newCourse.id}`)
      onClose()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create course')
    } finally {
      setSaving(false)
      setSavingText('')
    }
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

          {/* Error banner */}
          {error && (
            <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Course dropdown */}
          <div>
            <label className="label">Select Course *</label>
            <select
              className="input"
              value={selectedCourse?.code || ''}
              onChange={handleCourseChange}
              disabled={saving}
            >
              <option value="">— Choose a course —</option>
              {YEAR_ORDER.map(yl => (
                <optgroup key={yl} label={`${yl} Year`}>
                  {groupedCourses[yl].map(c => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Read-only course details */}
          {selectedCourse && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="label">Course Code</p>
                  <p className="text-sm font-mono font-semibold text-gray-900">{selectedCourse.code}</p>
                </div>
                <div>
                  <p className="label">Department</p>
                  <p className="text-sm text-gray-900">{selectedCourse.department}</p>
                </div>
                <div>
                  <p className="label">Credit Hours</p>
                  <p className="text-sm text-gray-900">{selectedCourse.credit_hours}</p>
                </div>
              </div>
              <div>
                <p className="label">Course Name</p>
                <p className="text-sm text-gray-900">{selectedCourse.name}</p>
              </div>
            </div>
          )}

          {/* CLO preview / info */}
          {selectedCourse && (
            <>
              {loadingCLOs && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 text-sm text-indigo-600">
                  Loading CLO template…
                </div>
              )}

              {!loadingCLOs && templateCLOs !== null && templateCLOs.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
                  <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
                    CLOs will be automatically loaded from the database for this course
                  </p>
                  <ul className="space-y-1.5 mt-1">
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
                  No CLO template found for this course yet. CLOs can be added manually after creation.
                </div>
              )}
            </>
          )}

          {/* Semester + Year */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Semester *</label>
              <select
                className="input"
                value={semester}
                onChange={e => setSemester(e.target.value)}
                disabled={saving}
              >
                {SEMESTERS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Year *</label>
              <select
                className="input"
                value={year}
                onChange={e => setYear(e.target.value)}
                disabled={saving}
              >
                {YEARS.map(y => <option key={y}>{y}</option>)}
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="label">Description</label>
            <textarea
              className="input"
              rows={2}
              placeholder="Optional…"
              value={description}
              onChange={e => setDescription(e.target.value)}
              disabled={saving}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!selectedCourse || saving}
            className="btn-primary flex items-center gap-2"
          >
            {saving ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {savingText || 'Creating…'}
              </>
            ) : 'Save Course'}
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
        {open
          ? <ChevronUp size={16} className="text-gray-400" />
          : <ChevronDown size={16} className="text-gray-400" />}
      </button>

      {open && (
        <div className="divide-y divide-gray-50">
          {courses.map(c => (
            <div
              key={c.id}
              className="flex items-center gap-4 px-5 py-4 bg-white hover:bg-gray-50/60 transition-colors"
            >
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
                <Link
                  to={`/courses/${c.id}`}
                  className="flex items-center gap-1 btn-secondary text-xs"
                >
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

  // Group by year level derived from course code number
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
          <p className="text-gray-500 text-sm mt-0.5">
            {courses.length} course{courses.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> New Course
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-white rounded-xl animate-pulse border border-gray-100" />
          ))}
        </div>
      ) : courses.length === 0 ? (
        <div className="card text-center py-16">
          <BookOpen size={48} className="mx-auto mb-4 text-gray-300" />
          <h3 className="font-semibold text-gray-700 mb-1">No courses yet</h3>
          <p className="text-gray-400 text-sm mb-6">
            Create your first course to start the accreditation workflow.
          </p>
          <button onClick={() => setShowModal(true)} className="btn-primary inline-flex items-center gap-2">
            <Plus size={16} /> Create Course
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {activeLabels.map(lbl => (
            <YearSection
              key={lbl}
              label={lbl}
              courses={grouped[lbl]}
              onDelete={handleDelete}
              deleting={deleting}
            />
          ))}
        </div>
      )}

      {showModal && (
        <CourseModal onClose={() => setShowModal(false)} />
      )}
    </div>
  )
}
