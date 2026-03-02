import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, FileText, Users, Target, ArrowRight, TrendingUp, CheckCircle, Clock } from 'lucide-react'
import { getDashboardStats, getCourses } from '../api'
import { useAuth } from '../contexts/AuthContext'

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="card flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
        <Icon size={22} className="text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value ?? '—'}</p>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const [stats, setStats]     = useState(null)
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getDashboardStats(), getCourses()])
      .then(([s, c]) => {
        setStats(s.data)
        setCourses(c.data.slice(0, 5))
      })
      .finally(() => setLoading(false))
  }, [])

  const statCards = [
    { icon: BookOpen, label: 'Courses',   value: stats?.total_courses,   color: 'bg-indigo-500' },
    { icon: FileText, label: 'Documents', value: stats?.total_documents, color: 'bg-blue-500'   },
    { icon: Target,   label: 'CLOs',      value: stats?.total_clos,      color: 'bg-violet-500' },
    { icon: Users,    label: 'Students',  value: stats?.total_students,  color: 'bg-emerald-500'},
  ]

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {user?.name?.split(' ')[0]} 👋
        </h1>
        <p className="text-gray-500 mt-1">
          {new Date().toLocaleDateString('en-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Workflow banner */}
      <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl p-6 text-white mb-8">
        <h2 className="text-lg font-semibold mb-3">FCAR Workflow</h2>
        <div className="flex items-center gap-3 flex-wrap">
          {['Upload Evidence', 'Define CLOs', 'Map to NCAAA', 'Enter Grades', 'Calculate Attainment', 'View Report'].map((step, i, arr) => (
            <div key={step} className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-white/20 px-3 py-1.5 rounded-full text-sm">
                <span className="w-5 h-5 bg-white/30 rounded-full text-xs flex items-center justify-center font-bold">{i + 1}</span>
                {step}
              </div>
              {i < arr.length - 1 && <ArrowRight size={14} className="text-white/60 shrink-0" />}
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map(c => <StatCard key={c.label} {...c} />)}
      </div>

      {/* Recent courses */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">Recent Courses</h3>
          <Link to="/courses" className="text-indigo-600 text-sm hover:underline flex items-center gap-1">
            View all <ArrowRight size={14} />
          </Link>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />)}
          </div>
        ) : courses.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <BookOpen size={40} className="mx-auto mb-3 opacity-40" />
            <p className="font-medium">No courses yet</p>
            <Link to="/courses" className="btn-primary mt-4 inline-flex">Add your first course</Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {courses.map(c => (
              <Link
                key={c.id}
                to={`/courses/${c.id}`}
                className="flex items-center justify-between py-3 hover:bg-gray-50 rounded-lg px-2 -mx-2 transition-colors"
              >
                <div>
                  <p className="font-medium text-gray-900 text-sm">{c.code} – {c.name}</p>
                  <p className="text-xs text-gray-400">{c.department} · {c.semester} {c.year}</p>
                </div>
                <ArrowRight size={16} className="text-gray-300" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
