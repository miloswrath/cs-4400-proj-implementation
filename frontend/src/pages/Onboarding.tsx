import { useState, type FormEvent, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Onboarding.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

type OnboardingFields = {
  dxCode: string;
  referralDate: string;
  referringProvider: string;
};

const Onboarding = () => {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const today = new Date().toISOString().split('T')[0] ?? '';

  const [fields, setFields] = useState<OnboardingFields>({
    dxCode: '',
    referralDate: today,
    referringProvider: '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user || !user.patientId) {
    return null;
  }

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setFields((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/patients/${user.patientId}/onboarding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        const message = data?.message ?? 'Unable to complete onboarding right now.';
        throw new Error(message);
      }

      const data = await response.json();
      setUser({
        ...user,
        role: data.role,
        patientName: data.patientName ?? user.patientName,
        needsProfileCompletion: data.needsProfileCompletion,
      });
      navigate('/patient', { replace: true });
    } catch (submissionError) {
      const message =
        submissionError instanceof Error ? submissionError.message : 'Unable to complete onboarding right now.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="onboarding-page">
      <section className="onboarding-card">
        <header>
          <p className="eyebrow">Almost there</p>
          <h2>Welcome back, {user.patientName ?? user.username}</h2>
          <p>Please confirm the information below so we can coordinate with your referring provider.</p>
        </header>

        <div className="onboarding-grid">
          <form className="form" onSubmit={handleSubmit}>
            <label htmlFor="dxCode">
              Diagnosis code
              <input
                id="dxCode"
                name="dxCode"
                type="text"
                value={fields.dxCode}
                onChange={handleChange}
                placeholder="e.g. M54.5"
                required
              />
            </label>

            <label htmlFor="referralDate">
              Referral date
              <input
                id="referralDate"
                name="referralDate"
                type="date"
                value={fields.referralDate}
                onChange={handleChange}
                required
              />
            </label>

            <label htmlFor="referringProvider">
              Referring provider
              <input
                id="referringProvider"
                name="referringProvider"
                type="text"
                value={fields.referringProvider}
                onChange={handleChange}
                placeholder="Dr. Jane Doe"
                required
              />
            </label>

            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}

            <button type="submit" disabled={submitting} aria-busy={submitting}>
              {submitting ? 'Completing…' : 'Finish setup'}
            </button>
          </form>

          <aside>
            <div className="summary-card">
              <h3>What happens next?</h3>
              <ul>
                <li>We add your referral details to the care team record.</li>
                <li>Your patient portal unlocks with messaging and scheduling.</li>
                <li>You can update details anytime under account settings.</li>
              </ul>
            </div>
            <div className="summary-note">
              <p>Need help? Call our care team at <strong>(555) 555-0199</strong> and we’ll walk you through it.</p>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
};

export default Onboarding;
