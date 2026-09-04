import { hpkeSuite } from './envelope';
import { base64UrlToBytes, bytesToBase64Url, toArrayBuffer } from './hash';

const vault = new Map<string, Uint8Array>();
const SESSION_DEK_INFO = new TextEncoder().encode('ds-confidential/v1/dek');

export const rememberDek = (envelopeId: string, dek: Uint8Array) => {
  const previous = vault.get(envelopeId);
  previous?.fill(0);
  vault.set(envelopeId, Uint8Array.from(dek));
};

export const hasRememberedDek = (envelopeId: string) => vault.has(envelopeId);

export const sealRememberedDek = async (
  envelopeId: string,
  teeEphemeralPublicKey: string,
  aad: Uint8Array,
) => {
  const dek = vault.get(envelopeId);
  if (!dek) throw new Error('当前浏览器会话没有该版本的 DEK，请重新导入凭据版本');
  const recipientPublicKey = await hpkeSuite.kem.importKey(
    'raw',
    toArrayBuffer(base64UrlToBytes(teeEphemeralPublicKey)),
    true,
  );
  const sealed = await hpkeSuite.seal(
    { recipientPublicKey, info: SESSION_DEK_INFO },
    toArrayBuffer(dek),
    toArrayBuffer(aad),
  );
  return {
    enc: bytesToBase64Url(sealed.enc),
    ciphertext: bytesToBase64Url(sealed.ct),
    aad: bytesToBase64Url(aad),
  };
};

export const forgetDek = (envelopeId: string) => {
  vault.get(envelopeId)?.fill(0);
  vault.delete(envelopeId);
};
