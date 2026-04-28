import { Controller, Post, Get, Param, Body, Sse, MessageEvent, Logger } from '@nestjs/common';
import { map } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { z } from 'zod';
import { WorkflowEventSchema } from '@work-bench/types';
import { ChatService } from './chat.service';
import { MongoChatService } from '../mongo/mongo-chat.service';
import { CamundaService } from '../camunda/camunda.service';

const StartChatBodySchema = z.object({
  message:      z.string().min(1),
  inputType:    z.enum(['TEXT', 'IMAGE', 'PDF', 'VOICE']).default('TEXT'),
  fileBase64:   z.string().optional(),
  fileMimeType: z.string().optional(),
  modelId:      z.string().optional(),
});

@Controller('stream')
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly mongoChatService: MongoChatService,
    private readonly camundaService: CamundaService,
  ) {}

  @Post(':userId/chat')
  async startChat(
    @Param('userId') userId: string,
    @Body() rawBody: unknown,
  ): Promise<{ sessionId: string; processInstanceId: string | null }> {
    this.logger.log(`Received startChat request for user ${userId} with body: ${JSON.stringify(rawBody)}`);
    const body = StartChatBodySchema.parse(rawBody);

    const sessionId = await this.mongoChatService.createSession(userId, body.inputType);
    this.logger.debug(`Created chat session ${sessionId} for user ${userId}`);
    await this.mongoChatService.saveMessage(sessionId, userId, 'USER', body.message, 1);
    this.logger.debug(`Saved initial user message for session ${sessionId}`);

    this.chatService.getOrCreate(sessionId);
    this.logger.debug(`Retrieved or created chat service for session ${sessionId}`);

    const variables: Record<string, unknown> = {
      sessionId,
      userId,
      modelId: body.modelId,
      userMessage:  body.message,
      inputType:    body.inputType,
    };
    if (body.fileBase64)   variables['fileBase64']   = body.fileBase64;
    if (body.fileMimeType) variables['fileMimeType'] = body.fileMimeType;

    let processInstanceId: string | null = null;
    try {
      const result = await this.camundaService.startProcess('chat-input-processor', variables);
      processInstanceId = result.id || null;
      if (processInstanceId) {
        await this.mongoChatService.updateSessionProcess(sessionId, processInstanceId);
      }
      this.logger.debug(`Started Camunda process ${processInstanceId} for session ${sessionId}`);
    } catch (err: unknown) {
      this.logger.warn('Camunda process start failed (continuing without it):', (err as Error).message);
    }

    await this.mongoChatService.setSessionStatus(sessionId, 'ACTIVE');
    return { sessionId, processInstanceId };
  }

  @Sse(':sessionId/sse')
  streamSession(@Param('sessionId') sessionId: string): Observable<MessageEvent> {
    const events$ = this.chatService.getOrCreate(sessionId);
    return events$.pipe(
      map((event) => ({
        type: event.type,
        data: JSON.stringify(event),
      } as MessageEvent)),
    );
  }
}
