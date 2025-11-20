import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCallback, useEffect, useState } from 'react';
import ScheduleSession, { type TherapistOption } from '../components/ScheduleSession/ScheduleSession';
import UpcomingSessions, { type UpcomingSession } from '../components/UpcomingSessions/UpcomingSessions';
import PastSessions from '../components/PastSessions/PastSessions';
import SessionEditor from '../components/SessionEditor/SessionEditor';
import './PatientHome.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

const BOOK_VISIT_QUERY = `-- Therapist directory powering the picker
SELECT Therapist.StaffID AS TherapistID,
       Staff.StaffName,
       Therapist.Specialty
FROM Therapist
INNER JOIN Staff ON Staff.StaffID = Therapist.StaffID
ORDER BY Staff.StaffName;

-- Availability check for the selected day
SELECT SessionTime
FROM Sessions
WHERE TherapistID = :therapistId
  AND SessionDate = :sessionDate
  AND Status <> 'Canceled';

-- Guardrails before inserting a visit
SELECT SessionID
FROM Sessions
WHERE PatientID = :patientId
  AND SessionDate = :sessionDate
  AND Status <> 'Canceled'
LIMIT 1;

SELECT SessionID
FROM Sessions
WHERE TherapistID = :therapistId
  AND SessionDate = :sessionDate
  AND SessionTime = :sessionTime
  AND Status <> 'Canceled'
LIMIT 1;

-- Visit creation
INSERT INTO Sessions (PatientID, TherapistID, SessionDate, SessionTime, Status, PainPre, PainPost, Notes)
VALUES (:patientId, :therapistId, :sessionDate, :sessionTime, 'Scheduled', :painPre, NULL, :notes);`;

const UPCOMING_VISITS_QUERY = `SELECT SessionID,
       SessionDate,
       SessionTime,
       Status,
       PainPre,
       Notes,
       TherapistID,
       TherapistName,
       Specialty
FROM vw_patient_upcoming_sessions
WHERE PatientID = :patientId
ORDER BY SessionDate ASC, SessionTime ASC;`;

const PAST_VISITS_QUERY = `SELECT SessionID,
       SessionDate,
       SessionTime,
       Status,
       PainPre,
       Notes,
       TherapistID,
       TherapistName,
       Specialty
FROM vw_patient_past_sessions
WHERE PatientID = :patientId
ORDER BY SessionDate DESC, SessionTime DESC
LIMIT 10;`;

const PatientHome = () => {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [therapists, setTherapists] = useState<TherapistOption[]>([]);
  const [sessions, setSessions] = useState<UpcomingSession[]>([]);
  const [pastSessions, setPastSessions] = useState<UpcomingSession[]>([]);
  const [therapistsLoading, setTherapistsLoading] = useState(true);
  const [therapistsError, setTherapistsError] = useState<string | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [editorSession, setEditorSession] = useState<UpcomingSession | null>(null);
  const [queryModal, setQueryModal] = useState<{ title: string; sql: string } | null>(null);

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
      setPastSessions(Array.isArray(data?.pastSessions) ? data.pastSessions : []);
    } catch (error) {
      console.error(error);
      setSessions([]);
      setPastSessions([]);
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

  const handleShowQuery = (title: string, sql: string) => {
    setQueryModal({ title, sql });
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
          <div className="schedule-column">
            <ScheduleSession
              therapists={therapists}
              therapistsLoading={therapistsLoading}
              therapistsError={therapistsError}
              onScheduled={fetchSessions}
              queryTitle="Book your next visit"
              querySQL={BOOK_VISIT_QUERY}
              onShowQuery={handleShowQuery}
            />
          </div>
          <div className="upcoming-column">
            <UpcomingSessions
              sessions={sessions}
              loading={sessionsLoading}
              onEdit={setEditorSession}
              queryTitle="Your scheduled visits"
              querySQL={UPCOMING_VISITS_QUERY}
              onShowQuery={handleShowQuery}
            />
          </div>
          <div className="past-column">
            <PastSessions
              sessions={pastSessions}
              loading={sessionsLoading}
              queryTitle="Your past visits"
              querySQL={PAST_VISITS_QUERY}
              onShowQuery={handleShowQuery}
            />
          </div>
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
      {queryModal && (
        <div
          className="admin-modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setQueryModal(null)}
        >
          <div className="admin-modal query-modal" onClick={(event) => event.stopPropagation()}>
            <header className="admin-modal-header">
              <div>
                <p className="eyebrow">SQL source</p>
                <h3>{queryModal.title}</h3>
              </div>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => setQueryModal(null)}
                aria-label="Close SQL query"
              >
                Close
              </button>
            </header>
            <pre className="query-snippet">
              <code>{queryModal.sql}</code>
            </pre>
          </div>
        </div>
      )}
    </main>
  );
};

export default PatientHome;
