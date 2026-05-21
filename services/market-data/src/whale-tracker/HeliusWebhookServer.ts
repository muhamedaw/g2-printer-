import http from 'node:http';
import { createLogger } from '@mpg2/shared';
import type { CopyTradeDetector } from './CopyTradeDetector.js';

const log = createLogger('helius-webhook-server');

export function startHeliusWebhookServer(
  detector: CopyTradeDetector,
  port = 3003,
): http.Server {
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/api/helius/webhook') {
      res.writeHead(404).end();
      return;
    }

    const chunks: Buffer[] = [];
    req.on('data', chunk => chunks.push(chunk as Buffer));
    req.on('end', () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString()) as unknown[];
        void detector.processWebhookPayload(body as Parameters<typeof detector.processWebhookPayload>[0])
          .then(() => res.writeHead(200).end('ok'))
          .catch(err => {
            log.warn({ err }, 'Webhook processing error');
            res.writeHead(200).end('ok'); // always 200 to Helius
          });
      } catch {
        res.writeHead(400).end();
      }
    });
  });

  server.listen(port, () => log.info({ port }, 'Helius webhook server listening'));
  return server;
}
