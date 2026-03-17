const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const playerScoreValue = document.getElementById("scoreValue");
const cpuScoreValue = document.getElementById("levelValue");
const levelValue = document.getElementById("shotsValue");
const possessionValue = document.getElementById("bestValue");
const bestLevelValue = document.getElementById("streakValue");
const messageText = document.getElementById("messageText");
const restartButton = document.getElementById("restartButton");
const overlay = document.getElementById("overlay");
const overlayText = document.getElementById("overlayText");
const overlayButton = document.getElementById("overlayButton");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const FLOOR_Y = HEIGHT - 82;
const BALL_RADIUS = 13;
const PLAYER_HEIGHT = 74;
const PLAYER_WIDTH = 28;
const PLAYER_START_X = 220;
const CPU_START_X = 630;
const GRAVITY = 0.42;
const BALL_GRAVITY = 0.26;
const HOOP = {
  x: 810,
  y: 212,
  rimRadius: 38,
  rimY: 220,
  backboardX: 852,
  backboardTop: 132,
  backboardWidth: 16,
  backboardHeight: 132,
  netHeight: 54
};
const LEVELS = [
  { name: "Rookie", cpuSpeed: 2.1, cpuSprint: 3.0, shotSkill: 0.48, contest: 0.18, stealRate: 0.004, reaction: 0.02, targetScore: 5 },
  { name: "Starter", cpuSpeed: 2.35, cpuSprint: 3.2, shotSkill: 0.54, contest: 0.24, stealRate: 0.005, reaction: 0.026, targetScore: 5 },
  { name: "Street Pro", cpuSpeed: 2.65, cpuSprint: 3.45, shotSkill: 0.61, contest: 0.31, stealRate: 0.0065, reaction: 0.032, targetScore: 6 },
  { name: "Lockdown", cpuSpeed: 2.9, cpuSprint: 3.8, shotSkill: 0.68, contest: 0.38, stealRate: 0.008, reaction: 0.04, targetScore: 6 },
  { name: "Blacktop Boss", cpuSpeed: 3.15, cpuSprint: 4.1, shotSkill: 0.74, contest: 0.46, stealRate: 0.0105, reaction: 0.05, targetScore: 7 }
];

let audioContext = null;

const game = {
  state: "menu",
  levelIndex: 0,
  playerScore: 0,
  cpuScore: 0,
  possession: "player",
  bestLevel: Number(localStorage.getItem("mini-hoop-best-level") || 1),
  pendingShot: null,
  rimSoundTimer: 0,
  dribbleTimer: 0,
  bannerTimer: 0,
  bannerText: "",
  pointerWasUsed: false,
  cpuShotCooldown: 0,
  lastTime: 0
};

const keys = {
  left: false,
  right: false,
  sprint: false,
  shoot: false,
  defend: false
};

const controls = {
  shootWasDown: false,
  defendWasDown: false
};

function createActor(type, x, color) {
  return {
    type,
    x,
    y: FLOOR_Y,
    vx: 0,
    vy: 0,
    width: PLAYER_WIDTH,
    height: PLAYER_HEIGHT,
    color,
    hasBall: false,
    facing: 1,
    onGround: true,
    shotCharge: 0,
    chargeLocked: false,
    stealCooldown: 0,
    blockTimer: 0,
    blinkTimer: 0
  };
}

const player = createActor("player", PLAYER_START_X, "#ff9d2a");
const cpu = createActor("cpu", CPU_START_X, "#5bd3ff");

