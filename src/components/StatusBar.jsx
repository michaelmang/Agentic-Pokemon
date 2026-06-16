import { useTopologyStore } from '../store/useTopologyStore';

export function StatusBar() {
  const status = useTopologyStore((s) => s.status);
  return <div className="status-bar">{status}</div>;
}
