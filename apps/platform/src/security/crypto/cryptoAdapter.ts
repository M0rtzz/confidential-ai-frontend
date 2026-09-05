import {
  contentEncryptionCapability,
  decryptContent,
  DEFAULT_CONTENT_ENCRYPTION_ALGORITHM,
  encryptContent,
} from './contentEncryption';
import { rememberDek } from './dekVault';
import { sealDek } from './envelope';
import {
  base64UrlToBytes,
  canonicalBytes,
  bytesToBase64Url,
  sha256,
  toArrayBuffer,
} from './hash';
import { assertCryptoAvailable, randomId } from './random';
import { getSessionIdentity } from './sessionIdentity';
import type {
  CryptoAdapter,
  EncryptedFileChunk,
  EncryptedFilePayload,
  EncryptedPayload,
  ContentEncryptionAlgorithm,
  PublicKeyInfo,
} from './types';

const FILE_CHUNK_SIZE = 8 * 1024 * 1024;

const requireActiveKey = (publicKey: PublicKeyInfo) => {
  assertCryptoAvailable();
  if (publicKey.status !== 'active') {
    throw new Error(
      publicKey.status === 'expired'
        ? '公钥已过期，无法继续加密，请重新获取最新公钥'
        : '当前可信域公钥不可用，请求已阻断',
    );
  }
  if (publicKey.expiresAt && Date.parse(publicKey.expiresAt) <= Date.now()) {
    throw new Error('公钥已过期，无法继续加密，请重新获取最新公钥');
  }
};

const encryptAesGcm = async (
  dek: Uint8Array,
  nonce: Uint8Array,
  plaintext: ArrayBuffer,
  aad: unknown,
) => {
  const key = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(dek),
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  );
  return crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(nonce),
      additionalData: toArrayBuffer(canonicalBytes(aad)),
    },
    key,
    plaintext,
  );
};

export class BrowserCryptoAdapter implements CryptoAdapter {
  async hashCipher(cipher: ArrayBuffer | Blob | string) {
    return sha256(cipher);
  }

  async encryptText(
    plaintext: string,
    publicKey: PublicKeyInfo,
  ): Promise<EncryptedPayload> {
    requireActiveKey(publicKey);
    const envelopeId = randomId('env');
    const dek = crypto.getRandomValues(new Uint8Array(32));
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const aad = {
      format: 'ds-envelope/v1',
      envelopeId,
      domainId: publicKey.domainId,
      publicKeyId: publicKey.keyId,
      publicKeyVersion: publicKey.version,
    };
    try {
      rememberDek(envelopeId, dek);
      const ciphertext = await encryptAesGcm(
        dek,
        nonce,
        toArrayBuffer(new TextEncoder().encode(plaintext)),
        aad,
      );
      return {
        format: 'ds-envelope/v1',
        envelopeId,
        ciphertext: bytesToBase64Url(ciphertext),
        cipherHash: await sha256(ciphertext),
        nonce: bytesToBase64Url(nonce),
        aad,
        keyEnvelope: await sealDek(dek, publicKey, canonicalBytes(aad)),
        domainId: publicKey.domainId,
        publicKeyId: publicKey.keyId,
        publicKeyVersion: publicKey.version,
        algorithm: 'AES-256-GCM',
      };
    } finally {
      dek.fill(0);
    }
  }

