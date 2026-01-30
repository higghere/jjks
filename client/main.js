const API_BASE = window.location.origin + '/api';
let token = localStorage.getItem('token');
let user = null;
let socket = null;
let gameScene = null;

const $ = (id) => document.getElementById(id);
const show = (id) => { $(id).classList.remove('hidden'); };
const hide = (id) => { $(id).classList.add('hidden'); };

function showScreen(name) {
  ['auth-screen', 'lobby-screen', 'gacha-screen', 'inventory-screen', 'character-select-screen', 'matchmaking-screen', 'game-screen'].forEach((s) => hide(s));
  if (name === 'auth') show('auth-screen');
  else if (name === 'lobby') show('lobby-screen');
  else if (name === 'gacha') show('gacha-screen');
  else if (name === 'inventory') show('inventory-screen');
  else if (name === 'character-select') show('character-select-screen');
  else if (name === 'matchmaking') show('matchmaking-screen');
  else if (name === 'game') show('game-screen');
}

function setAuthError(msg) {
  const el = $('auth-error');
  el.textContent = msg || '';
}

document.querySelectorAll('.auth-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    $('login-form').classList.toggle('hidden', tab.dataset.tab !== 'login');
    $('register-form').classList.toggle('hidden', tab.dataset.tab !== 'register');
    setAuthError('');
  });
});

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  setAuthError('');
  const username = $('login-username').value.trim();
  const password = $('login-password').value;
  try {
    const res = await fetch(API_BASE + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    token = data.token;
    user = data.user;
    localStorage.setItem('token', token);
    showScreen('lobby');
    updateLobbyUI();
  } catch (err) {
    setAuthError(err.message);
  }
});

$('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  setAuthError('');
  const username = $('register-username').value.trim();
  const password = $('register-password').value;
  try {
    const res = await fetch(API_BASE + '/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Register failed');
    token = data.token;
    user = data.user;
    localStorage.setItem('token', token);
    showScreen('lobby');
    updateLobbyUI();
  } catch (err) {
    setAuthError(err.message);
  }
});

function updateLobbyUI() {
  if (!user) return;
  $('lobby-username').textContent = user.username;
  $('lobby-kills').textContent = user.kills;
  $('lobby-spins').textContent = user.spins;
}

$('btn-logout').addEventListener('click', () => {
  token = null;
  user = null;
  localStorage.removeItem('token');
  if (socket) socket.disconnect();
  socket = null;
  showScreen('auth');
});

async function fetchProfile() {
  if (!token) return null;
  const res = await fetch(API_BASE + '/user/profile', {
    headers: { Authorization: 'Bearer ' + token },
  });
  if (!res.ok) return null;
  user = await res.json();
  return user;
}

$('btn-gacha').addEventListener('click', async () => {
  await fetchProfile();
  $('gacha-spins').textContent = user.spins;
  $('gacha-pity').textContent = user.pityCounter;
  $('gacha-result').classList.add('hidden');
  showScreen('gacha');
});

$('gacha-roll-1').addEventListener('click', async () => await doGacha(1));
$('gacha-roll-10').addEventListener('click', async () => await doGacha(10));

async function doGacha(count) {
  if (!token) return;
  const res = await fetch(API_BASE + '/gacha/roll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ count }),
  });
  const data = await res.json();
  if (!res.ok) {
    alert(data.error || 'Roll failed');
    return;
  }
  user.spins = data.spinsLeft;
  user.pityCounter = data.pityCounter;
  $('gacha-spins').textContent = data.spinsLeft;
  $('gacha-pity').textContent = data.pityCounter;
  const resultEl = $('gacha-result');
  resultEl.classList.remove('hidden');
  resultEl.innerHTML = data.results.map((r) => {
    const c = r.character;
    const cls = (c.rarity || '').toLowerCase();
    return `<div class="result-card ${cls}">${c.name}<br/>${c.rarity}${r.duplicate ? ' (+' + r.shards + ' shards)' : ''}</div>`;
  }).join('');
  updateLobbyUI();
}

$('gacha-close').addEventListener('click', () => {
  updateLobbyUI();
  showScreen('lobby');
});

