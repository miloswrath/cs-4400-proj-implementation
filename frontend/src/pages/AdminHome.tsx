import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './AdminHome.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

type NoShowRate = {
  therapistId: number;
  therapistName: string;
  month: string;
  totalSessions: number;
  noShows: number;
  rate: number;
};

type OutcomeChange = {
  patientId: number;
  patientName: string;
  measureName: string;
  baselineScore: number;
  latestScore: number;
  delta: number;
};

type ExerciseMetric = {
  exerciseName: string;
  prescriptions: number;
};

type OutcomeDetail = {
  outcomeId: number;
  patientId: number;
  patientName: string;
  measureName: string;
  score: number;
  takenOn: string;
  notes: string | null;
};

type ShoulderOrder = {
  exerciseName: string;
  sessionId: number;
  sessionDate: string;
  patientName: string;
  therapistName: string;
};

type AdminMetrics = {
  noShowRates: NoShowRate[];
  outcomeChanges: OutcomeChange[];
  topShoulderExercises: ExerciseMetric[];
  outcomeDetails: OutcomeDetail[];
  shoulderOrders: ShoulderOrder[];
};

const NO_SHOW_RATE_QUERY = `SELECT Therapist.StaffID AS TherapistID,
       Staff.StaffName,
       DATE_FORMAT(Sessions.SessionDate, '%Y-%m') AS MonthLabel,
       SUM(CASE WHEN Sessions.Status = 'No-Show' THEN 1 ELSE 0 END) AS NoShows,
       COUNT(*) AS TotalSessions
FROM Sessions
INNER JOIN Therapist ON Therapist.StaffID = Sessions.TherapistID
INNER JOIN Staff ON Staff.StaffID = Therapist.StaffID
GROUP BY Therapist.StaffID, Staff.StaffName, MonthLabel
ORDER BY MonthLabel ASC, Staff.StaffName ASC;`;

const OUTCOME_CHANGE_QUERY = `WITH ranked AS (
  SELECT
    OutcomeMeasures.PatientID,
    OutcomeMeasures.MeasureName,
    OutcomeMeasures.Score,
    OutcomeMeasures.TakenOn,
    ROW_NUMBER() OVER (PARTITION BY OutcomeMeasures.PatientID, OutcomeMeasures.MeasureName ORDER BY OutcomeMeasures.TakenOn ASC) AS rn_asc,
    ROW_NUMBER() OVER (PARTITION BY OutcomeMeasures.PatientID, OutcomeMeasures.MeasureName ORDER BY OutcomeMeasures.TakenOn DESC) AS rn_desc
  FROM OutcomeMeasures
)
SELECT
  ranked.PatientID,
  Patients.Name AS PatientName,
  ranked.MeasureName,
  MAX(CASE WHEN ranked.rn_asc = 1 THEN ranked.Score END) AS BaselineScore,
  MAX(CASE WHEN ranked.rn_desc = 1 THEN ranked.Score END) AS LatestScore,
  MAX(CASE WHEN ranked.rn_desc = 1 THEN ranked.Score END) - MAX(CASE WHEN ranked.rn_asc = 1 THEN ranked.Score END) AS Delta
FROM ranked
INNER JOIN Patients ON Patients.PatientID = ranked.PatientID
GROUP BY ranked.PatientID, Patients.Name, ranked.MeasureName
HAVING BaselineScore IS NOT NULL AND LatestScore IS NOT NULL
ORDER BY Patients.Name ASC, ranked.MeasureName ASC;`;

const TOP_PRESCRIPTIONS_QUERY = `SELECT Exercises.Name AS ExerciseName,
       COUNT(*) AS Prescriptions
FROM SessionExercises
INNER JOIN Exercises ON Exercises.ExerciseID = SessionExercises.ExerciseID
WHERE Exercises.BodyRegion = 'Shoulder'
GROUP BY Exercises.ExerciseID, Exercises.Name
ORDER BY Prescriptions DESC, Exercises.Name ASC
LIMIT 5;`;

