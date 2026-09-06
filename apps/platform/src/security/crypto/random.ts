const requireBrowserCrypto = () => {
  if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.subtle) {
    throw new Error('当前访问环境不支持 Web Crypto，请使用 HTTPS 或受支持的浏览器');
  }
  if (typeof globalThis.crypto.getRandomValues !== 'function') {
    throw new Error('当前浏览器不支持安全随机数，无法执行加密操作');
  }
  return globalThis.crypto;
};

export const assertCryptoAvailable = () => void requireBrowserCrypto();

export const randomId = (prefix: string) => {
  const browserCrypto = requireBrowserCrypto();
  if (typeof browserCrypto.randomUUID === 'function') {
    return `${prefix}_${browserCrypto.randomUUID().replace(/-/g, '')}`;
  }
  const bytes = browserCrypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return `${prefix}_${Array.from(bytes, (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('')}`;
};
