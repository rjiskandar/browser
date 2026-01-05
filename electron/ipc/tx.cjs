const { ipcMain } = require('electron');
const { decrypt } = require('../utils/crypto.cjs');
const { httpGet } = require('./http.cjs');
const fs = require('fs');
const path = require('path');
const os = require('os');

const KEYSTORE_PATH = path.join(os.homedir(), '.lumen-browser', 'wallets.json');

function loadWallets() {
  try {
    return JSON.parse(fs.readFileSync(KEYSTORE_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function getRpcBaseUrl() {
  // Reuse logic from chain.cjs
  const { app } = require('electron');
  const appPath = app && typeof app.getAppPath === 'function' ? app.getAppPath() : process.cwd();
  
  const possiblePaths = [
    path.join(appPath, 'resources', 'peers.txt'),
    path.join(process.cwd(), 'resources', 'peers.txt'),
    path.join(__dirname, '..', '..', 'resources', 'peers.txt')
  ];

  for (const file of possiblePaths) {
    try {
      if (fs.existsSync(file)) {
        const raw = fs.readFileSync(file, 'utf8');
        const lines = raw.split(/\r?\n/);
        for (const line of lines) {
          const cleaned = line.replace(/#.*/, '').trim();
          if (cleaned) {
            const rpc = cleaned.split(/[\s,]+/)[0];
            if (rpc) {
              return /^https?:\/\//i.test(rpc) ? rpc : `http://${rpc}`;
            }
          }
        }
      }
    } catch {}
  }
  return null;
}

/**
 * Register IPC handlers for transaction operations
 */
function registerTxIpc() {
  
  ipcMain.handle('tx:send', async (_, { walletId, toAddress, amount, memo, password }) => {
    try {
      console.log('[tx:send] Starting send transaction...');
      console.log('[tx:send] To:', toAddress, 'Amount:', amount);

      // Load wallet
      const wallets = loadWallets();
      const wallet = wallets.find(w => w.id === walletId);
      if (!wallet) {
        return { ok: false, error: 'Wallet not found' };
      }

      // Decrypt mnemonic and PQC key
      console.log('[tx:send] Decrypting keys...');
      const mnemonic = decrypt(wallet.data, password);
      if (!mnemonic || !mnemonic.includes(' ')) {
        return { ok: false, error: 'Invalid password' };
      }

      const pqcPrivateKeyHex = decrypt(wallet.pqc.encryptedPrivateKey, password);
      if (!pqcPrivateKeyHex) {
        return { ok: false, error: 'Failed to decrypt PQC key' };
      }

      // Import Lumen SDK
      console.log('[tx:send] Importing Lumen SDK and CosmJS...');
      const { utils, pqc } = await import('@lumen-chain/sdk');
      const { DirectSecp256k1HdWallet } = await import('@cosmjs/proto-signing');

      // Verify mnemonic and get address
      console.log('[tx:send] Deriving address from mnemonic...');
      const derivedAddress = await utils.addressFromMnemonic(mnemonic, 'lumen');

      if (derivedAddress !== wallet.address) {
        console.error('[tx:send] Address mismatch!', { derived: derivedAddress, expected: wallet.address });
        return { ok: false, error: 'Address mismatch - wallet corrupted?' };
      }

      // Create signer from mnemonic
      console.log('[tx:send] Creating signer from mnemonic...');
      const signer = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix: 'lmn' });
      const accounts = await signer.getAccounts();

      // Get RPC endpoint
      const rpcBase = getRpcBaseUrl();
      if (!rpcBase) {
        return { ok: false, error: 'RPC endpoint not configured' };
      }
      const restBase = rpcBase.replace(':26657', ':1317');

      // Convert amount to ulmn
      const amountUlmn = Math.floor(parseFloat(amount) * 1000000).toString();

      // Get account info
      console.log('[tx:send] Fetching account info...');
      const accountUrl = `${restBase}/cosmos/auth/v1beta1/accounts/${wallet.address}`;
      const accountRes = await httpGet(accountUrl, { timeout: 7000 });
      
      let accountData = accountRes && accountRes.json ? accountRes.json : null;
      if (!accountData && accountRes && typeof accountRes.text === 'string') {
        try {
          accountData = JSON.parse(accountRes.text);
        } catch {}
      }

      if (!accountData || !accountData.account) {
        return { ok: false, error: 'Failed to fetch account info' };
      }

      const account = accountData.account;
      const sequence = account.sequence || '0';
      const accountNumber = account.account_number || '0';

      console.log('[tx:send] Account:', accountNumber, 'Sequence:', sequence);

      // Import protobuf types
      const { MsgSend } = await import('cosmjs-types/cosmos/bank/v1beta1/tx.js');
      const { TxRaw, SignDoc, TxBody, AuthInfo, Fee } = await import('cosmjs-types/cosmos/tx/v1beta1/tx.js');
      const { SignMode } = await import('cosmjs-types/cosmos/tx/signing/v1beta1/signing.js');
      const { PubKey } = await import('cosmjs-types/cosmos/crypto/secp256k1/keys.js');
      const { Any } = await import('cosmjs-types/google/protobuf/any.js');

      // Encode MsgSend
      const msgSendEncoded = MsgSend.encode({
        fromAddress: wallet.address,
        toAddress: toAddress,
        amount: [{ denom: 'ulmn', amount: amountUlmn }]
      }).finish();

      const msgAny = Any.fromPartial({
        typeUrl: '/cosmos.bank.v1beta1.MsgSend',
        value: msgSendEncoded
      });

      // Create TxBody
      const txBody = TxBody.fromPartial({
        messages: [msgAny],
        memo: memo || '',
        extensionOptions: [],
        nonCriticalExtensionOptions: []
      });

      const txBodyBytes = TxBody.encode(txBody).finish();

      // Get public key
      const pubkey = accounts[0].pubkey;
      const pubkeyAny = Any.fromPartial({
        typeUrl: '/cosmos.crypto.secp256k1.PubKey',
        value: PubKey.encode({ key: pubkey }).finish()
      });

      // Create AuthInfo
      const authInfo = AuthInfo.fromPartial({
        signerInfos: [{
          publicKey: pubkeyAny,
          modeInfo: {
            single: { mode: SignMode.SIGN_MODE_DIRECT }
          },
          sequence: BigInt(sequence)
        }],
        fee: Fee.fromPartial({
          amount: [],  // Empty for gasless transactions
          gasLimit: BigInt(200000)
        })
      });

      console.log('[tx:send] AuthInfo created with gasless fee (amount: [], gas: 200000)');

      const authInfoBytes = AuthInfo.encode(authInfo).finish();

      // Create SignDoc for standard signature
      const signDoc = SignDoc.fromPartial({
        bodyBytes: txBodyBytes,
        authInfoBytes: authInfoBytes,
        chainId: 'lumen',
        accountNumber: BigInt(accountNumber)
      });

      // Sign with standard key
      console.log('[tx:send] Signing with standard key...');
      const { signature } = await signer.signDirect(wallet.address, signDoc);

      // Now add PQC signature
      console.log('[tx:send] Adding PQC signature...');
      console.log('[tx:send] Wallet PQC data:', JSON.stringify({
        hasPublicKey: !!wallet.pqc.publicKey,
        publicKeyLength: wallet.pqc.publicKey?.length || 0,
        publicKeyType: typeof wallet.pqc.publicKey,
        hasEncryptedPrivateKey: !!wallet.pqc.encryptedPrivateKey,
        pqcKeys: Object.keys(wallet.pqc)
      }));
      
      // Decode PQC private key - auto-detect Hex vs Base64
      console.log('[tx:send] PQC private key string length:', pqcPrivateKeyHex.length);
      let pqcPrivateKey;
      
      // Check if it's valid hex first (all chars are 0-9a-fA-F)
      const isHex = /^[0-9a-fA-F]+$/.test(pqcPrivateKeyHex);
      
      try {
        if (isHex) {
          // It's hex
          pqcPrivateKey = new Uint8Array(Buffer.from(pqcPrivateKeyHex, 'hex'));
          console.log('[tx:send] Decoded as Hex');
        } else {
          // Try Base64
          pqcPrivateKey = new Uint8Array(Buffer.from(pqcPrivateKeyHex, 'base64'));
          console.log('[tx:send] Decoded as Base64');
        }
      } catch (err) {
        console.error('[tx:send] Failed to decode PQC private key:', err);
        return { ok: false, error: 'Failed to decode PQC private key' };
      }
      
      console.log('[tx:send] PQC private key bytes length:', pqcPrivateKey.length);
      
      // Get PQC public key from wallet (also auto-detect)
      let pqcPublicKey;
      
      // Check if public key is valid
      if (!wallet.pqc.publicKey || wallet.pqc.publicKey === 'UNKNOWN_MUST_RESYNC' || wallet.pqc.publicKey.length < 1900) {
        console.log('[tx:send] Public key invalid or missing, extracting from private key...');
        // For Dilithium3, public key is embedded in first 1952 bytes of private key
        if (pqcPrivateKey.length === 4000) {
          pqcPublicKey = pqcPrivateKey.slice(0, 1952);
          console.log('[tx:send] Extracted public key from private key');
        } else {
          console.error('[tx:send] Cannot extract public key - invalid private key length');
          return { ok: false, error: 'Invalid PQC private key length' };
        }
      } else {
        // Decode existing public key - detect format by pattern, not length
        try {
          const pubKeyStr = wallet.pqc.publicKey;
          const isHex = /^[0-9a-fA-F]+$/.test(pubKeyStr);
          
          if (isHex) {
            // Hex format
            pqcPublicKey = new Uint8Array(Buffer.from(pubKeyStr, 'hex'));
            console.log('[tx:send] Decoded public key as Hex');
          } else {
            // Base64 format
            pqcPublicKey = new Uint8Array(Buffer.from(pubKeyStr, 'base64'));
            console.log('[tx:send] Decoded public key as Base64');
          }
        } catch (err) {
          console.error('[tx:send] Failed to decode PQC public key:', err);
          return { ok: false, error: 'Failed to decode PQC public key' };
        }
      }
      
      console.log('[tx:send] PQC public key bytes length:', pqcPublicKey.length);

      // Validate key lengths (warn if not standard Dilithium3 sizes)
      if (pqcPrivateKey.length !== 4000) {
        console.warn('[tx:send] Non-standard PQC private key length:', pqcPrivateKey.length, '(expected 4000 for Dilithium3)');
      }
      if (pqcPublicKey.length !== 1952) {
        console.warn('[tx:send] Non-standard PQC public key length:', pqcPublicKey.length, '(expected 1952 for Dilithium3)');
      }

      // Create sign bytes for PQC (with prefix)
      const signDocBytes = SignDoc.encode(signDoc).finish();
      const pqcPrefix = new TextEncoder().encode('PQCv1:');
      const pqcSignBytes = new Uint8Array(pqcPrefix.length + signDocBytes.length);
      pqcSignBytes.set(pqcPrefix, 0);
      pqcSignBytes.set(signDocBytes, pqcPrefix.length);

      // Sign with PQC key using SDK's pqc module
      console.log('[tx:send] Signing with PQC key...');
      const pqcSignature = await pqc.signDilithium(pqcSignBytes, pqcPrivateKey);
      console.log('[tx:send] PQC signature length:', pqcSignature.length);

      // Create PQC signature entry
      const pqcEntry = {
        addr: wallet.address,
        scheme: 'dilithium3',
        signature: pqcSignature,
        pubKey: pqcPublicKey
      };

      // Use SDK's withPqcExtension to add PQC signature to TxBody
      console.log('[tx:send] Adding PQC extension to transaction...');
      const { pqc: pqcModule } = await import('@lumen-chain/sdk');
      
      // withPqcExtension expects bodyBytes and entries array
      const finalTxBodyBytes = pqcModule.withPqcExtension(txBodyBytes, [pqcEntry]);
      console.log('[tx:send] PQC extension added');

      // IMPORTANT: Re-sign with standard key using the FINAL body (with PQC extension)
      console.log('[tx:send] Re-signing with standard key using final body...');
      const finalSignDoc = SignDoc.fromPartial({
        bodyBytes: finalTxBodyBytes,
        authInfoBytes: authInfoBytes,
        chainId: 'lumen',
        accountNumber: BigInt(accountNumber)
      });

      const { signature: finalSignature } = await signer.signDirect(wallet.address, finalSignDoc);
      console.log('[tx:send] Final signature created');

      // Create final TxRaw with both signatures
      const txRaw = TxRaw.fromPartial({
        bodyBytes: finalTxBodyBytes,
        authInfoBytes: authInfoBytes,
        signatures: [Buffer.from(finalSignature.signature, 'base64')]
      });

      const txBytes = TxRaw.encode(txRaw).finish();
      console.log('[tx:send] Transaction bytes length:', txBytes.length);

      // Broadcast transaction
      console.log('[tx:send] Broadcasting transaction...');
      const broadcastUrl = `${restBase}/cosmos/tx/v1beta1/txs`;
      const txBytesBase64 = Buffer.from(txBytes).toString('base64');
      console.log('[tx:send] tx_bytes Base64 length:', txBytesBase64.length);
      console.log('[tx:send] Broadcast URL:', broadcastUrl);
      
      const requestBody = {
        tx_bytes: txBytesBase64,
        mode: 'BROADCAST_MODE_SYNC'
      };
      console.log('[tx:send] Request body:', JSON.stringify(requestBody).substring(0, 200) + '...');
      
      const broadcastRes = await httpGet(broadcastUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        timeout: 10000
      });

      let broadcastData = broadcastRes && broadcastRes.json ? broadcastRes.json : null;
      if (!broadcastData && broadcastRes && typeof broadcastRes.text === 'string') {
        try {
          broadcastData = JSON.parse(broadcastRes.text);
        } catch {}
      }

      if (!broadcastData || !broadcastData.tx_response) {
        console.error('[tx:send] Broadcast failed:', broadcastData);
        return { ok: false, error: 'Failed to broadcast transaction' };
      }

      const txResponse = broadcastData.tx_response;
      if (txResponse.code !== 0) {
        console.error('[tx:send] Transaction rejected:', txResponse);
        return { ok: false, error: txResponse.raw_log || 'Transaction rejected by chain' };
      }

      console.log('[tx:send] Transaction successful! Hash:', txResponse.txhash);
      return {
        ok: true,
        txHash: txResponse.txhash,
        height: txResponse.height
      };

    } catch (err) {
      console.error('[tx:send] Error:', err);
      return { ok: false, error: err.message || 'Unknown error' };
    }
  });
}

module.exports = { registerTxIpc };
