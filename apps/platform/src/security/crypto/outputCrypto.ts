import { base64UrlToBytes, canonicalBytes, sha256, toArrayBuffer } from './hash';
import type { ConfidentialTaskOutput, SessionCryptoIdentity } from './types';

const OUTPUT_ALGORITHM = 'AES-256-GCM';

/**
 * Decrypts an execution result in the browser. The control plane only returns
 * this ciphertext package; the ODK and plaintext never leave this function.
 */
export const decryptConfidentialOutput = async (
  identity: SessionCryptoIdentity,
  output: ConfidentialTaskOutput,
): Promise<unknown> => {
  const encrypted = output.encryptedOutput;
  if (!encrypted || encrypted.algorithm !== OUTPUT_ALGORITHM) {
    throw new Error('加密产物使用了不支持的内容加密算法');
  }
  const envelope = output.keyEnvelopes?.find(
    (candidate) => candidate.recipientKid === identity.kid,
  );
  if (!envelope) {
    throw new Error('当前浏览器身份不是该加密产物的接收人');
  }

  const receipt = output.receipt || {};
  const taskSpecDigest = receipt.taskSpecDigest;
  const outputId = encrypted.outputId;
  if (
    typeof taskSpecDigest !== 'string' ||
    !/^[0-9a-f]{64}$/.test(taskSpecDigest) ||
    typeof outputId !== 'string' ||
    !outputId
  ) {
    throw new Error('加密产物缺少有效的任务或输出绑定');
  }
  const expectedOutputAad = {
    contractVersion: 'ds-confidential/v1',
    taskId: receipt.taskId,
    outputId,
    taskSpecDigest,
  };
  const actualOutputAad = encrypted.aad;
  const expectedOutputAadBytes = canonicalBytes(expectedOutputAad);
  const actualOutputAadBytes = canonicalBytes(actualOutputAad);
  if (
    expectedOutputAadBytes.byteLength !== actualOutputAadBytes.byteLength ||
    expectedOutputAadBytes.some((value, index) => value !== actualOutputAadBytes[index])
  ) {
    throw new Error('加密产物 AAD 与任务回执不匹配');
  }
  const expectedEnvelopeAad = new TextEncoder().encode(
    `${taskSpecDigest}|${outputId}|${identity.kid}`,
  );
  const envelopeAad = base64UrlToBytes(envelope.aad);
  if (
    envelopeAad.byteLength !== expectedEnvelopeAad.byteLength ||
    envelopeAad.some((value, index) => value !== expectedEnvelopeAad[index])
  ) {
    throw new Error('ODK 封装未绑定当前任务、输出或接收人');
  }

  const ciphertext = base64UrlToBytes(encrypted.ciphertext);
  if ((await sha256(ciphertext)) !== encrypted.ciphertextSha256) {
    throw new Error('加密产物密文完整性校验失败');
  }

  let odk: Uint8Array | undefined;
  try {
    odk = await identity.openEnvelope(envelope);
    if (odk.byteLength !== 32) {
      throw new Error('输出数据密钥长度无效');
    }
    const key = await crypto.subtle.importKey(
      'raw',
      toArrayBuffer(odk),
      { name: 'AES-GCM' },
      false,
      ['decrypt'],
    );
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(base64UrlToBytes(encrypted.nonce)),
        additionalData: toArrayBuffer(canonicalBytes(encrypted.aad)),
        tagLength: 128,
      },
      key,
      toArrayBuffer(ciphertext),
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as unknown;
  } finally {
    odk?.fill(0);
  }
};

/** Writes an already-decrypted result to a user-selected browser download. */
export const downloadDecryptedOutput = (
  value: unknown,
  filename = 'confidential-output.json',
) => {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};
