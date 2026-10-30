import { EventEmitter } from 'node:events';
/** In-process pub/sub. Replace with Redis pub/sub to scale horizontally (see README). */
export class EventBus {
    ee = new EventEmitter();
    constructor() { this.ee.setMaxListeners(100); }
    publish(e) { this.ee.emit('event', e); }
    subscribe(fn) { this.ee.on('event', fn); return () => this.ee.off('event', fn); }
}
