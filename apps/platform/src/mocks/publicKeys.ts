import type { PublicKeyInfo } from '@/security/crypto';

export const mockPublicKeys: PublicKeyInfo[] = [
  {
    keyId: 'a100-domain-a-v1',
    domainId: 'a100-domain-a',
    version: 1,
    algorithm: 'HPKE-Base-X25519-HKDF-SHA256-AES-256-GCM',
    fingerprint:
      'SHA256:300c9c9603b92a4b39ed3958bf9240114804db4fd373012c0ca47432d63425ae',
    publicKey: 'hSDwCYkwp1R0i33ctD73Wg2_Og0mOBr066SpjqqbTmo',
    status: 'recycled',
  },
  {
    keyId: 'a100-domain-a-v2',
    domainId: 'a100-domain-a',
    version: 2,
    algorithm: 'HPKE-Base-X25519-HKDF-SHA256-AES-256-GCM',
    fingerprint:
      'SHA256:f35e5616160a30bf3c6e79fa73c576d40205e8fc3ba4e1c6dcf93e6b98e857b4',
    publicKey: '3p7bfXt9wbTTW2HC7OQ1Nz-DQ8hbeGdNrfx-FG-IK08',
    status: 'active',
    expiresAt: '2027-09-01T00:00:00Z',
  },
  {
    keyId: 'a100-domain-b-v1',
    domainId: 'a100-domain-b',
    version: 1,
    algorithm: 'HPKE-Base-X25519-HKDF-SHA256-AES-256-GCM',
    fingerprint:
      'SHA256:34ec81dbdaf9148567dc4254f93852d34f96e78ddd4bd04c1c8a1641a0883b2b',
    publicKey: 'CQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    status: 'active',
    expiresAt: '2027-09-01T00:00:00Z',
  },
  {
    keyId: 'a100-domain-c-v1',
    domainId: 'a100-domain-c',
    version: 1,
    algorithm: 'HPKE-Base-X25519-HKDF-SHA256-AES-256-GCM',
    fingerprint: 'SHA256:blocked',
    publicKey: 'hSDwCYkwp1R0i33ctD73Wg2_Og0mOBr066SpjqqbTmo',
    status: 'revoked',
  },
];
