# eBay Live Lead Scraper

## Aime shard tracing and timeout safety

Optional `campaignId` and `shardId` inputs are copied to every Dataset row as `campaign_id` and `shard_id`. The Actor reads `run_id` and `dataset_id` from the current Apify runtime. Each qualified seller is pushed immediately after its public profile finishes, and OUTPUT/PROGRESS expose `scanned_count`, `qualified_count`, `next_cursor`, and `has_more`. If a Run times out, already checkpointed rows remain available; Aime should aggregate and deduplicate by `campaign_id + seller_id`.

Custom Apify Actor for public eBay Live host and seller discovery. It outputs one `ebay_live_host_lead` per host, not one row per live session.

## Design

- Discovery: public eBay Live browse, channel, and event pages. The Actor first captures browser GraphQL responses; if none are available, it automatically unlocks the same page and parses its server-rendered Apollo state, with event-card HTML as a final fallback.
- Aggregation: all sampled sessions for one public host are combined.
- Qualification: optional public host-country and follower thresholds.
- Profile enrichment: visits each selected public seller profile once to collect published feedback rate, items sold, followers, and About-page location.
- Output: seller/host name, profile URL, public country, feedback rate and detailed seller ratings, sold/listed counts when published, follower count, live-session count, and up to three sampled categories/brands.
- Country filtering: pass ISO codes in `sellerCountries` (for example `["DE", "FR"]`) or `["EU"]` for the 27 European Union member states. The Actor verifies country from the public Store About tab before emitting a filtered lead.

When no country fields are supplied, the Actor starts from `https://www.ebay.co.uk/ebaylive/` and verifies that emitted sellers are from `GB`. If `country` is supplied but `sellerCountries` is empty, the selected marketplace is also used as the seller-country filter. `UK` is accepted as an alias for `GB`.

When a public profile does not expose a metric, the Actor emits `null` rather than inferring it. No login or private-contact collection is used.

For eBay pages that return incomplete data to data-center browsers, configure `BRIGHT_DATA_API_KEY` as an Apify secret and optionally `BRIGHT_DATA_ZONE`. With `profileEnrichmentMode: "auto"`, the Actor uses Web Unlocker for selected Profile pages and automatically falls back to a static unlocked Live page when the browser does not expose the public GraphQL feed.
