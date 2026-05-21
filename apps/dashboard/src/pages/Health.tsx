import { useQuery } from '@tanstack/react-query';

interface ServiceStatus {
  name:    string;
  ok:      boolean;
  latency: number;
  detail?: string;
}

interface HealthData {
  status:   'ok' | 'degraded' | 'down';
  services: ServiceStatus[];
  ts:       string;
}

const SERVICE_LABELS: Record<string, string> = {
  redis:               '🗄️ Redis',
  db:                  '🐘 PostgreSQL',
  'market-data':       '📈 Market Data',
  'social-data':       '📡 Social Data',
  'ai-brain':          '🧠 AI Brain',
  'security-engine':   '🛡️ Security Engine',
  'risk-engine':       '⚖️ Risk Engine',
  'trade-engine':      '⚡ Trade Engine',
  'notification-engine': '🔔 Notifications',
};

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-block w-2.5 h-2.5 rounded-full ${ok ? 'bg-green-400' : 'bg-red-500'} animate-pulse`} />
  );
}

function StatusBadge({ status }: { status: HealthData['status'] }) {
  const cfg = {
    ok:       'bg-green-500/20 text-green-400 border-green-700',
    degraded: 'bg-yellow-500/20 text-yellow-400 border-yellow-700',
    down:     'bg-red-500/20 text-red-400 border-red-700',
  }[status];
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${cfg}`}>
      {status.toUpperCase()}
    </span>
  );
}

export default function Health() {
  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ['health-detailed'],
    queryFn:  async () => {
      const res = await fetch('/health/detailed');
      return res.json() as Promise<HealthData>;
    },
    refetchInterval: 30_000,
  });

  const services = data?.services ?? [];
  const upCount  = services.filter(s => s.ok).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold">System Health</h2>
        <div className="flex items-center gap-3">
          {data && <StatusBadge status={data.status} />}
          <span className="text-xs text-gray-500">
            {upCount}/{services.length} services up
          </span>
        </div>
      </div>

      {/* Last checked */}
      {dataUpdatedAt > 0 && (
        <p className="text-xs text-gray-500">
          Last checked: {new Date(dataUpdatedAt).toLocaleTimeString()} · refreshes every 30s
        </p>
      )}

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-gray-900 rounded-xl p-4 border border-gray-800 animate-pulse h-16" />
          ))}
        </div>
      )}

      {/* Infrastructure */}
      {!isLoading && (
        <div className="space-y-4">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Infrastructure</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {services.filter(s => s.name === 'redis' || s.name === 'db').map(s => (
              <ServiceCard key={s.name} s={s} />
            ))}
          </div>

          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mt-4">Workers</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {services.filter(s => s.name !== 'redis' && s.name !== 'db').map(s => (
              <ServiceCard key={s.name} s={s} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ServiceCard({ s }: { s: ServiceStatus }) {
  const label = SERVICE_LABELS[s.name] ?? s.name;
  return (
    <div className={`bg-gray-900 rounded-xl p-4 border ${s.ok ? 'border-gray-800' : 'border-red-800/60'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <StatusDot ok={s.ok} />
          <span className="text-sm font-medium">{label}</span>
        </div>
        <div className="text-right">
          <span className={`text-xs font-medium ${s.ok ? 'text-green-400' : 'text-red-400'}`}>
            {s.ok ? 'ONLINE' : 'OFFLINE'}
          </span>
          <p className="text-xs text-gray-500 mt-0.5">{s.latency}ms</p>
        </div>
      </div>
      {s.detail && (
        <p className="text-xs text-red-400 mt-2 font-mono">{s.detail}</p>
      )}
    </div>
  );
}