const ball = {
  x: player.x + 16,
  y: player.y - 34,
  vx: 0,
  vy: 0,
  radius: BALL_RADIUS,
  mode: "held",
  holder: "player",
  bounceCount: 0,
  scored: false,
  justHitBackboard: false
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function currentLevel() {
  return LEVELS[Math.min(game.levelIndex, LEVELS.length - 1)];
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

function createNoiseBuffer(durationSeconds, scaleFn) {
  const ctxAudio = ensureAudioContext();
  if (!ctxAudio) {
    return null;
  }

  const buffer = ctxAudio.createBuffer(1, Math.floor(ctxAudio.sampleRate * durationSeconds), ctxAudio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    const t = i / data.length;
    data[i] = (Math.random() * 2 - 1) * scaleFn(t);
  }
  return buffer;
}

function playSwish() {
  const ctxAudio = ensureAudioContext();
  if (!ctxAudio) {
    return;
  }

  const now = ctxAudio.currentTime;
  const gain = ctxAudio.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);
  gain.connect(ctxAudio.destination);

  const noise = ctxAudio.createBufferSource();
  noise.buffer = createNoiseBuffer(0.22, (t) => 1 - t);
  const filter = ctxAudio.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(1500, now);
  filter.Q.setValueAtTime(1.2, now);
  noise.connect(filter);
  filter.connect(gain);
  noise.start(now);
  noise.stop(now + 0.22);

  const shimmer = ctxAudio.createOscillator();
  shimmer.type = "triangle";
  shimmer.frequency.setValueAtTime(620, now);
  shimmer.frequency.exponentialRampToValueAtTime(980, now + 0.12);
  shimmer.connect(gain);
  shimmer.start(now + 0.01);
  shimmer.stop(now + 0.16);
}

function playCrowdCheer() {
  const ctxAudio = ensureAudioContext();
  if (!ctxAudio) {
    return;
  }

  const now = ctxAudio.currentTime;
  const master = ctxAudio.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.07, now + 0.03);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
  master.connect(ctxAudio.destination);

  const crowd = ctxAudio.createBufferSource();
  crowd.buffer = createNoiseBuffer(0.9, (t) => (1 - t) * (0.7 + 0.3 * Math.sin(t * 18)));
  const filter = ctxAudio.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(900, now);
  filter.frequency.linearRampToValueAtTime(1300, now + 0.45);
  filter.Q.setValueAtTime(0.7, now);
  crowd.connect(filter);
  filter.connect(master);
  crowd.start(now);
  crowd.stop(now + 0.9);
}

function playRimBang() {
  const ctxAudio = ensureAudioContext();
  if (!ctxAudio) {
    return;
  }

  const now = ctxAudio.currentTime;
  const gain = ctxAudio.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.16, now + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
  gain.connect(ctxAudio.destination);

  const metalA = ctxAudio.createOscillator();
  metalA.type = "square";
  metalA.frequency.setValueAtTime(400, now);
  metalA.frequency.exponentialRampToValueAtTime(210, now + 0.22);
  metalA.connect(gain);
  metalA.start(now);
  metalA.stop(now + 0.24);

  const metalB = ctxAudio.createOscillator();
  metalB.type = "triangle";
  metalB.frequency.setValueAtTime(860, now);
  metalB.frequency.exponentialRampToValueAtTime(430, now + 0.18);
  metalB.connect(gain);
  metalB.start(now + 0.01);
  metalB.stop(now + 0.18);
}

function playBounceSound(speed = 4) {
  const ctxAudio = ensureAudioContext();
  if (!ctxAudio) {
    return;
  }

  const now = ctxAudio.currentTime;
  const volume = clamp(0.035 + speed * 0.012, 0.04, 0.16);
  const gain = ctxAudio.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.17);
  gain.connect(ctxAudio.destination);

  const low = ctxAudio.createOscillator();
  low.type = "sine";
  low.frequency.setValueAtTime(185, now);
  low.frequency.exponentialRampToValueAtTime(76, now + 0.16);
  low.connect(gain);
  low.start(now);
  low.stop(now + 0.17);

  const slap = ctxAudio.createOscillator();
  slap.type = "triangle";
  slap.frequency.setValueAtTime(300, now);
  slap.frequency.exponentialRampToValueAtTime(130, now + 0.11);
  slap.connect(gain);
  slap.start(now);
  slap.stop(now + 0.11);
}

function playBlockSound() {
  const ctxAudio = ensureAudioContext();
  if (!ctxAudio) {
    return;
  }

  const now = ctxAudio.currentTime;
  const gain = ctxAudio.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
  gain.connect(ctxAudio.destination);

  const osc = ctxAudio.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(220, now);
  osc.frequency.exponentialRampToValueAtTime(110, now + 0.15);
  osc.connect(gain);
  osc.start(now);
  osc.stop(now + 0.16);
}

function setMessage(text) {
  messageText.textContent = text;
}

function startRun() {
  game.state = "playing";
  game.levelIndex = 0;
  game.playerScore = 0;
  game.cpuScore = 0;
  game.bannerTimer = 150;
  game.bannerText = "Level 1: Rookie";
  overlay.classList.add("hidden");
  overlayButton.textContent = "Play Again";
  resetLevel("player");
  updateHud();
}

