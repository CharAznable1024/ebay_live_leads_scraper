import type { LiveSession } from './types.js';
const number = (value: unknown): number | null => { if (typeof value === 'number' && Number.isFinite(value)) return value; if (typeof value === 'string') { const n = Number(value.replace(/[^0-9.]/g, '')); return Number.isFinite(n) ? n : null; } return null; };
const text = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value.trim() : null;
const countryCode = (value: unknown): string | null => { const v = text(value)?.toUpperCase() ?? null; return v && /^[A-Z]{2}$/.test(v) ? v : null; };
const status = (value: unknown): LiveSession['status'] => { const v = text(value)?.toUpperCase() ?? ''; return v.includes('LIVE') && !v.includes('ENDED') ? 'LIVE' : v.includes('UPCOMING') || v.includes('SCHEDULE') ? 'UPCOMING' : v.includes('ENDED') || v.includes('REPLAY') ? 'ENDED' : 'UNKNOWN'; };
const decode = (value: string): string => value.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&nbsp;|&#160;/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
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

/**
 * Exact mapper for the public GetNextFilterFeed model observed on eBay Live:
 * feedCollectionStreamV2.feedCollection[].collection[] is a LiveEvent.
 */
export function sessionsFromEbayLiveFeed(value: unknown, sourceUrl = 'https://www.ebay.com/ebaylive/'): LiveSession[] {
  const sessions: LiveSession[] = [];
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    const event = node as Record<string, unknown>;
    if (event.__typename === 'LiveEvent' && typeof event.liveEventId === 'string' && Array.isArray(event.hosts)) {
      const eventUrl = new URL(`/ebaylive/events/${encodeURIComponent(event.liveEventId)}`, sourceUrl).toString();
      for (const rawHost of event.hosts) {
        if (!rawHost || typeof rawHost !== 'object') continue;
        const host = rawHost as Record<string, unknown>;
        const sellerProfile = host.sellerProfile && typeof host.sellerProfile === 'object' ? host.sellerProfile as Record<string, unknown> : {};
        const hostId = text(host.id ?? host.userAccountName);
        if (!hostId) continue;
        const username = text(host.userAccountName ?? sellerProfile.userAccountName ?? sellerProfile.username) ?? hostId;
        sessions.push({
          host_id: hostId,
          host_name: username,
          profile_url: text(sellerProfile.profileUrl ?? sellerProfile.storeUrl) ?? new URL(`/usr/${encodeURIComponent(username)}`, sourceUrl).toString(),
          live_url: eventUrl,
          title: text(event.title),
          status: status(event.state),
          starts_at: text(event.startTime),
          seller_country: text(sellerProfile.country ?? sellerProfile.location ?? sellerProfile.countryName),
          seller_country_code: countryCode(sellerProfile.countryCode),
          follower_count: number(sellerProfile.followerCount ?? sellerProfile.followers ?? sellerProfile.followersCount),
          category: text(event.tags),
          brand: null,
        });
      }
    }
    Object.values(event).forEach(visit);
  };
  visit(value);
  return dedupe(sessions);
}

function extractWindowObject(html: string, marker: string): Record<string, unknown> | null {
  const markerIndex = html.indexOf(marker); if (markerIndex < 0) return null;
  const start = html.indexOf('{', markerIndex + marker.length); if (start < 0) return null;
  let depth = 0; let inString = false; let escaped = false;
  for (let index = start; index < html.length; index += 1) {
    const char = html[index];
    if (inString) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') inString = false; continue; }
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) { try { return JSON.parse(html.slice(start, index + 1)) as Record<string, unknown>; } catch { return null; } }
  }
  return null;
}

