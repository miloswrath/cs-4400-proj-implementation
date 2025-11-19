import { useState } from 'react';
import type { FormEvent, ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import './Login.css';
import { useAuth } from '../../context/AuthContext';

type LoginFields = {
  username: string;
  password: string;
};

type SignupFields = {
  username: string;
  name: string;
  dob: string;
  phone: string;
  password: string;
  confirmPassword: string;
};

type Feedback = {
  variant: 'success' | 'error';
  message: string;
} | null;

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

const Login = () => {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [loginFields, setLoginFields] = useState<LoginFields>({
    username: '',
    password: '',
  });

  const [signupFields, setSignupFields] = useState<SignupFields>({
    username: '',
    name: '',
    dob: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });

  const [loginFeedback, setLoginFeedback] = useState<Feedback>(null);
  const [signupFeedback, setSignupFeedback] = useState<Feedback>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [signupLoading, setSignupLoading] = useState(false);

  const handleLoginChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setLoginFields((current) => ({ ...current, [name]: value }));
  };

  const handleSignupChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setSignupFields((current) => ({ ...current, [name]: value }));
  };

  const parseErrorMessage = async (response: Response) => {
    try {
      const data = await response.json();
      if (data?.message) {
        return String(data.message);
      }
      if (Array.isArray(data?.errors) && data.errors.length > 0) {
        return data.errors.join(' ');
      }
      return response.statusText || 'Request failed.';
    } catch {
      return response.statusText || 'Request failed.';
    }
  };

  const handleLoginSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!loginFields.username || !loginFields.password) {
      setLoginFeedback({ variant: 'error', message: 'Please enter both your username and password to sign in.' });
      return;
    }

    setLoginLoading(true);
    setLoginFeedback(null);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username: loginFields.username, password: loginFields.password }),
      });

      if (!response.ok) {
        const message = await parseErrorMessage(response);
        throw new Error(message);
      }

      const data = await response.json();
      setUser({
        userId: data.userId,
        username: data.username,
        role: data.role,
        patientId: data.patientId ?? null,
        patientName: data.patientName ?? null,
        needsProfileCompletion: data.needsProfileCompletion ?? false,
      });

      if (data.role === 'pending') {
        navigate('/onboarding', { replace: true });
      } else if (data.role === 'patient') {
        navigate('/patient', { replace: true });
      } else {
        setLoginFeedback({ variant: 'success', message: `Welcome back, ${data.username}!` });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sign in right now.';
      setLoginFeedback({ variant: 'error', message });
    } finally {
      setLoginLoading(false);
    }
  };

  const handleSignupSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (signupFields.password !== signupFields.confirmPassword) {
      setSignupFeedback({ variant: 'error', message: 'Passwords do not match. Please try again.' });
      return;
    }

    setSignupLoading(true);
    setSignupFeedback(null);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: signupFields.name,
          dob: signupFields.dob,
          phone: signupFields.phone,
          username: signupFields.username,
          password: signupFields.password,
        }),
      });

      if (!response.ok) {
        const message = await parseErrorMessage(response);
        throw new Error(message);
      }

      const data = await response.json();
      setSignupFeedback({ variant: 'success', message: `Account created for ${data.username}. You can sign in now.` });
      setSignupFields({
        username: '',
        name: '',
        dob: '',
        phone: '',
        password: '',
        confirmPassword: '',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create your account right now.';
      setSignupFeedback({ variant: 'error', message });
    } finally {
      setSignupLoading(false);
    }
  };

  return (
    <div className="auth-panels">
      <section className="auth-card">
        <div className="form-header">
          <p className="eyebrow">Returning patients</p>
          <h3>Sign in to continue</h3>
          <p>Access your plan, review session notes, and manage appointments in seconds.</p>
        </div>
        <form className="form" onSubmit={handleLoginSubmit}>
          <label htmlFor="login-username">Username</label>
          <input
            id="login-username"
            name="username"
            type="text"
            value={loginFields.username}
            onChange={handleLoginChange}
            placeholder="you@example.com"
            required
          />

          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            name="password"
            type="password"
            value={loginFields.password}
            onChange={handleLoginChange}
            placeholder="Enter your password"
            required
          />

          {loginFeedback && loginFeedback.variant === 'error' && (
            <div className="feedback error" role="alert">
              {loginFeedback.message}
            </div>
          )}
          {loginFeedback && loginFeedback.variant === 'success' && (
            <div className="feedback success" role="status">
              {loginFeedback.message}
            </div>
          )}

          <button type="submit" className="primary" disabled={loginLoading} aria-busy={loginLoading}>
            {loginLoading ? 'Signing In…' : 'Access my portal'}
          </button>
        </form>
      </section>

      <section className="auth-card accent">
        <div className="form-header">
          <p className="eyebrow">New to the clinic?</p>
          <h3>Create your account</h3>
          <p>Connect with your therapist and keep your care team updated from any device.</p>
        </div>
        <form className="form" onSubmit={handleSignupSubmit}>
          <div className="form-grid">
            <label htmlFor="signup-username">
              Username
              <input
                id="signup-username"
                name="username"
                type="text"
                value={signupFields.username}
                onChange={handleSignupChange}
                placeholder="Choose a unique username"
                required
              />
            </label>

            <label htmlFor="signup-name">
              Full name
              <input
                id="signup-name"
                name="name"
                type="text"
                value={signupFields.name}
                onChange={handleSignupChange}
                placeholder="Your legal name"
                required
              />
            </label>

            <label htmlFor="signup-dob">
              Date of birth
              <input
                id="signup-dob"
                name="dob"
                type="date"
                value={signupFields.dob}
                onChange={handleSignupChange}
                required
              />
            </label>

            <label htmlFor="signup-phone">
              Phone number
              <input
                id="signup-phone"
                name="phone"
                type="tel"
                value={signupFields.phone}
                onChange={handleSignupChange}
                placeholder="e.g. 555-123-4567"
                required
              />
            </label>

            <label htmlFor="signup-password">
              Password
              <input
                id="signup-password"
                name="password"
                type="password"
                value={signupFields.password}
                onChange={handleSignupChange}
                placeholder="At least 8 characters"
                required
              />
            </label>

            <label htmlFor="signup-confirmPassword">
              Confirm password
              <input
                id="signup-confirmPassword"
                name="confirmPassword"
                type="password"
                value={signupFields.confirmPassword}
                onChange={handleSignupChange}
                placeholder="Re-enter password"
                required
              />
            </label>
          </div>

          {signupFeedback && signupFeedback.variant === 'success' && (
            <div className="feedback success" role="status">
              {signupFeedback.message}
            </div>
          )}
          {signupFeedback && signupFeedback.variant === 'error' && (
            <div className="feedback error" role="alert">
              {signupFeedback.message}
            </div>
          )}

          <button type="submit" disabled={signupLoading} aria-busy={signupLoading}>
            {signupLoading ? 'Creating Account…' : 'Create my account'}
          </button>
        </form>
      </section>
    </div>
  );
};

export default Login;
