import { create } from 'zustand';
import { persist } from 'zustand/middleware';
export const useAuthStore = create()(persist(set => ({
    token: null,
    userId: null,
    email: null,
    plan: null,
    setAuth: (token, userId, email, plan) => set({ token, userId, email, plan }),
    logout: () => set({ token: null, userId: null, email: null, plan: null }),
}), { name: 'mpg2-auth' }));
