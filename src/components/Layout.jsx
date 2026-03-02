import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  LayoutDashboard, BookOpen, LogOut, GraduationCap, Menu, X
} from 'lucide-react'

const nav = [
  { to: '/',        label: 'Dashboard', icon: LayoutDashboard },
  { to: '/courses', label: 'Courses',   icon: BookOpen },
]

export default function Layout() {
  const { user, signOut }   = useAuth()
  const navigate            = useNavigate()
  const [open, setOpen]     = useState(false)

  const handleLogout = () => {
    signOut()
    navigate('/login')
  }

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-indigo-800">
        <div className="w-9 h-9 bg-indigo-500 rounded-lg flex items-center justify-center shrink-0">
          <GraduationCap size={20} />
        </div>
        <div>
          <p className="font-bold text-base leading-tight">AccrediSmart</p>
          <p className="text-indigo-300 text-xs">Accreditation System</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-700 text-white'
                  : 'text-indigo-200 hover:bg-indigo-800 hover:text-white'
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User info */}
      <div className="px-3 py-4 border-t border-indigo-800">
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-indigo-800 mb-2">
          <div className="w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center text-xs font-bold shrink-0">
            {user?.name?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.name}</p>
            <p className="text-xs text-indigo-300 capitalize">{user?.role}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-indigo-200 hover:bg-indigo-800 hover:text-white transition-colors"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </>
  )

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">

      {/* ── Desktop sidebar (always visible ≥ md) ──────────────── */}
      <aside className="hidden md:flex w-64 bg-indigo-900 text-white flex-col shrink-0">
        <SidebarContent />
      </aside>

      {/* ── Mobile overlay backdrop ─────────────────────────────── */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* ── Mobile slide-in sidebar ─────────────────────────────── */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 bg-indigo-900 text-white flex flex-col transform transition-transform duration-200 md:hidden ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Close button inside mobile sidebar */}
        <button
          onClick={() => setOpen(false)}
          className="absolute top-4 right-4 text-indigo-300 hover:text-white"
        >
          <X size={20} />
        </button>
        <SidebarContent />
      </aside>

      {/* ── Main area ───────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Mobile top bar */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 shrink-0">
          <button
            onClick={() => setOpen(true)}
            className="text-gray-600 hover:text-indigo-600 p-1"
          >
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
              <GraduationCap size={15} className="text-white" />
            </div>
            <span className="font-bold text-gray-900 text-sm">AccrediSmart</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
