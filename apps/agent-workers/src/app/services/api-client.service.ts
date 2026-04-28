import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class ApiClientService {
  private readonly logger = new Logger(ApiClientService.name);
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpService,
    cfg: ConfigService,
  ) {
    this.baseUrl = cfg.get<string>('API_BASE_URL', 'http://localhost:3000/api');
  }

  async get<T = unknown>(path: string): Promise<T> {
    const res = await lastValueFrom(
      this.http.get<T>(`${this.baseUrl}${path}`),
    );
    return res.data;
  }

  async post<T = unknown>(path: string, data: unknown): Promise<T> {
    const res = await lastValueFrom(
      this.http.post<T>(`${this.baseUrl}${path}`, data),
    );
    return res.data;
  }
}
