import { FastifyInstance, FastifyRequest } from 'fastify';
type WebSocket = import('@fastify/websocket').WebSocket;

// Verify JWT from Authorization header or ?token= query param.
// Browser WebSocket API cannot set headers, so query param is required for WS clients.
async function verifyWsUser(req: FastifyRequest): Promise<{ id: string } | null> {
  try {
    await req.jwtVerify();
    return req.user as { id: string };
  } catch { /* fall through to query param */ }

  const token = (req.query as { token?: string }).token;
  if (!token) return null;
  try {
    return req.server.jwt.verify<{ id: string }>(token);
  } catch { return null; }
}

export default async function realtimeRoutes(app: FastifyInstance) {
  // WS /ws/signals — public live signal stream (no auth required)
  app.get('/ws/signals', { websocket: true }, (socket: WebSocket) => {
    const sub = app.redis.duplicate();
    sub.subscribe('social:raw_signal', 'market:token_data');
    sub.on('message', (_channel, message) => {
      if (socket.readyState === socket.OPEN) socket.send(message);
    });
    socket.on('close', () => { sub.quit(); });
  });

  // WS /ws/alerts — authenticated: trade:executed + user-specific alerts
  app.get('/ws/alerts', { websocket: true }, async (socket: WebSocket, req) => {
    const user = await verifyWsUser(req);
    if (!user) return socket.close(1008, 'Unauthorized');

    const sub = app.redis.duplicate();
    // trade:executed is global — filter by userId when forwarding
    await sub.subscribe('trade:executed', `alerts:${user.id}`);
    sub.on('message', (channel, message) => {
      if (socket.readyState !== socket.OPEN) return;
      if (channel === 'trade:executed') {
        try {
          const trade = JSON.parse(message) as { userId?: string };
          // Forward only trades belonging to this user
          if (trade.userId !== user.id) return;
        } catch { return; }
      }
      socket.send(message);
    });
    socket.on('close', () => { sub.quit(); });
  });

  // WS /ws/positions — authenticated: position count heartbeat every 30 s
  app.get('/ws/positions', { websocket: true }, async (socket: WebSocket, req) => {
    const user = await verifyWsUser(req);
    if (!user) return socket.close(1008, 'Unauthorized');

    const sendSnapshot = async () => {
      if (socket.readyState !== socket.OPEN) return;
      const mints = await app.redis.smembers(`positions:${user.id}`);
      socket.send(JSON.stringify({ type: 'positions_snapshot', count: mints.length, mints }));
    };

    await sendSnapshot();
    const interval = setInterval(() => { void sendSnapshot(); }, 30_000);
    socket.on('close', () => clearInterval(interval));
  });
}
