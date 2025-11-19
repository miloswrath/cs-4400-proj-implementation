import { Navigate } from 'react-router-dom';
import Login from '../components/Login/Login';
import { useAuth } from '../context/AuthContext';
import './Home.css';

const Home = () => {
  const { user } = useAuth();

  if (user?.role === 'pending') {
    return <Navigate to="/onboarding" replace />;
  }

  if (user?.role === 'patient') {
    return <Navigate to="/patient" replace />;
  }

  return (
    <main className="home-layout">
      <section className="home-hero">
        <span className="home-pill">PT Clinic Portal</span>
        <h1>
          Care that meets you <span>where you are.</span>
        </h1>
        <p>
          Securely manage appointments, track progress, and share updates with your therapist team without picking up
          the phone.
        </p>
        <div className="home-stats">
          <div>
            <p className="stat-value">24/7</p>
            <p className="stat-label">Access</p>
          </div>
          <div>
            <p className="stat-value">10k+</p>
            <p className="stat-label">Sessions logged</p>
          </div>
          <div>
            <p className="stat-value">4.9★</p>
            <p className="stat-label">Patient rating</p>
          </div>
        </div>
      </section>

      <section className="home-panel">
        <header className="home-panel-header">
          <h2>Patient access</h2>
          <p>Log in or create your account to stay connected to your therapy roadmap.</p>
        </header>
        <Login />
        <ul className="home-benefits">
          <li>
            <strong>Real-time updates</strong>
            <span>Session notes, pain scores, and reminders in one place.</span>
          </li>
          <li>
            <strong>Easy referrals</strong>
            <span>Share your provider info so we can coordinate care quickly.</span>
          </li>
          <li>
            <strong>Guided onboarding</strong>
            <span>Finish intake paperwork from any device in minutes.</span>
          </li>
        </ul>
      </section>
    </main>
  );
};

export default Home;
