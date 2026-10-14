import type { PublicProfileStats } from './types.js';

const COUNTRY_CODES: Record<string, string> = {
    'united states': 'US', usa: 'US', 'united kingdom': 'GB', uk: 'GB', england: 'GB',
    germany: 'DE', deutschland: 'DE', canada: 'CA', australia: 'AU', france: 'FR',
    italy: 'IT', spain: 'ES', japan: 'JP', china: 'CN',
    sweden: 'SE', switzerland: 'CH', netherlands: 'NL', belgium: 'BE', austria: 'AT',
    denmark: 'DK', norway: 'NO', finland: 'FI', ireland: 'IE', portugal: 'PT',
    poland: 'PL', singapore: 'SG', 'hong kong': 'HK', taiwan: 'TW', korea: 'KR',
    美国: 'US', 英国: 'GB', 德国: 'DE', 加拿大: 'CA', 澳大利亚: 'AU', 法国: 'FR',
    意大利: 'IT', 西班牙: 'ES', 日本: 'JP', 中国: 'CN', 瑞典: 'SE', 瑞士: 'CH',
    荷兰: 'NL', 比利时: 'BE', 奥地利: 'AT', 丹麦: 'DK', 挪威: 'NO', 芬兰: 'FI',
    爱尔兰: 'IE', 葡萄牙: 'PT', 波兰: 'PL', 新加坡: 'SG', 香港: 'HK', 台湾: 'TW', 韩国: 'KR',
};
const COUNTRY_NAMES: Record<string, string> = { US: 'United States', GB: 'United Kingdom', DE: 'Germany', CA: 'Canada', AU: 'Australia', FR: 'France', IT: 'Italy', ES: 'Spain', JP: 'Japan', CN: 'China', SE: 'Sweden', CH: 'Switzerland', NL: 'Netherlands', BE: 'Belgium', AT: 'Austria', DK: 'Denmark', NO: 'Norway', FI: 'Finland', IE: 'Ireland', PT: 'Portugal', PL: 'Poland', SG: 'Singapore', HK: 'Hong Kong', TW: 'Taiwan', KR: 'South Korea' };

function compactNumber(raw: string): number | null {
    const normalized = raw.trim().replace(/,/g, '');
    const match = normalized.match(/([\d.]+)\s*(K|M|B|万)?/i);
    if (!match) return null;
    const value = Number(match[1]);
    if (!Number.isFinite(value)) return null;
    const multiplier = match[2]?.toUpperCase() === 'K' ? 1_000
        : match[2]?.toUpperCase() === 'M' ? 1_000_000
            : match[2]?.toUpperCase() === 'B' ? 1_000_000_000
                : match[2] === '万' ? 10_000 : 1;
    return Math.round(value * multiplier);
}

function matchNumber(text: string, expressions: RegExp[]): number | null {
    for (const expression of expressions) {
        const value = text.match(expression)?.[1];
        if (value) return compactNumber(value);
    }
    return null;
}

function matchDecimal(text: string, expressions: RegExp[]): number | null {
    for (const expression of expressions) {
        const raw = text.match(expression)?.[1];
        if (raw) { const value = Number(raw); if (Number.isFinite(value)) return value; }
    }
    return null;
}

function countryCode(location: string | null): string | null {
    if (!location) return null;
    const lower = location.toLowerCase();
    for (const [country, code] of Object.entries(COUNTRY_CODES)) if (lower.includes(country)) return code;
    return location.match(/\b(US|GB|DE|AU|CA|FR|IT|ES|JP|CN)\b/i)?.[1]?.toUpperCase() ?? null;
}

