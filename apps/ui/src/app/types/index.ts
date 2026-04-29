export interface DoctorInfo {
  name?: string;
  hospital?: string;
  address?: string;
  specialty?: string;
}

export interface MedicationItem {
  name: string;
  dosage: string;
  frequency: string;
  duration?: string;
  route: string;
  isDaily: boolean;
  instructions?: string;
  status?: string;
}

export interface TestItem {
  testName: string;
  value?: string;
  referenceRange?: string;
  interpretation?: string;
  status: string;
}

export interface HealthEvent {
  _id: string;
  eventType: string;
  date: string;
  titles: string[];
  status: string;
  description?: string;
  source?: string;
  reportGroupId?: string;
  details?: {
    doctorInfo?: DoctorInfo;
    conditions?: string[];
    symptoms?: string[];
    injections?: string[];
    notes?: string;
    medications?: MedicationItem[];
    testResults?: TestItem[];
    doctorName?: string;
    doctorNotes?: string;
  };
}

export interface MedLogItem {
  name: string;
  dosage?: string;
  duration?: string;
  instructions?: string;
  sideEffects?: string[];
  avoidWhileTaking?: string[];
  startDate?: string;
  endDate?: string;
}

export interface DietLog {
  _id: string;
  date: string;
  mealTypes: string[];
  foodItems: { name: string; quantity: string }[];
  description?: string;
  source?: string;
  reportGroupId?: string;
  reportLabel?: string;
  cardType?: string;
  timing?: string;
  medicationItems?: MedLogItem[];
}

export interface Reminder {
  _id: string;
  reminderType: string;
  title: string;
  dueDate: string;
  reportGroupId?: string;
  reportLabel?: string;
  isDone: boolean;
  note?: string;
}

export interface LifestyleRecord {
  _id: string;
  date: string;
  endDate?: string;
  description: string;
  categories: string[];
  source?: string;
  reportGroupId?: string;
  reportLabel?: string;
}

export interface MealIngredient {
  name: string;
  teluguName?: string;
  tamilName?: string;
  quantity: string;
}

export interface Meal {
  mealType: string;
  title: string;
  reasoning: string;
  benefits: string;
  recipeId?: string;
  ingredients: MealIngredient[];
}

export interface MealPlanDay {
  dayNumber: number;
  date: string;
  meals: Meal[];
}

export interface MealPlan {
  _id: string;
  days: MealPlanDay[];
  warnings: string[];
  isActive: boolean;
  createdAt: string;
}

export interface User {
  _id: string;
  name: string;
  dob: string;
  biologicalSex?: string;
  createdAt: string;
  medicalConditions?: string[];
  allergies?: string[];
  medications?: string[];
  mealPreferences?: Record<string, unknown>;
}

export interface RecordItem {
  _id: string;
  titles?: string[];
  eventType?: string;
  mealTypes?: string[];
  categories?: string[];
  description: string;
  date: string;
  endDate?: string;
  status?: string;
  reportLabel?: string;
  source?: string;
  cardType?: string;
  timing?: string;
  medicationItems?: MedLogItem[];
}

export type DetailEvs = (RecordItem & {
  reportGroupId?: string;
  details?: HealthEvent['details'];
  eventType?: string;
  source?: string;
})[];

export type RecordType = 'health' | 'diet' | 'lifestyle';

export type ChatModelId =
  | 'claude-sonnet-4-6'
  | 'gpt-4o-mini'
  | 'llama-3.3-70b-versatile'
  | 'gemini-1.5-flash';

export interface ChatStep {
  label: string;
  done: boolean;
}

export interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
  intent?: string[];
  retrievedCount?: number;
  model?: string;
  attachedFile?: { name: string; type: string; preview?: string };
  isStreaming?: boolean;
  steps?: ChatStep[];
}

export interface MealPreferences {
  cuisine: string;
  customCuisine: string;
  languages: string[];
  goal: string;
  customGoal: string;
  durationDays: number;
  customDays: string;
}
