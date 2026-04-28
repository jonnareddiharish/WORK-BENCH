import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import { WorkflowEvent } from '@work-bench/types';

@Injectable()
export class StreamerClientService {
  private readonly logger = new Logger(StreamerClientService.name);
  private readonly baseUrl: string;
  private readonly secret: string;

  constructor(
    private readonly http: HttpService,
    cfg: ConfigService,
  ) {
    this.baseUrl = cfg.get<string>('CAMUNDA_STREAMER_URL', 'http://localhost:3001');
    this.secret  = cfg.get<string>('INTERNAL_AUTH_HEADER', '');
  }

  async pushEvent(sessionId: string, event: WorkflowEvent & { userId?: string }): Promise<void> {
    const url = `${this.baseUrl}/internal/sessions/${sessionId}/event`;
    try {
      await lastValueFrom(
        this.http.post(url, event, {
          headers: { 'x-internal-secret': this.secret },
        }),
      );
    } catch (err: unknown) {
      this.logger.warn(`pushEvent failed for session ${sessionId}: ${(err as Error).message}`);
    }
  }

  async pushStep(
    sessionId: string,
    label: string,
    status: 'processing' | 'done' = 'processing',
  ): Promise<void> {
    return this.pushEvent(sessionId, { type: 'step', label, status });
  }
}
