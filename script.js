const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const scoreValue = document.getElementById("scoreValue");
const levelValue = document.getElementById("levelValue");
const shotsValue = document.getElementById("shotsValue");
const bestValue = document.getElementById("bestValue");
const streakValue = document.getElementById("streakValue");
const messageText = document.getElementById("messageText");
const restartButton = document.getElementById("restartButton");
const overlay = document.getElementById("overlay");
const overlayText = document.getElementById("overlayText");
const overlayButton = document.getElementById("overlayButton");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const FLOOR_Y = HEIGHT - 86;
const BALL_RADIUS = 16;
let audioContext = null;
const LEVELS = [
  { hoopX: 720, hoopY: 220, move: 0, targetMakes: 2, guide: true, wind: 0 },
  { hoopX: 810, hoopY: 210, move: 0, targetMakes: 2, guide: true, wind: 0 },
  { hoopX: 835, hoopY: 195, move: 0.85, targetMakes: 3, guide: true, wind: 0.004 },
  { hoopX: 840, hoopY: 185, move: 1.15, targetMakes: 3, guide: false, wind: 0.006 },
  { hoopX: 870, hoopY: 170, move: 1.5, targetMakes: 4, guide: false, wind: 0.009 }
];

const game = {
  state: "menu",
  score: 0,
  best: Number(localStorage.getItem("basketball-best-score") || 0),
  levelIndex: 0,
  shotsLeft: 5,
  makesThisLevel: 0,
  streak: 0,
  shotInFlight: false,
  dragging: false,
  dragPoint: null,
  pointerId: null,
  justScored: false,
  lastTime: 0,
  levelBannerTimer: 0,
  rimSoundTimer: 0
};

const ball = {
  x: 170,
  y: FLOOR_Y - BALL_RADIUS,
  prevX: 170,
  prevY: FLOOR_Y - BALL_RADIUS,
  vx: 0,
  vy: 0,
  rotation: 0,
  resting: true
};

const hoop = {
  x: LEVELS[0].hoopX,
  y: LEVELS[0].hoopY,
  rimRadius: 44,
  netHeight: 58,
  baseX: LEVELS[0].hoopX,
  direction: 1,
  backboardWidth: 28,
  backboardHeight: 158,
  netSwing: 0,
  scoreFlashTimer: 0
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getCurrentLevel() {
  return LEVELS[Math.min(game.levelIndex, LEVELS.length - 1)];
}

function resetBall() {
  ball.x = 170;
  ball.y = FLOOR_Y - BALL_RADIUS;
  ball.prevX = ball.x;
  ball.prevY = ball.y;
  ball.vx = 0;
  ball.vy = 0;
  ball.rotation = 0;
  ball.resting = true;
  game.shotInFlight = false;
  game.dragging = false;
  game.dragPoint = null;
  game.pointerId = null;
  game.justScored = false;
}

function triggerScoreCelebration() {
  hoop.netSwing = 18;
  hoop.scoreFlashTimer = 40;
  playScoreSound();
  playCrowdCheer();
}

function ensureAudioContext() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return null;
    }
    audioContext = new AudioContextClass();
  }

  if (audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
  }

  return audioContext;
}

function playScoreSound() {
  const ctxAudio = ensureAudioContext();
  if (!ctxAudio) {
    return;
  }

  const now = ctxAudio.currentTime;
  const gain = ctxAudio.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
  gain.connect(ctxAudio.destination);

  const toneA = ctxAudio.createOscillator();
  toneA.type = "triangle";
  toneA.frequency.setValueAtTime(660, now);
  toneA.frequency.exponentialRampToValueAtTime(880, now + 0.14);
  toneA.connect(gain);
  toneA.start(now);
  toneA.stop(now + 0.18);

  const toneB = ctxAudio.createOscillator();
  toneB.type = "sine";
  toneB.frequency.setValueAtTime(990, now + 0.08);
  toneB.frequency.exponentialRampToValueAtTime(1320, now + 0.24);
  toneB.connect(gain);
  toneB.start(now + 0.08);
  toneB.stop(now + 0.3);
}

