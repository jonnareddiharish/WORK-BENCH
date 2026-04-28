import { Controller, Get, Param } from '@nestjs/common';
import { ChatModelService } from './chat-model.service';

@Controller('chat-model')
export class ChatModelController {
  constructor(private readonly chatModelService: ChatModelService) {}

  @Get(':userId/sessions')
  getSessions(@Param('userId') userId: string): Promise<unknown[]> {
    return this.chatModelService.getSessions(userId);
  }

  @Get(':userId/sessions/:sessionId')
  getSession(@Param('sessionId') sessionId: string): Promise<unknown | null> {
    return this.chatModelService.getSession(sessionId);
  }

  @Get(':userId/sessions/:sessionId/messages')
  getMessages(@Param('sessionId') sessionId: string): Promise<unknown[]> {
    return this.chatModelService.getMessages(sessionId);
  }
}
