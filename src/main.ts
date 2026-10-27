import { PlaywrightCrawler } from '@crawlee/playwright';
import { Actor, log } from 'apify';

import { fetchWithWebUnlocker, htmlToVisibleText, inspectUnlockedHtml } from './bright-data.js';
import { captureGraphqlResponse, inspectGraphqlResponse, inspectLiveFeedShapes, inspectSellerProfileShapes, type GraphqlCapture } from './graphql.js';
import { MARKETPLACE_BASE_URLS, normalizeInput } from './input.js';
import { sessionsFromEbayLiveFeed, sessionsFromJson, sessionsFromUnlockedHtml } from './parser.js';
import { findAboutUrl, findFeedbackUrl, mergePublicProfileStats, parsePublicProfileText } from './profile.js';
import type { ActorInput, Lead, LiveSession, PublicProfileStats } from './types.js';

await Actor.init();

const input = normalizeInput(await Actor.getInput<ActorInput>());
const runId = process.env.APIFY_ACTOR_RUN_ID?.trim() || process.env.ACTOR_RUN_ID?.trim() || 'local';
const datasetId = process.env.APIFY_DEFAULT_DATASET_ID?.trim() || process.env.ACTOR_DEFAULT_DATASET_ID?.trim() || 'default';
const sessions = new Map<string, LiveSession>();
const profileStats = new Map<string, PublicProfileStats>();
const failedSources: string[] = [];
const failedProfiles: string[] = [];
let aboutEnrichmentAttempted = 0;
let aboutEnrichmentSucceeded = 0;
let feedbackEnrichmentAttempted = 0;
let feedbackEnrichmentSucceeded = 0;
const graphqlCaptures = new Map<string, Promise<GraphqlCapture | null>[]>();
const marketplaceBaseUrl = MARKETPLACE_BASE_URLS[input.country];
const defaultUrl = `${marketplaceBaseUrl}/ebaylive/`;
const sourceUrls = input.startUrls.length ? input.startUrls : [defaultUrl];
const sources = [
    ...sourceUrls.map((url) => ({ url, userData: { source: url } })),
    ...input.searchQueries.map((query) => ({ url: defaultUrl, uniqueKey: `query:${query}`, userData: { source: query } })),
];
const requestKey = (request: { id?: string; uniqueKey: string }) => request.id ?? request.uniqueKey;
const wantsProxy = input.proxyConfiguration.useApifyProxy || input.proxyConfiguration.proxyUrls;
const proxyConfiguration = wantsProxy ? await Actor.createProxyConfiguration(input.proxyConfiguration) : undefined;
const brightDataApiKey = process.env.BRIGHT_DATA_API_KEY?.trim();
const brightDataZone = process.env.BRIGHT_DATA_ZONE?.trim() || 'web_unlocker1';
const useBrightData = input.enrichProfiles
    && input.profileEnrichmentMode !== 'direct'
    && Boolean(brightDataApiKey);
if (input.profileEnrichmentMode === 'bright_data' && !brightDataApiKey) {
    throw new Error('profileEnrichmentMode is bright_data, but BRIGHT_DATA_API_KEY is not configured');
}

