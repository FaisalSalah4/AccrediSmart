import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  getCourse, getDocuments, uploadDocument, deleteDocument, getDocumentUrl,
  getCLOs, updateCLO,
} from '../api'
import { EVIDENCE_TYPES } from '../constants'
import {
  Upload, FileText, Trash2, Download, X, Edit2, Save,
  BarChart3, BookOpen, Target, AlertCircle, CheckCircle, Lock,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell,
} from 'recharts'

// ── Constants ────────────────────────────────────────────────────────────────

const NCAAA_DOMAINS = [
  'Knowledge',
  'Cognitive Skills',
  'Interpersonal Skills & Responsibility',
  'Communication, IT & Numerical Skills',
  'Psychomotor Skills',
]

const TABS = [
  { id: 'overview',  label: 'Overview',          icon: BookOpen  },
  { id: 'documents', label: 'Evidence Files',     icon: FileText  },
  { id: 'clos',      label: 'CLO Mapping',        icon: Target    },
  { id: 'report',    label: 'Attainment Report',  icon: BarChart3 },
]

// Tabs that require all 9 evidence categories to be uploaded
const LOCKED_TABS = new Set(['clos', 'report'])

const fmt = (n) => (typeof n === 'number' ? n.toFixed(1) : '—')

// ── Shared helpers ────────────────────────────────────────────────────────────

