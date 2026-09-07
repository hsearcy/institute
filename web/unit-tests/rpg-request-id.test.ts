import { expect, test } from 'bun:test';
import { newRequestId } from '../src/rpg/requestId';

test('HTTP fallback uses random bytes with UUID version and variant bits', () => {
  const source = { getRandomValues: ((bytes: Uint8Array) => { bytes.set(Array.from({ length: 16 }, (_, i) => i * 17)); return bytes; }) as Crypto['getRandomValues'] };
  expect(newRequestId(source)).toBe('00112233-4455-4677-8899-aabbccddeeff');
});

test('new purchases get independent receipt keys on HTTP and secure contexts', () => {
  const source = { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) };
  const ids = Array.from({ length: 100 }, () => newRequestId(source));
  expect(new Set(ids).size).toBe(100);
  for (const id of [...ids, newRequestId()]) expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
});
