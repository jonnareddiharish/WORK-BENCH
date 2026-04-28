import { Injectable } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { WorkflowEvent } from '@work-bench/types';

@Injectable()
export class ChatService {
  private readonly sessions = new Map<string, Subject<WorkflowEvent>>();
  private readonly timers   = new Map<string, ReturnType<typeof setTimeout>>();

  private readonly TTL_MS = 10 * 60 * 1000;

  getOrCreate(sessionId: string): Observable<WorkflowEvent> {
    if (!this.sessions.has(sessionId)) {
      const subject = new Subject<WorkflowEvent>();
      this.sessions.set(sessionId, subject);
      const timer = setTimeout(() => this.close(sessionId), this.TTL_MS);
      this.timers.set(sessionId, timer);
    }
    return this.sessions.get(sessionId)!.asObservable();
  }

  emit(sessionId: string, event: WorkflowEvent): void {
    this.sessions.get(sessionId)?.next(event);
  }

  close(sessionId: string): void {
    const subject = this.sessions.get(sessionId);
    if (subject) {
      subject.complete();
      this.sessions.delete(sessionId);
    }
    const timer = this.timers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(sessionId);
    }
  }
}
