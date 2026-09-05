import { hpkeSuite } from './envelope';
import {
  base64UrlToBytes,
  bytesToBase64Url,
  canonicalBytes,
  sha256,
  toArrayBuffer,
} from './hash';
import { randomId } from './random';
import type { HpkeEnvelope, SessionCryptoIdentity } from './types';

const DEFAULT_OUTPUT_INFO = new TextEncoder().encode('ds-confidential/v1/odk');
const IDENTITY_DB = 'confidential-asset-key-store';
const IDENTITY_STORE = 'identities';

type StoredIdentity = {
  kid: string;
  encryptionPublicKey: string;
  signingPublicKey: string;
  proofOfPossession: string;
  encryptionPrivateKey: CryptoKey;
  signingPrivateKey: CryptoKey;
};

const identityDatabase = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(IDENTITY_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(IDENTITY_STORE)) {
        request.result.createObjectStore(IDENTITY_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const loadStoredIdentity = async () => {
  if (typeof indexedDB === 'undefined') return undefined;
  const database = await identityDatabase();
  return new Promise<StoredIdentity | undefined>((resolve, reject) => {
    const transaction = database.transaction(IDENTITY_STORE, 'readonly');
    const request = transaction.objectStore(IDENTITY_STORE).get('current');
    request.onsuccess = () => resolve(request.result as StoredIdentity | undefined);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
};

const saveStoredIdentity = async (identity: StoredIdentity) => {
  if (typeof indexedDB === 'undefined') return;
  const database = await identityDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(IDENTITY_STORE, 'readwrite');
    transaction.objectStore(IDENTITY_STORE).put(identity, 'current');
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
};

const openHpkeEnvelope = async (
  privateKey: CryptoKey,
  identityKid: string,
  envelope: HpkeEnvelope & { aad: string },
) => {
  if (envelope.recipientKid !== identityKid) {
    throw new Error('加密产物接收人不是当前浏览器身份');
  }
  if (envelope.algorithm !== 'HPKE-Base-X25519-HKDF-SHA256-AES-256-GCM') {
    throw new Error('加密产物使用了不支持的 HPKE 算法');
  }
  const aadBytes = base64UrlToBytes(envelope.aad);
  if (envelope.aadHash && (await sha256(aadBytes)) !== envelope.aadHash) {
    throw new Error('ODK 封装 AAD 完整性校验失败');
  }
  const info = envelope.info ? base64UrlToBytes(envelope.info) : DEFAULT_OUTPUT_INFO;
  const plaintext = await hpkeSuite.open(
    {
      recipientKey: privateKey,
      enc: toArrayBuffer(base64UrlToBytes(envelope.enc)),
      info: toArrayBuffer(info),
    },
    toArrayBuffer(base64UrlToBytes(envelope.ciphertext)),
    toArrayBuffer(aadBytes),
  );
  return new Uint8Array(plaintext);
};

const openSealedDek = async (
  privateKey: CryptoKey,
  identityKid: string,
  envelope: HpkeEnvelope,
  aad: Uint8Array,
) => {
  if (envelope.recipientKid !== identityKid) {
    throw new Error('资产密钥接收人不是当前浏览器身份');
  }
  if (envelope.aadHash && (await sha256(aad)) !== envelope.aadHash) {
    throw new Error('资产密钥封装 AAD 完整性校验失败');
  }
  const plaintext = await hpkeSuite.open(
    {
      recipientKey: privateKey,
      enc: toArrayBuffer(base64UrlToBytes(envelope.enc)),
      info: toArrayBuffer(base64UrlToBytes(envelope.info || '')),
    },
    toArrayBuffer(base64UrlToBytes(envelope.ciphertext)),
    toArrayBuffer(aad),
  );
  return new Uint8Array(plaintext);
};

const restoreIdentity = (stored: StoredIdentity): SessionCryptoIdentity => ({
  kid: stored.kid,
  encryptionPublicKey: stored.encryptionPublicKey,
  signingPublicKey: stored.signingPublicKey,
  proofOfPossession: stored.proofOfPossession,
  sign: async (value) =>
    bytesToBase64Url(
      await crypto.subtle.sign(
        'Ed25519',
        stored.signingPrivateKey,
        canonicalBytes(value),
      ),
    ),
  openEnvelope: (envelope) =>
    openHpkeEnvelope(stored.encryptionPrivateKey, stored.kid, envelope),
  openSealedDek: (envelope, aad) =>
    openSealedDek(stored.encryptionPrivateKey, stored.kid, envelope, aad),
});

let currentIdentity: Promise<SessionCryptoIdentity> | undefined;

const createIdentity = async (): Promise<SessionCryptoIdentity> => {
  const encryptionKeys = await hpkeSuite.kem.generateKeyPair();
  const encryptionPublicKey = bytesToBase64Url(
    await hpkeSuite.kem.serializePublicKey(encryptionKeys.publicKey),
  );
  const signingKeys = (await crypto.subtle.generateKey({ name: 'Ed25519' }, false, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const signingPublicKey = bytesToBase64Url(
    await crypto.subtle.exportKey('raw', signingKeys.publicKey),
  );
  const kid = randomId('user').slice(0, 21);
  const proof = { kid, encryptionPublicKey, signingPublicKey };
  const sign = async (value: unknown) =>
    bytesToBase64Url(
      await crypto.subtle.sign(
        'Ed25519',
        signingKeys.privateKey,
        canonicalBytes(value),
      ),
    );
  const openEnvelope = (envelope: HpkeEnvelope & { aad: string }) =>
    openHpkeEnvelope(encryptionKeys.privateKey, kid, envelope);
  const identity: SessionCryptoIdentity = {
    ...proof,
    proofOfPossession: await sign(proof),
    sign,
    openEnvelope,
    openSealedDek: (envelope, aad) =>
      openSealedDek(encryptionKeys.privateKey, kid, envelope, aad),
  };
  await saveStoredIdentity({
    ...proof,
    proofOfPossession: identity.proofOfPossession,
    encryptionPrivateKey: encryptionKeys.privateKey,
    signingPrivateKey: signingKeys.privateKey,
  });
  return identity;
};

const loadOrCreateIdentity = async () => {
  try {
    const stored = await loadStoredIdentity();
    if (stored) return restoreIdentity(stored);
  } catch {
    // Browsers with restricted IndexedDB continue with an in-memory identity.
  }
  return createIdentity();
};

export const getSessionIdentity = () => {
  currentIdentity ??= loadOrCreateIdentity();
  return currentIdentity;
};

export const destroySessionIdentity = () => {
  currentIdentity = undefined;
  if (typeof indexedDB !== 'undefined') {
    void identityDatabase().then((database) => {
      const transaction = database.transaction(IDENTITY_STORE, 'readwrite');
      transaction.objectStore(IDENTITY_STORE).delete('current');
      transaction.oncomplete = () => database.close();
    });
  }
};
