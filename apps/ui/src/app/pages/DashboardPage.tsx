import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus, Users, HeartPulse } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createUser, deleteUser } from '../lib/api';
import { useUsers } from '../hooks/useUsers';
import { FamilyMemberCard } from '../components/family/FamilyMemberCard';
import { PageSpinner } from '../components/ui/Spinner';

export function DashboardPage() {
  const navigate = useNavigate();
  const { users, loading, error, addUser, removeUser } = useUsers();

  const [showForm, setShowForm]   = useState(false);
  const [name, setName]           = useState('');
  const [dob, setDob]             = useState('');
  const [sex, setSex]             = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !dob) return;
    setSubmitting(true);
    try {
      const user = await createUser({ name: name.trim(), dob, biologicalSex: sex || undefined });
      addUser(user);
      setShowForm(false);
      setName(''); setDob(''); setSex('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteUser(id);
      removeUser(id);
    } catch {}
  };

  if (loading) return <PageSpinner />;

  if (error) return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="text-slate-400 font-medium">Failed to load family members.</p>
      <p className="text-xs text-slate-300 mt-1">{error}</p>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Page header */}
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900">Family Dashboard</h2>
          <p className="text-sm text-slate-500 mt-1">
            {users.length === 0
              ? 'Add your first family member to get started'
              : `Tracking health for ${users.length} member${users.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-2 px-4 py-2.5 bg-teal-500 hover:bg-teal-600 text-white text-sm font-bold rounded-2xl shadow-md shadow-teal-200 transition-all active:scale-95"
        >
          <UserPlus className="w-4 h-4" />
          Add Member
        </button>
      </div>

      {/* Add member form */}
      <AnimatePresence>
        {showForm && (
          <motion.form
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            onSubmit={handleCreate}
            className="bg-white rounded-3xl border border-teal-100 shadow-sm p-6 grid grid-cols-1 sm:grid-cols-4 gap-4"
          >
            <div className="sm:col-span-2">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1.5">Full Name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Sarah Johnson"
                required
                className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-2xl focus:ring-2 focus:ring-teal-300 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1.5">Date of Birth</label>
              <input
                type="date"
                value={dob}
                onChange={e => setDob(e.target.value)}
                required
                className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-2xl focus:ring-2 focus:ring-teal-300 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1.5">Sex (optional)</label>
              <select
                value={sex}
                onChange={e => setSex(e.target.value)}
                className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-2xl focus:ring-2 focus:ring-teal-300 focus:outline-none bg-white"
              >
                <option value="">Not specified</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="sm:col-span-4 flex gap-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 py-2.5 text-sm font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-2xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 py-2.5 text-sm font-bold text-white bg-teal-500 hover:bg-teal-600 rounded-2xl shadow-sm disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Adding...' : 'Add Family Member'}
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Members grid */}
      {users.length === 0 ? (
        <div className="py-24 flex flex-col items-center justify-center text-center">
          <div className="w-20 h-20 bg-teal-50 rounded-3xl flex items-center justify-center mb-6">
            <Users className="w-10 h-10 text-teal-300" />
          </div>
          <h3 className="text-xl font-bold text-slate-700 mb-2">No family members yet</h3>
          <p className="text-slate-400 text-sm max-w-sm leading-relaxed">
            Add your family members to start tracking their health, diet, and lifestyle records.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-6 flex items-center gap-2 px-5 py-3 bg-teal-500 hover:bg-teal-600 text-white font-bold rounded-2xl shadow-md shadow-teal-200 transition-all active:scale-95"
          >
            <UserPlus className="w-4 h-4" />
            Add First Member
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {users.map(user => (
            <FamilyMemberCard
              key={user._id}
              user={user}
              onClick={() => navigate(`/dashboard/${user._id}`)}
              onDelete={() => handleDelete(user._id)}
            />
          ))}

          {/* Add card */}
          <button
            onClick={() => setShowForm(true)}
            className="group min-h-[200px] rounded-3xl border-2 border-dashed border-slate-200 hover:border-teal-300 hover:bg-teal-50/30 transition-all flex flex-col items-center justify-center gap-3 text-slate-400 hover:text-teal-600"
          >
            <div className="w-12 h-12 rounded-2xl border-2 border-current flex items-center justify-center group-hover:scale-105 transition-transform">
              <UserPlus className="w-5 h-5" />
            </div>
            <span className="text-sm font-bold">Add Member</span>
          </button>
        </div>
      )}

      {/* Health summary strip */}
      {users.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
          <div className="p-3 bg-rose-50 rounded-2xl text-rose-500">
            <HeartPulse className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">Family Health Overview</p>
            <p className="text-xs text-slate-400 mt-0.5">Select a member to view detailed health records, diet logs, and AI insights.</p>
          </div>
        </div>
      )}
    </div>
  );
}
