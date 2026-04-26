import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  UtensilsCrossed,
  RefreshCw,
  Leaf,
  ChevronRight,
  X,
  AlertTriangle,
  SlidersHorizontal,
  BrainCircuit,
  CheckCircle2
} from 'lucide-react';
import { motion } from 'framer-motion';

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

export function MealPlanDashboard() {
  const { id: userId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [user, setUser] = useState<User | null>(null);
  const [mealPlan, setMealPlan] = useState<MealPlan | null>(null);
  const [mealPlanLoading, setMealPlanLoading] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState<Meal | null>(null);
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

  const fetchData = async () => {
    try {
      const [userRes, mealRes] = await Promise.all([
        fetch(`http://localhost:3000/api/users/${userId}`),
        fetch(`http://localhost:3000/api/users/${userId}/meal-plans/active`),
      ]);
      
      const userData = await userRes.json();
      const mealData = mealRes.ok ? await mealRes.json() : null;
      
      setUser(userData);
      if (mealData?._id) setMealPlan(mealData);
      if (userData?.mealPreferences) setMealPreferences(p => ({ ...p, ...userData.mealPreferences }));
    } catch (e) {
      console.error('Error fetching meal plan data:', e);
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

  if (!user) return <div className="p-8">Loading...</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="bg-white px-8 py-5 border-b border-slate-100 flex items-center justify-between">
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
          <button onClick={() => navigate(-1)} className="p-2.5 hover:bg-slate-100 rounded-xl transition-colors text-slate-500">
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

      {/* Recipe Detail Modal */}
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
    </div>
  );
}