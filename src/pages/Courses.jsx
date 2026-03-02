import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Plus, BookOpen, Trash2, Edit, X, ChevronRight } from 'lucide-react'
import { getCourses, createCourse, deleteCourse } from '../api'

const SEMESTERS = ['Fall', 'Spring', 'Summer']
const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 2 + i)

const EMPTY = { code: '', name: '', credit_hours: 3, department: '', semester: 'Fall', year: CURRENT_YEAR, description: '' }

function CourseModal({ initial, onSave, onClose }) {
  const [form, setForm]   = useState(initial || EMPTY)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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
          <h3 className="font-semibold text-gray-900">{initial ? 'Edit Course' : 'New Course'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Course Code *</label>
              <input required className="input" placeholder="SE495" value={form.code} onChange={set('code')} />
            </div>
            <div>
              <label className="label">Credit Hours</label>
              <input type="number" min={1} max={6} className="input" value={form.credit_hours} onChange={set('credit_hours')} />
            </div>
          </div>

          <div>
            <label className="label">Course Name *</label>
            <input required className="input" placeholder="Software Engineering Capstone" value={form.name} onChange={set('name')} />
          </div>

          <div>
            <label className="label">Department *</label>
            <input required className="input" placeholder="Software Engineering" value={form.department} onChange={set('department')} />
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
            <textarea className="input" rows={2} placeholder="Optional…" value={form.description} onChange={set('description')} />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Saving…' : 'Save Course'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Courses() {
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [deleting, setDeleting]   = useState(null)

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
          {[1,2,3].map(i => <div key={i} className="h-20 bg-white rounded-xl animate-pulse border border-gray-100" />)}
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
        <div className="space-y-3">
          {courses.map(c => (
            <div key={c.id} className="card flex items-center gap-4 hover:shadow-md transition-shadow py-4">
              <div className="w-12 h-12 bg-indigo-100 text-indigo-700 rounded-xl flex items-center justify-center font-bold text-sm shrink-0">
                {c.code.slice(0, 2)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900">{c.code} — {c.name}</p>
                <p className="text-sm text-gray-400">{c.department} · {c.semester} {c.year} · {c.credit_hours} cr</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleDelete(c.id)}
                  disabled={deleting === c.id}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 size={16} />
                </button>
                <Link
                  to={`/courses/${c.id}`}
                  className="flex items-center gap-1.5 btn-secondary text-xs"
                >
                  Open <ChevronRight size={14} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <CourseModal
          onSave={handleCreate}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}