function resetLevel(startingPossession = "player") {
  player.x = PLAYER_START_X;
  player.y = FLOOR_Y;
  player.vx = 0;
  player.vy = 0;
  player.onGround = true;
  player.hasBall = startingPossession === "player";
  player.shotCharge = 0;
  player.blockTimer = 0;
  player.blinkTimer = 0;

  cpu.x = CPU_START_X;
  cpu.y = FLOOR_Y;
  cpu.vx = 0;
  cpu.vy = 0;
  cpu.onGround = true;
  cpu.hasBall = startingPossession === "cpu";
  cpu.shotCharge = 0;
  cpu.blockTimer = 0;
  cpu.blinkTimer = 0;

  game.possession = startingPossession;
  game.pendingShot = null;
  game.cpuShotCooldown = 0;
  game.rimSoundTimer = 0;
  ball.scored = false;
  holdBall(startingPossession);
  setMessage(`${capitalize(startingPossession)} ball. First to ${currentLevel().targetScore}.`);
}

function holdBall(holderName) {
  ball.mode = "held";
  ball.holder = holderName;
  ball.vx = 0;
  ball.vy = 0;
  ball.bounceCount = 0;
  ball.justHitBackboard = false;
  player.hasBall = holderName === "player";
  cpu.hasBall = holderName === "cpu";
  attachBallToHolder();
}

function attachBallToHolder() {
  const holder = ball.holder === "player" ? player : cpu;
  if (!holder) {
    return;
  }

  const dribbleOffset = holder.onGround ? Math.sin(game.lastTime * 0.015 + holder.x * 0.04) * 6 : -16;
  ball.x = holder.x + holder.facing * 16;
  ball.y = holder.y - 30 + dribbleOffset;
}