export function sessionsFromApolloState(value: unknown, sourceUrl = 'https://www.ebay.com/ebaylive/'): LiveSession[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const state = value as Record<string, unknown>;
  const users = new Map<string, Record<string, unknown>>(); const tags = new Map<string, string>();
  for (const [key, raw] of Object.entries(state)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const entity = raw as Record<string, unknown>;
    if (entity.__typename === 'User' || key.startsWith('User:')) users.set(key, entity);
    if (entity.__typename === 'LiveEventTag' || key.startsWith('LiveEventTag:')) { const name = text(entity.name); if (name) tags.set(key, name); }
  }
  const sessions: LiveSession[] = [];
  for (const [key, raw] of Object.entries(state)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const event = raw as Record<string, unknown>;
    if (event.__typename !== 'LiveEvent' && !key.startsWith('LiveEvent:')) continue;
    const eventId = text(event.id) ?? key.slice('LiveEvent:'.length); if (!eventId) continue;
    const eventTags = Array.isArray(event.tags) ? event.tags.flatMap((item) => { const ref = item && typeof item === 'object' ? text((item as Record<string, unknown>).__ref) : null; return ref && tags.has(ref) ? [tags.get(ref) as string] : []; }) : [];
    const sellerCountry = event.liveCrossBorderTradeData && typeof event.liveCrossBorderTradeData === 'object' ? text((event.liveCrossBorderTradeData as Record<string, unknown>).sellerShipFromCountry) : null;
    for (const rawHost of Array.isArray(event.hosts) ? event.hosts : []) {
      const ref = rawHost && typeof rawHost === 'object' ? text((rawHost as Record<string, unknown>).__ref) : null;
      const host = ref ? users.get(ref) : rawHost && typeof rawHost === 'object' ? rawHost as Record<string, unknown> : null;
      if (!host) continue;
      const hostId = text(host.id) ?? ref?.replace(/^User:/, '') ?? null; const username = text(host.userAccountName) ?? hostId; if (!hostId || !username) continue;
      const sellerProfile = host.sellerProfile && typeof host.sellerProfile === 'object' ? host.sellerProfile as Record<string, unknown> : {};
      sessions.push({ host_id: hostId, host_name: username, profile_url: new URL(`/usr/${encodeURIComponent(username)}`, sourceUrl).toString(), live_url: new URL(`/ebaylive/events/${encodeURIComponent(eventId)}`, sourceUrl).toString(), title: text(event.title), status: status(event.state), starts_at: text(event.startTime), seller_country: sellerCountry, seller_country_code: countryCode(sellerCountry), follower_count: number(sellerProfile.followerCount ?? sellerProfile.followersCount), category: eventTags[0] ?? null, brand: null });
    }
  }
  return dedupe(sessions);
}

function sessionsFromCards(html: string, sourceUrl: string): LiveSession[] {
  const sessions: LiveSession[] = [];
  for (const match of html.matchAll(/<section\b[^>]*>([\s\S]*?)<\/section>/gi)) {
    const section = match[1]; const event = section.match(/href=["']([^"']*\/ebaylive\/events\/([^/"'?]+)(?:\/stream)?)["']/i); const seller = section.match(/href=["'][^"']*\/ebaylive\/sellers\/([^"'/?]+)["'][^>]*[\s\S]*?<span\b[^>]*class=["'][^"']*username[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
    if (!event || !seller) continue;
    const title = section.match(/<h3\b[^>]*title=["']([^"']+)["']/i)?.[1] ?? null; const pill = section.match(/data-testid=["']event-item-pill["'][^>]*[\s\S]{0,300}?title=["']([^"']+)["']/i)?.[1] ?? '';
    const category = section.match(/<li\b[^>]*class=["'][^"']*tag[^"']*["'][^>]*>([\s\S]*?)<\/li>/i)?.[1] ?? null;
    sessions.push({ host_id: seller[1], host_name: decode(seller[2]), profile_url: new URL(`/usr/${encodeURIComponent(decode(seller[2]))}`, sourceUrl).toString(), live_url: new URL(event[1], sourceUrl).toString().replace(/\/stream(?:\?.*)?$/, ''), title: title ? decode(title) : null, status: status(pill), starts_at: null, seller_country: null, seller_country_code: null, follower_count: null, category: category ? decode(category) : null, brand: null });
  }
  return dedupe(sessions);
}

export function sessionsFromUnlockedHtml(html: string, sourceUrl: string): LiveSession[] {
  const apollo = extractWindowObject(html, 'window.__APOLLO_DATA__=');
  const structured = sessionsFromApolloState(apollo, sourceUrl);
  return structured.length ? structured : sessionsFromCards(html, sourceUrl);
}
function dedupe(items: LiveSession[]): LiveSession[] { return [...new Map(items.map((x) => [`${x.host_id}:${x.live_url}`, x])).values()]; }
