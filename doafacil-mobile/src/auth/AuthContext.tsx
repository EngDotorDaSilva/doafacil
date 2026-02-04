import * as SecureStore from 'expo-secure-store';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { api, setAuthToken } from '../api/client';
import { registerPushTokenIfPossible } from '../push/registerPush';
import type { CenterProfile, User, UserRole } from './types';

type RegisterDonorInput = {
  role: 'donor';
  name: string;
  email: string;
  password: string;
  phone?: string;
  avatarUrl?: string;
  lat?: number;
  lng?: number;
};

type RegisterCenterInput = {
  role: 'center';
  name: string;
  email: string;
  password: string;
  phone?: string;
  avatarUrl?: string;
  lat?: number;
  lng?: number;
  center: {
    displayName: string;
    address: string;
    lat?: number;
    lng?: number;
    hours?: string;
    acceptedItemTypes: string[];
  };
};

type AuthState = {
  isLoading: boolean;
  token: string | null;
  user: User | null;
  center: CenterProfile | null;
};

type AuthContextValue = AuthState & {
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterDonorInput | RegisterCenterInput) => Promise<void>;
  refreshMe: () => Promise<void>;
  logout: () => Promise<void>;
  isRole: (...roles: UserRole[]) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = 'doafacil_token_v1';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [center, setCenter] = useState<CenterProfile | null>(null);
  const tokenRef = useRef<string | null>(null);
  const handlingRef = useRef(false);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(TOKEN_KEY);
        if (stored) {
          setAuthToken(stored);
          setToken(stored);
          await refreshMeInner();
        }
      } finally {
        setIsLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshMeInner() {
    const resp = await api.get('/me');
    setUser(resp.data.user);
    setCenter(resp.data.center);
  }

  async function login(email: string, password: string) {
    const resp = await api.post('/auth/login', { email, password });
    const nextToken = resp.data.token as string;
    await SecureStore.setItemAsync(TOKEN_KEY, nextToken);
    setAuthToken(nextToken);
    setToken(nextToken);
    await refreshMeInner();
  }

  async function register(input: RegisterDonorInput | RegisterCenterInput) {
    const resp = await api.post('/auth/register', input);
    const nextToken = resp.data.token as string;
    await SecureStore.setItemAsync(TOKEN_KEY, nextToken);
    setAuthToken(nextToken);
    setToken(nextToken);
    await refreshMeInner();
  }

  async function refreshMe() {
    if (!token) return;
    await refreshMeInner();
  }

  const logout = useCallback(async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setAuthToken(null);
    setToken(null);
    setUser(null);
    setCenter(null);
  }, []);

  useEffect(() => {
    const id = api.interceptors.response.use(
      (resp) => resp,
      async (error) => {
        const status = error?.response?.status;
        const code = error?.response?.data?.error;
        const reason = error?.response?.data?.reason;

        // Only auto-logout when the user is already signed in; avoid double-alert on login screen.
        if (tokenRef.current && status === 403 && (code === 'UserBlocked' || code === 'UserDeleted')) {
          if (handlingRef.current) return Promise.reject(error);
          handlingRef.current = true;
          try {
            await logout();
            const title = code === 'UserBlocked' ? 'Conta bloqueada' : 'Conta removida';
            const msg = reason ? `${reason}` : 'Entre em contato com o administrador.';
            Alert.alert(title, msg);
          } finally {
            handlingRef.current = false;
          }
        }
        return Promise.reject(error);
      }
    );
    return () => api.interceptors.response.eject(id);
  }, [logout]);

  useEffect(() => {
    // Best-effort push token registration (dev build). Safe no-op on Expo Go.
    if (!token) return;
    registerPushTokenIfPossible().catch(() => {});
  }, [token]);

  function isRole(...roles: UserRole[]) {
    return !!user && roles.includes(user.role);
  }

  const value = useMemo<AuthContextValue>(
    () => ({ isLoading, token, user, center, login, register, refreshMe, logout, isRole }),
    [isLoading, token, user, center, login, register, refreshMe, logout, isRole]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

