import { mockPublicKeys } from '@/mocks/publicKeys';

import type { PublicKeyInfo } from './types';

export interface PublicKeyService {
  getActiveKey(domainId: string): Promise<PublicKeyInfo>;
  listKeys(domainId: string): Promise<PublicKeyInfo[]>;
}

export class MockPublicKeyService implements PublicKeyService {
  async getActiveKey(domainId: string) {
    const key = mockPublicKeys.find(
      (item) => item.domainId === domainId && item.status === 'active',
    );
    if (!key) throw new Error('可信域没有可用公钥，请求已阻断');
    if (key.expiresAt && Date.parse(key.expiresAt) <= Date.now()) {
      throw new Error('公钥已过期，无法继续加密，请重新获取最新公钥');
    }
    return key;
  }

  async listKeys(domainId: string) {
    return mockPublicKeys.filter((item) => item.domainId === domainId);
  }
}

// The control plane does not expose this endpoint yet. Keeping the adapter explicit
// prevents mock keys from being mistaken for task-bound TEKs returned by attestation.
export const publicKeyService: PublicKeyService = new MockPublicKeyService();
