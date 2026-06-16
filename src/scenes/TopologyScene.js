import Phaser from 'phaser';
import { createMockAgenticRuntime } from '../mockAgenticRuntime.js';
import { topology } from '../topologyConfig.js';

const GAME_WIDTH = 960;
const GAME_HEIGHT = 720;

const LOCATIONS = {
  cinnabar: {
    key: 'cinnabarIsland',
    path: '/assets/pokered/maps/cinnabar-island.json',
    layer: 'Cinnabar Island',
  },
  pallet: {
    key: 'palletTown',
    path: '/assets/pokered/maps/pallet-town.json',
    layer: 'Pallet Town',
  },
};

export class TopologyScene extends Phaser.Scene {
  constructor(callbacks = {}) {
    super({ key: 'TopologyScene' });
    this.callbacks = callbacks;
    this.audioReady = false;
    this.currentLocation = 'cinnabar';
    this.nodeViews = new Map();
    this.runtime = null;
    this.mapLayer = null;
    this.mapBorder = null;
    this.communicationOverlay = null;
    this.communicationTimers = [];
  }

  preload() {
    this.load.image('overworld', '/assets/pokered/raw/overworld.png');
    Object.values(LOCATIONS).forEach((loc) => {
      this.load.tilemapTiledJSON(loc.key, loc.path);
    });
    const sprites = ['abra', 'abrab', 'kadabra', 'kadabrab', 'alakazam', 'alakazamb', 'question', 'shock', 'happy', 'shadow', 'smoke'];
    sprites.forEach((key) => this.load.image(key, `/assets/pokered/sprites/${key}.png`));
  }

