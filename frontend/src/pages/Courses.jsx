import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Plus, BookOpen, Trash2, X, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react'
import { getCourses, createCourse, deleteCourse } from '../api'
import { DEPARTMENTS } from '../constants'

const SEMESTERS    = ['Fall', 'Spring', 'Summer']
const CURRENT_YEAR = new Date().getFullYear()
const YEARS        = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 2 + i)

const EMPTY = {
  code: '', name: '', credit_hours: 3,
  department: DEPARTMENTS[0], semester: 'Fall', year: CURRENT_YEAR, description: '',
}

// ── Course creation modal ─────────────────────────────────────────────────────

function CourseModal({ onSave, onClose }) {
  const [form, setForm]       = useState(EMPTY)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await onSave({ ...form, credit_hours: Number(form.credit_hours), year: Number(form.year) })
      onClose()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save course')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="font-semibold text-gray-900">New Course</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Course Code *</label>
              <input required className="input" placeholder="SE495"
                value={form.code} onChange={set('code')} />
            </div>
            <div>
              <label className="label">Credit Hours</label>
              <input type="number" min={1} max={6} className="input"
                value={form.credit_hours} onChange={set('credit_hours')} />
            </div>
          </div>

          <div>
            <label className="label">Course Name *</label>
            <input required className="input" placeholder="Software Engineering Capstone"
              value={form.name} onChange={set('name')} />
          </div>

          <div>
            <label className="label">Department *</label>
            <select required className="input" value={form.department} onChange={set('department')}>
              {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Semester</label>
              <select className="input" value={form.semester} onChange={set('semester')}>
                {SEMESTERS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Year</label>
              <select className="input" value={form.year} onChange={set('year')}>
                {YEARS.map(y => <option key={y}>{y}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Description</label>
            <textarea className="input" rows={2} placeholder="Optional…"
              value={form.description} onChange={set('description')} />
          </div>

          <p className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
            CLOs will be auto-populated based on the selected department when the course is created.
          </p>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Creating…' : 'Create Course'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Collapsible department section ────────────────────────────────────────────

function DeptSection({ dept, courses, onDelete, deleting }) {
  const [open, setOpen] = useState(true)

  return (
    <div className="border border-gray-100 rounded-2xl overflow-hidden">
      {/* Section header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-800">{dept}</span>
          <span className="text-xs bg-indigo-100 text-indigo-700 rounded-full px-2 py-0.5 font-medium">
            {courses.length} course{courses.length !== 1 ? 's' : ''}
          </span>
        </div>
        {open
          ? <ChevronUp size={16} className="text-gray-400" />
          : <ChevronDown size={16} className="text-gray-400" />}
      </button>

      {/* Course rows */}
      {open && (
        <div className="divide-y divide-gray-50">
          {courses.map(c => (
            <div key={c.id} className="flex items-center gap-4 px-5 py-4 bg-white hover:bg-gray-50/60 transition-colors">
              <div className="w-10 h-10 bg-indigo-100 text-indigo-700 rounded-xl flex items-center justify-center font-bold text-xs shrink-0">
                {c.code.slice(0, 2)}
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
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [deleting, setDeleting]  = useState(null)

  const load = () => getCourses().then(r => setCourses(r.data)).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  const handleCreate = async (data) => {
    await createCourse(data)
    load()
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this course and all its data? This cannot be undone.')) return
    setDeleting(id)
    await deleteCourse(id)
    setCourses(cs => cs.filter(c => c.id !== id))
    setDeleting(null)
  }

  // Group courses by department (preserving DEPARTMENTS order)
  const grouped = {}
  DEPARTMENTS.forEach(d => { grouped[d] = [] })
  courses.forEach(c => {
    if (grouped[c.department] !== undefined) grouped[c.department].push(c)
    else {
      grouped['Other'] = grouped['Other'] || []
      grouped['Other'].push(c)
    }
  })
  const activeDepts = [...DEPARTMENTS, 'Other'].filter(d => grouped[d]?.length > 0)

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
          {activeDepts.map(dept => (
            <DeptSection
              key={dept}
              dept={dept}
              courses={grouped[dept]}
              onDelete={handleDelete}
              deleting={deleting}
            />
          ))}
        </div>
      )}

      {showModal && (
        <CourseModal onSave={handleCreate} onClose={() => setShowModal(false)} />
      )}
    </div>
  )
}