function playCrowdCheer() {
  const ctxAudio = ensureAudioContext();
  if (!ctxAudio) {
    return;
  }

  const now = ctxAudio.currentTime;
  const master = ctxAudio.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.075, now + 0.03);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
  master.connect(ctxAudio.destination);

  const buffer = ctxAudio.createBuffer(1, Math.floor(ctxAudio.sampleRate * 1.15), ctxAudio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    const t = i / data.length;
    const wobble = 0.65 + 0.35 * Math.sin(t * 18);
    data[i] = (Math.random() * 2 - 1) * (1 - t) * wobble;
  }

  const source = ctxAudio.createBufferSource();
  source.buffer = buffer;

  const crowdFilter = ctxAudio.createBiquadFilter();
  crowdFilter.type = "bandpass";
  crowdFilter.frequency.setValueAtTime(820, now);
  crowdFilter.frequency.linearRampToValueAtTime(1200, now + 0.4);
  crowdFilter.Q.setValueAtTime(0.8, now);

  const crowdGain = ctxAudio.createGain();
  crowdGain.gain.setValueAtTime(1, now);
  source.connect(crowdFilter);
  crowdFilter.connect(crowdGain);
  crowdGain.connect(master);
  source.start(now);
  source.stop(now + 1.05);

  const chant = ctxAudio.createOscillator();
  const chantGain = ctxAudio.createGain();
  chant.type = "triangle";
  chant.frequency.setValueAtTime(330, now + 0.06);
  chant.frequency.linearRampToValueAtTime(392, now + 0.24);
  chant.frequency.linearRampToValueAtTime(310, now + 0.42);
  chantGain.gain.setValueAtTime(0.0001, now);
  chantGain.gain.exponentialRampToValueAtTime(0.018, now + 0.05);
  chantGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.48);
  chant.connect(chantGain);
  chantGain.connect(master);
  chant.start(now + 0.04);
  chant.stop(now + 0.5);
}

function playRimSound() {
  const ctxAudio = ensureAudioContext();
  if (!ctxAudio) {
    return;
  }

  const now = ctxAudio.currentTime;
  const gain = ctxAudio.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.09, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
  gain.connect(ctxAudio.destination);

  const osc = ctxAudio.createOscillator();
  osc.type = "square";
  osc.frequency.setValueAtTime(480, now);
  osc.frequency.exponentialRampToValueAtTime(250, now + 0.16);
  osc.connect(gain);
  osc.start(now);
  osc.stop(now + 0.18);
}

