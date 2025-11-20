import { createContext, useContext, useState, type ReactNode } from 'react';

export type AuthUser = {
  userId: number;
  username: string;
  role: 'pending' | 'patient' | 'therapist' | 'admin';
  patientId: number | null;
  patientName?: string | null;
  needsProfileCompletion?: boolean;
  staffId?: number | null;
  therapistName?: string | null;
  needsPasswordReset?: boolean;
};

type AuthContextValue = {
  user: AuthUser | null;
  setUser: (user: AuthUser | null) => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  return <AuthContext.Provider value={{ user, setUser }}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
