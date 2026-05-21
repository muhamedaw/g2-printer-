import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/auth.js';

export function useTradeSocket(): void {
  const token  = useAuthStore(s => s.token);
  const qc     = useQueryClient();
  const wsRef  = useRef<WebSocket | null>(null);
  const stopRef = useRef(false);

  useEffect(() => {
    if (!token) return;
    stopRef.current = false;

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url   = `${proto}//${window.location.host}/ws/alerts?token=${token}`;

    const connect = () => {
      if (stopRef.current) return;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data as string) as Record<string, unknown>;
          if (!data['tradeType']) return;
          // Invalidate affected queries on every trade event
          void qc.invalidateQueries({ queryKey: ['recent-trades'] });
          void qc.invalidateQueries({ queryKey: ['portfolio-summary'] });
          void qc.invalidateQueries({ queryKey: ['trades-by-source'] });
          // Invalidate positions on any trade (BUY opens, SELL closes)
          void qc.invalidateQueries({ queryKey: ['positions'] });
        } catch { /* ignore malformed */ }
      };

      ws.onclose = () => {
        if (!stopRef.current) setTimeout(connect, 3_000);
      };

      ws.onerror = () => ws.close();
    };

    connect();

    return () => {
      stopRef.current = true;
      wsRef.current?.close();
    };
  }, [token, qc]);
}