function playBounceSound(speed) {
  const ctxAudio = ensureAudioContext();
  if (!ctxAudio || speed < 2.2) {
    return;
  }

  const now = ctxAudio.currentTime;
  const level = Math.min(0.12, 0.04 + speed * 0.01);
  const gain = ctxAudio.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(level, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
  gain.connect(ctxAudio.destination);

  const osc = ctxAudio.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(140, now);
  osc.frequency.exponentialRampToValueAtTime(78, now + 0.2);
  osc.connect(gain);
  osc.start(now);
  osc.stop(now + 0.22);
}

function applyLevelSettings() {
  const level = getCurrentLevel();
  hoop.baseX = level.hoopX;
  hoop.x = level.hoopX;
  hoop.y = level.hoopY;
  hoop.direction = 1;
  game.shotsLeft = 5;
  game.makesThisLevel = 0;
  game.levelBannerTimer = 180;
  resetBall();
  setMessage(`Level ${game.levelIndex + 1}: First to ${level.targetMakes} baskets!`);
}

function setMessage(text) {
  messageText.textContent = text;
}

function updateHud() {
  scoreValue.textContent = game.score;
  levelValue.textContent = game.levelIndex + 1;
  shotsValue.textContent = game.shotsLeft;
  bestValue.textContent = game.best;
  streakValue.textContent = game.streak;
}

function saveBestScore() {
  if (game.score > game.best) {
    game.best = game.score;
    localStorage.setItem("basketball-best-score", String(game.best));
  }
}

function startGame() {
  game.state = "playing";
  game.score = 0;
  game.levelIndex = 0;
  game.streak = 0;
  overlay.classList.add("hidden");
  overlayButton.textContent = "Play Again";
  applyLevelSettings();
  updateHud();
}

function endGame(reason) {
  game.state = "gameover";
  saveBestScore();
  updateHud();
  overlay.classList.remove("hidden");
  overlayText.textContent = `${reason} Final score: ${game.score}. Best score: ${game.best}.`;
  setMessage("Press Try Again to jump back in.");
}

function levelUp() {
  game.levelIndex += 1;
  if (game.levelIndex >= LEVELS.length) {
    endGame("You beat every level");
    return;
  }

  setMessage("Level up! The next shot is tougher.");
  applyLevelSettings();
  updateHud();
}

function shootBall(targetX, targetY) {
  if (!ball.resting || game.state !== "playing" || game.shotsLeft <= 0) {
    return;
  }

  const dx = targetX - ball.x;
  const dy = targetY - ball.y;
  const power = clamp(Math.hypot(dx, dy), 30, 170);
  const speedScale = 0.14;

  ball.vx = dx * speedScale;
  ball.vy = dy * speedScale;
  ball.prevX = ball.x;
  ball.prevY = ball.y;
  ball.resting = false;
  game.shotInFlight = true;
  game.justScored = false;
  game.shotsLeft -= 1;
  setMessage("Shoot!");
  updateHud();
}

function nextShotAfterDelay() {
  window.setTimeout(() => {
    if (game.state === "playing" && !game.dragging) {
      resetBall();
      updateHud();
    }
  }, 650);
}

function registerScore() {
  if (game.justScored) {
    return;
  }

  game.justScored = true;
  game.makesThisLevel += 1;
  game.streak += 1;
  const comboBonus = game.streak >= 2 ? game.streak : 0;
  game.score += 1 + comboBonus;
  triggerScoreCelebration();
  saveBestScore();
  updateHud();

  if (comboBonus > 0) {
    setMessage(`Nice shot! Combo bonus +${comboBonus}!`);
  } else {
    setMessage("Nice shot!");
  }

  if (game.makesThisLevel >= getCurrentLevel().targetMakes) {
    window.setTimeout(levelUp, 900);
  } else {
    nextShotAfterDelay();
  }
}

function missShot() {
  if (game.justScored) {
    return;
  }

  game.streak = 0;
  updateHud();
  if (game.shotsLeft <= 0) {
    const needed = getCurrentLevel().targetMakes;
    if (game.makesThisLevel >= needed) {
      window.setTimeout(levelUp, 700);
    } else {
      endGame("Out of shots");
    }
    return;
  }

  setMessage("Almost! Aim a little higher or stronger.");
  nextShotAfterDelay();
}

function updateBall() {
  if (ball.resting) {
    return;
  }

  const level = getCurrentLevel();
  const backboardLeft = hoop.x + 46;
  const backboardRight = backboardLeft + hoop.backboardWidth;
  const backboardTop = hoop.y - hoop.backboardHeight / 2;
  const backboardBottom = hoop.y + hoop.backboardHeight / 2;
  const rimLeft = hoop.x - hoop.rimRadius + 8;
  const rimRight = hoop.x + hoop.rimRadius - 8;
  const rimY = hoop.y + 4;

  ball.prevX = ball.x;
  ball.prevY = ball.y;

  ball.vx += level.wind;
  ball.vy += 0.22;
  ball.x += ball.vx;
  ball.y += ball.vy;
  ball.rotation += ball.vx * 0.04;

  if (
    ball.vx > 0 &&
    ball.x + BALL_RADIUS >= backboardLeft &&
    ball.prevX + BALL_RADIUS <= backboardLeft &&
    ball.y + BALL_RADIUS >= backboardTop &&
    ball.y - BALL_RADIUS <= backboardBottom
  ) {
    ball.x = backboardLeft - BALL_RADIUS;
    ball.vx = -Math.abs(ball.vx) * 0.42;
    ball.vy = Math.max(ball.vy * 0.72 + 0.9, -1.2);
  } else if (
    ball.vx < 0 &&
    ball.x - BALL_RADIUS <= backboardRight &&
    ball.prevX - BALL_RADIUS >= backboardRight &&
    ball.y + BALL_RADIUS >= backboardTop &&
    ball.y - BALL_RADIUS <= backboardBottom
  ) {
    ball.x = backboardRight + BALL_RADIUS;
    ball.vx = Math.abs(ball.vx) * 0.42;
    ball.vy = Math.max(ball.vy * 0.72 + 0.9, -1.2);
  }

  // Count a basket when the ball drops through the rim opening from above.
  if (
    !game.justScored &&
    ball.vy > 0 &&
    ball.prevY <= rimY &&
    ball.y >= rimY &&
    ball.x > rimLeft &&
    ball.x < rimRight
  ) {
    registerScore();
  }

  if (ball.x > hoop.x - hoop.rimRadius - BALL_RADIUS && ball.x < hoop.x - 20 && Math.abs(ball.y - hoop.y) < 10) {
    ball.vx = -Math.abs(ball.vx) * 0.9;
    ball.vy *= 0.75;
    if (game.rimSoundTimer <= 0) {
      playRimSound();
      game.rimSoundTimer = 8;
    }
  }

  if (ball.x > hoop.x + 20 && ball.x < hoop.x + hoop.rimRadius + BALL_RADIUS && Math.abs(ball.y - hoop.y) < 10) {
    ball.vx = Math.abs(ball.vx) * 0.9;
    ball.vy *= 0.75;
    if (game.rimSoundTimer <= 0) {
      playRimSound();
      game.rimSoundTimer = 8;
    }
  }

  if (ball.y + BALL_RADIUS >= FLOOR_Y) {
    const impactSpeed = Math.abs(ball.vy);
    ball.y = FLOOR_Y - BALL_RADIUS;
    ball.vy *= -0.38;
    ball.vx *= 0.72;
    playBounceSound(impactSpeed);

    if (Math.abs(ball.vy) < 1.5) {
      missShot();
      resetBall();
    }
  }

  if (ball.x < -50 || ball.x > WIDTH + 50 || ball.y > HEIGHT + 80) {
    missShot();
    resetBall();
  }
}

function updateHoop() {
  const level = getCurrentLevel();
  if (!level.move || game.state !== "playing") {
    hoop.x = hoop.baseX;
    return;
  }

  hoop.x += level.move * hoop.direction;
  const maxOffset = 48;
  if (hoop.x > hoop.baseX + maxOffset || hoop.x < hoop.baseX - maxOffset) {
    hoop.direction *= -1;
  }
}

function updateCelebration() {
  if (hoop.netSwing > 0.2) {
    hoop.netSwing *= 0.85;
  } else {
    hoop.netSwing = 0;
  }

  if (hoop.scoreFlashTimer > 0) {
    hoop.scoreFlashTimer -= 1;
  }

  if (game.rimSoundTimer > 0) {
    game.rimSoundTimer -= 1;
  }
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  gradient.addColorStop(0, "#455a73");
  gradient.addColorStop(0.45, "#62748b");
  gradient.addColorStop(0.46, "#d7dde5");
  gradient.addColorStop(1, "#bdc7d3");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "#31455c";
  ctx.fillRect(0, 0, WIDTH, 84);

  for (let x = 18; x < WIDTH; x += 84) {
    ctx.fillStyle = "rgba(255, 246, 220, 0.16)";
    ctx.fillRect(x, 18, 52, 12);
  }

  ctx.fillStyle = "#5e7189";
  ctx.fillRect(0, 84, WIDTH, 36);

  const bleachers = [
    { x: 0, y: 124, w: 240, h: 146, direction: 1 },
    { x: 664, y: 144, w: 296, h: 126, direction: -1 }
  ];

  bleachers.forEach((section) => {
    ctx.fillStyle = "#a51f2a";
    ctx.beginPath();
    if (section.direction === 1) {
      ctx.moveTo(section.x, section.y);
      ctx.lineTo(section.x + section.w, section.y + section.h);
      ctx.lineTo(section.x, section.y + section.h);
    } else {
      ctx.moveTo(section.x + section.w, section.y);
      ctx.lineTo(section.x, section.y + section.h);
      ctx.lineTo(section.x + section.w, section.y + section.h);
    }
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 2;
    for (let row = 0; row < 7; row += 1) {
      const t = row / 6;
      const y = section.y + t * section.h;
      ctx.beginPath();
      if (section.direction === 1) {
        ctx.moveTo(section.x, y);
        ctx.lineTo(section.x + t * section.w, section.y + section.h);
      } else {
        ctx.moveTo(section.x + section.w, y);
        ctx.lineTo(section.x + section.w - t * section.w, section.y + section.h);
      }
      ctx.stroke();
    }

    for (let row = 0; row < 4; row += 1) {
      for (let seat = 0; seat < 10; seat += 1) {
        const offset = row * 12;
        const px = section.direction === 1
          ? section.x + 18 + seat * 18 + offset
          : section.x + section.w - 28 - seat * 18 - offset;
        const py = section.y + 18 + row * 24;
        ctx.fillStyle = "#7e121b";
        ctx.fillRect(px, py, 12, 10);
        ctx.fillStyle = ["#f2c6a8", "#d99a73", "#8f5b3f", "#f6d6bf"][(row + seat) % 4];
        ctx.beginPath();
        ctx.arc(px + 6, py - 5, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#243445";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px + 6, py);
        ctx.lineTo(px + 6, py + 8);
        ctx.stroke();
      }
    }
  });

  ctx.fillStyle = "#44566d";
  ctx.fillRect(246, 140, 150, 120);
  ctx.fillStyle = "#1b2330";
  ctx.fillRect(254, 148, 134, 104);

  for (let y = 132; y < FLOOR_Y - 34; y += 44) {
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WIDTH, y);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(26, 36, 48, 0.22)";
  for (let x = 0; x < WIDTH; x += 64) {
    ctx.fillRect(x, 120, 34, FLOOR_Y - 120);
  }

  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(0, FLOOR_Y - 26, WIDTH, 26);
}

function drawCourt() {
  ctx.fillStyle = "#bb5a2d";
  ctx.fillRect(0, FLOOR_Y, WIDTH, HEIGHT - FLOOR_Y);

  const woodGradient = ctx.createLinearGradient(0, FLOOR_Y, 0, HEIGHT);
  woodGradient.addColorStop(0, "#d9894f");
  woodGradient.addColorStop(1, "#a95228");
  ctx.fillStyle = woodGradient;
  ctx.fillRect(0, FLOOR_Y, WIDTH, HEIGHT - FLOOR_Y);

  for (let x = 0; x < WIDTH; x += 120) {
    ctx.fillStyle = x % 240 === 0 ? "rgba(255, 214, 160, 0.18)" : "rgba(120, 58, 26, 0.12)";
    ctx.fillRect(x, FLOOR_Y, 60, HEIGHT - FLOOR_Y);
  }

  ctx.fillStyle = "rgba(162, 74, 34, 0.95)";
  ctx.fillRect(0, FLOOR_Y, WIDTH, 8);

  ctx.strokeStyle = "rgba(255, 248, 230, 0.86)";
  ctx.lineWidth = 4;

  ctx.beginPath();
  ctx.moveTo(0, FLOOR_Y);
  ctx.lineTo(WIDTH, FLOOR_Y);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(230, FLOOR_Y, 108, Math.PI, 0);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(230, FLOOR_Y, 20, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.rect(0, FLOOR_Y - 150, 170, 150);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(170, FLOOR_Y, 72, Math.PI / 2, Math.PI * 1.5);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(90, FLOOR_Y - 150);
  ctx.lineTo(90, FLOOR_Y);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(WIDTH / 2, FLOOR_Y + 64, 92, Math.PI, Math.PI * 2);
  ctx.stroke();
}

function drawHoop() {
  const backboardLeft = hoop.x + 46;
  const backboardTop = hoop.y - hoop.backboardHeight / 2;
  const flash = hoop.scoreFlashTimer > 0 ? hoop.scoreFlashTimer / 40 : 0;

  ctx.fillStyle = flash > 0 ? `rgba(255, 255, 255, ${0.86 + flash * 0.14})` : "#f8fbff";
  ctx.fillRect(backboardLeft, backboardTop, hoop.backboardWidth, hoop.backboardHeight);

  ctx.fillStyle = "#d73d2b";
  ctx.fillRect(hoop.x + 18, hoop.y - 16, 74, 12);

  ctx.strokeStyle = "rgba(220, 70, 50, 0.85)";
  ctx.lineWidth = 3;
  ctx.strokeRect(backboardLeft - 8, backboardTop + 46, 34, 30);

  ctx.strokeStyle = "#ff5b33";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(hoop.x - hoop.rimRadius, hoop.y);
  ctx.lineTo(hoop.x + hoop.rimRadius, hoop.y);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 2;
  const swing = hoop.netSwing;
  for (let i = -36; i <= 36; i += 18) {
    const sway = (i / 18) * swing * 0.5;
    ctx.beginPath();
    ctx.moveTo(hoop.x + i, hoop.y + 3);
    ctx.lineTo(hoop.x + i * 0.25 + sway, hoop.y + hoop.netHeight);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.moveTo(hoop.x - 34 + swing * 0.2, hoop.y + 18);
  ctx.lineTo(hoop.x + 34 + swing * 0.2, hoop.y + 18);
  ctx.stroke();
}

function drawBall() {
  ctx.save();
  ctx.translate(ball.x, ball.y);
  ctx.rotate(ball.rotation);

  ctx.fillStyle = "#ff8c2b";
  ctx.beginPath();
  ctx.arc(0, 0, BALL_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#8a3d00";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, BALL_RADIUS, 0, Math.PI * 2);
  ctx.moveTo(-BALL_RADIUS, 0);
  ctx.lineTo(BALL_RADIUS, 0);
  ctx.moveTo(0, -BALL_RADIUS);
  ctx.lineTo(0, BALL_RADIUS);
  ctx.moveTo(-11, -11);
  ctx.quadraticCurveTo(0, 0, -11, 11);
  ctx.moveTo(11, -11);
  ctx.quadraticCurveTo(0, 0, 11, 11);
  ctx.stroke();
  ctx.restore();
}

function drawPlayerMarker() {
  ctx.fillStyle = "#2d6cdf";
  ctx.beginPath();
  ctx.arc(120, FLOOR_Y - 44, 18, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#2d6cdf";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(120, FLOOR_Y - 26);
  ctx.lineTo(120, FLOOR_Y + 10);
  ctx.moveTo(120, FLOOR_Y - 8);
  ctx.lineTo(98, FLOOR_Y + 10);
  ctx.moveTo(120, FLOOR_Y - 8);
  ctx.lineTo(148, FLOOR_Y - 24);
  ctx.moveTo(120, FLOOR_Y + 10);
  ctx.lineTo(102, FLOOR_Y + 42);
  ctx.moveTo(120, FLOOR_Y + 10);
  ctx.lineTo(140, FLOOR_Y + 42);
  ctx.stroke();
}

function drawAimGuide() {
  if (!game.dragging || !game.dragPoint) {
    return;
  }

  ctx.strokeStyle = "rgba(22, 50, 79, 0.75)";
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(ball.x, ball.y);
  ctx.lineTo(game.dragPoint.x, game.dragPoint.y);
  ctx.stroke();
  ctx.setLineDash([]);

  const level = getCurrentLevel();
  if (!level.guide) {
    return;
  }

  const dx = game.dragPoint.x - ball.x;
  const dy = game.dragPoint.y - ball.y;
  const power = clamp(Math.hypot(dx, dy), 30, 170);
  let guideX = ball.x;
  let guideY = ball.y;
  let guideVx = dx * 0.14;
  let guideVy = dy * 0.14;

  ctx.fillStyle = "rgba(255,255,255,0.85)";
  for (let i = 0; i < 24; i += 1) {
    guideVx += level.wind;
    guideVy += 0.22;
    guideX += guideVx;
    guideY += guideVy;
    if (guideY > FLOOR_Y) {
      break;
    }
    ctx.beginPath();
    ctx.arc(guideX, guideY, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawLevelBanner() {
  if (game.levelBannerTimer <= 0 || game.state !== "playing") {
    return;
  }

  ctx.save();
  ctx.globalAlpha = Math.min(game.levelBannerTimer / 120, 1);
  ctx.fillStyle = "rgba(255, 248, 234, 0.9)";
  ctx.fillRect(WIDTH / 2 - 175, 42, 350, 56);
  ctx.fillStyle = "#16324f";
  ctx.font = "bold 28px Trebuchet MS";
  ctx.textAlign = "center";
  ctx.fillText(`Level ${game.levelIndex + 1}`, WIDTH / 2, 78);
  ctx.restore();
}

function drawScoreFlash() {
  if (hoop.scoreFlashTimer <= 0) {
    return;
  }

  const alpha = hoop.scoreFlashTimer / 40;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#fff8d8";
  ctx.beginPath();
  ctx.arc(hoop.x, hoop.y + 22, 52 - alpha * 10, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#16324f";
  ctx.font = "bold 26px Trebuchet MS";
  ctx.textAlign = "center";
  ctx.fillText("SWISH!", hoop.x, hoop.y - 26);
  ctx.restore();
}

function render() {
  drawBackground();
  drawCourt();
  drawHoop();
  drawScoreFlash();
  drawPlayerMarker();
  drawAimGuide();
  drawBall();
  drawLevelBanner();
}

function frame(timestamp) {
  const delta = timestamp - game.lastTime;
  game.lastTime = timestamp;

  if (game.levelBannerTimer > 0) {
    game.levelBannerTimer -= delta / 16.67;
  }

  updateHoop();
  updateCelebration();
  updateBall();
  render();
  window.requestAnimationFrame(frame);
}

function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = WIDTH / rect.width;
  const scaleY = HEIGHT / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY
  };
}

function beginDrag(event) {
  if (game.state !== "playing" || !ball.resting) {
    return;
  }

  const point = getCanvasPoint(event);
  const distance = Math.hypot(point.x - ball.x, point.y - ball.y);
  if (distance > 55) {
    return;
  }

  game.dragging = true;
  game.dragPoint = point;
  game.pointerId = event.pointerId;
  setMessage("Line up your shot...");
  canvas.setPointerCapture(event.pointerId);
}

function moveDrag(event) {
  if (!game.dragging || game.pointerId !== event.pointerId) {
    return;
  }

  game.dragPoint = getCanvasPoint(event);
}

function endDrag(event) {
  if (!game.dragging || game.pointerId !== event.pointerId) {
    return;
  }

  const point = getCanvasPoint(event);
  game.dragging = false;
  game.dragPoint = null;
  shootBall(point.x, point.y);
  canvas.releasePointerCapture(event.pointerId);
}

function cancelDrag(event) {
  if (!game.dragging || game.pointerId !== event.pointerId) {
    return;
  }

  game.dragging = false;
  game.dragPoint = null;
  setMessage("Tap and drag to aim your shot.");
  canvas.releasePointerCapture(event.pointerId);
}

overlayButton.addEventListener("click", startGame);
restartButton.addEventListener("click", startGame);
canvas.addEventListener("pointerdown", beginDrag);
canvas.addEventListener("pointermove", moveDrag);
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", cancelDrag);
canvas.addEventListener("pointerleave", (event) => {
  if (game.dragging) {
    moveDrag(event);
  }
});

updateHud();
render();
window.requestAnimationFrame(frame);
