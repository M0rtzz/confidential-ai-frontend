import { hpkeSuite } from './envelope';
import {
  base64UrlToBytes,
  bytesToBase64Url,
  canonicalBytes,
  sha256,
  toArrayBuffer,
} from './hash';
import type { HpkeEnvelope, SessionCryptoIdentity } from './types';

const DEFAULT_OUTPUT_INFO = new TextEncoder().encode('ds-confidential/v1/odk');

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
  const kid = `user-${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
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
  return {
    ...proof,
    proofOfPossession: await sign(proof),
    sign,
    openEnvelope,
  };
};

export const getSessionIdentity = () => {
  currentIdentity ??= createIdentity();
  return currentIdentity;
};

export const destroySessionIdentity = () => {
  currentIdentity = undefined;
};
