import { useState, useEffect, useRef } from 'react';
import { Routes, Route, useNavigate, useLocation, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  Users as UsersIcon,
  FileText,
  Settings as SettingsIcon,
  Menu,
  X,
  Activity,
  BrainCircuit,
  Apple,
  ChevronRight,
  UserPlus,
  Share2,
  Plus,
  Trash2,
  Edit3,
  Clock,
  Calendar,
  MessageSquare,
  UtensilsCrossed,
  Leaf,
  RefreshCw,
  BookOpen,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  SlidersHorizontal,
  Paperclip,
  ImageIcon,
  FileScan,
  Stethoscope,
  Pill,
  FlaskConical,
  Link2,
  MapPin,
  Building2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ForceGraph2D from 'react-force-graph-2d';
import './app.css';
import { MealPlanDashboard } from './MealPlanDashboard';

interface DoctorInfo {
  name?: string;
  hospital?: string;
  address?: string;
  specialty?: string;
}

interface MedicationItem {
  name: string;
  dosage: string;
  frequency: string;
  duration?: string;
  route: string;
  isDaily: boolean;
  instructions?: string;
}

interface TestItem {
  testName: string;
  value?: string;
  referenceRange?: string;
  interpretation?: string;
  status: string; // NORMAL | ABNORMAL | BORDERLINE
}

interface HealthEvent {
  _id: string;
  eventType: string; // DOCTOR_VISIT | PRESCRIPTION | TEST_RESULTS | TREATMENT_START
  date: string;
  titles: string[];
  status: string;
  description?: string;
  source?: string;
  reportGroupId?: string;
  details?: {
    // DOCTOR_VISIT
    doctorInfo?: DoctorInfo;
    conditions?: string[];
    symptoms?: string[];
    injections?: string[];
    notes?: string;
    // PRESCRIPTION
    medications?: MedicationItem[];
    // TEST_RESULTS
    testResults?: TestItem[];
    // Legacy fields
    doctorName?: string;
    doctorNotes?: string;
  };
}

interface DietLog {
  _id: string;
  date: string;
  mealTypes: string[];
  foodItems: { name: string; quantity: string }[];
  description?: string;
  source?: string;
}

interface LifestyleRecord {
  _id: string;
  date: string;
  endDate?: string;
  description: string;
  categories: string[];
  source?: string;
}

interface MealIngredient {
  name: string;
  teluguName?: string;
  tamilName?: string;
  quantity: string;
}

interface Meal {
  mealType: string;
  title: string;
  reasoning: string;
  benefits: string;
  recipeId?: string;
  ingredients: MealIngredient[];
}

interface MealPlanDay {
  dayNumber: number;
  date: string;
  meals: Meal[];
}

interface MealPlan {
  _id: string;
  days: MealPlanDay[];
  warnings: string[];
  isActive: boolean;
  createdAt: string;
}

interface Recipe {
  _id: string;
  title: string;
  description: string;
  instructions: string[];
  ingredients: MealIngredient[];
  youtubeLink?: string;
  source: string;
}

interface User {
  _id: string;
  name: string;
  dob: string;
  biologicalSex?: string;
  createdAt: string;
  medicalConditions?: string[];
  allergies?: string[];
  medications?: string[];
}

// -----------------------------------------------------------------------------
// Layout Component
// -----------------------------------------------------------------------------
function Layout() {
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isUserSelectorOpen, setIsUserSelectorOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<{role: 'user' | 'ai', content: string}[]>([]);
  
  const location = useLocation();
  const navigate = useNavigate();
  const userIdFromPath = location.pathname.split('/')[2];

  useEffect(() => {
    fetch('http://localhost:3000/api/users')
      .then(r => r.json())
      .then(data => {
        setUsers(data);
        if (userIdFromPath) {
          const user = data.find((u: User) => u._id === userIdFromPath);
          if (user) setSelectedUser(user);
        }
      })
      .catch(e => console.error(e));
  }, [userIdFromPath]);

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Users', path: '/users', icon: UsersIcon },
    { name: 'Family Tree', path: '/graph', icon: Share2 },
    { name: 'Reports', path: '/reports', icon: FileText },
    { name: 'Settings', path: '/settings', icon: SettingsIcon },
  ];

  const handleUserSelect = (user: User) => {
    setSelectedUser(user);
    setIsUserSelectorOpen(false);
    navigate(`/users/${user._id}`);
  };

  const handleSendMessage = async () => {
    if (!chatMessage.trim() || !selectedUser) return;

    const newMessage = { role: 'user' as const, content: chatMessage };
    setChatHistory(prev => [...prev, newMessage]);
    setChatMessage('');

    try {
      const response = await fetch(`http://localhost:3000/api/agent/${selectedUser._id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: chatMessage, history: chatHistory })
      });
      
      if (response.ok) {
        const data = await response.json();
        setChatHistory(prev => [...prev, { role: 'ai', content: data.reply }]);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      {/* Sidebar */}
      <aside 
        className={`${isSidebarOpen ? 'w-64' : 'w-20'} 
          transition-all duration-300 ease-in-out bg-slate-900 text-slate-100 flex flex-col shadow-2xl z-20`}
      >
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800">
          {isSidebarOpen && (
            <div className="flex items-center space-x-2 font-bold text-xl tracking-tight text-white cursor-pointer" onClick={() => navigate('/')}>
              <Activity className="text-teal-400 w-6 h-6" />
              <span>Workbench</span>
            </div>
          )}
          <button 
            onClick={() => setSidebarOpen(!isSidebarOpen)}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors ml-auto"
          >
            {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        <nav className="flex-1 py-6 space-y-1 px-3">
          {navItems.map((item) => {
            const isActive = location.pathname.startsWith(item.path);
            return (
              <button
                key={item.name}
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center px-3 py-3 rounded-xl transition-all duration-200 ${
                  isActive 
                  ? 'bg-teal-500/10 text-teal-400 font-medium' 
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
                title={!isSidebarOpen ? item.name : undefined}
              >
                <item.icon className={`w-5 h-5 flex-shrink-0 ${isSidebarOpen ? 'mr-3' : 'mx-auto'}`} />
                {isSidebarOpen && <span>{item.name}</span>}
              </button>
            );
          })}
        </nav>
        
        {/* User Profile Snippet at bottom */}
        {isSidebarOpen && (
           <div className="p-4 border-t border-slate-800 flex items-center space-x-3">
             <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-teal-500 to-emerald-400 flex items-center justify-center text-white font-bold text-sm">
               F
             </div>
             <div>
               <p className="text-sm font-medium text-slate-200">Family Admin</p>
               <p className="text-xs text-slate-500">Premium Plan</p>
             </div>
           </div>
        )}
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#F8FAFC]">
        <header className="h-16 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-8 shadow-sm z-30 sticky top-0">
           <div className="flex items-center space-x-4">
             <h1 className="text-xl font-bold text-slate-800 tracking-tight capitalize">
               {location.pathname.split('/')[1] || 'Dashboard'}
             </h1>
           </div>

           <div className="flex items-center space-x-6">
              {/* User Selector */}
              <div className="relative">
                <button 
                  onClick={() => setIsUserSelectorOpen(!isUserSelectorOpen)}
                  className="flex items-center space-x-3 hover:bg-slate-50 p-1.5 rounded-2xl transition-colors pr-4 border border-transparent hover:border-slate-200"
                >
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-teal-500 to-emerald-400 text-white flex items-center justify-center font-bold shadow-sm">
                    {selectedUser ? selectedUser.name.charAt(0).toUpperCase() : 'F'}
                  </div>
                  <div className="text-left hidden md:block">
                    <p className="text-sm font-bold text-slate-800 leading-tight">{selectedUser ? selectedUser.name : 'Family View'}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-tight">{selectedUser ? 'Selected Member' : 'All Members'}</p>
                  </div>
                </button>

                {isUserSelectorOpen && (
                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-in slide-in-from-top-2 duration-200">
                    <div className="p-3 border-b border-slate-100 bg-slate-50">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">Switch User</p>
                    </div>
                    <div className="max-h-64 overflow-y-auto py-2">
                      <button 
                        onClick={() => { setSelectedUser(null); setIsUserSelectorOpen(false); navigate('/dashboard'); }}
                        className="w-full flex items-center px-4 py-2 hover:bg-slate-50 transition-colors space-x-3"
                      >
                        <div className="w-8 h-8 rounded-lg bg-slate-200 text-slate-500 flex items-center justify-center text-xs font-bold">F</div>
                        <span className="text-sm font-medium text-slate-700">Family Overview</span>
                      </button>
                      {users.map(u => (
                        <button 
                          key={u._id}
                          onClick={() => handleUserSelect(u)}
                          className={`w-full flex items-center px-4 py-2 hover:bg-slate-50 transition-colors space-x-3 ${selectedUser?._id === u._id ? 'bg-teal-50/50' : ''}`}
                        >
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-teal-500 to-emerald-400 text-white flex items-center justify-center text-xs font-bold">
                            {u.name.charAt(0).toUpperCase()}
                          </div>
                          <span className={`text-sm font-medium ${selectedUser?._id === u._id ? 'text-teal-600' : 'text-slate-700'}`}>{u.name}</span>
                        </button>
                      ))}
                    </div>
                    <div className="p-2 bg-slate-50 border-t border-slate-100">
                      <button 
                        onClick={() => { setIsUserSelectorOpen(false); navigate('/dashboard'); }}
                        className="w-full flex items-center justify-center space-x-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Add New Member</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
           </div>
        </header>
        <div className="flex-1 overflow-y-auto p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Dashboard / Family Manager Overview
// -----------------------------------------------------------------------------
function FamilyDashboard() {
  const [users, setUsers] = useState<User[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newMember, setNewMember] = useState({ name: '', dob: '', biologicalSex: 'Other' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  const fetchUsers = () => {
    fetch('http://localhost:3000/api/users')
      .then(r => r.json())
      .then(data => setUsers(data))
      .catch(e => console.error(e));
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const response = await fetch('http://localhost:3000/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMember),
      });
      if (response.ok) {
        setIsAddModalOpen(false);
        setNewMember({ name: '', dob: '', biologicalSex: 'Other' });
        fetchUsers();
      }
    } catch (error) {
      console.error('Failed to add member:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteMember = async (userId: string) => {
    if (!window.confirm('Are you sure you want to delete this family member? All their health records will be deleted.')) return;
    try {
      const response = await fetch(`http://localhost:3000/api/users/${userId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        fetchUsers();
      }
    } catch (error) {
      console.error('Failed to delete member:', error);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      
      {/* Hero Stats Card */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-3xl p-8 shadow-xl text-white relative overflow-hidden border border-slate-700/50">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-teal-500/20 blur-3xl"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-48 h-48 rounded-full bg-purple-500/20 blur-3xl"></div>
        
        <div className="relative z-10 flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight mb-2">Family Health Overview</h2>
            <p className="text-slate-400">AI is actively tracking health signals for {users.length} family members.</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/10 text-center">
             <BrainCircuit className="w-8 h-8 text-teal-400 mx-auto mb-1" />
             <span className="text-sm font-medium text-slate-300">AI Status: Active</span>
          </div>
        </div>
      </div>

      {/* Users Grid */}
      <div>
        <div className="flex justify-between items-end mb-6">
          <h3 className="text-xl font-bold text-slate-800">Family Members</h3>
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="text-sm font-medium text-teal-600 bg-teal-50 hover:bg-teal-100 px-4 py-2 rounded-lg transition-colors flex items-center border border-teal-100"
          >
             <UserPlus className="w-4 h-4 mr-2" /> Add Member
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {users.map(user => (
            <div 
              key={user._id} 
              onClick={() => navigate(`/users/${user._id}`)}
              className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 hover:shadow-xl hover:border-teal-200 transition-all cursor-pointer group flex flex-col"
            >
               <div className="flex items-center space-x-4 mb-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-teal-500 to-emerald-400 text-white flex items-center justify-center text-xl font-bold shadow-md group-hover:scale-105 transition-transform">
                    {user.name ? user.name.charAt(0).toUpperCase() : '?'}
                  </div>
                 <div>
                   <h4 className="font-bold text-slate-800 group-hover:text-teal-600 transition-colors">{user.name}</h4>
                   <div className="flex items-center gap-2">
                     <p className="text-xs text-slate-500 font-medium">DOB: {new Date(user.dob).toLocaleDateString()}</p>
                     <button 
                       onClick={(e) => {
                         e.stopPropagation();
                         handleDeleteMember(user._id);
                       }}
                       className="p-1 text-slate-400 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
                       title="Delete Member"
                     >
                       <Trash2 className="w-3.5 h-3.5" />
                     </button>
                   </div>
                 </div>
               </div>
               
               <div className="mt-auto pt-4 border-t border-slate-100 flex justify-between items-center">
                 <div className="flex space-x-2">
                   {user.medicalConditions && user.medicalConditions.length > 0 ? (
                      <span className="text-[10px] uppercase tracking-wider font-bold bg-rose-50 text-rose-600 px-2 py-1 rounded-md">Conditions</span>
                   ) : (
                      <span className="text-[10px] uppercase tracking-wider font-bold bg-slate-100 text-slate-500 px-2 py-1 rounded-md">Healthy</span>
                   )}
                 </div>
                 <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-teal-500 transition-colors" />
               </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add Member Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold text-slate-800">Add Family Member</h3>
              <button 
                onClick={() => setIsAddModalOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="w-6 h-6 text-slate-400" />
              </button>
            </div>
            
            <form onSubmit={handleAddMember} className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Full Name</label>
                <input 
                  type="text" 
                  required
                  value={newMember.name}
                  onChange={e => setNewMember({...newMember, name: e.target.value})}
                  placeholder="e.g. John Doe"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Date of Birth</label>
                  <input 
                    type="date" 
                    required
                    value={newMember.dob}
                    onChange={e => setNewMember({...newMember, dob: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Biological Sex</label>
                  <select 
                    value={newMember.biologicalSex}
                    onChange={e => setNewMember({...newMember, biologicalSex: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all bg-white"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="flex-1 px-6 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-6 py-3 rounded-xl font-bold text-white bg-teal-500 hover:bg-teal-600 shadow-lg shadow-teal-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Adding...' : 'Add Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// User Detailed Dashboard
// -----------------------------------------------------------------------------
function UserDashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [healthEvents, setHealthEvents] = useState<HealthEvent[]>([]);
  const [dietLogs, setDietLogs] = useState<DietLog[]>([]);
  const [lifestyleRecords, setLifestyleRecords] = useState<LifestyleRecord[]>([]);
  // Tab state for records
  const [healthTab, setHealthTab] = useState<'USER' | 'DOCTOR'>('USER');
  const [dietTab, setDietTab] = useState<'USER' | 'DOCTOR'>('USER');
  const [lifestyleTab, setLifestyleTab] = useState<'USER' | 'DOCTOR'>('USER');
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);

  // Meal Plan state
  const [mealPlan, setMealPlan] = useState<MealPlan | null>(null);
  const [mealPlanLoading, setMealPlanLoading] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState<Meal | null>(null);
  const [isMealPlanOpen, setIsMealPlanOpen] = useState(false);
  const [activePlanDay, setActivePlanDay] = useState(0);
  const [ingredientsOpen, setIngredientsOpen] = useState(true);
  const [mealPreferences, setMealPreferences] = useState({
    cuisine: 'SOUTH_INDIAN',
    customCuisine: '',
    languages: ['ENGLISH'] as string[],
    goal: 'HEALTHY_LIVING',
    customGoal: '',
    durationDays: 3,
    customDays: ''
  });

  const CHAT_MODELS = [
    { id: 'claude-sonnet-4-6',       label: 'Claude',   note: 'Best quality',             activeClass: 'bg-violet-100 text-violet-700 border-violet-200'  },
    { id: 'gpt-4o-mini',             label: 'GPT-4o',   note: 'Fast & affordable',         activeClass: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3', note: 'Free — console.groq.com',  activeClass: 'bg-orange-100 text-orange-700 border-orange-200'  },
    { id: 'gemini-1.5-flash',        label: 'Gemini',   note: 'Free — aistudio.google.com', activeClass: 'bg-blue-100 text-blue-700 border-blue-200'        },
  ] as const;

  type ChatModelId = typeof CHAT_MODELS[number]['id'];

  const [selectedModel, setSelectedModel] = useState<ChatModelId>('claude-sonnet-4-6');
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<{
    role: 'user' | 'ai';
    content: string;
    intent?: string[];
    retrievedCount?: number;
    model?: string;
    attachedFile?: { name: string; type: string; preview?: string };
    isStreaming?: boolean;
    streamingStep?: string;
  }[]>([]);
  const [isChatSubmitting, setIsChatSubmitting] = useState(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Modals state
  const [isHealthModalOpen, setIsHealthModalOpen] = useState(false);
  const [isDietModalOpen, setIsDietModalOpen] = useState(false);
  
  // Forms state
  const [newEvent, setNewEvent] = useState({ eventType: 'DOCTOR_VISIT', title: '', date: new Date().toISOString().split('T')[0], status: 'ACTIVE' });
  const [newDiet, setNewDiet] = useState({ mealType: 'BREAKFAST', foodItems: [{ name: '', quantity: '' }], date: new Date().toISOString().split('T')[0] });
  
  const location = useLocation();
  const navigate = useNavigate();
  const userId = location.pathname.split('/').pop();

  const fetchData = async () => {
    try {
      const [userRes, eventsRes, logsRes, lifeRes, mealRes] = await Promise.all([
        fetch(`http://localhost:3000/api/users/${userId}`),
        fetch(`http://localhost:3000/api/users/${userId}/health-events`),
        fetch(`http://localhost:3000/api/users/${userId}/diet-logs`),
        fetch(`http://localhost:3000/api/users/${userId}/lifestyle`),
        fetch(`http://localhost:3000/api/users/${userId}/meal-plans/active`),
      ]);
      
      const userData = await userRes.json();
      const eventsData = await eventsRes.json();
      const logsData = await logsRes.json();
      const lifeData = await lifeRes.json();
      const mealData = mealRes.ok ? await mealRes.json() : null;
      
      setUser(userData);
      setHealthEvents(eventsData);
      setDietLogs(logsData);
      setLifestyleRecords(lifeData);
      if (mealData?._id) setMealPlan(mealData);
      if (userData?.mealPreferences) setMealPreferences(p => ({ ...p, ...userData.mealPreferences }));
    } catch (e) {
      console.error('Error fetching dashboard data:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateMealPlan = async () => {
    setMealPlanLoading(true);
    try {
      const payload = {
        cuisine: mealPreferences.customCuisine.trim() || mealPreferences.cuisine,
        language: mealPreferences.languages.join(','),
        goal: mealPreferences.customGoal.trim() || mealPreferences.goal,
        durationDays: mealPreferences.customDays
          ? Math.min(parseInt(mealPreferences.customDays) || 3, 30)
          : mealPreferences.durationDays
      };
      const res = await fetch(`http://localhost:3000/api/users/${userId}/meal-plans/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        setMealPlan(data);
        setActivePlanDay(0);
        setIngredientsOpen(true);
      }
    } catch (e) {
      console.error('Failed to generate meal plan', e);
    } finally {
      setMealPlanLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [userId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert('File must be under 10 MB.');
      return;
    }
    setAttachedFile(file);
    if (file.type.startsWith('image/')) {
      setFilePreviewUrl(URL.createObjectURL(file));
    } else {
      setFilePreviewUrl(null);
    }
    // reset input so the same file can be re-selected after removal
    e.target.value = '';
  };

  const clearAttachedFile = () => {
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    setAttachedFile(null);
    setFilePreviewUrl(null);
  };

  const handleSendMessage = async () => {
    const hasText = chatMessage.trim().length > 0;
    const hasFile = !!attachedFile;
    if ((!hasText && !hasFile) || !user) return;

    setIsChatSubmitting(true);
    const messageText = hasText ? chatMessage.trim() : 'Please analyse this document.';
    const fileSnapshot = attachedFile
      ? { name: attachedFile.name, type: attachedFile.type, preview: filePreviewUrl ?? undefined }
      : undefined;

    const historyForApi = [...chatHistory];

    setChatHistory(prev => [...prev, {
      role: 'user' as const,
      content: messageText,
      attachedFile: fileSnapshot,
    }]);
    setChatMessage('');
    const fileToSend = attachedFile;
    clearAttachedFile();

    // Add streaming AI placeholder immediately
    setChatHistory(prev => [...prev, {
      role: 'ai' as const,
      content: '',
      isStreaming: true,
      streamingStep: 'Starting...',
    }]);

    try {
      if (fileToSend) {
        // File uploads use the non-streaming endpoint
        const form = new FormData();
        form.append('file', fileToSend);
        form.append('message', messageText);
        form.append('history', JSON.stringify(historyForApi));
        form.append('model', selectedModel);
        const res = await fetch(`http://localhost:3000/api/agent/${user._id}/chat-with-file`, {
          method: 'POST',
          body: form,
        });
        if (res.ok) {
          const data = await res.json();
          setChatHistory(prev => [
            ...prev.slice(0, -1),
            { role: 'ai', content: data.reply, intent: data.intent, retrievedCount: data.retrievedCount, model: data.model, isStreaming: false },
          ]);
        }
      } else {
        // Text messages use SSE streaming
        const res = await fetch(`http://localhost:3000/api/agent/${user._id}/chat/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: messageText, history: historyForApi, model: selectedModel }),
        });

        if (!res.ok || !res.body) throw new Error('Stream request failed');

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // SSE messages are delimited by double newline
          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? '';

          for (const part of parts) {
            if (!part.trim()) continue;
            let eventType = 'message';
            let eventData = '';
            for (const line of part.split('\n')) {
              if (line.startsWith('event: ')) eventType = line.slice(7).trim();
              else if (line.startsWith('data: ')) eventData = line.slice(6);
            }
            if (!eventData) continue;
            try {
              const data = JSON.parse(eventData);
              if (eventType === 'node') {
                setChatHistory(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { ...updated[updated.length - 1], streamingStep: data.label };
                  return updated;
                });
              } else if (eventType === 'token') {
                setChatHistory(prev => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  updated[updated.length - 1] = { ...last, content: (last.content ?? '') + data.token };
                  return updated;
                });
              } else if (eventType === 'done') {
                setChatHistory(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    ...updated[updated.length - 1],
                    isStreaming: false,
                    streamingStep: undefined,
                    intent: data.intent,
                    retrievedCount: data.retrievedCount,
                    model: data.model,
                  };
                  return updated;
                });
              } else if (eventType === 'error') {
                setChatHistory(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: 'ai',
                    content: data.message || 'An error occurred.',
                    isStreaming: false,
                  };
                  return updated;
                });
              }
            } catch {
              // ignore malformed SSE data
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      setChatHistory(prev => [
        ...prev.slice(0, -1),
        { role: 'ai', content: 'Something went wrong. Please try again.', isStreaming: false },
      ]);
    } finally {
      setIsChatSubmitting(false);
    }
  };

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`http://localhost:3000/api/users/${userId}/health-events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEvent)
      });
      if (res.ok) {
        setIsHealthModalOpen(false);
        setNewEvent({ eventType: 'DOCTOR_VISIT', title: '', date: new Date().toISOString().split('T')[0], status: 'ACTIVE' });
        fetchData();
      }
    } catch (err) { console.error(err); }
  };

  const handleAddDiet = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`http://localhost:3000/api/users/${userId}/diet-logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newDiet)
      });
      if (res.ok) {
        setIsDietModalOpen(false);
        setNewDiet({ mealType: 'BREAKFAST', foodItems: [{ name: '', quantity: '' }], date: new Date().toISOString().split('T')[0] });
        fetchData();
      }
    } catch (err) { console.error(err); }
  };

  if (loading || !user) return <div className="p-8">Loading user dashboard...</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500 relative">
      
      {/* AI Expansion Modal */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 md:p-12 bg-slate-900/40 backdrop-blur-md"
          >
            <motion.div 
              layoutId="ai-card"
              className="bg-white w-full max-w-6xl h-full max-h-[800px] rounded-[3rem] shadow-2xl overflow-hidden flex flex-col md:flex-row border border-slate-200"
            >
              {/* Left Side: Suggestions */}
              <div className="w-full md:w-[45%] bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-800 p-8 md:p-12 text-white relative overflow-hidden flex flex-col">
                <div className="absolute top-0 right-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                
                <div className="relative z-10 flex flex-col h-full">
                  <div className="flex items-center space-x-4 mb-10">
                    <div className="bg-white/20 p-4 rounded-[1.5rem] backdrop-blur-xl border border-white/30">
                      <BrainCircuit className="w-8 h-8 text-white" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black tracking-tight">AI Health Suggestions</h3>
                      <p className="text-indigo-100 text-sm font-medium">Insights based on your history</p>
                    </div>
                  </div>

                  <div className="flex-1 space-y-6 overflow-y-auto pr-4 scrollbar-hide">
                    {healthEvents.length > 0 ? (
                      <>
                        <div className="bg-white/10 rounded-[2rem] p-6 border border-white/20 backdrop-blur-md">
                          <div className="flex items-center space-x-3 mb-4">
                            <div className="p-2 bg-teal-400/20 rounded-xl"><Activity className="w-5 h-5 text-teal-300" /></div>
                            <h4 className="font-bold uppercase tracking-widest text-xs">Medical Observation</h4>
                          </div>
                          <p className="text-sm text-white/90 leading-relaxed">
                            Based on your recent {healthEvents.length} records, we've noticed a positive trend in your recovery. Consider maintaining the current medication schedule.
                          </p>
                        </div>

                        <div className="bg-indigo-400/20 rounded-[2rem] p-6 border border-white/20 backdrop-blur-md">
                          <div className="flex items-center space-x-3 mb-4">
                            <div className="p-2 bg-emerald-400/20 rounded-xl"><Apple className="w-5 h-5 text-emerald-300" /></div>
                            <h4 className="font-bold uppercase tracking-widest text-xs">Dietary Guidance</h4>
                          </div>
                          <p className="text-sm text-white/90 leading-relaxed">
                            Your diet logs show a high intake of processed sugars. Replacing them with complex carbs might improve your energy levels throughout the day.
                          </p>
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-20 opacity-60">
                        <p className="text-indigo-100">Add health records to see suggestions.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Side: Full Chat */}
              <div className="flex-1 flex flex-col bg-white">
                <div className="h-20 border-b border-slate-100 flex items-center justify-between px-8 bg-slate-50/50">
                  <div className="flex items-center space-x-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
                    <span className="font-bold text-slate-800">AI Health Agent</span>
                  </div>

                  {/* Model selector */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {CHAT_MODELS.map(m => (
                      <button
                        key={m.id}
                        onClick={() => setSelectedModel(m.id)}
                        disabled={isChatSubmitting}
                        title={m.note}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all disabled:opacity-40 ${
                          selectedModel === m.id
                            ? m.activeClass
                            : 'bg-white text-slate-400 border-slate-200 hover:text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => setIsExpanded(false)}
                    className="p-2.5 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="flex-1 p-8 overflow-y-auto space-y-6 bg-[#F8FAFC]">
                  {chatHistory.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto">
                      <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mb-6">
                        <BrainCircuit className="w-10 h-10 text-indigo-500" />
                      </div>
                      <h4 className="text-xl font-bold text-slate-800 mb-2">How can I help today?</h4>
                      <p className="text-slate-500 text-sm">Ask about your medications, diet recommendations, or share a medical report to have it parsed automatically.</p>
                    </div>
                  ) : (
                    chatHistory.map((msg, idx) => (
                      <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                        {/* AI metadata pills — only shown after streaming completes */}
                        {msg.role === 'ai' && !msg.isStreaming && (msg.intent?.length || msg.retrievedCount != null) && (
                          <div className="flex flex-wrap gap-1.5 mb-1.5 px-1">
                            {/* Model badge */}
                            {msg.model && (() => {
                              const m = CHAT_MODELS.find(cm => cm.id === (msg.model as string));
                              return m ? (
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${m.activeClass}`}>
                                  {m.label}
                                </span>
                              ) : null;
                            })()}
                            {(msg.intent || [])
                              .filter(i => i !== 'OTHER' && i !== 'QUERY')
                              .map(i => (
                                <span key={i} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600 uppercase tracking-wide">
                                  {i.replace(/_/g, ' ')}
                                </span>
                              ))}
                            {msg.retrievedCount != null && msg.retrievedCount > 0 && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-50 text-teal-600 tracking-wide">
                                {msg.retrievedCount} records retrieved
                              </span>
                            )}
                          </div>
                        )}

                        {/* Live reasoning step pill — shown while streaming */}
                        {msg.role === 'ai' && msg.isStreaming && msg.streamingStep && (
                          <div className="flex items-center gap-1.5 mb-1.5 px-1">
                            <span className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-500 border border-indigo-100">
                              <span className="flex gap-0.5">
                                <span className="w-1 h-1 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                                <span className="w-1 h-1 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                                <span className="w-1 h-1 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                              </span>
                              {msg.streamingStep}
                            </span>
                          </div>
                        )}

                        {/* Attached file bubble (user messages) */}
                        {msg.attachedFile && (
                          <div className="mb-1.5 max-w-[80%]">
                            {msg.attachedFile.preview ? (
                              <img
                                src={msg.attachedFile.preview}
                                alt={msg.attachedFile.name}
                                className="rounded-2xl rounded-tr-none max-h-48 object-cover border border-indigo-200 shadow-sm"
                              />
                            ) : (
                              <div className="flex items-center gap-2 px-4 py-2.5 bg-indigo-500 text-white rounded-2xl rounded-tr-none text-xs font-medium shadow-sm">
                                <FileScan className="w-4 h-4 flex-shrink-0" />
                                <span className="truncate max-w-[180px]">{msg.attachedFile.name}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Message bubble — visible once tokens arrive or for user messages */}
                        {(msg.content || (msg.role === 'ai' && msg.isStreaming)) && (
                          <div className={`max-w-[80%] p-4 rounded-[1.5rem] text-sm shadow-sm transition-all whitespace-pre-wrap ${
                            msg.role === 'user'
                            ? 'bg-indigo-600 text-white rounded-tr-none'
                            : 'bg-white text-slate-800 border border-slate-100 rounded-tl-none'
                          }`}>
                            {msg.content}
                            {msg.isStreaming && (
                              <span className="inline-block w-[2px] h-[1em] bg-indigo-400 ml-0.5 align-middle animate-pulse" />
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                  <div ref={chatEndRef} />
                </div>

                <div className="border-t border-slate-100 bg-white">
                  {/* File preview strip */}
                  {attachedFile && (
                    <div className="px-6 pt-4 pb-0">
                      <div className="flex items-center gap-3 px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-2xl">
                        {filePreviewUrl ? (
                          <img src={filePreviewUrl} alt="preview" className="h-10 w-10 rounded-lg object-cover border border-indigo-200 flex-shrink-0" />
                        ) : (
                          <div className="h-10 w-10 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
                            <FileScan className="w-5 h-5 text-indigo-500" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-indigo-700 truncate">{attachedFile.name}</p>
                          <p className="text-[10px] text-indigo-400 mt-0.5">
                            {attachedFile.type.startsWith('image/') ? 'Image — Claude Vision will extract medical data' : 'PDF — text will be extracted and analysed'}
                          </p>
                        </div>
                        <button onClick={clearAttachedFile} className="p-1.5 hover:bg-indigo-100 rounded-lg transition-colors text-indigo-400 hover:text-indigo-600 flex-shrink-0">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Input row */}
                  <div className="p-6 flex items-center gap-3">
                    {/* Hidden file input */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isChatSubmitting}
                      title="Attach image or PDF"
                      className={`p-3 rounded-2xl transition-all flex-shrink-0 ${
                        attachedFile
                          ? 'bg-indigo-100 text-indigo-600'
                          : 'bg-slate-100 text-slate-400 hover:bg-indigo-50 hover:text-indigo-500'
                      } disabled:opacity-40`}
                    >
                      <Paperclip className="w-5 h-5" />
                    </button>
                    <input
                      type="text"
                      autoFocus
                      value={chatMessage}
                      onChange={(e) => setChatMessage(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                      placeholder={attachedFile ? 'Add a note (optional)...' : 'Ask your AI health agent...'}
                      className="flex-1 px-6 py-4 bg-slate-50 border-none rounded-[1.5rem] text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:bg-white transition-all text-sm"
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={isChatSubmitting || (!chatMessage.trim() && !attachedFile)}
                      className="p-4 bg-indigo-600 text-white rounded-[1.5rem] hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                    >
                      <ChevronRight className="w-6 h-6" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="col-span-1 lg:col-span-2 space-y-6">
          <motion.div 
            layoutId="ai-card"
            className="bg-gradient-to-br from-indigo-500 via-purple-600 to-indigo-700 rounded-[2.5rem] p-10 shadow-2xl text-white relative overflow-hidden group cursor-pointer"
            onClick={() => setIsExpanded(true)}
          >
             <div className="absolute top-0 right-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
             <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-white/10 rounded-full blur-3xl group-hover:bg-white/20 transition-all duration-700"></div>
             
             <div className="relative z-10">
                <div className="flex items-center justify-between mb-10">
                  <div className="flex items-center space-x-5">
                    <div className="bg-white/20 p-4 rounded-[1.5rem] backdrop-blur-xl border border-white/30 shadow-inner">
                       <BrainCircuit className="w-10 h-10 text-white" />
                    </div>
                    <div>
                      <h3 className="text-3xl font-black tracking-tight">AI Health Suggestions</h3>
                      <p className="text-indigo-100 font-medium text-lg">Proactive tips based on your latest records</p>
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                  {healthEvents.length === 0 ? (
                     <div className="bg-white/10 rounded-3xl p-6 border border-white/20 backdrop-blur-md">
                       <p className="text-sm text-indigo-100">Start logging your health events to unlock personalized AI suggestions.</p>
                     </div>
                  ) : (
                    <>
                      <div className="bg-white/10 rounded-3xl p-6 border border-white/20 backdrop-blur-md">
                        <div className="flex items-center space-x-3 mb-2">
                          <Activity className="w-5 h-5 text-teal-300" />
                          <h4 className="font-bold uppercase tracking-wider text-xs">Observation</h4>
                        </div>
                        <p className="text-sm text-white font-medium">Recent medical logs indicate a stable health progression.</p>
                      </div>
                      <div className="bg-indigo-400/20 rounded-3xl p-6 border border-white/20 backdrop-blur-md">
                        <div className="flex items-center space-x-3 mb-2">
                          <Apple className="w-5 h-5 text-emerald-300" />
                          <h4 className="font-bold uppercase tracking-wider text-xs">Dietary Tip</h4>
                        </div>
                        <p className="text-sm text-white font-medium">Increasing water intake by 20% might help with recent fatigue.</p>
                      </div>
                    </>
                  )}
                </div>

                <div className="flex items-center justify-end">
                   <button 
                    className="flex items-center space-x-3 px-6 py-3.5 bg-white text-indigo-600 rounded-[1.2rem] font-bold text-sm shadow-xl hover:scale-105 transition-all group/btn"
                   >
                     <span>Talk to AI Agent</span>
                     <div className="bg-indigo-50 p-1 rounded-lg group-hover/btn:bg-indigo-100 transition-colors">
                        <MessageSquare className="w-4 h-4" />
                     </div>
                   </button>
                </div>
             </div>
          </motion.div>

          {/* ===== MEAL PLAN FULL MODAL ===== */}
          <AnimatePresence>
            {isMealPlanOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-md flex items-center justify-center p-4"
              >
                <motion.div
                  initial={{ scale: 0.95, y: 20 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.95, y: 20 }}
                  className="bg-slate-50 w-full max-w-7xl max-h-[93vh] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col"
                >
                  {/* Modal Header */}
                  <div className="bg-white px-8 py-5 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-4">
                      <div className="bg-emerald-100 p-2.5 rounded-xl text-emerald-600">
                        <UtensilsCrossed className="w-6 h-6" />
                      </div>
                      <div>
                        <h2 className="text-xl font-black text-slate-800">Recommended Meal Plan</h2>
                        <p className="text-xs text-slate-400">AI-generated based on your health profile</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleGenerateMealPlan}
                        disabled={mealPlanLoading}
                        className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm rounded-xl transition-all disabled:opacity-50 shadow-md"
                      >
                        <RefreshCw className={`w-4 h-4 ${mealPlanLoading ? 'animate-spin' : ''}`} />
                        {mealPlanLoading ? 'Generating...' : 'Regenerate'}
                      </button>
                      <button onClick={() => setIsMealPlanOpen(false)} className="p-2.5 hover:bg-slate-100 rounded-xl transition-colors text-slate-500">
                        <X className="w-6 h-6" />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-1 overflow-hidden">
                    {/* Left: Meals + Settings */}
                    <div className="flex-1 overflow-y-auto p-8 space-y-6">

                      {/* Settings Pills */}
                      <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm space-y-5">
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Plan Settings</p>

                        {/* Duration */}
                        <div>
                          <label className="text-xs font-bold text-slate-500 mb-2 block">Duration</label>
                          <div className="flex flex-wrap gap-2 items-center">
                            {[3, 7].map(d => (
                              <button key={d}
                                onClick={() => setMealPreferences(p => ({ ...p, durationDays: d, customDays: '' }))}
                                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all border ${mealPreferences.durationDays === d && !mealPreferences.customDays ? 'bg-emerald-500 text-white border-emerald-500 shadow' : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300'}`}>
                                {d} Days
                              </button>
                            ))}
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                min={1}
                                max={30}
                                placeholder="Custom"
                                value={mealPreferences.customDays}
                                onChange={e => setMealPreferences(p => ({ ...p, customDays: e.target.value, durationDays: 0 }))}
                                className={`w-24 px-3 py-1.5 rounded-full text-xs font-bold border transition-all outline-none ${mealPreferences.customDays ? 'border-emerald-400 text-emerald-700' : 'border-slate-200 text-slate-500'}`}
                              />
                              <span className="text-xs text-slate-400">days (max 30)</span>
                            </div>
                          </div>
                        </div>

                        {/* Cuisine */}
                        <div>
                          <label className="text-xs font-bold text-slate-500 mb-2 block">Cuisine / Region</label>
                          <div className="flex flex-wrap gap-2 items-center">
                            {['SOUTH_INDIAN', 'NORTH_INDIAN', 'MEDITERRANEAN', 'CONTINENTAL'].map(c => (
                              <button key={c}
                                onClick={() => setMealPreferences(p => ({ ...p, cuisine: c, customCuisine: '' }))}
                                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all border ${mealPreferences.cuisine === c && !mealPreferences.customCuisine ? 'bg-emerald-500 text-white border-emerald-500 shadow' : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300'}`}>
                                {c.replace(/_/g, ' ')}
                              </button>
                            ))}
                            <input
                              type="text"
                              placeholder="Enter cuisine or city..."
                              value={mealPreferences.customCuisine}
                              onChange={e => setMealPreferences(p => ({ ...p, customCuisine: e.target.value, cuisine: e.target.value ? '' : p.cuisine }))}
                              className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all outline-none min-w-[180px] ${mealPreferences.customCuisine ? 'border-emerald-400 text-emerald-700' : 'border-slate-200 text-slate-500'}`}
                            />
                          </div>
                        </div>

                        {/* Goal */}
                        <div>
                          <label className="text-xs font-bold text-slate-500 mb-2 block">Health Goal</label>
                          <div className="flex flex-wrap gap-2 items-center">
                            {['HEALTHY_LIVING', 'WEIGHT_LOSS', 'MUSCLE_GAIN', 'GUT_HEALTH'].map(g => (
                              <button key={g}
                                onClick={() => setMealPreferences(p => ({ ...p, goal: g, customGoal: '' }))}
                                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all border ${mealPreferences.goal === g && !mealPreferences.customGoal ? 'bg-indigo-500 text-white border-indigo-500 shadow' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}>
                                {g.replace(/_/g, ' ')}
                              </button>
                            ))}
                            <input
                              type="text"
                              placeholder="Custom goal..."
                              value={mealPreferences.customGoal}
                              onChange={e => setMealPreferences(p => ({ ...p, customGoal: e.target.value, goal: e.target.value ? '' : p.goal }))}
                              className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all outline-none min-w-[160px] ${mealPreferences.customGoal ? 'border-indigo-400 text-indigo-700' : 'border-slate-200 text-slate-500'}`}
                            />
                          </div>
                        </div>

                        {/* Language Multi-select */}
                        <div>
                          <label className="text-xs font-bold text-slate-500 mb-2 block">Ingredient Languages <span className="text-emerald-500">(English always included)</span></label>
                          <div className="flex flex-wrap gap-2">
                            {['ENGLISH', 'TELUGU', 'TAMIL', 'HINDI', 'KANNADA'].map(lang => {
                              const selected = mealPreferences.languages.includes(lang);
                              return (
                                <button key={lang}
                                  onClick={() => {
                                    if (lang === 'ENGLISH') return; // always included
                                    setMealPreferences(p => ({
                                      ...p,
                                      languages: selected
                                        ? p.languages.filter(l => l !== lang)
                                        : [...p.languages, lang]
                                    }));
                                  }}
                                  className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all border ${selected ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'} ${lang === 'ENGLISH' ? 'opacity-70 cursor-default' : ''}`}>
                                  {lang} {selected && lang !== 'ENGLISH' && '✓'}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Warnings */}
                      {mealPlan?.warnings && mealPlan.warnings.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3">
                          <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-xs font-black text-amber-700 uppercase tracking-wider mb-1">Health Warnings</p>
                            {mealPlan.warnings.map((w, i) => <p key={i} className="text-xs text-amber-600">{w}</p>)}
                          </div>
                        </div>
                      )}

                      {/* No plan / loading state */}
                      {!mealPlan && !mealPlanLoading && (
                        <div className="bg-white rounded-2xl p-12 text-center border border-dashed border-emerald-200">
                          <UtensilsCrossed className="w-12 h-12 text-emerald-200 mx-auto mb-4" />
                          <p className="text-slate-400 font-medium mb-4">No meal plan yet. Configure your preferences above and generate.</p>
                          <button onClick={handleGenerateMealPlan}
                            className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold rounded-2xl shadow-lg hover:opacity-90 transition-all">
                            Generate Meal Plan
                          </button>
                        </div>
                      )}

                      {mealPlanLoading && (
                        <div className="bg-white rounded-2xl p-12 text-center">
                          <div className="w-12 h-12 border-4 border-emerald-200 border-t-emerald-500 rounded-full animate-spin mx-auto mb-4"></div>
                          <p className="text-slate-400 font-medium">AI is personalising your meal plan...</p>
                        </div>
                      )}

                      {mealPlan && !mealPlanLoading && (
                        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                          {/* Day Tabs */}
                          <div className="flex gap-1 p-3 border-b border-slate-100 overflow-x-auto">
                            {mealPlan.days.map((day, idx) => (
                              <button key={idx} onClick={() => setActivePlanDay(idx)}
                                className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition-all ${activePlanDay === idx ? 'bg-emerald-500 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                {day.date}
                              </button>
                            ))}
                          </div>

                          {/* Meal Cards */}
                          <div className="p-5 space-y-3">
                            {(mealPlan.days[activePlanDay]?.meals || []).map((meal, mi) => (
                              <motion.div
                                key={mi}
                                whileHover={{ scale: 1.005 }}
                                onClick={() => setSelectedMeal(meal)}
                                className="cursor-pointer border border-slate-100 rounded-2xl p-4 hover:border-emerald-200 hover:bg-emerald-50/30 transition-all group"
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">{meal.mealType}</span>
                                    <h4 className="font-bold text-slate-800 mt-1.5 group-hover:text-emerald-700 transition-colors">{meal.title}</h4>
                                    <p className="text-xs text-slate-400 mt-1 line-clamp-1">{meal.reasoning}</p>
                                  </div>
                                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all mt-1 flex-shrink-0" />
                                </div>
                              </motion.div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Right: Collapsible Ingredients */}
                    {mealPlan && !mealPlanLoading && (
                      <div className={`border-l border-slate-200 bg-white flex flex-col transition-all duration-300 ${ingredientsOpen ? 'w-72' : 'w-14'}`}>
                        <button
                          onClick={() => setIngredientsOpen(v => !v)}
                          className="flex items-center gap-2 p-4 border-b border-slate-100 hover:bg-slate-50 transition-colors"
                        >
                          <Leaf className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                          {ingredientsOpen && <span className="text-xs font-black uppercase tracking-wider text-slate-500 flex-1">Ingredients</span>}
                          <ChevronRight className={`w-4 h-4 text-slate-300 transition-transform flex-shrink-0 ${ingredientsOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {ingredientsOpen && (
                          <div className="flex-1 overflow-y-auto p-4 space-y-2">
                            {Array.from(
                              new Map(
                                (mealPlan.days[activePlanDay]?.meals || [])
                                  .flatMap(m => m.ingredients)
                                  .map(ing => [ing.name, ing])
                              ).values()
                            ).map((ing, i) => (
                              <div key={i} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                                <p className="font-semibold text-slate-800 text-xs">{ing.name}</p>
                                {ing.teluguName && <p className="text-[10px] text-slate-400 mt-0.5">తె: {ing.teluguName}</p>}
                                {ing.tamilName && <p className="text-[10px] text-slate-400">த: {ing.tamilName}</p>}
                                <p className="text-[10px] font-bold text-teal-600 mt-1">{ing.quantity}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Recipe Detail Modal */}
          <AnimatePresence>
            {selectedMeal && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-900/50 backdrop-blur-md">
                <motion.div initial={{ scale: 0.92, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 20 }}
                  className="bg-white w-full max-w-2xl max-h-[85vh] rounded-[2.5rem] shadow-2xl overflow-y-auto">
                  <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-8 text-white relative">
                    <button onClick={() => setSelectedMeal(null)} className="absolute top-5 right-5 p-2 hover:bg-white/20 rounded-full transition-colors">
                      <X className="w-5 h-5" />
                    </button>
                    <span className="text-xs font-black uppercase tracking-widest bg-white/20 px-3 py-1 rounded-full mb-3 inline-block">{selectedMeal.mealType}</span>
                    <h2 className="text-3xl font-black">{selectedMeal.title}</h2>
                  </div>
                  <div className="p-8 space-y-6">
                    <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
                      <h4 className="font-bold text-blue-800 text-sm mb-2 flex items-center gap-2"><BrainCircuit className="w-4 h-4" />Why this meal?</h4>
                      <p className="text-sm text-blue-700">{selectedMeal.reasoning}</p>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5">
                      <h4 className="font-bold text-emerald-800 text-sm mb-2 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />Health Benefits</h4>
                      <p className="text-sm text-emerald-700">{selectedMeal.benefits}</p>
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2"><Leaf className="w-4 h-4 text-emerald-500" />Ingredients</h4>
                      <div className="space-y-2">
                        {selectedMeal.ingredients.map((ing, i) => (
                          <div key={i} className="flex items-start justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                            <div>
                              <span className="font-semibold text-slate-800 text-sm">{ing.name}</span>
                              {ing.teluguName && <p className="text-slate-400 text-xs mt-0.5">తె: {ing.teluguName}</p>}
                              {ing.tamilName && <p className="text-slate-400 text-xs">த: {ing.tamilName}</p>}
                            </div>
                            <span className="text-xs font-bold text-teal-600 bg-teal-50 px-2 py-1 rounded-lg flex-shrink-0">{ing.quantity}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ===== COMPACT MEAL PLAN CARD (dashboard) ===== */}
          <div
            onClick={() => navigate(`/users/${userId}/meal-plan`)}
            className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden cursor-pointer hover:border-emerald-300 hover:shadow-md transition-all group"
          >
            <div className="p-6 pb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-emerald-100 p-2.5 rounded-xl text-emerald-600 group-hover:bg-emerald-200 transition-colors">
                  <UtensilsCrossed className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800 group-hover:text-emerald-700 transition-colors">Recommended Meal Plan</h3>
                  <p className="text-[10px] text-slate-400">Click to open full dashboard</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-emerald-400 group-hover:translate-x-1 transition-all" />
            </div>

            {mealPlanLoading ? (
              <div className="px-6 pb-6"><div className="h-16 bg-slate-100 rounded-2xl animate-pulse"></div></div>
            ) : mealPlan ? (
              <div className="px-6 pb-6 space-y-2">
                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">
                  Today — {mealPlan.days[0]?.date}
                </p>
                {(mealPlan.days[0]?.meals || []).slice(0, 3).map((meal, i) => (
                  <div key={i} className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[9px] font-black uppercase bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full flex-shrink-0">{meal.mealType}</span>
                    <span className="text-xs font-semibold text-slate-700 line-clamp-1">{meal.title}</span>
                  </div>
                ))}
                {(mealPlan.days[0]?.meals || []).length > 3 && (
                  <p className="text-[10px] text-slate-400 text-center pt-1">+{(mealPlan.days[0].meals.length - 3)} more meals</p>
                )}
              </div>
            ) : (
              <div className="px-6 pb-6">
                <div className="bg-emerald-50 rounded-2xl p-6 border border-dashed border-emerald-200 text-center">
                  <p className="text-sm text-slate-400">No meal plan generated yet.</p>
                  <p className="text-xs text-emerald-600 font-medium mt-1">Click to generate →</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="col-span-1 space-y-6">
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
            <div
              className="flex items-center justify-between mb-4 cursor-pointer group/header"
              onClick={() => navigate(`/users/${userId}/health-notes`)}
            >
              <h3 className="text-lg font-bold text-slate-800 group-hover/header:text-teal-600 transition-colors">Health Records</h3>
              <Plus className="w-4 h-4 text-teal-600" />
            </div>

            <div className="flex bg-slate-100 p-1 rounded-xl mb-4">
              <button
                onClick={() => setHealthTab('USER')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${healthTab === 'USER' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                My Logs
              </button>
              <button
                onClick={() => setHealthTab('DOCTOR')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${healthTab === 'DOCTOR' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Doctor Reports
              </button>
            </div>

            <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1 scrollbar-hide">
              {healthTab === 'USER' ? (
                (() => {
                  const userEvents = healthEvents.filter(e => !e.source || e.source === 'USER');
                  return userEvents.length === 0 ? (
                    <p className="text-sm text-slate-400 italic py-4 text-center">No logs found.</p>
                  ) : userEvents.map(event => (
                    <div key={event._id} className="p-3 border border-slate-100 rounded-xl hover:bg-slate-50 transition-colors">
                      <p className="text-xs text-slate-400 font-medium mb-0.5">{new Date(event.date).toLocaleDateString()}</p>
                      <p className="text-sm font-semibold text-slate-800 line-clamp-1">{(event.titles || []).join(', ')}</p>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded mt-1 inline-block ${event.status === 'ACTIVE' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                        {event.status}
                      </span>
                    </div>
                  ));
                })()
              ) : (
                // Doctor tab — group by reportGroupId
                (() => {
                  const doctorEvents = healthEvents
                    .filter(e => e.source === 'DOCTOR' || e.source === 'AI')
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                  if (doctorEvents.length === 0)
                    return <p className="text-sm text-slate-400 italic py-4 text-center">No doctor reports found.</p>;

                  // Build groups: reportGroupId → events; standalone events keyed by _id
                  const groupMap = new Map<string, HealthEvent[]>();
                  for (const ev of doctorEvents) {
                    const key = ev.reportGroupId || ev._id;
                    if (!groupMap.has(key)) groupMap.set(key, []);
                    groupMap.get(key)!.push(ev);
                  }

                  return Array.from(groupMap.entries()).map(([key, events]) => {
                    const isGroup = !!events[0].reportGroupId;
                    const visitEvent = events.find(e => e.eventType === 'DOCTOR_VISIT');
                    const rxEvent   = events.find(e => e.eventType === 'PRESCRIPTION');
                    const testEvent = events.find(e => e.eventType === 'TEST_RESULTS');
                    const doctorInfo = visitEvent?.details?.doctorInfo ?? rxEvent?.details?.doctorInfo;

                    if (!isGroup) {
                      const ev = events[0];
                      return (
                        <div key={key} className="p-3 border border-slate-100 rounded-xl hover:bg-slate-50 transition-colors">
                          <p className="text-xs text-slate-400 font-medium mb-0.5">{new Date(ev.date).toLocaleDateString()}</p>
                          <p className="text-sm font-semibold text-slate-800 line-clamp-1">{(ev.titles || []).join(', ')}</p>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded mt-1 inline-block ${ev.status === 'ACTIVE' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                            {ev.eventType || ev.status}
                          </span>
                        </div>
                      );
                    }

                    return (
                      <div key={key} className="border border-indigo-100 rounded-2xl overflow-hidden bg-indigo-50/30">
                        {/* Visit group header */}
                        <div className="px-3 py-2 bg-indigo-50 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Link2 className="w-3 h-3 text-indigo-400 flex-shrink-0" />
                            <span className="text-[9px] font-black text-indigo-500 uppercase tracking-wider">Visit Group</span>
                            <span className="text-[9px] text-indigo-400">·</span>
                            <span className="text-[9px] text-indigo-400">{new Date(events[0].date).toLocaleDateString()}</span>
                          </div>
                          {doctorInfo?.name && (
                            <span className="text-[9px] font-semibold text-indigo-600 truncate max-w-[90px] flex-shrink-0">
                              {doctorInfo.name}
                            </span>
                          )}
                        </div>

                        {/* Doctor address row */}
                        {(doctorInfo?.hospital || doctorInfo?.address) && (
                          <div className="px-3 py-1.5 flex items-center gap-1.5 border-b border-indigo-100/60 bg-white/60">
                            <Building2 className="w-3 h-3 text-slate-400 flex-shrink-0" />
                            <span className="text-[10px] text-slate-500 line-clamp-1">
                              {[doctorInfo.hospital, doctorInfo.address].filter(Boolean).join(' — ')}
                            </span>
                          </div>
                        )}

                        {/* DOCTOR_VISIT row */}
                        {visitEvent && (
                          <div className="px-3 py-2 border-t border-indigo-100/60 flex items-start gap-2">
                            <Stethoscope className="w-3.5 h-3.5 text-rose-500 mt-0.5 flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                              <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Findings</span>
                              <p className="text-xs font-semibold text-slate-700 line-clamp-2">
                                {visitEvent.details?.conditions?.join(', ') || visitEvent.titles?.[0]}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* PRESCRIPTION row */}
                        {rxEvent && (
                          <div className="px-3 py-2 border-t border-indigo-100/60 flex items-start gap-2">
                            <Pill className="w-3.5 h-3.5 text-indigo-500 mt-0.5 flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                              <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Prescription</span>
                              <p className="text-xs font-semibold text-slate-700 line-clamp-1">
                                {rxEvent.details?.medications?.map(m => `${m.name} ${m.dosage}`).join(', ') || rxEvent.titles?.[0]}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* TEST_RESULTS row */}
                        {testEvent && (
                          <div className="px-3 py-2 border-t border-indigo-100/60 flex items-start gap-2">
                            <FlaskConical className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                              <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Tests</span>
                              <p className="text-xs font-semibold text-slate-700 line-clamp-1">
                                {testEvent.details?.testResults?.map(t => t.testName).join(', ') || testEvent.titles?.[0]}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  });
                })()
              )}
            </div>
          </div>

          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
            <div 
              className="flex items-center justify-between mb-4 cursor-pointer group/header"
              onClick={() => navigate(`/users/${userId}/diet-notes`)}
            >
              <h3 className="text-lg font-bold text-slate-800 group-hover/header:text-teal-600 transition-colors">Daily Diet</h3>
              <Plus className="w-4 h-4 text-teal-600" />
            </div>

            <div className="flex bg-slate-100 p-1 rounded-xl mb-4">
              <button 
                onClick={() => setDietTab('USER')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${dietTab === 'USER' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                My Logs
              </button>
              <button 
                onClick={() => setDietTab('DOCTOR')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${dietTab === 'DOCTOR' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Advice
              </button>
            </div>

            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 scrollbar-hide">
              {dietLogs.filter(d => (d.source || 'USER') === dietTab).length === 0 ? (
                <p className="text-sm text-slate-400 italic py-4 text-center">No {dietTab === 'USER' ? 'logs' : 'advice'} found.</p>
              ) : (
                dietLogs.filter(d => (d.source || 'USER') === dietTab).map(log => (
                  <div key={log._id} className="p-3 border border-slate-100 rounded-xl hover:bg-slate-50 transition-colors">
                    <p className="text-xs text-slate-400 font-medium mb-0.5 flex justify-between">
                      <span>{new Date(log.date).toLocaleDateString()}</span>
                      {log.source === 'DOCTOR' && <span className="font-black text-indigo-500 uppercase text-[9px]">Professional</span>}
                    </p>
                    <p className="text-sm font-semibold text-slate-800 line-clamp-2">
                      {log.description}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
            <div 
              className="flex items-center justify-between mb-4 cursor-pointer group/header"
              onClick={() => navigate(`/users/${userId}/lifestyle-notes`)}
            >
              <h3 className="text-lg font-bold text-slate-800 group-hover/header:text-teal-600 transition-colors">Lifestyle Notes</h3>
              <Plus className="w-4 h-4 text-teal-600" />
            </div>

            <div className="flex bg-slate-100 p-1 rounded-xl mb-4">
              <button 
                onClick={() => setLifestyleTab('USER')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${lifestyleTab === 'USER' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                My Logs
              </button>
              <button 
                onClick={() => setLifestyleTab('DOCTOR')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${lifestyleTab === 'DOCTOR' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Advice
              </button>
            </div>

            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 scrollbar-hide">
              {lifestyleRecords.filter(r => (r.source || 'USER') === lifestyleTab).length === 0 ? (
                <p className="text-sm text-slate-400 italic py-4 text-center">No {lifestyleTab === 'USER' ? 'notes' : 'advice'} found.</p>
              ) : (
                lifestyleRecords.filter(r => (r.source || 'USER') === lifestyleTab).map(rec => (
                  <div key={rec._id} className="p-3 border border-slate-100 rounded-xl hover:bg-slate-50 transition-colors">
                    <p className="text-xs text-slate-400 font-medium mb-0.5 flex justify-between">
                      <span>{new Date(rec.date).toLocaleDateString()}</span>
                      {rec.source === 'DOCTOR' && <span className="font-black text-indigo-500 uppercase text-[9px]">Professional</span>}
                    </p>
                    <p className="text-sm font-semibold text-slate-800 line-clamp-2">
                      {rec.description}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Health Event Modal */}
      {isHealthModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold text-slate-800">Add Health Record</h3>
              <button onClick={() => setIsHealthModalOpen(false)}><X className="w-6 h-6 text-slate-400" /></button>
            </div>
            <form onSubmit={handleAddEvent} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Title</label>
                <input required className="w-full px-4 py-2 rounded-xl border border-slate-200" value={newEvent.title} onChange={e => setNewEvent({...newEvent, title: e.target.value})} placeholder="e.g. Annual Checkup" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Type</label>
                  <select className="w-full px-4 py-2 rounded-xl border border-slate-200" value={newEvent.eventType} onChange={e => setNewEvent({...newEvent, eventType: e.target.value})}>
                    <option value="DOCTOR_VISIT">Doctor Visit</option>
                    <option value="DISEASE_DIAGNOSIS">Diagnosis</option>
                    <option value="TREATMENT_START">Treatment</option>
                    <option value="MEDICATION">Medication Change</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Status</label>
                  <select className="w-full px-4 py-2 rounded-xl border border-slate-200" value={newEvent.status} onChange={e => setNewEvent({...newEvent, status: e.target.value})}>
                    <option value="ACTIVE">Active</option>
                    <option value="RESOLVED">Resolved</option>
                    <option value="ONGOING">Ongoing</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Date</label>
                <input type="date" required className="w-full px-4 py-2 rounded-xl border border-slate-200" value={newEvent.date} onChange={e => setNewEvent({...newEvent, date: e.target.value})} />
              </div>
              <button type="submit" className="w-full bg-teal-500 text-white font-bold py-3 rounded-xl shadow-lg mt-4">Save Record</button>
            </form>
          </div>
        </div>
      )}

      {/* Diet Log Modal */}
      {isDietModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold text-slate-800">Log Meal</h3>
              <button onClick={() => setIsDietModalOpen(false)}><X className="w-6 h-6 text-slate-400" /></button>
            </div>
            <form onSubmit={handleAddDiet} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Meal</label>
                  <select className="w-full px-4 py-2 rounded-xl border border-slate-200" value={newDiet.mealType} onChange={e => setNewDiet({...newDiet, mealType: e.target.value})}>
                    <option value="BREAKFAST">Breakfast</option>
                    <option value="LUNCH">Lunch</option>
                    <option value="DINNER">Dinner</option>
                    <option value="SNACK">Snack</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Date</label>
                  <input type="date" required className="w-full px-4 py-2 rounded-xl border border-slate-200" value={newDiet.date} onChange={e => setNewDiet({...newDiet, date: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Food Item & Quantity</label>
                <div className="flex gap-2">
                  <input required className="flex-1 px-4 py-2 rounded-xl border border-slate-200" value={newDiet.foodItems[0].name} onChange={e => setNewDiet({...newDiet, foodItems: [{...newDiet.foodItems[0], name: e.target.value}]})} placeholder="Item (e.g. Apple)" />
                  <input required className="w-24 px-4 py-2 rounded-xl border border-slate-200" value={newDiet.foodItems[0].quantity} onChange={e => setNewDiet({...newDiet, foodItems: [{...newDiet.foodItems[0], quantity: e.target.value}]})} placeholder="Qty" />
                </div>
              </div>
              <button type="submit" className="w-full bg-emerald-500 text-white font-bold py-3 rounded-xl shadow-lg mt-4">Log Meal</button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

// -----------------------------------------------------------------------------
// Family Graph Visualization
// -----------------------------------------------------------------------------
function FamilyGraph() {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [linkData, setLinkData] = useState({ sourceId: '', targetId: '', relationship: 'FATHER_OF' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchGraph = () => {
    fetch('http://localhost:3000/api/users/graph')
      .then(r => r.json())
      .then(data => {
        // Defensive: Filter out links that point to non-existent nodes
        const nodeIds = new Set(data.nodes.map((n: any) => n.id));
        const validLinks = data.links.filter((l: any) => {
          const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
          const targetId = typeof l.target === 'object' ? l.target.id : l.target;
          return nodeIds.has(sourceId) && nodeIds.has(targetId);
        });
        setGraphData({ nodes: data.nodes, links: validLinks });
        setLoading(false);
      })
      .catch(e => {
        console.error(e);
        setLoading(false);
      });
  };

  const fetchUsers = () => {
    fetch('http://localhost:3000/api/users')
      .then(r => r.json())
      .then(data => setUsers(data))
      .catch(e => console.error(e));
  };

  useEffect(() => {
    fetchGraph();
    fetchUsers();
  }, []);

  const handleLinkMembers = async (e: React.FormEvent) => {
    e.preventDefault();
    if (linkData.sourceId === linkData.targetId) {
      alert("Cannot link a user to themselves.");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch('http://localhost:3000/api/users/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(linkData),
      });
      if (response.ok) {
        setIsLinkModalOpen(false);
        setLinkData({ sourceId: '', targetId: '', relationship: 'FATHER_OF' });
        fetchGraph();
      }
    } catch (error) {
      console.error('Failed to link members:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const relationships = [
    { value: 'FATHER_OF', label: 'Father (Thandri)' },
    { value: 'MOTHER_OF', label: 'Mother (Amma)' },
    { value: 'SPOUSE_OF', label: 'Spouse (Bhartha/Bharya)' },
    { value: 'CHILD_OF', label: 'Child (Bidda)' },
    { value: 'BROTHER_OF', label: 'Brother (Annayya/Thammudu)' },
    { value: 'SISTER_OF', label: 'Sister (Akka/Chellelu)' },
  ];

  if (loading) return <div className="p-8">Loading family graph...</div>;

  return (
    <div className="h-[calc(100vh-12rem)] bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden relative">
      <div className="absolute top-6 left-6 z-10 pointer-events-none">
        <h3 className="text-xl font-bold text-slate-800">Family Relationships</h3>
        <p className="text-sm text-slate-500">Interactive visualization of your family network</p>
      </div>
      
      <div className="absolute top-6 right-6 z-10">
        <button 
          onClick={() => setIsLinkModalOpen(true)}
          className="bg-slate-900 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg hover:bg-slate-800 transition-all flex items-center gap-2"
        >
          <Share2 className="w-4 h-4" /> Link Members
        </button>
      </div>

      <ForceGraph2D
        graphData={graphData}
        nodeLabel="label"
        nodeAutoColorBy="type"
        linkDirectionalArrowLength={6}
        linkDirectionalArrowRelPos={1}
        linkCurvature={0.2}
        backgroundColor="#ffffff"
        nodeCanvasObject={(node: any, ctx, globalScale) => {
          const label = node.label;
          const fontSize = 14/globalScale;
          ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
          const textWidth = ctx.measureText(label).width;
          const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.5); 

          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.beginPath();
          const x = node.x - bckgDimensions[0] / 2;
          const y = node.y - bckgDimensions[1] / 2;
          const w = bckgDimensions[0];
          const h = bckgDimensions[1];
          const r = 4;
          ctx.moveTo(x+r, y);
          ctx.arcTo(x+w, y, x+w, y+h, r);
          ctx.arcTo(x+w, y+h, x, y+h, r);
          ctx.arcTo(x, y+h, x, y, r);
          ctx.arcTo(x, y, x+w, y, r);
          ctx.closePath();
          ctx.fill();
          
          ctx.strokeStyle = node.color;
          ctx.lineWidth = 1.5/globalScale;
          ctx.stroke();

          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#1e293b';
          ctx.fillText(label, node.x, node.y);

          node.__bckgDimensions = bckgDimensions; 
        }}
        linkLabel={(link: any) => {
          const rel = relationships.find(r => r.value === link.type);
          return rel ? rel.label : link.type;
        }}
      />

      {/* Link Modal */}
      {isLinkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold text-slate-800">Link Family Members</h3>
              <button 
                onClick={() => setIsLinkModalOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="w-6 h-6 text-slate-400" />
              </button>
            </div>
            
            <form onSubmit={handleLinkMembers} className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Source Member</label>
                <select 
                  required
                  value={linkData.sourceId}
                  onChange={e => setLinkData({...linkData, sourceId: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all bg-white"
                >
                  <option value="">Select Member</option>
                  {users.map(u => (
                    <option key={u._id} value={u._id}>{u.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-center py-2">
                <div className="h-px bg-slate-100 flex-1"></div>
                <div className="px-3 text-xs font-bold text-slate-400 uppercase tracking-widest">is the</div>
                <div className="h-px bg-slate-100 flex-1"></div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Relationship</label>
                <select 
                  required
                  value={linkData.relationship}
                  onChange={e => setLinkData({...linkData, relationship: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all bg-white"
                >
                  {relationships.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-center py-2">
                <div className="h-px bg-slate-100 flex-1"></div>
                <div className="px-3 text-xs font-bold text-slate-400 uppercase tracking-widest">of</div>
                <div className="h-px bg-slate-100 flex-1"></div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Target Member</label>
                <select 
                  required
                  value={linkData.targetId}
                  onChange={e => setLinkData({...linkData, targetId: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all bg-white"
                >
                  <option value="">Select Member</option>
                  {users.map(u => (
                    <option key={u._id} value={u._id}>{u.name}</option>
                  ))}
                </select>
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setIsLinkModalOpen(false)}
                  className="flex-1 px-6 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-6 py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Linking...' : 'Link Members'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

interface RecordItem {
  _id: string;
  titles?: string[];
  eventType?: string;
  mealTypes?: string[];
  categories?: string[];
  description: string;
  date: string;
  endDate?: string;
  status?: string;
}

function RecordsBoard({ title, endpoint, typeLabel, icon: Icon }: { title: string, endpoint: string, typeLabel: string, icon: any }) {
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'board' | 'timeline'>('board');
  const [draftNote, setDraftNote] = useState<Partial<RecordItem> | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');
  
  const location = useLocation();
  const navigate = useNavigate();
  const userId = location.pathname.split('/')[2];

  const fetchRecords = () => {
    fetch(`http://localhost:3000/api/users/${userId}/${endpoint}`)
      .then(r => r.json())
      .then(data => {
        const sorted = Array.isArray(data) 
          ? data.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
          : [];
        setRecords(sorted);
        setLoading(false);
      })
      .catch(err => {
        console.warn(`[RecordsBoard] Failed to fetch ${endpoint}:`, err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchRecords();
  }, [userId, endpoint]);

  const handleSave = async () => {
    if (!draftNote) return;
    
    const tags = endpoint === 'health-events' ? draftNote.titles : endpoint === 'diet-logs' ? draftNote.mealTypes : draftNote.categories;
    const hasTags = (tags || []).length > 0;
    
    if (!draftNote.description || !hasTags) {
       alert(`Both Description and ${endpoint === 'health-events' ? 'Title' : endpoint === 'diet-logs' ? 'Meal Type' : 'Category'} are mandatory.`);
       return;
    }
    
    const url = editingId 
      ? `http://localhost:3000/api/users/${userId}/${endpoint}/${editingId}`
      : `http://localhost:3000/api/users/${userId}/${endpoint}`;
    
    const res = await fetch(url, {
      method: editingId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draftNote)
    });

    if (res.ok) {
      setDraftNote(null);
      setEditingId(null);
      fetchRecords();
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this record?')) return;
    const res = await fetch(`http://localhost:3000/api/users/${userId}/${endpoint}/${id}`, { method: 'DELETE' });
    if (res.ok) fetchRecords();
  };

  const addTag = (val: string) => {
    if (!val.trim() || !draftNote) return;
    if (endpoint === 'health-events') {
      const current = draftNote.titles || [];
      if (!current.includes(val)) setDraftNote({...draftNote, titles: [...current, val]});
    } else if (endpoint === 'diet-logs') {
      const current = draftNote.mealTypes || [];
      if (!current.includes(val)) setDraftNote({...draftNote, mealTypes: [...current, val]});
    } else if (endpoint === 'lifestyle') {
      const current = draftNote.categories || [];
      if (!current.includes(val)) setDraftNote({...draftNote, categories: [...current, val]});
    }
    setTagInput('');
  };

  const removeTag = (val: string) => {
    if (!draftNote) return;
    if (endpoint === 'health-events') {
      setDraftNote({...draftNote, titles: (draftNote.titles || []).filter(t => t !== val)});
    } else if (endpoint === 'diet-logs') {
      setDraftNote({...draftNote, mealTypes: (draftNote.mealTypes || []).filter(t => t !== val)});
    } else if (endpoint === 'lifestyle') {
      setDraftNote({...draftNote, categories: (draftNote.categories || []).filter(t => t !== val)});
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-400">Loading {title}...</div>;

  const healthSuggestions = ['PRESCRIPTION', 'CONSULTATION', 'TEST REPORT', 'VACCINATION', 'SURGERY'];
  const dietSuggestions = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK', 'CRAVINGS', 'PILLS'];
  const lifestyleSuggestions = ['GENERAL', 'SLEEP', 'EXERCISE', 'STRESS', 'MEDITATION'];

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="flex justify-between items-end">
        <div>
          <button onClick={() => navigate(`/users/${userId}`)} className="text-slate-500 hover:text-slate-800 flex items-center gap-1 mb-2 transition-colors">
            <ChevronRight className="w-4 h-4 rotate-180" /> Back to Dashboard
          </button>
          <h2 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <Icon className="w-8 h-8 text-indigo-500" /> {title}
          </h2>
          <p className="text-slate-500">Manage and track {title.toLowerCase()} in chronological order</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="bg-slate-100 p-1 rounded-xl flex">
            <button onClick={() => setViewMode('board')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'board' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>Board</button>
            <button onClick={() => setViewMode('timeline')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'timeline' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>Timeline</button>
          </div>
          <button 
            onClick={() => {
              setEditingId(null);
              const now = new Date();
              const dateStr = endpoint === 'diet-logs' ? now.toISOString() : now.toISOString().split('T')[0];
              setDraftNote({ 
                titles: [], 
                mealTypes: [],
                categories: endpoint === 'lifestyle' ? ['GENERAL'] : [],
                eventType: 'DISEASE_DIAGNOSIS', 
                description: '', 
                date: dateStr,
                endDate: endpoint === 'lifestyle' ? dateStr : undefined,
                status: 'ACTIVE' 
              });
            }}
            className="px-5 py-2.5 rounded-xl font-bold text-sm bg-slate-900 text-white shadow-lg hover:bg-slate-800 transition-all flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> New Record
          </button>
        </div>
      </div>

      {viewMode === 'board' ? (
        <div className={`${endpoint === 'health-events' ? '' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8'}`}>
          {/* Health events: grouped + ungrouped cards side by side */}
          {endpoint === 'health-events' && (() => {
            const healthRecs = records as (RecordItem & {
              source?: string; reportGroupId?: string; details?: HealthEvent['details']; eventType?: string;
            })[];

            const groupMap = new Map<string, typeof healthRecs>();
            for (const rec of healthRecs) {
              if (rec.source === 'DOCTOR' || rec.source === 'AI') {
                const key = rec.reportGroupId || rec._id;
                if (!groupMap.has(key)) groupMap.set(key, []);
                groupMap.get(key)!.push(rec);
              }
            }
            const userRecs = healthRecs.filter(r => !r.source || r.source === 'USER');

            return (
              <div className="space-y-6">
                {/* Visit groups (doctor/AI) */}
                {groupMap.size > 0 && (
                  <div>
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Doctor Reports</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {Array.from(groupMap.entries()).map(([key, evs]) => {
                        const isGroup = !!evs[0].reportGroupId;
                        const visitEv = evs.find(e => e.eventType === 'DOCTOR_VISIT');
                        const rxEv    = evs.find(e => e.eventType === 'PRESCRIPTION');
                        const testEv  = evs.find(e => e.eventType === 'TEST_RESULTS');
                        const docInfo: DoctorInfo = visitEv?.details?.doctorInfo ?? rxEv?.details?.doctorInfo ?? {};

                        return (
                          <div key={key} className={`rounded-3xl border-2 shadow-sm overflow-hidden ${isGroup ? 'border-indigo-200 bg-gradient-to-b from-indigo-50 to-white' : 'border-slate-200 bg-white'} hover:shadow-xl hover:-translate-y-0.5 transition-all`}>
                            {/* Card Header */}
                            <div className={`px-5 py-4 ${isGroup ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  {isGroup && <Link2 className="w-4 h-4 text-indigo-200" />}
                                  <span className="text-xs font-black uppercase tracking-wider">
                                    {isGroup ? 'Visit Group' : (evs[0].eventType || 'Health Event')}
                                  </span>
                                </div>
                                <span className="text-[10px] opacity-70">{new Date(evs[0].date).toLocaleDateString()}</span>
                              </div>
                              {/* Doctor info */}
                              {docInfo.name && (
                                <p className={`text-sm font-bold mt-1 ${isGroup ? 'text-white' : 'text-slate-800'}`}>
                                  {docInfo.specialty ? `${docInfo.name} · ${docInfo.specialty}` : docInfo.name}
                                </p>
                              )}
                              {(docInfo.hospital || docInfo.address) && (
                                <div className="flex items-center gap-1 mt-0.5">
                                  <MapPin className={`w-3 h-3 flex-shrink-0 ${isGroup ? 'text-indigo-300' : 'text-slate-400'}`} />
                                  <p className={`text-[10px] line-clamp-1 ${isGroup ? 'text-indigo-200' : 'text-slate-500'}`}>
                                    {[docInfo.hospital, docInfo.address].filter(Boolean).join(' — ')}
                                  </p>
                                </div>
                              )}
                            </div>

                            {/* DOCTOR_VISIT section */}
                            {visitEv && (
                              <div className="px-5 py-3 border-b border-indigo-100">
                                <div className="flex items-center gap-2 mb-2">
                                  <Stethoscope className="w-4 h-4 text-rose-500 flex-shrink-0" />
                                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Diagnoses & Findings</span>
                                </div>
                                {(visitEv.details?.conditions ?? []).length > 0 ? (
                                  <div className="flex flex-wrap gap-1.5">
                                    {visitEv.details!.conditions!.map((c, i) => (
                                      <span key={i} className="px-2 py-0.5 bg-rose-50 text-rose-700 text-[10px] font-bold rounded-full border border-rose-100">{c}</span>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-xs text-slate-500 line-clamp-2">{visitEv.description}</p>
                                )}
                                {(visitEv.details?.symptoms ?? []).length > 0 && (
                                  <p className="text-[10px] text-slate-400 mt-1.5">Symptoms: {visitEv.details!.symptoms!.join(', ')}</p>
                                )}
                                {(visitEv.details?.injections ?? []).length > 0 && (
                                  <p className="text-[10px] text-amber-600 mt-1 font-medium">Injections given: {visitEv.details!.injections!.join(', ')}</p>
                                )}
                                {visitEv.details?.notes && (
                                  <p className="text-[10px] text-slate-400 mt-1 italic line-clamp-2">{visitEv.details.notes}</p>
                                )}
                              </div>
                            )}

                            {/* PRESCRIPTION section */}
                            {rxEv && (rxEv.details?.medications ?? []).length > 0 && (
                              <div className="px-5 py-3 border-b border-indigo-100">
                                <div className="flex items-center gap-2 mb-2">
                                  <Pill className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Prescription</span>
                                </div>
                                <div className="space-y-1.5">
                                  {rxEv.details!.medications!.map((med, i) => (
                                    <div key={i} className="flex items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <span className="text-xs font-bold text-slate-800">{med.name}</span>
                                        <span className="text-[10px] text-slate-500 ml-1">{med.dosage}</span>
                                        {med.duration && <span className="text-[10px] text-slate-400 ml-1">· {med.duration}</span>}
                                      </div>
                                      <div className="flex items-center gap-1 flex-shrink-0">
                                        {med.isDaily && (
                                          <span className="text-[9px] font-bold px-1.5 py-0.5 bg-teal-50 text-teal-600 rounded-full border border-teal-100">DAILY</span>
                                        )}
                                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${
                                          med.route === 'INJECTION' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-slate-50 text-slate-500 border-slate-100'
                                        }`}>{med.route || 'ORAL'}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* TEST_RESULTS section */}
                            {testEv && (testEv.details?.testResults ?? []).length > 0 && (
                              <div className="px-5 py-3">
                                <div className="flex items-center gap-2 mb-2">
                                  <FlaskConical className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Test Results</span>
                                </div>
                                <div className="space-y-1.5">
                                  {testEv.details!.testResults!.map((t, i) => (
                                    <div key={i} className="flex items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <span className="text-xs font-semibold text-slate-700">{t.testName}</span>
                                        {t.value && <span className="text-[10px] text-slate-500 ml-1">: {t.value}</span>}
                                        {t.referenceRange && <span className="text-[10px] text-slate-400 ml-1">(ref: {t.referenceRange})</span>}
                                      </div>
                                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border flex-shrink-0 ${
                                        t.status === 'ABNORMAL'   ? 'bg-rose-50 text-rose-600 border-rose-100' :
                                        t.status === 'BORDERLINE' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                                                                     'bg-emerald-50 text-emerald-600 border-emerald-100'
                                      }`}>{t.status || 'N/A'}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Fallback for non-grouped or legacy events */}
                            {!visitEv && !rxEv && !testEv && (
                              <div className="px-5 py-3">
                                <p className="text-xs text-slate-600 line-clamp-4">{evs[0].description}</p>
                              </div>
                            )}

                            {/* Footer */}
                            <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className={`w-1.5 h-1.5 rounded-full ${evs[0].status === 'ACTIVE' ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{evs[0].status || 'ACTIVE'}</span>
                                {isGroup && (
                                  <span className="text-[9px] text-indigo-400 font-medium">{evs.length} linked records</span>
                                )}
                              </div>
                              <div className="flex gap-1">
                                {evs.map(ev => (
                                  <button key={ev._id} onClick={() => handleDelete(ev._id)} className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-300 hover:text-rose-500 transition-colors" title={`Delete ${ev.eventType}`}>
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* User health logs */}
                {userRecs.length > 0 && (
                  <div>
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">My Logs</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {userRecs.map((rec, idx) => {
                        const colors = ['bg-[#FFF9E5] border-[#FFECB3] text-amber-900', 'bg-[#EBF5FF] border-[#D1E9FF] text-blue-900', 'bg-[#FFF0F0] border-[#FFDADA] text-rose-900', 'bg-[#E6FFFA] border-[#B2F5EA] text-emerald-900', 'bg-[#EEF2FF] border-[#E0E7FF] text-indigo-900'];
                        const colorClass = colors[idx % colors.length];
                        return (
                          <div key={rec._id} className={`p-6 rounded-3xl border-2 shadow-sm ${colorClass} hover:shadow-xl hover:-translate-y-1 transition-all relative group flex flex-col min-h-[200px]`}>
                            <div className="flex justify-between items-start mb-3">
                              <span className="text-[10px] font-bold uppercase tracking-widest bg-white/50 px-2 py-1 rounded-lg">{rec.eventType || typeLabel}</span>
                              <span className="text-[10px] font-bold text-current/60">{new Date(rec.date).toLocaleDateString()}</span>
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-semibold mb-1 line-clamp-1">{(rec.titles || []).join(', ')}</p>
                              <p className="text-sm opacity-70 line-clamp-4 whitespace-pre-wrap">{rec.description}</p>
                            </div>
                            <div className="mt-4 pt-3 border-t border-current/10 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${rec.status === 'ACTIVE' ? 'bg-orange-500 animate-pulse' : 'bg-emerald-500'}`} />
                                <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">{rec.status || 'LOGGED'}</span>
                              </div>
                              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => { setEditingId(rec._id); setDraftNote({ ...rec, date: new Date(rec.date).toISOString() }); }} className="p-2 hover:bg-white/50 rounded-lg text-slate-600"><Edit3 className="w-4 h-4" /></button>
                                <button onClick={() => handleDelete(rec._id)} className="p-2 hover:bg-rose-100 rounded-lg text-rose-600"><Trash2 className="w-4 h-4" /></button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {groupMap.size === 0 && userRecs.length === 0 && draftNote === null && (
                  <div className="text-center py-20 text-slate-400">No health records yet.</div>
                )}
              </div>
            );
          })()}

          {/* Non-health-event boards (diet, lifestyle) — original grid */}
          {endpoint !== 'health-events' && draftNote && (
            <div className="p-6 rounded-3xl border-2 border-dashed border-indigo-300 bg-indigo-50/30 shadow-xl animate-in zoom-in-95 duration-200 ring-2 ring-indigo-500/20 flex flex-col">
               <div className="flex justify-between items-center mb-4 gap-2">
                  <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">{typeLabel} Draft</span>
                  <div className="flex items-center gap-2">
                    <input 
                      type={endpoint === 'diet-logs' ? "datetime-local" : "date"}
                      value={endpoint === 'diet-logs' ? draftNote.date?.substring(0, 16) : draftNote.date?.substring(0, 10)} 
                      onChange={e => setDraftNote({...draftNote, date: e.target.value})}
                      className="text-[10px] font-bold bg-transparent border-none p-0 focus:ring-0 text-right text-slate-500"
                    />
                    {endpoint === 'lifestyle' && (
                      <>
                        <span className="text-[10px] text-slate-400">to</span>
                        <input 
                          type="date"
                          value={draftNote.endDate?.substring(0, 10)} 
                          onChange={e => setDraftNote({...draftNote, endDate: e.target.value})}
                          className="text-[10px] font-bold bg-transparent border-none p-0 focus:ring-0 text-right text-slate-500"
                        />
                      </>
                    )}
                  </div>
               </div>

               <div className="mb-4">
                  <div className="relative group">
                    <input 
                      type="text"
                      className="text-xl font-bold w-full border-none p-0 focus:ring-0 placeholder:text-slate-300 bg-transparent mb-1" 
                      placeholder={`Add ${endpoint === 'health-events' ? 'Title' : endpoint === 'diet-logs' ? 'Meal Type' : 'Category'}...`}
                      value={tagInput}
                      onChange={e => setTagInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addTag(tagInput)}
                    />
                    <p className="text-[8px] text-slate-400 font-bold uppercase tracking-tighter">Press Enter to add</p>
                  </div>
                  
                  {/* Suggestions for all */}
                  {!tagInput && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {(endpoint === 'health-events' ? healthSuggestions : endpoint === 'diet-logs' ? dietSuggestions : lifestyleSuggestions).map(s => (
                        <button 
                          key={s} 
                          onClick={() => addTag(s)}
                          className="text-[9px] px-2 py-0.5 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-100 transition-colors"
                        >
                          + {s}
                        </button>
                      ))}
                    </div>
                  )}
               </div>

               <textarea 
                className="text-sm text-slate-600 w-full flex-1 min-h-[120px] border-none p-0 focus:ring-0 resize-none placeholder:text-slate-300 bg-transparent mb-4" 
                placeholder="Start typing your notes here... (mandatory)" 
                value={draftNote.description} 
                onChange={e => setDraftNote({...draftNote, description: e.target.value})} 
              />

               {/* Pill Bars at Bottom */}
               <div className="mt-auto pt-4 border-t border-slate-200/50">
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {(endpoint === 'health-events' ? draftNote.titles : endpoint === 'diet-logs' ? draftNote.mealTypes : draftNote.categories)?.map(tag => (
                      <span key={tag} className="flex items-center gap-1 px-2.5 py-1 bg-indigo-500 text-white text-[10px] font-bold rounded-lg shadow-sm">
                        {tag}
                        <button onClick={() => removeTag(tag)} className="hover:text-rose-200"><X className="w-3 h-3" /></button>
                      </span>
                    ))}
                    {!(endpoint === 'health-events' ? draftNote.titles : endpoint === 'diet-logs' ? draftNote.mealTypes : draftNote.categories)?.length && (
                      <span className="text-[10px] text-slate-300 italic">No tags added yet</span>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button onClick={() => {setDraftNote(null); setEditingId(null);}} className="flex-1 py-2 text-xs font-bold text-slate-500 hover:bg-white rounded-lg transition-colors">Cancel</button>
                    <button onClick={handleSave} className="flex-1 py-2 text-xs font-bold text-white bg-indigo-600 rounded-lg shadow-md">Save</button>
                  </div>
               </div>
            </div>
          )}

          {endpoint !== 'health-events' && records.map((rec, idx) => {
            if (editingId === rec._id) return null;
            const colors = ['bg-[#FFF9E5] border-[#FFECB3] text-amber-900', 'bg-[#EBF5FF] border-[#D1E9FF] text-blue-900', 'bg-[#FFF0F0] border-[#FFDADA] text-rose-900', 'bg-[#E6FFFA] border-[#B2F5EA] text-emerald-900', 'bg-[#EEF2FF] border-[#E0E7FF] text-indigo-900'];
            const colorClass = colors[idx % colors.length];
            const tags = rec.titles || rec.mealTypes || rec.categories || [];
            return (
              <div key={rec._id} className={`p-6 rounded-3xl border-2 shadow-sm ${colorClass} hover:shadow-xl hover:-translate-y-1 transition-all relative group flex flex-col min-h-[260px]`}>
                <div className="flex justify-between items-start mb-4">
                  <span className="text-[10px] font-bold uppercase tracking-widest bg-white/50 px-2 py-1 rounded-lg">{rec.eventType || typeLabel}</span>
                  <div className="text-[10px] font-bold text-current/60 text-right">
                    <div>{new Date(rec.date).toLocaleDateString()}{endpoint === 'lifestyle' && rec.endDate && ` - ${new Date(rec.endDate).toLocaleDateString()}`}</div>
                    {endpoint === 'diet-logs' && <div className="opacity-50">{new Date(rec.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>}
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-sm opacity-80 line-clamp-6 whitespace-pre-wrap">{rec.description}</p>
                </div>
                <div className="mt-4 pt-4 border-t border-current/10">
                  <div className="flex flex-wrap gap-1 mb-4">
                    {tags.map(tag => <span key={tag} className="px-2 py-0.5 bg-white/40 text-[9px] font-bold rounded-md">{tag}</span>)}
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${rec.status === 'ACTIVE' ? 'bg-orange-500 animate-pulse' : 'bg-emerald-500'}`} />
                      <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">{rec.status || 'LOGGED'}</span>
                    </div>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => { setEditingId(rec._id); setDraftNote({ ...rec, date: new Date(rec.date).toISOString() }); }} className="p-2 hover:bg-white/50 rounded-lg text-slate-600"><Edit3 className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(rec._id)} className="p-2 hover:bg-rose-100 rounded-lg text-rose-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Timeline View */
        <div className="relative max-w-4xl mx-auto pl-8 border-l-2 border-slate-200 space-y-12 pb-10">
          {endpoint === 'health-events' ? (() => {
            const healthRecs = records as (RecordItem & { source?: string; reportGroupId?: string; details?: HealthEvent['details']; eventType?: string })[];
            const groupMap = new Map<string, typeof healthRecs>();
            for (const rec of healthRecs) {
              const key = rec.reportGroupId || rec._id;
              if (!groupMap.has(key)) groupMap.set(key, []);
              groupMap.get(key)!.push(rec);
            }
            return Array.from(groupMap.entries()).map(([key, evs]) => {
              const isGroup = !!evs[0].reportGroupId;
              const visitEv = evs.find(e => e.eventType === 'DOCTOR_VISIT');
              const rxEv    = evs.find(e => e.eventType === 'PRESCRIPTION');
              const testEv  = evs.find(e => e.eventType === 'TEST_RESULTS');
              const docInfo: DoctorInfo = visitEv?.details?.doctorInfo ?? rxEv?.details?.doctorInfo ?? {};
              return (
                <div key={key} className="relative group animate-in slide-in-from-left-4 duration-500">
                  <div className={`absolute -left-[41px] top-0 w-5 h-5 rounded-full bg-white border-4 shadow-sm z-10 ${isGroup ? 'border-indigo-500' : 'border-slate-400'}`} />
                  <div className="flex flex-col md:flex-row md:items-start gap-4 md:gap-8">
                    <div className="min-w-[120px] pt-0.5">
                      <p className="text-sm font-bold text-slate-900">{new Date(evs[0].date).toLocaleDateString()}</p>
                      {isGroup && <p className="text-[10px] text-indigo-500 font-bold mt-0.5">Visit Group</p>}
                    </div>
                    <div className={`flex-1 rounded-3xl border overflow-hidden shadow-sm hover:shadow-md transition-all ${isGroup ? 'border-indigo-200' : 'border-slate-200 bg-white'}`}>
                      {isGroup && (
                        <div className="bg-indigo-600 px-5 py-3 text-white">
                          <div className="flex items-center gap-2">
                            <Link2 className="w-4 h-4 text-indigo-300" />
                            <span className="text-xs font-black uppercase tracking-wider">
                              {docInfo.name ? (docInfo.specialty ? `${docInfo.name} · ${docInfo.specialty}` : docInfo.name) : 'Visit Group'}
                            </span>
                          </div>
                          {(docInfo.hospital || docInfo.address) && (
                            <p className="text-[10px] text-indigo-200 mt-0.5 flex items-center gap-1">
                              <MapPin className="w-3 h-3" />{[docInfo.hospital, docInfo.address].filter(Boolean).join(' — ')}
                            </p>
                          )}
                        </div>
                      )}
                      {visitEv && (
                        <div className="bg-white px-5 py-3 border-b border-slate-100">
                          <div className="flex items-center gap-2 mb-1">
                            <Stethoscope className="w-4 h-4 text-rose-500" />
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Diagnoses</span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {(visitEv.details?.conditions ?? []).map((c, i) => (
                              <span key={i} className="px-2 py-0.5 bg-rose-50 text-rose-700 text-[10px] font-bold rounded-full border border-rose-100">{c}</span>
                            ))}
                          </div>
                          {(visitEv.details?.injections ?? []).length > 0 && (
                            <p className="text-[10px] text-amber-600 mt-1 font-medium">Injections: {visitEv.details!.injections!.join(', ')}</p>
                          )}
                        </div>
                      )}
                      {rxEv && (rxEv.details?.medications ?? []).length > 0 && (
                        <div className="bg-white px-5 py-3 border-b border-slate-100">
                          <div className="flex items-center gap-2 mb-1.5">
                            <Pill className="w-4 h-4 text-indigo-500" />
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Prescription</span>
                          </div>
                          <div className="space-y-1">
                            {rxEv.details!.medications!.map((m, i) => (
                              <div key={i} className="flex items-center justify-between text-xs">
                                <span className="font-semibold text-slate-700">{m.name} <span className="text-slate-400 font-normal">{m.dosage} · {m.frequency}</span></span>
                                <div className="flex gap-1">
                                  {m.isDaily && <span className="text-[9px] font-bold px-1.5 py-0.5 bg-teal-50 text-teal-600 rounded-full">DAILY</span>}
                                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${m.route === 'INJECTION' ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-500'}`}>{m.route || 'ORAL'}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {testEv && (testEv.details?.testResults ?? []).length > 0 && (
                        <div className="bg-white px-5 py-3">
                          <div className="flex items-center gap-2 mb-1.5">
                            <FlaskConical className="w-4 h-4 text-emerald-500" />
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Test Results</span>
                          </div>
                          <div className="space-y-1">
                            {testEv.details!.testResults!.map((t, i) => (
                              <div key={i} className="flex items-center justify-between text-xs">
                                <span className="font-semibold text-slate-700">{t.testName}{t.value && <span className="text-slate-400 font-normal"> : {t.value}</span>}</span>
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${t.status === 'ABNORMAL' ? 'bg-rose-50 text-rose-600' : t.status === 'BORDERLINE' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>{t.status}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {!visitEv && !rxEv && !testEv && (
                        <div className="bg-white px-5 py-4">
                          <p className="text-sm text-slate-600">{evs[0].description}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            });
          })() : records.map((rec) => {
            const tags = rec.titles || rec.mealTypes || rec.categories || [];
            return (
              <div key={rec._id} className="relative group animate-in slide-in-from-left-4 duration-500">
                <div className="absolute -left-[41px] top-0 w-5 h-5 rounded-full bg-white border-4 border-indigo-500 shadow-sm z-10" />
                <div className="flex flex-col md:flex-row md:items-start gap-4 md:gap-8">
                  <div className="min-w-[120px] pt-0.5">
                    <p className="text-sm font-bold text-slate-900">
                      {new Date(rec.date).toLocaleDateString()}
                      {endpoint === 'lifestyle' && rec.endDate && <span className="block text-[10px] text-slate-400">to {new Date(rec.endDate).toLocaleDateString()}</span>}
                    </p>
                    {endpoint === 'diet-logs' && <p className="text-xs font-medium text-slate-400">{new Date(rec.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>}
                  </div>
                  <div className="flex-1 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-all">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex flex-wrap gap-1">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-500 bg-indigo-50 px-2 py-1 rounded-lg">{rec.eventType || typeLabel}</span>
                        {tags.map(tag => <span key={tag} className="text-[9px] font-bold uppercase text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">{tag}</span>)}
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => { setEditingId(rec._id); setDraftNote({ ...rec, date: new Date(rec.date).toISOString() }); setViewMode('board'); }} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400"><Edit3 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleDelete(rec._id)} className="p-1.5 hover:bg-rose-50 rounded-lg text-rose-400"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                    <p className="text-sm text-slate-500 leading-relaxed whitespace-pre-wrap">{rec.description}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// App Routing
// -----------------------------------------------------------------------------
export function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<FamilyDashboard />} />
        <Route path="dashboard" element={<FamilyDashboard />} />
        <Route path="users" element={<FamilyDashboard />} />
        <Route path="users/:id" element={<UserDashboard />} />
        <Route path="users/:id/health-notes" element={<RecordsBoard title="Health Records" endpoint="health-events" typeLabel="Health Event" icon={Activity} />} />
        <Route path="users/:id/diet-notes" element={<RecordsBoard title="Diet Logs" endpoint="diet-logs" typeLabel="Meal" icon={Apple} />} />
        <Route path="users/:id/lifestyle-notes" element={<RecordsBoard title="Lifestyle" endpoint="lifestyle" typeLabel="Lifestyle Note" icon={BrainCircuit} />} />
        <Route path="users/:id/meal-plan" element={<MealPlanDashboard />} />
        <Route path="graph" element={<FamilyGraph />} />
      </Route>
    </Routes>
  );
}

export default App;
