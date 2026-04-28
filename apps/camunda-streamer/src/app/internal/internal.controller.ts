import {
  Controller, Post, Param, Body, Headers,
  HttpCode, UnauthorizedException, Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { WorkflowEventSchema } from '@work-bench/types';
import { ChatService } from '../chat/chat.service';
import { MongoChatService } from '../mongo/mongo-chat.service';

const InternalEventBodySchema = WorkflowEventSchema.extend({
  userId: z.string().optional(),
});

@Controller('internal')
export class InternalController {
  private readonly logger = new Logger(InternalController.name);
  private readonly secret: string;

  constructor(
    private readonly chatService: ChatService,
    private readonly mongoChatService: MongoChatService,
    cfg: ConfigService,
  ) {
    this.secret = cfg.get<string>('INTERNAL_AUTH_HEADER', '');
  }

  @Post('sessions/:sessionId/event')
  @HttpCode(204)
  async pushEvent(
    @Param('sessionId') sessionId: string,
    @Headers('x-internal-secret') incomingSecret: string,
    @Body() rawBody: unknown,
  ): Promise<void> {
    if (this.secret && incomingSecret !== this.secret) {
      throw new UnauthorizedException('Invalid internal secret');
    }

    const event = InternalEventBodySchema.parse(rawBody);
    this.chatService.emit(sessionId, event);

    if (event.type === 'done') {
      const body = rawBody as Record<string, unknown>;
      const content = event.content ?? '';
      const userId  = (body['userId'] as string) ?? '';
      if (content && userId) {
        const seq = await this.mongoChatService.getNextSequence(sessionId);
        await this.mongoChatService.saveMessage(
          sessionId, userId, 'ASSISTANT', content, seq,
          event.intent ? { intent: event.intent } : undefined,
        );
      }
      await this.mongoChatService.setSessionStatus(sessionId, 'COMPLETED');
      this.chatService.close(sessionId);
    }

    if (event.type === 'error') {
      await this.mongoChatService.setSessionStatus(sessionId, 'FAILED');
      this.chatService.close(sessionId);
    }
  }
}
