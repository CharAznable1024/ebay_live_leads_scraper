import { describe, expect, it } from 'vitest';

import { parsePublicProfileText } from '../src/profile.js';

describe('public eBay seller profile parser', () => {
    it('parses English public seller metrics and location', () => {
        expect(parsePublicProfileText('99.9% positive feedback 18.4K items sold 4,490 followers Located in London, United Kingdom')).toMatchObject({
            feedback_rate: 99.9,
            items_sold: 18_400,
            follower_count: 4_490,
            seller_country_code: 'GB',
        });
    });

    it('parses localized public seller metrics', () => {
        expect(parsePublicProfileText('99.9% 好评率 已售出 1.84 万 件物品 4,490 位关注者 所在地：United States')).toMatchObject({
            items_sold: 18_400,
            follower_count: 4_490,
            seller_country_code: 'US',
        });
    });
});
