import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ChatAnthropic } from '@langchain/anthropic';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { MealPlan, MealPlanDocument } from './meal-plan.schema';
import { AgentService } from '../agent/agent.service';

@Injectable()
export class MealPlanService {
  private readonly logger = new Logger(MealPlanService.name);
  private _llm: ChatAnthropic | null = null;

  private get llm(): ChatAnthropic {
    if (!this._llm) {
      this._llm = new ChatAnthropic({ model: 'claude-sonnet-4-6', temperature: 0.7 });
    }
    return this._llm;
  }

  constructor(
    @InjectModel(MealPlan.name) private mealPlanModel: Model<MealPlanDocument>,
    @Inject(forwardRef(() => AgentService)) private agentService: AgentService,
  ) {}


  async getActiveMealPlan(userId: string) {
    return this.mealPlanModel.findOne({ userId, isActive: true } as any).sort({ createdAt: -1 });
  }

  async generateMealPlan(userId: string, userDetails: any, healthEvents: any[], dietLogs: any[], lifestyleRecords: any[], preferences: {
    cuisine?: string;
    language?: string;
    goal?: string;
    durationDays?: number;
  }) {
    const durationDays = preferences.durationDays || 3;
    const cuisine = preferences.cuisine || 'SOUTH_INDIAN';
    const language = preferences.language || 'ENGLISH';
    const goal = preferences.goal || 'HEALTHY_LIVING';

    const healthContext = healthEvents
      .slice(0, 5)
      .map(e => `${e.eventType}: ${(e.titles || []).join(', ')} - ${e.status}`)
      .join('\n');

    const dietContext = dietLogs
      .filter(d => d.source === 'USER')
      .slice(0, 5)
      .map(d => d.description)
      .join('\n');

    const doctorDietContext = dietLogs
      .filter(d => d.source === 'DOCTOR')
      .map(d => d.description)
      .join('\n');

    const lifestyleContext = lifestyleRecords
      .slice(0, 5)
      .map(r => r.description)
      .join('\n');

    const ingredientLanguageNote = language === 'TELUGU'
      ? 'For each ingredient, provide name in English AND Telugu (teluguName field).'
      : language === 'TAMIL'
      ? 'For each ingredient, provide name in English AND Tamil (tamilName field).'
      : 'Provide ingredient names in English only.';

    const prompt = `
You are an expert nutritionist and dietitian. Generate a detailed ${durationDays}-day meal plan for a patient with the following profile:

PATIENT PROFILE:
Name: ${userDetails.name}
Allergies: ${(userDetails.knownAllergies || []).join(', ') || 'None'}
Medical Conditions: ${(userDetails.medicalConditions || []).join(', ') || 'None'}
Goal: ${goal}

HEALTH RECORDS:
${healthContext || 'No recent records'}

DOCTOR-RECOMMENDED DIET:
${doctorDietContext || 'None'}

USER DIET PATTERNS:
${dietContext || 'No data'}

LIFESTYLE:
${lifestyleContext || 'No data'}

CUISINE PREFERENCE: ${cuisine.replace('_', ' ')}

INSTRUCTIONS:
- Create ${durationDays} days of meals (BREAKFAST, LUNCH, DINNER, SNACK)
- Each meal must have: title, reasoning (why it suits their health), benefits (specific to their conditions)
- ${ingredientLanguageNote}
- Warn about any health concerns or interactions with their conditions
- Keep it practical with locally available ingredients

Return ONLY valid JSON in this exact format:
{
  "days": [
    {
      "dayNumber": 1,
      "date": "Day 1",
      "meals": [
        {
          "mealType": "BREAKFAST",
          "title": "Oats Upma",
          "reasoning": "Why this meal suits the patient",
          "benefits": "Specific health benefits for their condition",
          "ingredients": [
            { "name": "Oats", "teluguName": "ఓట్స్", "tamilName": "", "quantity": "1 cup" }
          ]
        }
      ]
    }
  ],
  "warnings": ["Any health warnings or cautions"]
}`;

    try {
      const response = await this.llm.invoke([
        new SystemMessage('You are an expert nutritionist. Return only valid JSON, no markdown.'),
        new HumanMessage(prompt)
      ]);

      const rawContent = response.content as string;
      // Strip markdown code fences if present
      const jsonStr = rawContent.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
      const data = JSON.parse(jsonStr);

      // Deactivate old plans
      await this.mealPlanModel.updateMany({ userId, isActive: true } as any, { isActive: false });

      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + durationDays);

      const plan = await new this.mealPlanModel({
        userId,
        startDate,
        endDate,
        days: data.days,
        warnings: data.warnings || [],
        isActive: true
      }).save();

      // Embed each plan day for semantic retrieval in the agent
      for (const day of (data.days || [])) {
        const mealsText = (day.meals || []).map((m: any) => `${m.mealType}: ${m.title}`).join('; ');
        const chunkText = `Meal plan day ${day.dayNumber} (${day.date}): ${mealsText}`;
        this.agentService.embedAndStore(
          userId, `${plan._id}_day${day.dayNumber}`, 'MEAL_PLAN', chunkText, startDate.toISOString()
        );
      }

      return plan;
    } catch (err) {
      this.logger.error('Failed to generate meal plan', err);
      throw new Error('Meal plan generation failed');
    }
  }
}