const discoveryCrawler = new PlaywrightCrawler({
    maxConcurrency: input.maxConcurrency,
    maxRequestRetries: input.maxRequestRetries,
    navigationTimeoutSecs: input.navigationTimeoutSecs,
    requestHandlerTimeoutSecs: input.navigationTimeoutSecs + 30,
    proxyConfiguration,
    preNavigationHooks: [async ({ page, request }) => {
        const captures: Promise<GraphqlCapture | null>[] = [];
        page.on('response', (response) => {
            if (!/\/d\/graphql(?:\?|$)/i.test(response.url())) return;
            captures.push(captureGraphqlResponse(response).catch(() => null));
        });
        graphqlCaptures.set(requestKey(request), captures);
    }],
    requestHandler: async ({ page, request }) => {
        // The initial feed is sometimes requested only after the page becomes
        // interactive. Scroll through enough public cards to trigger bounded
        // GetNextFilterFeed pagination before collecting captured responses.
        const scrollRounds = Math.min(10, Math.max(1, Math.ceil(input.maxLiveSessions / 10)));
        for (let round = 0; round < scrollRounds; round += 1) {
            await page.waitForTimeout(round === 0 ? 3_000 : 1_500);
            await page.evaluate(() => window.scrollBy(0, window.innerHeight * 3));
        }
        const graphql = (await Promise.all(graphqlCaptures.get(requestKey(request)) ?? []))
            .filter((item): item is GraphqlCapture => item !== null);
        const scripts = await page.locator('script[type="application/ld+json"],script#__NEXT_DATA__').allTextContents();
        const discovered = [
            ...scripts.flatMap((json) => { try { return sessionsFromJson(JSON.parse(json), request.loadedUrl ?? request.url); } catch { return []; } }),
            ...graphql.flatMap((capture) => sessionsFromEbayLiveFeed(capture.response, request.loadedUrl ?? request.url)),
        ].slice(0, input.maxLiveSessions);
        if (!discovered.length && brightDataApiKey) {
            try {
                const unlocked = await fetchWithWebUnlocker(request.loadedUrl ?? request.url, {
                    apiKey: brightDataApiKey,
                    zone: brightDataZone,
                    country: input.country,
                    timeoutMillis: Math.max(90_000, input.navigationTimeoutSecs * 1_000),
                    maxAttempts: input.maxRequestRetries + 1,
                    render: false,
                });
                discovered.push(...sessionsFromUnlockedHtml(unlocked.html, request.loadedUrl ?? request.url).slice(0, input.maxLiveSessions));
                log.info('Recovered eBay Live discovery from unlocked static HTML', { source: request.userData.source, sessions: discovered.length });
            } catch (error) {
                log.warning('eBay Live discovery fallback failed', { source: request.userData.source, error: String(error) });
            }
        }
        for (const session of discovered) {
            if (!input.includeEndedLives && session.status === 'ENDED') continue;
            sessions.set(`${session.host_id}:${session.live_url}`, session);
        }
        const operations = graphql.map((capture) => ({
            operation_name: capture.operation_name,
            variable_keys: capture.variable_keys,
            signals: inspectGraphqlResponse(capture.response),
            live_feed_shapes: inspectLiveFeedShapes(capture.response),
            seller_profile_shapes: inspectSellerProfileShapes(capture.response),
        }));
        await Actor.setValue(`GRAPHQL_${request.id ?? request.uniqueKey}`, operations);
        log.info('Processed eBay Live discovery source', { source: request.userData.source, graphqlResponses: graphql.length, sessions: sessions.size });
    },
    failedRequestHandler: ({ request }) => {
        failedSources.push(request.url);
        graphqlCaptures.delete(requestKey(request));
    },
});

await discoveryCrawler.run(sources);

for (const username of input.sellerUsernames) {
    sessions.set(`seed:${username}`, {
        host_id: username,
        host_name: username,
        profile_url: `${marketplaceBaseUrl}/usr/${encodeURIComponent(username)}`,
        live_url: defaultUrl,
        title: null,
        status: 'UNKNOWN',
        starts_at: null,
        seller_country: null,
        seller_country_code: null,
        follower_count: null,
        category: null,
        brand: null,
    });
}

const grouped = new Map<string, LiveSession[]>();
for (const session of sessions.values()) {
    const group = grouped.get(session.host_id) ?? [];
    group.push(session);
    grouped.set(session.host_id, group);
}

const seedHostIds = new Set(input.sellerUsernames.map((username) => username.toLowerCase()));
const countryEligibleGroups = [...grouped.values()].filter((group) => {
    const discoveredCountry = group[0].seller_country_code?.toUpperCase();
    // Unknown country must be verified from the public About page. Known
    // non-matching countries can be discarded before profile enrichment.
    return !input.sellerCountries.length || !discoveredCountry || input.sellerCountries.includes(discoveredCountry);
});
const candidates = countryEligibleGroups
    // Explicit usernames are intentional enrichment targets, so do not let a
    // concurrently sampled Live card displace them when the profile limit is low.
    .sort((left, right) => {
        const leftIsSeed = seedHostIds.has(left[0].host_id.toLowerCase());
        const rightIsSeed = seedHostIds.has(right[0].host_id.toLowerCase());
        return Number(rightIsSeed) - Number(leftIsSeed) || right.length - left.length;
    })
    .slice(0, input.maxProfileEnrichmentHosts);

