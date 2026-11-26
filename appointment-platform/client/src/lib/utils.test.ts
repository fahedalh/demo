import { describe, expect, it } from 'vitest';
import { cn, hexToRgbTriplet, initials } from './utils';

describe('utils', () => {
  it('merges tailwind classes', () => expect(cn('px-2', 'px-4')).toBe('px-4'));
  it('converts hex to rgb triplet', () => {
    expect(hexToRgbTriplet('#4f46e5')).toBe('79 70 229');
    expect(hexToRgbTriplet('nope')).toBeNull();
  });
  it('builds initials', () => expect(initials('Layla Haddad')).toBe('LH'));
});
