import { useTopologyStore } from '../store/useTopologyStore';

export function Controls() {
  const dispatchCommand = useTopologyStore((s) => s.dispatchCommand);
  const toggleLogs = useTopologyStore((s) => s.toggleLogs);
  const logsOpen = useTopologyStore((s) => s.logsOpen);
  const location = useTopologyStore((s) => s.location);

  return (
    <div className="controls">
      <button className="ctrl-btn" onClick={() => dispatchCommand({ type: 'start' })}>RUN</button>
      <button className="ctrl-btn" onClick={() => dispatchCommand({ type: 'reset' })}>RESET</button>
      <button className={`ctrl-btn${logsOpen ? ' active' : ''}`} onClick={toggleLogs}>LOGS</button>
      <div className="controls-divider" />
      <button
        className={`ctrl-btn${location === 'cinnabar' ? ' active' : ''}`}
        onClick={() => dispatchCommand({ type: 'setLocation', id: 'cinnabar' })}
      >
        CINNABAR
      </button>
      <button
        className={`ctrl-btn${location === 'pallet' ? ' active' : ''}`}
        onClick={() => dispatchCommand({ type: 'setLocation', id: 'pallet' })}
      >
        PALLET
      </button>
    </div>
  );
}