const scrapedAt = new Date().toISOString();
const checkpointedLeads = new Map<string, Lead>();
let profileCrawler: PlaywrightCrawler | undefined;
let checkpointQueue = Promise.resolve();

function buildLead(group: LiveSession[]): Lead {
    const first = group[0];
    const stats = profileStats.get(first.host_id);
    const followerCount = (stats?.follower_count ?? Math.max(...group.map((session) => session.follower_count ?? 0))) || null;
    const statuses = [...new Set(group.map((session) => session.status))];
    const score = Math.min(100,
        Math.round(Math.log10((stats?.items_sold ?? 0) + 1) * 18)
        + Math.round(Math.log10((followerCount ?? 0) + 1) * 18)
        + Math.min(30, group.length * 5)
        + (statuses.includes('LIVE') ? 25 : statuses.includes('UPCOMING') ? 15 : 0),
    );
    return {
        record_type: 'ebay_live_host_lead',
        schema_version: '1.2',
        platform: 'ebay_live',
        campaign_id: input.campaignId,
        shard_id: input.shardId,
        run_id: runId,
        seller_id: first.host_id,
        seller_name: first.host_name,
        seller_username: first.host_name,
        profile_url: first.profile_url,
        seller_country: stats?.seller_country ?? first.seller_country,
        seller_country_code: stats?.seller_country_code ?? first.seller_country_code,
        items_sold: stats?.items_sold ?? null,
        items_listed: stats?.items_listed ?? null,
        follower_count: followerCount,
        feedback_rate: stats?.feedback_rate ?? null,
        feedback_score: stats?.feedback_score ?? null,
        feedback_positive_12m: stats?.feedback_positive_12m ?? null,
        feedback_neutral_12m: stats?.feedback_neutral_12m ?? null,
        feedback_negative_12m: stats?.feedback_negative_12m ?? null,
        rating_accurate_description: stats?.rating_accurate_description ?? null,
        rating_shipping_cost: stats?.rating_shipping_cost ?? null,
        rating_shipping_speed: stats?.rating_shipping_speed ?? null,
        rating_communication: stats?.rating_communication ?? null,
        seller_stats_source: stats ? 'seller_profile' : 'live_event',
        live_session_count: group.length,
        next_live_at: group.filter((session) => session.status === 'UPCOMING').map((session) => session.starts_at).filter(Boolean).sort()[0] ?? null,
        categories: [...new Set(group.map((session) => session.category).filter(Boolean) as string[])].slice(0, 3),
        brands: [...new Set(group.map((session) => session.brand).filter(Boolean) as string[])],
        sample_live_urls: [...new Set(group.map((session) => session.live_url))].slice(0, 5),
        lead_score: score,
        qualification: score >= 65 ? 'high' : score >= 35 ? 'medium' : 'low',
        dedupe_status: 'new',
        scraped_at: scrapedAt,
    };
}

function qualifies(lead: Lead): boolean {
    return (lead.follower_count ?? 0) >= input.minFollowerCount
        && (!input.sellerCountries.length || (!!lead.seller_country_code && input.sellerCountries.includes(lead.seller_country_code)));
}

