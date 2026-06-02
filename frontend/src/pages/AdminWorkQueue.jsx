import { useState, useEffect } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getWorkQueue, updateWorkQueueStatus } from '../api'
import { CheckCircle, Inbox, ExternalLink } from 'lucide-react'

function StatusBadge({ status }) {
  const styles = {
    pending:  'bg-yellow-100 text-yellow-700 border-yellow-200',
    reviewed: 'bg-blue-100 text-blue-700 border-blue-200',
    approved: 'bg-green-100 text-green-700 border-green-200',
  }
  const labels = { pending: 'Pending', reviewed: 'Reviewed', approved: 'Approved' }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${styles[status] || styles.pending}`}>
      {labels[status] || status}
    </span>
  )
}

export default function AdminWorkQueue() {
  const { user } = useAuth()

  if (user?.role !== 'admin') return <Navigate to="/" replace />

  const [queue,    setQueue]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [updating, setUpdating] = useState(null)

  const load = async () => {
    try {
      const { data } = await getWorkQueue()
      setQueue(data || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleUpdate = async (id, status) => {
    setUpdating(id)
    try {
      const { data: updated } = await updateWorkQueueStatus(id, status)
      setQueue(prev => prev.map(e => e.id === id ? { ...e, ...updated } : e))
    } catch (err) {
      alert('Failed to update: ' + (err.response?.data?.detail || 'Unknown error'))
    } finally { setUpdating(null) }
  }

  const counts = {
    pending:  queue.filter(e => e.status === 'pending').length,
    reviewed: queue.filter(e => e.status === 'reviewed').length,
    approved: queue.filter(e => e.status === 'approved').length,
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Work Queue</h1>
        <p className="text-gray-500 text-sm mt-0.5">Course submissions pending admin review</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Pending',  count: counts.pending,  cls: 'bg-yellow-50 border-yellow-200 text-yellow-700' },
          { label: 'Reviewed', count: counts.reviewed, cls: 'bg-blue-50 border-blue-200 text-blue-700'       },
          { label: 'Approved', count: counts.approved, cls: 'bg-green-50 border-green-200 text-green-700'    },
        ].map(({ label, count, cls }) => (
          <div key={label} className={`card border text-center py-4 ${cls}`}>
            <p className="text-2xl font-bold">{count}</p>
            <p className="text-sm font-medium mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-14 bg-white rounded-xl animate-pulse border border-gray-100" />)}
        </div>
      ) : queue.length === 0 ? (
        <div className="card text-center py-16">
          <Inbox size={48} className="mx-auto mb-4 text-gray-300" />
          <p className="font-medium text-gray-600">No submissions in the queue</p>
          <p className="text-sm text-gray-400 mt-1">
            Courses appear here when faculty complete all 9 evidence uploads.
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Course', 'Faculty', 'Submitted At', 'Status', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {queue.map(entry => (
                <tr key={entry.id} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-4 py-3">
                    {entry.course ? (
                      <>
                        <div className="font-semibold text-gray-800">{entry.course.code}</div>
                        <div className="text-xs text-gray-500">
                          {entry.course.name} · {entry.course.semester} {entry.course.year}
                        </div>
                      </>
                    ) : (
                      <span className="text-gray-400 italic text-xs">Unknown course</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{entry.faculty?.name || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                    {new Date(entry.submitted_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={entry.status} />
                    {entry.reviewed_at && (
                      <div className="text-xs text-gray-400 mt-0.5">
                        {new Date(entry.reviewed_at).toLocaleDateString()}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      {entry.course_id && (
                        <Link
                          to={`/courses/${entry.course_id}`}
                          className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                        >
                          <ExternalLink size={12} /> View
                        </Link>
                      )}
                      {entry.status === 'pending' && (
                        <button
                          onClick={() => handleUpdate(entry.id, 'reviewed')}
                          disabled={updating === entry.id}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50"
                        >
                          Mark Reviewed
                        </button>
                      )}
                      {entry.status !== 'approved' && (
                        <button
                          onClick={() => handleUpdate(entry.id, 'approved')}
                          disabled={updating === entry.id}
                          className="text-xs text-green-600 hover:text-green-800 font-medium disabled:opacity-50"
                        >
                          Approve
                        </button>
                      )}
                      {entry.status === 'approved' && (
                        <span className="flex items-center gap-1 text-xs text-green-600">
                          <CheckCircle size={11} /> Approved
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
