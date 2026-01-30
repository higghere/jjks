const jwt = require('jsonwebtoken');
const userStore = require('../models/userStore');
const fs = require('fs');
const path = require('path');
const { JWT_SECRET } = require('../routes/auth');

let characters = [];
try {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/characters.json'), 'utf8'));
  characters = data.characters;
} catch (e) {
  console.error('Failed to load characters', e);
}

const RARITIES = ['Common', 'Rare', 'SR', 'SSR', 'UR'];
const WEIGHTS = [60, 25, 10, 4, 1];
const PITY_THRESHOLD = 50;

function getCharacterById(id) {
  return characters.find((c) => c.id === id) || characters[0];
}

const matchmakingQueue = [];
const rooms = new Map();

function createRoom(player1, player2) {
  const roomId = `room_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const room = {
    id: roomId,
    players: [
      { socketId: player1.socketId, userId: player1.userId, username: player1.username, characterId: player1.characterId, hp: 0, maxHp: 0, ce: 0, maxCe: 0, kills: 0, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, state: 'alive', lastHitBy: null, stunUntil: 0 },
      { socketId: player2.socketId, userId: player2.userId, username: player2.username, characterId: player2.characterId, hp: 0, maxHp: 0, ce: 0, maxCe: 0, kills: 0, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, state: 'alive', lastHitBy: null, stunUntil: 0 },
    ],
    startedAt: Date.now(),
  };
  const char1 = getCharacterById(player1.characterId);
  const char2 = getCharacterById(player2.characterId);
  room.players[0].hp = char1.hp;
  room.players[0].maxHp = char1.hp;
  room.players[0].ce = char1.ceMax;
  room.players[0].maxCe = char1.ceMax;
  room.players[0].position = { x: -5, y: 0, z: 0 };
  room.players[1].hp = char2.hp;
  room.players[1].maxHp = char2.hp;
  room.players[1].ce = char2.ceMax;
  room.players[1].maxCe = char2.ceMax;
  room.players[1].position = { x: 5, y: 0, z: 0 };
  rooms.set(roomId, room);
  return room;
}

function findRoomBySocket(socketId) {
  for (const [id, room] of rooms) {
    if (room.players.some((p) => p.socketId === socketId)) return { roomId: id, room };
  }
  return null;
}

function applyDamage(room, targetSocketId, damage, attackerSocketId, isCe) {
  const target = room.players.find((p) => p.socketId === targetSocketId);
  const attacker = room.players.find((p) => p.socketId === attackerSocketId);
  if (!target || target.state !== 'alive') return;
  let dmg = Math.max(0, Math.floor(damage * (1 - (target.blocking ? 0.5 : 0))));
  target.hp = Math.max(0, target.hp - dmg);
  target.lastHitBy = attackerSocketId;
  if (target.hp <= 0) {
    target.state = 'dead';
    if (attacker) attacker.kills++;
    return attacker;
  }
  return null;
}

async function awardKill(userId) {
  try {
    const user = await userStore.findUserById(userId);
    if (user) {
      await userStore.updateUser(userId, {
        kills: (user.kills || 0) + 1,
        spins: (user.spins || 0) + 1,
      });
    }
  } catch (e) {}
}

function validateHit(room, fromSocketId, toSocketId, abilityIndex, ceUsed, serverTime) {
  const from = room.players.find((p) => p.socketId === fromSocketId);
  const to = room.players.find((p) => p.socketId === toSocketId);
  if (!from || !to || from.state !== 'alive' || to.state !== 'alive') return null;
  const char = getCharacterById(from.characterId);
  const ability = char.abilities[abilityIndex];
  if (!ability) return null;
  const ceCost = ceUsed ? ability.ceCost : 0;
  if (from.ce < ceCost) return null;
  from.ce = Math.max(0, from.ce - ceCost);
  const damage = ceUsed ? ability.ceModDamage : ability.damage;
  applyDamage(room, toSocketId, damage, fromSocketId, true);
  return { damage: ceUsed ? ability.ceModDamage : ability.damage, targetHp: to.hp };
}

function validateM1(room, fromSocketId, toSocketId, ceUsed) {
  const from = room.players.find((p) => p.socketId === fromSocketId);
  const to = room.players.find((p) => p.socketId === toSocketId);
  if (!from || !to || from.state !== 'alive' || to.state !== 'alive') return null;
  const char = getCharacterById(from.characterId);
  const damage = ceUsed ? char.m1CeMod : char.m1Damage;
  const cost = ceUsed ? 5 : 0;
  if (from.ce < cost) return null;
  from.ce = Math.max(0, from.ce - cost);
  applyDamage(room, toSocketId, damage, fromSocketId, false);
  return { damage, targetHp: to.hp };
}

module.exports = function (io) {
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
    if (!token) return next(new Error('No token'));
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await userStore.findUserById(decoded.id);
      if (!user) return next(new Error('User not found'));
      socket.userId = String(user._id || user.id);
      socket.username = user.username;
      socket.characterId = user.selectedCharacter || (user.ownedCharacters && user.ownedCharacters[0] && user.ownedCharacters[0].characterId) || 'yuki';
      next();
    } catch (e) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('matchmaking:join', () => {
      if (matchmakingQueue.some((p) => p.socketId === socket.id)) return;
      matchmakingQueue.push({
        socketId: socket.id,
        userId: socket.userId,
        username: socket.username,
        characterId: socket.characterId,
      });
      if (matchmakingQueue.length >= 2) {
        const p1 = matchmakingQueue.shift();
        const p2 = matchmakingQueue.shift();
        const room = createRoom(p1, p2);
        const ioServer = io;
        ioServer.to(p1.socketId).emit('matchmaking:matched', { roomId: room.id, side: 0, room });
        ioServer.to(p2.socketId).emit('matchmaking:matched', { roomId: room.id, side: 1, room });
      }
    });

    socket.on('matchmaking:leave', () => {
      const idx = matchmakingQueue.findIndex((p) => p.socketId === socket.id);
      if (idx !== -1) matchmakingQueue.splice(idx, 1);
    });

    socket.on('game:join-room', (roomId) => {
      socket.join(roomId);
    });

    socket.on('game:state', (data) => {
      const found = findRoomBySocket(socket.id);
      if (!found) return;
      const { room } = found;
      const player = room.players.find((p) => p.socketId === socket.id);
      if (!player) return;
      player.position = data.position || player.position;
      player.rotation = data.rotation || player.rotation;
      player.state = data.state || player.state;
      player.blocking = data.blocking || false;
      player.animation = data.animation;
      socket.to(found.roomId).emit('game:state-update', { socketId: socket.id, ...data });
    });

    socket.on('game:hit', async (data) => {
      const found = findRoomBySocket(socket.id);
      if (!found) return;
      const { roomId, room } = found;
      const result = data.abilityIndex !== undefined
        ? validateHit(room, socket.id, data.targetSocketId, data.abilityIndex, data.ceUsed || false, Date.now())
        : validateM1(room, socket.id, data.targetSocketId, data.ceUsed || false);
      if (result) {
        const target = room.players.find((p) => p.socketId === data.targetSocketId);
        if (target && target.state === 'dead') {
          const attacker = room.players.find((p) => p.socketId === socket.id);
          if (attacker) await awardKill(attacker.userId);
        }
        io.to(roomId).emit('game:hit-result', {
          fromSocketId: socket.id,
          targetSocketId: data.targetSocketId,
          ...result,
          abilityIndex: data.abilityIndex,
        });
      }
    });

    socket.on('game:respawn', () => {
      const found = findRoomBySocket(socket.id);
      if (!found) return;
      const { room } = found;
      const player = room.players.find((p) => p.socketId === socket.id);
      if (!player || player.state !== 'dead') return;
      const char = getCharacterById(player.characterId);
      player.hp = char.hp;
      player.maxHp = char.hp;
      player.ce = char.ceMax;
      player.maxCe = char.ceMax;
      player.state = 'alive';
      player.position = { x: player === room.players[0] ? -5 : 5, y: 0, z: 0 };
      io.to(found.roomId).emit('game:respawn', { socketId: socket.id, hp: player.hp, ce: player.ce, position: player.position });
    });

    socket.on('game:ce-regen', (data) => {
      const found = findRoomBySocket(socket.id);
      if (!found) return;
      const { room } = found;
      const player = room.players.find((p) => p.socketId === socket.id);
      if (!player || player.state !== 'alive') return;
      const char = getCharacterById(player.characterId);
      player.ce = Math.min(player.ce + (char.ceRegen || 1), player.maxCe);
      socket.emit('game:ce-update', { ce: player.ce });
    });

    socket.on('disconnect', async () => {
      const idx = matchmakingQueue.findIndex((p) => p.socketId === socket.id);
      if (idx !== -1) matchmakingQueue.splice(idx, 1);
      const found = findRoomBySocket(socket.id);
      if (found) {
        const { roomId, room } = found;
        const opponent = room.players.find((p) => p.socketId !== socket.id);
        if (opponent) {
          try {
            const user = await userStore.findUserById(opponent.userId);
            if (user) {
              await userStore.updateUser(opponent.userId, {
                kills: (user.kills || 0) + 1,
                spins: (user.spins || 0) + 1,
              });
            }
          } catch (e) {}
          io.to(opponent.socketId).emit('game:opponent-disconnected');
        }
        rooms.delete(roomId);
      }
    });
  });

  setInterval(() => {
    for (const [roomId, room] of rooms) {
      io.to(roomId).emit('game:room-sync', {
        players: room.players.map((p) => ({
          socketId: p.socketId,
          hp: p.hp,
          maxHp: p.maxHp,
          ce: p.ce,
          maxCe: p.maxCe,
          kills: p.kills,
          position: p.position,
          rotation: p.rotation,
          state: p.state,
          blocking: p.blocking,
          animation: p.animation,
        })),
      });
    }
  }, 100);
};