  create() {
    this.cameras.main.setBackgroundColor(0xf7f3df);
    this.createMap(this.currentLocation);
    this.createNodes();
    this.createAgenticRuntime();
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

      this.nodeViews.set(node.id, { container, shadow, sprite, node, homeX: node.x, homeY: node.y });

      this.tweens.add({
        targets: sprite,
        y: sprite.y - 5,
        duration: 1100 + index * 180,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });
    });
  }

  createAgenticRuntime() {
    this.runtime = createMockAgenticRuntime();
    this.runtime.subscribe((event) => this.applyAgenticEvent(event));
    this.applyAgenticEvent({
      type: 'runtime.ready',
      phase: 'Ready',
      message: 'Click RUN to replay the mock agentic event stream.',
    });
  }

  // — Public API (called by PhaserCanvas) —

  enableAudio() {
    this.audioReady = true;
  }

  startMockRun() {
    if (!this.runtime) return;
    this.audioReady = true;
    this.resetNodes();
    this.runtime.start();
  }

  resetMockRun() {
    if (!this.runtime) return;
    this.runtime.reset();
    this.resetNodes();
  }

  setLocation(locationId) {
    if (this.currentLocation === locationId) return;
    this.currentLocation = locationId;
    this.createMap(locationId);
    this.playCue('heal');
  }

  // — Event handling —

  applyAgenticEvent(event) {
    this.callbacks.onEvent?.(event);

    if (event.type === 'workflow.started') { this.resetNodes(); this.playCue('heal'); return; }
    if (event.type === 'workflow.reset') return;
    if (event.type === 'agent.started') { this.setNodeState(event.agentId, 'active', event.dwellMs); return; }
    if (event.type === 'artifact.created') { this.setNodeState(event.agentId, 'complete', event.dwellMs); return; }
    if (event.type === 'signal.transferred') { this.animateTransfer(event.from, event.to, event.dwellMs, event); return; }
    if (event.type === 'workflow.completed') {
      this.setNodeState(event.agentId, 'complete', event.dwellMs);
      this.playCue('getItem');
    }
  }

  // — Node state & animation —

  resetNodes() {
    for (const view of this.nodeViews.values()) {
      this.tweens.killTweensOf(view.container);
      view.sprite.clearTint().setAlpha(1);
      view.shadow.setAlpha(0.28);
      view.container.setScale(1).setPosition(view.homeX, view.homeY).setDepth(8);
    }
    this.clearCommunicationOverlay();
  }

  setNodeState(agentId, state, dwellMs = 1800) {
    const view = this.nodeViews.get(agentId);
    if (view) this.activateNodeVisual(view, state, dwellMs);
  }

  animateTransfer(from, to, dwellMs = 1800, event = {}) {
    const source = this.nodeViews.get(from);
    const target = this.nodeViews.get(to);
    if (source) this.addNoiseBurst(source.node.x, source.node.y, source.node.accent, 10, 22);
    if (target) this.activateNodeVisual(target, 'active', dwellMs);
    if (source && target) this.walkToCommunicate(source, target, event, dwellMs);
    this.playCue('heal');
  }

  pingNode(id) {
    this.audioReady = true;
    const view = this.nodeViews.get(id);
    if (!view) return;
    this.playCue(view.node.sound);
    this.activateNodeVisual(view, 'active', 1400);
  }

  activateNodeVisual(view, state, dwellMs = 1800) {
    const tint = state === 'complete' ? view.node.accent : 0xffffff;
    const pulseDuration = Math.max(120, Math.min(240, dwellMs / 10));
    const pulseRepeats = Math.max(3, Math.floor(dwellMs / (pulseDuration * 2)) - 1);

    view.sprite.setTint(tint);
    view.shadow.setAlpha(0.42);
    this.shakeNode(view, Math.min(520, Math.max(300, dwellMs / 5)));
    this.tweens.add({ targets: view.container, scaleX: 1.12, scaleY: 1.12, duration: 140, yoyo: true, ease: 'Quad.out' });
    this.tweens.add({
      targets: view.sprite,
      alpha: { from: 0.58, to: 1 },
      duration: pulseDuration,
      repeat: pulseRepeats,
      yoyo: true,
      ease: 'Stepped',
      onComplete: () => {
        view.sprite.setAlpha(1);
        if (state !== 'complete') view.sprite.clearTint();
        view.shadow.setAlpha(0.28);
      },
    });
    this.addNoiseBurst(view.node.x, view.node.y, view.node.accent, state === 'complete' ? 18 : 26);
  }

  shakeNode(view, duration = 360) {
    const startX = view.container.x;
    this.tweens.add({
      targets: view.container,
      x: { from: startX - 3, to: startX + 3 },
      duration: 46,
      repeat: Math.max(3, Math.floor(duration / 92)),
      yoyo: true,
      ease: 'Stepped',
      onComplete: () => {
        if (Math.abs(view.container.x - view.homeX) < 16) view.container.x = view.homeX;
      },
    });
  }

  // — Communication overlay (RPG battle UI) —

  walkToCommunicate(source, target, event, dwellMs = 1800) {
    this.clearCommunicationOverlay();
    this.tweens.killTweensOf(source.container);

    const approachX = target.container.x + (source.container.x < target.container.x ? -58 : 58);
    const approachY = target.container.y + 36;
    source.container.setDepth(15);

    this.tweens.add({
      targets: source.container,
      x: approachX,
      y: approachY,
      duration: 850,
      ease: 'Sine.inOut',
      onComplete: () => {
        this.openCommunicationOverlay(source, target, event, dwellMs);
        const returnTimer = this.time.delayedCall(Math.max(1200, dwellMs - 500), () => {
          this.tweens.add({
            targets: source.container,
            x: source.homeX,
            y: source.homeY,
            duration: 640,
            ease: 'Sine.inOut',
            onComplete: () => source.container.setDepth(8),
          });
        });
        this.communicationTimers.push(returnTimer);
      },
    });
  }

  openCommunicationOverlay(source, target, event, dwellMs = 1800) {
    this.clearCommunicationOverlay();

    const overlay = this.add.container(480, 360).setDepth(42);
    const scrim = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0xf7f3df, 0.82);
    const stage = this.add.rectangle(0, -10, 592, 380, 0xf9f5e5, 0.98).setStrokeStyle(4, 0x2d2a24);
    const targetPlate = this.add.rectangle(-152, -148, 230, 62, 0xffffff, 0.96).setStrokeStyle(3, 0x2d2a24);
    const sourcePlate = this.add.rectangle(146, 38, 248, 70, 0xffffff, 0.96).setStrokeStyle(3, 0x2d2a24);
    const targetName = this.add.text(-250, -168, this.getBattleName(target.node), { fontFamily: 'Courier New, monospace', fontSize: '18px', color: '#25231f', fontStyle: 'bold' });
    const sourceName = this.add.text(48, 10, this.getBattleName(source.node), { fontFamily: 'Courier New, monospace', fontSize: '18px', color: '#25231f', fontStyle: 'bold' });
    const targetBar = this.add.rectangle(-164, -126, 116, 8, target.node.accent, 0.92).setStrokeStyle(2, 0x2d2a24);
    const sourceBar = this.add.rectangle(134, 52, 132, 8, source.node.accent, 0.92).setStrokeStyle(2, 0x2d2a24);
    const targetSprite = this.add.image(150, -124, target.node.sprite).setScale(2.2).setTint(target.node.accent);
    const sourceSprite = this.add.image(-190, 62, source.node.character?.spriteBack || source.node.sprite).setScale(2.6).setTint(source.node.accent);
    const textBox = this.add.rectangle(-74, 154, 382, 96, 0xffffff, 0.98).setStrokeStyle(3, 0x2d2a24);
    const commandBox = this.add.rectangle(202, 154, 170, 96, 0xffffff, 0.98).setStrokeStyle(3, 0x2d2a24);
    const commandText = this.add.text(130, 120, 'Run', { fontFamily: 'Courier New, monospace', fontSize: '18px', color: '#25231f', lineSpacing: 6 });
    const pointer = this.add.text(116, 119, '▶', { fontFamily: 'Courier New, monospace', fontSize: '16px', color: '#25231f' });
    const dialogue = this.add.text(-250, 114, '', { fontFamily: 'Courier New, monospace', fontSize: '15px', color: '#25231f', lineSpacing: 4, wordWrap: { width: 335 } });

    overlay.add([scrim, stage, targetPlate, sourcePlate, targetName, sourceName, targetBar, sourceBar, targetSprite, sourceSprite, textBox, commandBox, commandText, pointer, dialogue]);
    this.communicationOverlay = overlay;

    this.typeBattleLine(dialogue, `${this.getBattleName(source.node)} sent ${this.getTransferVerb(event)}.`);
    const replyTimer = this.time.delayedCall(Math.max(900, dwellMs * 0.45), () => {
      this.typeBattleLine(dialogue, `${this.getBattleName(target.node)} received the signal.\n\n${event.phase || 'Communication logged'}.`);
      this.addNoiseBurst(target.node.x, target.node.y, target.node.accent, 18, 28);
    });
    const closeTimer = this.time.delayedCall(Math.max(1700, dwellMs + 700), () => this.clearCommunicationOverlay());
    this.communicationTimers.push(replyTimer, closeTimer);
  }

  clearCommunicationOverlay() {
    this.communicationTimers.forEach((t) => t.remove(false));
    this.communicationTimers = [];
    this.communicationOverlay?.destroy();
    this.communicationOverlay = null;
  }

  typeBattleLine(textObject, message) {
    textObject.setText('');
    message.slice(0, 120).split('').forEach((char, index) => {
      this.communicationTimers.push(
        this.time.delayedCall(index * 18, () => {
          if (textObject.scene) textObject.setText(textObject.text + char);
        }),
      );
    });
  }

  getBattleName(node) {
    return (node.character?.displayName || node.label || node.id).toUpperCase();
  }

  getTransferVerb(event) {
    const phrase = event.message || event.artifact || event.phase || 'a signal upward';
    return phrase.length > 42 ? `${phrase.slice(0, 39)}...` : phrase;
  }

  // — Particle effects —

  addNoiseBurst(x, y, color, count = 20, radius = 34) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 10 + Math.random() * radius;
      const size = Phaser.Math.Between(2, 5);
      const pixel = this.add.rectangle(
        x + Math.cos(angle) * distance,
        y + Math.sin(angle) * distance,
        size, size, color, 0.9,
      ).setDepth(12);
      this.tweens.add({
        targets: pixel,
        x: pixel.x + Math.cos(angle) * Phaser.Math.Between(8, 18),
        y: pixel.y + Math.sin(angle) * Phaser.Math.Between(8, 18),
        alpha: 0,
        duration: Phaser.Math.Between(240, 520),
        ease: 'Sine.out',
        onComplete: () => pixel.destroy(),
      });
    }
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
