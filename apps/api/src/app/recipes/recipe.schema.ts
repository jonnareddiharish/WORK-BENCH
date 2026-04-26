import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type RecipeDocument = Recipe & Document;

@Schema({ timestamps: true })
export class Recipe {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  userId?: MongooseSchema.Types.ObjectId; // Optional if global recipe

  @Prop({ required: true })
  title: string;

  @Prop()
  description: string;

  @Prop([String])
  instructions: string[];

  @Prop([Object])
  ingredients: {
    name: string;
    teluguName?: string;
    tamilName?: string;
    quantity: string;
  }[];

  @Prop()
  youtubeLink?: string;

  @Prop({ default: 'USER' })
  source: string; // USER, AI

  @Prop({ type: Object })
  nutritionalInfo?: {
    calories?: number;
    protein?: string;
    carbs?: string;
    fats?: string;
  };
}

export const RecipeSchema = SchemaFactory.createForClass(Recipe);
