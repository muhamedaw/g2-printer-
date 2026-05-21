import { useAuthStore } from '../store/auth.js';
const BASE = '/api';
async function request(path, init) {
    const token = useAuthStore.getState().token;
    const res = await fetch(`${BASE}${path}`, {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...init?.headers,
        },
    });
    if (!res.ok) {
        if (res.status === 401) {
            // Token expired or invalid — clear auth and redirect to login
            const { logout } = useAuthStore.getState();
            logout();
            window.location.href = '/login';
        }
        const body = await res.text().catch(() => '');
        throw new Error(`${res.status}: ${body}`);
    }
    const json = (await res.json());
    // Unwrap the standard {data, error} envelope used by all API routes
    if (json !== null &&
        typeof json === 'object' &&
        'data' in json &&
        'error' in json) {
        return json.data;
    }
    return json;
}
export const api = {
    get: (path) => request(path),
    post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
    put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (path) => request(path, { method: 'DELETE' }),
};
