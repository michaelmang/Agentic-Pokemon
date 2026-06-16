import Phaser from 'phaser';

// — Pure coordinate and timing helpers —
// These live outside the class so they're trivially testable and clearly
// separate from Phaser concerns.

function approachPosition(source, target, clearance = 58) {
  return {
    x: target.container.x + (source.container.x < target.container.x ? -clearance : clearance),
    y: target.container.y + 36,
  };
}

function pulseTiming(dwellMs) {
  const duration = Math.max(120, Math.min(240, dwellMs / 10));
  return { duration, repeat: Math.max(3, Math.floor(dwellMs / (duration * 2)) - 1) };
}

function shakeSteps(dwellMs) {
  return Math.min(520, Math.max(300, dwellMs / 5));
}

function battleName(node) {
  return (node.character?.displayName || node.label || node.id).toUpperCase();
}

function transferVerb(context) {
  const phrase = context.message || context.artifact || context.phase || 'a signal upward';
  return phrase.length > 42 ? `${phrase.slice(0, 39)}...` : phrase;
}

function textStyle(fontSize, bold = false) {
  return {
    fontFamily: 'Courier New, monospace',
    fontSize: `${fontSize}px`,
    color: '#25231f',
    ...(bold && { fontStyle: 'bold' }),
  };
}

// — SceneDirector —
// Owns all Phaser animation logic. Consumers call named operations
// (activateNode, transfer, resetAll) without touching raw Phaser APIs.

export class SceneDirector {
  #scene;
  #nodes = new Map();  // id → { container, shadow, sprite, node, homeX, homeY }
  #overlay = null;
  #timers = [];

  constructor(scene) {
    this.#scene = scene;
  }

  registerNode(id, view) {
    this.#nodes.set(id, view);
  }

  // — Public named operations —

  activateNode(id, dwellMs = 1800) {
    const view = this.#nodes.get(id);
    if (view) this.#pulse(view, 'active', dwellMs);
  }

  completeNode(id, dwellMs = 1800) {
    const view = this.#nodes.get(id);
    if (view) this.#pulse(view, 'complete', dwellMs);
  }

  transfer(fromId, toId, context = {}, dwellMs = 1800) {
    const source = this.#nodes.get(fromId);
    const target = this.#nodes.get(toId);
    if (source) this.#burst(source.node.x, source.node.y, source.node.accent, 10, 22);
    if (target) this.#pulse(target, 'active', dwellMs);
    if (source && target) this.#walkAndOverlay(source, target, context, dwellMs);
  }

  ping(id) {
    const view = this.#nodes.get(id);
    if (view) this.#pulse(view, 'active', 1400);
  }

  resetAll() {
    for (const view of this.#nodes.values()) {
      this.#scene.tweens.killTweensOf(view.container);
      view.sprite.clearTint();
      view.sprite.setAlpha(1);
      view.shadow.setAlpha(0.28);
      view.container.setScale(1).setPosition(view.homeX, view.homeY).setDepth(8);
    }
    this.#clearOverlay();
  }

  // — Private animation primitives —

  #pulse(view, state, dwellMs) {
    const tint = state === 'complete' ? view.node.accent : 0xffffff;
    const { duration, repeat } = pulseTiming(dwellMs);

    view.sprite.setTint(tint);
    view.shadow.setAlpha(0.42);
    this.#shake(view, shakeSteps(dwellMs));

