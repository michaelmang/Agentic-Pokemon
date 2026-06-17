import { useTopologyStore } from '../store/useTopologyStore';
import { RuntimeMode } from '../runtimes/runtimeConfig';

export function Controls() {
  const dispatchCommand = useTopologyStore((s) => s.dispatchCommand);
  const toggleLogs = useTopologyStore((s) => s.toggleLogs);
  const logsOpen = useTopologyStore((s) => s.logsOpen);
  const location = useTopologyStore((s) => s.location);
  const runtimeMode = useTopologyStore((s) => s.runtimeMode);
  const researchTask = useTopologyStore((s) => s.researchTask);
  const setResearchTask = useTopologyStore((s) => s.setResearchTask);

  const runTask = () => dispatchCommand({ type: 'start', task: researchTask });

  return (
    <>
      <label className="research-task">
        <span className="research-task-label">QUESTION</span>
        <input
          className="research-task-input"
          type="text"
          value={researchTask}
          onChange={(event) => setResearchTask(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') runTask();
          }}
        />
      </label>
      <div className="controls">
        <button className="ctrl-btn" onClick={runTask}>RUN</button>
        <button className="ctrl-btn" onClick={() => dispatchCommand({ type: 'reset' })}>RESET</button>
        <button className={`ctrl-btn${logsOpen ? ' active' : ''}`} onClick={toggleLogs}>LOGS</button>
        <div className="controls-divider" />
        <button
          className={`ctrl-btn${runtimeMode === RuntimeMode.MOCK ? ' active' : ''}`}
          onClick={() => dispatchCommand({ type: 'setRuntimeMode', mode: RuntimeMode.MOCK })}
        >
          MOCK
        </button>
        <button
          className={`ctrl-btn${runtimeMode === RuntimeMode.REAL ? ' active' : ''}`}
          onClick={() => dispatchCommand({ type: 'setRuntimeMode', mode: RuntimeMode.REAL })}
        >
          REAL
        </button>
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
    </>
  );
}
