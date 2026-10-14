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

    it('maps German About locations to ISO codes', () => {
        expect(parsePublicProfileText('Standort: Deutschland Mitglied seit: 2021')).toMatchObject({ seller_country: 'Germany', seller_country_code: 'DE' });
        expect(parsePublicProfileText('Standort: Schweden Mitglied seit: 2021')).toMatchObject({ seller_country: 'Sweden', seller_country_code: 'SE' });
    });

    it('parses German localized seller feedback and metrics', () => {
        expect(parsePublicProfileText('99,8% Positiv 142 Tsd. verkaufte Artikel Bewertungen der letzten 12 Monate Positiv 41.381 Neutral 62 Negativ 115 Artikel wie beschrieben 4.8 Angemessene Versandkosten 4.7 Versandzeit 4.9 Kommunikation 4.9')).toMatchObject({ items_sold: 142_000, feedback_positive_12m: 41_381, feedback_neutral_12m: 62, feedback_negative_12m: 115, rating_accurate_description: 4.8, rating_shipping_cost: 4.7, rating_shipping_speed: 4.9, rating_communication: 4.9 });
    });

    it('finds the public About tab and merges its location', () => {
        expect(findAboutUrl('<a href="/about">About eBay</a><a href="/str/store/about">About</a>', 'https://www.ebay.com/usr/seller', 'seller')).toBe('https://www.ebay.com/str/store/about');
        expect(findAboutUrl('<link rel="canonical" href="https://www.ebay.com/str/luckyvaultus">', 'https://www.ebay.com/usr/luckyvaultus', 'luckyvaultus')).toBe('https://www.ebay.com/str/luckyvaultus?_tab=about');
        const primary = parsePublicProfileText('99.9% positive 18K items sold 4.5K followers');
        const about = parsePublicProfileText('Located in: United States Member since 2020');
        expect(mergePublicProfileStats(primary, about)).toMatchObject({ items_sold: 18_000, follower_count: 4_500, seller_country_code: 'US' });
    });

    it('finds and parses public feedback score', () => {
        expect(findFeedbackUrl('<link rel="canonical" href="https://www.ebay.com/str/seller">', 'https://www.ebay.com/usr/seller', 'seller')).toBe('https://www.ebay.com/str/seller?_tab=feedback');
        expect(findFeedbackUrl('<a href="/str/seller?_tab=feedback">Feedback</a>', 'https://www.ebay.com/usr/seller', 'seller')).toBe('https://www.ebay.com/str/seller?_tab=feedback');
        expect(parsePublicProfileText('Feedback score: 12,345 99.9% positive feedback')).toMatchObject({ feedback_score: 12_345, feedback_rate: 99.9 });
        expect(parsePublicProfileText('99.9% positive feedback 18K items sold')).toMatchObject({ feedback_score: null, items_sold: 18_000 });
    });

    it('parses detailed seller feedback ratings', () => {
        const stats = parsePublicProfileText('Feedback ratings Last 12 months Positive 16,391 Neutral 37 Negative 6 Detailed seller ratings Accurate description 4.9 Reasonable shipping cost 5.0 Shipping speed 5.0 Communication 5.0');
        expect(stats).toMatchObject({ feedback_positive_12m: 16_391, feedback_neutral_12m: 37, feedback_negative_12m: 6, rating_accurate_description: 4.9, rating_shipping_cost: 5, rating_shipping_speed: 5, rating_communication: 5 });
    });
});