    this.#scene.tweens.add({
      targets: view.container, scaleX: 1.12, scaleY: 1.12,
      duration: 140, yoyo: true, ease: 'Quad.out',
    });
    this.#scene.tweens.add({
      targets: view.sprite,
      alpha: { from: 0.58, to: 1 },
      duration, repeat, yoyo: true, ease: 'Stepped',
      onComplete: () => {
        view.sprite.setAlpha(1);
        if (state !== 'complete') view.sprite.clearTint();
        view.shadow.setAlpha(0.28);
      },
    });
    this.#burst(view.node.x, view.node.y, view.node.accent, state === 'complete' ? 18 : 26);
  }

  #shake(view, duration) {
    const startX = view.container.x;
    this.#scene.tweens.add({
      targets: view.container,
      x: { from: startX - 3, to: startX + 3 },
      duration: 46,
      repeat: Math.max(3, Math.floor(duration / 92)),
      yoyo: true, ease: 'Stepped',
      onComplete: () => {
        if (Math.abs(view.container.x - view.homeX) < 16) view.container.x = view.homeX;
      },
    });
  }

  #burst(x, y, color, count = 20, radius = 34) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 10 + Math.random() * radius;
      const size = Phaser.Math.Between(2, 5);
      const pixel = this.#scene.add
        .rectangle(x + Math.cos(angle) * dist, y + Math.sin(angle) * dist, size, size, color, 0.9)
        .setDepth(12);
      this.#scene.tweens.add({
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

  // — Communication overlay (RPG battle UI) —

  #walkAndOverlay(source, target, context, dwellMs) {
    this.#clearOverlay();
    this.#scene.tweens.killTweensOf(source.container);

    const { x: approachX, y: approachY } = approachPosition(source, target);
    source.container.setDepth(15);

    this.#scene.tweens.add({
      targets: source.container,
      x: approachX, y: approachY,
      duration: 850, ease: 'Sine.inOut',
      onComplete: () => {
        this.#openOverlay(source, target, context, dwellMs);
        this.#timers.push(
          this.#scene.time.delayedCall(Math.max(1200, dwellMs - 500), () => {
            this.#scene.tweens.add({
              targets: source.container,
              x: source.homeX, y: source.homeY,
              duration: 640, ease: 'Sine.inOut',
              onComplete: () => source.container.setDepth(8),
            });
          }),
        );
      },
    });
  }

  #openOverlay(source, target, context, dwellMs) {
    this.#clearOverlay();
    const s = this.#scene;
    const W = s.scale.width;
    const H = s.scale.height;

    const overlay = s.add.container(W / 2, H / 2).setDepth(42);
    const dialogue = s.add.text(-250, 114, '', {
      ...textStyle(15), lineSpacing: 4, wordWrap: { width: 335 },
    });

    overlay.add([
      s.add.rectangle(0, 0, W, H, 0xf7f3df, 0.82),
      s.add.rectangle(0, -10, 592, 380, 0xf9f5e5, 0.98).setStrokeStyle(4, 0x2d2a24),
      s.add.rectangle(-152, -148, 230, 62, 0xffffff, 0.96).setStrokeStyle(3, 0x2d2a24),
      s.add.rectangle(146, 38, 248, 70, 0xffffff, 0.96).setStrokeStyle(3, 0x2d2a24),
      s.add.text(-250, -168, battleName(target.node), textStyle(18, true)),
      s.add.text(48, 10, battleName(source.node), textStyle(18, true)),
      s.add.rectangle(-164, -126, 116, 8, target.node.accent, 0.92).setStrokeStyle(2, 0x2d2a24),
      s.add.rectangle(134, 52, 132, 8, source.node.accent, 0.92).setStrokeStyle(2, 0x2d2a24),
      s.add.image(150, -124, target.node.sprite).setScale(2.2).setTint(target.node.accent),
      s.add.image(-190, 62, source.node.character?.spriteBack || source.node.sprite).setScale(2.6).setTint(source.node.accent),
      s.add.rectangle(-74, 154, 382, 96, 0xffffff, 0.98).setStrokeStyle(3, 0x2d2a24),
      s.add.rectangle(202, 154, 170, 96, 0xffffff, 0.98).setStrokeStyle(3, 0x2d2a24),
      s.add.text(130, 120, 'Run', { ...textStyle(18), lineSpacing: 6 }),
      s.add.text(116, 119, '▶', textStyle(16)),
      dialogue,
    ]);

    this.#overlay = overlay;
    this.#typeLine(dialogue, `${battleName(source.node)} sent ${transferVerb(context)}.`);

    this.#timers.push(
      s.time.delayedCall(Math.max(900, dwellMs * 0.45), () => {
        this.#typeLine(dialogue, `${battleName(target.node)} received the signal.\n\n${context.phase || 'Communication logged'}.`);
        this.#burst(target.node.x, target.node.y, target.node.accent, 18, 28);
      }),
      s.time.delayedCall(Math.max(1700, dwellMs + 700), () => this.#clearOverlay()),
    );
  }

  #clearOverlay() {
    this.#timers.forEach((t) => t.remove(false));
    this.#timers = [];
    this.#overlay?.destroy();
    this.#overlay = null;
  }

  #typeLine(textObject, message) {
    textObject.setText('');
    message.slice(0, 120).split('').forEach((char, i) => {
      this.#timers.push(
        this.#scene.time.delayedCall(i * 18, () => {
          if (textObject.scene) textObject.setText(textObject.text + char);
        }),
      );
    });
  }
}
