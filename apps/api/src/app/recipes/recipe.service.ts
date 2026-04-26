import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Recipe, RecipeDocument } from './recipe.schema';

@Injectable()
export class RecipeService {
  private readonly logger = new Logger(RecipeService.name);

  constructor(@InjectModel(Recipe.name) private recipeModel: Model<RecipeDocument>) {}

  async getAll(userId: string) {
    return this.recipeModel.find({ userId } as any).sort({ createdAt: -1 });
  }

  async getById(id: string) {
    return this.recipeModel.findById(id);
  }

  async create(userId: string, body: Partial<Recipe>) {
    return new this.recipeModel({ ...body, userId, source: 'USER' }).save();
  }

  async delete(id: string) {
    return this.recipeModel.findByIdAndDelete(id);
  }
}
