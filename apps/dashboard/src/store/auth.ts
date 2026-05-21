import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  token: string | null;
  userId: string | null;
  email: string | null;
  plan: string | null;
  setAuth: (token: string, userId: string, email: string, plan: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    set => ({
      token:   null,
      userId:  null,
      email:   null,
      plan:    null,
      setAuth: (token, userId, email, plan) => set({ token, userId, email, plan }),
      logout:  () => set({ token: null, userId: null, email: null, plan: null }),
    }),
    { name: 'mpg2-auth' },
  ),
);
