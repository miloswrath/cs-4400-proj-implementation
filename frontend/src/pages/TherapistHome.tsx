import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './TherapistHome.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

type StatusMessage = {
  variant: 'success' | 'error';
  message: string;
} | null;

type TherapistDashboardSession = {
  sessionId: number;
  sessionDate: string;
  sessionTime: string;
  status: 'Scheduled' | 'Completed' | 'Canceled' | 'No-Show';
  painPre: number | null;
  notes: string | null;
  patientId: number;
  patientName: string;
};

type PatientSummary = {
  previousSessions: {
    sessionId: number;
    sessionDate: string;
    sessionTime: string;
    status: 'Scheduled' | 'Completed' | 'Canceled' | 'No-Show';
    painPre: number | null;
    notes: string | null;
  }[];
  outcomeSummaries: {
    measureName: string;
    baselineScore: number | null;
    baselineTakenOn: string | null;
    latestScore: number | null;
    latestTakenOn: string | null;
  }[];
};

type TherapistDashboard = {
  upcomingSessions: TherapistDashboardSession[];
  patientSummaries: Record<number, PatientSummary>;
};

const THERAPIST_DASHBOARD_QUERY = `-- Upcoming schedule for a therapist via view
SELECT SessionID,
       SessionDate,
       SessionTime,
       Status,
       PainPre,
       Notes,
       PatientID,
       PatientName
FROM vw_therapist_schedule
WHERE TherapistID = :therapistId
  AND SessionDate >= :today
ORDER BY SessionDate ASC, SessionTime ASC;

-- Recent sessions (latest 3 per patient)
WITH ranked AS (
  SELECT Sessions.SessionID,
         Sessions.PatientID,
         Sessions.SessionDate,
         Sessions.SessionTime,
         Sessions.Status,
         Sessions.PainPre,
         Sessions.Notes,
         ROW_NUMBER() OVER (PARTITION BY Sessions.PatientID ORDER BY Sessions.SessionDate DESC, Sessions.SessionTime DESC) AS rn
  FROM Sessions
  WHERE Sessions.PatientID IN (:patientIds)
    AND Sessions.TherapistID = :therapistId
    AND Sessions.SessionDate < :today
)
SELECT SessionID,
       PatientID,
       SessionDate,
       SessionTime,
       Status,
       PainPre,
       Notes
FROM ranked
WHERE rn <= 3;

-- Outcome measures summary per patient
WITH ranked AS (
  SELECT OutcomeMeasures.PatientID,
         OutcomeMeasures.MeasureName,
         OutcomeMeasures.Score,
         OutcomeMeasures.TakenOn,
         ROW_NUMBER() OVER (PARTITION BY OutcomeMeasures.PatientID, OutcomeMeasures.MeasureName ORDER BY OutcomeMeasures.TakenOn ASC) AS rn_asc,
         ROW_NUMBER() OVER (PARTITION BY OutcomeMeasures.PatientID, OutcomeMeasures.MeasureName ORDER BY OutcomeMeasures.TakenOn DESC) AS rn_desc
  FROM OutcomeMeasures
  WHERE OutcomeMeasures.PatientID IN (:patientIds)
)
SELECT PatientID,
       MeasureName,
       MAX(CASE WHEN rn_asc = 1 THEN Score END) AS BaselineScore,
       MAX(CASE WHEN rn_asc = 1 THEN TakenOn END) AS BaselineTakenOn,
       MAX(CASE WHEN rn_desc = 1 THEN Score END) AS LatestScore,
       MAX(CASE WHEN rn_desc = 1 THEN TakenOn END) AS LatestTakenOn
FROM ranked
GROUP BY PatientID, MeasureName;`;

const THERAPIST_EXERCISES_QUERY = `SELECT ExerciseID, Name, BodyRegion, Difficulty
FROM Exercises
ORDER BY Name ASC;`;

