import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  getCourse, getDocuments, uploadDocument, deleteDocument, getDocumentUrl,
  getCLOs, updateCLO,
  getStudents, addStudent, bulkAddStudents, deleteStudent,
  getAssessments, createAssessment, updateAssessment, deleteAssessment,
  getAssessmentItems, createAssessmentItem, updateAssessmentItem, deleteAssessmentItem,
  getCloItemMap, setCloItemMap,
  getItemGrades, saveItemGrades,
  calculateAttainment,
  getSONotes, saveSONotes,
  getSAQFNotes, saveSAQFNote,
  getCLORecommendations, saveCLORecommendation,
} from '../api'
import { EVIDENCE_TYPES, ASSESSMENT_TYPES } from '../constants'
import {
  Upload, FileText, Trash2, Download, X, Edit2, Save,
  BarChart3, BookOpen, Target, AlertCircle, CheckCircle, Lock,
  Users, ClipboardList, Link2, Plus, TrendingUp, Globe,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell,
} from 'recharts'

// ── ABET / SAQF Official Mapping Constants ────────────────────────────────────

const SO_DEFINITIONS = [
  { code: 'SO.1', plo: 'PLO2', saqf: 'CS',  label: 'SO.1 / PLO2', description: 'Cognitive Skills — Apply analytical and critical thinking to solve complex engineering problems.' },
  { code: 'SO.2', plo: 'PLO4', saqf: 'PPS', label: 'SO.2 / PLO4', description: 'Practical & Physical Skills — Communicate effectively with a range of audiences.' },
  { code: 'SO.3', plo: 'PLO6', saqf: 'CIS', label: 'SO.3 / PLO6', description: 'Communication & ICT Skills — Use ICT tools and communicate findings effectively.' },
  { code: 'SO.4', plo: 'PLO7', saqf: 'VE',  label: 'SO.4 / PLO7', description: 'Values & Ethics — Recognize ethical responsibilities; demonstrate professional values.' },
  { code: 'SO.5', plo: 'PLO8', saqf: 'AR',  label: 'SO.5 / PLO8', description: 'Autonomy & Responsibility — Work independently; take responsibility for outcomes.' },
  { code: 'SO.6', plo: 'PLO5', saqf: 'PPS', label: 'SO.6 / PLO5', description: 'Practical & Physical Skills — Apply practical skills to engineering solutions and experiments.' },
  { code: 'SO.7', plo: 'PLO3', saqf: 'CS',  label: 'SO.7 / PLO3', description: 'Cognitive Skills — Identify, formulate, and solve complex engineering problems.' },
  { code: 'SO.8', plo: 'PLO1', saqf: 'K&U', label: 'SO.8 / PLO1', description: 'Knowledge & Understanding — Demonstrate foundational knowledge of engineering principles.' },
]

const SAQF_DOMAINS = [
  { code: 'K&U',  label: 'Knowledge & Understanding',      soList: ['SO.8'] },
  { code: 'CS',   label: 'Cognitive Skills',               soList: ['SO.1', 'SO.7'] },
  { code: 'PPS',  label: 'Practical & Physical Skills',    soList: ['SO.2', 'SO.6'] },
  { code: 'CIS',  label: 'Communication & ICT Skills',     soList: ['SO.3'] },
  { code: 'VE',   label: 'Values & Ethics',                soList: ['SO.4'] },
  { code: 'AR',   label: 'Autonomy & Responsibility',      soList: ['SO.5'] },
]

const SAQF_DOMAIN_LABELS = Object.fromEntries(SAQF_DOMAINS.map(d => [d.code, d.label]))

/** Normalise "SO1" or "SO.1" → "SO.1"; returns null if unrecognised */
function normalizeSO(val) {
  if (!val) return null
  const m = String(val).match(/SO\.?(\d+)/i)
  return m ? `SO.${m[1]}` : null
}

/** Compute E/A/M/U performance vector from student pct scores (E>90, A>70, M>60, U≤60) */
function computeSOVector(mappedCLOs) {
  const first = mappedCLOs.find(r => r.student_item_scores?.length > 0)
  if (!first) return { E: 0, A: 0, M: 0, U: 0 }
  const studentIds = first.student_item_scores.map(s => s.student_id)
  let E = 0, A = 0, M = 0, U = 0
  for (const sid of studentIds) {
    const pcts = mappedCLOs.flatMap(clo => {
      const s = clo.student_item_scores?.find(ss => ss.student_id === sid)
      return s?.pct != null ? [s.pct] : []
    })
    if (!pcts.length) continue
    const avg = pcts.reduce((a, b) => a + b, 0) / pcts.length
    if (avg > 90) E++
    else if (avg > 70) A++
    else if (avg > 60) M++
    else U++
  }
  return { E, A, M, U }
}

/** Generate auto-recommendation based on attainment gap + CLO metadata */
function generateAutoRecommendation(cloResult) {
  if (cloResult.no_mapping) {
    return 'No assessment items mapped to this CLO. Please complete the CLO to item mapping.'
  }
  if (cloResult.status === 'Achieved') return null

  const gap   = cloResult.target_attainment - cloResult.attainment_percentage
  const topic = cloResult.description || 'this learning outcome'
  const domain = cloResult.ncaaa_domain || ''
  const bloom  = cloResult.bloom_level  || ''

  const domainCtx = domain.includes('Communication') || domain.includes('ICT')
    ? 'communication and ICT skills practice'
    : domain.includes('Interpersonal') || domain.includes('Responsibility') || domain.includes('Ethics') || domain.includes('Values')
    ? 'values, professional ethics, and teamwork activities'
    : domain.includes('Psychomotor') || domain.includes('Physical')
    ? 'hands-on laboratory and practical skill exercises'
    : 'assessment design and instructional alignment'

  const bloomAction = (bloom === 'Remember' || bloom === 'Understand')
    ? 'reinforcement activities and retrieval practice'
    : (bloom === 'Apply' || bloom === 'Analyze')
    ? 'problem-solving exercises and applied case studies'
    : 'higher-order synthesis and evaluation tasks'

  if (gap <= 5) {
    return `Consider supplemental formative assessments and targeted feedback for "${topic}" to close the attainment gap. Focus on ${bloomAction}.`
  } else if (gap <= 15) {
    return `Review the ${domainCtx} for "${topic}". Add mid-semester checkpoints and peer learning activities. Incorporate more ${bloomAction} to improve student performance.`
  } else {
    return `A comprehensive review of instructional strategies is recommended for "${topic}". Restructure assessment weighting, provide additional resources around ${domainCtx}, and schedule targeted review sessions with emphasis on ${bloomAction}.`
  }
}

