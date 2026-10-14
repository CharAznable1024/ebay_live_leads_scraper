import type { PublicProfileStats } from './types.js';

const COUNTRY_CODES: Record<string, string> = {
    'united states': 'US', usa: 'US', 'united kingdom': 'GB', uk: 'GB', england: 'GB',
    germany: 'DE', deutschland: 'DE', canada: 'CA', australia: 'AU', france: 'FR',
    italy: 'IT', spain: 'ES', japan: 'JP', china: 'CN',
};

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
    const location = text.match(/(?:located in|location|所在地|位于)\s*[:：]?\s*([^|•\n]{2,100})/i)?.[1]?.trim() ?? null;
    return {
        feedback_rate: feedbackRate !== null && Number.isFinite(feedbackRate) ? feedbackRate : null,
        feedback_score: matchNumber(text, [/(?:feedback\s*(?:score)?|信用评价)\s*[:：]?\s*([\d.,]+\s*[KMB万]?)/i, /\(([\d.,]+\s*[KMB万]?)\)\s*[\d.]+\s*%\s*(?:positive|好评率)/i]),
        items_sold: matchNumber(text, [/([\d.,]+\s*[KMB万]?)\s*(?:items?\s*sold|件物品)/i, /(?:sold|已售出)\s*([\d.,]+\s*[KMB万]?)/i]),
        items_listed: matchNumber(text, [/(?:for sale|在售|选购)\s*([\d.,]+\s*[KMB万]?)/i, /([\d.,]+\s*[KMB万]?)\s*(?:items?\s*for sale|件在售)/i]),
        follower_count: matchNumber(text, [/(?:followers?|关注者)\s*([\d.,]+\s*[KMB万]?)/i, /([\d.,]+\s*[KMB万]?)\s*(?:followers?|位关注者)/i]),
        seller_country: location,
        seller_country_code: countryCode(location),
        stats_source: 'seller_profile',
    };
}

export function findFeedbackUrl(html: string, profileUrl: string, username: string): string {
    const anchor = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    for (const match of html.matchAll(anchor)) {
        const href = match[1].replace(/&amp;/gi, '&');
        const label = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (/feedback|信用评价/i.test(label) || /\/fdbk\/feedback_profile\//i.test(href)) return new URL(href, profileUrl).toString();
    }
    return `https://www.ebay.com/fdbk/feedback_profile/${encodeURIComponent(username)}`;
}

/** Finds the public About tab URL rendered in an eBay Store profile. */
export function findAboutUrl(html: string, profileUrl: string, username: string): string {
    const anchor = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    for (const match of html.matchAll(anchor)) {
        const href = match[1].replace(/&amp;/gi, '&');
        const label = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (/\babout\b|关于/i.test(label) || /(?:\/about(?:[/?#]|$)|[?&#](?:tab|_tab)=about)/i.test(href)) {
            return new URL(href, profileUrl).toString();
        }
    }
    const canonical = html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1]
        ?? html.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["']/i)?.[1];
    if (canonical && /\/str\//i.test(canonical)) return `${canonical.replace(/\/$/, '')}/about`;
    return `https://www.ebay.com/str/${encodeURIComponent(username)}/about`;
}

export function mergePublicProfileStats(primary: PublicProfileStats, about: PublicProfileStats): PublicProfileStats {
    return {
        feedback_rate: primary.feedback_rate ?? about.feedback_rate,
        feedback_score: primary.feedback_score ?? about.feedback_score,
        items_sold: primary.items_sold ?? about.items_sold,
        items_listed: primary.items_listed ?? about.items_listed,
        follower_count: primary.follower_count ?? about.follower_count,
        seller_country: about.seller_country ?? primary.seller_country,
        seller_country_code: about.seller_country_code ?? primary.seller_country_code,
        stats_source: 'seller_profile',
    };
}
