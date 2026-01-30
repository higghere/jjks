const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./User');

const memoryUsers = new Map();
let memoryId = 0;

function isMongoConnected() {
  return mongoose.connection.readyState === 1;
}

function toSafeUser(u) {
  if (!u) return null;
  const id = u._id != null ? String(u._id) : u.id;
  return {
    id,
    _id: u._id || u.id,
    username: u.username,
    kills: u.kills ?? 0,
    spins: u.spins ?? 10,
    ownedCharacters: u.ownedCharacters || [],
    selectedCharacter: u.selectedCharacter ?? null,
    pityCounter: u.pityCounter ?? 0,
  };
}

async function findUserByUsername(username) {
  const key = (username || '').toLowerCase().trim();
  if (!key) return null;
  for (const u of memoryUsers.values()) {
    if (u.username === key) return u;
  }
  if (isMongoConnected()) {
    const u = await User.findOne({ username: key });
    return u ? u.toObject ? { ...u.toObject(), _id: u._id } : u : null;
  }
  return null;
}

async function createUser(data) {
  const username = (data.username || '').trim().toLowerCase();
  const password = data.password;
  if (!username || !password) throw new Error('Username and password required');
  const defaults = {
    kills: 0,
    spins: 10,
    ownedCharacters: [{ characterId: 'yuki', shards: 0, stars: 1 }],
    selectedCharacter: 'yuki',
    pityCounter: 0,
  };
  if (isMongoConnected()) {
    const user = new User({ username, password, ...defaults });
    await user.save();
    return { _id: user._id, username: user.username, ...defaults, password: user.password };
  }
  const existing = await findUserByUsername(username);
  if (existing) throw new Error('Username already taken');
  const id = 'mem_' + (++memoryId);
  const hashed = await bcrypt.hash(password, 10);
  const user = {
    id,
    _id: id,
    username,
    password: hashed,
    kills: defaults.kills,
    spins: defaults.spins,
    ownedCharacters: [...defaults.ownedCharacters],
    selectedCharacter: defaults.selectedCharacter,
    pityCounter: defaults.pityCounter,
  };
  memoryUsers.set(id, user);
  return user;
}

function isMemoryId(id) {
  return typeof id === 'string' && id.startsWith('mem_');
}

async function findUserById(id) {
  if (!id) return null;
  const sid = String(id);
  if (isMemoryId(sid)) {
    return memoryUsers.get(sid) || null;
  }
  if (isMongoConnected()) {
    const u = await User.findById(sid);
    return u ? u.toObject ? { ...u.toObject(), _id: u._id } : u : null;
  }
  return null;
}

async function updateUser(id, updates) {
  if (!id) return null;
  const sid = String(id);
  if (isMemoryId(sid)) {
    const u = memoryUsers.get(sid);
    if (!u) return null;
    if (updates.kills != null) u.kills = updates.kills;
    if (updates.spins != null) u.spins = updates.spins;
    if (updates.ownedCharacters != null) u.ownedCharacters = updates.ownedCharacters;
    if (updates.selectedCharacter != null) u.selectedCharacter = updates.selectedCharacter;
    if (updates.pityCounter != null) u.pityCounter = updates.pityCounter;
    return u;
  }
  if (isMongoConnected()) {
    const u = await User.findByIdAndUpdate(
      sid,
      { $set: updates },
      { new: true }
    );
    return u ? u.toObject ? { ...u.toObject(), _id: u._id } : u : null;
  }
  return null;
}

async function comparePassword(user, candidate) {
  if (!user || !user.password) return false;
  return bcrypt.compare(candidate, user.password);
}

module.exports = {
  isMongoConnected,
  toSafeUser,
  findUserByUsername,
  createUser,
  findUserById,
  updateUser,
  comparePassword,
};
