const { ipcMain } = require('electron');
const { encrypt, decrypt } = require('../utils/crypto.cjs');
const fs = require('fs');
const path = require('path');
const os = require('os');

/* Local storage path for encrypted keys */
const KEYSTORE_PATH = path.join(os.homedir(), '.lumen-browser', 'wallets.json');

function ensureKeystore() {
  const dir = path.dirname(KEYSTORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(KEYSTORE_PATH)) fs.writeFileSync(KEYSTORE_PATH, JSON.stringify([]));
}

function loadWallets() {
  ensureKeystore();
  try {
    return JSON.parse(fs.readFileSync(KEYSTORE_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function saveWallet(walletData) {
  const wallets = loadWallets();
  wallets.push(walletData);
  fs.writeFileSync(KEYSTORE_PATH, JSON.stringify(wallets, null, 2));
}

/**
 * Register IPC handlers for wallet operations
 * 
 * @returns {void}
 */
function registerWalletIpc() {

  ipcMain.handle('wallet:create', async (_, password) => {
    try {
      const { utils, pqc } = await import('@lumen-chain/sdk');

      /* Create Standard Wallet (Mnemonic) */
      /* Strength 256 = 24 words */
      const walletData = await utils.createWallet(256);
      console.log('utils.createWallet result:', Object.keys(walletData));
      const { mnemonic, address } = walletData;

      /* Generate Quantum Identity (Dilithium3) */
      console.log('Generating PQC Keypair...');
      let pqcKeys = await pqc.createKeyPair('dilithium3');
      // Fallback if it wasn't a promise but the previous await did nothing
      console.log('pqcKeys raw:', pqcKeys);
      
      const { publicKey, privateKey } = pqcKeys;

      /* Encrypt Everything */
      const mnemonicStr = mnemonic;
      const pqcPrivHex = Buffer.from(privateKey).toString('hex');

      const encryptedMnemonic = encrypt(mnemonicStr, password);
      const encryptedPqcPriv = encrypt(pqcPrivHex, password); // Encrypt the HEX string

      /* Save to Local Store */
      const walletId = `wallet_${Date.now()}`;
      const newWallet = {
        id: walletId,
        address,
        name: `Wallet ${address.slice(-4)}`,
        data: encryptedMnemonic,
        pqc: {
           publicKey: Buffer.from(publicKey).toString('hex'),
           encryptedPrivateKey: encryptedPqcPriv
        },
        linked: false // Needs MsgLinkAccountPQC later
      };

      saveWallet(newWallet);
      
      /* Return unencrypted data ONCE for user backup */
      const backupJson = {
          type: "lumen/dual-signer",
          version: 1,
          mnemonic: mnemonicStr,
          address: address,
          pqc: {
              scheme: "dilithium3",
              publicKey: Buffer.from(publicKey).toString('base64'),
              privateKey: Buffer.from(privateKey).toString('base64')
          }
      };

      return { 
        ok: true, 
        wallet: { 
            ...newWallet, 
            mnemonic, 
            pqcPrivateKey: pqcPrivHex,
            keysBackup: JSON.stringify(backupJson, null, 2)
        } 
      };

    } catch (err) {
      console.error('Wallet Create Error:', err);
      return { ok: false, error: err.message };
    }
  });

  /* IMPORT WALLET */
  ipcMain.handle('wallet:import', async (_, { mnemonic, password, pqcKey, pqcBackup }) => {
    try {
        console.log('[wallet:import] Starting import...');
        const { utils, pqc } = await import('@lumen-chain/sdk');

        /* Verify Mnemonic */
        console.log('[wallet:import] Verifying mnemonic...');
        const address = await utils.addressFromMnemonic(mnemonic, 'lumen');
        console.log('[wallet:import] Address:', address);
        
        /* Encrypt */
        const encryptedMnemonic = encrypt(mnemonic, password);

        let pqcPrivHex;
        let pqcPubHex;

        // Check if user provided full SDK backup JSON or node keys.json
        if (pqcBackup) {
            console.log('[wallet:import] Restoring from backup format...');
            try {
                const backup = typeof pqcBackup === 'string' ? JSON.parse(pqcBackup) : pqcBackup;
                
                let publicKeyB64, privateKeyB64;
                
                // Detect format: SDK dual-signer or node keys.json
                if (backup.pqc && backup.pqc.publicKey && backup.pqc.privateKey) {
                    // SDK dual-signer format
                    console.log('[wallet:import] Detected SDK dual-signer format');
                    publicKeyB64 = backup.pqc.publicKey;
                    privateKeyB64 = backup.pqc.privateKey;
                } else if (backup.public_key && backup.private_key) {
                    // Lumen node keys.json format (single key object)
                    console.log('[wallet:import] Detected Lumen node keys.json format');
                    publicKeyB64 = backup.public_key;
                    privateKeyB64 = backup.private_key;
                } else {
                    // Check if it's a keys.json with named keys
                    const keyNames = Object.keys(backup);
                    if (keyNames.length > 0 && backup[keyNames[0]].public_key && backup[keyNames[0]].private_key) {
                        console.log('[wallet:import] Detected Lumen node keys.json format (named key)');
                        const firstKey = backup[keyNames[0]];
                        publicKeyB64 = firstKey.public_key;
                        privateKeyB64 = firstKey.private_key;
                    } else {
                        return { ok: false, error: 'Invalid backup format - missing PQC keys' };
                    }
                }
                
                // Decode Base64 keys from backup
                const privKeyBytes = Buffer.from(privateKeyB64, 'base64');
                const pubKeyBytes = Buffer.from(publicKeyB64, 'base64');
                
                console.log('[wallet:import] Private key bytes:', privKeyBytes.length);
                console.log('[wallet:import] Public key bytes:', pubKeyBytes.length);
                
                // Validate key sizes (Dilithium3)
                if (privKeyBytes.length !== 4000) {
                    return { ok: false, error: `Invalid private key size: ${privKeyBytes.length} (expected 4000)` };
                }
                if (pubKeyBytes.length !== 1952) {
                    return { ok: false, error: `Invalid public key size: ${pubKeyBytes.length} (expected 1952)` };
                }
                
                // Store as hex
                pqcPrivHex = privKeyBytes.toString('hex');
                pqcPubHex = pubKeyBytes.toString('hex');
                console.log('[wallet:import] PQC keys restored from SDK backup');
                
            } catch (e) {
                console.error('[wallet:import] Failed to parse SDK backup:', e);
                return { ok: false, error: 'Invalid SDK backup format' };
            }
        } else if (pqcKey) {
             /* Legacy: User provided only private key */
             console.log('[wallet:import] Restoring PQC Key (legacy format)...');
             
             // Detect format and convert to bytes first
             let privKeyBytes;
             const trimmedKey = pqcKey.trim();
             
             // Check if it's Base64 or Hex
             if (/[+\/=]/.test(trimmedKey) || !/^[0-9a-fA-F]+$/.test(trimmedKey)) {
                 console.log('[wallet:import] Detected Base64 format');
                 try {
                     privKeyBytes = Buffer.from(trimmedKey, 'base64');
                 } catch (e) {
                     console.error('[wallet:import] Failed to decode Base64:', e);
                     return { ok: false, error: 'Invalid PQC key format' };
                 }
             } else {
                 console.log('[wallet:import] Detected Hex format');
                 privKeyBytes = Buffer.from(trimmedKey, 'hex');
             }
             
             console.log('[wallet:import] Private key bytes length:', privKeyBytes.length);
             
             // Store as hex
             pqcPrivHex = privKeyBytes.toString('hex');
             
             // Cannot extract public key from private key in Dilithium
             console.warn('[wallet:import] Public key not provided - will need to be linked separately');
             pqcPubHex = 'UNKNOWN_MUST_RESYNC';
        } else {
             /* Generate NEW PQC key for imported wallet */
             console.log('[wallet:import] Generating new PQC key...');
             const keypair = await pqc.createKeyPair('dilithium3');
             pqcPrivHex = Buffer.from(keypair.privateKey).toString('hex');
             pqcPubHex = Buffer.from(keypair.publicKey).toString('hex');
             console.log('[wallet:import] PQC key generated');
        }

        const encryptedPqcPriv = encrypt(pqcPrivHex, password);

        const walletId = `wallet_${Date.now()}`;
        const newWallet = {
            id: walletId,
            address,
            name: `Imported ${address.slice(-4)}`,
            data: encryptedMnemonic,
            pqc: {
               publicKey: pqcPubHex,
               encryptedPrivateKey: encryptedPqcPriv
            },
           linked: false
        };

        console.log('[wallet:import] Saving wallet...');
        saveWallet(newWallet);
        console.log('[wallet:import] Import successful!');

        return { ok: true, wallet: newWallet };
    } catch (err) {
        console.error('[wallet:import] Error:', err);
        return { ok: false, error: err.message };
    }
  });

  /* EXPORT PQC KEYS */
  ipcMain.handle('wallet:exportPqc', async (_, { id, password }) => {
    try {
        console.log('[wallet:export] requesting export for:', id);
        
        // Find wallet
        const wallets = loadWallets();
        const wallet = wallets.find(w => w.id === id);
        
        if (!wallet) return { ok: false, error: 'Wallet not found' };
        
        // Decrypt Mnemonic
        const mnemonic = decrypt(wallet.data, password);
        if (!mnemonic) return { ok: false, error: 'Incorrect password' };
        
        // Decrypt PQC Private Key
        let pqcPrivHex = decrypt(wallet.pqc.encryptedPrivateKey, password);
        if (!pqcPrivHex) return { ok: false, error: 'Failed to decrypt PQC key' };
        
        // Get Public Key (handle extraction if needed)
        let pqcPubHex = wallet.pqc.publicKey;
        
        // If public key is not stored or unknown, try to extract/generate
        if (!pqcPubHex || pqcPubHex === 'UNKNOWN_MUST_RESYNC') {
             // Convert private key hex to bytes
             const privBytes = Buffer.from(pqcPrivHex, 'hex');
             if (privBytes.length === 4000) {
                 // Extract from Dilithium3 private key (first 1952 bytes)
                 pqcPubHex = privBytes.slice(0, 1952).toString('hex');
             } else {
                 console.warn('[wallet:export] Could not recover public key from private key');
             }
        }
        
        // Construct Backup JSON with fallback for public key
        const backupJson = {
          type: "lumen/dual-signer",
          version: 1,
          mnemonic: mnemonic,
          address: wallet.address,
          pqc: {
              scheme: "dilithium3",
              publicKey: pqcPubHex ? Buffer.from(pqcPubHex, 'hex').toString('base64') : "",
              privateKey: Buffer.from(pqcPrivHex, 'hex').toString('base64')
          }
        };
        
        return { 
            ok: true, 
            backupSync: JSON.stringify(backupJson, null, 2) 
        };

    } catch (err) {
        console.error('[wallet:export] error:', err);
        return { ok: false, error: err.message };
    }
  });

  /* REVEAL MNEMONIC */
  ipcMain.handle('wallet:reveal', async (_, { id, password }) => {
      const wallets = loadWallets();
      const wallet = wallets.find(w => w.id === id);
      if (!wallet) return { ok: false, error: 'Wallet not found' };

      try {
          const mnemonic = decrypt(wallet.data, password);
          // Verify decryption by checking if it looks like words (basic check)
          if (!mnemonic || !mnemonic.includes(' ')) throw new Error('Decryption failed');

          const pqcPrivateKey = decrypt(wallet.pqc.encryptedPrivateKey, password);

          return { 
              ok: true, 
              data: {
                  mnemonic,
                  pqcPrivateKey // Already hex string
              } 
          };
      } catch (err) {
          console.error(err);
          return { ok: false, error: 'Invalid Password' };
      }
  });

  /* LIST WALLETS */
  ipcMain.handle('wallet:list', () => {
      const wallets = loadWallets();
      /* Return safe data only */
      return wallets.map(w => ({ id: w.id, address: w.address, name: w.name, linked: w.linked }));
  });

  /* RENAME WALLET */
  ipcMain.handle('wallet:rename', (_, { id, newName }) => {
      try {
          const wallets = loadWallets();
          const wallet = wallets.find(w => w.id === id);
          if (!wallet) return { ok: false, error: 'Wallet not found' };

          wallet.name = newName;
          fs.writeFileSync(KEYSTORE_PATH, JSON.stringify(wallets, null, 2));
          
          return { ok: true };
      } catch (err) {
          return { ok: false, error: err.message };
      }
  });

  /* DELETE WALLET */
  ipcMain.handle('wallet:delete', (_, { id }) => {
      try {
          const wallets = loadWallets();
          const filtered = wallets.filter(w => w.id !== id);
          fs.writeFileSync(KEYSTORE_PATH, JSON.stringify(filtered, null, 2));
          
          return { ok: true };
      } catch (err) {
          return { ok: false, error: err.message };
      }
  });
}

module.exports = { registerWalletIpc };
