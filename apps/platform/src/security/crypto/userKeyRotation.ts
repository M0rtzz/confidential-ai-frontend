import { hpkeSuite } from './envelope';
import { bytesToBase64Url, canonicalBytes } from './hash';
import { assertCryptoAvailable, randomId } from './random';
import {
  clearSessionIdentity,
  currentStoredIdentity,
  saveStoredIdentity,
} from './sessionIdentity';
import type { StoredIdentity } from './sessionIdentity';

/** 轮换材料：公钥部分先提交给服务端登记，登记成功后再落库替换当前身份。 */
export type RotatedKeyMaterial = {
  kid: string;
  keyVersion: number;
  encryptionPublicKey: string;
  signingPublicKey: string;
  proofOfPossession: string;
  /** 服务端登记成功后调用，把新身份写入 IndexedDB 并替换当前会话身份。 */
  persist: () => Promise<void>;
};

/**
 * 生成下一版客户密钥。
 *
 * 私钥在浏览器内生成，不出浏览器。登记与落库分两步：先把公钥与持有证明交给服务端，
 * 登记成功后再调用 persist 替换本地身份——顺序反过来会在登记失败时留下服务端不认识的密钥。
 */
export const prepareRotatedUserKey = async (): Promise<RotatedKeyMaterial> => {
  assertCryptoAvailable();
  const previous = await currentStoredIdentity();
  if (!previous) {
    throw new Error('本浏览器尚未持有客户密钥，请先生成后再轮换');
  }
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
  const proofOfPossession = bytesToBase64Url(
    await crypto.subtle.sign('Ed25519', signingKeys.privateKey, canonicalBytes(proof)),
  );
  const keyVersion = (previous.keyVersion || 1) + 1;
  const next: StoredIdentity = {
    scope: previous.scope,
    keyVersion,
    ...proof,
    proofOfPossession,
    encryptionPrivateKey: encryptionKeys.privateKey,
    signingPrivateKey: signingKeys.privateKey,
  };
  return {
    kid,
    keyVersion,
    encryptionPublicKey,
    signingPublicKey,
    proofOfPossession,
    persist: async () => {
      await saveStoredIdentity(next);
      clearSessionIdentity();
    },
  };
};
