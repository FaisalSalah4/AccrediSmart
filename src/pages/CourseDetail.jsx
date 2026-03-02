import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  getCourse, getDocuments, uploadDocument, deleteDocument, getDocumentUrl,
  getCLOs, createCLO, updateCLO, deleteCLO,
  getStudents, addStudent, deleteStudent, bulkAddStudents,
  getGrades, saveGrades, calculateAttainment
} from '../api'
import {
  ChevronLeft, Upload, FileText, Trash2, Download, Plus, X, Check,
  Edit2, Save, BarChart3, Users, BookOpen, Target, AlertCircle, CheckCircle
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Cell
} from 'recharts'

// ── Constants ────────────────────────────────────────────────────────────────

const NCAAA_DOMAINS = [
  'Knowledge',
  'Cognitive Skills',
  'Interpersonal Skills & Responsibility',
  'Communication, IT & Numerical Skills',
  'Psychomotor Skills',
]

const BLOOM_LEVELS = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create']

const DOC_TYPES = [
  { value: 'syllabus',           label: 'Syllabus'           },
  { value: 'assessment_report',  label: 'Assessment Report'  },
  { value: 'grade_sheet',        label: 'Grade Sheet'        },
  { value: 'student_work',       label: 'Student Work'       },
  { value: 'other',              label: 'Other'              },
]

const TABS = [
  { id: 'overview',  label: 'Overview',        icon: BookOpen  },
  { id: 'documents', label: 'Evidence Files',  icon: FileText  },
  { id: 'clos',      label: 'CLO Mapping',     icon: Target    },
  { id: 'grades',    label: 'Grade Entry',     icon: Users     },
  { id: 'report',    label: 'Attainment Report', icon: BarChart3 },
]

const fmt = (n) => n.toFixed(1)
const pct = (score, max) => max > 0 ? (score / max) * 100 : 0

// ── Helpers ───────────────────────────────────────────────────────────────────

