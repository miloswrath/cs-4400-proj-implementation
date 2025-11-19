import type { ReactElement } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';
import Home from './pages/Home';
import Onboarding from './pages/Onboarding';
import PatientHome from './pages/PatientHome';
import { AuthProvider, useAuth, type AuthUser } from './context/AuthContext';

type RequireRoleProps = {
  allowed: AuthUser['role'][];
  children: ReactElement;
};

const RequireRole = ({ allowed, children }: RequireRoleProps) => {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (!allowed.includes(user.role)) {
    if (user.role === 'pending') {
      return <Navigate to="/onboarding" replace />;
    }
    if (user.role === 'patient') {
      return <Navigate to="/patient" replace />;
    }
    return <Navigate to="/" replace />;
  }

  return children;
};

const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<Home />} />
    <Route
      path="/onboarding"
      element={
        <RequireRole allowed={['pending']}>
          <Onboarding />
        </RequireRole>
      }
    />
    <Route
      path="/patient"
      element={
        <RequireRole allowed={['patient']}>
          <PatientHome />
        </RequireRole>
      }
    />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);

const App = () => (
  <AuthProvider>
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  </AuthProvider>
);

export default App;
