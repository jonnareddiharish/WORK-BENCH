import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
} from '@nestjs/common';
import { UserService } from './user.service';
import { User } from './user.schema';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  async create(@Body() userData: any) {
    return this.userService.create(userData);
  }

  @Get()
  async findAll() {
    return this.userService.findAll();
  }

  @Get('graph')
  async getGraph() {
    return this.userService.getFamilyGraph();
  }

  @Post('link')
  async linkUsers(@Body() linkData: { sourceId: string; targetId: string; relationship: string }) {
    return this.userService.linkUsers(linkData.sourceId, linkData.targetId, linkData.relationship);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.userService.findOne(id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() userData: Partial<User>) {
    return this.userService.update(id, userData);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.userService.delete(id);
  }

  @Post(':id/health-events')
  async addHealthEvent(@Param('id') id: string, @Body() eventData: any) {
    return this.userService.addHealthEvent(id, eventData);
  }

  @Put(':id/health-events/:eventId')
  async updateHealthEvent(@Param('eventId') eventId: string, @Body() updateData: any) {
    return this.userService.updateHealthEvent(eventId, updateData);
  }

  @Delete(':id/health-events/:eventId')
  async deleteHealthEvent(@Param('eventId') eventId: string) {
    return this.userService.deleteHealthEvent(eventId);
  }

  @Get(':id/health-events')
  async getHealthEvents(@Param('id') id: string) {
    return this.userService.getHealthEvents(id);
  }

  @Get(':id/diet-logs')
  async getDietLogs(@Param('id') id: string) {
    return this.userService.getDietLogs(id);
  }

  @Post(':id/diet-logs')
  async addDietLog(@Param('id') id: string, @Body() logData: any) {
    return this.userService.addDietLog(id, logData);
  }

  @Put(':id/diet-logs/:logId')
  async updateDietLog(@Param('logId') logId: string, @Body() updateData: any) {
    return this.userService.updateDietLog(logId, updateData);
  }

  @Delete(':id/diet-logs/:logId')
  async deleteDietLog(@Param('logId') logId: string) {
    return this.userService.deleteDietLog(logId);
  }

  // Lifestyle Endpoints
  @Get(':id/lifestyle')
  async getLifestyle(@Param('id') id: string) {
    return this.userService.getLifestyle(id);
  }

  @Post(':id/lifestyle')
  async addLifestyle(@Param('id') id: string, @Body() data: any) {
    return this.userService.addLifestyle(id, data);
  }

  @Put(':id/lifestyle/:lifestyleId')
  async updateLifestyle(@Param('lifestyleId') lifestyleId: string, @Body() data: any) {
    return this.userService.updateLifestyle(lifestyleId, data);
  }

  @Delete(':id/lifestyle/:lifestyleId')
  async deleteLifestyle(@Param('lifestyleId') lifestyleId: string) {
    return this.userService.deleteLifestyle(lifestyleId);
  }

  @Get(':id/insights')
  async getInsights(@Param('id') id: string) {
    return this.userService.generateInsights(id);
  }
}