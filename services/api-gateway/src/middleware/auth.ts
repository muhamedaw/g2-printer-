import { FastifyRequest, FastifyReply } from 'fastify';

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify();
  } catch {
    reply.status(401).send({ data: null, error: 'Unauthorized' });
  }
}

export async function optionalAuth(req: FastifyRequest) {
  try { await req.jwtVerify(); } catch { /* anonymous ok */ }
}
