// ==================== FLIPMATCH GAME ENGINE ====================

// 1. EMOJI PALETTE (High contrast, vibrant emojis)
const ALL_EMOJIS = ["🚀", "💎", "🍕", "🎮", "🦄", "⚡", "🥑", "🎧", "🍦", "🎨", "🛸", "🍩"];

// 2. GAME STATE
let state = {
  pairCount: 6, // 6 pairs (12 cards) or 8 pairs (16 cards)
  cards: [],
  flippedCards: [],
  matchedPairs: 0,
  moves: 0,
  timerSeconds: 0,
  timerInterval: null,
  isGameStarted: false,
  isLocked: false,
  soundEnabled: true
};

// 3. SOUND SYNTHESIZER (Native Web Audio API - Zero External Files)
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
}

function playSound(type) {
  if (!state.soundEnabled) return;
  try {
    initAudio();
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    if (type === 'flip') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(600, now + 0.08);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === 'match') {
      // Harmonic pleasant chord
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.1); // E5
      osc.frequency.setValueAtTime(783.99, now + 0.2); // G5
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (type === 'win') {
      // Victory fanfare
      [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.connect(g);
        g.connect(audioCtx.destination);
        o.type = 'triangle';
        o.frequency.setValueAtTime(freq, now + i * 0.12);
        g.gain.setValueAtTime(0.25, now + i * 0.12);
        g.gain.exponentialRampToValueAtTime(0.01, now + i * 0.12 + 0.3);
        o.start(now + i * 0.12);
        o.stop(now + i * 0.12 + 0.3);
      });
    }
  } catch (err) {
    console.warn("Audio synthesis error:", err);
  }
}

// 4. DOM ELEMENTS
const gridEl = document.getElementById("grid");
const timerEl = document.getElementById("timer");
const movesEl = document.getElementById("moves-count");
const starsEl = document.getElementById("stars-rating");
const bestScoreEl = document.getElementById("best-score");
const restartBtn = document.getElementById("restart-btn");
const soundToggleBtn = document.getElementById("sound-toggle-btn");
const winModal = document.getElementById("win-modal");
const modalTime = document.getElementById("modal-time");
const modalMoves = document.getElementById("modal-moves");
const modalStars = document.getElementById("modal-stars");
const modalPlayAgainBtn = document.getElementById("modal-play-again-btn");
const diffBtns = document.querySelectorAll(".diff-btn");

// 5. INITIALIZATION
document.addEventListener("DOMContentLoaded", () => {
  setupEventListeners();
  loadBestScore();
  startNewGame();
});

// 6. EVENT LISTENERS
function setupEventListeners() {
  restartBtn.addEventListener("click", () => {
    startNewGame();
  });

  modalPlayAgainBtn.addEventListener("click", () => {
    winModal.classList.remove("active");
    stopConfetti();
    startNewGame();
  });

  soundToggleBtn.addEventListener("click", () => {
    state.soundEnabled = !state.soundEnabled;
    soundToggleBtn.innerHTML = state.soundEnabled 
      ? '<i class="fa-solid fa-volume-high"></i>' 
      : '<i class="fa-solid fa-volume-xmark" style="color:#ef4444"></i>';
  });

  diffBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      diffBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.pairCount = parseInt(btn.dataset.pairs);
      loadBestScore();
      startNewGame();
    });
  });
}

// 7. GAME CONTROLLER
function startNewGame() {
  clearInterval(state.timerInterval);
  state.timerSeconds = 0;
  state.moves = 0;
  state.matchedPairs = 0;
  state.flippedCards = [];
  state.isGameStarted = false;
  state.isLocked = false;

  timerEl.textContent = "00:00";
  movesEl.textContent = "0";
  starsEl.textContent = "⭐⭐⭐";

  generateDeck();
  renderGrid();
}

function generateDeck() {
  // Pick random emojis for the pair count
  const shuffledEmojis = [...ALL_EMOJIS].sort(() => 0.5 - Math.random());
  const selectedEmojis = shuffledEmojis.slice(0, state.pairCount);

  // Duplicate each emoji to create pairs
  const deck = [...selectedEmojis, ...selectedEmojis];

  // Shuffle deck with Fisher-Yates algorithm
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  state.cards = deck.map((emoji, index) => ({
    id: index,
    emoji: emoji,
    isFlipped: false,
    isMatched: false
  }));
}

function renderGrid() {
  gridEl.innerHTML = "";
  gridEl.className = `memory-grid grid-${state.pairCount * 2}`;

  state.cards.forEach(card => {
    const cardEl = document.createElement("div");
    cardEl.className = "card";
    cardEl.dataset.id = card.id;

    cardEl.innerHTML = `
      <div class="card-back">
        <i class="fa-solid fa-brain"></i>
      </div>
      <div class="card-front">
        ${card.emoji}
      </div>
    `;

    cardEl.addEventListener("click", () => handleCardClick(card, cardEl));
    gridEl.appendChild(cardEl);
  });
}

