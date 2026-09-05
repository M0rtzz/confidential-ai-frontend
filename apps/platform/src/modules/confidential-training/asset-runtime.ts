import {
  base64UrlToBytes,
  canonicalBytes,
  cryptoAdapter,
  decryptEncryptedFile,
  getSessionIdentity,
  sha256,
  type ContentEncryptionAlgorithm,
  type PublicKeyInfo,
} from '@/security/crypto';
import {
  ConfidentialAssetApi,
  hydrateEncryptedPayload,
  type ConfidentialAssetType,
} from '@/services/confidential-assets';
import { ConfidentialComputeApi } from '@/services/confidential-compute';

const ownerKey = async (domainId: string): Promise<PublicKeyInfo> => {
  const identity = await getSessionIdentity();
  await ConfidentialComputeApi.registerIdentity({
    kid: identity.kid,
    encryptionPublicKey: identity.encryptionPublicKey,
    signingPublicKey: identity.signingPublicKey,
    proofOfPossession: identity.proofOfPossession,
  });
  return {
    keyId: identity.kid,
    domainId,
    version: 1,
    algorithm: 'HPKE-Base-X25519-HKDF-SHA256-AES-256-GCM',
    fingerprint: `SHA256:${await sha256(
      base64UrlToBytes(identity.encryptionPublicKey),
    )}`,
    publicKey: identity.encryptionPublicKey,
    status: 'active',
  };
};

export const encryptProviderCredential = async (apiKey: string, domainId: string) =>
  cryptoAdapter.encryptText(apiKey, await ownerKey(domainId));

export const decryptAssetForExecution = async (assetId: string) => {
  const value = await ConfidentialAssetApi.preview(assetId);
  return decryptEncryptedFile(hydrateEncryptedPayload(value));
};

export const uploadExecutionResult = async (options: {
  bytes: Uint8Array;
  fileName: string;
  name: string;
  description: string;
  assetType: Extract<ConfidentialAssetType, 'RESULT_DATA' | 'RESULT_MODEL'>;
  domainId: string;
  algorithm: ContentEncryptionAlgorithm;
  taskId: string;
  computeNode: string;
  sourceDataName: string;
  sourceModelName: string;
}) => {
  const identity = await getSessionIdentity();
  const file = new File([options.bytes], options.fileName, {
    type: options.assetType === 'RESULT_DATA' ? 'text/csv' : 'application/octet-stream',
  });
  const encrypted = await cryptoAdapter.encryptFile(
    file,
    await ownerKey(options.domainId),
    undefined,
    { algorithm: options.algorithm },
  );
  const session = await ConfidentialAssetApi.createUpload({
    assetType: options.assetType,
    sourceType: 'COMPUTE_RESULT',
    name: options.name,
    description: options.description,
    originalFileName: options.fileName,
    originalSize: file.size,
    domainId: options.domainId,
    algorithm: options.algorithm,
    expectedChunks: encrypted.chunks.length,
  });
  for (const chunk of encrypted.chunks) {
    await ConfidentialAssetApi.uploadChunk(
      session.uploadSessionId,
      chunk.index,
      base64UrlToBytes(chunk.ciphertext),
      chunk.sha256,
    );
  }
  const manifest = {
    ...encrypted,
    chunks: encrypted.chunks.map((chunk) => ({
      index: chunk.index,
      plaintextLength: chunk.plaintextLength,
      nonce: chunk.nonce,
      sha256: chunk.sha256,
      aad: chunk.aad,
    })),
  };
  const asset = await ConfidentialAssetApi.commit(session.uploadSessionId, {
    manifest,
    manifestHash: await sha256(canonicalBytes(manifest)),
    ownerSigningPublicKey: identity.signingPublicKey,
    ownerSignature: await identity.sign(manifest),
    sourceDataName: options.sourceDataName,
    sourceModelName: options.sourceModelName,
    taskId: options.taskId,
    computeNode: options.computeNode,
  });
  options.bytes.fill(0);
  return asset;
};
