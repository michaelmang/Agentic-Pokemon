import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { TopologyScene } from '../scenes/TopologyScene';
import { useTopologyStore } from '../store/useTopologyStore';

const GAME_CONFIG = {
  type: Phaser.AUTO,
  width: 960,
  height: 720,
  backgroundColor: '#f7f3df',
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

export function PhaserCanvas() {
  const hostRef = useRef(null);
  const gameRef = useRef(null);
  const sceneRef = useRef(null);

  const command = useTopologyStore((s) => s.command);
  const clearCommand = useTopologyStore((s) => s.clearCommand);

  useEffect(() => {
    const scene = new TopologyScene({
      onEvent: (event) => useTopologyStore.getState().applyEvent(event),
      runtimeMode: useTopologyStore.getState().runtimeMode,
    });
    sceneRef.current = scene;

    gameRef.current = new Phaser.Game({
      ...GAME_CONFIG,
      parent: hostRef.current,
      scene: [scene],
    });

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!command || !scene) return;

    scene.enableAudio();
    if (command.type === 'start') scene.startMockRun(command.task);
    else if (command.type === 'reset') scene.resetMockRun();
    else if (command.type === 'setLocation') scene.setLocation(command.id);
    else if (command.type === 'setRuntimeMode') scene.setRuntimeMode(command.mode);

    clearCommand();
  }, [command, clearCommand]);

  return <div ref={hostRef} className="phaser-host" />;
}
