import { io, type Socket } from 'socket.io-client';
import { tokenStore } from './api';
import type { ExecEvent } from './types';

let socket: Socket | null = null;
export function getSocket(): Socket {
  if (!socket) socket = io({ path: '/socket.io', auth: (cb) => cb({ token: tokenStore.get() ?? '' }), transports: ['websocket', 'polling'] });
  return socket;
}
export function closeSocket() { socket?.close(); socket = null; }

/** Subscribe to one execution's private room. Server re-checks ownership; returns an unsubscribe fn. */
export function watchExecution(executionId: string, onEvent: (e: ExecEvent) => void, onReconnect: () => void) {
  const s = getSocket();
  const join = () => s.emit('subscribe', { executionId });
  const handler = (e: ExecEvent) => { if (e.executionId === executionId) onEvent(e); };
  const reconnect = () => { join(); onReconnect(); };
  s.on('execution:event', handler);
  s.on('connect', reconnect);
  if (s.connected) join();
  return () => { s.off('execution:event', handler); s.off('connect', reconnect); s.emit('unsubscribe', { executionId }); };
}
export function onUserEvents(fn: (e: ExecEvent) => void) {
  const s = getSocket();
  s.on('execution:event', fn);
  return () => { s.off('execution:event', fn); };
}