  async encryptFile(
    file: File,
    publicKey: PublicKeyInfo,
    onProgress?: (progress: number) => void,
    options?: { algorithm?: ContentEncryptionAlgorithm },
  ): Promise<EncryptedFilePayload> {
    requireActiveKey(publicKey);
    const envelopeId = randomId('env');
    const algorithm = options?.algorithm || DEFAULT_CONTENT_ENCRYPTION_ALGORITHM;
    const capability = contentEncryptionCapability(algorithm);
    const dek = crypto.getRandomValues(new Uint8Array(32));
    const chunks: EncryptedFileChunk[] = [];
    let cipherSize = 0;
    try {
      rememberDek(envelopeId, dek);
      for (
        let offset = 0, index = 0;
        offset < file.size;
        offset += FILE_CHUNK_SIZE, index += 1
      ) {
        const plaintext = await file
          .slice(offset, offset + FILE_CHUNK_SIZE)
          .arrayBuffer();
        const nonce = crypto.getRandomValues(new Uint8Array(capability.nonceSize));
        const aad = {
          format: 'ds-envelope/v2',
          envelopeId,
          contentEncryptionAlgorithm: algorithm,
          implementationVersion: capability.implementationVersion,
          domainId: publicKey.domainId,
          publicKeyId: publicKey.keyId,
          publicKeyVersion: publicKey.version,
          chunkIndex: index,
          plaintextLength: plaintext.byteLength,
        };
        const ciphertext = await encryptContent(
          algorithm,
          dek,
          envelopeId,
          nonce,
          plaintext,
          aad,
        );
        cipherSize += ciphertext.byteLength;
        chunks.push({
          index,
          plaintextLength: plaintext.byteLength,
          nonce: bytesToBase64Url(nonce),
          ciphertext: bytesToBase64Url(ciphertext),
          sha256: await sha256(ciphertext),
          aad,
        });
        onProgress?.(
          Math.min(
            100,
            Math.round(((offset + plaintext.byteLength) / file.size) * 100),
          ),
        );
      }
      const manifestBinding = {
        format: 'ds-envelope/v2',
        envelopeId,
        contentEncryptionAlgorithm: algorithm,
        implementationVersion: capability.implementationVersion,
        domainId: publicKey.domainId,
        publicKeyId: publicKey.keyId,
        publicKeyVersion: publicKey.version,
        originalSize: file.size,
        chunks: chunks.map(({ index, plaintextLength, sha256: chunkHash }) => ({
          index,
          plaintextLength,
          sha256: chunkHash,
        })),
      };
      return {
        format: 'ds-envelope/v2',
        envelopeId,
        cipherHash: await sha256(canonicalBytes(manifestBinding)),
        keyEnvelope: await sealDek(
          dek,
          publicKey,
          canonicalBytes(manifestBinding),
          'ds-envelope/v2',
        ),
        domainId: publicKey.domainId,
        publicKeyId: publicKey.keyId,
        publicKeyVersion: publicKey.version,
        algorithm,
        originalSize: file.size,
        cipherSize,
        chunkSize: FILE_CHUNK_SIZE,
        contentEncryption: {
          algorithm,
          keyDerivation: 'HKDF-SHA256',
          implementationVersion: capability.implementationVersion,
          keySize: capability.keySize,
          nonceSize: capability.nonceSize,
          tagSize: capability.tagSize,
        },
        chunks,
      };
    } finally {
      dek.fill(0);
    }
  }
}

export const cryptoAdapter: CryptoAdapter = new BrowserCryptoAdapter();

export const decryptEncryptedFile = async (payload: EncryptedFilePayload) => {
  const identity = await getSessionIdentity();
  const manifestBinding = {
    format: payload.format,
    envelopeId: payload.envelopeId,
    contentEncryptionAlgorithm: payload.algorithm,
    implementationVersion: payload.contentEncryption.implementationVersion,
    domainId: payload.domainId,
    publicKeyId: payload.publicKeyId,
    publicKeyVersion: payload.publicKeyVersion,
    originalSize: payload.originalSize,
    chunks: payload.chunks.map(({ index, plaintextLength, sha256: chunkHash }) => ({
      index,
      plaintextLength,
      sha256: chunkHash,
    })),
  };
  const dek = await identity.openSealedDek(
    payload.keyEnvelope,
    canonicalBytes(manifestBinding),
  );
  try {
    const plaintext = new Uint8Array(payload.originalSize);
    let offset = 0;
    for (const chunk of payload.chunks) {
      const value = await decryptContent(
        payload.algorithm,
        dek,
        payload.envelopeId,
        base64UrlToBytes(chunk.nonce),
        toArrayBuffer(base64UrlToBytes(chunk.ciphertext)),
        chunk.aad,
      );
      plaintext.set(new Uint8Array(value), offset);
      offset += value.byteLength;
    }
    return plaintext;
  } finally {
    dek.fill(0);
  }
};