$('btn-inventory').addEventListener('click', async () => {
  await fetchProfile();
  const list = $('inventory-list');
  list.innerHTML = '';
  (user.ownedCharacters || []).forEach((o) => {
    const card = document.createElement('div');
    card.className = 'inv-card' + (user.selectedCharacter === o.characterId ? ' selected' : '');
    card.innerHTML = `<strong>${o.characterId}</strong><br/>Stars: ${o.stars}<br/>Shards: ${o.shards}<br/><button class="btn-upgrade" data-id="${o.characterId}">Upgrade</button>`;
    card.querySelector('.btn-upgrade').addEventListener('click', async () => {
      const res = await fetch(API_BASE + '/gacha/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ characterId: o.characterId }),
      });
      const d = await res.json();
      if (res.ok) { await fetchProfile(); $('btn-inventory').click(); } else alert(d.error);
    });
    list.appendChild(card);
  });
  showScreen('inventory');
});

$('inventory-close').addEventListener('click', () => showScreen('lobby'));

$('btn-character-select').addEventListener('click', async () => {
  await fetchProfile();
  const list = $('character-select-list');
  list.innerHTML = '';
  const owned = user && user.ownedCharacters ? user.ownedCharacters : [];
  if (owned.length === 0) {
    list.innerHTML = '<p class="char-select-empty">No characters yet. Roll in Gacha first!</p>';
  } else {
    let nameMap = {};
    try {
      const charRes = await fetch(API_BASE + '/characters');
      const charData = await charRes.json();
      (charData.characters || []).forEach((c) => { nameMap[c.id] = c.name || c.id; });
    } catch (e) {}
    owned.forEach((o) => {
      const card = document.createElement('div');
      card.className = 'char-card' + (user.selectedCharacter === o.characterId ? ' selected' : '');
      const name = nameMap[o.characterId] || (o.characterId || '').charAt(0).toUpperCase() + (o.characterId || '').slice(1);
      card.innerHTML = `<strong>${name}</strong><br/>Stars: ${o.stars || 1}<br/><button class="btn-select-char" data-id="${o.characterId}">Select</button>`;
      card.querySelector('.btn-select-char').addEventListener('click', async () => {
        const charId = o.characterId;
        const res = await fetch(API_BASE + '/user/select-character', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({ characterId: charId }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          user.selectedCharacter = charId;
          await fetchProfile();
          showScreen('lobby');
          updateLobbyUI();
        } else {
          alert(data.error || 'Failed to select character');
        }
      });
      list.appendChild(card);
    });
  }
  showScreen('character-select');
});

$('character-select-close').addEventListener('click', () => showScreen('lobby'));

$('btn-matchmaking').addEventListener('click', () => {
  if (!token) return;
  connectSocket();
  socket.emit('matchmaking:join');
  showScreen('matchmaking');
});

$('matchmaking-cancel').addEventListener('click', () => {
  if (socket) socket.emit('matchmaking:leave');
  showScreen('lobby');
});

function connectSocket() {
  if (socket && socket.connected) return socket;
  socket = io(window.location.origin, {
    auth: { token },
    transports: ['websocket', 'polling'],
  });
  socket.on('connect_error', (err) => console.error('Socket error', err));
  socket.on('matchmaking:matched', (data) => {
    hide('matchmaking-screen');
    show('game-screen');
    socket.emit('game:join-room', data.roomId);
    startGame(data);
  });
  return socket;
}

function startGame(matchData) {
  const roomId = matchData.roomId;
  const side = matchData.side;
  const room = matchData.room;
  if (gameScene) gameScene.dispose();
  gameScene = new GameScene({
    roomId,
    side,
    room,
    socket,
    user,
    onRespawn: () => socket.emit('game:respawn'),
    onBack: () => { showScreen('lobby'); if (gameScene) gameScene.dispose(); },
  });
  gameScene.init();
}

class GameScene {
  constructor(opts) {
    this.roomId = opts.roomId;
    this.side = opts.side;
    this.room = opts.room;
    this.socket = opts.socket;
    this.user = opts.user;
    this.onRespawn = opts.onRespawn;
    this.onBack = opts.onBack;
    this.canvas = $('game-canvas');
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.world = null;
    this.myMesh = null;
    this.enemyMesh = null;
    this.clock = new THREE.Clock();
    this.keys = {};
    this.ceMode = false;
    this.remoteState = {};
    this.abilityCooldowns = [0, 0, 0, 0];
    this.characterData = null;
    this.blocking = false;
    this.m1Combo = 0;
    this.lastM1Time = 0;
    this.enemySocketId = null;
    this.stateEmitAccum = 0;
  }

  async init() {
    const res = await fetch(API_BASE + '/user/profile', { headers: { Authorization: 'Bearer ' + token } });
    const profile = await res.json();
    const charId = profile.selectedCharacter || (profile.ownedCharacters && profile.ownedCharacters[0] && profile.ownedCharacters[0].characterId) || 'yuki';
    let chars = [];
    try {
      const data = await fetch(API_BASE + '/characters').then(r => r.json());
      chars = data.characters || [];
    } catch (e) {}
    if (!chars.length) chars = [{ id: 'yuki', name: 'Yuji Itadori', hp: 1200, ceMax: 100, ceRegen: 2, abilities: [{ name: 'Divergent Fist', effectType: 'impact', cooldown: 4, ceCost: 15, damage: 120, ceModDamage: 180 }, { name: 'Black Flash', effectType: 'blackflash', cooldown: 6, ceCost: 25, damage: 150, ceModDamage: 220 }, { name: 'Cursed Energy Burst', effectType: 'burst', cooldown: 10, ceCost: 40, damage: 200, ceModDamage: 300 }, { name: 'Impact Wave', effectType: 'impact', cooldown: 20, ceCost: 60, damage: 350, ceModDamage: 500 }], m1Damage: 30, m1CeMod: 45, dashCeCost: 5 }];
    this.allCharacters = chars;
    this.characterData = chars.find((c) => c.id === charId) || chars[0];
    this.matchOver = false;
    this.setupThree();
    this.setupSocket();
    this.setupInput();
    $('game-hud').classList.remove('hidden');
    this.updateHUD();
    this.ceRegenInterval = setInterval(() => {
      if (this.room && this.room.players[this.side] && this.room.players[this.side].state === 'alive') this.socket.emit('game:ce-regen');
    }, 1000);
    this.animate();
  }

  setupThree() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0e17);
    scene.fog = new THREE.Fog(0x0a0e17, 25, 70);
    const camera = new THREE.PerspectiveCamera(60, this.canvas.clientWidth / this.canvas.clientHeight, 0.1, 1000);
    camera.position.set(0, 8, 15);
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(10, 20, 10);
    light.castShadow = true;
    scene.add(light);
    scene.add(new THREE.AmbientLight(0x444466, 0.5));
    this.abilityEffects = [];
    const arenaW = 24;
    const arenaD = 18;
    const floorGeo = new THREE.PlaneGeometry(arenaW, arenaD);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x2a2a3a, roughness: 0.9, metalness: 0.1 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    const wallH = 3;
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x1a1a28, roughness: 0.8 });
    const walls = [
      [0, 0, -arenaD / 2, arenaW, wallH, 0.2],
      [0, 0, arenaD / 2, arenaW, wallH, 0.2],
      [-arenaW / 2, 0, 0, 0.2, wallH, arenaD],
      [arenaW / 2, 0, 0, 0.2, wallH, arenaD],
    ];
    walls.forEach(([x, y, z, w, h, d]) => {
      const g = new THREE.BoxGeometry(w, h, d);
      const m = new THREE.Mesh(g, wallMat);
      m.position.set(x, y + h / 2, z);
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);
    });
    const grid = new THREE.GridHelper(arenaW, 20, 0x333355, 0x222244);
    grid.position.y = 0.01;
    scene.add(grid);
    const geo = new THREE.CapsuleGeometry(0.5, 1.2, 4, 8);
    const mat = new THREE.MeshStandardMaterial({ color: 0x4ade80 });
    const myMesh = new THREE.Mesh(geo, mat);
    myMesh.castShadow = true;
    myMesh.receiveShadow = true;
    const me = this.room.players[this.side];
    myMesh.position.set(me.position.x, me.position.y, me.position.z);
    scene.add(myMesh);
    const matEnemy = new THREE.MeshStandardMaterial({ color: 0xef4444 });
    const enemyMesh = new THREE.Mesh(geo, matEnemy);
    enemyMesh.castShadow = true;
    const other = this.room.players[1 - this.side];
    enemyMesh.position.set(other.position.x, other.position.y, other.position.z);
    scene.add(enemyMesh);
    this.enemySocketId = other.socketId;
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.myMesh = myMesh;
    this.enemyMesh = enemyMesh;
    window.addEventListener('resize', () => this.onResize());
  }

  onResize() {
    if (!this.camera || !this.renderer) return;
    this.camera.aspect = this.canvas.clientWidth / this.canvas.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
  }

  setupSocket() {
    this.socket.on('game:state-update', (data) => {
      this.remoteState[data.socketId] = data;
    });
    this.socket.on('game:room-sync', (data) => {
      data.players.forEach((p) => {
        this.remoteState[p.socketId] = p;
        if (this.room) {
          const idx = this.room.players.findIndex((r) => r.socketId === p.socketId);
          if (idx !== -1) {
            this.room.players[idx].hp = p.hp;
            this.room.players[idx].maxHp = p.maxHp;
            this.room.players[idx].ce = p.ce;
            this.room.players[idx].maxCe = p.maxCe;
            this.room.players[idx].kills = p.kills;
            this.room.players[idx].position = p.position;
            this.room.players[idx].rotation = p.rotation;
            this.room.players[idx].state = p.state;
            this.room.players[idx].blocking = p.blocking;
          }
        }
        if (p.socketId !== this.socket.id && this.enemyMesh) {
          this.enemySocketId = p.socketId;
          this.enemyMesh.position.set(p.position.x, p.position.y, p.position.z);
          this.enemyMesh.rotation.set(p.rotation.x, p.rotation.y, p.rotation.z);
        }
      });
      if (!this.matchOver && this.room) {
        const me = this.room.players[this.side];
        const other = this.room.players[1 - this.side];
        if (me && other && (me.state === 'dead' || other.state === 'dead')) {
          this.matchOver = true;
          this.showMatchEnd(me.state === 'dead' ? 'lose' : 'win');
        }
      }
    });
    this.socket.on('game:hit-result', (data) => {
      if (data.abilityIndex !== undefined && data.abilityIndex !== null) {
        const fromMe = data.fromSocketId === this.socket.id;
        const casterSide = fromMe ? this.side : 1 - this.side;
        const casterCharId = this.room.players[casterSide] && this.room.players[casterSide].characterId;
        const pos = fromMe
          ? this.room.players[this.side].position
          : (this.room.players[1 - this.side] && this.room.players[1 - this.side].position);
        if (pos) this.spawnAbilityEffect(data.abilityIndex, pos, casterCharId);
      }
      this.updateHUD();
    });
    this.socket.on('game:respawn', (data) => {
      if (this.matchOver) return;
      if (data.socketId === this.socket.id && this.myMesh) {
        this.myMesh.position.set(data.position.x, data.position.y, data.position.z);
        $('game-respawn-btn').classList.add('hidden');
      }
      this.updateHUD();
    });
    this.socket.on('game:ce-update', (data) => {
      this.updateHUD();
    });
    this.socket.on('game:opponent-disconnected', () => {
      alert('Opponent left. You win!');
      this.onBack();
    });
  }

  setupInput() {
    document.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'KeyC') { this.ceMode = !this.ceMode; this.updateHUD(); }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.blocking = true;
      if (e.code === 'KeyQ') this.useAbility(0);
      if (e.code === 'KeyE') this.useAbility(1);
      if (e.code === 'KeyR') this.useAbility(2);
      if (e.code === 'KeyF') this.useAbility(3);
    });
    document.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.blocking = false;
    });
    this.canvas.addEventListener('click', () => this.tryM1());
    const ceBtn = $('hud-ce-toggle-btn');
    if (ceBtn) ceBtn.addEventListener('click', () => { this.ceMode = !this.ceMode; this.updateHUD(); });
  }

  distanceToEnemy() {
    const me = this.room.players[this.side];
    const other = this.room.players[1 - this.side];
    if (!me || !other) return 999;
    const dx = me.position.x - other.position.x, dz = me.position.z - other.position.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  tryM1() {
    const me = this.room.players[this.side];
    if (!me || me.state !== 'alive' || !this.enemySocketId) return;
    if (this.distanceToEnemy() > 4) return;
    this.socket.emit('game:hit', { targetSocketId: this.enemySocketId, ceUsed: this.ceMode });
  }

  useAbility(idx) {
    const me = this.room.players[this.side];
    if (!me || me.state !== 'alive' || !this.enemySocketId || this.abilityCooldowns[idx] > 0) return;
    const ab = this.characterData && this.characterData.abilities && this.characterData.abilities[idx];
    if (!ab) return;
    const cost = this.ceMode ? ab.ceCost : 0;
    if (me.ce < cost) return;
    if (this.distanceToEnemy() > 6) return;
    this.spawnAbilityEffect(idx, me.position, this.characterData.id);
    this.socket.emit('game:hit', { targetSocketId: this.enemySocketId, abilityIndex: idx, ceUsed: this.ceMode });
    this.abilityCooldowns[idx] = ab.cooldown || 4;
  }

  getEffectType(casterCharId, abilityIndex) {
    const char = (this.allCharacters || []).find((c) => c.id === casterCharId);
    const ab = char && char.abilities && char.abilities[abilityIndex];
    return (ab && ab.effectType) || 'burst';
  }

  spawnAbilityEffect(abilityIndex, position, casterCharId) {
    if (!this.scene) return;
    const effectType = this.getEffectType(casterCharId, abilityIndex);
    const x = position.x || 0, z = position.z || 0;
    const startTime = this.clock.getElapsedTime();
    const duration = 0.7;
    const parts = [];
    const disposePart = (mesh, mat) => {
      if (this.scene && mesh) this.scene.remove(mesh);
      if (mesh && mesh.geometry) mesh.geometry.dispose();
      if (mat) mat.dispose();
    };
    if (effectType === 'blackflash') {
      const ringGeo = new THREE.RingGeometry(0.2, 0.6, 32);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x1a0033, side: THREE.DoubleSide, transparent: true, opacity: 0.95 });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, 0.3, z);
      this.scene.add(ring);
      const flashGeo = new THREE.CircleGeometry(0.8, 24);
      const flashMat = new THREE.MeshBasicMaterial({ color: 0xff00ff, transparent: true, opacity: 0.8 });
      const flash = new THREE.Mesh(flashGeo, flashMat);
      flash.rotation.x = -Math.PI / 2;
      flash.position.set(x, 0.31, z);
      this.scene.add(flash);
      parts.push({ mesh: ring, mat: ringMat }, { mesh: flash, mat: flashMat });
    } else if (effectType === 'impact' || effectType === 'burst') {
      const ringGeo = new THREE.RingGeometry(0.4, 0.7, 32);
      const ringMat = new THREE.MeshBasicMaterial({ color: effectType === 'impact' ? 0xff4422 : 0x4488ff, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, 0.4, z);
      this.scene.add(ring);
      const coneGeo = new THREE.ConeGeometry(1.5, 2.8, 16);
      const coneMat = new THREE.MeshBasicMaterial({ color: effectType === 'impact' ? 0xff6622 : 0x66aaff, transparent: true, opacity: 0.35 });
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.rotation.x = Math.PI / 2;
      cone.position.set(x, 1, z);
      this.scene.add(cone);
      parts.push({ mesh: ring, mat: ringMat }, { mesh: cone, mat: coneMat });
    } else if (effectType === 'shadow') {
      const ringGeo = new THREE.RingGeometry(0.3, 0.8, 32);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x220044, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, 0.2, z);
      this.scene.add(ring);
      const spiralGeo = new THREE.TorusGeometry(0.6, 0.15, 8, 24);
      const spiralMat = new THREE.MeshBasicMaterial({ color: 0x440088, transparent: true, opacity: 0.6 });
      const spiral = new THREE.Mesh(spiralGeo, spiralMat);
      spiral.rotation.x = Math.PI / 2;
      spiral.position.set(x, 0.8, z);
      this.scene.add(spiral);
      parts.push({ mesh: ring, mat: ringMat }, { mesh: spiral, mat: spiralMat });
    } else if (effectType === 'resonance' || effectType === 'nail') {
      const ringGeo = new THREE.RingGeometry(0.25, 0.55, 32);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xff8800, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, 0.35, z);
      this.scene.add(ring);
      const spikeGeo = new THREE.ConeGeometry(0.2, 1.2, 8);
      const spikeMat = new THREE.MeshBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 0.8 });
      for (let i = 0; i < 4; i++) {
        const spike = new THREE.Mesh(spikeGeo.clone(), spikeMat);
        spike.rotation.x = Math.PI / 2;
        spike.position.set(x + (i - 2) * 0.3, 0.5, z);
        this.scene.add(spike);
        parts.push({ mesh: spike, mat: null });
      }
      parts.push({ mesh: ring, mat: ringMat }, { mesh: null, mat: spikeMat });
    } else if (effectType === 'earth') {
      const ringGeo = new THREE.RingGeometry(0.5, 0.9, 32);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x6b4423, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, 0.05, z);
      this.scene.add(ring);
      const crackGeo = new THREE.BoxGeometry(1.2, 0.1, 1.2);
      const crackMat = new THREE.MeshBasicMaterial({ color: 0x4a3520, transparent: true, opacity: 0.7 });
      const crack = new THREE.Mesh(crackGeo, crackMat);
      crack.position.set(x, 0.05, z);
      this.scene.add(crack);
      parts.push({ mesh: ring, mat: ringMat }, { mesh: crack, mat: crackMat });
    } else if (effectType === 'slash') {
      const ringGeo = new THREE.RingGeometry(0.3, 0.6, 32);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xffccdd, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, 0.5, z);
      this.scene.add(ring);
      const arcGeo = new THREE.PlaneGeometry(1.5, 0.2);
      const arcMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.7 });
      const arc = new THREE.Mesh(arcGeo, arcMat);
      arc.rotation.x = -Math.PI / 2;
      arc.rotation.z = Math.PI / 4;
      arc.position.set(x, 0.6, z);
      this.scene.add(arc);
      parts.push({ mesh: ring, mat: ringMat }, { mesh: arc, mat: arcMat });
    } else {
      const ringGeo = new THREE.RingGeometry(0.4, 0.6, 32);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x4488ff, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, 0.5, z);
      this.scene.add(ring);
      parts.push({ mesh: ring, mat: ringMat });
    }
    this.abilityEffects.push({ parts, startTime, duration, disposePart });
  }

  updateAbilityEffects(dt) {
    const t = this.clock.getElapsedTime();
    for (let i = this.abilityEffects.length - 1; i >= 0; i--) {
      const e = this.abilityEffects[i];
      const age = t - e.startTime;
      if (age >= e.duration) {
        if (e.parts) {
          e.parts.forEach((p) => {
            if (this.scene && p.mesh) this.scene.remove(p.mesh);
            if (p.mesh && p.mesh.geometry) p.mesh.geometry.dispose();
            if (p.mat) p.mat.dispose();
          });
        }
        this.abilityEffects.splice(i, 1);
        continue;
      }
      const prog = age / e.duration;
      const scale = 1 + prog * 2.5;
      if (e.parts) {
        e.parts.forEach((p) => {
          if (p.mesh) p.mesh.scale.setScalar(scale);
          if (p.mat && p.mat.opacity !== undefined) p.mat.opacity = Math.max(0, 0.9 * (1 - prog));
        });
      }
    }
  }

  updateHUD() {
    const me = this.room.players[this.side];
    const other = this.room.players[1 - this.side];
    if (!me || !other) return;
    $('hud-name-you').textContent = me.username || 'You';
    $('hud-name-enemy').textContent = other.username || 'Enemy';
    $('hud-hp-fill-you').style.width = (me.hp / me.maxHp * 100) + '%';
    $('hud-hp-fill-enemy').style.width = (other.hp / other.maxHp * 100) + '%';
    $('hud-ce-fill-you').style.width = (me.ce / me.maxCe * 100) + '%';
    $('hud-ce-fill-enemy').style.width = (other.ce / other.maxCe * 100) + '%';
    $('hud-kills-you').textContent = me.kills || 0;
    $('hud-spins').textContent = this.user ? this.user.spins : 0;
    const ceModeEl = $('hud-ce-mode');
    if (ceModeEl) ceModeEl.textContent = this.ceMode ? 'ON' : 'OFF';
    const ceBtn = $('hud-ce-toggle-btn');
    if (ceBtn) ceBtn.classList.toggle('active', this.ceMode);
    if (me.state === 'dead' && !this.matchOver) {
      $('game-respawn-btn').classList.add('hidden');
    } else {
      $('game-respawn-btn').classList.add('hidden');
    }
  }

  showMatchEnd(result) {
    const overlay = $('match-end-overlay');
    const box = overlay && overlay.querySelector('.match-end-box');
    const titleEl = $('match-end-title');
    const msgEl = $('match-end-message');
    if (!overlay || !titleEl || !msgEl) return;
    overlay.classList.remove('hidden');
    if (box) {
      box.classList.remove('win', 'lose');
      box.classList.add(result);
    }
    if (result === 'win') {
      titleEl.textContent = 'You Win!';
      msgEl.textContent = 'Opponent defeated. +1 Kill, +1 Spin.';
    } else {
      titleEl.textContent = 'You Lost';
      msgEl.textContent = 'Return to lobby and try again.';
    }
    const backBtn = $('match-end-back');
    if (backBtn) {
      backBtn.onclick = () => { overlay.classList.add('hidden'); this.onBack(); };
    }
  }

  animate() {
    if (!this.renderer || !this.scene) return;
    requestAnimationFrame(() => this.animate());
    const dt = this.clock.getDelta();
    this.updateAbilityEffects(dt);
    const me = this.room.players[this.side];
    for (let i = 0; i < 4; i++) {
      if (this.abilityCooldowns[i] > 0) {
        this.abilityCooldowns[i] -= dt;
        if (this.abilityCooldowns[i] < 0) this.abilityCooldowns[i] = 0;
      }
    }
    this.updateAbilityHUD();
    if (!me) { this.renderer.render(this.scene, this.camera); return; }
    if (me.state === 'dead') { this.renderer.render(this.scene, this.camera); return; }
    let dx = 0, dz = 0;
    if (!this.blocking) {
      if (this.keys['KeyW']) dz -= 1;
      if (this.keys['KeyS']) dz += 1;
      if (this.keys['KeyA']) dx -= 1;
      if (this.keys['KeyD']) dx += 1;
    }
    const speed = (this.characterData && this.characterData.speed) ? this.characterData.speed * 8 : 8;
    if (dx !== 0 || dz !== 0) {
      const len = Math.sqrt(dx * dx + dz * dz);
      dx = (dx / len) * speed * dt;
      dz = (dz / len) * speed * dt;
      me.position.x = Math.max(-11, Math.min(11, me.position.x + dx));
      me.position.z = Math.max(-8, Math.min(8, me.position.z + dz));
      this.myMesh.position.copy(me.position);
    }
    this.stateEmitAccum += dt;
    if (this.stateEmitAccum >= 0.05) {
      this.stateEmitAccum = 0;
      this.socket.emit('game:state', { position: { x: me.position.x, y: me.position.y, z: me.position.z }, rotation: { x: this.myMesh.rotation.x, y: this.myMesh.rotation.y, z: this.myMesh.rotation.z }, state: 'alive', blocking: this.blocking, animation: this.blocking ? 'block' : (dx !== 0 || dz !== 0) ? 'run' : 'idle' });
    }
    this.camera.position.lerp(new THREE.Vector3(me.position.x, me.position.y + 8, me.position.z + 12), 0.05);
    this.camera.lookAt(me.position.x, me.position.y + 2, me.position.z);
    this.renderer.render(this.scene, this.camera);
  }

  updateAbilityHUD() {
    const abs = this.characterData && this.characterData.abilities;
    document.querySelectorAll('.hud-ability').forEach((el, i) => {
      const cd = this.abilityCooldowns[i] || 0;
      const maxCd = abs && abs[i] ? abs[i].cooldown : 4;
      el.classList.toggle('on-cd', cd > 0);
      const cdEl = el.querySelector('.hud-cd');
      if (cdEl) cdEl.style.transform = cd > 0 ? `scaleY(${cd / maxCd})` : 'scaleY(0)';
    });
  }

  dispose() {
    if (this.abilityEffects) {
      this.abilityEffects.forEach((e) => {
        if (e.parts) {
          e.parts.forEach((p) => {
            if (this.scene && p.mesh) this.scene.remove(p.mesh);
            if (p.mesh && p.mesh.geometry) p.mesh.geometry.dispose();
            if (p.mat) p.mat.dispose();
          });
        }
      });
      this.abilityEffects = [];
    }
    if (this.ceRegenInterval) clearInterval(this.ceRegenInterval);
    if (this.socket) {
      this.socket.off('game:state-update');
      this.socket.off('game:room-sync');
      this.socket.off('game:hit-result');
      this.socket.off('game:respawn');
      this.socket.off('game:ce-update');
      this.socket.off('game:opponent-disconnected');
    }
    if (this.renderer && this.scene) {
      this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (Array.isArray(o.material)) o.material.forEach(m => m.dispose()); else o.material.dispose(); } });
    }
    this.scene = null;
    this.camera = null;
    this.renderer = null;
  }
}

if (token) {
  fetch(API_BASE + '/auth/me', { headers: { Authorization: 'Bearer ' + token } })
    .then((r) => r.ok ? r.json() : Promise.reject())
    .then((u) => { user = u; showScreen('lobby'); updateLobbyUI(); })
    .catch(() => { token = null; localStorage.removeItem('token'); showScreen('auth'); });
} else {
  showScreen('auth');
}
