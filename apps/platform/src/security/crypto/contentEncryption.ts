import { aessiv, gcmsiv } from '@noble/ciphers/aes.js';
import { chacha20poly1305, xchacha20poly1305 } from '@noble/ciphers/chacha.js';

import { canonicalBytes, toArrayBuffer } from './hash';
import type { ContentEncryptionAlgorithm, ContentEncryptionCapability } from './types';

export const CONTENT_ENCRYPTION_CAPABILITIES: ContentEncryptionCapability[] = [
  {
    algorithm: 'AES-256-GCM',
    label: 'AES-256-GCM',
    description: '默认算法，浏览器兼容性和硬件加速支持最好',
    keySize: 32,
    nonceSize: 12,
    tagSize: 16,
    implementationVersion: '1',
    recommended: true,
  },
  {
    algorithm: 'AES-256-GCM-SIV',
    label: 'AES-256-GCM-SIV',
    description: '具备 nonce 误用抵抗能力',
    keySize: 32,
    nonceSize: 12,
    tagSize: 16,
    implementationVersion: '1',
  },
  {
    algorithm: 'CHACHA20-POLY1305',
    label: 'ChaCha20-Poly1305',
    description: '适合缺少 AES 硬件加速的客户端',
    keySize: 32,
    nonceSize: 12,
    tagSize: 16,
    implementationVersion: '1',
  },
  {
    algorithm: 'XCHACHA20-POLY1305',
    label: 'XChaCha20-Poly1305',
    description: '扩展 nonce，适合大规模分块加密',
    keySize: 32,
    nonceSize: 24,
    tagSize: 16,
    implementationVersion: '1',
  },
  {
    algorithm: 'AES-256-SIV',
    label: 'AES-256-SIV',
    description: '确定性认证加密并抵抗 nonce 误用',
    keySize: 64,
    nonceSize: 16,
    tagSize: 16,
    implementationVersion: '1',
  },
];

export const DEFAULT_CONTENT_ENCRYPTION_ALGORITHM: ContentEncryptionAlgorithm =
  'AES-256-GCM';

export const contentEncryptionCapability = (algorithm: ContentEncryptionAlgorithm) => {
  const capability = CONTENT_ENCRYPTION_CAPABILITIES.find(
    (item) => item.algorithm === algorithm,
  );
  if (!capability) throw new Error(`不支持的内容加密算法：${algorithm}`);
  return capability;
};

const deriveContentKey = async (
  dek: Uint8Array,
  envelopeId: string,
  capability: ContentEncryptionCapability,
) => {
  const material = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(dek),
    'HKDF',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: toArrayBuffer(new TextEncoder().encode(`ds-envelope/v2:${envelopeId}`)),
      info: toArrayBuffer(
        new TextEncoder().encode(
          `content-key:${capability.algorithm}:${capability.implementationVersion}`,
        ),
      ),
    },
    material,
    capability.keySize * 8,
  );
  return new Uint8Array(bits);
};

export const encryptContent = async (
  algorithm: ContentEncryptionAlgorithm,
  dek: Uint8Array,
  envelopeId: string,
  nonce: Uint8Array,
  plaintext: ArrayBuffer,
  aad: unknown,
) => {
  const capability = contentEncryptionCapability(algorithm);
  if (nonce.byteLength !== capability.nonceSize) {
    throw new Error(`${algorithm} nonce 长度必须为 ${capability.nonceSize} bytes`);
  }
  const key = await deriveContentKey(dek, envelopeId, capability);
  const aadBytes = canonicalBytes(aad);
  const plaintextBytes = new Uint8Array(plaintext);
  try {
    if (algorithm === 'AES-256-GCM') {
      const imported = await crypto.subtle.importKey(
        'raw',
        toArrayBuffer(key),
        { name: 'AES-GCM' },
        false,
        ['encrypt'],
      );
      return crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: toArrayBuffer(nonce),
          additionalData: toArrayBuffer(aadBytes),
          tagLength: 128,
        },
        imported,
        plaintext,
      );
    }
    if (algorithm === 'AES-256-GCM-SIV') {
      return toArrayBuffer(gcmsiv(key, nonce, aadBytes).encrypt(plaintextBytes));
    }
    if (algorithm === 'CHACHA20-POLY1305') {
      return toArrayBuffer(
        chacha20poly1305(key, nonce, aadBytes).encrypt(plaintextBytes),
      );
    }
    if (algorithm === 'XCHACHA20-POLY1305') {
      return toArrayBuffer(
        xchacha20poly1305(key, nonce, aadBytes).encrypt(plaintextBytes),
      );
    }
    return toArrayBuffer(aessiv(key, aadBytes, nonce).encrypt(plaintextBytes));
  } finally {
    key.fill(0);
  }
};

export const decryptContent = async (
  algorithm: ContentEncryptionAlgorithm,
  dek: Uint8Array,
  envelopeId: string,
  nonce: Uint8Array,
  ciphertext: ArrayBuffer,
  aad: unknown,
) => {
  const capability = contentEncryptionCapability(algorithm);
  const key = await deriveContentKey(dek, envelopeId, capability);
  const aadBytes = canonicalBytes(aad);
  try {
    if (algorithm === 'AES-256-GCM') {
      const imported = await crypto.subtle.importKey(
        'raw',
        toArrayBuffer(key),
        { name: 'AES-GCM' },
        false,
        ['decrypt'],
      );
      return crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: toArrayBuffer(nonce),
          additionalData: toArrayBuffer(aadBytes),
          tagLength: 128,
        },
        imported,
        ciphertext,
      );
    }
    const value = new Uint8Array(ciphertext);
    if (algorithm === 'AES-256-GCM-SIV')
      return toArrayBuffer(gcmsiv(key, nonce, aadBytes).decrypt(value));
    if (algorithm === 'CHACHA20-POLY1305')
      return toArrayBuffer(chacha20poly1305(key, nonce, aadBytes).decrypt(value));
    if (algorithm === 'XCHACHA20-POLY1305')
      return toArrayBuffer(xchacha20poly1305(key, nonce, aadBytes).decrypt(value));
    return toArrayBuffer(aessiv(key, aadBytes, nonce).decrypt(value));
  } finally {
    key.fill(0);
  }
};
