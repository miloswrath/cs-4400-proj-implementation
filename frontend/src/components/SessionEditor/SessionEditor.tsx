import { useEffect, useMemo, useState, type FormEvent } from 'react';
import './SessionEditor.css';
import type { UpcomingSession } from '../UpcomingSessions/UpcomingSessions';
import type { TherapistOption } from '../ScheduleSession/ScheduleSession';
import { useAuth } from '../../context/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';
const SESSION_STATUSES = ['Scheduled', 'Completed', 'Canceled', 'No-Show'];

type SessionEditorProps = {
  session: UpcomingSession | null;
  therapists: TherapistOption[];
  onClose: () => void;
  onUpdated: () => void;
};

const SessionEditor = ({ session, therapists, onClose, onUpdated }: SessionEditorProps) => {
  const { user } = useAuth();
  const [formValues, setFormValues] = useState({
    therapistId: '',
    sessionDate: '',
    sessionTime: '',
    painPre: 5,
    notes: '',
    status: 'Scheduled',
  });
  const [availableTimes, setAvailableTimes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

  const minDate = useMemo(() => new Date().toISOString().split('T')[0], []);

  useEffect(() => {
    if (session) {
      setFormValues({
        therapistId: String(session.therapistId),
        sessionDate: session.sessionDate,
        sessionTime: session.sessionTime,
        painPre: session.painPre ?? 0,
        notes: session.notes ?? '',
        status: session.status,
      });
    }
  }, [session]);

  useEffect(() => {
    const fetchAvailability = async () => {
      if (!session || !formValues.therapistId || !formValues.sessionDate) {
        setAvailableTimes([]);
        return;
      }
      setAvailabilityLoading(true);
      try {
        const response = await fetch(
          `${API_BASE_URL}/therapists/${formValues.therapistId}/availability?date=${encodeURIComponent(
            formValues.sessionDate,
          )}`,
        );
        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(data?.message ?? 'Unable to load availability.');
        }
        const data = await response.json();
        const slots: string[] = Array.isArray(data?.availableTimes) ? data.availableTimes : [];
        if (!slots.includes(session.sessionTime)) {
          slots.push(session.sessionTime);
        }
        slots.sort();
        setAvailableTimes(slots);
      } catch (error) {
        console.error(error);
        setStatusMessage(error instanceof Error ? error.message : 'Unable to load availability.');
      } finally {
        setAvailabilityLoading(false);
      }
    };

    fetchAvailability();
  }, [session, formValues.therapistId, formValues.sessionDate]);

  if (!session || !user?.patientId) {
    return null;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setStatusMessage(null);

    try {
      const response = await fetch(`${API_BASE_URL}/patients/${user.patientId}/sessions/${session.sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          therapistId: Number(formValues.therapistId),
          sessionDate: formValues.sessionDate,
          sessionTime: formValues.sessionTime,
          painPre: formValues.painPre,
          notes: formValues.notes,
          status: formValues.status,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message ?? 'Unable to update this session right now.');
      }

      onUpdated();
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update this session right now.';
      setStatusMessage(message);
    } finally {
      setLoading(false);
    }
  };

  const therapistOptions = therapists.map((therapist) => (
    <option key={therapist.therapistId} value={therapist.therapistId}>
      {therapist.name} · {therapist.specialty}
    </option>
  ));

  return (
    <div className="session-editor-overlay" role="dialog" aria-modal="true">
      <div className="session-editor">
        <header>
          <div>
            <p className="eyebrow">Modify session</p>
            <h2>Edit appointment details</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <form className="session-editor-form" onSubmit={handleSubmit}>
          <label>
            Therapist
            <select
              value={formValues.therapistId}
              onChange={(event) => setFormValues((current) => ({ ...current, therapistId: event.target.value }))}
              required
            >
              {therapistOptions}
            </select>
          </label>

          <label>
            Date
            <input
              type="date"
              min={minDate}
              value={formValues.sessionDate}
              onChange={(event) => setFormValues((current) => ({ ...current, sessionDate: event.target.value }))}
              required
            />
          </label>

          <div className="editor-timepicker">
            <p>Select a time</p>
            {availabilityLoading && <p className="hint">Checking availability…</p>}
            <div className="time-grid">
              {availableTimes.map((time) => (
                <button
                  key={time}
                  type="button"
                  className={`time-slot ${formValues.sessionTime === time ? 'selected' : ''}`}
                  onClick={() => setFormValues((current) => ({ ...current, sessionTime: time }))}
                  disabled={loading}
                >
                  {time}
                </button>
              ))}
            </div>
          </div>

          <label>
            Pain level: {formValues.painPre}/10
            <input
              type="range"
              min={0}
              max={10}
              value={formValues.painPre}
              onChange={(event) => setFormValues((current) => ({ ...current, painPre: Number(event.target.value) }))}
            />
          </label>

          <label>
            Status
            <select
              value={formValues.status}
              onChange={(event) => setFormValues((current) => ({ ...current, status: event.target.value }))}
            >
              {SESSION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>

          <label>
            Notes
            <textarea
              rows={3}
              value={formValues.notes}
              onChange={(event) => setFormValues((current) => ({ ...current, notes: event.target.value }))}
            />
          </label>

          {statusMessage && <div className="status error">{statusMessage}</div>}

          <button type="submit" disabled={loading} aria-busy={loading}>
            {loading ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default SessionEditor;