function updateHud() {
  playerScoreValue.textContent = game.playerScore;
  cpuScoreValue.textContent = game.cpuScore;
  levelValue.textContent = game.levelIndex + 1;
  possessionValue.textContent = capitalize(game.possession);
  bestLevelValue.textContent = game.bestLevel;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function saveBestLevel() {
  const best = Math.max(game.bestLevel, game.levelIndex + 1);
  if (best !== game.bestLevel) {
    game.bestLevel = best;
    localStorage.setItem("mini-hoop-best-level", String(best));
  }
}

function startNextLevel() {
  game.levelIndex += 1;
  if (game.levelIndex >= LEVELS.length) {
    endRun(true);
    return;
  }

  game.playerScore = 0;
  game.cpuScore = 0;
  game.bannerText = `Level ${game.levelIndex + 1}: ${currentLevel().name}`;
  game.bannerTimer = 160;
  resetLevel("player");
  updateHud();
}

function endRun(playerWonGame) {
  game.state = "gameover";
  overlay.classList.remove("hidden");
  overlayText.textContent = playerWonGame
    ? `You ruled the blacktop and beat every CPU. Best level: ${game.bestLevel}.`
    : `The CPU won this run. You reached level ${game.levelIndex + 1}.`;
  overlayButton.textContent = playerWonGame ? "Play Again" : "Try Again";
  setMessage("Press Restart Run to jump back in.");
}

function winLevel() {
  saveBestLevel();
  game.state = "level-complete";
  overlay.classList.remove("hidden");
  overlayText.textContent = `You beat level ${game.levelIndex + 1}. The CPU gets better next round.`;
  overlayButton.textContent = game.levelIndex === LEVELS.length - 1 ? "Finish Run" : "Next Level";
  setMessage("Level complete!");
}

function loseLevel() {
  game.state = "gameover";
  overlay.classList.remove("hidden");
  overlayText.textContent = `The ${currentLevel().name} CPU beat you. Try this level again.`;
  overlayButton.textContent = "Retry Level";
  setMessage("The CPU got the better of that one.");
}

function attemptSteal(attacker, defender) {
  if (attacker.stealCooldown > 0 || !defender.hasBall || Math.abs(attacker.x - defender.x) > 44 || Math.abs(attacker.y - defender.y) > 40) {
    return;
  }

  attacker.stealCooldown = 28;
  const successChance = attacker.type === "cpu" ? currentLevel().stealRate * 42 : 0.22;
  if (Math.random() < successChance) {
    defender.hasBall = false;
    attacker.hasBall = true;
    game.possession = attacker.type;
    holdBall(attacker.type);
    attacker.blinkTimer = 18;
    setMessage(attacker.type === "player" ? "Steal! Your ball." : "CPU steal!");
  }
}

function jump(actor, power = 8.8) {
  if (!actor.onGround) {
    return;
  }

  actor.vy = -power;
  actor.onGround = false;
  actor.blockTimer = 12;
}

function maybeStartPlayerShot() {
  if (!player.hasBall || !player.onGround) {
    return;
  }

  player.chargeLocked = true;
}

function maybeReleasePlayerShot() {
  if (!player.hasBall || !player.chargeLocked) {
    return;
  }

  shootBall(player, cpu);
  player.chargeLocked = false;
}

function desiredChargeForDistance(distance) {
  return clamp(0.34 + distance / 700, 0.42, 0.92);
}

function shootBall(shooter, defender) {
  const distance = Math.abs(HOOP.x - shooter.x);
  const chargeTarget = desiredChargeForDistance(distance);
  const releaseScore = 1 - Math.abs(shooter.shotCharge - chargeTarget) * 1.6;
  const contestDistance = Math.abs(defender.x - shooter.x);
  const contestPenalty = contestDistance < 54 ? currentLevel().contest * (defender.blockTimer > 0 ? 1.1 : 0.8) : 0;
  const distancePenalty = clamp((distance - 180) / 520, 0, 0.38);
  const skillBonus = shooter.type === "cpu" ? currentLevel().shotSkill : 0.58;
  const makeChance = clamp(skillBonus + releaseScore * 0.32 - distancePenalty - contestPenalty, 0.12, 0.92);
  const made = Math.random() < makeChance;

  shooter.hasBall = false;
  shooter.shotCharge = 0;
  game.pendingShot = {
    shooter: shooter.type,
    made,
    counted: false
  };

  if (shooter.onGround) {
    jump(shooter, 7.6);
  }

  const targetX = made ? HOOP.x : HOOP.x + (Math.random() < 0.5 ? -42 : 52);
  const targetY = made ? HOOP.rimY + 8 : HOOP.rimY - 18;
  const time = clamp(Math.abs(targetX - shooter.x) / 10, 24, 40);
  const dx = targetX - (shooter.x + shooter.facing * 16);
  const dy = targetY - (shooter.y - 38);

  ball.mode = "air";
  ball.holder = null;
  ball.x = shooter.x + shooter.facing * 16;
  ball.y = shooter.y - 38;
  ball.vx = dx / time;
  ball.vy = (dy - 0.5 * BALL_GRAVITY * time * time) / time;
  ball.scored = false;
  ball.justHitBackboard = false;

  setMessage(shooter.type === "player" ? "Shoot!" : "CPU shoots!");
}

function awardScore(team) {
  if (game.pendingShot?.counted) {
    return;
  }

  if (game.pendingShot) {
    game.pendingShot.counted = true;
  }

  if (team === "player") {
    game.playerScore += 1;
    setMessage("Swish! You scored.");
  } else {
    game.cpuScore += 1;
    setMessage("CPU bucket.");
  }

  playSwish();
  playCrowdCheer();
  game.bannerText = team === "player" ? "BUCKET!" : "CPU SCORED";
  game.bannerTimer = 55;
  updateHud();

  const target = currentLevel().targetScore;
  if (game.playerScore >= target) {
    window.setTimeout(winLevel, 650);
    return;
  }
  if (game.cpuScore >= target) {
    window.setTimeout(loseLevel, 650);
    return;
  }

  window.setTimeout(() => {
    if (game.state === "playing") {
      resetLevel(team === "player" ? "cpu" : "player");
      updateHud();
    }
  }, 700);
}

function updateActor(actor, movement, sprinting) {
  const speed = actor.type === "cpu" ? (sprinting ? currentLevel().cpuSprint : currentLevel().cpuSpeed) : (sprinting ? 4.0 : 2.8);
  actor.vx = movement * speed;
  actor.x += actor.vx;
  actor.x = clamp(actor.x, 80, 820);
  if (movement !== 0) {
    actor.facing = movement > 0 ? 1 : -1;
  }

  actor.y += actor.vy;
  actor.vy += GRAVITY;
  if (actor.y >= FLOOR_Y) {
    actor.y = FLOOR_Y;
    actor.vy = 0;
    actor.onGround = true;
  }

  if (actor.stealCooldown > 0) {
    actor.stealCooldown -= 1;
  }
  if (actor.blockTimer > 0) {
    actor.blockTimer -= 1;
  }
  if (actor.blinkTimer > 0) {
    actor.blinkTimer -= 1;
  }
}

function updatePlayer() {
  const movement = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  updateActor(player, movement, keys.sprint);

  if (player.hasBall && keys.shoot && player.onGround) {
    player.shotCharge = clamp(player.shotCharge + 0.022, 0, 1);
    maybeStartPlayerShot();
  } else if (player.hasBall && !keys.shoot) {
    player.shotCharge *= 0.84;
  }
}

function updateCpu() {
  const level = currentLevel();
  let movement = 0;
  let sprinting = false;

  if (cpu.hasBall) {
    const targetX = clamp(HOOP.x - 180 - Math.sin(game.lastTime * 0.0014) * 40, 420, 720);
    if (Math.abs(cpu.x - targetX) > 12) {
      movement = cpu.x < targetX ? 1 : -1;
      sprinting = Math.abs(cpu.x - targetX) > 80;
    }

    const openLook = Math.abs(cpu.x - player.x) > 86 || player.blockTimer === 0;
    if (openLook) {
      cpu.shotCharge = clamp(cpu.shotCharge + level.reaction, 0, 1);
      const desired = desiredChargeForDistance(Math.abs(HOOP.x - cpu.x));
      if (cpu.shotCharge >= desired && game.cpuShotCooldown <= 0) {
        shootBall(cpu, player);
        cpu.shotCharge = 0;
        game.cpuShotCooldown = 50;
      }
    } else {
      cpu.shotCharge *= 0.85;
    }
  } else {
    cpu.shotCharge *= 0.78;
    const guardX = clamp(player.x + 38, 240, 740);
    if (Math.abs(cpu.x - guardX) > 10) {
      movement = cpu.x < guardX ? 1 : -1;
      sprinting = Math.abs(cpu.x - guardX) > 72;
    }

    if (player.hasBall && Math.abs(cpu.x - player.x) < 42 && Math.random() < level.stealRate && cpu.stealCooldown <= 0) {
      attemptSteal(cpu, player);
    }

    if (player.hasBall && player.chargeLocked && Math.abs(cpu.x - player.x) < 60 && cpu.onGround) {
      jump(cpu, 8.5);
    }
  }

  if (game.cpuShotCooldown > 0) {
    game.cpuShotCooldown -= 1;
  }

  updateActor(cpu, movement, sprinting);
}

function updateLooseBall() {
  const nearest = Math.abs(ball.x - player.x) < Math.abs(ball.x - cpu.x) ? player : cpu;
  if (ball.y + ball.radius >= FLOOR_Y && Math.abs(ball.x - nearest.x) < 34) {
    game.possession = nearest.type;
    holdBall(nearest.type);
    setMessage(nearest.type === "player" ? "Rebound! Your ball." : "CPU rebound.");
  }
}

function updateBall() {
  if (ball.mode === "held") {
    attachBallToHolder();

    if (Math.abs((keys.right ? 1 : 0) - (keys.left ? 1 : 0)) > 0 && player.hasBall && game.dribbleTimer <= 0 && player.onGround) {
      playBounceSound(2.8);
      game.dribbleTimer = 16;
    }
    return;
  }

  ball.x += ball.vx;
  ball.y += ball.vy;
  ball.vy += BALL_GRAVITY;

  if (
    !ball.justHitBackboard &&
    ball.x + ball.radius >= HOOP.backboardX &&
    ball.x - ball.radius <= HOOP.backboardX + HOOP.backboardWidth &&
    ball.y >= HOOP.backboardTop &&
    ball.y <= HOOP.backboardTop + HOOP.backboardHeight
  ) {
    ball.justHitBackboard = true;
    ball.x = HOOP.backboardX - ball.radius;
    ball.vx = -Math.abs(ball.vx) * 0.48;
    ball.vy = ball.vy * 0.7 + 0.8;
  }

  const rimLeft = HOOP.x - HOOP.rimRadius + 4;
  const rimRight = HOOP.x + HOOP.rimRadius - 4;
  if (
    !ball.scored &&
    ball.vy > 0 &&
    ball.y > HOOP.rimY &&
    ball.y < HOOP.rimY + HOOP.netHeight &&
    ball.x > rimLeft &&
    ball.x < rimRight
  ) {
    ball.scored = true;
    awardScore(game.pendingShot?.shooter || game.possession);
    return;
  }

  const leftRim = HOOP.x - HOOP.rimRadius;
  const rightRim = HOOP.x + HOOP.rimRadius;
  const rimDistanceLeft = Math.hypot(ball.x - leftRim, ball.y - HOOP.rimY);
  const rimDistanceRight = Math.hypot(ball.x - rightRim, ball.y - HOOP.rimY);
  if ((rimDistanceLeft < ball.radius + 4 || rimDistanceRight < ball.radius + 4) && game.rimSoundTimer <= 0) {
    ball.vx *= -0.82;
    ball.vy *= 0.78;
    playRimBang();
    game.rimSoundTimer = 8;
  }

  if (ball.y + ball.radius >= FLOOR_Y) {
    const impact = Math.abs(ball.vy);
    ball.y = FLOOR_Y - ball.radius;
    ball.vy *= -0.46;
    ball.vx *= 0.76;
    ball.bounceCount += 1;
    playBounceSound(impact);

    if (Math.abs(ball.vy) < 1.5 || ball.bounceCount > 4) {
      ball.vy = 0;
      ball.mode = "loose";
    }
  }

  if (ball.x < 40 || ball.x > WIDTH - 30 || ball.y > HEIGHT + 40) {
    const fallback = game.pendingShot?.shooter === "player" ? "cpu" : "player";
    resetLevel(fallback);
  }

  if (ball.mode === "loose") {
    updateLooseBall();
  }
}

function updateDefenseActions() {
  if (!controls.defendWasDown && keys.defend) {
    if (player.hasBall) {
      setMessage("Protect the ball and create space.");
    } else {
      if (player.onGround) {
        jump(player, 8.7);
      }
      attemptSteal(player, cpu);
    }
  }

  if (!controls.shootWasDown && keys.shoot && !player.hasBall && player.onGround) {
    jump(player, 8.4);
  }

  if (controls.shootWasDown && !keys.shoot) {
    maybeReleasePlayerShot();
  }

  controls.shootWasDown = keys.shoot;
  controls.defendWasDown = keys.defend;
}

function updateGame() {
  if (game.state !== "playing") {
    return;
  }

  updatePlayer();
  updateCpu();
  updateDefenseActions();
  updateBall();

  if (game.dribbleTimer > 0) {
    game.dribbleTimer -= 1;
  }
  if (game.rimSoundTimer > 0) {
    game.rimSoundTimer -= 1;
  }
  if (game.bannerTimer > 0) {
    game.bannerTimer -= 1;
  }
}

function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, "#09111b");
  sky.addColorStop(0.45, "#16253a");
  sky.addColorStop(1, "#556472");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "#0c131d";
  ctx.fillRect(0, 0, WIDTH, 100);
  for (let x = 20; x < WIDTH; x += 86) {
    ctx.fillStyle = "rgba(255, 248, 176, 0.18)";
    ctx.fillRect(x, 18, 44, 10);
  }

  const bleachers = [
    { x: 0, y: 138, w: 250, h: 132, direction: 1 },
    { x: 650, y: 154, w: 310, h: 118, direction: -1 }
  ];

  bleachers.forEach((section) => {
    ctx.fillStyle = "#474f5d";
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

    ctx.strokeStyle = "rgba(255,255,255,0.14)";
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
        const py = section.y + 20 + row * 23;
        ctx.fillStyle = "#272d34";
        ctx.fillRect(px, py, 12, 10);
        ctx.fillStyle = ["#f1c8ab", "#d79870", "#8f6044", "#f6dcc8"][(row + seat) % 4];
        ctx.beginPath();
        ctx.arc(px + 6, py - 5, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#10161f";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px + 6, py);
        ctx.lineTo(px + 6, py + 8);
        ctx.stroke();
      }
    }
  });
}

