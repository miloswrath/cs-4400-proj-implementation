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

const AdminHome = () => {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<OutcomeChange | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);

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
          <button type="button" className="admin-signout" onClick={handleSignOut}>
            Sign out
          </button>
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
                <h2>No-show rate by therapist</h2>
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
                <h2>Outcome change from baseline</h2>
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
                <h2>Top prescriptions</h2>
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
    </main>
  );
};

export default AdminHome;
