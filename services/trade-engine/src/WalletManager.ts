import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { createLogger } from '@mpg2/shared';

const log = createLogger('wallet-manager');
const ALGO = 'aes-256-gcm';

function deriveKey(masterSecret: string): Buffer {
  return createHash('sha256').update(masterSecret).digest();
}

export function encryptPrivateKey(privateKeyBase58: string, masterSecret: string): string {
  const key = deriveKey(masterSecret);
  const iv  = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(privateKeyBase58, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv:tag:ciphertext (all hex)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decryptPrivateKey(encrypted: string, masterSecret: string): string {
  const parts = encrypted.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted key format');
  const [ivHex, tagHex, encHex] = parts as [string, string, string];
  const key    = deriveKey(masterSecret);
  const iv     = Buffer.from(ivHex, 'hex');
  const tag    = Buffer.from(tagHex, 'hex');
  const enc    = Buffer.from(encHex, 'hex');
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(enc).toString('utf8') + decipher.final('utf8');
}

export class WalletManager {
  private masterSecret: string;

  constructor() {
    this.masterSecret = process.env['WALLET_MASTER_SECRET'] ?? '';
    if (!this.masterSecret) {
      log.warn('WALLET_MASTER_SECRET not set — live trading disabled');
    }
  }

  isConfigured(): boolean {
    return this.masterSecret.length > 0;
  }

  getDecryptedKey(encryptedKey: string): string {
    if (!this.masterSecret) throw new Error('WALLET_MASTER_SECRET not configured');
    return decryptPrivateKey(encryptedKey, this.masterSecret);
  }

  encrypt(rawKey: string): string {
    if (!this.masterSecret) throw new Error('WALLET_MASTER_SECRET not configured');
    return encryptPrivateKey(rawKey, this.masterSecret);
  }
}