function TabButton({ tab, active, onClick, locked }) {
  const Icon = tab.icon
  return (
    <button
      onClick={() => !locked && onClick(tab.id)}
      title={locked ? 'Upload all 9 evidence categories to unlock this tab' : undefined}
      className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
        ${locked
          ? 'border-transparent text-gray-300 cursor-not-allowed select-none'
          : active
            ? 'border-indigo-600 text-indigo-600'
            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
        }`}
    >
      <Icon size={16} />
      {tab.label}
      {locked && <Lock size={12} className="text-gray-300" />}
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

const fileSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
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
            'Upload evidence files for all 9 required categories (Evidence Files tab)',
            'Review auto-populated CLOs and adjust target attainment percentages if needed (CLO Mapping tab)',
            'Verify CLO mappings to Program Learning Outcomes (PLOs) and Student Outcomes (SOs)',
            'Calculate attainment based on evidence assessment (Attainment Report tab)',
            'Generate and review the FCAR compliance report',
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="w-5 h-5 bg-indigo-200 text-indigo-700 rounded-full text-xs flex items-center justify-center font-bold shrink-0 mt-0.5">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// TAB: EVIDENCE FILES
// ════════════════════════════════════════════════════════════════════════════

/** A single evidence-type section with its own upload trigger and file list */
function EvidenceSection({ type, files, courseId, onRefresh }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError]         = useState('')
  const fileRef                   = useRef()

  const handleUpload = async (inputFiles) => {
    if (!inputFiles?.length) return
    setUploading(true)
    setError('')
    try {
      for (const file of Array.from(inputFiles)) {
        await uploadDocument(courseId, file, type.value, '')
      }
      onRefresh()
    } catch (err) {
      setError(err.response?.data?.detail || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (docId) => {
    if (!confirm('Delete this file?')) return
    try {
      await deleteDocument(docId)
      onRefresh()
    } catch {
      alert('Failed to delete file.')
    }
  }

  const hasFiles = files.length > 0

  return (
    <div className={`border rounded-xl overflow-hidden ${
      hasFiles ? 'border-green-200' : 'border-gray-200'
    }`}>
      {/* Section header */}
      <div className={`flex items-center justify-between px-4 py-3 ${
        hasFiles ? 'bg-green-50' : 'bg-gray-50'
      }`}>
        <div className="flex items-center gap-2 min-w-0">
          {hasFiles
            ? <CheckCircle size={15} className="text-green-500 shrink-0" />
            : <AlertCircle size={15} className="text-amber-400 shrink-0" />}
          <span className={`text-sm font-medium truncate ${
            hasFiles ? 'text-green-800' : 'text-gray-700'
          }`}>
            {type.label}
          </span>
          {hasFiles && (
            <span className="text-xs bg-green-100 text-green-700 rounded-full px-2 py-0.5 shrink-0">
              {files.length} file{files.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!hasFiles && (
            <span className="text-xs text-amber-500 font-semibold">Required</span>
          )}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1 text-xs btn-secondary py-1 px-2"
          >
            <Upload size={11} />
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
          <input
            ref={fileRef} type="file" multiple className="hidden"
            accept=".pdf,.docx,.doc,.xlsx,.xls"
            onChange={e => handleUpload(e.target.files)}
          />
        </div>
      </div>

      {/* Upload error */}
      {error && (
        <div className="px-4 py-2 bg-red-50 text-red-600 text-xs border-t border-red-100">
          {error}
        </div>
      )}

      {/* File list */}
      {hasFiles && (
        <div className="divide-y divide-gray-50">
          {files.map(doc => (
            <div key={doc.id} className="flex items-center gap-3 px-4 py-2.5 bg-white">
              <FileText size={14} className="text-gray-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 truncate">{doc.original_name}</p>
                <p className="text-xs text-gray-400">
                  {fileSize(doc.file_size)} · {new Date(doc.uploaded_at).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={async () => {
                  try { window.open(await getDocumentUrl(doc.filename), '_blank') }
                  catch { alert('Could not generate download link.') }
                }}
                className="p-1 text-gray-400 hover:text-indigo-600 rounded"
                title="Download"
              >
                <Download size={13} />
              </button>
              <button
                onClick={() => handleDelete(doc.id)}
                className="p-1 text-gray-400 hover:text-red-500 rounded"
                title="Delete"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DocumentsTab({ courseId, onCoverageChange }) {
  const [docs, setDocs]       = useState([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    const r = await getDocuments(courseId)
    setDocs(r.data)
    const covered = new Set(r.data.map(d => d.document_type))
    onCoverageChange(covered)
    setLoading(false)
  }

  useEffect(() => { load() }, [courseId])

  // Group docs by evidence type
  const docsByType = {}
  EVIDENCE_TYPES.forEach(t => { docsByType[t.value] = [] })
  docs.forEach(d => {
    if (docsByType[d.document_type] !== undefined) docsByType[d.document_type].push(d)
  })

  const coveredCount = EVIDENCE_TYPES.filter(t => docsByType[t.value].length > 0).length
  const allComplete  = coveredCount === EVIDENCE_TYPES.length

  return (
    <div className="space-y-3 max-w-3xl">
      {/* Progress bar */}
      <div className="card py-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-gray-900 text-sm">Evidence File Progress</h3>
          <span className={`text-sm font-bold ${allComplete ? 'text-green-600' : 'text-amber-600'}`}>
            {coveredCount}/{EVIDENCE_TYPES.length} Categories Complete
          </span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all duration-500 ${
              allComplete ? 'bg-green-500' : 'bg-amber-400'
            }`}
            style={{ width: `${(coveredCount / EVIDENCE_TYPES.length) * 100}%` }}
          />
        </div>
        {!allComplete && (
          <p className="text-xs text-amber-600 mt-2">
            Upload at least one file in every category to unlock CLO Mapping and the Attainment Report.
          </p>
        )}
        {allComplete && (
          <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
            <CheckCircle size={12} /> All evidence categories uploaded — CLO Mapping and Attainment Report are now unlocked.
          </p>
        )}
      </div>

      {/* Evidence type sections */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-14 bg-white rounded-xl animate-pulse border border-gray-100" />
          ))}
        </div>
      ) : (
        EVIDENCE_TYPES.map(type => (
          <EvidenceSection
            key={type.value}
            type={type}
            files={docsByType[type.value]}
            courseId={courseId}
            onRefresh={load}
          />
        ))
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// TAB: CLO MAPPING
// ════════════════════════════════════════════════════════════════════════════

const DOMAIN_BADGE = {
  'Knowledge':                              'bg-blue-100 text-blue-700',
  'Cognitive Skills':                       'bg-violet-100 text-violet-700',
  'Interpersonal Skills & Responsibility':  'bg-emerald-100 text-emerald-700',
  'Communication, IT & Numerical Skills':   'bg-amber-100 text-amber-700',
  'Psychomotor Skills':                     'bg-rose-100 text-rose-700',
}

function CLOsTab({ courseId }) {
  const [clos, setClos]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [editValues, setEditValues] = useState({})
  const [saving, setSaving]     = useState(false)

  const load = () =>
    getCLOs(courseId).then(r => setClos(r.data)).finally(() => setLoading(false))

  useEffect(() => { load() }, [courseId])

  const startEdit = (clo) => {
    setEditingId(clo.id)
    setEditValues({
      target_attainment: clo.target_attainment,
      passing_score:     clo.passing_score,
    })
  }

  const handleSave = async (cloId) => {
    setSaving(true)
    try {
      await updateCLO(cloId, {
        target_attainment: Math.min(90, Math.max(60, Number(editValues.target_attainment))),
        passing_score:     Math.min(80, Math.max(50, Number(editValues.passing_score))),
      })
      setEditingId(null)
      load()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <Alert type="info">
        CLOs are pre-populated based on department standards. You may only adjust the{' '}
        <strong>Target Attainment</strong> (60–90%) and <strong>Passing Score</strong> (50–80%).
        All other fields are fixed.
      </Alert>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-white rounded-xl animate-pulse border border-gray-100" />
          ))}
        </div>
      ) : clos.length === 0 ? (
        <div className="card text-center py-12">
          <Target size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="font-medium text-gray-600 mb-1">No CLOs found</p>
          <p className="text-sm text-gray-400">
            CLOs should have been auto-populated when this course was created.
            Contact an administrator if they are missing.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {clos.map(clo => (
            <div key={clo.id} className="card">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  {/* Code + badges */}
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-bold text-indigo-700">{clo.code}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      DOMAIN_BADGE[clo.ncaaa_domain] || 'bg-gray-100 text-gray-600'
                    }`}>
                      {clo.ncaaa_domain}
                    </span>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                      {clo.bloom_level}
                    </span>
                  </div>

                  <p className="text-sm text-gray-700 mb-3">{clo.description}</p>

                  {/* Edit form or read-only values */}
                  {editingId === clo.id ? (
                    <div className="flex items-end gap-3 flex-wrap">
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">
                          Target Attainment % <span className="text-gray-400">(60–90)</span>
                        </label>
                        <input
                          type="number" min={60} max={90} className="input w-24 text-sm"
                          value={editValues.target_attainment}
                          onChange={e => setEditValues(v => ({ ...v, target_attainment: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">
                          Passing Score % <span className="text-gray-400">(50–80)</span>
                        </label>
                        <input
                          type="number" min={50} max={80} className="input w-24 text-sm"
                          value={editValues.passing_score}
                          onChange={e => setEditValues(v => ({ ...v, passing_score: e.target.value }))}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSave(clo.id)}
                          disabled={saving}
                          className="btn-primary text-xs flex items-center gap-1"
                        >
                          <Save size={12} /> {saving ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="btn-secondary text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-4 text-xs text-gray-400 flex-wrap">
                      <span>Target: <b className="text-gray-600">{clo.target_attainment}%</b></span>
                      <span>Pass score: <b className="text-gray-600">{clo.passing_score}%</b></span>
                      {clo.plo_mapping && <span>PLO: <b className="text-gray-600">{clo.plo_mapping}</b></span>}
                      {clo.so_mapping  && <span>SO: <b className="text-gray-600">{clo.so_mapping}</b></span>}
                    </div>
                  )}
                </div>

                {editingId !== clo.id && (
                  <button
                    onClick={() => startEdit(clo)}
                    className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg shrink-0"
                    title="Adjust targets"
                  >
                    <Edit2 size={15} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// TAB: ATTAINMENT REPORT
// ════════════════════════════════════════════════════════════════════════════

const DOMAIN_COLORS = {
  'Knowledge':                              '#6366f1',
  'Cognitive Skills':                       '#8b5cf6',
  'Interpersonal Skills & Responsibility':  '#10b981',
  'Communication, IT & Numerical Skills':   '#f59e0b',
  'Psychomotor Skills':                     '#ef4444',
}

function ReportTab({ courseId, course, evidenceCoveredCount }) {
  const [clos, setClos]       = useState([])
  const [loading, setLoading] = useState(false)
  const [generated, setGenerated] = useState(false)

  const handleGenerate = async () => {
    setLoading(true)
    try {
      const r = await getCLOs(courseId)
      setClos(r.data)
      setGenerated(true)
    } finally {
      setLoading(false)
    }
  }

  // NCAAA domain summary
  const domainSummary = {}
  clos.forEach(c => {
    if (!domainSummary[c.ncaaa_domain]) {
      domainSummary[c.ncaaa_domain] = { clos: [], avgTarget: 0 }
    }
    domainSummary[c.ncaaa_domain].clos.push(c)
  })
  Object.values(domainSummary).forEach(d => {
    d.avgTarget = d.clos.reduce((s, c) => s + c.target_attainment, 0) / d.clos.length
  })

  const chartData = clos.map(c => ({
    name:   c.code,
    target: c.target_attainment,
  }))

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Generate button */}
      <div className="card flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">FCAR Portfolio Report</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Generates a structured CLO attainment report based on the course portfolio evidence.
          </p>
        </div>
        <button onClick={handleGenerate} disabled={loading} className="btn-primary flex items-center gap-2">
          <BarChart3 size={16} />
          {loading ? 'Generating…' : 'Generate Report'}
        </button>
      </div>

      {/* Evidence completion status */}
      <div className={`card border ${
        evidenceCoveredCount === EVIDENCE_TYPES.length
          ? 'border-green-200 bg-green-50'
          : 'border-amber-200 bg-amber-50'
      }`}>
        <div className="flex items-center gap-2">
          {evidenceCoveredCount === EVIDENCE_TYPES.length
            ? <CheckCircle size={16} className="text-green-600" />
            : <AlertCircle size={16} className="text-amber-600" />}
          <span className={`text-sm font-medium ${
            evidenceCoveredCount === EVIDENCE_TYPES.length ? 'text-green-800' : 'text-amber-800'
          }`}>
            Evidence Files: {evidenceCoveredCount}/{EVIDENCE_TYPES.length} categories uploaded
          </span>
        </div>
      </div>

      {generated && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[
              { label: 'Total CLOs',        value: clos.length },
              { label: 'Domains Covered',   value: Object.keys(domainSummary).length },
              { label: 'Evidence Complete',
                value: `${evidenceCoveredCount}/${EVIDENCE_TYPES.length}`,
                color: evidenceCoveredCount === EVIDENCE_TYPES.length ? 'text-green-600' : 'text-amber-600'
              },
            ].map(({ label, value, color }) => (
              <div key={label} className="card text-center py-4">
                <p className={`text-2xl font-bold ${color || 'text-gray-900'}`}>{value}</p>
                <p className="text-xs text-gray-500 mt-1">{label}</p>
              </div>
            ))}
          </div>

          {/* CLO Target Chart */}
          {clos.length > 0 && (
            <div className="card">
              <h4 className="font-semibold text-gray-900 mb-4">CLO Target Attainment Overview</h4>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} unit="%" />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <Legend />
                  <Bar dataKey="target" name="Target %" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={Object.values(DOMAIN_COLORS)[i % 5]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* CLO Detail Table */}
          <div className="card overflow-hidden p-0">
            <div className="px-6 py-4 border-b">
              <h4 className="font-semibold text-gray-900">CLO Portfolio Summary</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {['CLO', 'Description', 'NCAAA Domain', 'Bloom Level', 'Target %', 'Pass Score %', 'PLO', 'SO'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {clos.map(c => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-bold text-indigo-700">{c.code}</td>
                      <td className="px-4 py-3 text-gray-700 max-w-xs">
                        <p className="truncate" title={c.description}>{c.description}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          DOMAIN_BADGE[c.ncaaa_domain] || 'bg-gray-100 text-gray-600'
                        }`}>
                          {c.ncaaa_domain.split(' ')[0]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{c.bloom_level}</td>
                      <td className="px-4 py-3 font-semibold text-gray-800">{c.target_attainment}%</td>
                      <td className="px-4 py-3 text-gray-600">{c.passing_score}%</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{c.plo_mapping || '—'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{c.so_mapping  || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* NCAAA Domain Summary */}
          {Object.keys(domainSummary).length > 0 && (
            <div className="card">
              <h4 className="font-semibold text-gray-900 mb-4">NCAAA Domain Coverage</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Object.entries(domainSummary).map(([domain, info]) => (
                  <div key={domain} className="border border-gray-100 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="text-sm font-medium text-gray-800">{domain}</p>
                      <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-semibold shrink-0">
                        {info.clos.length} CLO{info.clos.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-2">
                        <div
                          className="h-2 rounded-full transition-all"
                          style={{
                            width: `${info.avgTarget}%`,
                            backgroundColor: DOMAIN_COLORS[domain] || '#6366f1',
                          }}
                        />
                      </div>
                      <span className="text-sm font-semibold text-gray-700 w-14 text-right">
                        {fmt(info.avgTarget)}% avg
                      </span>
                    </div>
                  </div>
                ))}
              </div>
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
  const [course, setCourse]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [evidenceCovered, setEvidenceCovered] = useState(new Set())

  const allEvidenceComplete = evidenceCovered.size === EVIDENCE_TYPES.length

  useEffect(() => {
    getCourse(courseId)
      .then(r => setCourse(r.data))
      .finally(() => setLoading(false))
  }, [courseId])

  const handleTabClick = (tabId) => {
    if (LOCKED_TABS.has(tabId) && !allEvidenceComplete) return
    setActiveTab(tabId)
  }

  if (loading) return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="h-8 w-48 bg-gray-200 rounded animate-pulse mb-4" />
      <div className="h-64 bg-white rounded-xl animate-pulse border border-gray-100" />
    </div>
  )

  if (!course) return (
    <div className="p-8 text-center text-gray-500">
      Course not found.{' '}
      <Link to="/courses" className="text-indigo-600">Back to courses</Link>
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
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {course.code} — {course.name}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {course.department} · {course.semester} {course.year} · {course.credit_hours} credit hours
          </p>
        </div>

        {/* Evidence progress pill */}
        <div className={`shrink-0 flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full border ${
          allEvidenceComplete
            ? 'bg-green-50 border-green-200 text-green-700'
            : 'bg-amber-50 border-amber-200 text-amber-700'
        }`}>
          {allEvidenceComplete
            ? <CheckCircle size={13} />
            : <AlertCircle size={13} />}
          Evidence: {evidenceCovered.size}/{EVIDENCE_TYPES.length}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex overflow-x-auto">
          {TABS.map(tab => {
            const locked = LOCKED_TABS.has(tab.id) && !allEvidenceComplete
            return (
              <TabButton
                key={tab.id}
                tab={tab}
                active={activeTab === tab.id}
                onClick={handleTabClick}
                locked={locked}
              />
            )
          })}
        </div>
      </div>

      {/* Locked tab message */}
      {LOCKED_TABS.has(activeTab) && !allEvidenceComplete && (
        <Alert type="warning">
          This tab is locked until all {EVIDENCE_TYPES.length} evidence categories have at least one file uploaded.
          Go to <strong>Evidence Files</strong> to complete the uploads.
        </Alert>
      )}

      {/* Tab content */}
      {activeTab === 'overview' && <OverviewTab course={course} />}

      {activeTab === 'documents' && (
        <DocumentsTab
          courseId={courseId}
          onCoverageChange={setEvidenceCovered}
        />
      )}

      {activeTab === 'clos' && allEvidenceComplete && (
        <CLOsTab courseId={courseId} />
      )}

      {activeTab === 'report' && allEvidenceComplete && (
        <ReportTab
          courseId={courseId}
          course={course}
          evidenceCoveredCount={evidenceCovered.size}
        />
      )}
    </div>
  )
}