function drawCourt() {
  const asphalt = ctx.createLinearGradient(0, FLOOR_Y, 0, HEIGHT);
  asphalt.addColorStop(0, "#31363d");
  asphalt.addColorStop(1, "#171b1f");
  ctx.fillStyle = asphalt;
  ctx.fillRect(0, FLOOR_Y, WIDTH, HEIGHT - FLOOR_Y);

  for (let i = 0; i < 160; i += 1) {
    const x = (i * 53) % WIDTH;
    const y = FLOOR_Y + ((i * 41) % (HEIGHT - FLOOR_Y));
    ctx.fillStyle = i % 3 === 0 ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.08)";
    ctx.fillRect(x, y, 3, 3);
  }

  ctx.fillStyle = "#0d1014";
  ctx.fillRect(0, FLOOR_Y, WIDTH, 8);

  ctx.strokeStyle = "rgba(255, 225, 134, 0.94)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, FLOOR_Y);
  ctx.lineTo(WIDTH, FLOOR_Y);
  ctx.stroke();

  ctx.beginPath();
  ctx.rect(0, FLOOR_Y - 144, 162, 144);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(162, FLOOR_Y, 68, Math.PI / 2, Math.PI * 1.5);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(84, FLOOR_Y - 144);
  ctx.lineTo(84, FLOOR_Y);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(212, FLOOR_Y, 108, Math.PI, 0);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(212, FLOOR_Y, 18, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 149, 0, 0.1)";
  ctx.beginPath();
  ctx.arc(212, FLOOR_Y, 108, Math.PI, 0);
  ctx.fill();
}

