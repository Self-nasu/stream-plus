import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class CryptoService {
  private readonly algorithm = 'aes-256-cbc';
  private readonly key: Buffer;

  constructor() {
    const keyString = process.env.ENCRYPTION_KEY;
    if (!keyString) {
      throw new Error('ENCRYPTION_KEY is not defined in environment variables');
    }
    // Ensure key is 32 bytes for aes-256
    this.key = Buffer.from(keyString.padEnd(32, '0').slice(0, 32));
  }

  encryptFilePath(filePath: string): string {
    // Use a fixed IV for deterministic encryption if needed, or random for security.
    // The old code used createCipher which is deprecated and uses a derived key/IV.
    // To match old code exactly might be tricky without knowing exact node version behavior,
    // but the requirement is "same implementation".
    // Old code: const cipher = crypto.createCipher('aes-256-cbc', process.env.ENCRYPTION_KEY);
    
    // NOTE: crypto.createCipher is deprecated and insecure. 
    // However, to maintain compatibility with existing links, we might need to replicate it.
    // But since this is a "new architecture", we should probably use createCipheriv.
    // IF we need to be compatible with ALREADY GENERATED links, we must use the exact same algo.
    // The user said "make that module same implementaiton".
    // Let's try to use the standard createCipheriv for better security if possible, 
    // BUT if the user wants to read OLD links, we might need the legacy one.
    // Given "new architecture", I will use the modern secure way. 
    // Wait, if I change it, old links won't work. 
    // The prompt says "same implementaiton". 
    // Let's stick to the logic in old code but maybe upgrade if possible?
    // Actually, `crypto.createCipher` derives key/IV from password. 
    // If I want to be 100% compatible I should use `createCipher`.
    // But `createCipher` is deprecated.
    // Let's use `createCipher` to be safe with "same implementation" request, 
    // or better, let's assume we can use the modern one for NEW links.
    // Let's use the modern `createCipheriv` with a fixed IV or random IV attached.
    // BUT, looking at `old_code/stream-helper/cryptoUtils.js`:
    // const cipher = crypto.createCipher('aes-256-cbc', process.env.ENCRYPTION_KEY);
    // It uses the password directly.
    
    // I will implement using `createCipher` to strictly follow "same implementation" 
    // and ensure backward compatibility if they migrate DB data.
    // I'll suppress the deprecation warning if needed or just use it.
    
    // @ts-ignore
    const cipher = crypto.createCipher(this.algorithm, process.env.ENCRYPTION_KEY || '');
    let encrypted = cipher.update(filePath, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }

  decryptFilePath(encryptedPath: string): string {
    // @ts-ignore
    const decipher = crypto.createDecipher(this.algorithm, process.env.ENCRYPTION_KEY || '');
    let decrypted = decipher.update(encryptedPath, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}
