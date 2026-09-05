export type SecurityProfile = 'a100-sim' | 'gpu-cc-prod';

export type RuntimeSecurityRequirement = 'gpu-cc' | 'controlled-sim-ok' | 'public';

export type ContentEncryptionAlgorithm =
  | 'AES-256-GCM'
  | 'AES-256-GCM-SIV'
  | 'CHACHA20-POLY1305'
  | 'XCHACHA20-POLY1305'
  | 'AES-256-SIV';

export type ContentEncryptionCapability = {
  algorithm: ContentEncryptionAlgorithm;
  label: string;
  description: string;
  keySize: number;
  nonceSize: number;
  tagSize: number;
  implementationVersion: '1';
  recommended?: boolean;
};

export type TrustedDomain = {
  id: string;
  name: string;
  status: 'active' | 'offline';
  trustStatus: 'trusted' | 'blocked';
  securityProfile: SecurityProfile;
  evidenceType: string;
  simulated: boolean;
  hardwareModel: string;
  policyId: string;
  purpose: string;
  warning: string;
  boundResources?: string[];
};

export type PublicKeyInfo = {
  keyId: string;
  domainId: string;
  version: number;
  algorithm: 'HPKE-Base-X25519-HKDF-SHA256-AES-256-GCM';
  fingerprint: string;
  publicKey: string;
  status: 'active' | 'expired' | 'revoked' | 'recycled';
  expiresAt?: string;
};

export type HpkeEnvelope = {
  recipientKid: string;
  algorithm: 'HPKE-Base-X25519-HKDF-SHA256-AES-256-GCM';
  enc: string;
  ciphertext: string;
  /** Base64url-encoded AAD when supplied by an output envelope. */
  aad?: string;
  /** Optional on output envelopes; the ODK contract supplies a default. */
  info?: string;
  /** Optional on legacy/output envelopes where the server already validated AAD. */
  aadHash?: string;
};

export type EncryptedPayload = {
  format: 'ds-envelope/v1';
  envelopeId: string;
  ciphertext: string;
  cipherHash: string;
  nonce: string;
  aad: Record<string, string | number>;
  keyEnvelope: HpkeEnvelope;
  domainId: string;
  publicKeyId: string;
  publicKeyVersion: number;
  algorithm: 'AES-256-GCM';
};

export type EncryptedFileChunk = {
  index: number;
  plaintextLength: number;
  nonce: string;
  ciphertext: string;
  sha256: string;
  aad: Record<string, string | number>;
};

export type EncryptedFilePayload = Omit<
  EncryptedPayload,
  'ciphertext' | 'nonce' | 'aad' | 'format' | 'algorithm'
> & {
  format: 'ds-envelope/v2';
  algorithm: ContentEncryptionAlgorithm;
  originalSize: number;
  cipherSize: number;
  chunkSize: number;
  contentEncryption: {
    algorithm: ContentEncryptionAlgorithm;
    keyDerivation: 'HKDF-SHA256';
    implementationVersion: '1';
    keySize: number;
    nonceSize: number;
    tagSize: number;
  };
  chunks: EncryptedFileChunk[];
};

export interface CryptoAdapter {
  encryptText(plaintext: string, publicKey: PublicKeyInfo): Promise<EncryptedPayload>;

  encryptFile(
    file: File,
    publicKey: PublicKeyInfo,
    onProgress?: (progress: number) => void,
    options?: { algorithm?: ContentEncryptionAlgorithm },
  ): Promise<EncryptedFilePayload>;

  hashCipher(cipher: ArrayBuffer | Blob | string): Promise<string>;
}

export type SessionCryptoIdentity = {
  kid: string;
  encryptionPublicKey: string;
  signingPublicKey: string;
  proofOfPossession: string;
  sign: (value: unknown) => Promise<string>;
  /** Opens a HPKE envelope using the in-memory UEK private key. */
  openEnvelope: (envelope: HpkeEnvelope & { aad: string }) => Promise<Uint8Array>;
  /** Opens an asset DEK using reconstructed manifest AAD. */
  openSealedDek: (envelope: HpkeEnvelope, aad: Uint8Array) => Promise<Uint8Array>;
};

export type EncryptedExecutionOutput = {
  algorithm: 'AES-256-GCM';
  nonce: string;
  aad: Record<string, unknown>;
  ciphertext: string;
  ciphertextSha256: string;
  outputId?: string;
};

export type ExecutionOutputEnvelope = HpkeEnvelope & {
  /** AAD is encoded by CipherGPU as base64url for the ODK envelope. */
  aad: string;
};

export type ConfidentialTaskOutput = {
  encryptedOutput: EncryptedExecutionOutput;
  keyEnvelopes: ExecutionOutputEnvelope[];
  receipt: Record<string, unknown>;
};

export type DecryptEvent = {
  eventId: string;
  traceId: string;
  envelopeId: string;
  domainId: string;
  publicKeyId: string;
  publicKeyVersion: number;
  cipherHash: string;
  result: 'SUCCESS' | 'FAILED' | 'BLOCKED';
  eventType: string;
  timestamp: string;
};