const output = (status: 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'ABORTED') => ({
    status,
    campaign_id: input.campaignId,
    shard_id: input.shardId,
    run_id: runId,
    dataset_id: datasetId,
    scanned_count: profileStats.size + failedProfiles.length,
    qualified_count: checkpointedLeads.size,
    next_cursor: null,
    has_more: status !== 'SUCCEEDED' && checkpointedLeads.size < input.maxSellers,
    discovered_sessions: sessions.size,
    profile_enrichment_attempted: input.enrichProfiles ? candidates.length : 0,
    profile_enrichment_provider: useBrightData ? 'bright_data_web_unlocker' : input.enrichProfiles ? 'direct_browser' : 'disabled',
    profile_enrichment_succeeded: profileStats.size,
    profile_enrichment_failed: failedProfiles.length,
    profile_about_enrichment_attempted: aboutEnrichmentAttempted,
    profile_about_enrichment_succeeded: aboutEnrichmentSucceeded,
    profile_feedback_enrichment_attempted: feedbackEnrichmentAttempted,
    profile_feedback_enrichment_succeeded: feedbackEnrichmentSucceeded,
    qualified_leads: checkpointedLeads.size,
    failed_sources: failedSources,
    scraped_at: scrapedAt,
});

async function checkpointGroupUnsafe(group: LiveSession[]): Promise<void> {
    if (checkpointedLeads.size >= input.maxSellers) return;
    const lead = buildLead(group);
    if (!qualifies(lead) || checkpointedLeads.has(lead.seller_id)) return;
    checkpointedLeads.set(lead.seller_id, lead);
    await Actor.pushData(lead);
    const progress = output('RUNNING');
    await Actor.setValue('OUTPUT', progress);
    await Actor.setValue('PROGRESS', progress);
    if (checkpointedLeads.size >= input.maxSellers) await profileCrawler?.autoscaledPool?.abort();
}

function checkpointGroup(group: LiveSession[]): Promise<void> {
    const operation = checkpointQueue.then(() => checkpointGroupUnsafe(group));
    checkpointQueue = operation.catch(() => undefined);
    return operation;
}

Actor.on('aborting', async () => {
    log.warning('Run is aborting; preserving checkpointed eBay Live leads.');
    await Actor.setValue('OUTPUT', output('ABORTED'));
    await Actor.exit();
});
await Actor.setValue('OUTPUT', output('RUNNING'));

