import { useEffect, useRef } from 'react';
import { useTopologyStore } from '../store/useTopologyStore';

export function EventLog() {
  const logsOpen = useTopologyStore((s) => s.logsOpen);
  const eventLog = useTopologyStore((s) => s.eventLog);
  const viewportRef = useRef(null);

  useEffect(() => {
    if (viewportRef.current) viewportRef.current.scrollTop = 0;
  }, [eventLog]);

  if (!logsOpen) return null;

  return (
    <div className="event-log">
      <div className="event-log-title">EVENT LOG</div>
      <div className="event-log-viewport" ref={viewportRef}>
        {eventLog.length === 0 ? (
          <span className="event-log-empty">--</span>
        ) : (
          eventLog.map((line, i) => (
            <p key={i} className="event-log-entry">{line}</p>
          ))
        )}
      </div>
    </div>
  );
}
