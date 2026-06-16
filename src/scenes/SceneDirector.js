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

function beamPoint(from, to, progress, wave = 0) {
  const x = Phaser.Math.Linear(from.x, to.x, progress);
  const y = Phaser.Math.Linear(from.y, to.y, progress);
  const angle = Phaser.Math.Angle.Between(from.x, from.y, to.x, to.y);
  const normal = angle + Math.PI / 2;
  return {
    x: x + Math.cos(normal) * wave,
    y: y + Math.sin(normal) * wave,
  };
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
  #effects = [];
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
    const targetSprite = s.add.image(150, -124, target.node.sprite).setScale(2.2).setTint(target.node.accent);
    const sourceSprite = s.add.image(-190, 62, source.node.character?.spriteBack || source.node.sprite)
      .setScale(2.6)
      .setTint(source.node.accent);
    const beamGlow = s.add.rectangle(-18, -34, 306, 20, 0x8f4cff, 0.28).setRotation(-0.58);
    const beamCore = s.add.rectangle(-18, -34, 296, 10, 0x2dd7ff, 0.88).setRotation(-0.58);
    const beamHot = s.add.rectangle(-18, -34, 296, 4, 0xffffff, 0.95).setRotation(-0.58);
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
      targetSprite,
      sourceSprite,
      beamGlow,
      beamCore,
      beamHot,
      s.add.rectangle(-102, 154, 326, 96, 0xffffff, 0.98).setStrokeStyle(3, 0x2d2a24),
      s.add.rectangle(164, 154, 154, 96, 0xffffff, 0.98).setStrokeStyle(3, 0x2d2a24),
      s.add.text(106, 116, 'MOVE\nPSYBEAM\nACK\nRUN', { ...textStyle(15), lineSpacing: 5 }),
      s.add.text(92, 145, '▶', textStyle(15)),
      dialogue,
    ]);

    this.#overlay = overlay;
    s.tweens.add({
      targets: [beamGlow, beamCore, beamHot],
      alpha: { from: 0.95, to: 0.42 },
      duration: 120,
      repeat: 14,
      yoyo: true,
      ease: 'Stepped',
    });
    this.#typeLine(dialogue, `${battleName(source.node)} used PSYBEAM.\n${transferVerb(context)}.`);
    this.#psybeam(overlay, sourceSprite, targetSprite, source.node.accent, target.node.accent);

    this.#timers.push(
      s.time.delayedCall(Math.max(2100, dwellMs * 0.74), () => {
        this.#typeLine(dialogue, `${battleName(target.node)} received the signal.\n\n${context.phase || 'Communication logged'}.`);
        this.#burst(target.node.x, target.node.y, target.node.accent, 18, 28);
      }),
      s.time.delayedCall(Math.max(1700, dwellMs + 700), () => this.#clearOverlay()),
    );
  }

  #psybeam(overlay, sourceSprite, targetSprite, sourceColor, targetColor) {
    const s = this.#scene;
    const from = { x: sourceSprite.x + 48, y: sourceSprite.y - 12 };
    const to = { x: targetSprite.x - 44, y: targetSprite.y + 10 };
    const angle = Phaser.Math.Angle.Between(from.x, from.y, to.x, to.y);
    const colors = [0xffffff, 0x8f4cff, sourceColor, 0x2dd7ff, 0xff69f9, targetColor];
    const beamBody = [];
    const worldFrom = { x: overlay.x + from.x, y: overlay.y + from.y };
    const worldTo = { x: overlay.x + to.x, y: overlay.y + to.y };

    s.tweens.add({
      targets: sourceSprite,
      x: sourceSprite.x + 14,
      duration: 90,
      yoyo: true,
      ease: 'Quad.out',
    });

    this.#drawPsybeam(worldFrom, worldTo);

    for (let i = 0; i < 18; i++) {
      const progress = (i + 1) / 19;
      const wave = Math.sin(progress * Math.PI * 7) * 16;
      const { x, y } = beamPoint(from, to, progress, wave);
      const segment = s.add
        .rectangle(x, y, 28, 10, colors[i % colors.length], 0.96)
        .setRotation(angle)
        .setDepth(45);
      const highlight = s.add
        .rectangle(x, y, 14, 4, 0xffffff, 0.96)
        .setRotation(angle)
        .setDepth(46);

      beamBody.push(segment, highlight);
      overlay.add([segment, highlight]);
    }

    s.tweens.add({
      targets: beamBody,
      alpha: 0,
      scaleX: 1.2,
      scaleY: 1.2,
      duration: 1750,
      ease: 'Stepped',
      onComplete: () => beamBody.forEach((piece) => piece.destroy()),
    });

    for (let i = 0; i < 28; i++) {
      this.#timers.push(
        s.time.delayedCall(i * 32, () => {
          const progress = (i + 1) / 29;
          const wave = Math.sin(progress * Math.PI * 7) * 16;
          const { x, y } = beamPoint(from, to, progress, wave);
          const segment = s.add
            .rectangle(x, y, Phaser.Math.Between(14, 24), Phaser.Math.Between(4, 8), colors[i % colors.length], 0.95)
            .setRotation(angle)
            .setDepth(45);
          const spark = s.add
            .rectangle(x + Phaser.Math.Between(-5, 5), y + Phaser.Math.Between(-5, 5), 5, 5, 0xffffff, 0.95)
            .setRotation(angle)
            .setDepth(46);

          overlay.add([segment, spark]);
          s.tweens.add({
            targets: [segment, spark],
            alpha: 0,
            scaleX: 1.35,
            scaleY: 1.35,
            duration: 520,
            ease: 'Stepped',
            onComplete: () => {
              segment.destroy();
              spark.destroy();
            },
          });
        }),
      );
    }

    this.#timers.push(
      s.time.delayedCall(1240, () => {
        for (let i = 0; i < 12; i++) {
          const ring = s.add
            .rectangle(to.x, to.y, 8 + i * 4, 8 + i * 4, colors[i % colors.length], 0)
            .setStrokeStyle(2, colors[i % colors.length], 0.9)
            .setRotation(Math.PI / 4)
            .setDepth(46);
          overlay.add(ring);
          s.tweens.add({
            targets: ring,
            scaleX: 1.6,
            scaleY: 1.6,
            alpha: 0,
            duration: 300 + i * 18,
            ease: 'Sine.out',
            onComplete: () => ring.destroy(),
          });
        }
        s.tweens.add({
          targets: targetSprite,
          x: { from: targetSprite.x - 5, to: targetSprite.x + 5 },
          duration: 42,
          repeat: 8,
          yoyo: true,
          ease: 'Stepped',
          onComplete: () => {
            targetSprite.x = 150;
          },
        });
      }),
    );
  }

  #drawPsybeam(from, to) {
    const s = this.#scene;
    const lineBack = s.add.line(0, 0, from.x, from.y, to.x, to.y, 0x8f4cff, 0.72)
      .setOrigin(0)
      .setLineWidth(18)
      .setDepth(61);
    const lineMid = s.add.line(0, 0, from.x, from.y, to.x, to.y, 0x2dd7ff, 0.92)
      .setOrigin(0)
      .setLineWidth(10)
      .setDepth(62);
    const lineHot = s.add.line(0, 0, from.x, from.y, to.x, to.y, 0xffffff, 0.95)
      .setOrigin(0)
      .setLineWidth(4)
      .setDepth(63);
    const beam = s.add.graphics().setDepth(60);
    const beamLines = [lineBack, lineMid, lineHot];
    const drawWave = (width, color, alpha, offset = 0) => {
      beam.lineStyle(width, color, alpha);
      beam.beginPath();
      for (let i = 0; i <= 28; i++) {
        const progress = i / 28;
        const point = beamPoint(from, to, progress, Math.sin(progress * Math.PI * 7) * 18 + offset);
        if (i === 0) beam.moveTo(point.x, point.y);
        else beam.lineTo(point.x, point.y);
      }
      beam.strokePath();
    };

    drawWave(16, 0x8f4cff, 0.58, 0);
    drawWave(9, 0x2dd7ff, 0.9, 4);
    drawWave(4, 0xffffff, 0.96, -4);

    this.#effects.push(beam, ...beamLines);
    s.tweens.add({
      targets: [beam, ...beamLines],
      alpha: 0,
      duration: 1750,
      ease: 'Stepped',
      onComplete: () => {
        Phaser.Utils.Array.Remove(this.#effects, beam);
        beamLines.forEach((line) => Phaser.Utils.Array.Remove(this.#effects, line));
        beam.destroy();
        beamLines.forEach((line) => line.destroy());
      },
    });
  }

  #clearOverlay() {
    this.#timers.forEach((t) => t.remove(false));
    this.#timers = [];
    this.#effects.forEach((effect) => effect.destroy());
    this.#effects = [];
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