function drawHoop() {
  ctx.fillStyle = "#d8dde8";
  ctx.fillRect(HOOP.backboardX, HOOP.backboardTop, HOOP.backboardWidth, HOOP.backboardHeight);

  ctx.strokeStyle = "#d55140";
  ctx.lineWidth = 3;
  ctx.strokeRect(HOOP.backboardX - 8, HOOP.backboardTop + 45, 34, 28);

  ctx.fillStyle = "#e04f3f";
  ctx.fillRect(HOOP.x + 18, HOOP.rimY - 14, 72, 10);

  ctx.strokeStyle = "#ff6a3b";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(HOOP.x - HOOP.rimRadius, HOOP.rimY);
  ctx.lineTo(HOOP.x + HOOP.rimRadius, HOOP.rimY);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.92)";
  ctx.lineWidth = 2;
  for (let i = -30; i <= 30; i += 15) {
    const sway = Math.sin(game.lastTime * 0.02 + i) * 1.5;
    ctx.beginPath();
    ctx.moveTo(HOOP.x + i, HOOP.rimY + 3);
    ctx.lineTo(HOOP.x + i * 0.2 + sway, HOOP.rimY + HOOP.netHeight);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.moveTo(HOOP.x - 30, HOOP.rimY + 18);
  ctx.lineTo(HOOP.x + 30, HOOP.rimY + 18);
  ctx.stroke();
}

