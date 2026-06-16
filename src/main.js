import Phaser from 'phaser';
import { createMockAgenticRuntime } from './mockAgenticRuntime.js';
import { topology } from './topologyConfig.js';
import './styles.css';

const GAME_WIDTH = 960;
const GAME_HEIGHT = 720;

const LOCATIONS = {
  cinnabar: {
    label: 'Cinnabar Island',
    key: 'cinnabarIsland',
    path: '/assets/pokered/maps/cinnabar-island.json',
    layer: 'Cinnabar Island',
  },
  pallet: {
    label: 'Pallet Town',
    key: 'palletTown',
    path: '/assets/pokered/maps/pallet-town.json',
    layer: 'Pallet Town',
  },
};

class TopologyScene extends Phaser.Scene {
  constructor() {
    super('TopologyScene');
    this.audioReady = false;
    this.currentLocation = 'cinnabar';
    this.eventLog = [];
    this.logsOpen = false;
    this.logScroll = 0;
    this.logViewport = null;
    this.nodeViews = new Map();
    this.runtime = null;
    this.mapLayer = null;
    this.mapBorder = null;
    this.communicationOverlay = null;
    this.communicationTimers = [];
  }

  preload() {
    this.load.image('overworld', '/assets/pokered/raw/overworld.png');
    Object.values(LOCATIONS).forEach((location) => {
      this.load.tilemapTiledJSON(location.key, location.path);
    });

    this.load.image('abra', '/assets/pokered/sprites/abra.png');
    this.load.image('kadabra', '/assets/pokered/sprites/kadabra.png');
    this.load.image('alakazam', '/assets/pokered/sprites/alakazam.png');
    this.load.image('question', '/assets/pokered/sprites/question.png');
    this.load.image('shock', '/assets/pokered/sprites/shock.png');
    this.load.image('happy', '/assets/pokered/sprites/happy.png');
    this.load.image('shadow', '/assets/pokered/sprites/shadow.png');
    this.load.image('smoke', '/assets/pokered/sprites/smoke.png');
  }

  create() {
    this.cameras.main.setBackgroundColor(0xf7f3df);
    this.createMap(this.currentLocation);
    this.createTitle();
    this.createNodes();
    this.createControls();
    this.createLogPanel();
    this.createAgenticRuntime();
  }

  createMap(locationId) {
    this.mapLayer?.destroy();
    this.mapBorder?.destroy();

    const location = LOCATIONS[locationId];
    const map = this.make.tilemap({ key: location.key });
    const tileset = map.addTilesetImage('overworld', 'overworld', 8, 8, 0, 0);
    this.mapLayer = map.createLayer(location.layer, tileset, 160, 72);
    this.mapLayer.setScale(2);
    this.mapLayer.setAlpha(0.58);
    this.mapLayer.setDepth(0);

    this.mapBorder = this.add.rectangle(480, 360, 656, 592);
    this.mapBorder.setStrokeStyle(4, 0x2d2a24, 0.9);
    this.mapBorder.setFillStyle(0xffffff, 0);
    this.mapBorder.setDepth(1);
  }

