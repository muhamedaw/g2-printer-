import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../lib/api.js';

interface SubData {
  planTier: string;
  limits: {
    maxPositions:  number;
    liveTrading:   boolean;
    apiAccess:     boolean;
    signalDelay:   number;
    copyTrading:   boolean;
  };
  subscription: {
    status:            string;
    currentPeriodEnd:  string;
  } | null;
}

const PLANS = [
  {
    id:    'starter',
    name:  'Starter',
    price: '$49/mo',
    features: ['5 open positions', 'Live trading', 'Copy trading', 'No signal delay'],
  },
  {
    id:    'pro',
    name:  'Pro',
    price: '$149/mo',
    features: ['10 open positions', 'Live trading', 'Copy trading', 'API access', 'No signal delay'],
  },
  {
    id:    'whale',
    name:  'Whale',
    price: '$499/mo',
    features: ['Unlimited positions', 'Live trading', 'Copy trading', 'API access', 'Priority support'],
  },
] as const;

const TIER_ORDER = ['free', 'starter', 'pro', 'whale'];

export default function Subscription() {
  const { data, isLoading } = useQuery({
    queryKey: ['subscription'],
    queryFn:  () => api.get<SubData>('/subscription'),
  });

  const checkout = useMutation({
    mutationFn: (plan: string) => api.post<{ url: string }>('/subscription/checkout', { plan }),
    onSuccess: ({ url }) => { if (url) window.location.href = url; },
  });

  if (isLoading) return <p className="text-gray-400">Loading…</p>;

  const current  = data?.planTier ?? 'free';
  const sub      = data?.subscription;
  const currentIdx = TIER_ORDER.indexOf(current);

  return (
    <div className="space-y-6 max-w-3xl">
      <h2 className="text-xl font-bold">Subscription</h2>

      {/* Current plan banner */}
      <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400">Current plan</p>
          <p className="text-lg font-bold capitalize">{current}</p>
          {sub && (
            <p className="text-xs text-gray-500 mt-0.5">
              {sub.status === 'active' ? 'Renews' : sub.status} {new Date(sub.currentPeriodEnd).toLocaleDateString()}
            </p>
          )}
        </div>
        <div className="text-right text-xs text-gray-400 space-y-1">
          <p>Max positions: <span className="text-white">{data?.limits.maxPositions === 999 ? '∞' : data?.limits.maxPositions ?? 3}</span></p>
          <p>Live trading:  <span className={data?.limits.liveTrading ? 'text-brand-400' : 'text-gray-500'}>{data?.limits.liveTrading ? 'Yes' : 'No'}</span></p>
          <p>API access:    <span className={data?.limits.apiAccess    ? 'text-brand-400' : 'text-gray-500'}>{data?.limits.apiAccess    ? 'Yes' : 'No'}</span></p>
        </div>
      </div>

      {/* Plan cards */}
      {current === 'whale' ? (
        <p className="text-gray-400 text-sm">You are on the highest plan.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLANS.map(plan => {
            const planIdx   = TIER_ORDER.indexOf(plan.id);
            const isCurrent = plan.id === current;
            const isUpgrade = planIdx > currentIdx;

            return (
              <div
                key={plan.id}
                className={`bg-gray-900 rounded-xl p-5 border flex flex-col gap-3 ${
                  isCurrent ? 'border-brand-600' : 'border-gray-800'
                }`}
              >
                <div>
                  <p className="font-semibold">{plan.name}</p>
                  <p className="text-brand-400 text-lg font-bold">{plan.price}</p>
                </div>
                <ul className="space-y-1 flex-1">
                  {plan.features.map(f => (
                    <li key={f} className="text-xs text-gray-300 flex items-center gap-1.5">
                      <span className="text-brand-500">✓</span>{f}
                    </li>
                  ))}
                </ul>
                {isCurrent ? (
                  <span className="text-center text-xs text-gray-500 py-1.5">Current plan</span>
                ) : isUpgrade ? (
                  <button
                    onClick={() => checkout.mutate(plan.id)}
                    disabled={checkout.isPending}
                    className="py-1.5 rounded-lg text-xs font-medium bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white transition-colors"
                  >
                    {checkout.isPending ? 'Redirecting…' : `Upgrade to ${plan.name}`}
                  </button>
                ) : (
                  <span className="text-center text-xs text-gray-600 py-1.5">Downgrade via billing portal</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
