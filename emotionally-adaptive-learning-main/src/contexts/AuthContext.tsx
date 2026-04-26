import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiUrl } from '@/config';

interface User {
  id: string;
  email: string;
  displayName?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Load user on startup if token exists
  useEffect(() => {
    const checkUser = async () => {
      const token = localStorage.getItem('moodlearn_token');
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(apiUrl('/api/auth/me'), {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setUser(data);
        } else {
          localStorage.removeItem('moodlearn_token');
        }
      } catch (err) {
        console.error('Auth check failed:', err);
      } finally {
        setLoading(false);
      }
    };

    checkUser();
  }, []);

  const signUp = async (email: string, password: string, displayName?: string) => {
    try {
      const res = await fetch(apiUrl('/api/auth/signup'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, displayName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Signup failed');
      
      localStorage.setItem('moodlearn_token', data.access_token);
      setUser(data.user);
      return { error: null };
    } catch (error: any) {
      return { error };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const res = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Login failed');

      localStorage.setItem('moodlearn_token', data.access_token);
      setUser(data.user);
      return { error: null };
    } catch (error: any) {
      return { error };
    }
  };

  const signOut = async () => {
    localStorage.removeItem('moodlearn_token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}


