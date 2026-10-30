import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../errors.js';
import type { RouteCtx } from '../app.js';
import { hashPassword, verifyPassword } from '../password.js';

const Register = z.object({ email: z.email().max(200), name: z.string().trim().min(1).max(80), password: z.string().min(10).max(200) });
const Login = z.object({ email: z.email(), password: z.string().min(1).max(200) });
const publicUser = (u: { id: string; email: string; name: string }) => ({ id: u.id, email: u.email, name: u.name });

export async function authRoutes(api: FastifyInstance, { app, store, config }: RouteCtx) {
  const limited = { config: { rateLimit: { max: config.AUTH_RATE_LIMIT_MAX, timeWindow: '1 minute' } } };

  api.post('/auth/register', limited, async (req, reply) => {
    const body = Register.parse(req.body);
    if (await store.getUserByEmail(body.email)) throw AppError.conflict('Email already registered');
    const user = await store.createUser({ email: body.email, name: body.name, passwordHash: await hashPassword(body.password) });
    return reply.status(201).send({ token: app.jwt.sign({ sub: user.id, email: user.email }), user: publicUser(user) });
  });

  api.post('/auth/login', limited, async (req) => {
    const body = Login.parse(req.body);
    const user = await store.getUserByEmail(body.email);
    // Same error + a hash computation for unknown emails to blunt user enumeration / timing.
    const ok = user ? await verifyPassword(body.password, user.passwordHash) : (await verifyPassword(body.password, 'scrypt$00$00'), false);
    if (!user || !ok) throw AppError.unauthorized('Invalid email or password');
    return { token: app.jwt.sign({ sub: user.id, email: user.email }), user: publicUser(user) };
  });

  api.get('/auth/me', { onRequest: [app.authenticate] }, async (req) => {
    const user = await store.getUserById(req.user.sub);
    if (!user) throw AppError.unauthorized();
    return { user: publicUser(user) };
  });
}
