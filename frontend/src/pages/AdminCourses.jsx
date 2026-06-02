import { useState, useEffect } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getCourses, getCourseDocumentCoverage, getAllProfiles } from '../api'
import { EVIDENCE_TYPES, DEPARTMENTS } from '../constants'
import { BookOpen, Search, CheckCircle, Clock, ExternalLink } from 'lucide-react'

const SEMESTERS    = ['All', 'Fall', 'Spring', 'Summer']
const YEARS_OPT    = ['All', ...Array.from({ length: 6 }, (_, i) => String(2024 + i))]
const STATUS_OPT   = ['All', 'Evidence Complete', 'In Progress']

export default function AdminCourses() {
  const { user } = useAuth()

  if (user?.role !== 'admin') return <Navigate to="/" replace />

  const [courses,  setCourses]  = useState([])
  const [profiles, setProfiles] = useState([])
  const [coverage, setCoverage] = useState({})
  const [loading,  setLoading]  = useState(true)

  const [search,      setSearch]      = useState('')
  const [filterSem,   setFilterSem]   = useState('All')
  const [filterYear,  setFilterYear]  = useState('All')
  const [filterDept,  setFilterDept]  = useState('All')
  const [filterInst,  setFilterInst]  = useState('All')
  const [filterStatus, setFilterStatus] = useState('All')

  useEffect(() => {
    const load = async () => {
      try {
        const [coursesRes, profilesRes] = await Promise.all([
          getCourses(),
          getAllProfiles(),
        ])
        const allCourses  = coursesRes.data  || []
        const allProfiles = profilesRes.data || []
        setCourses(allCourses)
        setProfiles(allProfiles)

        const cov = await getCourseDocumentCoverage(allCourses.map(c => c.id))
        setCoverage(cov)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const profileMap = Object.fromEntries(profiles.map(p => [p.id, p]))
  const total      = EVIDENCE_TYPES.length

  const filtered = courses.filter(c => {
    const isComplete = (coverage[c.id] || 0) === total
    if (filterSem  !== 'All' && c.semester   !== filterSem)   return false
    if (filterYear !== 'All' && String(c.year) !== filterYear) return false
    if (filterDept !== 'All' && c.department  !== filterDept)  return false
    if (filterInst !== 'All' && c.instructor_id !== filterInst) return false
    if (filterStatus === 'Evidence Complete' && !isComplete)   return false
    if (filterStatus === 'In Progress'       && isComplete)    return false
    if (search) {
      const q = search.toLowerCase()
      if (!c.code.toLowerCase().includes(q) && !c.name.toLowerCase().includes(q)) return false
    }
    return true
  })

  const facultyList = profiles.filter(p => p.role === 'faculty')
  const deptList    = ['All', ...new Set(courses.map(c => c.department).filter(Boolean)).values()]

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">All Courses</h1>
        <p className="text-gray-500 text-sm mt-0.5">Admin view — {courses.length} course{courses.length !== 1 ? 's' : ''} across all faculty</p>
      </div>

      {/* Filters */}
      <div className="card mb-6 space-y-3">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="input pl-8 text-sm w-full"
              placeholder="Search by code or name…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select className="input text-sm" value={filterSem} onChange={e => setFilterSem(e.target.value)}>
            {SEMESTERS.map(s => <option key={s}>{s}</option>)}
          </select>
          <select className="input text-sm" value={filterYear} onChange={e => setFilterYear(e.target.value)}>
            {YEARS_OPT.map(y => <option key={y}>{y}</option>)}
          </select>
          <select className="input text-sm" value={filterDept} onChange={e => setFilterDept(e.target.value)}>
            {deptList.map(d => <option key={d}>{d}</option>)}
          </select>
          <select className="input text-sm" value={filterInst} onChange={e => setFilterInst(e.target.value)}>
            <option value="All">All Instructors</option>
            {facultyList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="input text-sm" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            {STATUS_OPT.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <p className="text-xs text-gray-400">{filtered.length} of {courses.length} courses shown</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-14 bg-white rounded-xl animate-pulse border border-gray-100" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-16">
          <BookOpen size={48} className="mx-auto mb-4 text-gray-300" />
          <p className="font-medium text-gray-600">No courses match the current filters</p>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Course Code', 'Course Name', 'Instructor', 'Semester', 'Year', 'Dept', 'Evidence', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(c => {
                const instructor = profileMap[c.instructor_id]
                const count      = coverage[c.id] || 0
                const complete   = count === total
                return (
                  <tr key={c.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 py-3 font-mono font-semibold text-indigo-700 text-xs">{c.code}</td>
                    <td className="px-4 py-3 text-gray-800 max-w-[200px] truncate" title={c.name}>{c.name}</td>
                    <td className="px-4 py-3 text-gray-600 text-sm">{instructor?.name || <span className="text-gray-300 italic text-xs">—</span>}</td>
                    <td className="px-4 py-3 text-gray-600 text-sm">{c.semester}</td>
                    <td className="px-4 py-3 text-gray-600 text-sm">{c.year}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{c.department}</span>
                    </td>
                    <td className="px-4 py-3">
                      {complete ? (
                        <span className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium w-fit">
                          <CheckCircle size={11} /> {count}/{total}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium w-fit">
                          <Clock size={11} /> {count}/{total}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/courses/${c.id}`}
                        className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                      >
                        <ExternalLink size={12} /> View
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