function drawActor(actor) {
  const blinkOffset = actor.blinkTimer > 0 ? Math.sin(game.lastTime * 0.3) * 3 : 0;
  const topY = actor.y - actor.height - blinkOffset;

  ctx.fillStyle = actor.color;
  ctx.beginPath();
  ctx.arc(actor.x, topY + 16, 16, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineWidth = 10;
  ctx.strokeStyle = actor.color;
  ctx.beginPath();
  ctx.moveTo(actor.x, topY + 32);
  ctx.lineTo(actor.x, topY + 72);
  ctx.moveTo(actor.x, topY + 42);
  ctx.lineTo(actor.x - 18, topY + 58);
  ctx.moveTo(actor.x, topY + 42);
  ctx.lineTo(actor.x + 18, topY + 54);
  ctx.moveTo(actor.x, topY + 72);
  ctx.lineTo(actor.x - 14, topY + 106);
  ctx.moveTo(actor.x, topY + 72);
  ctx.lineTo(actor.x + 18, topY + 106);
  ctx.stroke();

  if (actor.type === "player") {
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.font = "bold 13px Trebuchet MS";
    ctx.textAlign = "center";
    ctx.fillText("YOU", actor.x, topY - 8);
  } else {
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.font = "bold 13px Trebuchet MS";
    ctx.textAlign = "center";
    ctx.fillText("CPU", actor.x, topY - 8);
  }
}

function drawBall() {
  ctx.save();
  ctx.translate(ball.x, ball.y);
  ctx.rotate(ball.x * 0.03);
  ctx.fillStyle = "#ff8a2b";
  ctx.beginPath();
  ctx.arc(0, 0, ball.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#6d3200";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, ball.radius, 0, Math.PI * 2);
  ctx.moveTo(-ball.radius, 0);
  ctx.lineTo(ball.radius, 0);
  ctx.moveTo(0, -ball.radius);
  ctx.lineTo(0, ball.radius);
  ctx.moveTo(-9, -9);
  ctx.quadraticCurveTo(0, 0, -9, 9);
  ctx.moveTo(9, -9);
  ctx.quadraticCurveTo(0, 0, 9, 9);
  ctx.stroke();
  ctx.restore();
}

function drawShotMeter() {
  if (!player.hasBall) {
    return;
  }

  const meterX = 170;
  const meterY = 120;
  const meterW = 26;
  const meterH = 176;
  const ideal = desiredChargeForDistance(Math.abs(HOOP.x - player.x));

  ctx.fillStyle = "rgba(0,0,0,0.34)";
  ctx.fillRect(meterX, meterY, meterW, meterH);
  ctx.fillStyle = "#27d17c";
  ctx.fillRect(meterX + 4, meterY + meterH - player.shotCharge * (meterH - 8) - 4, meterW - 8, player.shotCharge * (meterH - 8));

  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 2;
  ctx.strokeRect(meterX, meterY, meterW, meterH);

  const idealY = meterY + meterH - ideal * (meterH - 8) - 4;
  ctx.strokeStyle = "#ffea6a";
  ctx.beginPath();
  ctx.moveTo(meterX - 4, idealY);
  ctx.lineTo(meterX + meterW + 4, idealY);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.font = "bold 12px Trebuchet MS";
  ctx.textAlign = "left";
  ctx.fillText("SHOT", meterX - 6, meterY - 12);
}

function drawBanner() {
  if (game.bannerTimer <= 0) {
    return;
  }

  const alpha = Math.min(game.bannerTimer / 60, 1);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "rgba(12, 16, 22, 0.82)";
  ctx.fillRect(WIDTH / 2 - 175, 36, 350, 54);
  ctx.fillStyle = "#fff0bd";
  ctx.font = "bold 28px Trebuchet MS";
  ctx.textAlign = "center";
  ctx.fillText(game.bannerText, WIDTH / 2, 70);
  ctx.restore();
}

function drawControlHints() {
  ctx.fillStyle = "rgba(8, 12, 18, 0.76)";
  ctx.fillRect(20, 124, 132, 238);
  ctx.strokeStyle = "rgba(255, 220, 140, 0.45)";
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 124, 132, 238);

  ctx.fillStyle = "#fff0bd";
  ctx.font = "bold 16px Trebuchet MS";
  ctx.textAlign = "left";
  ctx.fillText("Controls", 34, 152);

  ctx.font = "bold 13px Trebuchet MS";
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillText("A / D  Move", 34, 184);
  ctx.fillText("Shift  Sprint", 34, 212);
  ctx.fillText("Space  Shoot", 34, 240);
  ctx.fillText("Space  Jump", 34, 268);
  ctx.fillText("S  Steal / Block", 34, 296);

  ctx.fillStyle = "#ffa14a";
  ctx.fillText("On offense:", 34, 330);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillText("dribble, run,", 34, 350);
  ctx.fillText("create space,", 34, 368);
  ctx.fillText("then shoot.", 34, 386);
  ctx.fillStyle = "#5bd3ff";
  ctx.fillText("On defense:", 34, 414);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillText("jump to contest", 34, 434);
  ctx.fillText("or press S", 34, 452);
  ctx.fillText("to steal.", 34, 470);
}

function render() {
  drawBackground();
  drawCourt();
  drawHoop();
  drawShotMeter();
  drawActor(player);
  drawActor(cpu);
  drawBall();
  drawBanner();
  drawControlHints();
}

function frame(timestamp) {
  game.lastTime = timestamp;
  updateGame();
  render();
  window.requestAnimationFrame(frame);
}

function handleKeyDown(event) {
  game.pointerWasUsed = true;
  if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
    keys.left = true;
  }
  if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
    keys.right = true;
  }
  if (event.key === "Shift") {
    keys.sprint = true;
  }
  if (event.key === " ") {
    keys.shoot = true;
    event.preventDefault();
  }
  if (event.key.toLowerCase() === "s" || event.key.toLowerCase() === "k") {
    keys.defend = true;
  }
}

function handleKeyUp(event) {
  if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
    keys.left = false;
  }
  if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
    keys.right = false;
  }
  if (event.key === "Shift") {
    keys.sprint = false;
  }
  if (event.key === " ") {
    keys.shoot = false;
    event.preventDefault();
  }
  if (event.key.toLowerCase() === "s" || event.key.toLowerCase() === "k") {
    keys.defend = false;
  }
}

function handleOverlayButton() {
  if (game.state === "menu") {
    startRun();
    return;
  }
  if (game.state === "level-complete") {
    overlay.classList.add("hidden");
    game.state = "playing";
    startNextLevel();
    return;
  }
  if (game.state === "gameover") {
    startRun();
  }
}

overlayButton.addEventListener("click", handleOverlayButton);
restartButton.addEventListener("click", startRun);
window.addEventListener("keydown", handleKeyDown);
window.addEventListener("keyup", handleKeyUp);

updateHud();
render();
window.requestAnimationFrame(frame);
