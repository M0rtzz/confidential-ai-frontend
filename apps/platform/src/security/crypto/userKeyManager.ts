import { argon2idAsync } from '@noble/hashes/argon2.js';

import { hpkeSuite } from './envelope';
import {
  base64UrlToBytes,
  bytesToBase64Url,
  canonicalBytes,
  sha256,
  toArrayBuffer,
} from './hash';
import { assertCryptoAvailable, randomId } from './random';
import { currentStoredIdentity, replaceStoredIdentity } from './sessionIdentity';

const FORMAT = 'ds-user-key/v1';
const MEMORY_KIB = 64 * 1024;

export type UserKeyBackup = {
  format: typeof FORMAT;
  scope: string;
  kid: string;
  keyVersion: number;
  algorithm: 'X25519';
  publicKey: string;
  kdf: {
    name: 'Argon2id';
    salt: string;
    memoryKiB: number;
    iterations: number;
    parallelism: number;
  };
  encryption: {
    name: 'AES-256-GCM';
    nonce: string;
    ciphertext: string;
  };
};

const backupKey = async (password: string, salt: Uint8Array) => {
  if (password.length < 10) throw new Error('密钥备份口令至少需要 10 个字符');
  return argon2idAsync(new TextEncoder().encode(password), salt, {
    t: 3,
    m: MEMORY_KIB,
    p: 1,
    dkLen: 32,
    asyncTick: 10,
  });
};

export const exportUserEncryptionKey = async (password: string) => {
  assertCryptoAvailable();
  const stored = await currentStoredIdentity();
  if (!stored) throw new Error('当前浏览器尚未创建客户密钥');
  const privateKey = new Uint8Array(
    await hpkeSuite.kem.serializePrivateKey(stored.encryptionPrivateKey),
  );
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const keyBytes = await backupKey(password, salt);
  const header = {
    format: FORMAT as typeof FORMAT,
    scope: stored.scope,
    kid: stored.kid,
    keyVersion: stored.keyVersion,
    algorithm: 'X25519' as const,
    publicKey: stored.encryptionPublicKey,
  };
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      toArrayBuffer(keyBytes),
      'AES-GCM',
      false,
      ['encrypt'],
    );
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(nonce),
        additionalData: toArrayBuffer(canonicalBytes(header)),
      },
      key,
      toArrayBuffer(privateKey),
    );
    const backup: UserKeyBackup = {
      ...header,
      kdf: {
        name: 'Argon2id',
        salt: bytesToBase64Url(salt),
        memoryKiB: MEMORY_KIB,
        iterations: 3,
        parallelism: 1,
      },
      encryption: {
        name: 'AES-256-GCM',
        nonce: bytesToBase64Url(nonce),
        ciphertext: bytesToBase64Url(ciphertext),
      },
    };
    return new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  } finally {
    privateKey.fill(0);
    keyBytes.fill(0);
  }
};

export const importUserEncryptionKey = async (file: File, password: string) => {
  assertCryptoAvailable();
  const backup = JSON.parse(await file.text()) as UserKeyBackup;
  const currentScope = localStorage.getItem('Confidential-Key-Scope');
  if (
    backup.format !== FORMAT ||
    backup.algorithm !== 'X25519' ||
    backup.kdf?.name !== 'Argon2id' ||
    backup.encryption?.name !== 'AES-256-GCM' ||
    backup.scope !== currentScope
  ) {
    throw new Error('密钥文件格式或所属账号不匹配');
  }
  const salt = base64UrlToBytes(backup.kdf.salt);
  const keyBytes = await backupKey(password, salt);
  let privateBytes: Uint8Array | undefined;
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      toArrayBuffer(keyBytes),
      'AES-GCM',
      false,
      ['decrypt'],
    );
    const header = {
      format: FORMAT,
      scope: backup.scope,
      kid: backup.kid,
      keyVersion: backup.keyVersion,
      algorithm: backup.algorithm,
      publicKey: backup.publicKey,
    };
    privateBytes = new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: toArrayBuffer(base64UrlToBytes(backup.encryption.nonce)),
          additionalData: toArrayBuffer(canonicalBytes(header)),
        },
        key,
        toArrayBuffer(base64UrlToBytes(backup.encryption.ciphertext)),
      ),
    );
    const encryptionPrivateKey = await hpkeSuite.kem.deserializePrivateKey(
      privateBytes,
    );
    const publicKey = await hpkeSuite.kem.deserializePublicKey(
      base64UrlToBytes(backup.publicKey),
    );
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const sealed = await hpkeSuite.seal(
      {
        recipientPublicKey: publicKey,
        info: new TextEncoder().encode('ds-user-key/v1/verify'),
      },
      toArrayBuffer(challenge),
      toArrayBuffer(new TextEncoder().encode(backup.kid)),
    );
    const opened = new Uint8Array(
      await hpkeSuite.open(
        {
          recipientKey: encryptionPrivateKey,
          enc: sealed.enc,
          info: new TextEncoder().encode('ds-user-key/v1/verify'),
        },
        sealed.ct,
        toArrayBuffer(new TextEncoder().encode(backup.kid)),
      ),
    );
    if ((await sha256(opened)) !== (await sha256(challenge))) {
      throw new Error('密钥文件中的公钥和私钥不匹配');
    }
    const signingKeys = (await crypto.subtle.generateKey({ name: 'Ed25519' }, false, [
      'sign',
      'verify',
    ])) as CryptoKeyPair;
    const signingPublicKey = bytesToBase64Url(
      await crypto.subtle.exportKey('raw', signingKeys.publicKey),
    );
    const proof = {
      kid: backup.kid,
      encryptionPublicKey: backup.publicKey,
      signingPublicKey,
    };
    const proofOfPossession = bytesToBase64Url(
      await crypto.subtle.sign(
        'Ed25519',
        signingKeys.privateKey,
        canonicalBytes(proof),
      ),
    );
    await replaceStoredIdentity({
      scope: backup.scope,
      keyVersion: backup.keyVersion,
      ...proof,
      proofOfPossession,
      encryptionPrivateKey,
      signingPrivateKey: signingKeys.privateKey,
    });
    return {
      kid: backup.kid,
      fingerprint: await sha256(base64UrlToBytes(backup.publicKey)),
    };
  } catch (failure) {
    throw new Error(
      failure instanceof Error && failure.message.includes('账号')
        ? failure.message
        : '密钥文件或恢复口令无效',
    );
  } finally {
    privateBytes?.fill(0);
    keyBytes.fill(0);
  }
};

export const userKeyFileName = () =>
  `customer-${(
    localStorage.getItem('Confidential-Key-Scope') || randomId('key')
  ).replace(/[^A-Za-z0-9._-]/g, '_')}.dskey`;
