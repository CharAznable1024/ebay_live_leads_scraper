import { describe, expect, it } from 'vitest';

import { findAboutUrl, findFeedbackUrl, mergePublicProfileStats, parsePublicProfileText } from '../src/profile.js';

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

    it('rejects prose containing the word location when no country is present', () => {
        expect(parsePublicProfileText('location of the company. Extended shipping duration')).toMatchObject({ seller_country: null, seller_country_code: null });
    });

    it('maps localized Chinese About locations to ISO codes', () => {
        expect(parsePublicProfileText('所在地：美国 注册时间：2023 年 10 月 08 日')).toMatchObject({ seller_country: 'United States', seller_country_code: 'US' });
        expect(parsePublicProfileText('所在地：瑞典 注册时间：2009 年 05 月 04 日')).toMatchObject({ seller_country: 'Sweden', seller_country_code: 'SE' });
    });

    it('finds the public About tab and merges its location', () => {
        expect(findAboutUrl('<a href="/about">About eBay</a><a href="/str/store/about">About</a>', 'https://www.ebay.com/usr/seller', 'seller')).toBe('https://www.ebay.com/str/store/about');
        const primary = parsePublicProfileText('99.9% positive 18K items sold 4.5K followers');
        const about = parsePublicProfileText('Located in: United States Member since 2020');
        expect(mergePublicProfileStats(primary, about)).toMatchObject({ items_sold: 18_000, follower_count: 4_500, seller_country_code: 'US' });
    });

    it('finds and parses public feedback score', () => {
        expect(findFeedbackUrl('<a href="/fdbk/feedback_profile/seller">Feedback</a>', 'https://www.ebay.com/usr/seller', 'seller')).toBe('https://www.ebay.com/fdbk/feedback_profile/seller');
        expect(parsePublicProfileText('Feedback score: 12,345 99.9% positive feedback')).toMatchObject({ feedback_score: 12_345, feedback_rate: 99.9 });
        expect(parsePublicProfileText('99.9% positive feedback 18K items sold')).toMatchObject({ feedback_score: null, items_sold: 18_000 });
    });
});
