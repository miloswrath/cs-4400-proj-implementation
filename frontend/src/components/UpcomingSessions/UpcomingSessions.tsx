import './UpcomingSessions.css';

export type UpcomingSession = {
  sessionId: number;
  sessionDate: string;
  sessionTime: string;
  therapistName: string;
  therapistId: number;
  specialty?: string | null;
  status: 'Scheduled' | 'Completed' | 'Canceled' | 'No-Show';
  painPre: number | null;
  notes: string | null;
};

type UpcomingSessionsProps = {
  sessions: UpcomingSession[];
  loading: boolean;
  onEdit: (session: UpcomingSession) => void;
  queryTitle: string;
  querySQL: string;
  onShowQuery: (title: string, query: string) => void;
};

const UpcomingSessions = ({ sessions, loading, onEdit, queryTitle, querySQL, onShowQuery }: UpcomingSessionsProps) => (
  <section className="upcoming-card">
    <div className="upcoming-header">
      <p className="eyebrow">Upcoming</p>
      <h2>
        <button type="button" className="panel-title-button" onClick={() => onShowQuery(queryTitle, querySQL)}>
          {queryTitle}
        </button>
      </h2>
      <p>Modify details any time before your appointment.</p>
    </div>

    {loading ? (
      <p>Loading your sessions…</p>
    ) : sessions.length === 0 ? (
      <p className="empty-state">No sessions scheduled yet. Book your first visit to get started.</p>
    ) : (
      <ul className="session-list">
        {sessions.map((session) => (
          <li key={session.sessionId}>
            <div>
              <p className="session-date">
                {new Date(session.sessionDate).toLocaleDateString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
                <span>{session.sessionTime}</span>
              </p>
              <p className="session-therapist">
                {session.therapistName} · {session.specialty ?? 'Therapist'}
              </p>
              <p className="session-status">{session.status}</p>
              {session.notes ? <p className="session-notes">Notes: {session.notes}</p> : null}
            </div>
            <button type="button" onClick={() => onEdit(session)}>
              Modify
            </button>
          </li>
        ))}
      </ul>
    )}
  </section>
);

export default UpcomingSessions;