function TabButton({ tab, active, onClick }) {
  const Icon = tab.icon
  return (
    <button
      onClick={() => onClick(tab.id)}
      className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
        active
          ? 'border-indigo-600 text-indigo-600'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
      }`}
    >
      <Icon size={16} />
      {tab.label}
    </button>
  )
}

function Alert({ type = 'info', children }) {
  const styles = {
    info:    'bg-blue-50 text-blue-700 border-blue-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    error:   'bg-red-50 text-red-700 border-red-200',
    success: 'bg-green-50 text-green-700 border-green-200',
  }
  return (
    <div className={`flex items-start gap-2 border rounded-lg px-4 py-3 text-sm ${styles[type]}`}>
      <AlertCircle size={16} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// TAB: OVERVIEW
// ════════════════════════════════════════════════════════════════════════════

function OverviewTab({ course }) {
  if (!course) return null
  const fields = [
    ['Code',         course.code],
    ['Name',         course.name],
    ['Department',   course.department],
    ['Credit Hours', course.credit_hours],
    ['Semester',     `${course.semester} ${course.year}`],
    ['Description',  course.description || '—'],
  ]
  return (
    <div className="max-w-2xl">
      <div className="card">
        <h3 className="font-semibold text-gray-900 mb-4">Course Information</h3>
        <dl className="space-y-3">
          {fields.map(([k, v]) => (
            <div key={k} className="grid grid-cols-3 gap-4">
              <dt className="text-sm font-medium text-gray-500">{k}</dt>
              <dd className="text-sm text-gray-900 col-span-2">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mt-4 card bg-indigo-50 border-indigo-100">
        <h4 className="font-semibold text-indigo-900 mb-3">FCAR Workflow Checklist</h4>
        <ol className="space-y-2 text-sm text-indigo-800">
          {[
            'Upload course syllabus and evidence files (Evidence Files tab)',
            'Define Course Learning Outcomes (CLO Mapping tab)',
            'Map each CLO to an NCAAA domain and Bloom\'s level',
            'Add students and enter CLO scores (Grade Entry tab)',
            'Calculate attainment and view the FCAR report (Attainment Report tab)',
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="w-5 h-5 bg-indigo-200 text-indigo-700 rounded-full text-xs flex items-center justify-center font-bold shrink-0 mt-0.5">{i+1}</span>
              {step}
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// TAB: DOCUMENTS
// ════════════════════════════════════════════════════════════════════════════

function DocumentsTab({ courseId }) {
  const [docs, setDocs]           = useState([])
  const [loading, setLoading]     = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError]         = useState('')
  const [dragOver, setDragOver]   = useState(false)
  const [form, setForm]           = useState({ document_type: 'syllabus', description: '' })
  const fileRef                   = useRef()

  const load = () =>
    getDocuments(courseId).then(r => setDocs(r.data)).finally(() => setLoading(false))

  useEffect(() => { load() }, [courseId])

  const handleUpload = async (files) => {
    if (!files?.length) return
    setUploading(true)
    setError('')
    try {
      for (const file of Array.from(files)) {
        await uploadDocument(courseId, file, form.document_type, form.description)
      }
      await load()
    } catch (err) {
      setError(err.response?.data?.detail || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    handleUpload(e.dataTransfer.files)
  }

  const handleDelete = async (docId) => {
    if (!confirm('Delete this file?')) return
    await deleteDocument(docId)
    setDocs(ds => ds.filter(d => d.id !== docId))
  }

  const fileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  const docTypeLabel = (type) => DOC_TYPES.find(d => d.value === type)?.label || type

  const iconColor = {
    pdf: 'text-red-500', docx: 'text-blue-500', doc: 'text-blue-500',
    xlsx: 'text-green-500', xls: 'text-green-500',
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Upload zone */}
      <div className="card">
        <h3 className="font-semibold text-gray-900 mb-4">Upload Evidence Files</h3>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="label">Document Type</label>
            <select className="input" value={form.document_type}
              onChange={e => setForm(f => ({ ...f, document_type: e.target.value }))}>
              {DOC_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Description (optional)</label>
            <input className="input" placeholder="e.g. Fall 2025 Midterm"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
        </div>

        {error && <Alert type="error">{error}</Alert>}

        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`mt-4 border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
            dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
          }`}
        >
          <Upload size={32} className="mx-auto mb-3 text-gray-400" />
          <p className="text-sm font-medium text-gray-700">Drop files here or click to browse</p>
          <p className="text-xs text-gray-400 mt-1">Supported: PDF, DOCX, DOC, XLSX, XLS</p>
          {uploading && <p className="text-xs text-indigo-600 mt-2 font-medium animate-pulse">Uploading…</p>}
        </div>
        <input ref={fileRef} type="file" multiple className="hidden"
          accept=".pdf,.docx,.doc,.xlsx,.xls"
          onChange={e => handleUpload(e.target.files)} />
      </div>

      {/* Document list */}
      <div className="card">
        <h3 className="font-semibold text-gray-900 mb-4">
          Stored Evidence ({docs.length} file{docs.length !== 1 ? 's' : ''})
        </h3>

        {loading ? (
          <div className="space-y-3">
            {[1,2].map(i => <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />)}
          </div>
        ) : docs.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-6">No files uploaded yet.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {docs.map(doc => (
              <div key={doc.id} className="flex items-center gap-3 py-3">
                <FileText size={20} className={iconColor[doc.file_type] || 'text-gray-400'} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{doc.original_name}</p>
                  <p className="text-xs text-gray-400">
                    {docTypeLabel(doc.document_type)} · {fileSize(doc.file_size)} ·{' '}
                    {new Date(doc.uploaded_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={async () => {
                    try {
                      const url = await getDocumentUrl(doc.filename)
                      window.open(url, '_blank')
                    } catch { alert('Could not generate download link.') }
                  }}
                  className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded"
                  title="Download"
                >
                  <Download size={15} />
                </button>
                <button
                  onClick={() => handleDelete(doc.id)}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                  title="Delete"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// TAB: CLO MAPPING
// ════════════════════════════════════════════════════════════════════════════

const EMPTY_CLO = {
  code: '', description: '', ncaaa_domain: NCAAA_DOMAINS[0],
  bloom_level: BLOOM_LEVELS[2], target_attainment: 70,
  passing_score: 60, plo_mapping: '', so_mapping: '',
}

function CLOForm({ initial, onSave, onCancel }) {
  const [form, setForm]   = useState(initial || EMPTY_CLO)
  const [loading, setLoading] = useState(false)
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await onSave({ ...form, target_attainment: Number(form.target_attainment), passing_score: Number(form.passing_score) })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">CLO Code *</label>
          <input required className="input" placeholder="CLO1" value={form.code} onChange={set('code')} />
        </div>
        <div>
          <label className="label">Bloom's Level</label>
          <select className="input" value={form.bloom_level} onChange={set('bloom_level')}>
            {BLOOM_LEVELS.map(b => <option key={b}>{b}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="label">Description *</label>
        <textarea required className="input" rows={2}
          placeholder="Students will be able to…"
          value={form.description} onChange={set('description')} />
      </div>

      <div>
        <label className="label">NCAAA Domain *</label>
        <select required className="input" value={form.ncaaa_domain} onChange={set('ncaaa_domain')}>
          {NCAAA_DOMAINS.map(d => <option key={d}>{d}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Target Attainment (%)</label>
          <input type="number" min={0} max={100} className="input" value={form.target_attainment} onChange={set('target_attainment')} />
        </div>
        <div>
          <label className="label">Passing Score (%)</label>
          <input type="number" min={0} max={100} className="input" value={form.passing_score} onChange={set('passing_score')} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">PLO Mapping</label>
          <input className="input" placeholder="PLO1, PLO3" value={form.plo_mapping} onChange={set('plo_mapping')} />
        </div>
        <div>
          <label className="label">SO Mapping</label>
          <input className="input" placeholder="SO1, SO2" value={form.so_mapping} onChange={set('so_mapping')} />
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={loading} className="btn-primary flex items-center gap-1">
          <Save size={14} /> {loading ? 'Saving…' : 'Save CLO'}
        </button>
      </div>
    </form>
  )
}

function CLOsTab({ courseId }) {
  const [clos, setClos]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing]   = useState(null)

  const load = () => getCLOs(courseId).then(r => setClos(r.data)).finally(() => setLoading(false))
  useEffect(() => { load() }, [courseId])

  const handleCreate = async (data) => {
    await createCLO(courseId, data)
    setShowForm(false)
    load()
  }

  const handleUpdate = async (cloId, data) => {
    await updateCLO(cloId, data)
    setEditing(null)
    load()
  }

  const handleDelete = async (cloId) => {
    if (!confirm('Delete this CLO and all its grade data?')) return
    await deleteCLO(cloId)
    setClos(cs => cs.filter(c => c.id !== cloId))
  }

  const domainBadge = {
    'Knowledge':                          'bg-blue-100 text-blue-700',
    'Cognitive Skills':                   'bg-violet-100 text-violet-700',
    'Interpersonal Skills & Responsibility': 'bg-emerald-100 text-emerald-700',
    'Communication, IT & Numerical Skills': 'bg-amber-100 text-amber-700',
    'Psychomotor Skills':                 'bg-rose-100 text-rose-700',
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{clos.length} CLO{clos.length !== 1 ? 's' : ''} defined</p>
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Add CLO
          </button>
        )}
      </div>

      {showForm && (
        <CLOForm onSave={handleCreate} onCancel={() => setShowForm(false)} />
      )}

      {loading ? (
        <div className="space-y-3">
          {[1,2].map(i => <div key={i} className="h-24 bg-white rounded-xl animate-pulse border border-gray-100" />)}
        </div>
      ) : clos.length === 0 && !showForm ? (
        <div className="card text-center py-12">
          <Target size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="font-medium text-gray-600 mb-1">No CLOs defined yet</p>
          <p className="text-sm text-gray-400 mb-4">Add Course Learning Outcomes and map them to NCAAA domains.</p>
          <button onClick={() => setShowForm(true)} className="btn-primary inline-flex items-center gap-2">
            <Plus size={16} /> Add First CLO
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {clos.map(clo => (
            <div key={clo.id} className="card">
              {editing === clo.id ? (
                <CLOForm
                  initial={clo}
                  onSave={(data) => handleUpdate(clo.id, data)}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-bold text-indigo-700">{clo.code}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${domainBadge[clo.ncaaa_domain] || 'bg-gray-100 text-gray-600'}`}>
                          {clo.ncaaa_domain}
                        </span>
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                          {clo.bloom_level}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700">{clo.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-400 flex-wrap">
                        <span>Target: <b className="text-gray-600">{clo.target_attainment}%</b></span>
                        <span>Pass score: <b className="text-gray-600">{clo.passing_score}%</b></span>
                        {clo.plo_mapping && <span>PLO: <b className="text-gray-600">{clo.plo_mapping}</b></span>}
                        {clo.so_mapping  && <span>SO: <b className="text-gray-600">{clo.so_mapping}</b></span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => setEditing(clo.id)} className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg">
                        <Edit2 size={15} />
                      </button>
                      <button onClick={() => handleDelete(clo.id)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// TAB: GRADE ENTRY
// ════════════════════════════════════════════════════════════════════════════

function GradeEntryTab({ courseId }) {
  const [students, setStudents]   = useState([])
  const [clos, setClos]           = useState([])
  const [grades, setGrades]       = useState({})     // key: `${studentId}|${cloId}` (pipe — UUID-safe)
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const [newStudent, setNewStudent] = useState({ student_id: '', name: '' })
  const [addingStudent, setAddingStudent] = useState(false)
  const [bulkText, setBulkText]   = useState('')
  const [showBulk, setShowBulk]   = useState(false)

  const load = async () => {
    setLoading(true)
    const [gRes, stRes] = await Promise.all([getGrades(courseId), getCourse(courseId)])
    const gradeData = gRes.data
    setStudents(gradeData.students)
    setClos(gradeData.clos)
    setGrades(gradeData.grades || {})
    setLoading(false)
  }

  useEffect(() => { load() }, [courseId])

  const handleGradeChange = (studentId, cloId, value) => {
    const key = `${studentId}|${cloId}`
    setGrades(g => ({ ...g, [key]: { score: value === '' ? '' : Number(value), max_score: 100 } }))
  }

  const handleSave = async () => {
    setSaving(true)
    const gradeList = []
    for (const [key, val] of Object.entries(grades)) {
      if (val.score === '' || val.score === null || val.score === undefined) continue
      const [student_id, clo_id] = key.split('|')   // UUIDs — no parseInt
      gradeList.push({ student_id, clo_id, score: Number(val.score), max_score: val.max_score || 100 })
    }
    try {
      await saveGrades(courseId, gradeList)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } finally {
      setSaving(false)
    }
  }

  const handleAddStudent = async () => {
    if (!newStudent.student_id || !newStudent.name) return
    setAddingStudent(true)
    try {
      await addStudent(courseId, newStudent)
      setNewStudent({ student_id: '', name: '' })
      await load()
    } finally {
      setAddingStudent(false)
    }
  }

  const handleDeleteStudent = async (id) => {
    if (!confirm('Remove this student and their grades?')) return
    await deleteStudent(id)
    setStudents(ss => ss.filter(s => s.id !== id))
  }

  const handleBulkImport = async () => {
    const lines = bulkText.trim().split('\n').filter(Boolean)
    const parsed = lines.map(line => {
      const [student_id, ...nameParts] = line.split(',')
      return { student_id: student_id?.trim(), name: nameParts.join(',').trim() }
    }).filter(s => s.student_id && s.name)
    if (!parsed.length) return
    await bulkAddStudents(courseId, parsed)
    setBulkText('')
    setShowBulk(false)
    await load()
  }

  const getGradeValue = (studentId, cloId) => {
    const key = `${studentId}|${cloId}`
    return grades[key]?.score ?? ''
  }

  if (loading) return <div className="text-center py-20 text-gray-400">Loading grade sheet…</div>

  if (clos.length === 0)
    return <Alert type="warning">Please define CLOs first (CLO Mapping tab) before entering grades.</Alert>

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Add students */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">Students ({students.length})</h3>
          <button onClick={() => setShowBulk(s => !s)} className="btn-secondary text-xs">
            {showBulk ? 'Cancel bulk' : 'Bulk import'}
          </button>
        </div>

        {showBulk ? (
          <div className="space-y-2">
            <p className="text-xs text-gray-500">One student per line: <code>student_id, Full Name</code></p>
            <textarea
              className="input font-mono text-xs" rows={5}
              placeholder={"S001, Ahmed Al-Rashidi\nS002, Fatima Al-Zahrani"}
              value={bulkText} onChange={e => setBulkText(e.target.value)}
            />
            <button onClick={handleBulkImport} className="btn-primary text-xs">Import Students</button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input className="input text-sm" placeholder="Student ID" value={newStudent.student_id}
              onChange={e => setNewStudent(s => ({ ...s, student_id: e.target.value }))} />
            <input className="input text-sm" placeholder="Full Name" value={newStudent.name}
              onChange={e => setNewStudent(s => ({ ...s, name: e.target.value }))} />
            <button onClick={handleAddStudent} disabled={addingStudent} className="btn-primary shrink-0">
              <Plus size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Grade matrix */}
      {students.length === 0 ? (
        <Alert type="info">Add students above to start entering grades.</Alert>
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <h3 className="font-semibold text-gray-900">CLO Grade Entry (score out of 100)</h3>
            <div className="flex items-center gap-2">
              {saved && (
                <span className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle size={14} /> Saved
                </span>
              )}
              <button onClick={handleSave} disabled={saving} className="btn-primary text-sm flex items-center gap-1">
                <Save size={14} /> {saving ? 'Saving…' : 'Save Grades'}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 sticky left-0 bg-gray-50 min-w-[180px]">Student</th>
                  {clos.map(c => (
                    <th key={c.id} className="px-4 py-3 font-medium text-gray-500 text-center min-w-[110px]">
                      <div>{c.code}</div>
                      <div className="text-xs font-normal text-gray-400">Pass ≥ {c.passing_score}%</div>
                    </th>
                  ))}
                  <th className="px-4 py-3 font-medium text-gray-500 text-center w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {students.map((student, idx) => (
                  <tr key={student.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                    <td className="px-4 py-2 sticky left-0 bg-inherit">
                      <p className="font-medium text-gray-900 text-xs">{student.name}</p>
                      <p className="text-xs text-gray-400">{student.student_id}</p>
                    </td>
                    {clos.map(c => {
                      const val = getGradeValue(student.id, c.id)
                      const pctVal = val !== '' ? pct(val, 100) : null
                      const passing = pctVal !== null && pctVal >= c.passing_score
                      return (
                        <td key={c.id} className="px-2 py-1.5 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <input
                              type="number" min={0} max={100} step={0.5}
                              className={`w-20 text-center border rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                                pctVal !== null
                                  ? passing
                                    ? 'border-green-300 bg-green-50'
                                    : 'border-red-300 bg-red-50'
                                  : 'border-gray-300'
                              }`}
                              value={val}
                              onChange={e => handleGradeChange(student.id, c.id, e.target.value)}
                              placeholder="—"
                            />
                            {pctVal !== null && (
                              <span className={`text-xs font-medium ${passing ? 'text-green-600' : 'text-red-500'}`}>
                                {pctVal.toFixed(0)}%
                              </span>
                            )}
                          </div>
                        </td>
                      )
                    })}
                    <td className="px-2 py-2 text-center">
                      <button onClick={() => handleDeleteStudent(student.id)} className="p-1 text-gray-300 hover:text-red-500">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// TAB: ATTAINMENT REPORT
// ════════════════════════════════════════════════════════════════════════════

const DOMAIN_COLORS = {
  'Knowledge':                          '#6366f1',
  'Cognitive Skills':                   '#8b5cf6',
  'Interpersonal Skills & Responsibility': '#10b981',
  'Communication, IT & Numerical Skills': '#f59e0b',
  'Psychomotor Skills':                 '#ef4444',
}

function ReportTab({ courseId }) {
  const [report, setReport]     = useState(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const handleCalculate = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await calculateAttainment(courseId)
      setReport(res.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Calculation failed. Ensure students and grades are entered.')
    } finally {
      setLoading(false)
    }
  }

  const chartData = report?.clo_results?.map(r => ({
    name: r.clo_code,
    attainment: r.attainment_percentage,
    target: r.target_attainment,
  })) || []

  const domainData = report
    ? Object.entries(report.ncaaa_domain_summary).map(([domain, stats]) => ({
        domain: domain.split(' ')[0],        // short name
        fullDomain: domain,
        attainment: stats.average_attainment,
        met: stats.met,
        total: stats.total,
      }))
    : []

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Calculate button */}
      <div className="card flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">FCAR Attainment Calculation</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Calculates CLO attainment based on entered grades against NCAAA standards.
          </p>
        </div>
        <button onClick={handleCalculate} disabled={loading} className="btn-primary flex items-center gap-2">
          <BarChart3 size={16} />
          {loading ? 'Calculating…' : 'Calculate Attainment'}
        </button>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {report && (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Overall Attainment', value: `${fmt(report.overall_attainment)}%`, color: report.overall_attainment >= 70 ? 'text-green-600' : 'text-red-500' },
              { label: 'Total Students', value: report.total_students },
              { label: 'CLOs Met', value: `${report.clo_results.filter(r => r.status === 'Met').length} / ${report.clo_results.length}` },
              { label: 'Domains Covered', value: Object.keys(report.ncaaa_domain_summary).length },
            ].map(({ label, value, color }) => (
              <div key={label} className="card text-center py-4">
                <p className={`text-2xl font-bold ${color || 'text-gray-900'}`}>{value}</p>
                <p className="text-xs text-gray-500 mt-1">{label}</p>
              </div>
            ))}
          </div>

          {/* CLO Attainment Chart */}
          <div className="card">
            <h4 className="font-semibold text-gray-900 mb-4">CLO Attainment vs. Target</h4>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} unit="%" />
                <Tooltip formatter={(v) => `${v}%`} />
                <Legend />
                <Bar dataKey="attainment" name="Attainment %" radius={[4,4,0,0]}>
                  {chartData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.attainment >= entry.target ? '#10b981' : '#ef4444'}
                    />
                  ))}
                </Bar>
                <Bar dataKey="target" name="Target %" fill="#6366f1" opacity={0.3} radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Domain Summary */}
          <div className="card">
            <h4 className="font-semibold text-gray-900 mb-4">NCAAA Domain Summary</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {domainData.map(d => (
                <div key={d.fullDomain} className="border border-gray-100 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-sm font-medium text-gray-800">{d.fullDomain}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                      d.met === d.total ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {d.met}/{d.total} Met
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div
                        className="h-2 rounded-full transition-all"
                        style={{
                          width: `${d.attainment}%`,
                          backgroundColor: DOMAIN_COLORS[d.fullDomain] || '#6366f1'
                        }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-gray-700 w-12 text-right">{fmt(d.attainment)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CLO Detail Table */}
          <div className="card overflow-hidden p-0">
            <div className="px-6 py-4 border-b">
              <h4 className="font-semibold text-gray-900">CLO Detail Results</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {['CLO', 'Description', 'Domain', 'Bloom', 'Avg Score', 'Students Passing', 'Attainment', 'Target', 'Status'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {report.clo_results.map(r => (
                    <tr key={r.clo_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-bold text-indigo-700">{r.clo_code}</td>
                      <td className="px-4 py-3 text-gray-700 max-w-xs">
                        <p className="truncate" title={r.description}>{r.description}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full whitespace-nowrap">
                          {r.ncaaa_domain.split(' ')[0]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{r.bloom_level}</td>
                      <td className="px-4 py-3 text-gray-700">{fmt(r.average_score)}%</td>
                      <td className="px-4 py-3 text-gray-700">{r.students_passing} / {r.total_students}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-gray-100 rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full ${r.status === 'Met' ? 'bg-green-500' : 'bg-red-400'}`}
                              style={{ width: `${Math.min(r.attainment_percentage, 100)}%` }}
                            />
                          </div>
                          <span className="font-semibold text-gray-800">{fmt(r.attainment_percentage)}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{r.target_attainment}%</td>
                      <td className="px-4 py-3">
                        <span className={r.status === 'Met' ? 'badge-met' : 'badge-not-met'}>
                          {r.status === 'Met' ? <CheckCircle size={11} /> : <AlertCircle size={11} />}
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Improvement Suggestions */}
          {report.clo_results.some(r => r.status === 'Not Met') && (
            <div className="card border-amber-100 bg-amber-50">
              <h4 className="font-semibold text-amber-900 mb-3 flex items-center gap-2">
                <AlertCircle size={16} /> Improvement Suggestions
              </h4>
              <ul className="space-y-2">
                {report.clo_results.filter(r => r.status === 'Not Met').map(r => (
                  <li key={r.clo_id} className="text-sm text-amber-800">
                    <span className="font-semibold">{r.clo_code}:</span>{' '}
                    Attainment {fmt(r.attainment_percentage)}% is below target {r.target_attainment}%.
                    Consider revising instructional strategies, increasing formative assessments, or
                    providing additional learning resources for "{r.description}".
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN: CourseDetail
// ════════════════════════════════════════════════════════════════════════════

export default function CourseDetail() {
  const { courseId } = useParams()
  const [course, setCourse] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    getCourse(courseId)
      .then(r => setCourse(r.data))
      .finally(() => setLoading(false))
  }, [courseId])

  if (loading) return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="h-8 w-48 bg-gray-200 rounded animate-pulse mb-4" />
      <div className="h-64 bg-white rounded-xl animate-pulse border border-gray-100" />
    </div>
  )

  if (!course) return (
    <div className="p-8 text-center text-gray-500">
      Course not found. <Link to="/courses" className="text-indigo-600">Back to courses</Link>
    </div>
  )

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
        <Link to="/courses" className="hover:text-gray-600">Courses</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">{course.code}</span>
      </div>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{course.code} — {course.name}</h1>
        <p className="text-gray-500 text-sm mt-1">{course.department} · {course.semester} {course.year} · {course.credit_hours} credit hours</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex overflow-x-auto">
          {TABS.map(tab => (
            <TabButton
              key={tab.id}
              tab={tab}
              active={activeTab === tab.id}
              onClick={setActiveTab}
            />
          ))}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'overview'  && <OverviewTab course={course} />}
      {activeTab === 'documents' && <DocumentsTab courseId={courseId} />}
      {activeTab === 'clos'      && <CLOsTab courseId={courseId} />}
      {activeTab === 'grades'    && <GradeEntryTab courseId={courseId} />}
      {activeTab === 'report'    && <ReportTab courseId={courseId} />}
    </div>
  )
}
