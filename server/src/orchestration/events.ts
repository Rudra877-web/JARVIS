import { EventEmitter } from 'node:events';

export interface ExecutionEvent {
  id: string;
  executionId: string;
  userId: string;
  seq: number;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

/** In-process pub/sub. Replace with Redis pub/sub to scale horizontally (see README). */
export class EventBus {
  private ee = new EventEmitter();
  constructor() { this.ee.setMaxListeners(100); }
  publish(e: ExecutionEvent) { this.ee.emit('event', e); }
  subscribe(fn: (e: ExecutionEvent) => void) { this.ee.on('event', fn); return () => this.ee.off('event', fn); }
}
