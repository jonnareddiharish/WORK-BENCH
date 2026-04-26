import { Controller, Get, Post, Delete, Body, Param } from '@nestjs/common';
import { RecipeService } from './recipe.service';

@Controller('api/users/:userId/recipes')
export class RecipeController {
  constructor(private readonly recipeService: RecipeService) {}

  @Get()
  getAll(@Param('userId') userId: string) {
    return this.recipeService.getAll(userId);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.recipeService.getById(id);
  }

  @Post()
  create(@Param('userId') userId: string, @Body() body: any) {
    return this.recipeService.create(userId, body);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.recipeService.delete(id);
  }
}
