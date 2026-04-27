import { useState, useEffect, useCallback } from 'react';
import type { User, HealthEvent, DietLog, LifestyleRecord, MealPlan, Reminder } from '../types';
import {
  getUser, getHealthEvents, getDietLogs, getLifestyle, getActiveMealPlan, getReminders,
} from '../lib/api';

interface DashboardData {
  user: User | null;
  healthEvents: HealthEvent[];
  dietLogs: DietLog[];
  lifestyleRecords: LifestyleRecord[];
  mealPlan: MealPlan | null;
  reminders: Reminder[];
}

export function useDashboardData(userId: string | undefined) {
  const [data, setData] = useState<DashboardData>({
    user: null, healthEvents: [], dietLogs: [], lifestyleRecords: [], mealPlan: null, reminders: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const [user, healthEvents, dietLogs, lifestyleRecords, mealPlan, reminders] = await Promise.allSettled([
        getUser(userId),
        getHealthEvents(userId),
        getDietLogs(userId),
        getLifestyle(userId),
        getActiveMealPlan(userId),
        getReminders(userId),
      ]);
      setData({
        user:              user.status             === 'fulfilled' ? user.value             : null,
        healthEvents:      healthEvents.status     === 'fulfilled' ? healthEvents.value     : [],
        dietLogs:          dietLogs.status         === 'fulfilled' ? dietLogs.value         : [],
        lifestyleRecords:  lifestyleRecords.status === 'fulfilled' ? lifestyleRecords.value : [],
        mealPlan:          mealPlan.status         === 'fulfilled' ? mealPlan.value         : null,
        reminders:         reminders.status        === 'fulfilled' ? (Array.isArray(reminders.value) ? reminders.value : []) : [],
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const dismissReminder = useCallback((id: string) => {
    setData(prev => ({ ...prev, reminders: prev.reminders.filter(r => r._id !== id) }));
  }, []);

  return { ...data, loading, error, refetch: fetchAll, dismissReminder };
}
