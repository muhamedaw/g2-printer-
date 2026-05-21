export const PLAN_LIMITS = {
    free: { maxPositions: 3, liveTrading: false, apiAccess: false, signalDelay: 600, copyTrading: false },
    starter: { maxPositions: 5, liveTrading: true, apiAccess: false, signalDelay: 0, copyTrading: true },
    pro: { maxPositions: 10, liveTrading: true, apiAccess: true, signalDelay: 0, copyTrading: true },
    whale: { maxPositions: 999, liveTrading: true, apiAccess: true, signalDelay: 0, copyTrading: true },
};
