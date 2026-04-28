import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class CamundaService {
  private readonly logger = new Logger(CamundaService.name);
  private readonly baseUrl: string;
  private readonly authHeader: string | undefined;

  constructor(
    private readonly http: HttpService,
    private readonly cfg: ConfigService,
  ) {
    this.baseUrl = cfg.get<string>('CAMUNDA_URI', 'http://localhost:8085/engine-rest');
    const user = cfg.get<string>('CAMUNDA_USERNAME');
    const pass = cfg.get<string>('CAMUNDA_PASSWORD');
    if (user && pass) {
      this.authHeader = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
    }
  }

  async startProcess(processKey: string, variables: Record<string, unknown>): Promise<{ id: string }> {
    const url = `${this.baseUrl}/process-definition/key/${processKey}/start`;

    const body = {
      variables: Object.fromEntries(
        Object.entries(variables).map(([k, v]) => [
          k,
          { value: v, type: typeof v === 'number' ? 'Integer' : 'String' },
        ]),
      ),
    };

    const headers: Record<string, string> = {};
    if (this.authHeader) headers['Authorization'] = this.authHeader;

    try {
      const res = await lastValueFrom(
        this.http.post<{ id: string }>(url, body, { headers }),
      );
      return { id: res.data.id };
    } catch (err: unknown) {
      this.logger.warn(`Camunda startProcess failed: ${(err as Error).message}`);
      return { id: '' };
    }
  }
}
