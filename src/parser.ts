import type { LiveSession } from './types.js';
const number = (value: unknown): number | null => { if (typeof value === 'number' && Number.isFinite(value)) return value; if (typeof value === 'string') { const n = Number(value.replace(/[^0-9.]/g, '')); return Number.isFinite(n) ? n : null; } return null; };
const text = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value.trim() : null;
const countryCode = (value: unknown): string | null => { const v = text(value)?.toUpperCase() ?? null; return v && /^[A-Z]{2}$/.test(v) ? v : null; };
const status = (value: unknown): LiveSession['status'] => { const v = text(value)?.toUpperCase() ?? ''; return v.includes('LIVE') && !v.includes('ENDED') ? 'LIVE' : v.includes('UPCOMING') || v.includes('SCHEDULE') ? 'UPCOMING' : v.includes('ENDED') || v.includes('REPLAY') ? 'ENDED' : 'UNKNOWN'; };
export function sessionsFromJson(value: unknown, sourceUrl: string): LiveSession[] {
  const sessions: LiveSession[] = []; const visit = (node: unknown) => { if (!node || typeof node !== 'object') return; if (Array.isArray(node)) { node.forEach(visit); return; } const r = node as Record<string, unknown>;
    const host = r.host ?? r.seller ?? r.creator ?? r.channel ?? r.streamer ?? r.broadcaster ?? r.hostUser;
    const hostRecord = host && typeof host === 'object' ? host as Record<string, unknown> : r;
    const hostId = text(hostRecord.id ?? hostRecord.userId ?? hostRecord.username ?? r.hostId ?? r.sellerId); const hostName = text(hostRecord.displayName ?? hostRecord.name ?? hostRecord.username ?? r.hostName ?? r.sellerName);
    const liveUrl = text(r.url ?? r.liveUrl ?? r.eventUrl ?? r.shareUrl); const profileUrl = text(hostRecord.profileUrl ?? hostRecord.storeUrl ?? hostRecord.url) ?? (hostId ? `https://www.ebay.com/usr/${encodeURIComponent(hostId)}` : null);
    const liveContext = Boolean(r.liveEvent ?? r.liveSession ?? r.stream ?? r.broadcast ?? r.eventId ?? r.liveEventId) || /live|upcoming|ended|replay/i.test(text(r.status ?? r.liveStatus ?? r.eventStatus) ?? '');
    const hasExplicitLiveIdentity = ((host && typeof host === 'object') || Boolean(r.hostId ?? r.sellerId ?? r.creatorId ?? r.channelId)) && liveContext;
    if (hostId && hasExplicitLiveIdentity && (liveUrl || r.status || r.liveStatus) && profileUrl) sessions.push({ host_id: hostId, host_name: hostName, profile_url: profileUrl, live_url: liveUrl ?? sourceUrl, title: text(r.title ?? r.name), status: status(r.status ?? r.liveStatus), starts_at: text(r.startTime ?? r.startsAt ?? r.scheduledStartTime), seller_country: text(hostRecord.country ?? hostRecord.location ?? r.country), seller_country_code: countryCode(hostRecord.countryCode ?? r.countryCode), follower_count: number(hostRecord.followerCount ?? hostRecord.followers ?? r.followerCount), category: text(r.categoryName ?? r.category), brand: text(r.brandName ?? r.brand) });
    Object.values(r).forEach(visit);
  }; visit(value); return dedupe(sessions);
}
function dedupe(items: LiveSession[]): LiveSession[] { return [...new Map(items.map((x) => [`${x.host_id}:${x.live_url}`, x])).values()]; }