/** Parses public text shown on an eBay seller profile, including localized UI. */
export function parsePublicProfileText(bodyText: string): PublicProfileStats {
    const text = bodyText.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ');
    const feedbackRateText = text.match(/([\d.]+)\s*%\s*(?:positive|好评率)/i)?.[1];
    const feedbackRate = feedbackRateText ? Number(feedbackRateText) : null;
    const rawLocation = text.match(/(?:located in|location|所在地|位于)\s*[:：]?\s*([^|•\n]{2,100})/i)?.[1]?.trim() ?? null;
    const locationCode = countryCode(rawLocation);
    return {
        feedback_rate: feedbackRate !== null && Number.isFinite(feedbackRate) ? feedbackRate : null,
        feedback_score: matchNumber(text, [/(?:feedback\s*score|信用评价)\s*[:：]\s*([\d.,]+\s*[KMB万]?)/i, /feedback\s*\(([\d.,]+\s*[KMB万]?)\)/i, /([\d.,]+\s*[KMB万]?)\s+feedback\s+ratings?/i, /\(([\d.,]+\s*[KMB万]?)\)\s*[\d.]+\s*%\s*(?:positive|好评率)/i]),
        feedback_positive_12m: matchNumber(text, [/(?:Positive|好评)\s*([\d,]+)/i]),
        feedback_neutral_12m: matchNumber(text, [/(?:Neutral|中评)\s*([\d,]+)/i]),
        feedback_negative_12m: matchNumber(text, [/(?:Negative|差评)\s*([\d,]+)/i]),
        rating_accurate_description: matchDecimal(text, [/(?:Accurate description|描述准确性)\s*([\d.]+)/i]),
        rating_shipping_cost: matchDecimal(text, [/(?:Reasonable shipping cost|合理的运费)\s*([\d.]+)/i]),
        rating_shipping_speed: matchDecimal(text, [/(?:Shipping speed|发货速度)\s*([\d.]+)/i]),
        rating_communication: matchDecimal(text, [/(?:Communication|沟通)\s*([\d.]+)/i]),
        items_sold: matchNumber(text, [/([\d.,]+\s*[KMB万]?)\s*(?:items?\s*sold|件物品)/i, /(?:sold|已售出)\s*([\d.,]+\s*[KMB万]?)/i]),
        items_listed: matchNumber(text, [/(?:for sale|在售|选购)\s*([\d.,]+\s*[KMB万]?)/i, /([\d.,]+\s*[KMB万]?)\s*(?:items?\s*for sale|件在售)/i]),
        follower_count: matchNumber(text, [/(?:followers?|关注者)\s*([\d.,]+\s*[KMB万]?)/i, /([\d.,]+\s*[KMB万]?)\s*(?:followers?|位关注者)/i]),
        seller_country: locationCode ? COUNTRY_NAMES[locationCode] ?? rawLocation : null,
        seller_country_code: locationCode,
        stats_source: 'seller_profile',
    };
}

export function findFeedbackUrl(html: string, profileUrl: string, username: string): string {
    const anchor = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    for (const match of html.matchAll(anchor)) {
        const href = match[1].replace(/&amp;/gi, '&');
        if (/\/str\/[^?#]+[?&#](?:tab|_tab)=feedback/i.test(href)) return new URL(href, profileUrl).toString();
    }
    const canonical = html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1]
        ?? html.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["']/i)?.[1];
    const storefront = canonical && /\/str\/[^/?#]+/i.test(canonical)
        ? new URL(canonical, profileUrl).toString()
        : `https://www.ebay.com/str/${encodeURIComponent(username)}`;
    const feedback = new URL(storefront);
    feedback.searchParams.set('_tab', 'feedback');
    return feedback.toString();
}

/** Resolves the public Store About tab URL used by eBay storefronts. */
export function findAboutUrl(html: string, profileUrl: string, username: string): string {
    const anchor = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    for (const match of html.matchAll(anchor)) {
        const href = match[1].replace(/&amp;/gi, '&');
        const label = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const storeAboutHref = /\/str\/[^/?#]+\/about(?:[/?#]|$)|\/str\/[^?#]+[?&#](?:tab|_tab)=about/i.test(href);
        const storeAboutLabel = /\babout\b|关于/i.test(label) && /\/str\//i.test(href);
        if (storeAboutHref || storeAboutLabel) {
            return new URL(href, profileUrl).toString();
        }
    }
    const canonical = html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1]
        ?? html.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["']/i)?.[1];
    const storefront = canonical && /\/str\/[^/?#]+/i.test(canonical)
        ? new URL(canonical, profileUrl).toString()
        : `https://www.ebay.com/str/${encodeURIComponent(username)}`;
    const about = new URL(storefront);
    about.searchParams.set('_tab', 'about');
    return about.toString();
}

export function mergePublicProfileStats(primary: PublicProfileStats, about: PublicProfileStats): PublicProfileStats {
    return {
        feedback_rate: primary.feedback_rate ?? about.feedback_rate,
        feedback_score: primary.feedback_score ?? about.feedback_score,
        feedback_positive_12m: primary.feedback_positive_12m ?? about.feedback_positive_12m,
        feedback_neutral_12m: primary.feedback_neutral_12m ?? about.feedback_neutral_12m,
        feedback_negative_12m: primary.feedback_negative_12m ?? about.feedback_negative_12m,
        rating_accurate_description: primary.rating_accurate_description ?? about.rating_accurate_description,
        rating_shipping_cost: primary.rating_shipping_cost ?? about.rating_shipping_cost,
        rating_shipping_speed: primary.rating_shipping_speed ?? about.rating_shipping_speed,
        rating_communication: primary.rating_communication ?? about.rating_communication,
        items_sold: primary.items_sold ?? about.items_sold,
        items_listed: primary.items_listed ?? about.items_listed,
        follower_count: primary.follower_count ?? about.follower_count,
        seller_country: about.seller_country ?? primary.seller_country,
        seller_country_code: about.seller_country_code ?? primary.seller_country_code,
        stats_source: 'seller_profile',
    };
}