function handleCardClick(card, cardEl) {
  // Prevent flipping if locked or already flipped/matched
  if (state.isLocked || card.isFlipped || card.isMatched) return;

  // Start timer on first move
  if (!state.isGameStarted) {
    state.isGameStarted = true;
    startTimer();
  }

  // Flip card
  card.isFlipped = true;
  cardEl.classList.add("flipped");
  state.flippedCards.push({ card, cardEl });
  playSound('flip');

  // If two cards are flipped, evaluate match
  if (state.flippedCards.length === 2) {
    state.moves++;
    movesEl.textContent = state.moves;
    updateStars();
    checkMatch();
  }
}

function checkMatch() {
  state.isLocked = true;
  const [first, second] = state.flippedCards;

  if (first.card.emoji === second.card.emoji) {
    // MATCH FOUND!
    first.card.isMatched = true;
    second.card.isMatched = true;
    first.cardEl.classList.add("matched");
    second.cardEl.classList.add("matched");

    state.matchedPairs++;
    state.flippedCards = [];
    state.isLocked = false;
    playSound('match');

    // Check if won
    if (state.matchedPairs === state.pairCount) {
      handleGameWin();
    }
  } else {
    // NO MATCH: Flip back after short delay
    setTimeout(() => {
      first.card.isFlipped = false;
      second.card.isFlipped = false;
      first.cardEl.classList.remove("flipped");
      second.cardEl.classList.remove("flipped");
      state.flippedCards = [];
      state.isLocked = false;
    }, 850);
  }
}

// 8. WIN & SCORE LOGIC
function handleGameWin() {
  clearInterval(state.timerInterval);
  playSound('win');
  startConfetti();
  saveBestScore();

  // Populate Win Modal
  modalTime.textContent = formatTime(state.timerSeconds);
  modalMoves.textContent = state.moves;
  modalStars.textContent = getStarRating();

  setTimeout(() => {
    winModal.classList.add("active");
  }, 500);
}

function startTimer() {
  state.timerInterval = setInterval(() => {
    state.timerSeconds++;
    timerEl.textContent = formatTime(state.timerSeconds);
  }, 1000);
}

function formatTime(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function updateStars() {
  starsEl.textContent = getStarRating();
}

function getStarRating() {
  const baseline = state.pairCount * 1.5;
  if (state.moves <= baseline) return "⭐⭐⭐";
  if (state.moves <= baseline + 6) return "⭐⭐";
  return "⭐";
}

function loadBestScore() {
  const key = `flipmatch_best_${state.pairCount}`;
  const saved = localStorage.getItem(key);
  bestScoreEl.textContent = saved ? `${saved} moves` : "--";
}

function saveBestScore() {
  const key = `flipmatch_best_${state.pairCount}`;
  const saved = localStorage.getItem(key);
  if (!saved || state.moves < parseInt(saved)) {
    localStorage.setItem(key, state.moves);
    bestScoreEl.textContent = `${state.moves} moves`;
  }
}

// 9. CONFETTI CELEBRATION EFFECT (Lightweight Canvas Engine)
const canvas = document.getElementById("confetti-canvas");
const ctx = canvas.getContext("2d");
let confettiParticles = [];
let confettiAnimationId = null;

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

function startConfetti() {
  confettiParticles = [];
  const colors = ["#8b5cf6", "#06b6d4", "#ec4899", "#10b981", "#f59e0b", "#3b82f6"];
  for (let i = 0; i < 120; i++) {
    confettiParticles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      r: Math.random() * 6 + 4,
      d: Math.random() * 10 + 5,
      color: colors[Math.floor(Math.random() * colors.length)],
      tilt: Math.random() * 10 - 10,
      tiltAngle: 0,
      tiltAngleIncrement: Math.random() * 0.08 + 0.04
    });
  }
  animateConfetti();
}

function animateConfetti() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  confettiParticles.forEach(p => {
    p.tiltAngle += p.tiltAngleIncrement;
    p.y += (Math.cos(p.d) + 3 + p.r / 2) / 1.5;
    p.x += Math.sin(p.d);
    p.tilt = Math.sin(p.tiltAngle) * 15;

    ctx.beginPath();
    ctx.lineWidth = p.r / 2;
    ctx.strokeStyle = p.color;
    ctx.moveTo(p.x + p.tilt + p.r / 4, p.y);
    ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 4);
    ctx.stroke();
  });

  confettiAnimationId = requestAnimationFrame(animateConfetti);
}

function stopConfetti() {
  cancelAnimationFrame(confettiAnimationId);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}
