import { hpkeSuite } from './envelope';
import {
  base64UrlToBytes,
  bytesToBase64Url,
  canonicalBytes,
  sha256,
  toArrayBuffer,
} from './hash';

export type ConfidentialInferenceSession = {
  sessionId: string;
  teeEphemeralPublicKey: string;
  expiresAt: string;
};

export type EncryptedInferenceRequest = {
  deploymentId: string;
  sessionId: string;
  encryptedRequest: {
    algorithm: 'AES-256-GCM';
    nonce: string;
    aad: Record<string, string>;
    ciphertext: string;
    cipherHash: string;
    sealedRequestKey: { enc: string; ciphertext: string; aad: string };
  };
};

export type EncryptedInferenceResponse = {
  deploymentId: string;
  sessionId: string;
  securityProfile: 'a100-sim';
  simulated: true;
  encryptedResponse: {
    algorithm: 'AES-256-GCM';
    nonce: string;
    aad: Record<string, string>;
    ciphertext: string;
    ciphertextSha256: string;
  };
};

const REQUEST_KEY_INFO = new TextEncoder().encode(
  'ds-confidential/v1/inference-request-key',
);

export const createEncryptedInferenceRequest = async (
  deploymentId: string,
  session: ConfidentialInferenceSession,
  body: Record<string, unknown>,
) => {
  if (Date.parse(session.expiresAt) <= Date.now()) {
    throw new Error('推理授权会话已过期，请重新完成证明和 TEK 授权');
  }
  const requestKey = crypto.getRandomValues(new Uint8Array(32));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const aad = {
    contractVersion: 'ds-confidential/v1',
    deploymentId,
    sessionId: session.sessionId,
  };
  const imported = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(requestKey),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(nonce),
      additionalData: toArrayBuffer(canonicalBytes(aad)),
      tagLength: 128,
    },
    imported,
    toArrayBuffer(new TextEncoder().encode(JSON.stringify(body))),
  );
  const cipherHash = await sha256(ciphertext);
  const requestKeyAad = new TextEncoder().encode(
    `inference|${deploymentId}|${session.sessionId}|${cipherHash}`,
  );
  const recipientPublicKey = await hpkeSuite.kem.importKey(
    'raw',
    toArrayBuffer(base64UrlToBytes(session.teeEphemeralPublicKey)),
    true,
  );
  const sealed = await hpkeSuite.seal(
    { recipientPublicKey, info: REQUEST_KEY_INFO },
    toArrayBuffer(requestKey),
    toArrayBuffer(requestKeyAad),
  );
  const request: EncryptedInferenceRequest = {
    deploymentId,
    sessionId: session.sessionId,
    encryptedRequest: {
      algorithm: 'AES-256-GCM',
      nonce: bytesToBase64Url(nonce),
      aad,
      ciphertext: bytesToBase64Url(ciphertext),
      cipherHash,
      sealedRequestKey: {
        enc: bytesToBase64Url(sealed.enc),
        ciphertext: bytesToBase64Url(sealed.ct),
        aad: bytesToBase64Url(requestKeyAad),
      },
    },
  };
  let destroyed = false;
  const destroy = () => {
    if (!destroyed) {
      requestKey.fill(0);
      destroyed = true;
    }
  };
  return {
    request,
    destroy,
    decrypt: async (response: EncryptedInferenceResponse) => {
      if (destroyed) throw new Error('推理请求密钥已销毁');
      if (
        response.deploymentId !== deploymentId ||
        response.sessionId !== session.sessionId
      ) {
        throw new Error('加密响应与当前部署授权会话不匹配');
      }
      const encrypted = response.encryptedResponse;
      const outputCiphertext = base64UrlToBytes(encrypted.ciphertext);
      if ((await sha256(outputCiphertext)) !== encrypted.ciphertextSha256) {
        throw new Error('推理响应密文完整性校验失败');
      }
      try {
        const plaintext = await crypto.subtle.decrypt(
          {
            name: 'AES-GCM',
            iv: toArrayBuffer(base64UrlToBytes(encrypted.nonce)),
            additionalData: toArrayBuffer(canonicalBytes(encrypted.aad)),
            tagLength: 128,
          },
          imported,
          toArrayBuffer(outputCiphertext),
        );
        return JSON.parse(new TextDecoder().decode(plaintext)) as Record<
          string,
          unknown
        >;
      } finally {
        destroy();
      }
    },
  };
};
