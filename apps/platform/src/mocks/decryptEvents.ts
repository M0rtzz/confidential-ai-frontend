import type { DecryptEvent } from '@/security/crypto';

export const mockDecryptEvents: DecryptEvent[] = [
  {
    eventId: 'evt-match-a',
    traceId: 'trace-match-a',
    envelopeId: 'env-match-a',
    domainId: 'a100-domain-a',
    publicKeyId: 'a100-domain-a-v2',
    publicKeyVersion: 2,
    cipherHash: 'b1f3d88f1f8e0f23',
    result: 'SUCCESS',
    eventType: 'KEY_MATCH_SUCCESS',
    timestamp: '2026-09-01T10:20:00Z',
  },
  {
    eventId: 'evt-mismatch-b',
    traceId: 'trace-mismatch-b',
    envelopeId: 'env-mismatch-b',
    domainId: 'a100-domain-b',
    publicKeyId: 'a100-domain-a-v2',
    publicKeyVersion: 2,
    cipherHash: '36f49e5cb0ad1158',
    result: 'BLOCKED',
    eventType: 'KEY_MATCH_FAILED',
    timestamp: '2026-09-01T10:18:00Z',
  },
];
