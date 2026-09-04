import { Aes256Gcm, CipherSuite, HkdfSha256 } from '@hpke/core';
import { DhkemX25519HkdfSha256 } from '@hpke/dhkem-x25519';

import { base64UrlToBytes, bytesToBase64Url, sha256, toArrayBuffer } from './hash';
import type { HpkeEnvelope, PublicKeyInfo } from './types';

export const HPKE_ALGORITHM = 'HPKE-Base-X25519-HKDF-SHA256-AES-256-GCM' as const;

export const hpkeSuite = new CipherSuite({
  kem: new DhkemX25519HkdfSha256(),
  kdf: new HkdfSha256(),
  aead: new Aes256Gcm(),
});

export const sealDek = async (
  dek: Uint8Array,
  publicKey: PublicKeyInfo,
  aad: Uint8Array,
  format: 'ds-envelope/v1' | 'ds-envelope/v2' = 'ds-envelope/v1',
): Promise<HpkeEnvelope> => {
  const recipientPublicKey = await hpkeSuite.kem.importKey(
    'raw',
    toArrayBuffer(base64UrlToBytes(publicKey.publicKey)),
    true,
  );
  const info = new TextEncoder().encode(`${format}:asset-dek`);
  const sealed = await hpkeSuite.seal(
    { recipientPublicKey, info },
    toArrayBuffer(dek),
    toArrayBuffer(aad),
  );
  return {
    recipientKid: publicKey.keyId,
    algorithm: HPKE_ALGORITHM,
    enc: bytesToBase64Url(sealed.enc),
    ciphertext: bytesToBase64Url(sealed.ct),
    info: bytesToBase64Url(info),
    aadHash: await sha256(aad),
  };
};
