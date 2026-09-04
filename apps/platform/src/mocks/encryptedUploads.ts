export const mockEncryptedUploads = {
  validCipher: { status: 'CIPHER_READY', tampered: false },
  tamperedCipher: { status: 'INTEGRITY_FAILED', tampered: true },
  invalidEnvelope: { status: 'ENVELOPE_INVALID' },
  expiredPublicKey: { status: 'PUBLIC_KEY_EXPIRED' },
};