/** Header row detection patterns for CSV/Excel import */
const HEADER_PATTERNS = /^(student_?id|id|name|student_?name|no\.?|number|#)$/i
function looksLikeHeader(cells) {
  if (!cells?.length) return false
  const c0 = String(cells[0] ?? '').trim()
  if (HEADER_PATTERNS.test(c0)) return true
  if (cells.length >= 2) {
    const c1 = String(cells[1] ?? '').trim()
    if (c0 && c1 && isNaN(Number(c0)) && isNaN(Number(c1))) return true
  }
  return false
}

// ── Tab / UI constants ────────────────────────────────────────────────────────

const NCAAA_DOMAINS = [
  'Knowledge',
  'Cognitive Skills',
  'Interpersonal Skills & Responsibility',
  'Communication, IT & Numerical Skills',
  'Psychomotor Skills',
]

const TABS = [
  { id: 'overview',    label: 'Overview',            icon: BookOpen      },
  { id: 'documents',   label: 'Evidence Files',      icon: FileText      },
  { id: 'clos',        label: 'CLOs',                icon: Target        },
  { id: 'assessments', label: 'Assessments',         icon: ClipboardList },
  { id: 'mapping',     label: 'CLO ↔ Items',         icon: Link2         },
  { id: 'students',    label: 'Students & Grades',   icon: Users         },
  { id: 'report',      label: 'Attainment Report',   icon: BarChart3     },
  { id: 'abet',        label: 'ABET SO Attainment',  icon: TrendingUp    },
  { id: 'saqf',        label: 'SAQF / NCAAA',        icon: Globe         },
]

const LOCKED_TABS = new Set(['clos', 'assessments', 'mapping', 'students', 'report', 'abet', 'saqf'])

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
            'Review auto-populated CLOs and adjust target attainment / passing score (CLOs tab — admin only)',
            'Define course assessments and their items (Assessments tab)',
            'Map each assessment item to the CLO(s) it measures (CLO ↔ Items tab)',
            'Add the student roster and enter per-item grades (Students & Grades tab)',
            'Generate the derived CLO attainment report (Attainment Report tab)',
            'Review ABET SO Attainment and SAQF/NCAAA Attainment tabs',
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="w-5 h-5 bg-indigo-200 text-indigo-700 rounded-full text-xs flex items-center justify-center font-bold shrink-0 mt-0.5">{i + 1}</span>
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

function EvidenceSection({ type, files, courseId, onRefresh }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError]         = useState('')
  const fileRef                   = useRef()

  const isTeachingMaterials = type.value === 'teaching_materials'

  const handleUpload = async (inputFiles) => {
    if (!inputFiles?.length) return
    setError('')

    // Validate file types
    for (const file of Array.from(inputFiles)) {
      const ext = file.name.split('.').pop().toLowerCase()
      if (isTeachingMaterials && ext !== 'zip') {
        setError('Only ZIP files are accepted for Copies of Teaching Materials')
        return
      }
    }

    setUploading(true)
    try {
      for (const file of Array.from(inputFiles)) {
        await uploadDocument(courseId, file, type.value, '')
      }
      onRefresh()
    } catch (err) {
      setError(err.response?.data?.detail || 'Upload failed')
    } finally { setUploading(false) }
  }

  const handleDelete = async (docId) => {
    if (!confirm('Delete this file?')) return
    try { await deleteDocument(docId); onRefresh() }
    catch { alert('Failed to delete file.') }
  }

  const hasFiles = files.length > 0

  return (
    <div className={`border rounded-xl overflow-hidden ${hasFiles ? 'border-green-200' : 'border-gray-200'}`}>
      <div className={`flex items-center justify-between px-4 py-3 ${hasFiles ? 'bg-green-50' : 'bg-gray-50'}`}>
        <div className="flex items-center gap-2 min-w-0">
          {hasFiles
            ? <CheckCircle size={15} className="text-green-500 shrink-0" />
            : <AlertCircle size={15} className="text-amber-400 shrink-0" />}
          <span className={`text-sm font-medium truncate ${hasFiles ? 'text-green-800' : 'text-gray-700'}`}>
            {type.label}
          </span>
          {hasFiles && (
            <span className="text-xs bg-green-100 text-green-700 rounded-full px-2 py-0.5 shrink-0">
              {files.length} file{files.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!hasFiles && <span className="text-xs text-amber-500 font-semibold">Required</span>}
          <div className="flex flex-col items-end gap-0.5">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1 text-xs btn-secondary py-1 px-2"
            >
              <Upload size={11} />
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
            {isTeachingMaterials && (
              <span className="text-[10px] text-gray-400">ZIP files only</span>
            )}
          </div>
          <input
            ref={fileRef} type="file" multiple className="hidden"
            accept={isTeachingMaterials ? '.zip' : '.pdf,.docx,.doc,.xlsx,.xls'}
            onChange={e => handleUpload(e.target.files)}
          />
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 bg-red-50 text-red-600 text-xs border-t border-red-100">{error}</div>
      )}

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
                className="p-1 text-gray-400 hover:text-indigo-600 rounded" title="Download"
              >
                <Download size={13} />
              </button>
              <button onClick={() => handleDelete(doc.id)} className="p-1 text-gray-400 hover:text-red-500 rounded" title="Delete">
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

  const docsByType = {}
  EVIDENCE_TYPES.forEach(t => { docsByType[t.value] = [] })
  docs.forEach(d => { if (docsByType[d.document_type] !== undefined) docsByType[d.document_type].push(d) })

  const coveredCount = EVIDENCE_TYPES.filter(t => docsByType[t.value].length > 0).length
  const allComplete  = coveredCount === EVIDENCE_TYPES.length

  return (
    <div className="space-y-3 max-w-3xl">
      <div className="card py-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-gray-900 text-sm">Evidence File Progress</h3>
          <span className={`text-sm font-bold ${allComplete ? 'text-green-600' : 'text-amber-600'}`}>
            {coveredCount}/{EVIDENCE_TYPES.length} Categories Complete
          </span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all duration-500 ${allComplete ? 'bg-green-500' : 'bg-amber-400'}`}
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
            <CheckCircle size={12} /> All evidence categories uploaded — FCAR workflow is now fully unlocked.
          </p>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-14 bg-white rounded-xl animate-pulse border border-gray-100" />)}
        </div>
      ) : (
        EVIDENCE_TYPES.map(type => (
          <EvidenceSection key={type.value} type={type} files={docsByType[type.value]} courseId={courseId} onRefresh={load} />
        ))
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// TAB: CLOs
// ════════════════════════════════════════════════════════════════════════════

const DOMAIN_BADGE = {
  'Knowledge':                              'bg-blue-100 text-blue-700',
  'Cognitive Skills':                       'bg-violet-100 text-violet-700',
  'Interpersonal Skills & Responsibility':  'bg-emerald-100 text-emerald-700',
  'Communication, IT & Numerical Skills':   'bg-amber-100 text-amber-700',
  'Psychomotor Skills':                     'bg-rose-100 text-rose-700',
}

function CLOsTab({ courseId }) {
  const { user }  = useAuth()
  const isAdmin   = user?.role === 'admin'

  const [clos, setClos]               = useState([])
  const [loading, setLoading]         = useState(true)
  const [editingId, setEditingId]     = useState(null)
  const [editValues, setEditValues]   = useState({})
  const [saving, setSaving]           = useState(false)
  const [saveError, setSaveError]     = useState('')

  const load = () =>
    getCLOs(courseId).then(r => setClos(r.data)).finally(() => setLoading(false))

  useEffect(() => { load() }, [courseId])

  const startEdit = (clo) => {
    setSaveError('')
    setEditingId(clo.id)
    setEditValues({ target_attainment: clo.target_attainment, passing_score: clo.passing_score })
  }

  const handleSave = async (cloId) => {
    setSaving(true); setSaveError('')
    try {
      await updateCLO(cloId, {
        target_attainment: Math.min(90, Math.max(60, Number(editValues.target_attainment))),
        passing_score:     Math.min(80, Math.max(50, Number(editValues.passing_score))),
      })
      setEditingId(null)
      load()
    } catch (err) {
      setSaveError(err.response?.data?.detail || 'Save failed')
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <Alert type="info">
        CLOs are pre-populated based on department standards.{' '}
        {isAdmin
          ? <>You may adjust the <strong>Target Attainment</strong> (60–90%) and <strong>Passing Score</strong> (50–80%).</>
          : <><Lock size={12} className="inline" /> Target Attainment and Passing Score can only be adjusted by administrators.</>
        }
      </Alert>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-24 bg-white rounded-xl animate-pulse border border-gray-100" />)}</div>
      ) : clos.length === 0 ? (
        <div className="card text-center py-12">
          <Target size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="font-medium text-gray-600 mb-1">No CLOs found</p>
          <p className="text-sm text-gray-400">CLOs should have been auto-populated when this course was created. Contact an administrator if they are missing.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {clos.map(clo => (
            <div key={clo.id} className="card">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-bold text-indigo-700">{clo.code}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DOMAIN_BADGE[clo.ncaaa_domain] || 'bg-gray-100 text-gray-600'}`}>
                      {clo.ncaaa_domain}
                    </span>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{clo.bloom_level}</span>
                  </div>
                  <p className="text-sm text-gray-700 mb-3">{clo.description}</p>

                  {editingId === clo.id ? (
                    <div className="space-y-2">
                      <div className="flex items-end gap-3 flex-wrap">
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Target Attainment % <span className="text-gray-400">(60–90)</span></label>
                          <input type="number" min={60} max={90} className="input w-24 text-sm"
                            value={editValues.target_attainment}
                            onChange={e => setEditValues(v => ({ ...v, target_attainment: e.target.value }))} />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Passing Score % <span className="text-gray-400">(50–80)</span></label>
                          <input type="number" min={50} max={80} className="input w-24 text-sm"
                            value={editValues.passing_score}
                            onChange={e => setEditValues(v => ({ ...v, passing_score: e.target.value }))} />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => handleSave(clo.id)} disabled={saving} className="btn-primary text-xs flex items-center gap-1">
                            <Save size={12} /> {saving ? 'Saving…' : 'Save'}
                          </button>
                          <button onClick={() => setEditingId(null)} className="btn-secondary text-xs">Cancel</button>
                        </div>
                      </div>
                      {saveError && <p className="text-xs text-red-600">{saveError}</p>}
                    </div>
                  ) : (
                    <div className="flex items-center gap-4 text-xs text-gray-400 flex-wrap">
                      <span>Target: <b className="text-gray-600">{clo.target_attainment}%</b></span>
                      <span>Pass score: <b className="text-gray-600">{clo.passing_score}%</b></span>
                      {clo.plo_mapping && <span>PLO: <b className="text-gray-600">{clo.plo_mapping}</b></span>}
                      {clo.so_mapping  && <span>SO: <b className="text-gray-600">{clo.so_mapping}</b></span>}
                      {!isAdmin && (
                        <span className="flex items-center gap-1 text-gray-300">
                          <Lock size={10} /> Admin only
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {editingId !== clo.id && isAdmin && (
                  <button onClick={() => startEdit(clo)}
                    className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg shrink-0" title="Adjust targets (admin)">
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
// TAB: ASSESSMENTS
// ════════════════════════════════════════════════════════════════════════════

const blankAssessment = { name: '', type: ASSESSMENT_TYPES[0], weight: '', total_mark: '' }

function AssessmentsTab({ courseId }) {
  const [assessments, setAssessments] = useState([])
  const [items,       setItems]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [showForm,    setShowForm]    = useState(false)
  const [editingId,   setEditingId]   = useState(null)
  const [form,        setForm]        = useState(blankAssessment)
  const [saving,      setSaving]      = useState(false)
  const [formErrors,  setFormErrors]  = useState({})

  const load = async () => {
    setLoading(true)
    try {
      const [a, i] = await Promise.all([getAssessments(courseId), getAssessmentItems(courseId)])
      setAssessments(a.data || [])
      setItems(i.data || [])
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [courseId])

  const validateForm = () => {
    const errs = {}
    const tm = Number(form.total_mark)
    const wt = Number(form.weight)
    if (!form.name.trim()) errs.name = 'Name is required'
    if (isNaN(tm) || tm <= 0) errs.total_mark = 'Total mark must be > 0'
    if (tm > 1000) errs.total_mark = 'Total mark must be ≤ 1000'
    if (isNaN(wt) || wt < 0 || wt > 100) errs.weight = 'Weight must be 0–100'
    // Weight total check
    const otherWeights = assessments
      .filter(a => a.id !== editingId)
      .reduce((s, a) => s + (Number(a.weight) || 0), 0)
    if (otherWeights + wt > 100) errs.weight_total = `Total weight across all assessments would be ${otherWeights + wt}% (warning: exceeds 100%)`
    setFormErrors(errs)
    return !errs.name && !errs.total_mark && !errs.weight
  }

  const startCreate = () => { setForm(blankAssessment); setEditingId(null); setShowForm(true); setFormErrors({}) }
  const startEdit   = (a) => { setForm({ name: a.name, type: a.type, weight: a.weight, total_mark: a.total_mark }); setEditingId(a.id); setShowForm(true); setFormErrors({}) }

  const normalizeNum = (val) => {
    const s = String(val).replace(/^0+(\d)/, '$1')
    return s === '' ? '' : s
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!validateForm()) return
    setSaving(true)
    try {
      const payload = { ...form, weight: Number(form.weight), total_mark: Number(form.total_mark) }
      if (editingId) await updateAssessment(editingId, payload)
      else           await createAssessment(courseId, payload)
      setShowForm(false); setEditingId(null); setForm(blankAssessment)
      load()
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to save assessment')
    } finally { setSaving(false) }
  }

  const remove = async (id) => {
    if (!confirm('Delete this assessment and ALL its items and grades?')) return
    try { await deleteAssessment(id); load() }
    catch (err) { alert(err.response?.data?.detail || 'Delete failed') }
  }

  const itemsFor = (assessmentId) => items.filter(it => it.assessment_id === assessmentId)

  return (
    <div className="space-y-4 max-w-4xl">
      <Alert type="info">
        Define each assessment and break it into items (Q1, Q2, …) for CLO mapping and grading.
      </Alert>

      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-500">{assessments.length} assessment{assessments.length === 1 ? '' : 's'} · {items.length} item{items.length === 1 ? '' : 's'} total</div>
        <button onClick={startCreate} className="btn-primary text-sm flex items-center gap-1"><Plus size={14} /> New Assessment</button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="card space-y-3">
          <h4 className="font-semibold text-gray-900">{editingId ? 'Edit Assessment' : 'New Assessment'}</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Name</label>
              <input required className={`input text-sm ${formErrors.name ? 'border-red-300' : ''}`} value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Midterm Exam" />
              {formErrors.name && <p className="text-xs text-red-600 mt-0.5">{formErrors.name}</p>}
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Type</label>
              <select className="input text-sm" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                {ASSESSMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Course Weight % <span className="text-gray-400">(0–100)</span></label>
              <input type="number" min={0} max={100} step={0.1} className={`input text-sm ${formErrors.weight ? 'border-red-300' : ''}`}
                value={form.weight}
                onChange={e => setForm(f => ({ ...f, weight: e.target.value }))}
                onBlur={e => setForm(f => ({ ...f, weight: normalizeNum(e.target.value) }))} />
              {formErrors.weight && <p className="text-xs text-red-600 mt-0.5">{formErrors.weight}</p>}
              {formErrors.weight_total && <p className="text-xs text-amber-600 mt-0.5">{formErrors.weight_total}</p>}
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Total Mark <span className="text-gray-400">(&gt;0, max 1000)</span></label>
              <input type="number" min={0.1} max={1000} step={0.1} className={`input text-sm ${formErrors.total_mark ? 'border-red-300' : ''}`}
                value={form.total_mark}
                onChange={e => setForm(f => ({ ...f, total_mark: e.target.value }))}
                onBlur={e => setForm(f => ({ ...f, total_mark: normalizeNum(e.target.value) }))} />
              {formErrors.total_mark && <p className="text-xs text-red-600 mt-0.5">{formErrors.total_mark}</p>}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary text-sm">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary text-sm flex items-center gap-1">
              <Save size={13} /> {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="space-y-3">{[1, 2].map(i => <div key={i} className="h-24 bg-white rounded-xl animate-pulse border border-gray-100" />)}</div>
      ) : assessments.length === 0 ? (
        <div className="card text-center py-12">
          <ClipboardList size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="font-medium text-gray-600 mb-1">No assessments yet</p>
          <p className="text-sm text-gray-400">Click <strong>New Assessment</strong> to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {assessments.map(a => (
            <AssessmentCard key={a.id} assessment={a} items={itemsFor(a.id)} onEdit={() => startEdit(a)} onDelete={() => remove(a.id)} onItemsChange={load} />
          ))}
        </div>
      )}
    </div>
  )
}

function AssessmentCard({ assessment, items, onEdit, onDelete, onItemsChange }) {
  const [adding,        setAdding]        = useState(false)
  const [newItem,       setNewItem]       = useState({ name: '', full_mark: '' })
  const [busy,          setBusy]          = useState(false)
  const [editingItemId, setEditingItemId] = useState(null)
  const [editItem,      setEditItem]      = useState({ name: '', full_mark: '' })
  const [itemErrors,    setItemErrors]    = useState({})

  const totalMark   = Number(assessment.total_mark) || 0
  const itemsTotal  = items.reduce((s, it) => s + (Number(it.full_mark) || 0), 0)
  const itemsMismatch = items.length > 0 && itemsTotal !== totalMark

  const normalizeNum = (val) => String(val).replace(/^0+(\d)/, '$1')

  const validateItem = (fm) => {
    const n = Number(fm)
    if (isNaN(n) || n <= 0) return 'Full mark must be > 0'
    return ''
  }

  const addItem = async (e) => {
    e.preventDefault()
    const fmErr   = validateItem(newItem.full_mark)
    const trimName = newItem.name.trim()
    const dup      = items.find(it => it.name.trim().toLowerCase() === trimName.toLowerCase())
    const nameErr  = dup ? `An item named '${trimName}' already exists in this assessment.` : ''
    if (fmErr || nameErr) { setItemErrors({ new: fmErr, newName: nameErr }); return }
    setItemErrors({})
    setBusy(true)
    try {
      await createAssessmentItem(assessment.id, { name: trimName, full_mark: Number(newItem.full_mark) })
      setNewItem({ name: '', full_mark: '' }); setAdding(false)
      onItemsChange()
    } catch (err2) { alert(err2.response?.data?.detail || 'Failed to add item') }
    finally { setBusy(false) }
  }

  const startEditItem = (it) => { setEditingItemId(it.id); setEditItem({ name: it.name, full_mark: it.full_mark }); setItemErrors({}) }
  const saveEditItem  = async () => {
    const fmErr    = validateItem(editItem.full_mark)
    const trimName = editItem.name.trim()
    const dup      = items.find(it => it.id !== editingItemId && it.name.trim().toLowerCase() === trimName.toLowerCase())
    const nameErr  = dup ? `An item named '${trimName}' already exists in this assessment.` : ''
    if (fmErr || nameErr) { setItemErrors({ edit: fmErr, editName: nameErr }); return }
    setBusy(true)
    try { await updateAssessmentItem(editingItemId, { name: trimName, full_mark: Number(editItem.full_mark) }); setEditingItemId(null); onItemsChange() }
    catch (err2) { alert(err2.response?.data?.detail || 'Update failed') }
    finally { setBusy(false) }
  }
  const removeItem = async (id) => {
    if (!confirm('Delete this item and all its grades?')) return
    try { await deleteAssessmentItem(id); onItemsChange() }
    catch (err) { alert(err.response?.data?.detail || 'Delete failed') }
  }

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900">{assessment.name}</span>
            <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">{assessment.type}</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500 mt-1 flex-wrap">
            <span>Weight: <b className="text-gray-700">{assessment.weight}%</b></span>
            <span>Total Mark: <b className="text-gray-700">{assessment.total_mark}</b></span>
            <span>Items: <b className="text-gray-700">{items.length}</b></span>
            {items.length > 0 && (
              <span>Items Σ: <b className={itemsMismatch ? 'text-amber-600' : 'text-gray-700'}>{itemsTotal}</b>
                {itemsMismatch && <span className="text-amber-600"> ≠ {totalMark}</span>}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-1">
          <button onClick={onEdit}   className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg" title="Edit"><Edit2 size={14} /></button>
          <button onClick={onDelete} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"    title="Delete"><Trash2 size={14} /></button>
        </div>
      </div>

      <div className="mt-4 border-t border-gray-100 pt-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Items</p>
          <button onClick={() => setAdding(v => !v)} className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
            <Plus size={12} /> {adding ? 'Cancel' : 'Add Item'}
          </button>
        </div>

        {adding && (
          <form onSubmit={addItem} className="flex flex-wrap items-end gap-2 mb-2 p-2 bg-gray-50 rounded-lg">
            <div className="flex-1 min-w-[140px]">
              <label className="text-xs text-gray-500 block mb-0.5">Item Name</label>
              <input required className={`input text-sm ${itemErrors.newName ? 'border-red-300' : ''}`} placeholder="Q1, Part A, …" value={newItem.name}
                onChange={e => setNewItem(v => ({ ...v, name: e.target.value }))} />
              {itemErrors.newName && <p className="text-xs text-red-600">{itemErrors.newName}</p>}
            </div>
            <div className="w-28">
              <label className="text-xs text-gray-500 block mb-0.5">Full Mark (&gt;0)</label>
              <input type="number" min={0.1} step={0.1} className={`input text-sm ${itemErrors.new ? 'border-red-300' : ''}`} required
                value={newItem.full_mark}
                onChange={e => setNewItem(v => ({ ...v, full_mark: e.target.value }))}
                onBlur={e => setNewItem(v => ({ ...v, full_mark: normalizeNum(e.target.value) }))} />
              {itemErrors.new && <p className="text-xs text-red-600">{itemErrors.new}</p>}
            </div>
            <button type="submit" disabled={busy} className="btn-primary text-xs h-9">{busy ? 'Adding…' : 'Add'}</button>
          </form>
        )}

        {items.length === 0 ? (
          <p className="text-xs text-gray-400 italic py-2">No items yet — add one to start grading.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500">
                <th className="text-left py-1.5 w-12">#</th>
                <th className="text-left py-1.5">Name</th>
                <th className="text-right py-1.5 w-24">Full Mark</th>
                <th className="text-right py-1.5 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {items.map(it => (
                <tr key={it.id} className="border-t border-gray-50">
                  <td className="py-1.5 text-gray-400 text-xs">{it.position}</td>
                  {editingItemId === it.id ? (
                    <>
                      <td className="py-1.5">
                        <input className={`input text-sm py-1 ${itemErrors.editName ? 'border-red-300' : ''}`} value={editItem.name} onChange={e => setEditItem(v => ({ ...v, name: e.target.value }))} />
                        {itemErrors.editName && <p className="text-xs text-red-600">{itemErrors.editName}</p>}
                      </td>
                      <td className="py-1.5 text-right">
                        <div>
                          <input type="number" min={0.1} step={0.1}
                            className={`input text-sm py-1 w-20 ml-auto ${itemErrors.edit ? 'border-red-300' : ''}`}
                            value={editItem.full_mark}
                            onChange={e => setEditItem(v => ({ ...v, full_mark: e.target.value }))}
                            onBlur={e => setEditItem(v => ({ ...v, full_mark: normalizeNum(e.target.value) }))} />
                          {itemErrors.edit && <p className="text-xs text-red-600 text-right">{itemErrors.edit}</p>}
                        </div>
                      </td>
                      <td className="py-1.5 text-right">
                        <button onClick={saveEditItem} disabled={busy} className="text-indigo-600 hover:text-indigo-700 mr-2"><Save size={13} /></button>
                        <button onClick={() => setEditingItemId(null)} className="text-gray-400 hover:text-gray-600"><X size={13} /></button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-1.5 text-gray-800">{it.name}</td>
                      <td className="py-1.5 text-right text-gray-700">{it.full_mark}</td>
                      <td className="py-1.5 text-right">
                        <button onClick={() => startEditItem(it)} className="text-gray-400 hover:text-indigo-600 mr-2"><Edit2 size={13} /></button>
                        <button onClick={() => removeItem(it.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={13} /></button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// TAB: CLO ↔ ITEM MAPPING
// ════════════════════════════════════════════════════════════════════════════

function MappingTab({ courseId }) {
  const [clos,        setClos]        = useState([])
  const [assessments, setAssessments] = useState([])
  const [items,       setItems]       = useState([])
  const [pairs,       setPairs]       = useState(new Set())
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [savedMsg,    setSavedMsg]    = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const [c, a, i, m] = await Promise.all([getCLOs(courseId), getAssessments(courseId), getAssessmentItems(courseId), getCloItemMap(courseId)])
      setClos(c.data || []); setAssessments(a.data || []); setItems(i.data || [])
      setPairs(new Set((m.data || []).map(r => `${r.clo_id}|${r.item_id}`)))
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [courseId])

  const toggle = (cloId, itemId) => {
    const k = `${cloId}|${itemId}`
    setPairs(prev => { const next = new Set(prev); next.has(k) ? next.delete(k) : next.add(k); return next })
    setSavedMsg('')
  }

  const save = async () => {
    setSaving(true); setSavedMsg('')
    try {
      const list = [...pairs].map(k => { const [clo_id, item_id] = k.split('|'); return { clo_id, item_id } })
      const r = await setCloItemMap(courseId, list)
      setSavedMsg(`Saved — ${r.data.added} added, ${r.data.removed} removed.`)
    } catch (err) { alert(err.response?.data?.detail || 'Save failed') }
    finally { setSaving(false) }
  }

  if (loading) return <div className="card h-64 animate-pulse" />
  if (clos.length === 0 || items.length === 0) {
    return (
      <div className="space-y-4 max-w-3xl">
        <Alert type="warning">
          {clos.length === 0 && 'No CLOs found. '}
          {items.length === 0 && 'No assessment items found. '}
          Add them in their respective tabs before mapping.
        </Alert>
      </div>
    )
  }

  const itemsByAssessment = new Map()
  for (const a of assessments) itemsByAssessment.set(a.id, [])
  for (const it of items) {
    if (!itemsByAssessment.has(it.assessment_id)) itemsByAssessment.set(it.assessment_id, [])
    itemsByAssessment.get(it.assessment_id).push(it)
  }

  return (
    <div className="space-y-4">
      <Alert type="info">
        Tick boxes to indicate which assessment items measure each CLO. Click <strong>Save Mapping</strong> when done.
      </Alert>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-gray-500">{pairs.size} mapping{pairs.size === 1 ? '' : 's'} · {clos.length} CLO{clos.length === 1 ? '' : 's'} · {items.length} item{items.length === 1 ? '' : 's'}</p>
        <div className="flex items-center gap-3">
          {savedMsg && <span className="text-xs text-green-600">{savedMsg}</span>}
          <button onClick={save} disabled={saving} className="btn-primary text-sm flex items-center gap-1">
            <Save size={13} /> {saving ? 'Saving…' : 'Save Mapping'}
          </button>
        </div>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-500 sticky left-0 bg-gray-50 z-10 border-r border-gray-100">CLO</th>
              {assessments.map(a => {
                const cols = itemsByAssessment.get(a.id) || []
                if (cols.length === 0) return null
                return <th key={a.id} colSpan={cols.length} className="text-center px-2 py-2 text-xs font-semibold text-gray-700 border-l border-gray-100">{a.name}</th>
              })}
            </tr>
            <tr className="bg-gray-50 border-t border-gray-100">
              <th className="sticky left-0 bg-gray-50 z-10 border-r border-gray-100"></th>
              {assessments.flatMap(a => (itemsByAssessment.get(a.id) || []).map(it => (
                <th key={it.id} className="text-center px-2 py-2 text-xs font-medium text-gray-500 border-l border-gray-100 whitespace-nowrap" title={`${a.name} · ${it.name} (out of ${it.full_mark})`}>{it.name}</th>
              )))}
            </tr>
          </thead>
          <tbody>
            {clos.map(c => (
              <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                <td className="px-4 py-3 sticky left-0 bg-white hover:bg-gray-50/50 z-10 border-r border-gray-100">
                  <div className="font-bold text-indigo-700 text-sm">{c.code}</div>
                  <div className="text-xs text-gray-500 max-w-[220px] truncate" title={c.description}>{c.description}</div>
                </td>
                {assessments.flatMap(a => (itemsByAssessment.get(a.id) || []).map(it => {
                  const checked = pairs.has(`${c.id}|${it.id}`)
                  return (
                    <td key={it.id} className="text-center border-l border-gray-100 px-2 py-2">
                      <input type="checkbox" checked={checked} onChange={() => toggle(c.id, it.id)} className="w-4 h-4 accent-indigo-600 cursor-pointer" />
                    </td>
                  )
                }))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// TAB: STUDENTS & GRADES
// ════════════════════════════════════════════════════════════════════════════

function StudentsTab({ courseId }) {
  const [students,    setStudents]    = useState([])
  const [assessments, setAssessments] = useState([])
  const [items,       setItems]       = useState([])
  const [grades,      setGrades]      = useState({})
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [savedMsg,    setSavedMsg]    = useState('')
  const [gradeErrors, setGradeErrors] = useState({})

  const [showAdd,    setShowAdd]    = useState(false)
  const [newStudent, setNewStudent] = useState({ student_id: '', name: '' })
  const [bulkText,   setBulkText]   = useState('')
  const [bulkOpen,   setBulkOpen]   = useState(false)
  const [fileError,  setFileError]  = useState('')
  const fileRef = useRef()

  const load = async () => {
    setLoading(true)
    try {
      const [s, a, i, g] = await Promise.all([getStudents(courseId), getAssessments(courseId), getAssessmentItems(courseId), getItemGrades(courseId)])
      setStudents(s.data || []); setAssessments(a.data || []); setItems(i.data || [])
      setGrades(g.data?.grades || {})
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [courseId])

  const addOne = async (e) => {
    e.preventDefault()
    if (!newStudent.student_id.trim() || !newStudent.name.trim()) return
    try { await addStudent(courseId, newStudent); setNewStudent({ student_id: '', name: '' }); setShowAdd(false); load() }
    catch (err) { alert(err.response?.data?.detail || 'Failed to add student') }
  }

  const parseRosterRows = (rows2d) => {
    return rows2d
      .filter(cells => !looksLikeHeader(cells))
      .map(cells => {
        const parts = (cells || []).map(c => String(c ?? '').trim()).filter(Boolean)
        if (parts.length >= 2) return { student_id: parts[0], name: parts.slice(1).join(' ') }
        if (parts.length === 1) return { student_id: parts[0], name: parts[0] }
        return null
      })
      .filter(r => r && r.student_id && r.name)
  }

  const addBulkFromText = async () => {
    const rows2d = bulkText.split('\n').map(line => line.trim()).filter(Boolean)
      .map(line => line.split(/[,\t]/).map(p => p.trim()).filter(Boolean))
    const rows = parseRosterRows(rows2d)
    if (rows.length === 0) return alert('No valid rows found. Use one student per line: ID, Name')
    try { await bulkAddStudents(courseId, rows); setBulkText(''); setBulkOpen(false); load() }
    catch (err) { alert(err.response?.data?.detail || 'Bulk add failed') }
  }

  const handleFileUpload = async (file) => {
    if (!file) return
    setFileError('')
    const ext = file.name.split('.').pop().toLowerCase()
    try {
      let rows2d = []
      if (ext === 'xlsx' || ext === 'xls') {
        const buf = await file.arrayBuffer()
        const wb  = XLSX.read(buf)
        const ws  = wb.Sheets[wb.SheetNames[0]]
        rows2d = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
      } else if (ext === 'csv' || ext === 'txt') {
        const text = await file.text()
        rows2d = text.split('\n').map(line => line.split(/[,\t]/))
      } else {
        setFileError('Unsupported file format. Use .xlsx, .csv, or .txt')
        return
      }
      const rows = parseRosterRows(rows2d)
      // Put parsed data into the text area for review
      setBulkText(rows.map(r => `${r.student_id}, ${r.name}`).join('\n'))
      setBulkOpen(true)
    } catch (err) {
      setFileError(`Failed to parse file: ${err.message}`)
    }
  }

  const removeStudent = async (id) => {
    if (!confirm('Delete this student and all their grades?')) return
    try { await deleteStudent(id); load() }
    catch (err) { alert(err.response?.data?.detail || 'Delete failed') }
  }

  const onCellChange = (studentId, itemId, value, maxMark) => {
    setGrades(prev => ({ ...prev, [`${studentId}|${itemId}`]: value }))
    setSavedMsg('')
    const num = value === '' ? null : Number(value)
    const key = `${studentId}|${itemId}`
    if (num !== null && num > maxMark) {
      setGradeErrors(prev => ({ ...prev, [key]: `Exceeds max (${maxMark})` }))
    } else if (num !== null && num < 0) {
      setGradeErrors(prev => ({ ...prev, [key]: 'Cannot be negative' }))
    } else {
      setGradeErrors(prev => { const n = { ...prev }; delete n[key]; return n })
    }
  }

  const onCellBlur = (studentId, itemId, value, maxMark) => {
    // Strip leading zeros and clamp on blur
    let v = String(value).replace(/^0+(\d)/, '$1')
    const num = Number(v)
    if (!isNaN(num) && v !== '') {
      if (num > maxMark) v = String(maxMark)
      if (num < 0)       v = '0'
    }
    setGrades(prev => ({ ...prev, [`${studentId}|${itemId}`]: v }))
    const key = `${studentId}|${itemId}`
    setGradeErrors(prev => { const n = { ...prev }; delete n[key]; return n })
  }

  const saveAll = async () => {
    if (Object.keys(gradeErrors).length > 0) {
      alert('Fix grade errors before saving (scores cannot exceed item full mark).')
      return
    }
    setSaving(true); setSavedMsg('')
    try {
      const list = []
      for (const s of students) {
        for (const it of items) {
          const k = `${s.id}|${it.id}`
          const v = grades[k]
          if (v === '' || v === undefined || v === null) continue
          const num = Number(v)
          if (isNaN(num) || num < 0 || num > Number(it.full_mark)) continue
          list.push({ student_id: s.id, item_id: it.id, score: num })
        }
      }
      const r = await saveItemGrades(courseId, list)
      setSavedMsg(r.data?.message || 'Grades saved.')
      load()
    } catch (err) { alert(err.response?.data?.detail || 'Save failed') }
    finally { setSaving(false) }
  }

  if (loading) return <div className="card h-64 animate-pulse" />

  const itemsByAssessment = new Map()
  for (const a of assessments) itemsByAssessment.set(a.id, [])
  for (const it of items) {
    if (!itemsByAssessment.has(it.assessment_id)) itemsByAssessment.set(it.assessment_id, [])
    itemsByAssessment.get(it.assessment_id).push(it)
  }

  return (
    <div className="space-y-4">
      <Alert type="info">Manage the course roster and enter per-item scores. Leave a cell blank if a student didn&apos;t take that item — it will be skipped in attainment.</Alert>

      <div className="card">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h4 className="font-semibold text-gray-900">Roster <span className="text-sm text-gray-400 font-normal">({students.length})</span></h4>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => fileRef.current?.click()} className="btn-secondary text-xs flex items-center gap-1">
              <Upload size={12} /> Upload File
            </button>
            <input ref={fileRef} type="file" className="hidden" accept=".xlsx,.xls,.csv,.txt" onChange={e => handleFileUpload(e.target.files?.[0])} />
            <button onClick={() => setBulkOpen(v => !v)} className="btn-secondary text-xs">{bulkOpen ? 'Close Bulk Add' : 'Bulk Add'}</button>
            <button onClick={() => setShowAdd(v => !v)} className="btn-primary text-xs flex items-center gap-1">
              <Plus size={12} /> {showAdd ? 'Cancel' : 'Add Student'}
            </button>
          </div>
        </div>

        {fileError && <div className="mb-2 text-xs text-red-600 bg-red-50 rounded px-2 py-1">{fileError}</div>}

        {showAdd && (
          <form onSubmit={addOne} className="flex flex-wrap items-end gap-2 mb-3 p-2 bg-gray-50 rounded-lg">
            <div className="flex-1 min-w-[120px]">
              <label className="text-xs text-gray-500 block mb-0.5">Student ID</label>
              <input required className="input text-sm" placeholder="S001" value={newStudent.student_id} onChange={e => setNewStudent(v => ({ ...v, student_id: e.target.value }))} />
            </div>
            <div className="flex-[2] min-w-[160px]">
              <label className="text-xs text-gray-500 block mb-0.5">Name</label>
              <input required className="input text-sm" placeholder="Full Name" value={newStudent.name} onChange={e => setNewStudent(v => ({ ...v, name: e.target.value }))} />
            </div>
            <button type="submit" className="btn-primary text-xs h-9">Add</button>
          </form>
        )}

        {bulkOpen && (
          <div className="mb-3 p-2 bg-gray-50 rounded-lg">
            <label className="text-xs text-gray-500 block mb-1">
              One student per line — <code>ID, Name</code> or <code>ID Name</code>. Header rows are skipped automatically.
            </label>
            <textarea rows={4} className="input text-sm font-mono" value={bulkText} onChange={e => setBulkText(e.target.value)}
              placeholder={`S001, Ahmad Ali\nS002, Fatima Khan\nS003, Omar Hassan`} />
            <div className="flex justify-end mt-2">
              <button onClick={addBulkFromText} className="btn-primary text-xs">Import</button>
            </div>
          </div>
        )}

        {students.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No students yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {students.map(s => (
              <div key={s.id} className="flex items-center gap-1.5 bg-gray-50 border border-gray-100 rounded-lg pl-2 pr-1 py-1 text-xs">
                <span className="font-semibold text-gray-700">{s.student_id}</span>
                <span className="text-gray-500">{s.name}</span>
                <button onClick={() => removeStudent(s.id)} className="text-gray-300 hover:text-red-500 p-0.5"><X size={12} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {students.length > 0 && items.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h4 className="font-semibold text-gray-900">Item Grades</h4>
            <div className="flex items-center gap-3">
              {Object.keys(gradeErrors).length > 0 && (
                <span className="text-xs text-red-600">{Object.keys(gradeErrors).length} error{Object.keys(gradeErrors).length > 1 ? 's' : ''} — fix before saving</span>
              )}
              {savedMsg && <span className="text-xs text-green-600">{savedMsg}</span>}
              <button onClick={saveAll} disabled={saving || Object.keys(gradeErrors).length > 0} className="btn-primary text-sm flex items-center gap-1">
                <Save size={13} /> {saving ? 'Saving…' : 'Save All Grades'}
              </button>
            </div>
          </div>

          <div className="card overflow-x-auto p-0">
            <table className="text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th rowSpan={2} className="text-left px-4 py-2 font-medium text-gray-500 sticky left-0 bg-gray-50 z-10 border-r border-gray-100 align-bottom">Student</th>
                  {assessments.map(a => {
                    const cols = itemsByAssessment.get(a.id) || []
                    if (cols.length === 0) return null
                    return <th key={a.id} colSpan={cols.length} className="text-center px-2 py-2 text-xs font-semibold text-gray-700 border-l border-gray-100">{a.name}</th>
                  })}
                </tr>
                <tr className="bg-gray-50 border-t border-gray-100">
                  {assessments.flatMap(a => (itemsByAssessment.get(a.id) || []).map(it => (
                    <th key={it.id} className="text-center px-1 py-1 text-xs font-medium text-gray-500 border-l border-gray-100 whitespace-nowrap">
                      <div>{it.name}</div>
                      <div className="text-[10px] text-gray-400 font-normal">/ {it.full_mark}</div>
                    </th>
                  )))}
                </tr>
              </thead>
              <tbody>
                {students.map(s => (
                  <tr key={s.id} className="border-t border-gray-100">
                    <td className="px-4 py-2 sticky left-0 bg-white z-10 border-r border-gray-100 whitespace-nowrap">
                      <div className="font-semibold text-gray-700 text-xs">{s.student_id}</div>
                      <div className="text-xs text-gray-500">{s.name}</div>
                    </td>
                    {assessments.flatMap(a => (itemsByAssessment.get(a.id) || []).map(it => {
                      const k    = `${s.id}|${it.id}`
                      const v    = grades[k] ?? ''
                      const max  = Number(it.full_mark) || 0
                      const err2 = gradeErrors[k]
                      return (
                        <td key={it.id} className="border-l border-gray-100 px-1 py-1 text-center">
                          <input
                            type="number" min={0} max={max} step={0.1}
                            className={`w-16 text-sm text-right rounded border px-1.5 py-1 ${err2 ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                            value={v}
                            onChange={e => onCellChange(s.id, it.id, e.target.value, max)}
                            onBlur={e  => onCellBlur(s.id,  it.id, e.target.value, max)}
                            title={err2 || undefined}
                          />
                        </td>
                      )
                    }))}
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
  'Knowledge':                             '#6366f1',
  'Cognitive Skills':                      '#8b5cf6',
  'Interpersonal Skills & Responsibility': '#10b981',
  'Communication, IT & Numerical Skills':  '#f59e0b',
  'Psychomotor Skills':                    '#ef4444',
}

function ReportTab({ courseId, evidenceCoveredCount, course, report, generated, onReportGenerated }) {
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [cloRecs,   setCLORecs]   = useState({})   // clo_id → manual recommendation text
  const [savingRec, setSavingRec] = useState({})

  const handleGenerate = async () => {
    setLoading(true); setError('')
    try {
      const [r, recs] = await Promise.all([
        calculateAttainment(courseId),
        getCLORecommendations(courseId),
      ])
      onReportGenerated(r.data)
      const recsMap = {}
      for (const rec of (recs.data || [])) recsMap[rec.clo_id] = rec.manual_recommendation || ''
      setCLORecs(recsMap)
    } catch (err2) {
      setError(err2.response?.data?.detail || 'Failed to generate report')
    } finally { setLoading(false) }
  }

  const handleSaveRec = async (cloId, text) => {
    setSavingRec(prev => ({ ...prev, [cloId]: true }))
    try { await saveCLORecommendation(courseId, cloId, text) }
    catch (err2) { console.error('Save recommendation failed:', err2) }
    finally { setSavingRec(prev => ({ ...prev, [cloId]: false })) }
  }

  const handleExport = async () => {
    if (!report || !course) return
    try {
      await exportFCARPDF({ course, report, cloRecsMap: cloRecs })
    } catch (err2) {
      alert('PDF export failed: ' + (err2.message || 'Unknown error'))
    }
  }

  const cloResults    = report?.clo_results          || []
  const domainSummary = report?.ncaaa_domain_summary || {}
  const warnings      = report?.warnings             || []
  const overall       = report?.overall_attainment   ?? 0

  const chartData = cloResults.map(r => ({
    name:   r.clo_code,
    actual: r.attainment_percentage,
    target: r.target_attainment,
  }))

  const evidenceComplete = evidenceCoveredCount === EVIDENCE_TYPES.length

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="card flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-semibold text-gray-900">FCAR Attainment Report</h3>
          <p className="text-sm text-gray-500 mt-0.5">CLO attainment is derived from CLO ↔ item mappings and student item grades.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {generated && report && (
            <button onClick={handleExport} className="btn-secondary flex items-center gap-2 text-sm">
              <Download size={15} /> Export PDF
            </button>
          )}
          <button onClick={handleGenerate} disabled={loading} className="btn-primary flex items-center gap-2">
            <BarChart3 size={16} />
            {loading ? 'Calculating…' : generated ? 'Refresh Report' : 'Generate Report'}
          </button>
        </div>
      </div>

      <div className={`card border ${evidenceComplete ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
        <div className="flex items-center gap-2">
          {evidenceComplete ? <CheckCircle size={16} className="text-green-600" /> : <AlertCircle size={16} className="text-amber-600" />}
          <span className={`text-sm font-medium ${evidenceComplete ? 'text-green-800' : 'text-amber-800'}`}>
            Evidence Files: {evidenceCoveredCount}/{EVIDENCE_TYPES.length} categories uploaded
          </span>
        </div>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {generated && report && (
        <>
          {warnings.length > 0 && (
            <div className="space-y-2">{warnings.map((w, i) => <Alert key={i} type="warning">{w.message}</Alert>)}</div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Total Students',    value: report.total_students },
              { label: 'CLOs Evaluated',    value: cloResults.length },
              { label: 'Overall Attainment', value: `${fmt(overall)}%`, color: 'text-indigo-600' },
              { label: 'CLOs Achieved',      value: `${cloResults.filter(r => r.status === 'Achieved').length}/${cloResults.length}`, color: 'text-green-600' },
            ].map(({ label, value, color }) => (
              <div key={label} className="card text-center py-4">
                <p className={`text-2xl font-bold ${color || 'text-gray-900'}`}>{value}</p>
                <p className="text-xs text-gray-500 mt-1">{label}</p>
              </div>
            ))}
          </div>

          {chartData.length > 0 && (
            <div className="card">
              <h4 className="font-semibold text-gray-900 mb-4">Actual vs. Target Attainment</h4>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} unit="%" />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <Legend />
                  <Bar dataKey="target" name="Target %" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="actual" name="Actual %" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, i) => <Cell key={i} fill={entry.actual >= entry.target ? '#10b981' : '#ef4444'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* CLO Detail Table with recommendations */}
          <div className="card overflow-hidden p-0">
            <div className="px-6 py-4 border-b"><h4 className="font-semibold text-gray-900">CLO Attainment Detail</h4></div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {['CLO', 'Domain', 'Target %', 'Actual %', 'Avg Score %', 'Passed / Total', 'Status'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {cloResults.map(r => {
                    const autoRec = generateAutoRecommendation(r)
                    return (
                      <tr key={r.clo_id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="font-bold text-indigo-700">{r.clo_code}</div>
                          <div className="text-xs text-gray-500 max-w-xs truncate" title={r.description}>{r.description}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DOMAIN_BADGE[r.ncaaa_domain] || 'bg-gray-100 text-gray-600'}`}>
                            {r.ncaaa_domain?.split(' ')[0]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{r.target_attainment}%</td>
                        <td className={`px-4 py-3 font-semibold ${r.no_mapping ? 'text-gray-300' : r.attainment_percentage >= r.target_attainment ? 'text-green-600' : 'text-red-600'}`}>
                          {r.no_mapping ? '—' : `${fmt(r.attainment_percentage)}%`}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{r.no_mapping ? '—' : `${fmt(r.average_score)}%`}</td>
                        <td className="px-4 py-3 text-gray-600">{r.no_mapping ? '—' : `${r.students_passing} / ${r.total_students}`}</td>
                        <td className="px-4 py-3">
                          {r.no_mapping ? (
                            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">No mapping</span>
                          ) : r.status === 'Achieved' ? (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Achieved</span>
                          ) : (
                            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">Not Achieved</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recommendations section */}
          {cloResults.some(r => r.status === 'Not Achieved' || r.no_mapping) && (
            <div className="card space-y-4">
              <h4 className="font-semibold text-gray-900">Recommendations</h4>
              {cloResults.filter(r => r.status === 'Not Achieved' || r.no_mapping).map(r => {
                const autoRec = generateAutoRecommendation(r)
                return (
                  <div key={r.clo_id} className="border border-gray-100 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-indigo-700 text-sm">{r.clo_code}</span>
                      <span className="text-xs text-gray-500">{r.description?.slice(0, 60)}{r.description?.length > 60 ? '…' : ''}</span>
                      {!r.no_mapping && <span className="text-xs text-gray-400 ml-auto">Attainment: {fmt(r.attainment_percentage)}% (target: {r.target_attainment}%)</span>}
                    </div>
                    {autoRec && (
                      <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                        <p className="text-xs font-semibold text-blue-700 mb-1">Auto-generated:</p>
                        <p className="text-xs text-blue-600">{autoRec}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-semibold text-gray-600 mb-1">Faculty input:</p>
                      <textarea
                        rows={2}
                        className="input text-xs w-full"
                        placeholder="Faculty Recommendation / Action Plan…"
                        value={cloRecs[r.clo_id] || ''}
                        onChange={e => setCLORecs(prev => ({ ...prev, [r.clo_id]: e.target.value }))}
                        onBlur={e => handleSaveRec(r.clo_id, e.target.value)}
                      />
                      {savingRec[r.clo_id] && <p className="text-xs text-gray-400 mt-0.5">Saving…</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* NCAAA Domain Summary */}
          {Object.keys(domainSummary).length > 0 && (
            <div className="card">
              <h4 className="font-semibold text-gray-900 mb-4">NCAAA Domain Coverage</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Object.entries(domainSummary).map(([domain, info]) => (
                  <div key={domain} className="border border-gray-100 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="text-sm font-medium text-gray-800">{domain}</p>
                      <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-semibold shrink-0">{info.met}/{info.total} achieved</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-2">
                        <div className="h-2 rounded-full transition-all" style={{ width: `${Math.min(100, info.average_attainment)}%`, backgroundColor: DOMAIN_COLORS[domain] || '#6366f1' }} />
                      </div>
                      <span className="text-sm font-semibold text-gray-700 w-14 text-right">{fmt(info.average_attainment)}%</span>
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
// PDF EXPORT
// ════════════════════════════════════════════════════════════════════════════

async function exportFCARPDF({ course, report, cloRecsMap }) {
  const doc = new jsPDF()
  const cloResults = report.clo_results || []
  const warnings   = report.warnings   || []

  // Title
  doc.setFontSize(16); doc.setFont(undefined, 'bold')
  doc.text('Faculty Course Assessment Report (FCAR)', 14, 18)
  doc.setFontSize(10); doc.setFont(undefined, 'normal')
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 25)

  // A: Course Information
  doc.setFontSize(13); doc.setFont(undefined, 'bold')
  doc.text('A. Course Information', 14, 35)
  autoTable(doc, {
    startY: 38,
    head: [['Field', 'Value']],
    body: [
      ['Course Title',   course.name        || ''],
      ['Course Code',    course.code        || ''],
      ['Department',     course.department  || ''],
      ['Credit Hours',   String(course.credit_hours || '')],
      ['Semester / Year', `${course.semester || ''} ${course.year || ''}`],
    ],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [99, 102, 241] },
    margin: { left: 14, right: 14 },
  })

  // B: Assessment Structure
  if (report.assessments?.length) {
    doc.setFontSize(13); doc.setFont(undefined, 'bold')
    doc.text('B. Assessment Structure', 14, doc.lastAutoTable.finalY + 10)
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 13,
      head: [['Assessment', 'Type', 'Weight %', 'Total Mark']],
      body: (report.assessments || []).map(a => [a.name, a.type, `${a.weight}%`, a.total_mark]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [99, 102, 241] },
      margin: { left: 14, right: 14 },
    })
  }

  // C: CLO Definitions
  doc.setFontSize(13); doc.setFont(undefined, 'bold')
  doc.text('C. CLO Definitions', 14, doc.lastAutoTable.finalY + 10)
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 13,
    head: [['Code', 'Description', 'Domain', 'Bloom', 'PLO', 'SO', 'Target%', 'PassScore%']],
    body: cloResults.map(r => [r.clo_code, (r.description || '').slice(0, 55), r.ncaaa_domain || '', r.bloom_level || '', r.plo_mapping || '', r.so_mapping || '', r.target_attainment, r.passing_score]),
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [99, 102, 241] },
    margin: { left: 14, right: 14 },
  })

  // D: CLO Attainment Results
  doc.setFontSize(13); doc.setFont(undefined, 'bold')
  doc.text('D. CLO Attainment Results', 14, doc.lastAutoTable.finalY + 10)
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 13,
    head: [['CLO', 'Attainment%', 'Target%', 'Status', 'Passed/Total', 'Auto-Recommendation', 'Faculty Input']],
    body: cloResults.map(r => {
      const autoRec = generateAutoRecommendation(r)
      return [
        r.clo_code,
        r.no_mapping ? 'N/A' : `${fmt(r.attainment_percentage)}%`,
        `${r.target_attainment}%`,
        r.no_mapping ? 'No mapping' : r.status,
        r.no_mapping ? '—' : `${r.students_passing}/${r.total_students}`,
        autoRec ? autoRec.slice(0, 120) : '—',
        (cloRecsMap?.[r.clo_id] || '').slice(0, 80),
      ]
    }),
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [99, 102, 241] },
    margin: { left: 14, right: 14 },
    columnStyles: { 5: { cellWidth: 40 }, 6: { cellWidth: 35 } },
  })

  // E: ABET SO Attainment
  doc.setFontSize(13); doc.setFont(undefined, 'bold')
  doc.text('E. ABET SO Attainment', 14, doc.lastAutoTable.finalY + 10)
  const soRows = SO_DEFINITIONS.map(so => {
    const mapped = cloResults.filter(r => normalizeSO(r.so_mapping) === so.code)
    if (!mapped.length) return [so.label, SAQF_DOMAIN_LABELS[so.saqf] || so.saqf, '—', 'N/A', 'N/A', '—', '', '']
    const attAvg  = mapped.reduce((s, r) => s + r.attainment_percentage, 0) / mapped.length
    const pct70   = mapped.reduce((s, r) => s + ((r.students_passing / r.total_students) || 0), 0) / mapped.length * 100
    const vec     = computeSOVector(mapped)
    return [
      so.label, SAQF_DOMAIN_LABELS[so.saqf] || so.saqf,
      mapped.map(r => r.clo_code).join(', '),
      `${attAvg.toFixed(1)}%`,
      attAvg >= 70 ? 'Met' : 'Not Met',
      `${pct70.toFixed(1)}%`,
      `E:${vec.E} A:${vec.A} M:${vec.M} U:${vec.U}`,
      '', '',
    ]
  })
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 13,
    head: [['SO/PLO', 'SAQF Domain', 'CLOs', 'Attainment', 'Met', '>70%', 'P.Vector', 'Reasons', 'Action']],
    body: soRows,
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [99, 102, 241] },
    margin: { left: 14, right: 14 },
  })

  // F: SAQF Attainment
  doc.setFontSize(13); doc.setFont(undefined, 'bold')
  doc.text('F. SAQF / NCAAA Attainment', 14, doc.lastAutoTable.finalY + 10)
  const saqfRows = SAQF_DOMAINS.map(domain => {
    const mapped = cloResults.filter(r => {
      const so = normalizeSO(r.so_mapping)
      return so && domain.soList.includes(so)
    })
    if (!mapped.length) return [domain.label, domain.soList.join(', '), '—', 'N/A', '']
    const valid  = mapped.filter(r => !r.no_mapping)
    const attAvg = valid.length > 0 ? valid.reduce((s, r) => s + r.attainment_percentage, 0) / valid.length : 0
    const interp = attAvg >= 70 ? 'D — Demonstrated' : attAvg >= 60 ? 'PD — Partially Demonstrated' : 'ND — Not Demonstrated'
    return [domain.label, domain.soList.join(', '), mapped.map(r => r.clo_code).join(', '), `${attAvg.toFixed(1)}%`, interp]
  })
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 13,
    head: [['Domain', 'SOs', 'CLOs', 'Attainment', 'Interpretation']],
    body: saqfRows,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [99, 102, 241] },
    margin: { left: 14, right: 14 },
  })

  // G: Warnings
  if (warnings.length > 0) {
    doc.setFontSize(13); doc.setFont(undefined, 'bold')
    doc.text('G. Warnings / Validation Issues', 14, doc.lastAutoTable.finalY + 10)
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 13,
      head: [['#', 'Issue']],
      body: warnings.map((w, i) => [i + 1, w.message]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [245, 158, 11] },
      margin: { left: 14, right: 14 },
    })
  }

  doc.save(`FCAR_${course.code}_${course.semester}_${course.year}.pdf`)
}

// ════════════════════════════════════════════════════════════════════════════
// TAB: ABET SO ATTAINMENT
// ════════════════════════════════════════════════════════════════════════════

function ABETSOTab({ courseId }) {
  const [report,   setReport]   = useState(null)
  const [soNotes,  setSONotes]  = useState({})
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [saving,   setSaving]   = useState({})

  const load = async () => {
    setLoading(true); setError('')
    try {
      const [r, n] = await Promise.all([calculateAttainment(courseId), getSONotes(courseId)])
      setReport(r.data)
      const nm = {}
      for (const note of (n.data || [])) nm[note.so_code] = { reasons: note.reasons || '', improvement_action: note.improvement_action || '' }
      setSONotes(nm)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load data. Make sure students and grades are entered.')
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [courseId])

  const saveNote = async (soCode, field, value) => {
    setSONotes(prev => ({ ...prev, [soCode]: { ...(prev[soCode] || {}), [field]: value } }))
    setSaving(prev => ({ ...prev, [soCode]: true }))
    try {
      const cur     = soNotes[soCode] || {}
      const reasons = field === 'reasons'            ? value : (cur.reasons            || '')
      const action  = field === 'improvement_action' ? value : (cur.improvement_action || '')
      await saveSONotes(courseId, soCode, reasons, action)
    } catch (err) { console.error('Failed to save SO notes:', err) }
    finally { setSaving(prev => ({ ...prev, [soCode]: false })) }
  }

  if (loading) return <div className="card h-64 animate-pulse" />
  if (error) return (
    <div className="space-y-4">
      <Alert type="error">{error}</Alert>
      <button onClick={load} className="btn-secondary text-sm">Retry</button>
    </div>
  )
  if (!report) return null

  const cloResults = report.clo_results || []

  return (
    <div className="space-y-4 max-w-6xl">
      <Alert type="info">
        SO Attainment is computed from CLO data. Each CLO's <strong>so_mapping</strong> field drives the SO grouping.
        The SO→PLO→SAQF mapping follows the official FCAR workbook standard. Notes auto-save on blur.
      </Alert>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-xs">
          <thead className="bg-gray-50">
            <tr>
              {['SO / PLO', 'SAQF Domain', 'CLOs Involved', 'SO Attainment', 'Met?', '>70% Students', 'Perf. Vector', 'Reasons', 'Improvement Action'].map(h => (
                <th key={h} className="text-left px-3 py-3 text-xs font-medium text-gray-500 whitespace-nowrap border-r border-gray-100 last:border-r-0">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {SO_DEFINITIONS.map(so => {
              const mappedCLOs = cloResults.filter(r => normalizeSO(r.so_mapping) === so.code)
              const note = soNotes[so.code] || { reasons: '', improvement_action: '' }

              if (mappedCLOs.length === 0) {
                return (
                  <tr key={so.code} className="hover:bg-gray-50/50">
                    <td className="px-3 py-3 font-semibold text-indigo-700 whitespace-nowrap">{so.label}</td>
                    <td className="px-3 py-3 text-gray-500">{SAQF_DOMAIN_LABELS[so.saqf]}</td>
                    <td colSpan={7} className="px-3 py-3 text-gray-400 italic">NOT APPLICABLE — No CLOs mapped to this SO</td>
                  </tr>
                )
              }

              const validCLOs = mappedCLOs.filter(r => !r.no_mapping)
              const attAvg    = validCLOs.length > 0 ? validCLOs.reduce((s, r) => s + r.attainment_percentage, 0) / validCLOs.length : 0
              const met       = attAvg >= 70
              const pctOver70 = validCLOs.length > 0
                ? validCLOs.reduce((s, r) => s + ((r.total_students > 0 ? r.students_passing / r.total_students : 0) * 100), 0) / validCLOs.length
                : 0
              const vec = computeSOVector(mappedCLOs)

              return (
                <tr key={so.code} className="hover:bg-gray-50/50">
                  <td className="px-3 py-3">
                    <div className="font-semibold text-indigo-700 whitespace-nowrap">{so.label}</div>
                    <div className="text-gray-400 max-w-[130px] truncate" title={so.description}>{so.description.slice(0, 45)}…</div>
                  </td>
                  <td className="px-3 py-3 font-medium text-gray-600 whitespace-nowrap">{SAQF_DOMAIN_LABELS[so.saqf]}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {mappedCLOs.map(r => <span key={r.clo_id} className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">{r.clo_code}</span>)}
                    </div>
                  </td>
                  <td className={`px-3 py-3 font-semibold text-sm whitespace-nowrap ${met ? 'text-green-600' : 'text-red-600'}`}>
                    {attAvg.toFixed(1)}%
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded-full font-medium ${met ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {met ? 'Met' : 'Not Met'}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-medium text-gray-700 whitespace-nowrap">{pctOver70.toFixed(1)}%</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className="text-emerald-700 font-medium">E:{vec.E}</span>{' '}
                    <span className="text-blue-700 font-medium">A:{vec.A}</span>{' '}
                    <span className="text-amber-700 font-medium">M:{vec.M}</span>{' '}
                    <span className="text-red-700 font-medium">U:{vec.U}</span>
                  </td>
                  <td className="px-3 py-3 min-w-[130px]">
                    <textarea rows={2} className="input text-xs w-full"
                      placeholder="Reasons for this result…"
                      value={note.reasons}
                      onChange={e => setSONotes(prev => ({ ...prev, [so.code]: { ...prev[so.code], reasons: e.target.value } }))}
                      onBlur={e => saveNote(so.code, 'reasons', e.target.value)} />
                    {saving[so.code] && <span className="text-[10px] text-gray-400">Saving…</span>}
                  </td>
                  <td className="px-3 py-3 min-w-[130px]">
                    <textarea rows={2} className="input text-xs w-full"
                      placeholder="Improvement action…"
                      value={note.improvement_action}
                      onChange={e => setSONotes(prev => ({ ...prev, [so.code]: { ...prev[so.code], improvement_action: e.target.value } }))}
                      onBlur={e => saveNote(so.code, 'improvement_action', e.target.value)} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// TAB: SAQF / NCAAA ATTAINMENT
// ════════════════════════════════════════════════════════════════════════════

function SAQFTab({ courseId }) {
  const [report,    setReport]    = useState(null)
  const [saqfNotes, setSAQFNotes] = useState({})
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [saving,    setSaving]    = useState({})

  const load = async () => {
    setLoading(true); setError('')
    try {
      const [r, n] = await Promise.all([calculateAttainment(courseId), getSAQFNotes(courseId)])
      setReport(r.data)
      const nm = {}
      for (const note of (n.data || [])) nm[note.domain_code] = note.notes || ''
      setSAQFNotes(nm)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load data. Make sure students and grades are entered.')
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [courseId])

  const saveNote = async (domainCode, value) => {
    setSaving(prev => ({ ...prev, [domainCode]: true }))
    try { await saveSAQFNote(courseId, domainCode, value) }
    catch (err) { console.error('Failed to save SAQF note:', err) }
    finally { setSaving(prev => ({ ...prev, [domainCode]: false })) }
  }

  if (loading) return <div className="card h-64 animate-pulse" />
  if (error) return (
    <div className="space-y-4">
      <Alert type="error">{error}</Alert>
      <button onClick={load} className="btn-secondary text-sm">Retry</button>
    </div>
  )
  if (!report) return null

  const cloResults = report.clo_results || []

  return (
    <div className="space-y-4 max-w-5xl">
      <Alert type="info">
        SAQF domains are derived from the official SO→PLO→SAQF mapping from the FCAR workbook.
        Each CLO's <strong>so_mapping</strong> determines which domain it contributes to.
        Attainment thresholds: D ≥ 70%, PD 60–69%, ND &lt; 60%.
      </Alert>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {['SAQF Domain', 'SOs Covered', 'CLOs Involved', 'Domain Attainment', 'Interpretation', 'Notes / Action'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {SAQF_DOMAINS.map(domain => {
              const domainCLOs = cloResults.filter(r => {
                const so = normalizeSO(r.so_mapping)
                return so && domain.soList.includes(so)
              })
              const notes = saqfNotes[domain.code] || ''

              if (domainCLOs.length === 0) {
                return (
                  <tr key={domain.code} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-800">{domain.label}</div>
                      <div className="text-xs font-mono text-gray-400">{domain.code}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{domain.soList.join(', ')}</td>
                    <td colSpan={4} className="px-4 py-3 text-gray-400 italic text-xs">NOT APPLICABLE — No CLOs mapped to this domain</td>
                  </tr>
                )
              }

              const valid  = domainCLOs.filter(r => !r.no_mapping)
              const attAvg = valid.length > 0 ? valid.reduce((s, r) => s + r.attainment_percentage, 0) / valid.length : 0
              const { label: interp, color: intColor } = attAvg >= 70
                ? { label: 'D — Demonstrated',           color: 'bg-green-100 text-green-700' }
                : attAvg >= 60
                ? { label: 'PD — Partially Demonstrated', color: 'bg-amber-100 text-amber-700' }
                : { label: 'ND — Not Demonstrated',       color: 'bg-red-100 text-red-700' }

              return (
                <tr key={domain.code} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-gray-800 text-sm">{domain.label}</div>
                    <div className="text-xs font-mono text-gray-400">{domain.code}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{domain.soList.join(', ')}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {domainCLOs.map(r => <span key={r.clo_id} className="text-xs bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">{r.clo_code}</span>)}
                    </div>
                  </td>
                  <td className={`px-4 py-3 font-semibold text-sm whitespace-nowrap ${attAvg >= 70 ? 'text-green-600' : attAvg >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                    {valid.length > 0 ? `${attAvg.toFixed(1)}%` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${intColor}`}>{interp}</span>
                  </td>
                  <td className="px-4 py-3 min-w-[200px]">
                    <textarea rows={2} className="input text-xs w-full"
                      placeholder="Notes and action plan…"
                      value={notes}
                      onChange={e => setSAQFNotes(prev => ({ ...prev, [domain.code]: e.target.value }))}
                      onBlur={e => saveNote(domain.code, e.target.value)} />
                    {saving[domain.code] && <span className="text-[10px] text-gray-400">Saving…</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN: CourseDetail
// ════════════════════════════════════════════════════════════════════════════

export default function CourseDetail() {
  const { courseId } = useParams()
  const [course,   setCourse]   = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [evidenceCovered, setEvidenceCovered] = useState(new Set())
  const [attainmentReport,    setAttainmentReport]    = useState(null)
  const [attainmentGenerated, setAttainmentGenerated] = useState(false)

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
          <h1 className="text-2xl font-bold text-gray-900">{course.code} — {course.name}</h1>
          <p className="text-gray-500 text-sm mt-1">{course.department} · {course.semester} {course.year} · {course.credit_hours} credit hours</p>
        </div>
        <div className={`shrink-0 flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full border ${
          allEvidenceComplete ? 'bg-green-50 border-green-200 text-green-700' : 'bg-amber-50 border-amber-200 text-amber-700'
        }`}>
          {allEvidenceComplete ? <CheckCircle size={13} /> : <AlertCircle size={13} />}
          Evidence: {evidenceCovered.size}/{EVIDENCE_TYPES.length}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex overflow-x-auto">
          {TABS.map(tab => {
            const locked = LOCKED_TABS.has(tab.id) && !allEvidenceComplete
            return (
              <TabButton key={tab.id} tab={tab} active={activeTab === tab.id} onClick={handleTabClick} locked={locked} />
            )
          })}
        </div>
      </div>

      {LOCKED_TABS.has(activeTab) && !allEvidenceComplete && (
        <Alert type="warning">
          This tab is locked until all {EVIDENCE_TYPES.length} evidence categories have at least one file uploaded.
          Go to <strong>Evidence Files</strong> to complete the uploads.
        </Alert>
      )}

      {/* Tab content */}
      {activeTab === 'overview'    && <OverviewTab course={course} />}

      {activeTab === 'documents'   && (
        <DocumentsTab courseId={courseId} onCoverageChange={setEvidenceCovered} />
      )}

      {activeTab === 'clos'        && allEvidenceComplete && <CLOsTab courseId={courseId} />}

      {activeTab === 'assessments' && allEvidenceComplete && <AssessmentsTab courseId={courseId} />}

      {activeTab === 'mapping'     && allEvidenceComplete && <MappingTab courseId={courseId} />}

      {activeTab === 'students'    && allEvidenceComplete && <StudentsTab courseId={courseId} />}

      {activeTab === 'report'      && allEvidenceComplete && (
        <ReportTab
          courseId={courseId}
          evidenceCoveredCount={evidenceCovered.size}
          course={course}
          report={attainmentReport}
          generated={attainmentGenerated}
          onReportGenerated={(data) => {
            setAttainmentReport(data)
            setAttainmentGenerated(true)
          }}
        />
      )}

      {activeTab === 'abet'        && allEvidenceComplete && <ABETSOTab courseId={courseId} />}

      {activeTab === 'saqf'        && allEvidenceComplete && <SAQFTab courseId={courseId} />}
    </div>
  )
}
