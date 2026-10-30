import { Server } from 'socket.io';
import { z } from 'zod';
/**
 * Real-time layer. Security model:
 *  - the JWT is verified in the handshake (no anonymous sockets)
 *  - sockets auto-join only `user:<their id>`
 *  - `execution:<id>` rooms are joined solely through `subscribe`, which re-checks ownership in the database
 */
export function attachSocket(app, deps) {
    const io = new Server(app.server, {
        path: '/socket.io',
        cors: { origin: deps.config.CORS_ORIGIN.split(',').map((s) => s.trim()), credentials: true },
    });
    io.use((socket, next) => {
        try {
            const token = typeof socket.handshake.auth?.token === 'string' ? socket.handshake.auth.token : '';
            const payload = app.jwt.verify(token);
            socket.data.userId = payload.sub;
            next();
        }
        catch {
            next(new Error('unauthorized'));
        }
    });
    io.on('connection', (socket) => {
        const userId = socket.data.userId;
        void socket.join(`user:${userId}`);
        socket.on('subscribe', async (payload, ack) => {
            const parsed = z.object({ executionId: z.uuid() }).safeParse(payload);
            const reply = (r) => { if (typeof ack === 'function')
                ack(r); };
            if (!parsed.success)
                return reply({ ok: false, error: 'invalid_payload' });
            const exec = await deps.store.getExecutionForUser(parsed.data.executionId, userId).catch(() => undefined);
            if (!exec)
                return reply({ ok: false, error: 'not_found' }); // same answer for "missing" and "not yours"
            await socket.join(`execution:${exec.id}`);
            reply({ ok: true });
        });
        socket.on('unsubscribe', (payload) => {
            const parsed = z.object({ executionId: z.uuid() }).safeParse(payload);
            if (parsed.success)
                void socket.leave(`execution:${parsed.data.executionId}`);
        });
    });
    const off = deps.bus.subscribe((e) => {
        const { userId, ...publicEvent } = e;
        io.to(`execution:${e.executionId}`).emit('execution:event', publicEvent);
        if (e.type.startsWith('execution.') || e.type.startsWith('approval.') || e.type === 'plan.ready')
            io.to(`user:${userId}`).emit('execution:event', publicEvent);
    });
    app.addHook('onClose', async () => { off(); await io.close(); });
    return io;
}
