import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  NotFoundException,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Res,
  Logger,
  Put,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { AgentService, AVAILABLE_MODELS, DEFAULT_MODEL } from './agent.service';
import { UserService } from '../users/user.service';
import { HumanMessage, AIMessage } from '@langchain/core/messages';

interface UploadedFileObj {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

const ACCEPTED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
]);

@Controller('agent')
export class AgentController {
  private readonly logger = new Logger(AgentController.name);

  constructor(
    private readonly agentService: AgentService,
    private readonly userService: UserService
  ) {}

  @Get('models')
  getModels() {
    return AVAILABLE_MODELS;
  }

  @Post(':userId/chat')
  async chat(
    @Param('userId') userId: string,
    @Body() body: { message: string; history: any[]; model?: string }
  ) {
    const user = await this.userService.findOne(userId);
    if (!user) throw new NotFoundException('User not found');

    const history = (body.history || []).map(m =>
      m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content)
    );

    return this.agentService.chat(userId, user, body.message, history, body.model || DEFAULT_MODEL);
  }

  @Post(':userId/chat/stream')
  async chatStream(
    @Param('userId') userId: string,
    @Body() body: { message: string; history: any[]; model?: string },
    @Res() res: Response
  ) {
    const user = await this.userService.findOne(userId);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const history = (body.history || []).map((m: any) =>
      m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content)
    );

    const modelId = body.model || DEFAULT_MODEL;

    const sendEvent = (event: string, data: unknown) => {
      if (res.writableEnded) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      await this.agentService.chatStream(userId, user, body.message, history, sendEvent, modelId);
    } catch (err: any) {
      this.logger.error('chatStream failed', err?.stack ?? err?.message ?? err);
      sendEvent('error', { message: err?.message ?? 'An error occurred while processing your request.' });
    } finally {
      if (!res.writableEnded) res.end();
    }
  }

  @Post(':userId/reanalyze')
  async reanalyzeEvent(
    @Param('userId') userId: string,
    @Body() body: { oldEvent: any; newEvent: any; model?: string }
  ) {
    const user = await this.userService.findOne(userId);
    if (!user) throw new NotFoundException('User not found');
    return this.agentService.reanalyzeEventChanges(
      userId, body.oldEvent, body.newEvent, body.model || DEFAULT_MODEL
    );
  }

  @Post(':userId/chat-with-file')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } })
  )
  async chatWithFile(
    @Param('userId') userId: string,
    @UploadedFile() file: UploadedFileObj,
    @Body() body: { message?: string; history?: string; model?: string }
  ) {
    const user = await this.userService.findOne(userId);
    if (!user) throw new NotFoundException('User not found');

    if (!file) throw new BadRequestException('No file provided');
    if (!ACCEPTED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type "${file.mimetype}". Accepted: JPEG, PNG, WEBP, GIF, PDF.`
      );
    }

    const modelId = body.model || DEFAULT_MODEL;

    const history = body.history
      ? JSON.parse(body.history).map((m: any) =>
          m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content)
        )
      : [];

    const fileContent = await this.agentService.extractFileContent(
      file.buffer,
      file.mimetype,
      modelId
    );

    const fileTypeLabel = file.mimetype.startsWith('image/') ? 'image' : 'PDF';
    const combined = [
      body.message?.trim(),
      `[Content extracted from uploaded ${fileTypeLabel} — "${file.originalname}"]:\n${fileContent}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    return this.agentService.chat(userId, user, combined, history, modelId);
  }
}
