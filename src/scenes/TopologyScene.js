import Phaser from 'phaser';
import { createMockAgenticRuntime } from '../mockAgenticRuntime.js';
import { topology } from '../topologyConfig.js';
import { SceneDirector } from './SceneDirector.js';
import { EventType } from '../events/agenticEvents.js';

const LOCATIONS = {
  cinnabar: { key: 'cinnabarIsland', path: '/assets/pokered/maps/cinnabar-island.json', layer: 'Cinnabar Island' },
  pallet:   { key: 'palletTown',     path: '/assets/pokered/maps/pallet-town.json',     layer: 'Pallet Town'    },
};

const SPRITES = ['abra', 'abrab', 'kadabra', 'kadabrab', 'alakazam', 'alakazamb', 'question', 'shock', 'happy', 'shadow', 'smoke'];

export class TopologyScene extends Phaser.Scene {
  constructor(callbacks = {}) {
    super({ key: 'TopologyScene' });
    this.callbacks = callbacks;
    this.audioReady = false;
    this.currentLocation = 'cinnabar';
    this.director = null;
    this.nodeSounds = new Map();
    this.runtime = null;
    this.unsubscribeRuntime = null;
    this.mapLayer = null;
    this.mapBorder = null;
  }

  preload() {
    this.load.image('overworld', '/assets/pokered/raw/overworld.png');
    Object.values(LOCATIONS).forEach((loc) => this.load.tilemapTiledJSON(loc.key, loc.path));
    SPRITES.forEach((key) => this.load.image(key, `/assets/pokered/sprites/${key}.png`));
  }

  create() {
    this.cameras.main.setBackgroundColor(0xf7f3df);
    this.director = new SceneDirector(this);
    this.createMap(this.currentLocation);
    this.createNodes();
    this.createAgenticRuntime();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.dispose());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.dispose());
  }

  createMap(locationId) {
    this.mapLayer?.destroy();
    this.mapBorder?.destroy();

    const loc = LOCATIONS[locationId];
    const map = this.make.tilemap({ key: loc.key });
    const tileset = map.addTilesetImage('overworld', 'overworld', 8, 8, 0, 0);
    this.mapLayer = map.createLayer(loc.layer, tileset, 160, 72);
    this.mapLayer.setScale(2).setAlpha(0.58).setDepth(0);

    this.mapBorder = this.add.rectangle(480, 360, 656, 592);
    this.mapBorder.setStrokeStyle(4, 0x2d2a24, 0.9).setFillStyle(0xffffff, 0).setDepth(1);
  }

  createNodes() {
    topology.nodes.forEach((node, index) => {
      const container = this.add.container(node.x, node.y).setDepth(8);
      const shadow = this.add.image(0, 24, 'shadow').setScale(2.4).setAlpha(0.28);
      const sprite = this.add.image(0, -4, node.sprite).setScale(1);

      container.add([shadow, sprite]);
      container.setSize(82, 82).setInteractive({ useHandCursor: true });
      container.on('pointerdown', () => this.pingNode(node.id));

      this.nodeSounds.set(node.id, node.sound);
      this.director.registerNode(node.id, { container, shadow, sprite, node, homeX: node.x, homeY: node.y });

      this.tweens.add({
        targets: sprite,
        y: sprite.y - 5,
        duration: 1100 + index * 180,
        yoyo: true, repeat: -1, ease: 'Sine.inOut',
      });
    });
  }

  createAgenticRuntime() {
    this.runtime = createMockAgenticRuntime();
    this.unsubscribeRuntime = this.runtime.subscribe((event) => this.applyAgenticEvent(event));
    this.applyAgenticEvent({
      type: EventType.RUNTIME_READY,
      phase: 'Ready',
      message: 'Click RUN to replay the mock agentic event stream.',
    });
  }

  // — Public API (called by PhaserCanvas via command dispatch) —

  enableAudio() { this.audioReady = true; }

  startMockRun() {
    if (!this.runtime) return;
    this.audioReady = true;
    this.director.resetAll();
    this.runtime.start();
  }

  resetMockRun() {
    if (!this.runtime) return;
    this.runtime.reset();
    this.director.resetAll();
  }

  setLocation(locationId) {
    if (this.currentLocation === locationId) return;
    this.currentLocation = locationId;
    this.createMap(locationId);
    this.playCue('heal');
  }

  // — Event dispatch —
  // Each event type maps to a named director command. Audio stays here
  // because it's a separate concern from canvas animation.

  applyAgenticEvent(event) {
    this.callbacks.onEvent?.(event);

    const { director } = this;
    const { dwellMs } = event;

    const handlers = {
      [EventType.WORKFLOW_STARTED]:   () => { director.resetAll(); this.playCue('heal'); },
      [EventType.WORKFLOW_RESET]:     () => {},
      [EventType.AGENT_STARTED]:      () => director.activateNode(event.agentId, dwellMs),
      [EventType.ARTIFACT_CREATED]:   () => director.completeNode(event.agentId, dwellMs),
      [EventType.SIGNAL_TRANSFERRED]: () => { director.transfer(event.from, event.to, event, dwellMs); this.playCue('heal'); },
      [EventType.WORKFLOW_COMPLETED]: () => { director.completeNode(event.agentId, dwellMs); this.playCue('getItem'); },
    };

    handlers[event.type]?.();
  }

  dispose() {
    this.runtime?.stop();
    this.unsubscribeRuntime?.();
    this.unsubscribeRuntime = null;
  }

  pingNode(id) {
    this.audioReady = true;
    this.playCue(this.nodeSounds.get(id) ?? 'heal');
    this.director.ping(id);
  }

  // — Web Audio —

  playCue(name) {
    if (!this.audioReady) return;
    const context = this.sound.context;
    if (!context) return;
    if (context.state === 'suspended') context.resume();

    const cues = {
      getItem: [[415.3, 0.07], [415.3, 0.07], [415.3, 0.07], [659.25, 0.34], [987.77, 0.2]],
      heal:    [[523.25, 0.16], [659.25, 0.16], [783.99, 0.24]],
      denied:  [[220, 0.1], [0, 0.06], [196, 0.28]],
    };

    let time = context.currentTime;
    for (const [freq, dur] of cues[name] || cues.heal) {
      if (freq > 0) {
        const osc = context.createOscillator();
        const gain = context.createGain();
        osc.type = 'square';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(0.08, time + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
        osc.connect(gain);
        gain.connect(context.destination);
        osc.start(time);
        osc.stop(time + dur + 0.02);
      }
      time += dur;
    }
  }
}
