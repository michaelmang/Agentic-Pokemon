import { PhaserCanvas } from './components/PhaserCanvas';
import { Controls } from './components/Controls';
import { StatusBar } from './components/StatusBar';
import { EventLog } from './components/EventLog';
import { topology } from './topologyConfig';

export function TopologyApp() {
  return (
    <div className="topology-app">
      <header className="topology-title">{topology.title}</header>
      <div className="canvas-area">
        <PhaserCanvas />
        <EventLog />
      </div>
      <footer className="topology-footer">
        <StatusBar />
        <Controls />
      </footer>
    </div>
  );
}
