import { create } from 'zustand';
import type { User } from '../types';

// SECURITY: Removed localStorage token storage - relies on httpOnly cookies only
// This prevents XSS attacks from stealing authentication tokens

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  login: (user: User) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  setUser: (user) => set({ user, isAuthenticated: !!user }),

  // SECURITY: Token is now managed by httpOnly cookies set by backend
  login: (user) => {
    set({ user, isAuthenticated: true, isLoading: false });
  },

  logout: () => {
    set({ user: null, isAuthenticated: false });
  },

  setLoading: (isLoading) => set({ isLoading }),
}));