  createTitle() {
    this.add.rectangle(480, 36, 520, 44, 0xf9f5e5, 0.94).setStrokeStyle(3, 0x2d2a24).setDepth(20);
    this.add.text(480, 35, topology.title, {
      fontFamily: 'Courier New, monospace',
      fontSize: '20px',
      color: '#25231f',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(21);
  }

  createNodes() {
    topology.nodes.forEach((node, index) => {
      const container = this.add.container(node.x, node.y);
      container.setDepth(8);

      const shadow = this.add.image(0, 24, 'shadow').setScale(2.4).setAlpha(0.28);
      const sprite = this.add.image(0, -4, node.sprite).setScale(1);

      container.add([shadow, sprite]);
      container.setSize(82, 82);
      container.setInteractive({ useHandCursor: true });
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

  createControls() {
    const y = 670;
    this.add.rectangle(480, y, 740, 46, 0xf9f5e5, 0.94).setStrokeStyle(3, 0x2d2a24).setDepth(20);
    this.createButton(202, y, 94, 'RUN', () => this.startMockRun());
    this.createButton(306, y, 94, 'RESET', () => this.resetMockRun());
    this.createButton(410, y, 94, 'LOGS', () => this.toggleLogs());
    this.createButton(568, y, 128, 'CINNABAR', () => this.setLocation('cinnabar'));
    this.createButton(710, y, 116, 'PALLET', () => this.setLocation('pallet'));

    this.statusText = this.add.text(480, 618, 'Ready.', {
      fontFamily: 'Courier New, monospace',
      fontSize: '14px',
      color: '#25231f',
      backgroundColor: '#f9f5e5',
      padding: { x: 8, y: 5 },
      wordWrap: { width: 560 },
    }).setOrigin(0.5).setDepth(20);
  }

  createButton(x, y, width, label, onClick) {
    const button = this.add.container(x, y);
    button.setDepth(22);
    const bg = this.add.rectangle(0, 0, width, 28, 0xffffff, 0.96).setStrokeStyle(2, 0x2d2a24);
    const text = this.add.text(0, 0, label, {
      fontFamily: 'Courier New, monospace',
      fontSize: '13px',
      color: '#25231f',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    button.add([bg, text]);
    button.setSize(width, 28);
    button.setInteractive({ useHandCursor: true });
    button.on('pointerdown', () => {
      this.audioReady = true;
      onClick();
    });
    button.on('pointerover', () => bg.setFillStyle(0xf8eaa5, 1));
    button.on('pointerout', () => bg.setFillStyle(0xffffff, 0.96));
  }

  createLogPanel() {
    this.logPanel = this.add.container(800, 358);
    this.logPanel.setDepth(25);
    const bg = this.add.rectangle(0, 0, 260, 342, 0xf9f5e5, 0.97).setStrokeStyle(3, 0x2d2a24);
    const title = this.add.text(0, -148, 'EVENT LOG', {
      fontFamily: 'Courier New, monospace',
      fontSize: '16px',
      color: '#25231f',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.logViewport = { x: -112, y: -112, width: 206, height: 252 };
    this.logTextBaseY = this.logViewport.y;
    const viewportBorder = this.add.rectangle(
      this.logViewport.x + this.logViewport.width / 2,
      this.logViewport.y + this.logViewport.height / 2,
      this.logViewport.width,
      this.logViewport.height,
      0xffffff,
      0,
    ).setStrokeStyle(1, 0x2d2a24, 0.16);

    const maskShape = this.make.graphics({ add: false });
    maskShape.fillStyle(0xffffff);
    maskShape.fillRect(
      this.logPanel.x + this.logViewport.x,
      this.logPanel.y + this.logViewport.y,
      this.logViewport.width,
      this.logViewport.height,
    );

    this.logText = this.add.text(this.logViewport.x, this.logViewport.y, '--', {
      fontFamily: 'Courier New, monospace',
      fontSize: '10px',
      color: '#514d43',
      lineSpacing: 4,
      wordWrap: { width: this.logViewport.width - 14 },
    });
    this.logText.setMask(maskShape.createGeometryMask());

    this.logScrollbar = this.add.graphics();
    this.logPanel.add([bg, title, viewportBorder, this.logText, this.logScrollbar]);
    this.logPanel.setVisible(false);

    this.input.on('wheel', (pointer, _objects, _deltaX, deltaY) => {
      if (!this.logsOpen || !this.isPointerInLogViewport(pointer)) return;
      this.scrollLog(deltaY);
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

  startMockRun() {
    if (!this.runtime) return;
    this.audioReady = true;
    this.resetNodes();
    this.clearEventLog();
    this.runtime.start();
  }

  resetMockRun() {
    if (!this.runtime) return;
    this.clearEventLog();
    this.runtime.reset();
    this.resetNodes();
  }

  toggleLogs() {
    this.logsOpen = !this.logsOpen;
    this.logPanel.setVisible(this.logsOpen);
    this.updateLogScroll();
  }

  setLocation(locationId) {
    if (this.currentLocation === locationId) return;
    this.currentLocation = locationId;
    this.createMap(locationId);
    this.statusText?.setText(`Location changed: ${LOCATIONS[locationId].label}`);
    this.playCue('heal');
  }

  applyAgenticEvent(event) {
    this.updateStatus(event);
    this.writeEvent(event);

    if (event.type === 'workflow.started') {
      this.resetNodes();
      this.playCue('heal');
      return;
    }

    if (event.type === 'workflow.reset') {
      return;
    }

    if (event.type === 'agent.started') {
      this.setNodeState(event.agentId, 'active', event.dwellMs);
      return;
    }

    if (event.type === 'artifact.created') {
      this.setNodeState(event.agentId, 'complete', event.dwellMs);
      return;
    }

    if (event.type === 'signal.transferred') {
      this.animateTransfer(event.from, event.to, event.dwellMs, event);
      return;
    }

    if (event.type === 'workflow.completed') {
      this.setNodeState(event.agentId, 'complete', event.dwellMs);
      this.playCue('getItem');
    }
  }

  updateStatus(event) {
    this.statusText?.setText(`${event.phase || event.type}: ${event.message || event.artifact || ''}`);
  }

  writeEvent(event) {
    const line = this.formatLogEvent(event);
    this.eventLog = [line, ...this.eventLog].slice(0, 24);
    this.logText?.setText(this.eventLog.join('\n\n'));
    this.logScroll = 0;
    this.updateLogScroll();
  }

  formatLogEvent(event) {
    const detail = event.artifact || event.message || event.phase || '';
    const compactType = event.type
      .replace('workflow.', 'wf.')
      .replace('agent.', 'ag.')
      .replace('artifact.', 'art.')
      .replace('signal.', 'sig.');
    return `${compactType}: ${detail}`;
  }

  clearEventLog() {
    this.eventLog = [];
    this.logText?.setText('--');
    this.logScroll = 0;
    this.updateLogScroll();
  }

  isPointerInLogViewport(pointer) {
    if (!this.logViewport) return false;
    const left = this.logPanel.x + this.logViewport.x;
    const top = this.logPanel.y + this.logViewport.y;
    return (
      pointer.x >= left &&
      pointer.x <= left + this.logViewport.width &&
      pointer.y >= top &&
      pointer.y <= top + this.logViewport.height
    );
  }

  scrollLog(deltaY) {
    const maxScroll = this.getMaxLogScroll();
    this.logScroll = Phaser.Math.Clamp(this.logScroll + deltaY * 0.45, 0, maxScroll);
    this.updateLogScroll();
  }

  getMaxLogScroll() {
    if (!this.logText || !this.logViewport) return 0;
    return Math.max(0, this.logText.height - this.logViewport.height);
  }

  updateLogScroll() {
    if (!this.logText || !this.logViewport) return;

    const maxScroll = this.getMaxLogScroll();
    this.logScroll = Phaser.Math.Clamp(this.logScroll, 0, maxScroll);
    this.logText.y = this.logTextBaseY - this.logScroll;

    const canScroll = maxScroll > 0;
    this.drawLogScrollbar(maxScroll);
    if (!canScroll) return;
  }

  drawLogScrollbar(maxScroll) {
    if (!this.logScrollbar || !this.logViewport || !this.logText) return;

    this.logScrollbar.clear();
    if (maxScroll <= 0) return;

    const trackX = this.logViewport.x + this.logViewport.width + 14;
    const trackTop = this.logViewport.y;
    const trackHeight = this.logViewport.height;
    const thumbHeight = Math.max(28, (this.logViewport.height / this.logText.height) * this.logViewport.height);
    const travel = this.logViewport.height - thumbHeight;
    const progress = this.logScroll / maxScroll;
    const thumbTop = trackTop + progress * travel;

    this.logScrollbar.fillStyle(0xd7d0b8, 0.85);
    this.logScrollbar.fillRect(trackX, trackTop, 6, trackHeight);
    this.logScrollbar.fillStyle(0x514d43, 0.82);
    this.logScrollbar.fillRect(trackX, thumbTop, 6, thumbHeight);
  }

  resetNodes() {
    for (const view of this.nodeViews.values()) {
      this.tweens.killTweensOf(view.container);
      view.sprite.clearTint();
      view.sprite.setAlpha(1);
      view.shadow.setAlpha(0.28);
      view.container.setScale(1);
      view.container.setPosition(view.homeX, view.homeY);
      view.container.setDepth(8);
    }
    this.clearCommunicationOverlay();
  }

  setNodeState(agentId, state, dwellMs = 1800) {
    const view = this.nodeViews.get(agentId);
    if (!view) return;

    this.activateNodeVisual(view, state, dwellMs);
  }

  animateTransfer(from, to, dwellMs = 1800, event = {}) {
    const source = this.nodeViews.get(from);
    const target = this.nodeViews.get(to);
    if (source) {
      this.addNoiseBurst(source.node.x, source.node.y, source.node.accent, 10, 22);
    }
    if (target) {
      this.activateNodeVisual(target, 'active', dwellMs);
    }
    if (source && target) {
      this.walkToCommunicate(source, target, event, dwellMs);
    }
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
    this.tweens.add({
      targets: view.container,
      scaleX: 1.12,
      scaleY: 1.12,
      duration: 140,
      yoyo: true,
      ease: 'Quad.out',
    });
    this.tweens.add({
      targets: view.sprite,
      alpha: { from: 0.58, to: 1 },
      duration: pulseDuration,
      repeat: pulseRepeats,
      yoyo: true,
      ease: 'Stepped',
      onComplete: () => {
        view.sprite.setAlpha(1);
        if (state !== 'complete') {
          view.sprite.clearTint();
        }
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
        if (Math.abs(view.container.x - view.homeX) < 16) {
          view.container.x = view.homeX;
        }
      },
    });
  }

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
    const targetName = this.add.text(-250, -168, this.getBattleName(target.node), {
      fontFamily: 'Courier New, monospace',
      fontSize: '18px',
      color: '#25231f',
      fontStyle: 'bold',
    });
    const sourceName = this.add.text(48, 10, this.getBattleName(source.node), {
      fontFamily: 'Courier New, monospace',
      fontSize: '18px',
      color: '#25231f',
      fontStyle: 'bold',
    });
    const targetBar = this.add.rectangle(-164, -126, 116, 8, target.node.accent, 0.92).setStrokeStyle(2, 0x2d2a24);
    const sourceBar = this.add.rectangle(134, 52, 132, 8, source.node.accent, 0.92).setStrokeStyle(2, 0x2d2a24);
    const targetSprite = this.add.image(150, -124, target.node.sprite).setScale(2.2).setTint(target.node.accent);
    const sourceSprite = this.add.image(-190, 62, source.node.sprite).setScale(2.6).setTint(source.node.accent).setFlipX(true);
    const textBox = this.add.rectangle(-74, 154, 382, 96, 0xffffff, 0.98).setStrokeStyle(3, 0x2d2a24);
    const commandBox = this.add.rectangle(202, 154, 170, 96, 0xffffff, 0.98).setStrokeStyle(3, 0x2d2a24);
    const commandText = this.add.text(130, 120, `Run`, {
      fontFamily: 'Courier New, monospace',
      fontSize: '18px',
      color: '#25231f',
      lineSpacing: 6,
    });
    const pointer = this.add.text(116, 119, '▶', {
      fontFamily: 'Courier New, monospace',
      fontSize: '16px',
      color: '#25231f',
    });
    const dialogue = this.add.text(-250, 114, '', {
      fontFamily: 'Courier New, monospace',
      fontSize: '15px',
      color: '#25231f',
      lineSpacing: 4,
      wordWrap: { width: 335 },
    });

    overlay.add([
      scrim,
      stage,
      targetPlate,
      sourcePlate,
      targetName,
      sourceName,
      targetBar,
      sourceBar,
      targetSprite,
      sourceSprite,
      textBox,
      commandBox,
      commandText,
      pointer,
      dialogue,
    ]);

    this.communicationOverlay = overlay;
    this.typeBattleLine(dialogue, `${this.getBattleName(source.node)} sent ${this.getTransferVerb(event)}.`);
    const replyTimer = this.time.delayedCall(Math.max(900, dwellMs * 0.45), () => {
      this.typeBattleLine(dialogue, `${this.getBattleName(target.node)} received the signal.\n\n${event.phase || 'Communication logged'}.`);
      this.addNoiseBurst(target.node.x, target.node.y, target.node.accent, 18, 28);
    });
    const closeTimer = this.time.delayedCall(Math.max(1700, dwellMs + 700), () => {
      this.clearCommunicationOverlay();
    });
    this.communicationTimers.push(replyTimer, closeTimer);
  }

  clearCommunicationOverlay() {
    for (const timer of this.communicationTimers) {
      timer.remove(false);
    }
    this.communicationTimers = [];
    this.communicationOverlay?.destroy();
    this.communicationOverlay = null;
  }

  typeBattleLine(textObject, message) {
    textObject.setText('');
    const chars = message.slice(0, 120).split('');
    chars.forEach((char, index) => {
      this.communicationTimers.push(
        this.time.delayedCall(index * 18, () => {
          if (!textObject.scene) return;
          textObject.setText(textObject.text + char);
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

  spawnSmoke(x, y) {
    const smoke = this.add.image(x, y, 'smoke').setScale(3).setAlpha(0.8);
    smoke.setDepth(9);
    this.tweens.add({
      targets: smoke,
      y: y - 24,
      alpha: 0,
      duration: 650,
      ease: 'Sine.out',
      onComplete: () => smoke.destroy(),
    });
  }

  addNoiseBurst(x, y, color, count = 20, radius = 34) {
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 10 + Math.random() * radius;
      const size = Phaser.Math.Between(2, 5);
      const pixel = this.add.rectangle(
        x + Math.cos(angle) * distance,
        y + Math.sin(angle) * distance,
        size,
        size,
        color,
        0.9,
      );
      pixel.setDepth(12);
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

  playCue(name) {
    if (!this.audioReady) return;
    const context = this.sound.context;
    if (!context) return;
    if (context.state === 'suspended') {
      context.resume();
    }

    const cues = {
      getItem: [
        [415.3, 0.07],
        [415.3, 0.07],
        [415.3, 0.07],
        [659.25, 0.34],
        [987.77, 0.2],
      ],
      heal: [
        [523.25, 0.16],
        [659.25, 0.16],
        [783.99, 0.24],
      ],
      denied: [
        [220, 0.1],
        [0, 0.06],
        [196, 0.28],
      ],
    };

    let time = context.currentTime;
    for (const [frequency, duration] of cues[name] || cues.heal) {
      if (frequency > 0) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'square';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(0.08, time + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(time);
        oscillator.stop(time + duration + 0.02);
      }
      time += duration;
    }
  }
}

const config = {
  type: Phaser.AUTO,
  parent: 'app',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#f7f3df',
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [TopologyScene],
};

new Phaser.Game(config);
