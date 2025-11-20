import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import Login from '../components/Login/Login';
import { useAuth } from '../context/AuthContext';
import viteLogo from '/vite.svg';
import './Home.css';

const Home = () => {
  const { user } = useAuth();
  const [showAuthPanel, setShowAuthPanel] = useState(false);

  if (user?.role === 'pending') {
    return <Navigate to="/onboarding" replace />;
  }

  if (user?.role === 'patient') {
    return <Navigate to="/patient" replace />;
  }

  if (user?.role === 'therapist') {
    return <Navigate to="/therapist" replace />;
  }

  if (user?.role === 'admin') {
    return <Navigate to="/admin" replace />;
  }

  return (
    <>
      <main className="home-page">
        <header className="home-nav">
          <div className="home-logo">
            <img src={viteLogo} alt="PT Clinic logo" />
            <div>
              <p>PT Clinic</p>
              <span>Patient Portal</span>
            </div>
          </div>
          <button type="button" className="home-cta" onClick={() => setShowAuthPanel(true)}>
            Sign up / Log in
          </button>
        </header>

        <section className="home-hero">
          <span className="home-pill">Always-on care</span>
          <h1>
            One website, all your info<span> No phone call required.</span>
          </h1>
          <p>
            Monitor your PT roadmap, coordinate referrals, and adjust visits the second life changes. All demo data is
            fictional. Perfect for a great presentaion.
          </p>
          <div className="home-actions">
            <button type="button" className="home-cta primary" onClick={() => setShowAuthPanel(true)}>
              Access the portal
            </button>
            <p>Fully secure prototype data powered by MySQL + Vite.</p>
          </div>
          <div className="home-stats">
            <div>
              <p className="stat-value">08:00–16:00</p>
              <p className="stat-label">Same-day scheduling</p>
            </div>
            <div>
              <p className="stat-value">15</p>
              <p className="stat-label">Seeded patients</p>
            </div>
            <div>
              <p className="stat-value">0</p>
              <p className="stat-label">Real records stored</p>
            </div>
          </div>
        </section>

        <section className="home-highlights">
          <article>
            <h3>Review sessions</h3>
            <p>See upcoming visits, statuses, and therapist details without leaving the dashboard.</p>
          </article>
          <article>
            <h3>Guided onboarding</h3>
            <p>Capture diagnosis codes, referral dates, and provider info with one short form.</p>
          </article>
          <article>
            <h3>Schedule smart</h3>
            <p>Time-slot validation prevents double booking for both patients and therapists.</p>
          </article>
        </section>
      </main>

      {showAuthPanel && (
        <div
          className="auth-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowAuthPanel(false)}
        >
          <div className="auth-modal" onClick={(event) => event.stopPropagation()}>
            <div className="auth-modal-header">
              <h2>Access the PT Clinic Portal</h2>
              <button
                type="button"
                className="auth-modal-close"
                onClick={() => setShowAuthPanel(false)}
                aria-label="Close sign up and log in panel"
              >
                Close
              </button>
            </div>
            <Login />
          </div>
        </div>
      )}
    </>
  );
};

export default Home;
