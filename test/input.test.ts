import { describe, expect, it } from 'vitest';

import { normalizeInput } from '../src/input.js';

describe('country filter input', () => {
    it('expands EU into concrete member-state ISO codes', () => {
        const input = normalizeInput({ sellerCountries: ['EU', 'CH'] });
        expect(input.sellerCountries).toEqual(expect.arrayContaining(['SE', 'DE', 'FR', 'CH']));
        expect(input.sellerCountries).not.toContain('EU');
        expect(input.sellerCountries).toHaveLength(28);
    });

    it('rejects country filters that are neither ISO codes nor EU', () => {
        expect(() => normalizeInput({ sellerCountries: ['EUROPE'] })).toThrow('ISO alpha-2 codes or EU');
    });
});