const START_SESSION_MUTATION = `UPDATE Sessions
SET Status = :status,
    Notes = :notes,
    PainPre = :painPre,
    PainPost = :painPost
WHERE SessionID = :sessionId;

DELETE FROM SessionExercises
WHERE SessionID = :sessionId;

INSERT INTO SessionExercises (SessionID, ExerciseID, Sets, Reps, Resistance)
VALUES (:sessionId, :exerciseId, :sets, :reps, :resistance);

INSERT INTO OutcomeMeasures (PatientID, MeasureName, Score, TakenOn, Notes)
VALUES (:patientId, :measureName, :score, :takenOn, :notes)
ON DUPLICATE KEY UPDATE
  Score = VALUES(Score),
  Notes = VALUES(Notes);`;

type ExerciseOption = {
  exerciseId: number;
  name: string;
  bodyRegion: string;
  difficulty: number;
};

type SessionExerciseFormRow = {
  exerciseId: string;
  sets: string;
  reps: string;
  resistance: string;
};

type OutcomeFormRow = {
  measureName: string;
  score: string;
  takenOn: string;
  notes: string;
};

const SESSION_STATUS_OPTIONS: TherapistDashboardSession['status'][] = ['Scheduled', 'Completed', 'Canceled', 'No-Show'];

const TherapistHome = () => {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState<StatusMessage>(null);
  const [loading, setLoading] = useState(false);
  const [dashboard, setDashboard] = useState<TherapistDashboard | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [expandedSessionId, setExpandedSessionId] = useState<number | null>(null);
  const [exerciseOptions, setExerciseOptions] = useState<ExerciseOption[]>([]);
  const [sessionFormState, setSessionFormState] = useState<{
    session: TherapistDashboardSession;
    status: TherapistDashboardSession['status'];
    notes: string;
    painPre: string;
    painPost: string;
    exercises: SessionExerciseFormRow[];
    outcomes: OutcomeFormRow[];
  } | null>(null);
  const [sessionFormError, setSessionFormError] = useState<string | null>(null);
  const [sessionFormSubmitting, setSessionFormSubmitting] = useState(false);
  const [queryModal, setQueryModal] = useState<{ title: string; sql: string } | null>(null);

  const showQueryModal = (title: string, sql: string) => {
    setQueryModal({ title, sql });
  };

  const closeQueryModal = () => setQueryModal(null);

  if (!user) {
    return <Navigate to="/" replace />;
  }

  const handleSignOut = () => {
    setUser(null);
    navigate('/', { replace: true });
  };

  const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setStatus({ variant: 'error', message: 'New passwords must match.' });
      return;
    }

    setLoading(true);
    setStatus(null);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.userId,
          currentPassword,
          newPassword,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message ?? 'Unable to update password right now.');
      }

      setStatus({ variant: 'success', message: 'Password updated. Please continue to your dashboard.' });
      setUser({ ...user, needsPasswordReset: false });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update password right now.';
      setStatus({ variant: 'error', message });
    } finally {
      setLoading(false);
    }
  };

  const formattedSessions = useMemo(() => dashboard?.upcomingSessions ?? [], [dashboard]);
  const upcomingSessions = useMemo(
    () => formattedSessions.filter((session) => session.status === 'Scheduled'),
    [formattedSessions],
  );
  const pastSessions = useMemo(
    () =>
      formattedSessions
        .filter((session) => session.status !== 'Scheduled')
        .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate) || b.sessionTime.localeCompare(a.sessionTime)),
    [formattedSessions],
  );

  const toggleSession = (sessionId: number) => {
    setExpandedSessionId((current) => (current === sessionId ? null : sessionId));
  };

  const formatDate = (value: string) =>
    new Date(value).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  const formatTime = (value: string) => value.slice(0, 5);

  const formatOutcomeDate = (value: string | null | undefined) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  useEffect(() => {
    const controller = new AbortController();
    const loadExercises = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/exercises`, { signal: controller.signal });
        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(data?.message ?? 'Unable to load exercises.');
        }
        const data = await response.json();
        setExerciseOptions(Array.isArray(data?.exercises) ? data.exercises : []);
      } catch (error) {
        if ((error as DOMException).name === 'AbortError') return;
        setExerciseOptions([]);
      }
    };
    loadExercises();
    return () => controller.abort();
  }, []);

  const fetchDashboardData = useCallback(
    async (signal?: AbortSignal) => {
      if (!user?.staffId || user.needsPasswordReset) return;
      try {
        const response = await fetch(`${API_BASE_URL}/therapists/${user.staffId}/dashboard`, {
          signal,
        });
        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(data?.message ?? 'Unable to load your dashboard.');
        }
        const data = (await response.json()) as TherapistDashboard;
        setDashboard(data);
        setExpandedSessionId(null);
      } catch (error) {
        if ((error as DOMException).name === 'AbortError') return;
        const message = error instanceof Error ? error.message : 'Unable to load your dashboard.';
        setDashboardError(message);
        setDashboard(null);
        throw error;
      }
    },
    [user?.staffId, user?.needsPasswordReset],
  );

  useEffect(() => {
    if (!user?.staffId || user.needsPasswordReset) {
      return;
    }
    const controller = new AbortController();
    setDashboardLoading(true);
    setDashboardError(null);
    fetchDashboardData(controller.signal)
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) {
          setDashboardLoading(false);
        }
      });
    return () => controller.abort();
  }, [user?.staffId, user?.needsPasswordReset, fetchDashboardData]);

  const reloadDashboard = useCallback(async () => {
    if (!user?.staffId || user.needsPasswordReset) return;
    setDashboardLoading(true);
    setDashboardError(null);
    try {
      await fetchDashboardData();
    } catch {
      // Swallow; fetchDashboardData already updated error state.
    } finally {
      setDashboardLoading(false);
    }
  }, [user?.staffId, user?.needsPasswordReset, fetchDashboardData]);

  const defaultExerciseRow = () => ({
    exerciseId: '',
    sets: '',
    reps: '',
    resistance: '',
  });

  const defaultOutcomeRow = () => ({
    measureName: '',
    score: '',
    takenOn: new Date().toISOString().slice(0, 10),
    notes: '',
  });

  const openStartSessionModal = (session: TherapistDashboardSession) => {
    setSessionFormState({
      session,
      status: session.status === 'Scheduled' ? 'Completed' : session.status,
      notes: session.notes ?? '',
      painPre: session.painPre !== null ? String(session.painPre) : '0',
      painPost: session.painPre !== null ? String(session.painPre) : '0',
      exercises: [defaultExerciseRow()],
      outcomes: [defaultOutcomeRow()],
    });
    setSessionFormError(null);
    setSessionFormSubmitting(false);
  };

  const closeStartSessionModal = () => {
    setSessionFormState(null);
    setSessionFormError(null);
    setSessionFormSubmitting(false);
  };

  const updateExerciseRow = (index: number, field: keyof SessionExerciseFormRow, value: string) => {
    setSessionFormState((current) => {
      if (!current) return current;
      const next = [...current.exercises];
      next[index] = { ...next[index], [field]: value };
      return { ...current, exercises: next };
    });
  };

  const addExerciseRow = () => {
    setSessionFormState((current) => {
      if (!current) return current;
      return { ...current, exercises: [...current.exercises, defaultExerciseRow()] };
    });
  };

  const removeExerciseRow = (index: number) => {
    setSessionFormState((current) => {
      if (!current) return current;
      const next = current.exercises.filter((_, idx) => idx !== index);
      return { ...current, exercises: next };
    });
  };

  const updateOutcomeRow = (index: number, field: keyof OutcomeFormRow, value: string) => {
    setSessionFormState((current) => {
      if (!current) return current;
      const next = [...current.outcomes];
      next[index] = { ...next[index], [field]: value };
      return { ...current, outcomes: next };
    });
  };

  const addOutcomeRow = () => {
    setSessionFormState((current) => {
      if (!current) return current;
      return { ...current, outcomes: [...current.outcomes, defaultOutcomeRow()] };
    });
  };

  const removeOutcomeRow = (index: number) => {
    setSessionFormState((current) => {
      if (!current) return current;
      const next = current.outcomes.filter((_, idx) => idx !== index);
      return { ...current, outcomes: next };
    });
  };

  const handleSessionFormSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!sessionFormState || !user?.staffId) return;
    setSessionFormSubmitting(true);
    setSessionFormError(null);

    const parsePainInput = (value: string) => {
      const parsed = Number(value);
      if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 10) {
        return parsed;
      }
      return null;
    };

    const payload = {
      status: sessionFormState.status,
      notes: sessionFormState.notes.trim() || null,
      painPre: parsePainInput(sessionFormState.painPre),
      painPost: parsePainInput(sessionFormState.painPost),
      sessionExercises: sessionFormState.exercises
        .map((row) => ({
          exerciseId: Number(row.exerciseId),
          sets: Number(row.sets),
          reps: Number(row.reps),
          resistance: row.resistance.trim() ? row.resistance.trim() : null,
        }))
        .filter(
          (row) =>
            Number.isInteger(row.exerciseId) &&
            row.exerciseId > 0 &&
            Number.isInteger(row.sets) &&
            row.sets > 0 &&
            Number.isInteger(row.reps) &&
            row.reps > 0,
        ),
      outcomeMeasures: sessionFormState.outcomes
        .map((row) => ({
          measureName: row.measureName.trim(),
          score: Number(row.score),
          takenOn: row.takenOn,
          notes: row.notes.trim() ? row.notes.trim() : null,
        }))
        .filter(
          (row) =>
            row.measureName &&
            row.takenOn &&
            !Number.isNaN(Date.parse(row.takenOn)) &&
            Number.isFinite(row.score),
        ),
    };

    try {
      const response = await fetch(
        `${API_BASE_URL}/therapists/${user.staffId}/sessions/${sessionFormState.session.sessionId}/start`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message ?? 'Unable to start this session.');
      }
      closeStartSessionModal();
      await reloadDashboard();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to start this session.';
      setSessionFormError(message);
    } finally {
      setSessionFormSubmitting(false);
    }
  };

  return (
    <main className="therapist-home">
      <div className="therapist-shell">
        <header className="therapist-header">
          <div>
            <p className="eyebrow">Therapist portal</p>
            <h1>Hi, {user.therapistName ?? user.username}</h1>
            <p>Manage your schedule, track outcomes, and monitor patients in one place.</p>
          </div>
          <button type="button" className="ghost" onClick={handleSignOut}>
            Sign out
          </button>
        </header>

        {user.needsPasswordReset ? (
          <section className="therapist-card">
            <div className="card-header">
              <h2>Set your permanent password</h2>
              <p>Enter the temporary password provided by the admin and choose a new one.</p>
            </div>
            <form className="reset-form" onSubmit={handlePasswordSubmit}>
              <label>
                Temporary password
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  required
                />
              </label>
              <label>
                New password
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  minLength={8}
                  required
                />
              </label>
              <label>
                Confirm new password
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  minLength={8}
                  required
                />
              </label>
              {status && <p className={`status ${status.variant}`}>{status.message}</p>}
              <button type="submit" disabled={loading} aria-busy={loading}>
                {loading ? 'Updating…' : 'Save new password'}
              </button>
            </form>
          </section>
        ) : (
          <section className="therapist-card">
            <div className="card-header">
              <h2>
                <button
                  type="button"
                  className="panel-title-button"
                  onClick={() => showQueryModal('Therapist dashboard queries', THERAPIST_DASHBOARD_QUERY)}
                >
                  Upcoming appointments
                </button>
              </h2>
              <p>Tap a patient to see their recent sessions and progress.</p>
            </div>
            {dashboardLoading ? (
              <p className="hint">Loading your schedule…</p>
            ) : dashboardError ? (
              <p className="status error">{dashboardError}</p>
            ) : (
              <>
                <div className="dashboard-section">
                  <div className="section-heading">
                    <h3>Next visits</h3>
                    <p>Your remaining scheduled sessions.</p>
                  </div>
                  {upcomingSessions.length === 0 ? (
                    <p className="hint">No upcoming sessions on the calendar yet.</p>
                  ) : (
                    <div className="visit-grid">
                      {upcomingSessions.map((session) => {
                        const isExpanded = expandedSessionId === session.sessionId;
                        const summary = session.patientId ? dashboard?.patientSummaries[session.patientId] : null;
                        return (
                          <div key={session.sessionId} className={`visit-card ${isExpanded ? 'expanded' : ''}`}>
                            <div className="visit-card-header">
                              <button
                                type="button"
                                className="visit-toggle"
                                onClick={() => toggleSession(session.sessionId)}
                              >
                                <div>
                                  <p className="visit-date">{formatDate(session.sessionDate)}</p>
                                  <h3>{session.patientName}</h3>
                                  <p className="visit-time">{formatTime(session.sessionTime)}</p>
                                </div>
                                <span className="visit-status">{session.status}</span>
                              </button>
                              <button
                                type="button"
                                className="start-session-btn"
                                onClick={() => openStartSessionModal(session)}
                              >
                                Start session
                              </button>
                            </div>
                            {isExpanded && (
                              <div className="visit-details">
                                <div className="insight-section">
                                  <h4>Session notes</h4>
                                  <p className="insight-text">
                                    {session.notes?.trim() ? session.notes : 'No notes recorded for this visit.'}
                                  </p>
                                  {typeof session.painPre === 'number' && (
                                    <p className="insight-meta">Pain level on arrival: {session.painPre}/10</p>
                                  )}
                                </div>
                                <div className="insight-section">
                                  <h4>Recent visits</h4>
                                  {summary?.previousSessions?.length ? (
                                    <ul className="insight-list">
                                      {summary.previousSessions.map((past) => (
                                        <li key={past.sessionId}>
                                          <strong>{formatDate(past.sessionDate)}</strong>
                                          <span>{past.status}</span>
                                          <p>{past.notes?.trim() ? past.notes : 'No notes saved.'}</p>
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <p className="insight-text">No prior sessions recorded with you.</p>
                                  )}
                                </div>
                                <div className="insight-section">
                                  <h4>Outcome measures</h4>
                                  {summary?.outcomeSummaries?.length ? (
                                    <ul className="insight-list compact">
                                      {summary.outcomeSummaries.map((measure) => (
                                        <li key={`${session.patientId}-${measure.measureName}`}>
                                          <strong>{measure.measureName}</strong>
                                          <span>
                                            {measure.baselineScore ?? '—'} → {measure.latestScore ?? '—'}
                                          </span>
                                          <p>
                                            Baseline: {formatOutcomeDate(measure.baselineTakenOn)} · Latest:{' '}
                                            {formatOutcomeDate(measure.latestTakenOn)}
                                          </p>
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <p className="insight-text">No documented outcome measures yet.</p>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="dashboard-section">
                  <div className="section-heading">
                    <h3>Recent sessions</h3>
                    <p>Completed, canceled, or no-show visits for quick follow-up.</p>
                  </div>
                  {pastSessions.length === 0 ? (
                    <p className="hint">No sessions have been completed yet.</p>
                  ) : (
                    <div className="visit-grid">
                      {pastSessions.map((session) => {
                        const isExpanded = expandedSessionId === session.sessionId;
                        const summary = session.patientId ? dashboard?.patientSummaries[session.patientId] : null;
                        return (
                          <div key={`past-${session.sessionId}`} className={`visit-card ${isExpanded ? 'expanded' : ''}`}>
                            <div className="visit-card-header">
                              <button
                                type="button"
                                className="visit-toggle"
                                onClick={() => toggleSession(session.sessionId)}
                              >
                                <div>
                                  <p className="visit-date">{formatDate(session.sessionDate)}</p>
                                  <h3>{session.patientName}</h3>
                                  <p className="visit-time">{formatTime(session.sessionTime)}</p>
                                </div>
                                <span className="visit-status past">{session.status}</span>
                              </button>
                            </div>
                            {isExpanded && (
                              <div className="visit-details">
                                <div className="insight-section">
                                  <h4>Session notes</h4>
                                  <p className="insight-text">
                                    {session.notes?.trim() ? session.notes : 'No notes recorded for this visit.'}
                                  </p>
                                  {typeof session.painPre === 'number' && (
                                    <p className="insight-meta">Pain level on arrival: {session.painPre}/10</p>
                                  )}
                                </div>
                                <div className="insight-section">
                                  <h4>Recent visits</h4>
                                  {summary?.previousSessions?.length ? (
                                    <ul className="insight-list">
                                      {summary.previousSessions.map((past) => (
                                        <li key={past.sessionId}>
                                          <strong>{formatDate(past.sessionDate)}</strong>
                                          <span>{past.status}</span>
                                          <p>{past.notes?.trim() ? past.notes : 'No notes saved.'}</p>
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <p className="insight-text">No prior sessions recorded with you.</p>
                                  )}
                                </div>
                                <div className="insight-section">
                                  <h4>Outcome measures</h4>
                                  {summary?.outcomeSummaries?.length ? (
                                    <ul className="insight-list compact">
                                      {summary.outcomeSummaries.map((measure) => (
                                        <li key={`past-${session.patientId}-${measure.measureName}`}>
                                          <strong>{measure.measureName}</strong>
                                          <span>
                                            {measure.baselineScore ?? '—'} → {measure.latestScore ?? '—'}
                                          </span>
                                          <p>
                                            Baseline: {formatOutcomeDate(measure.baselineTakenOn)} · Latest:{' '}
                                            {formatOutcomeDate(measure.latestTakenOn)}
                                          </p>
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <p className="insight-text">No documented outcome measures yet.</p>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        )}
      </div>

      {sessionFormState && (
        <div
          className="admin-modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={closeStartSessionModal}
        >
          <div className="admin-modal session-modal" onClick={(event) => event.stopPropagation()}>
            <header className="admin-modal-header">
              <div>
                <p className="eyebrow">Start session</p>
                <h3>
                  {sessionFormState.session.patientName} · {formatDate(sessionFormState.session.sessionDate)}
                </h3>
                <p className="visit-time">{formatTime(sessionFormState.session.sessionTime)}</p>
              </div>
              <button
                type="button"
                className="panel-title-button"
                onClick={() => showQueryModal('Start session mutation queries', START_SESSION_MUTATION)}
              >
                View SQL
              </button>
              <button
                type="button"
                className="admin-modal-close"
                onClick={closeStartSessionModal}
                aria-label="Close start session dialog"
              >
                Close
              </button>
            </header>
            <form className="session-start-form" onSubmit={handleSessionFormSubmit}>
              <div className="form-row">
                <label>
                  Status
                  <select
                    value={sessionFormState.status}
                    onChange={(event) =>
                      setSessionFormState((current) =>
                        current ? { ...current, status: event.target.value as TherapistDashboardSession['status'] } : current,
                      )
                    }
                    required
                  >
                    {SESSION_STATUS_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Pain (arrival)
                  <input
                    type="number"
                    min={0}
                    max={10}
                    value={sessionFormState.painPre}
                    onChange={(event) =>
                      setSessionFormState((current) =>
                        current ? { ...current, painPre: event.target.value } : current,
                      )
                    }
                  />
                </label>
                <label>
                  Pain (departure)
                  <input
                    type="number"
                    min={0}
                    max={10}
                    value={sessionFormState.painPost}
                    onChange={(event) =>
                      setSessionFormState((current) =>
                        current ? { ...current, painPost: event.target.value } : current,
                      )
                    }
                  />
                </label>
              </div>
              <label>
                Session notes
                <textarea
                  rows={3}
                  value={sessionFormState.notes}
                  onChange={(event) =>
                    setSessionFormState((current) => (current ? { ...current, notes: event.target.value } : current))
                  }
                />
              </label>
              <div className="form-section">
                <div className="section-header">
                  <h4>Session exercises</h4>
                  <button
                    type="button"
                    className="panel-title-button small-link"
                    onClick={() => showQueryModal('Exercise catalog query', THERAPIST_EXERCISES_QUERY)}
                  >
                    View SQL
                  </button>
                  <button type="button" onClick={addExerciseRow}>
                    Add exercise
                  </button>
                </div>
                {sessionFormState.exercises.length === 0 ? (
                  <p className="hint">No exercises added yet.</p>
                ) : (
                  sessionFormState.exercises.map((row, index) => (
                    <div className="exercise-row" key={`exercise-${sessionFormState.session.sessionId}-${index}`}>
                      <select
                        value={row.exerciseId}
                        onChange={(event) => updateExerciseRow(index, 'exerciseId', event.target.value)}
                      >
                        <option value="">Select exercise</option>
                        {exerciseOptions.map((exercise) => (
                          <option key={exercise.exerciseId} value={exercise.exerciseId}>
                            {exercise.name} · {exercise.bodyRegion}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={1}
                        placeholder="Sets"
                        value={row.sets}
                        onChange={(event) => updateExerciseRow(index, 'sets', event.target.value)}
                      />
                      <input
                        type="number"
                        min={1}
                        placeholder="Reps"
                        value={row.reps}
                        onChange={(event) => updateExerciseRow(index, 'reps', event.target.value)}
                      />
                      <input
                        type="text"
                        placeholder="Resistance"
                        value={row.resistance}
                        onChange={(event) => updateExerciseRow(index, 'resistance', event.target.value)}
                      />
                      <button type="button" className="row-remove" onClick={() => removeExerciseRow(index)}>
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>
              <div className="form-section">
                <div className="section-header">
                  <h4>Outcome measures</h4>
                  <button type="button" onClick={addOutcomeRow}>
                    Add measure
                  </button>
                </div>
                {sessionFormState.outcomes.length === 0 ? (
                  <p className="hint">No outcomes recorded yet.</p>
                ) : (
                  sessionFormState.outcomes.map((row, index) => (
                    <div className="outcome-row" key={`outcome-${sessionFormState.session.sessionId}-${index}`}>
                      <input
                        type="text"
                        placeholder="Measure name"
                        value={row.measureName}
                        onChange={(event) => updateOutcomeRow(index, 'measureName', event.target.value)}
                      />
                      <input
                        type="number"
                        step="0.1"
                        placeholder="Score"
                        value={row.score}
                        onChange={(event) => updateOutcomeRow(index, 'score', event.target.value)}
                      />
                      <input
                        type="date"
                        value={row.takenOn}
                        onChange={(event) => updateOutcomeRow(index, 'takenOn', event.target.value)}
                      />
                      <input
                        type="text"
                        placeholder="Notes"
                        value={row.notes}
                        onChange={(event) => updateOutcomeRow(index, 'notes', event.target.value)}
                      />
                      <button type="button" className="row-remove" onClick={() => removeOutcomeRow(index)}>
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>
              {sessionFormError && <p className="status error">{sessionFormError}</p>}
              <button type="submit" disabled={sessionFormSubmitting} aria-busy={sessionFormSubmitting}>
                {sessionFormSubmitting ? 'Saving…' : 'Save session'}
              </button>
            </form>
          </div>
        </div>
      )}

      {queryModal && (
        <div
          className="admin-modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={closeQueryModal}
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
                onClick={closeQueryModal}
                aria-label="Close SQL details"
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

export default TherapistHome;
