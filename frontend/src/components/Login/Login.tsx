import { useState } from 'react';
import type { FormEvent, ChangeEvent } from 'react';
import './Login.css';

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

  const [feedback, setFeedback] = useState<Feedback>(null);
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
      setFeedback({ variant: 'error', message: 'Please enter both your username and password to sign in.' });
      return;
    }

    setLoginLoading(true);
    setFeedback(null);

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
      setFeedback({ variant: 'success', message: `Welcome back, ${data.username}!` });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sign in right now.';
      setFeedback({ variant: 'error', message });
    } finally {
      setLoginLoading(false);
    }
  };

  const handleSignupSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (signupFields.password !== signupFields.confirmPassword) {
      setFeedback({ variant: 'error', message: 'Passwords do not match. Please try again.' });
      return;
    }

    setSignupLoading(true);
    setFeedback(null);

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
      setFeedback({ variant: 'success', message: `Account created for ${data.username}. You can sign in now.` });
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
      setFeedback({ variant: 'error', message });
    } finally {
      setSignupLoading(false);
    }
  };

  return (
    <div className="login-page">
      <section className="card">
        <div className="form-header">
          <h2>Sign In</h2>
          <p>Use your existing account to access the dashboard.</p>
        </div>
        <form className="form" onSubmit={handleLoginSubmit}>
          <label htmlFor="login-username">Username</label>
          <input
            id="login-username"
            name="username"
            type="text"
            value={loginFields.username}
            onChange={handleLoginChange}
            placeholder="Enter your username"
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

          <button type="submit" disabled={loginLoading} aria-busy={loginLoading}>
            {loginLoading ? 'Signing In…' : 'Login'}
          </button>
        </form>
      </section>

      <section className="card">
        <div className="form-header">
          <h2>Sign Up</h2>
          <p>Patients can create portal access for scheduling and updates.</p>
        </div>
        <form className="form" onSubmit={handleSignupSubmit}>
          <label htmlFor="signup-username">Username</label>
          <input
            id="signup-username"
            name="username"
            type="text"
            value={signupFields.username}
            onChange={handleSignupChange}
            placeholder="Choose a username"
            required
          />

          <label htmlFor="signup-name">Name</label>
          <input
            id="signup-name"
            name="name"
            type="text"
            value={signupFields.name}
            onChange={handleSignupChange}
            placeholder="Your full name"
            required
          />

          <label htmlFor="signup-dob">Date of Birth</label>
          <input
            id="signup-dob"
            name="dob"
            type="date"
            value={signupFields.dob}
            onChange={handleSignupChange}
            required
          />

          <label htmlFor="signup-phone">Phone Number</label>
          <input
            id="signup-phone"
            name="phone"
            type="tel"
            value={signupFields.phone}
            onChange={handleSignupChange}
            placeholder="e.g. 555-123-4567"
            required
          />

          <label htmlFor="signup-password">Password</label>
          <input
            id="signup-password"
            name="password"
            type="password"
            value={signupFields.password}
            onChange={handleSignupChange}
            placeholder="Create a password"
            required
          />

          <label htmlFor="signup-confirmPassword">Confirm Password</label>
          <input
            id="signup-confirmPassword"
            name="confirmPassword"
            type="password"
            value={signupFields.confirmPassword}
            onChange={handleSignupChange}
            placeholder="Re-enter password"
            required
          />

          <button type="submit" disabled={signupLoading} aria-busy={signupLoading}>
            {signupLoading ? 'Creating Account…' : 'Create Account'}
          </button>
        </form>
      </section>

      {feedback && <p className={`feedback ${feedback.variant}`}>{feedback.message}</p>}
    </div>
  );
};

export default Login;
