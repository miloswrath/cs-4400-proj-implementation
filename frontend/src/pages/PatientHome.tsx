import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCallback, useEffect, useState } from 'react';
import ScheduleSession, { type TherapistOption } from '../components/ScheduleSession/ScheduleSession';
import UpcomingSessions, { type UpcomingSession } from '../components/UpcomingSessions/UpcomingSessions';
import SessionEditor from '../components/SessionEditor/SessionEditor';
import './PatientHome.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

const PatientHome = () => {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [therapists, setTherapists] = useState<TherapistOption[]>([]);
  const [sessions, setSessions] = useState<UpcomingSession[]>([]);
  const [therapistsLoading, setTherapistsLoading] = useState(true);
  const [therapistsError, setTherapistsError] = useState<string | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [editorSession, setEditorSession] = useState<UpcomingSession | null>(null);

  const fetchSessions = useCallback(async () => {
    if (!user?.patientId) return;
    setSessionsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/patients/${user.patientId}/sessions`);
      if (!response.ok) {
        throw new Error('Unable to load your sessions.');
      }
      const data = await response.json();
      setSessions(Array.isArray(data?.sessions) ? data.sessions : []);
    } catch (error) {
      console.error(error);
      setSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  }, [user?.patientId]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  useEffect(() => {
    const loadTherapists = async () => {
      try {
        setTherapistsLoading(true);
        setTherapistsError(null);
        const response = await fetch(`${API_BASE_URL}/therapists`);
        if (!response.ok) {
          throw new Error('Unable to load therapists.');
        }
        const data = await response.json();
        const parsed = Array.isArray(data?.therapists)
          ? data.therapists.map((t: any) => ({
              therapistId: Number(t.TherapistID ?? t.therapistId),
              name: t.StaffName ?? t.name,
              specialty: t.Specialty ?? t.specialty ?? 'General',
            }))
          : [];
        setTherapists(parsed);
      } catch (error) {
        console.error(error);
        setTherapists([]);
        setTherapistsError(error instanceof Error ? error.message : 'Unable to load therapists right now.');
      }
      setTherapistsLoading(false);
    };
    loadTherapists();
  }, []);

  if (!user) {
    return <Navigate to="/" replace />;
  }

  const patientName = user.patientName ?? user.username;

  const handleSignOut = () => {
    setUser(null);
    navigate('/', { replace: true });
  };

  return (
    <main className="patient-home">
      <div className="patient-shell">
        <header className="patient-header">
          <div>
            <p className="eyebrow">Patient portal</p>
            <h1>Welcome back, {patientName}</h1>
            <p>Schedule visits, update your care team, and track your progress all from here.</p>
          </div>
          <button type="button" className="ghost" onClick={handleSignOut}>
            Sign out
          </button>
        </header>

        <div className="patient-dashboard">
          <ScheduleSession
            therapists={therapists}
            therapistsLoading={therapistsLoading}
            therapistsError={therapistsError}
            onScheduled={fetchSessions}
          />
          <UpcomingSessions sessions={sessions} loading={sessionsLoading} onEdit={setEditorSession} />
        </div>
      </div>
      {editorSession && (
        <SessionEditor
          session={editorSession}
          therapists={therapists}
          onClose={() => setEditorSession(null)}
          onUpdated={fetchSessions}
        />
      )}
    </main>
  );
};

export default PatientHome;
