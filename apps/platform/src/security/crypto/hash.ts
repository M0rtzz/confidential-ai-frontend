const encoder = new TextEncoder();

export const bytesToBase64Url = (value: ArrayBuffer | Uint8Array) => {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

export const base64UrlToBytes = (value: string) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

export const toArrayBuffer = (value: Uint8Array) =>
  value.buffer.slice(
    value.byteOffset,
    value.byteOffset + value.byteLength,
  ) as ArrayBuffer;

const toBytes = async (value: ArrayBuffer | Blob | string) => {
  if (typeof value === 'string') return encoder.encode(value);
  if (value instanceof Blob) return new Uint8Array(await value.arrayBuffer());
  return new Uint8Array(value);
};

export const sha256 = async (value: ArrayBuffer | Blob | string | Uint8Array) => {
  const bytes =
    value instanceof Uint8Array
      ? value
      : await toBytes(value as ArrayBuffer | Blob | string);
  const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(bytes));
  return Array.from(new Uint8Array(digest), (item) =>
    item.toString(16).padStart(2, '0'),
  ).join('');
};

const normalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        const item = (value as Record<string, unknown>)[key];
        if (item !== undefined) result[key] = normalize(item);
        return result;
      }, {});
  }
  return value;
};

export const canonicalJson = (value: unknown) => JSON.stringify(normalize(value));

export const canonicalBytes = (value: unknown) => encoder.encode(canonicalJson(value));
