const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 20,
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
  },
  kills: {
    type: Number,
    default: 0,
  },
  spins: {
    type: Number,
    default: 10,
  },
  ownedCharacters: [{
    characterId: String,
    shards: { type: Number, default: 0 },
    stars: { type: Number, default: 1 },
  }],
  selectedCharacter: {
    type: String,
    default: null,
  },
  pityCounter: {
    type: Number,
    default: 0,
  },
}, { timestamps: true });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
