import { useState } from 'react';
import {
  UtensilsCrossed, X, RefreshCw, ChevronRight, AlertTriangle,
  Leaf, BrainCircuit, CheckCircle2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { generateMealPlan } from '../../lib/api';
import type { MealPlan, Meal, MealPreferences } from '../../types';

interface Props {
  userId: string;
  mealPlan: MealPlan | null;
  loading: boolean;
  onPlanUpdated: (plan: MealPlan) => void;
}

const DEFAULT_PREFS: MealPreferences = {
  cuisine:      'SOUTH_INDIAN',
  customCuisine: '',
  languages:    ['ENGLISH'],
  goal:         'HEALTHY_LIVING',
  customGoal:   '',
  durationDays: 7,
  customDays:   '',
};

function MealCard({ meal, onClick }: { meal: Meal; onClick: () => void }) {
  const colors: Record<string, string> = {
    BREAKFAST: 'bg-amber-50 text-amber-700 border-amber-200',
    LUNCH:     'bg-orange-50 text-orange-700 border-orange-200',
    DINNER:    'bg-rose-50 text-rose-700 border-rose-200',
    SNACK:     'bg-sky-50 text-sky-700 border-sky-200',
  };
  const cls = colors[meal.mealType] ?? 'bg-slate-50 text-slate-700 border-slate-200';

  return (
    <div
      onClick={onClick}
      className="cursor-pointer border border-slate-100 rounded-2xl p-4 hover:border-emerald-200 hover:bg-emerald-50/30 transition-all group"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${cls}`}>{meal.mealType}</span>
          <p className="font-bold text-slate-800 mt-1.5 text-sm group-hover:text-emerald-700 transition-colors line-clamp-1">{meal.title}</p>
          <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{meal.reasoning}</p>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all mt-1 flex-shrink-0" />
      </div>
    </div>
  );
}

function MealDetailModal({ meal, onClose }: { meal: Meal; onClose: () => void }) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-900/50 backdrop-blur-md"
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ scale: 0.92, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.92, y: 20 }}
          className="bg-white w-full max-w-lg max-h-[85vh] rounded-3xl shadow-2xl overflow-y-auto"
        >
          <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-7 text-white relative">
            <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-white/20 rounded-xl transition-colors">
              <X className="w-4 h-4" />
            </button>
            <span className="text-[10px] font-black uppercase tracking-widest bg-white/20 px-3 py-1 rounded-full mb-3 inline-block">{meal.mealType}</span>
            <h2 className="text-2xl font-black">{meal.title}</h2>
          </div>

          <div className="p-6 space-y-5">
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
              <h4 className="font-bold text-blue-800 text-xs mb-1.5 flex items-center gap-1.5"><BrainCircuit className="w-3.5 h-3.5" />Why this meal?</h4>
              <p className="text-sm text-blue-700 leading-relaxed">{meal.reasoning}</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
              <h4 className="font-bold text-emerald-800 text-xs mb-1.5 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" />Health Benefits</h4>
              <p className="text-sm text-emerald-700 leading-relaxed">{meal.benefits}</p>
            </div>
            <div>
              <h4 className="font-bold text-slate-800 text-xs mb-2 flex items-center gap-1.5"><Leaf className="w-3.5 h-3.5 text-emerald-500" />Ingredients</h4>
              <div className="space-y-1.5">
                {meal.ingredients.map((ing, i) => (
                  <div key={i} className="flex items-start justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                    <div>
                      <p className="font-semibold text-slate-800 text-xs">{ing.name}</p>
                      {ing.teluguName && <p className="text-slate-400 text-[10px] mt-0.5">తె: {ing.teluguName}</p>}
                      {ing.tamilName  && <p className="text-slate-400 text-[10px]">த: {ing.tamilName}</p>}
                    </div>
                    <span className="text-[10px] font-bold text-teal-600 bg-teal-50 px-2 py-1 rounded-lg flex-shrink-0">{ing.quantity}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export function MealPlanWidget({ userId, mealPlan, loading, onPlanUpdated }: Props) {
  const [isOpen, setIsOpen]         = useState(false);
  const [selectedMeal, setMeal]     = useState<Meal | null>(null);
  const [activeDay, setActiveDay]   = useState(0);
  const [prefs, setPrefs]           = useState<MealPreferences>(DEFAULT_PREFS);
  const [generating, setGenerating] = useState(false);
  const [ingredientsOpen, setIngOpen] = useState(true);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const days = prefs.customDays ? Math.min(30, parseInt(prefs.customDays) || 7) : prefs.durationDays;
      const plan = await generateMealPlan(userId, {
        cuisine:   prefs.customCuisine || prefs.cuisine,
        languages: prefs.languages,
        goal:      prefs.customGoal || prefs.goal,
        days,
      });
      onPlanUpdated(plan);
      setActiveDay(0);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      {/* Meal Detail Modal */}
      {selectedMeal && <MealDetailModal meal={selectedMeal} onClose={() => setMeal(null)} />}

      {/* Full Plan Modal */}
      <AnimatePresence>
        {isOpen && (
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
              className="bg-slate-50 w-full max-w-6xl max-h-[93vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              {/* Modal header */}
              <div className="bg-white px-7 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="bg-emerald-100 p-2.5 rounded-xl text-emerald-600">
                    <UtensilsCrossed className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-slate-800">Recommended Meal Plan</h2>
                    <p className="text-[10px] text-slate-400">AI-generated based on your health profile</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs rounded-xl transition-all disabled:opacity-50 shadow-sm"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${generating ? 'animate-spin' : ''}`} />
                    {generating ? 'Generating...' : 'Regenerate'}
                  </button>
                  <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-500">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="flex flex-1 overflow-hidden">
                {/* Left: Settings + Meals */}
                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                  {/* Settings */}
                  <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm space-y-4">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Plan Settings</p>

                    {/* Duration */}
                    <div>
                      <label className="text-xs font-bold text-slate-500 mb-1.5 block">Duration</label>
                      <div className="flex flex-wrap gap-2 items-center">
                        {[3, 7].map(d => (
                          <button key={d}
                            onClick={() => setPrefs(p => ({ ...p, durationDays: d, customDays: '' }))}
                            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all border ${prefs.durationDays === d && !prefs.customDays ? 'bg-emerald-500 text-white border-emerald-500 shadow' : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300'}`}>
                            {d} Days
                          </button>
                        ))}
                        <input type="number" min={1} max={30} placeholder="Custom"
                          value={prefs.customDays}
                          onChange={e => setPrefs(p => ({ ...p, customDays: e.target.value, durationDays: 0 }))}
                          className={`w-20 px-3 py-1.5 rounded-full text-xs font-bold border outline-none ${prefs.customDays ? 'border-emerald-400 text-emerald-700' : 'border-slate-200 text-slate-500'}`}
                        />
                      </div>
                    </div>

                    {/* Cuisine */}
                    <div>
                      <label className="text-xs font-bold text-slate-500 mb-1.5 block">Cuisine / Region</label>
                      <div className="flex flex-wrap gap-2 items-center">
                        {['SOUTH_INDIAN', 'NORTH_INDIAN', 'MEDITERRANEAN', 'CONTINENTAL'].map(c => (
                          <button key={c}
                            onClick={() => setPrefs(p => ({ ...p, cuisine: c, customCuisine: '' }))}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${prefs.cuisine === c && !prefs.customCuisine ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300'}`}>
                            {c.replace(/_/g, ' ')}
                          </button>
                        ))}
                        <input type="text" placeholder="Enter cuisine..."
                          value={prefs.customCuisine}
                          onChange={e => setPrefs(p => ({ ...p, customCuisine: e.target.value, cuisine: e.target.value ? '' : p.cuisine }))}
                          className={`px-3 py-1.5 rounded-full text-xs font-bold border outline-none min-w-[140px] ${prefs.customCuisine ? 'border-emerald-400 text-emerald-700' : 'border-slate-200 text-slate-500'}`}
                        />
                      </div>
                    </div>

                    {/* Goal */}
                    <div>
                      <label className="text-xs font-bold text-slate-500 mb-1.5 block">Health Goal</label>
                      <div className="flex flex-wrap gap-2 items-center">
                        {['HEALTHY_LIVING', 'WEIGHT_LOSS', 'MUSCLE_GAIN', 'GUT_HEALTH'].map(g => (
                          <button key={g}
                            onClick={() => setPrefs(p => ({ ...p, goal: g, customGoal: '' }))}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${prefs.goal === g && !prefs.customGoal ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}>
                            {g.replace(/_/g, ' ')}
                          </button>
                        ))}
                        <input type="text" placeholder="Custom goal..."
                          value={prefs.customGoal}
                          onChange={e => setPrefs(p => ({ ...p, customGoal: e.target.value, goal: e.target.value ? '' : p.goal }))}
                          className={`px-3 py-1.5 rounded-full text-xs font-bold border outline-none min-w-[120px] ${prefs.customGoal ? 'border-indigo-400 text-indigo-700' : 'border-slate-200 text-slate-500'}`}
                        />
                      </div>
                    </div>

                    {/* Languages */}
                    <div>
                      <label className="text-xs font-bold text-slate-500 mb-1.5 block">Ingredient Languages <span className="text-emerald-500 font-normal">(English always included)</span></label>
                      <div className="flex flex-wrap gap-2">
                        {['ENGLISH', 'TELUGU', 'TAMIL', 'HINDI', 'KANNADA'].map(lang => {
                          const selected = prefs.languages.includes(lang);
                          return (
                            <button key={lang}
                              onClick={() => {
                                if (lang === 'ENGLISH') return;
                                setPrefs(p => ({ ...p, languages: selected ? p.languages.filter(l => l !== lang) : [...p.languages, lang] }));
                              }}
                              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${selected ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'} ${lang === 'ENGLISH' ? 'opacity-60 cursor-default' : ''}`}>
                              {lang}{selected && lang !== 'ENGLISH' && ' ✓'}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Warnings */}
                  {mealPlan?.warnings && mealPlan.warnings.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3">
                      <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-[10px] font-black text-amber-700 uppercase tracking-wider mb-1">Health Warnings</p>
                        {mealPlan.warnings.map((w, i) => <p key={i} className="text-xs text-amber-600">{w}</p>)}
                      </div>
                    </div>
                  )}

                  {/* No plan */}
                  {!mealPlan && !generating && (
                    <div className="bg-white rounded-2xl p-10 text-center border border-dashed border-emerald-200">
                      <UtensilsCrossed className="w-10 h-10 text-emerald-200 mx-auto mb-3" />
                      <p className="text-slate-400 font-medium text-sm mb-4">No meal plan yet. Configure preferences above and generate.</p>
                      <button onClick={handleGenerate}
                        className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold text-sm rounded-2xl shadow-lg hover:opacity-90 transition-all">
                        Generate Meal Plan
                      </button>
                    </div>
                  )}

                  {generating && (
                    <div className="bg-white rounded-2xl p-10 text-center">
                      <div className="w-10 h-10 border-4 border-emerald-200 border-t-emerald-500 rounded-full animate-spin mx-auto mb-3" />
                      <p className="text-slate-400 font-medium text-sm">AI is personalising your meal plan...</p>
                    </div>
                  )}

                  {mealPlan && !generating && (
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                      <div className="flex gap-1 p-3 border-b border-slate-100 overflow-x-auto">
                        {mealPlan.days.map((day, idx) => (
                          <button key={idx} onClick={() => setActiveDay(idx)}
                            className={`flex-shrink-0 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${activeDay === idx ? 'bg-emerald-500 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                            {day.date}
                          </button>
                        ))}
                      </div>
                      <div className="p-4 space-y-2">
                        {(mealPlan.days[activeDay]?.meals || []).map((meal, mi) => (
                          <MealCard key={mi} meal={meal} onClick={() => setMeal(meal)} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right: Ingredients panel */}
                {mealPlan && !generating && (
                  <div className={`border-l border-slate-200 bg-white flex flex-col transition-all duration-200 ${ingredientsOpen ? 'w-64' : 'w-12'}`}>
                    <button
                      onClick={() => setIngOpen(v => !v)}
                      className="flex items-center gap-2 p-3.5 border-b border-slate-100 hover:bg-slate-50 transition-colors"
                    >
                      <Leaf className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      {ingredientsOpen && <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex-1">Ingredients</span>}
                      <ChevronRight className={`w-4 h-4 text-slate-300 transition-transform flex-shrink-0 ${ingredientsOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {ingredientsOpen && (
                      <div className="flex-1 overflow-y-auto p-3 space-y-2">
                        {Array.from(
                          new Map(
                            (mealPlan.days[activeDay]?.meals || [])
                              .flatMap(m => m.ingredients)
                              .map(ing => [ing.name, ing])
                          ).values()
                        ).map((ing, i) => (
                          <div key={i} className="bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                            <p className="font-semibold text-slate-800 text-xs">{ing.name}</p>
                            {ing.teluguName && <p className="text-[10px] text-slate-400 mt-0.5">తె: {ing.teluguName}</p>}
                            {ing.tamilName  && <p className="text-[10px] text-slate-400">த: {ing.tamilName}</p>}
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

      {/* Compact preview card */}
      <div
        onClick={() => setIsOpen(true)}
        className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden cursor-pointer hover:border-emerald-300 hover:shadow-md transition-all group"
      >
        <div className="p-5 pb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-100 p-2.5 rounded-xl text-emerald-600 group-hover:bg-emerald-200 transition-colors">
              <UtensilsCrossed className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800 group-hover:text-emerald-700 transition-colors">Recommended Meal Plan</h3>
              <p className="text-[10px] text-slate-400">Click to open full dashboard</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all" />
        </div>

        {loading ? (
          <div className="px-5 pb-5"><div className="h-14 bg-slate-100 rounded-2xl animate-pulse" /></div>
        ) : mealPlan ? (
          <div className="px-5 pb-5 space-y-1.5">
            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Today — {mealPlan.days[0]?.date}</p>
            {(mealPlan.days[0]?.meals || []).slice(0, 3).map((meal, i) => (
              <div key={i} className="flex items-center gap-2.5 p-2 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[9px] font-black uppercase bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full flex-shrink-0">{meal.mealType}</span>
                <span className="text-xs font-semibold text-slate-700 line-clamp-1">{meal.title}</span>
              </div>
            ))}
            {(mealPlan.days[0]?.meals || []).length > 3 && (
              <p className="text-[10px] text-slate-400 text-center pt-0.5">+{mealPlan.days[0].meals.length - 3} more meals</p>
            )}
          </div>
        ) : (
          <div className="px-5 pb-5">
            <div className="bg-emerald-50 rounded-2xl p-5 border border-dashed border-emerald-200 text-center">
              <p className="text-sm text-slate-400">No meal plan generated yet.</p>
              <p className="text-xs text-emerald-600 font-medium mt-1">Click to generate →</p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
