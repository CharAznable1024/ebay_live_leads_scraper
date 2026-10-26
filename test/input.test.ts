import { describe, expect, it } from 'vitest';

import { normalizeInput } from '../src/input.js';

describe('country filter input', () => {
    it('expands EU into concrete member-state ISO codes', () => {
        const input = normalizeInput({ campaignId: 'cmp_100', shardId: 'shd_live_01', sellerCountries: ['EU', 'CH'] });
        expect(input.campaignId).toBe('cmp_100');
        expect(input.shardId).toBe('shd_live_01');
        expect(input.sellerCountries).toEqual(expect.arrayContaining(['SE', 'DE', 'FR', 'CH']));
        expect(input.sellerCountries).not.toContain('EU');
        expect(input.sellerCountries).toHaveLength(28);
    });

    it('validates Aime identifiers', () => {
        expect(normalizeInput({}).campaignId).toBeNull();
        expect(() => normalizeInput({ shardId: 'bad id' })).toThrow(/shardId/);
    });

    it('rejects country filters that are neither ISO codes nor EU', () => {
        expect(() => normalizeInput({ sellerCountries: ['EUROPE'] })).toThrow('ISO alpha-2 codes or EU');
    });
});
