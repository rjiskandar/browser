const crypto = require('crypto');

// Standard algorithm for local storage encryption
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const KEY_Length = 32;
const ITERATIONS = 100000;

function encrypt(text, masterKey) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const salt = crypto.randomBytes(SALT_LENGTH);
  
  // Derive key from masterKey + salt
  const key = crypto.pbkdf2Sync(masterKey, salt, ITERATIONS, KEY_Length, 'sha512');
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([salt, iv, tag, encrypted]).toString('base64');
}

function decrypt(ciphertext, masterKey) {
  const buffer = Buffer.from(ciphertext, 'base64');
  
  const salt = buffer.subarray(0, SALT_LENGTH);
  const iv = buffer.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const tag = buffer.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  const text = buffer.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

  const key = crypto.pbkdf2Sync(masterKey, salt, ITERATIONS, KEY_Length, 'sha512');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return decipher.update(text) + decipher.final('utf8');
}

// Simple hash for password verification
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

module.exports = {
  encrypt,
  decrypt,
  hashPassword
};