const AdminHome = () => {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<OutcomeChange | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const [queryModal, setQueryModal] = useState<{ title: string; query: string } | null>(null);
  const [showTherapistModal, setShowTherapistModal] = useState(false);
  const [therapistForm, setTherapistForm] = useState({
    name: '',
    phone: '',
    dob: '',
    specialty: '',
    username: '',
  });
  const [therapistStatus, setTherapistStatus] = useState<{ variant: 'error' | 'success'; message: string } | null>(null);
  const [therapistLoading, setTherapistLoading] = useState(false);
  const [createdTherapist, setCreatedTherapist] = useState<{ username: string; tempPassword: string } | null>(null);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`${API_BASE_URL}/admin/metrics`);
        if (!response.ok) {
          throw new Error('Unable to load admin metrics right now.');
        }
        const data = await response.json();
        setMetrics(data);
      } catch (metricsError) {
        const message =
          metricsError instanceof Error ? metricsError.message : 'Unable to load admin metrics right now.';
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    if (user?.role === 'admin') {
      fetchMetrics();
    }
  }, [user?.role]);

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (user.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  const handleSignOut = () => {
    setUser(null);
    navigate('/', { replace: true });
  };

  const groupedNoShow = useMemo(() => {
    if (!metrics?.noShowRates) return [];
    const map = new Map<string, NoShowRate[]>();
    metrics.noShowRates.forEach((entry) => {
      if (!map.has(entry.month)) {
        map.set(entry.month, []);
      }
      map.get(entry.month)!.push(entry);
    });
    return Array.from(map.entries()).map(([month, entries]) => ({
      month,
      entries: entries.sort((a, b) => a.therapistName.localeCompare(b.therapistName)),
    }));
  }, [metrics?.noShowRates]);

  const maxPrescriptions = useMemo(() => {
    if (!metrics?.topShoulderExercises?.length) return 0;
    return Math.max(...metrics.topShoulderExercises.map((exercise) => exercise.prescriptions));
  }, [metrics?.topShoulderExercises]);

  const formatMonth = (month: string) => {
    if (!month) return 'Unknown month';
    const parts = month.split('-');
    if (parts.length !== 2) return month;
    const date = new Date(Number(parts[0]), Number(parts[1]) - 1);
    return date.toLocaleString(undefined, { month: 'short', year: 'numeric' });
  };

  const formatDelta = (value: number) => (value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1));
  const formatDate = (value: string) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  const showQueryModal = (title: string, query: string) => {
    setQueryModal({ title, query });
  };

  const toggleTherapistModal = (open: boolean) => {
    setShowTherapistModal(open);
    if (!open) {
      setTherapistForm({
        name: '',
        phone: '',
        dob: '',
        specialty: '',
        username: '',
      });
      setTherapistStatus(null);
      setCreatedTherapist(null);
      setTherapistLoading(false);
    }
  };

  const handleTherapistChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setTherapistForm((current) => ({ ...current, [name]: value }));
  };

  const handleTherapistSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTherapistLoading(true);
    setTherapistStatus(null);
    setCreatedTherapist(null);

    try {
      const response = await fetch(`${API_BASE_URL}/admin/therapists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: therapistForm.name,
          phone: therapistForm.phone,
          dob: therapistForm.dob,
          specialty: therapistForm.specialty,
          username: therapistForm.username,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message ?? 'Unable to create therapist right now.');
      }

      const data = await response.json();
      setTherapistStatus({
        variant: 'success',
        message: 'Therapist account created. Share the temporary password securely.',
      });
      setCreatedTherapist({
        username: data.username,
        tempPassword: data.tempPassword,
      });
    } catch (submissionError) {
      const message =
        submissionError instanceof Error ? submissionError.message : 'Unable to create therapist right now.';
      setTherapistStatus({ variant: 'error', message });
    } finally {
      setTherapistLoading(false);
    }
  };

  const selectedOutcomeHistory = useMemo(() => {
    if (!selectedOutcome || !metrics?.outcomeDetails) return [];
    return metrics.outcomeDetails
      .filter(
        (detail) =>
          detail.patientId === selectedOutcome.patientId && detail.measureName === selectedOutcome.measureName,
      )
      .sort((a, b) => a.takenOn.localeCompare(b.takenOn));
  }, [selectedOutcome, metrics?.outcomeDetails]);

  const selectedExerciseOrders = useMemo(() => {
    if (!selectedExercise || !metrics?.shoulderOrders) return [];
    return metrics.shoulderOrders
      .filter((order) => order.exerciseName === selectedExercise)
      .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate));
  }, [selectedExercise, metrics?.shoulderOrders]);

  return (
    <main className="admin-home">
      <div className="admin-shell">
        <header className="admin-header">
          <div>
            <p className="eyebrow">Admin portal</p>
            <h1>Hi, Admin</h1>
            <p>Monitor at-a-glance trends or sign up new therapists.</p>
          </div>
          <div className="admin-header-actions">
            <button type="button" className="admin-action" onClick={() => toggleTherapistModal(true)}>
              Add therapist
            </button>
            <button type="button" className="admin-signout" onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        </header>

        {error && (
          <div className="admin-status error" role="alert">
            {error}
          </div>
        )}
        {loading && !error ? (
          <div className="admin-status">Loading metrics…</div>
        ) : (
          <div className="admin-grid">
            <section className="admin-panel wide">
              <header>
                <h2>
                  <button
                    type="button"
                    className="panel-title-button"
                    onClick={() => showQueryModal('No-show rate by therapist', NO_SHOW_RATE_QUERY)}
                  >
                    No-show rate by therapist
                  </button>
                </h2>
                <p>Grouped by therapy month so you can spot outliers quickly.</p>
              </header>
              {groupedNoShow.length === 0 ? (
                <p className="empty-state">No session data available yet.</p>
              ) : (
                groupedNoShow.map((block) => (
                  <div className="no-show-group" key={block.month}>
                    <div className="group-heading">{formatMonth(block.month)}</div>
                    {block.entries.map((entry) => (
                      <div className="no-show-row" key={`${block.month}-${entry.therapistId}`}>
                        <div className="no-show-info">
                          <strong>{entry.therapistName}</strong>
                          <span>
                            {entry.noShows}/{entry.totalSessions} visits
                          </span>
                        </div>
                        <div className="no-show-bar">
                          <div
                            className="no-show-bar-fill"
                            style={{ width: `${Math.min(entry.rate * 100, 100)}%` }}
                            aria-label={`${(entry.rate * 100).toFixed(0)}% no-show`}
                          />
                        </div>
                        <div className="no-show-rate">{(entry.rate * 100).toFixed(0)}%</div>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </section>

            <section className="admin-panel">
              <header>
                <h2>
                  <button
                    type="button"
                    className="panel-title-button"
                    onClick={() => showQueryModal('Outcome change from baseline', OUTCOME_CHANGE_QUERY)}
                  >
                    Outcome change from baseline
                  </button>
                </h2>
                <p>Compare the first recorded score to the latest for each instrument.</p>
              </header>
              {metrics?.outcomeChanges?.length ? (
                <ul className="stacked-cards outcome-list">
                  {metrics.outcomeChanges.map((change) => (
                    <li
                      key={`${change.patientId}-${change.measureName}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedOutcome(change)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedOutcome(change);
                        }
                      }}
                    >
                      <div>
                        <strong>{change.patientName}</strong>
                        <span>{change.measureName}</span>
                      </div>
                      <div className="outcome-stats">
                        <p>
                          {change.baselineScore.toFixed(1)} → {change.latestScore.toFixed(1)}
                        </p>
                        <span className={`delta ${change.delta >= 0 ? 'positive' : 'negative'}`}>
                          {formatDelta(change.delta)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-state">No outcome measures recorded yet.</p>
              )}
            </section>

            <section className="admin-panel">
              <header>
                <h2>
                  <button
                    type="button"
                    className="panel-title-button"
                    onClick={() => showQueryModal('Top prescriptions', TOP_PRESCRIPTIONS_QUERY)}
                  >
                    Top prescriptions
                  </button>
                </h2>
                <p>Most frequently assigned exercises across all visits.</p>
              </header>
              {metrics?.topShoulderExercises?.length ? (
                <ul className="stacked-cards exercise-list">
                  {metrics.topShoulderExercises.map((exercise, index) => (
                    <li
                      key={exercise.exerciseName}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedExercise(exercise.exerciseName)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedExercise(exercise.exerciseName);
                        }
                      }}
                    >
                      <div className="exercise-info">
                        <span className="rank">{index + 1}</span>
                        <div>
                          <strong>{exercise.exerciseName}</strong>
                          <span>{exercise.prescriptions} orders</span>
                        </div>
                      </div>
                      <div className="exercise-bar">
                        <div
                          className="exercise-bar-fill"
                          style={{
                            width:
                              maxPrescriptions > 0
                                ? `${Math.max((exercise.prescriptions / maxPrescriptions) * 100, 6)}%`
                                : '6%',
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-state">No exercise prescriptions recorded yet.</p>
              )}
            </section>
          </div>
        )}
      </div>

      {selectedOutcome && (
        <div
          className="admin-modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelectedOutcome(null)}
        >
          <div className="admin-modal" onClick={(event) => event.stopPropagation()}>
            <header className="admin-modal-header">
              <div>
                <p className="eyebrow">Outcome details</p>
                <h3>
                  {selectedOutcome.patientName} · {selectedOutcome.measureName}
                </h3>
              </div>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => setSelectedOutcome(null)}
                aria-label="Close outcome details"
              >
                Close
              </button>
            </header>
            <ul className="detail-list">
              {selectedOutcomeHistory.map((detail) => (
                <li key={detail.outcomeId}>
                  <div>
                    <strong>{detail.score.toFixed(1)}</strong>
                    <span>{formatDate(detail.takenOn)}</span>
                  </div>
                  <p>{detail.notes ?? 'No notes provided.'}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {selectedExercise && (
        <div
          className="admin-modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelectedExercise(null)}
        >
          <div className="admin-modal" onClick={(event) => event.stopPropagation()}>
            <header className="admin-modal-header">
              <div>
                <p className="eyebrow">Exercise orders</p>
                <h3>{selectedExercise}</h3>
              </div>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => setSelectedExercise(null)}
                aria-label="Close exercise orders"
              >
                Close
              </button>
            </header>
            <ul className="detail-list">
              {selectedExerciseOrders.map((order) => (
                <li key={`${order.exerciseName}-${order.sessionId}-${order.patientName}`}>
                  <div>
                    <strong>
                      {order.patientName} with {order.therapistName}
                    </strong>
                    <span>
                      Session #{order.sessionId} · {formatDate(order.sessionDate)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
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
              <code>{queryModal.query}</code>
            </pre>
          </div>
        </div>
      )}

      {showTherapistModal && (
        <div
          className="admin-modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => toggleTherapistModal(false)}
        >
          <div className="admin-modal" onClick={(event) => event.stopPropagation()}>
            <header className="admin-modal-header">
              <div>
                <p className="eyebrow">New therapist</p>
                <h3>Create therapist profile</h3>
              </div>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => toggleTherapistModal(false)}
                aria-label="Close add therapist dialog"
              >
                Close
              </button>
            </header>
            <form className="therapist-form" onSubmit={handleTherapistSubmit}>
              <label>
                Full name
                <input
                  name="name"
                  value={therapistForm.name}
                  onChange={handleTherapistChange}
                  placeholder="Dr. Emily Clark"
                  required
                />
              </label>
              <label>
                Date of birth
                <input name="dob" type="date" value={therapistForm.dob} onChange={handleTherapistChange} required />
              </label>
              <label>
                Phone
                <input
                  name="phone"
                  value={therapistForm.phone}
                  onChange={handleTherapistChange}
                  placeholder="555-123-4567"
                  required
                />
              </label>
              <label>
                Specialty
                <input
                  name="specialty"
                  value={therapistForm.specialty}
                  onChange={handleTherapistChange}
                  placeholder="Shoulder Rehab"
                  required
                />
              </label>
              <label>
                Username
                <input
                  name="username"
                  value={therapistForm.username}
                  onChange={handleTherapistChange}
                  placeholder="therapist@example.com"
                  required
                />
              </label>
              {therapistStatus && (
                <p className={`status ${therapistStatus.variant}`}>{therapistStatus.message}</p>
              )}
              {createdTherapist && (
                <div className="temp-credentials">
                  <p>
                    <strong>Username:</strong> {createdTherapist.username}
                  </p>
                  <p>
                    <strong>Temp password:</strong> {createdTherapist.tempPassword}
                  </p>
                </div>
              )}
              <button type="submit" disabled={therapistLoading} aria-busy={therapistLoading}>
                {therapistLoading ? 'Creating…' : 'Create therapist'}
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
};

export default AdminHome;
