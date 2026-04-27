import { useState, useEffect, useRef } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Share2, FileText, Settings as SettingsIcon,
  Menu, X, Activity, ChevronDown, UserPlus, Bell,
} from 'lucide-react';
import { getUsers } from '../../lib/api';
import { getInitials } from '../../lib/utils';
import type { User } from '../../types';

const NAV_ITEMS = [
  { name: 'Dashboard',   path: '/dashboard', icon: LayoutDashboard },
  { name: 'Family Tree', path: '/graph',      icon: Share2 },
  { name: 'Reports',     path: '/reports',    icon: FileText },
  { name: 'Settings',    path: '/settings',   icon: SettingsIcon },
];

const AVATAR_COLORS = [
  'from-teal-400 to-emerald-500',
  'from-violet-400 to-indigo-500',
  'from-rose-400 to-pink-500',
  'from-amber-400 to-orange-500',
  'from-sky-400 to-blue-500',
];

function avatarColor(name: string) {
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

export function AppLayout() {
  const [collapsed, setCollapsed]       = useState(true);
  const [users, setUsers]               = useState<User[]>([]);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const selectorRef = useRef<HTMLDivElement>(null);

  const location = useLocation();
  const navigate  = useNavigate();

  const pathId = location.pathname.split('/')[2];

  useEffect(() => {
    getUsers()
      .then(data => {
        setUsers(data);
        if (pathId) {
          const u = data.find(u => u._id === pathId);
          if (u) setSelectedUser(u);
        }
      })
      .catch(console.error);
  }, [pathId]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (selectorRef.current && !selectorRef.current.contains(e.target as Node)) {
        setSelectorOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelectUser = (user: User) => {
    setSelectedUser(user);
    setSelectorOpen(false);
    navigate(`/dashboard/${user._id}`);
  };

  const pageTitle = (() => {
    const segment = location.pathname.split('/')[1];
    const map: Record<string, string> = {
      dashboard: 'Dashboard',
      graph:     'Family Tree',
      reports:   'Reports',
      settings:  'Settings',
    };
    return map[segment] ?? 'Health Tracker';
  })();

  return (
    <div className="flex h-screen bg-slate-50 font-sans overflow-hidden">
      {/* ─── Sidebar ─── */}
      <aside className={`${collapsed ? 'w-[72px]' : 'w-60'} flex-shrink-0 flex flex-col bg-slate-950 text-slate-100 transition-all duration-200 ease-in-out z-20`}>
        {/* Logo row */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800/60">
          {!collapsed && (
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-2 font-extrabold text-lg text-white hover:text-teal-400 transition-colors"
            >
              <div className="w-7 h-7 rounded-lg bg-teal-500 flex items-center justify-center">
                <Activity className="w-4 h-4 text-white" />
              </div>
              HealthAI
            </button>
          )}
          <button
            onClick={() => setCollapsed(c => !c)}
            className={`p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors ${collapsed ? 'mx-auto' : ''}`}
          >
            {collapsed ? <Menu className="w-4 h-4" /> : <X className="w-4 h-4" />}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-5 px-2.5 space-y-0.5">
          {NAV_ITEMS.map(item => {
            const active = location.pathname.startsWith(item.path);
            return (
              <button
                key={item.name}
                onClick={() => navigate(item.path)}
                title={collapsed ? item.name : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                  active
                    ? 'bg-teal-500/15 text-teal-400'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                }`}
              >
                <item.icon className={`w-4.5 h-4.5 flex-shrink-0 ${collapsed ? 'mx-auto' : ''}`} />
                {!collapsed && <span>{item.name}</span>}
                {!collapsed && active && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-teal-400" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom user strip */}
        {!collapsed && (
          <div className="px-4 py-4 border-t border-slate-800/60 flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br from-teal-400 to-emerald-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
              F
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-200 truncate">Family Admin</p>
              <p className="text-[10px] text-slate-500">Premium</p>
            </div>
          </div>
        )}
      </aside>

      {/* ─── Main ─── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top header */}
        <header className="h-16 flex-shrink-0 bg-white border-b border-slate-100 flex items-center justify-between px-6 gap-4 shadow-sm z-10">
          <h1 className="text-lg font-bold text-slate-900">{pageTitle}</h1>

          <div className="flex items-center gap-3">
            {/* Notification bell */}
            <button className="relative p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors">
              <Bell className="w-4.5 h-4.5" />
            </button>

            {/* User selector */}
            <div className="relative" ref={selectorRef}>
              <button
                onClick={() => setSelectorOpen(o => !o)}
                className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-2xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all"
              >
                <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${selectedUser ? avatarColor(selectedUser.name) : 'from-slate-300 to-slate-400'} flex items-center justify-center text-white text-xs font-bold`}>
                  {selectedUser ? getInitials(selectedUser.name) : 'F'}
                </div>
                <div className="text-left hidden sm:block">
                  <p className="text-xs font-semibold text-slate-800 leading-none">{selectedUser?.name ?? 'Family View'}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{selectedUser ? 'Active member' : 'All members'}</p>
                </div>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${selectorOpen ? 'rotate-180' : ''}`} />
              </button>

              {selectorOpen && (
                <div className="absolute right-0 mt-2 w-60 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden z-50">
                  <div className="px-4 pt-3 pb-2">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Switch member</p>
                  </div>
                  <div className="max-h-60 overflow-y-auto pb-2">
                    <button
                      onClick={() => { setSelectedUser(null); setSelectorOpen(false); navigate('/dashboard'); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center text-xs font-bold">F</div>
                      <span className="text-sm font-medium text-slate-700">Family Overview</span>
                    </button>
                    {users.map(u => (
                      <button
                        key={u._id}
                        onClick={() => handleSelectUser(u)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors ${selectedUser?._id === u._id ? 'bg-teal-50' : 'hover:bg-slate-50'}`}
                      >
                        <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${avatarColor(u.name)} flex items-center justify-center text-white text-xs font-bold`}>
                          {getInitials(u.name)}
                        </div>
                        <span className={`text-sm font-medium ${selectedUser?._id === u._id ? 'text-teal-700' : 'text-slate-700'}`}>{u.name}</span>
                      </button>
                    ))}
                  </div>
                  <div className="border-t border-slate-100 p-2">
                    <button
                      onClick={() => { setSelectorOpen(false); navigate('/dashboard'); }}
                      className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-50 transition-colors"
                    >
                      <UserPlus className="w-3.5 h-3.5" /> Add member
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-6 md:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
