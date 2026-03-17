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
const PLAYER_START_Y = FLOOR_Y;
const GRAVITY = 0.42;
const BALL_GRAVITY = 0.26;
const CENTER_X = WIDTH / 2;
const HOOPS = {
  left: {
    side: "left",
    x: 122,
    rimY: 220,
    rimRadius: 36,
    backboardX: 88,
    backboardTop: 132,
    backboardWidth: 16,
    backboardHeight: 132,
    netHeight: 52
  },
  right: {
    side: "right",
    x: 838,
    rimY: 220,
    rimRadius: 36,
    backboardX: 856,
    backboardTop: 132,
    backboardWidth: 16,
    backboardHeight: 132,
    netHeight: 52
  }
};
const LEVELS = [
  { name: "Rookie", cpuSpeed: 2.1, cpuSprint: 3.0, shotSkill: 0.48, contest: 0.16, stealRate: 0.004, reaction: 0.018, targetScore: 5 },
  { name: "Starter", cpuSpeed: 2.35, cpuSprint: 3.2, shotSkill: 0.54, contest: 0.22, stealRate: 0.005, reaction: 0.024, targetScore: 5 },
  { name: "Street Pro", cpuSpeed: 2.7, cpuSprint: 3.5, shotSkill: 0.61, contest: 0.3, stealRate: 0.0065, reaction: 0.03, targetScore: 6 },
  { name: "Lockdown", cpuSpeed: 3.0, cpuSprint: 3.9, shotSkill: 0.69, contest: 0.38, stealRate: 0.0085, reaction: 0.038, targetScore: 6 },
  { name: "Blacktop Boss", cpuSpeed: 3.25, cpuSprint: 4.2, shotSkill: 0.76, contest: 0.46, stealRate: 0.0105, reaction: 0.048, targetScore: 7 }
];

let audioContext = null;

const game = {
  state: "menu",
  phase: "check",
  levelIndex: 0,
  playerScore: 0,
  cpuScore: 0,
  possession: "player",
  checkTimer: 0,
  pendingShot: null,
  rimSoundTimer: 0,
  dribbleTimer: 0,
  bannerTimer: 0,
  bannerText: "",
  cpuShotCooldown: 0,
  bestLevel: Number(localStorage.getItem("mini-hoop-best-level") || 1),
  lastTime: 0
};

const keys = {
  left: false,
  right: false,
  sprint: false,
  shoot: false,
  defend: false
};

const edges = {
  shootWasDown: false,
  defendWasDown: false
};

function createActor(type, x, color) {
  return {
    type,
    x,
    y: PLAYER_START_Y,
    vx: 0,
    vy: 0,
    onGround: true,
    facing: type === "player" ? 1 : -1,
    hasBall: false,
    shotCharge: 0,
    chargeLocked: false,
    stealCooldown: 0,
    blockTimer: 0,
    blinkTimer: 0,
    energy: 1
  };
}

const player = createActor("player", 320, "#ff9d2a");
const cpu = createActor("cpu", 640, "#5bd3ff");

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

function offenseActor() {
  return game.possession === "player" ? player : cpu;
}

function defenseActor() {
  return game.possession === "player" ? cpu : player;
}

function offensiveHoopFor(team) {
  return team === "player" ? HOOPS.right : HOOPS.left;
}

