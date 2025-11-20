import './PastSessions.css';
import type { UpcomingSession } from '../UpcomingSessions/UpcomingSessions';

type PastSessionsProps = {
  sessions: UpcomingSession[];
  loading: boolean;
  queryTitle: string;
  querySQL: string;
  onShowQuery: (title: string, query: string) => void;
};

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

const PastSessions = ({ sessions, loading, queryTitle, querySQL, onShowQuery }: PastSessionsProps) => (
  <section className="past-card">
    <div className="past-header">
      <p className="eyebrow">History</p>
      <h2>
        <button type="button" className="panel-title-button" onClick={() => onShowQuery(queryTitle, querySQL)}>
          {queryTitle}
        </button>
      </h2>
      <p>Review completed, canceled, or no-show visits.</p>
    </div>

    {loading ? (
      <p>Loading your past sessions…</p>
    ) : sessions.length === 0 ? (
      <p className="empty-state">No previous sessions yet. Your history will appear here after your first visit.</p>
    ) : (
      <ul className="past-session-list">
        {sessions.map((session) => (
          <li key={`past-${session.sessionId}`}>
            <div>
              <p className="session-date">
                {formatDate(session.sessionDate)}
                <span>{session.sessionTime}</span>
              </p>
              <p className="session-therapist">
                {session.therapistName} · {session.specialty ?? 'Therapist'}
              </p>
              <p className={`session-status badge status-${session.status.replace(/\\s+/g, '').toLowerCase()}`}>
                {session.status}
              </p>
              {session.notes ? <p className="session-notes">Notes: {session.notes}</p> : null}
            </div>
          </li>
        ))}
      </ul>
    )}
  </section>
);

export default PastSessions;