if (useBrightData && candidates.length) {
    let nextCandidate = 0;
    const workers = Array.from({ length: Math.min(input.maxProfileConcurrency, candidates.length) }, async () => {
        while (nextCandidate < candidates.length) {
            if (checkpointedLeads.size >= input.maxSellers) break;
            const group = candidates[nextCandidate];
            nextCandidate += 1;
            const first = group[0];
            try {
                const result = await fetchWithWebUnlocker(first.profile_url, {
                    apiKey: brightDataApiKey as string,
                    zone: brightDataZone,
                    country: input.country,
                    timeoutMillis: input.navigationTimeoutSecs * 1_000,
                    maxAttempts: input.maxRequestRetries + 1,
                });
                await Actor.setValue(`UNLOCKER_DEBUG_${first.host_id}`, inspectUnlockedHtml(result.html, first.host_name ?? first.host_id, result));
                if (!result.html.trim()) throw new Error(`Web Unlocker returned an empty body with HTTP ${result.status_code}`);
                let stats = parsePublicProfileText(htmlToVisibleText(result.html));
                if (!stats.seller_country_code) {
                    aboutEnrichmentAttempted += 1;
                    const username = first.host_name ?? first.host_id;
                    const aboutUrl = findAboutUrl(result.html, first.profile_url, username);
                    try {
                        const aboutResult = await fetchWithWebUnlocker(aboutUrl, {
                            apiKey: brightDataApiKey as string,
                            zone: brightDataZone,
                            country: input.country,
                            timeoutMillis: input.navigationTimeoutSecs * 1_000,
                            maxAttempts: input.maxRequestRetries + 1,
                        });
                        await Actor.setValue(`UNLOCKER_ABOUT_DEBUG_${first.host_id}`, inspectUnlockedHtml(aboutResult.html, username, aboutResult));
                        if (!aboutResult.html.trim()) throw new Error(`Web Unlocker returned an empty About body with HTTP ${aboutResult.status_code}`);
                        const aboutStats = parsePublicProfileText(htmlToVisibleText(aboutResult.html));
                        stats = mergePublicProfileStats(stats, aboutStats);
                        if (aboutStats.seller_country || aboutStats.seller_country_code) aboutEnrichmentSucceeded += 1;
                    } catch (error) {
                        log.warning('Web Unlocker About enrichment failed', { hostId: first.host_id, aboutUrl, error: String(error) });
                    }
                }
                const needsFeedbackEnrichment = [
                    stats.feedback_score,
                    stats.feedback_positive_12m,
                    stats.feedback_neutral_12m,
                    stats.feedback_negative_12m,
                    stats.rating_accurate_description,
                    stats.rating_shipping_cost,
                    stats.rating_shipping_speed,
                    stats.rating_communication,
                ].some((value) => value === null);
                if (needsFeedbackEnrichment) {
                    feedbackEnrichmentAttempted += 1;
                    const username = first.host_name ?? first.host_id;
                    const feedbackUrl = findFeedbackUrl(result.html, first.profile_url, username);
                    try {
                        const feedbackResult = await fetchWithWebUnlocker(feedbackUrl, {
                            apiKey: brightDataApiKey as string, zone: brightDataZone, country: input.country,
                            timeoutMillis: input.navigationTimeoutSecs * 1_000,
                            maxAttempts: input.maxRequestRetries + 1,
                        });
                        await Actor.setValue(`UNLOCKER_FEEDBACK_DEBUG_${first.host_id}`, inspectUnlockedHtml(feedbackResult.html, username, feedbackResult));
                        if (!feedbackResult.html.trim()) throw new Error(`Web Unlocker returned an empty Feedback body with HTTP ${feedbackResult.status_code}`);
                        const feedbackStats = parsePublicProfileText(htmlToVisibleText(feedbackResult.html));
                        stats = mergePublicProfileStats(stats, feedbackStats);
                        if (feedbackStats.feedback_score !== null || feedbackStats.feedback_rate !== null || feedbackStats.feedback_positive_12m !== null) feedbackEnrichmentSucceeded += 1;
                    } catch (error) {
                        log.warning('Web Unlocker Feedback enrichment failed', { hostId: first.host_id, feedbackUrl, error: String(error) });
                    }
                }
                profileStats.set(first.host_id, stats);
                await checkpointGroup(group);
                log.info('Enriched public eBay seller profile through Web Unlocker', {
                    hostId: first.host_id,
                    itemsSold: stats.items_sold,
                    followers: stats.follower_count,
                    country: stats.seller_country,
                });
            } catch (error) {
                failedProfiles.push(first.host_id);
                log.warning('Web Unlocker profile enrichment failed', { hostId: first.host_id, error: String(error) });
            }
        }
    });
    await Promise.all(workers);
} else if (input.enrichProfiles && candidates.length) {
    profileCrawler = new PlaywrightCrawler({
        maxConcurrency: input.maxProfileConcurrency,
        maxRequestRetries: input.maxRequestRetries,
        navigationTimeoutSecs: input.navigationTimeoutSecs,
        requestHandlerTimeoutSecs: input.navigationTimeoutSecs + 30,
        proxyConfiguration,
        requestHandler: async ({ page, request }) => {
            const hostId = String(request.userData.hostId);
            const stats = parsePublicProfileText(await page.locator('body').innerText());
            profileStats.set(hostId, stats);
            const group = candidates.find((candidate) => candidate[0].host_id === hostId);
            if (group) await checkpointGroup(group);
            log.info('Enriched public eBay seller profile', { hostId, itemsSold: stats.items_sold, followers: stats.follower_count, country: stats.seller_country });
        },
        failedRequestHandler: ({ request }) => { failedProfiles.push(String(request.userData.hostId)); },
    });
    await profileCrawler.run(candidates.map((group) => ({
        url: group[0].profile_url,
        uniqueKey: `profile:${group[0].host_id}`,
        userData: { hostId: group[0].host_id },
    })));
}

for (const group of candidates) {
    if (checkpointedLeads.size >= input.maxSellers) break;
    await checkpointGroup(group);
}
await Actor.setValue('OUTPUT', output(failedSources.length === sources.length ? 'FAILED' : 'SUCCEEDED'));
await Actor.exit();
