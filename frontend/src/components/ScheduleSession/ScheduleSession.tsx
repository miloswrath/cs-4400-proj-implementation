import { useEffect, useMemo, useState, type FormEvent } from 'react';
import './ScheduleSession.css';
import { useAuth } from '../../context/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

export type TherapistOption = {
  therapistId: number;
  name: string;
  specialty: string;
};

type StatusMessage = {
  variant: 'success' | 'error';
  message: string;
} | null;

const TIME_OPTIONS = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'];

type ScheduleSessionProps = {
  therapists: TherapistOption[];
  therapistsLoading?: boolean;
  therapistsError?: string | null;
  onScheduled?: () => void;
};

const ScheduleSession = ({ therapists, therapistsLoading = false, therapistsError, onScheduled }: ScheduleSessionProps) => {
  const { user } = useAuth();
  const [selectedTherapist, setSelectedTherapist] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [availableTimes, setAvailableTimes] = useState<string[]>([]);
  const [selectedTime, setSelectedTime] = useState('');
  const [painPre, setPainPre] = useState(5);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [status, setStatus] = useState<StatusMessage>(null);

  const minDate = useMemo(() => new Date().toISOString().split('T')[0], []);

  useEffect(() => {
    const fetchAvailability = async () => {
      if (!selectedTherapist || !selectedDate) {
        setAvailableTimes([]);
        setSelectedTime('');
        return;
      }

      setAvailabilityLoading(true);
      setStatus(null);
      try {
        const response = await fetch(
          `${API_BASE_URL}/therapists/${selectedTherapist}/availability?date=${encodeURIComponent(selectedDate)}`,
        );
        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(data?.message ?? 'Unable to load availability.');
        }
        const data = await response.json();
        setAvailableTimes(Array.isArray(data?.availableTimes) ? data.availableTimes : []);
        setSelectedTime('');
      } catch (error) {
        console.error(error);
        setStatus({ variant: 'error', message: error instanceof Error ? error.message : 'Failed to load availability.' });
      } finally {
        setAvailabilityLoading(false);
      }
    };

    fetchAvailability();
  }, [selectedTherapist, selectedDate]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user?.patientId) {
      setStatus({ variant: 'error', message: 'You must be signed in as a patient to schedule a session.' });
      return;
    }
    if (!selectedTherapist || !selectedDate || !selectedTime) {
      setStatus({ variant: 'error', message: 'Select a therapist, date, and time.' });
      return;
    }

    setLoading(true);
    setStatus(null);

    try {
      const response = await fetch(`${API_BASE_URL}/patients/${user.patientId}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          therapistId: Number(selectedTherapist),
          sessionDate: selectedDate,
          sessionTime: selectedTime,
          painPre,
          notes: notes.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message ?? 'Unable to schedule your session right now.');
      }

      setStatus({ variant: 'success', message: 'Session scheduled! Check your email for confirmation.' });
      onScheduled?.();
      setSelectedTherapist('');
      setSelectedDate('');
      setSelectedTime('');
      setAvailableTimes([]);
      setPainPre(5);
      setNotes('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to schedule your session right now.';
      setStatus({ variant: 'error', message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="schedule-card">
      <div className="schedule-header">
        <p className="eyebrow">New session</p>
        <h2>Book your next visit</h2>
        <p>Choose a therapist, pick a time, and tell us how you’re feeling today.</p>
        {therapistsError && <p className="status error">{therapistsError}</p>}
      </div>

      <form className="schedule-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <label>
            Therapist
            <select
              value={selectedTherapist}
              onChange={(event) => setSelectedTherapist(event.target.value)}
              required
              disabled={therapistsLoading || therapists.length === 0}
            >
              <option value="">{therapistsLoading ? 'Loading therapists…' : 'Select a therapist'}</option>
              {therapists.map((therapist) => (
                <option key={therapist.therapistId} value={therapist.therapistId}>
                  {therapist.name} · {therapist.specialty}
                </option>
              ))}
            </select>
          </label>

          <label>
            Date
            <input
              type="date"
              value={selectedDate}
              min={minDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              required
            />
          </label>
        </div>

        <div className="time-picker">
          <p>Select a time</p>
          {availabilityLoading && <p className="hint">Checking availability…</p>}
          {!availabilityLoading && selectedTherapist && selectedDate && availableTimes.length === 0 && (
            <p className="hint">No times left for this day. Pick another date.</p>
          )}
          <div className="time-grid">
            {TIME_OPTIONS.map((time) => {
              const isAvailable = availableTimes.includes(time);
              return (
                <button
                  key={time}
                  type="button"
                  className={`time-slot ${selectedTime === time ? 'selected' : ''}`}
                  disabled={!isAvailable || loading}
                  onClick={() => setSelectedTime(time)}
                >
                  {time}
                </button>
              );
            })}
          </div>
        </div>

        <label>
          Pain level: {painPre}/10
          <input
            type="range"
            min={0}
            max={10}
            value={painPre}
            onChange={(event) => setPainPre(Number(event.target.value))}
          />
        </label>

        <label>
          Notes (optional)
          <textarea
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Anything you want your therapist to know before the visit?"
          />
        </label>

        {status && <div className={`status ${status.variant}`}>{status.message}</div>}

        <button type="submit" disabled={loading || !selectedTherapist || !selectedDate || !selectedTime} aria-busy={loading}>
          {loading ? 'Booking…' : 'Schedule session'}
        </button>
      </form>
    </section>
  );
};

export default ScheduleSession;