function defensiveHoopFor(team) {
  return team === "player" ? HOOPS.left : HOOPS.right;
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

function createNoiseBuffer(durationSeconds, shapeFn) {
  const ctxAudio = ensureAudioContext();
  if (!ctxAudio) {
    return null;
  }

  const buffer = ctxAudio.createBuffer(1, Math.floor(ctxAudio.sampleRate * durationSeconds), ctxAudio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    const t = i / data.length;
    data[i] = (Math.random() * 2 - 1) * shapeFn(t);
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
  filter.frequency.setValueAtTime(1550, now);
  filter.Q.setValueAtTime(1.2, now);
  noise.connect(filter);
  filter.connect(gain);
  noise.start(now);
  noise.stop(now + 0.22);
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
  master.gain.exponentialRampToValueAtTime(0.0001, now + 0.92);
  master.connect(ctxAudio.destination);

  const crowd = ctxAudio.createBufferSource();
  crowd.buffer = createNoiseBuffer(0.9, (t) => (1 - t) * (0.7 + 0.3 * Math.sin(t * 18)));
  const filter = ctxAudio.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(920, now);
  filter.frequency.linearRampToValueAtTime(1320, now + 0.45);
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
  gain.gain.exponentialRampToValueAtTime(0.17, now + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
  gain.connect(ctxAudio.destination);

  const a = ctxAudio.createOscillator();
  a.type = "square";
  a.frequency.setValueAtTime(390, now);
  a.frequency.exponentialRampToValueAtTime(205, now + 0.22);
  a.connect(gain);
  a.start(now);
  a.stop(now + 0.24);

  const b = ctxAudio.createOscillator();
  b.type = "triangle";
  b.frequency.setValueAtTime(840, now);
  b.frequency.exponentialRampToValueAtTime(420, now + 0.18);
  b.connect(gain);
  b.start(now + 0.01);
  b.stop(now + 0.18);
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

  const pop = ctxAudio.createOscillator();
  pop.type = "triangle";
  pop.frequency.setValueAtTime(310, now);
  pop.frequency.exponentialRampToValueAtTime(122, now + 0.1);
  pop.connect(gain);
  pop.start(now);
  pop.stop(now + 0.1);
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
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
  gain.connect(ctxAudio.destination);

  const osc = ctxAudio.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(220, now);
  osc.frequency.exponentialRampToValueAtTime(105, now + 0.14);
  osc.connect(gain);
  osc.start(now);
  osc.stop(now + 0.14);
}

function setMessage(text) {
  messageText.textContent = text;
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
  const nextBest = Math.max(game.bestLevel, game.levelIndex + 1);
  if (nextBest !== game.bestLevel) {
    game.bestLevel = nextBest;
    localStorage.setItem("mini-hoop-best-level", String(nextBest));
  }
}

function attachBallToHolder() {
  const holder = ball.holder === "player" ? player : cpu;
  if (!holder) {
    return;
  }

  const dribbleOffset = holder.onGround && game.phase === "live"
    ? Math.sin(game.lastTime * 0.018 + holder.x * 0.05) * 6
    : -14;
  ball.x = holder.x + holder.facing * 16;
  ball.y = holder.y - 30 + dribbleOffset;
}

function holdBall(holderName) {
  ball.mode = "held";
  ball.holder = holderName;
  ball.vx = 0;
  ball.vy = 0;
  ball.scored = false;
  ball.justHitBackboard = false;
  ball.bounceCount = 0;
  player.hasBall = holderName === "player";
  cpu.hasBall = holderName === "cpu";
  attachBallToHolder();
}

function startRun() {
  game.state = "playing";
  game.levelIndex = 0;
  game.playerScore = 0;
  game.cpuScore = 0;
  game.bannerText = "LEVEL 1";
  game.bannerTimer = 150;
  overlay.classList.add("hidden");
  overlayButton.textContent = "Play Again";
  startCheck("player");
  updateHud();
}

function startNextLevel() {
  game.levelIndex += 1;
  if (game.levelIndex >= LEVELS.length) {
    finishRun(true);
    return;
  }

  game.playerScore = 0;
  game.cpuScore = 0;
  game.bannerText = `LEVEL ${game.levelIndex + 1}`;
  game.bannerTimer = 160;
  startCheck("player");
  updateHud();
}

function finishRun(wonAll) {
  game.state = "gameover";
  overlay.classList.remove("hidden");
  overlayText.textContent = wonAll
    ? `You ran the whole blacktop. Best level: ${game.bestLevel}.`
    : `The CPU won this run. You reached level ${game.levelIndex + 1}.`;
  overlayButton.textContent = "Play Again";
  setMessage("Press Restart Run to go again.");
}

function winLevel() {
  saveBestLevel();
  game.state = "level-complete";
  overlay.classList.remove("hidden");
  overlayText.textContent = `You won level ${game.levelIndex + 1}. The next CPU is quicker and smarter.`;
  overlayButton.textContent = game.levelIndex === LEVELS.length - 1 ? "Finish Run" : "Next Level";
  setMessage("Level complete!");
}

function loseLevel() {
  game.state = "gameover";
  overlay.classList.remove("hidden");
  overlayText.textContent = `The ${currentLevel().name} CPU got you this time.`;
  overlayButton.textContent = "Retry Level";
  setMessage("Try again and protect the ball.");
}

function startCheck(offenseTeam) {
  game.possession = offenseTeam;
  game.phase = "check";
  game.checkTimer = offenseTeam === "cpu" ? 45 : 0;
  game.pendingShot = null;
  game.cpuShotCooldown = 0;
  game.rimSoundTimer = 0;

  const offense = offenseTeam === "player" ? player : cpu;
  const defense = offenseTeam === "player" ? cpu : player;
  const attackHoop = offensiveHoopFor(offenseTeam);
  const checkX = offenseTeam === "player" ? HOOPS.right.x - 250 : HOOPS.left.x + 250;

  offense.x = checkX;
  offense.y = PLAYER_START_Y;
  offense.vx = 0;
  offense.vy = 0;
  offense.onGround = true;
  offense.facing = offenseTeam === "player" ? 1 : -1;
  offense.hasBall = true;
  offense.chargeLocked = false;
  offense.shotCharge = 0;
  offense.blockTimer = 0;

  defense.x = checkX + (offenseTeam === "player" ? 86 : -86);
  defense.y = PLAYER_START_Y;
  defense.vx = 0;
  defense.vy = 0;
  defense.onGround = true;
  defense.facing = offenseTeam === "player" ? -1 : 1;
  defense.hasBall = false;
  defense.chargeLocked = false;
  defense.shotCharge = 0;
  defense.blockTimer = 0;

  holdBall(offenseTeam);
  setMessage(`${capitalize(offenseTeam)} ball. Check it from the 3-point line, then attack the ${attackHoop.side} basket.`);
  updateHud();
}

function releaseCheckBall() {
  if (game.phase !== "check") {
    return;
  }
  game.phase = "live";
  game.bannerText = "CHECK!";
  game.bannerTimer = 45;
  setMessage(`${capitalize(game.possession)} is live. Go score.`);
}

function desiredChargeForDistance(distance) {
  return clamp(0.36 + distance / 760, 0.42, 0.9);
}

function jump(actor, power = 8.6) {
  if (!actor.onGround) {
    return;
  }
  actor.vy = -power;
  actor.onGround = false;
  actor.blockTimer = 12;
}

function shootBall(shooter, defender) {
  const attackHoop = offensiveHoopFor(shooter.type);
  const distance = Math.abs(attackHoop.x - shooter.x);
  const targetCharge = desiredChargeForDistance(distance);
  const timingScore = 1 - Math.abs(shooter.shotCharge - targetCharge) * 1.55;
  const contestDistance = Math.abs(defender.x - shooter.x);
  const contestPenalty = contestDistance < 56 ? currentLevel().contest * (defender.blockTimer > 0 ? 1.08 : 0.82) : 0;
  const distancePenalty = clamp((distance - 180) / 560, 0, 0.36);
  const baseSkill = shooter.type === "cpu" ? currentLevel().shotSkill : 0.6;
  const makeChance = clamp(baseSkill + timingScore * 0.3 - contestPenalty - distancePenalty, 0.14, 0.92);
  const made = Math.random() < makeChance;

  shooter.hasBall = false;
  shooter.shotCharge = 0;
  shooter.chargeLocked = false;
  game.pendingShot = {
    shooter: shooter.type,
    hoop: attackHoop.side,
    made,
    counted: false
  };

  if (shooter.onGround) {
    jump(shooter, 7.5);
  }

  const targetX = made ? attackHoop.x : attackHoop.x + (Math.random() < 0.5 ? -48 : 48);
  const targetY = made ? attackHoop.rimY + 8 : attackHoop.rimY - 22;
  const time = clamp(Math.abs(targetX - shooter.x) / 10.4, 24, 40);
  const startX = shooter.x + shooter.facing * 16;
  const startY = shooter.y - 38;

  ball.mode = "air";
  ball.holder = null;
  ball.x = startX;
  ball.y = startY;
  ball.vx = (targetX - startX) / time;
  ball.vy = (targetY - startY - 0.5 * BALL_GRAVITY * time * time) / time;
  ball.scored = false;
  ball.justHitBackboard = false;
  ball.bounceCount = 0;

  setMessage(shooter.type === "player" ? "Shoot!" : "CPU shoots!");
}

function maybeBlockShot(defender, shooter) {
  if (
    !game.pendingShot ||
    game.pendingShot.counted ||
    defender.blockTimer <= 0 ||
    ball.mode !== "air" ||
    Math.abs(defender.x - ball.x) > 30 ||
    Math.abs((defender.y - 44) - ball.y) > 42
  ) {
    return false;
  }

  const blockChance = defender.type === "cpu" ? 0.8 : 0.72;
  if (Math.random() > blockChance) {
    return false;
  }

  const direction = defender.type === "cpu" ? -1 : 1;
  ball.vx = (2.8 + Math.random() * 1.5) * direction;
  ball.vy = -3.4 - Math.random() * 1.4;
  ball.mode = "loose";
  ball.holder = null;
  ball.justHitBackboard = false;
  game.pendingShot = null;
  defender.blockTimer = 0;
  playBlockSound();
  setMessage(defender.type === "cpu" ? "CPU block!" : "Block! Loose ball.");
  return true;
}

function awardScore(team) {
  if (game.pendingShot?.counted) {
    return;
  }

  game.pendingShot.counted = true;

  if (team === "player") {
    game.playerScore += 1;
    setMessage("Bucket! You scored.");
  } else {
    game.cpuScore += 1;
    setMessage("CPU scored.");
  }

  playSwish();
  playCrowdCheer();
  game.bannerText = team === "player" ? "SWISH!" : "CPU BUCKET";
  game.bannerTimer = 55;
  updateHud();

  const targetScore = currentLevel().targetScore;
  if (game.playerScore >= targetScore) {
    window.setTimeout(winLevel, 650);
    return;
  }
  if (game.cpuScore >= targetScore) {
    window.setTimeout(loseLevel, 650);
    return;
  }

  window.setTimeout(() => {
    if (game.state === "playing") {
      startCheck(team === "player" ? "cpu" : "player");
    }
  }, 650);
}

function forcePossession(newOffense, reasonText) {
  startCheck(newOffense);
  setMessage(reasonText);
}

function attemptSteal(attacker, defender) {
  if (game.phase !== "live" || attacker.stealCooldown > 0 || !defender.hasBall || Math.abs(attacker.x - defender.x) > 44) {
    return;
  }

  attacker.stealCooldown = 30;
  const successChance = attacker.type === "cpu" ? currentLevel().stealRate * 42 : 0.2;
  if (Math.random() < successChance) {
    defender.hasBall = false;
    attacker.hasBall = true;
    playBlockSound();
    forcePossession(attacker.type, attacker.type === "player" ? "Steal! Check it up top." : "CPU steal. Check ball.");
  }
}

function updateEnergy(actor, sprinting, movementAmount) {
  if (sprinting && movementAmount !== 0 && actor.energy > 0.02) {
    actor.energy = clamp(actor.energy - 0.014, 0, 1);
  } else {
    actor.energy = clamp(actor.energy + 0.008, 0, 1);
  }
}

function updateActor(actor, movement, sprinting) {
  const maxSprint = actor.type === "cpu" ? currentLevel().cpuSprint : 4.15;
  const baseSpeed = actor.type === "cpu" ? currentLevel().cpuSpeed : 2.85;
  const sprintAllowed = sprinting && actor.energy > 0.08;
  const speed = sprintAllowed ? maxSprint : baseSpeed;

  actor.vx = movement * speed;
  actor.x += actor.vx;
  actor.x = clamp(actor.x, 62, WIDTH - 62);
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

  updateEnergy(actor, sprintAllowed, movement);

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

  if (player.hasBall && game.phase === "live" && keys.shoot && player.onGround) {
    player.shotCharge = clamp(player.shotCharge + 0.022, 0, 1);
    player.chargeLocked = true;
  } else if (player.hasBall && !keys.shoot) {
    player.shotCharge *= 0.84;
  }
}

function updateCpu() {
  const level = currentLevel();
  let movement = 0;
  let sprinting = false;

  if (cpu.hasBall) {
    const hoop = offensiveHoopFor("cpu");
    const targetX = clamp(hoop.x + 150 + Math.sin(game.lastTime * 0.0012) * 46, 170, 540);
    if (Math.abs(cpu.x - targetX) > 12) {
      movement = cpu.x < targetX ? 1 : -1;
      sprinting = Math.abs(cpu.x - targetX) > 80;
    }

    if (game.phase === "live") {
      const openLook = Math.abs(cpu.x - player.x) > 86 || player.blockTimer === 0;
      if (openLook) {
        cpu.shotCharge = clamp(cpu.shotCharge + level.reaction, 0, 1);
        const desired = desiredChargeForDistance(Math.abs(hoop.x - cpu.x));
        if (cpu.shotCharge >= desired && game.cpuShotCooldown <= 0) {
          shootBall(cpu, player);
          cpu.shotCharge = 0;
          game.cpuShotCooldown = 55;
        }
      } else {
        cpu.shotCharge *= 0.84;
      }
    }
  } else {
    cpu.shotCharge *= 0.8;
    const guardTarget = clamp(player.x + (game.possession === "player" ? 48 : -48), 90, WIDTH - 90);
    if (Math.abs(cpu.x - guardTarget) > 8) {
      movement = cpu.x < guardTarget ? 1 : -1;
      sprinting = Math.abs(cpu.x - guardTarget) > 72;
    }

    if (game.phase === "live" && player.hasBall && Math.abs(cpu.x - player.x) < 42 && Math.random() < level.stealRate && cpu.stealCooldown <= 0) {
      attemptSteal(cpu, player);
    }

    if (game.phase === "live" && player.hasBall && player.chargeLocked && Math.abs(cpu.x - player.x) < 60 && cpu.onGround) {
      jump(cpu, 8.5);
    }
  }

  if (game.cpuShotCooldown > 0) {
    game.cpuShotCooldown -= 1;
  }

  updateActor(cpu, movement, sprinting);
}

function tryCollectLooseBall() {
  const playerDistance = Math.abs(ball.x - player.x);
  const cpuDistance = Math.abs(ball.x - cpu.x);
  const nearest = playerDistance <= cpuDistance ? player : cpu;
  if (ball.y + ball.radius >= FLOOR_Y && Math.abs(ball.x - nearest.x) < 34) {
    forcePossession(nearest.type, nearest.type === "player" ? "Rebound! Check it." : "CPU rebound. Check ball.");
  }
}

function updateBall() {
  if (ball.mode === "held") {
    attachBallToHolder();
    if (game.phase === "live" && player.hasBall && player.onGround && Math.abs(player.vx) > 0.5 && game.dribbleTimer <= 0) {
      playBounceSound(2.7);
      game.dribbleTimer = 16;
    }
    return;
  }

  ball.x += ball.vx;
  ball.y += ball.vy;
  ball.vy += BALL_GRAVITY;

  if (maybeBlockShot(cpu, player) || maybeBlockShot(player, cpu)) {
    return;
  }

  for (const hoop of [HOOPS.left, HOOPS.right]) {
    const isBackboardHit =
      !ball.justHitBackboard &&
      ball.x + ball.radius >= hoop.backboardX &&
      ball.x - ball.radius <= hoop.backboardX + hoop.backboardWidth &&
      ball.y >= hoop.backboardTop &&
      ball.y <= hoop.backboardTop + hoop.backboardHeight;

    if (isBackboardHit) {
      ball.justHitBackboard = true;
      if (hoop.side === "right") {
        ball.x = hoop.backboardX - ball.radius;
        ball.vx = -Math.abs(ball.vx) * 0.48;
      } else {
        ball.x = hoop.backboardX + hoop.backboardWidth + ball.radius;
        ball.vx = Math.abs(ball.vx) * 0.48;
      }
      ball.vy = ball.vy * 0.72 + 0.8;
    }

    const rimLeft = hoop.x - hoop.rimRadius + 4;
    const rimRight = hoop.x + hoop.rimRadius - 4;
    if (
      !ball.scored &&
      game.pendingShot &&
      game.pendingShot.hoop === hoop.side &&
      ball.vy > 0 &&
      ball.y > hoop.rimY &&
      ball.y < hoop.rimY + hoop.netHeight &&
      ball.x > rimLeft &&
      ball.x < rimRight
    ) {
      ball.scored = true;
      awardScore(game.pendingShot.shooter);
      return;
    }

    const rimDistanceLeft = Math.hypot(ball.x - (hoop.x - hoop.rimRadius), ball.y - hoop.rimY);
    const rimDistanceRight = Math.hypot(ball.x - (hoop.x + hoop.rimRadius), ball.y - hoop.rimY);
    if ((rimDistanceLeft < ball.radius + 4 || rimDistanceRight < ball.radius + 4) && game.rimSoundTimer <= 0) {
      ball.vx *= -0.82;
      ball.vy *= 0.78;
      playRimBang();
      game.rimSoundTimer = 8;
    }
  }

  if (ball.y + ball.radius >= FLOOR_Y) {
    const impactSpeed = Math.abs(ball.vy);
    ball.y = FLOOR_Y - ball.radius;
    ball.vy *= -0.46;
    ball.vx *= 0.76;
    ball.bounceCount += 1;
    playBounceSound(impactSpeed);

    if (Math.abs(ball.vy) < 1.5 || ball.bounceCount > 4) {
      ball.vy = 0;
      ball.mode = "loose";
    }
  }

  if (ball.x < 20 || ball.x > WIDTH - 20 || ball.y > HEIGHT + 40) {
    const newOffense = game.pendingShot?.shooter === "player" ? "cpu" : "player";
    forcePossession(newOffense, "Out of bounds. Check ball.");
    return;
  }

  if (ball.mode === "loose") {
    tryCollectLooseBall();
  }
}

function handleInputEdges() {
  if (game.phase === "check") {
    if (game.possession === "player" && !edges.shootWasDown && keys.shoot) {
      releaseCheckBall();
    }
    edges.shootWasDown = keys.shoot;
    edges.defendWasDown = keys.defend;
    return;
  }

  if (!edges.defendWasDown && keys.defend) {
    if (player.hasBall) {
      setMessage("Protect the ball and create space.");
    } else {
      if (player.onGround) {
        jump(player, 8.7);
      }
      attemptSteal(player, cpu);
    }
  }

  if (!edges.shootWasDown && keys.shoot && !player.hasBall && player.onGround) {
    jump(player, 8.4);
  }

  if (edges.shootWasDown && !keys.shoot && player.hasBall && game.phase === "live" && player.chargeLocked) {
    shootBall(player, cpu);
  }

  edges.shootWasDown = keys.shoot;
  edges.defendWasDown = keys.defend;
}

function updateGame() {
  if (game.state !== "playing") {
    return;
  }

  if (game.checkTimer > 0) {
    game.checkTimer -= 1;
    if (game.checkTimer === 0 && game.possession === "cpu") {
      releaseCheckBall();
    }
  }

  updatePlayer();
  updateCpu();
  handleInputEdges();
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
  sky.addColorStop(0.42, "#17253a");
  sky.addColorStop(1, "#596a77");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "#0d131b";
  ctx.fillRect(0, 0, WIDTH, 96);
  for (let x = 20; x < WIDTH; x += 86) {
    ctx.fillStyle = "rgba(255, 247, 176, 0.18)";
    ctx.fillRect(x, 18, 44, 10);
  }

  const bleachers = [
    { x: 0, y: 138, w: 248, h: 132, direction: 1 },
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

  for (let i = 0; i < 180; i += 1) {
    const x = (i * 53) % WIDTH;
    const y = FLOOR_Y + ((i * 41) % (HEIGHT - FLOOR_Y));
    ctx.fillStyle = i % 3 === 0 ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.08)";
    ctx.fillRect(x, y, 3, 3);
  }

  ctx.fillStyle = "#0e1115";
  ctx.fillRect(0, FLOOR_Y, WIDTH, 8);

  ctx.strokeStyle = "rgba(255, 225, 134, 0.94)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, FLOOR_Y);
  ctx.lineTo(WIDTH, FLOOR_Y);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(CENTER_X, FLOOR_Y - 172);
  ctx.lineTo(CENTER_X, FLOOR_Y);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(CENTER_X, FLOOR_Y - 86, 44, 0, Math.PI * 2);
  ctx.stroke();

  drawKey(HOOPS.left, true);
  drawKey(HOOPS.right, false);
}

function drawKey(hoop, isLeft) {
  const keyWidth = 158;
  const keyHeight = 144;
  const keyX = isLeft ? 0 : WIDTH - keyWidth;

  ctx.beginPath();
  ctx.rect(keyX, FLOOR_Y - keyHeight, keyWidth, keyHeight);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(isLeft ? keyWidth : WIDTH - keyWidth, FLOOR_Y, 68, isLeft ? Math.PI / 2 : -Math.PI / 2, isLeft ? Math.PI * 1.5 : Math.PI / 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(isLeft ? 82 : WIDTH - 82, FLOOR_Y - keyHeight);
  ctx.lineTo(isLeft ? 82 : WIDTH - 82, FLOOR_Y);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(hoop.x + (isLeft ? 88 : -88), FLOOR_Y, 108, isLeft ? Math.PI : 0, isLeft ? 0 : Math.PI);
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 149, 0, 0.1)";
  ctx.beginPath();
  ctx.arc(hoop.x + (isLeft ? 88 : -88), FLOOR_Y, 108, isLeft ? Math.PI : 0, isLeft ? 0 : Math.PI);
  ctx.fill();
}

function drawHoop(hoop) {
  ctx.fillStyle = "#d8dde8";
  ctx.fillRect(hoop.backboardX, hoop.backboardTop, hoop.backboardWidth, hoop.backboardHeight);

  ctx.strokeStyle = "#d55140";
  ctx.lineWidth = 3;
  ctx.strokeRect(hoop.side === "left" ? hoop.backboardX - 10 : hoop.backboardX - 8, hoop.backboardTop + 45, 34, 28);

  ctx.fillStyle = "#e04f3f";
  ctx.fillRect(hoop.side === "left" ? hoop.x - 90 : hoop.x + 18, hoop.rimY - 14, 72, 10);

  ctx.strokeStyle = "#ff6a3b";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(hoop.x - hoop.rimRadius, hoop.rimY);
  ctx.lineTo(hoop.x + hoop.rimRadius, hoop.rimY);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.92)";
  ctx.lineWidth = 2;
  for (let i = -30; i <= 30; i += 15) {
    const sway = Math.sin(game.lastTime * 0.02 + i) * 1.5;
    ctx.beginPath();
    ctx.moveTo(hoop.x + i, hoop.rimY + 3);
    ctx.lineTo(hoop.x + i * 0.2 + sway, hoop.rimY + hoop.netHeight);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.moveTo(hoop.x - 30, hoop.rimY + 18);
  ctx.lineTo(hoop.x + 30, hoop.rimY + 18);
  ctx.stroke();
}

function drawActor(actor) {
  const blinkOffset = actor.blinkTimer > 0 ? Math.sin(game.lastTime * 0.3) * 3 : 0;
  const topY = actor.y - PLAYER_HEIGHT - blinkOffset;

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

  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.font = "bold 13px Trebuchet MS";
  ctx.textAlign = "center";
  ctx.fillText(actor.type === "player" ? "YOU" : "CPU", actor.x, topY - 8);
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
  if (!player.hasBall || game.phase !== "live") {
    return;
  }

  const meterX = 170;
  const meterY = 120;
  const meterW = 26;
  const meterH = 176;
  const target = desiredChargeForDistance(Math.abs(offensiveHoopFor("player").x - player.x));

  ctx.fillStyle = "rgba(0,0,0,0.34)";
  ctx.fillRect(meterX, meterY, meterW, meterH);
  ctx.fillStyle = "#27d17c";
  ctx.fillRect(meterX + 4, meterY + meterH - player.shotCharge * (meterH - 8) - 4, meterW - 8, player.shotCharge * (meterH - 8));

  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 2;
  ctx.strokeRect(meterX, meterY, meterW, meterH);

  const targetY = meterY + meterH - target * (meterH - 8) - 4;
  ctx.strokeStyle = "#ffea6a";
  ctx.beginPath();
  ctx.moveTo(meterX - 4, targetY);
  ctx.lineTo(meterX + meterW + 4, targetY);
  ctx.stroke();

  ctx.fillStyle = "#fff0bd";
  ctx.font = "bold 12px Trebuchet MS";
  ctx.textAlign = "left";
  ctx.fillText("SHOT", meterX - 4, meterY - 12);
}

function drawSprintBar() {
  const x = 170;
  const y = 324;
  const w = 26;
  const h = 138;
  ctx.fillStyle = "rgba(0,0,0,0.34)";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = player.energy > 0.3 ? "#5bd3ff" : "#ff9b54";
  ctx.fillRect(x + 4, y + h - player.energy * (h - 8) - 4, w - 8, player.energy * (h - 8));
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = "#fff0bd";
  ctx.font = "bold 12px Trebuchet MS";
  ctx.textAlign = "left";
  ctx.fillText("SPRINT", x - 12, y - 12);
}

function drawCoachPanel() {
  ctx.fillStyle = "rgba(8, 12, 18, 0.76)";
  ctx.fillRect(20, 124, 132, 284);
  ctx.strokeStyle = "rgba(255, 220, 140, 0.45)";
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 124, 132, 284);

  ctx.fillStyle = "#fff0bd";
  ctx.font = "bold 16px Trebuchet MS";
  ctx.textAlign = "left";
  ctx.fillText("Controls", 34, 152);

  ctx.font = "bold 13px Trebuchet MS";
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillText("A / D  Move", 34, 182);
  ctx.fillText("Shift  Sprint", 34, 208);
  ctx.fillText("Space  Shoot", 34, 234);
  ctx.fillText("Space  Jump", 34, 260);
  ctx.fillText("S  Steal / Block", 34, 286);

  ctx.fillStyle = "#ffa14a";
  ctx.fillText("Offense:", 34, 318);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillText("run the lane,", 34, 338);
  ctx.fillText("charge, and", 34, 356);
  ctx.fillText("finish strong.", 34, 374);

  ctx.fillStyle = "#5bd3ff";
  ctx.fillText("Check ball:", 34, 404);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillText("after changes,", 34, 424);
  ctx.fillText("tap Space", 34, 442);
  ctx.fillText("to go live.", 34, 460);
}

function drawBanner() {
  if (game.bannerTimer <= 0) {
    return;
  }

  const alpha = Math.min(game.bannerTimer / 60, 1);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "rgba(12, 16, 22, 0.82)";
  ctx.fillRect(WIDTH / 2 - 185, 34, 370, 54);
  ctx.fillStyle = "#fff0bd";
  ctx.font = "bold 28px Trebuchet MS";
  ctx.textAlign = "center";
  ctx.fillText(game.bannerText, WIDTH / 2, 68);
  ctx.restore();
}

function render() {
  drawBackground();
  drawCourt();
  drawHoop(HOOPS.left);
  drawHoop(HOOPS.right);
  drawCoachPanel();
  drawShotMeter();
  drawSprintBar();
  drawActor(player);
  drawActor(cpu);
  drawBall();
  drawBanner();
}

function handleKeyDown(event) {
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

function frame(timestamp) {
  game.lastTime = timestamp;
  updateGame();
  render();
  window.requestAnimationFrame(frame);
}

overlayButton.addEventListener("click", handleOverlayButton);
restartButton.addEventListener("click", startRun);
window.addEventListener("keydown", handleKeyDown);
window.addEventListener("keyup", handleKeyUp);

updateHud();
render();
window.requestAnimationFrame(frame);
