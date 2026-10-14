# eBay Live Lead Scraper

Custom Apify Actor for public eBay Live host and seller discovery. It outputs one `ebay_live_host_lead` per host, not one row per live session.

## Design

- Discovery: public eBay Live browse, channel, and event pages.
- Aggregation: all sampled sessions for one public host are combined.
- Qualification: optional public host-country and follower thresholds.
- Profile enrichment: visits each selected public seller profile once to collect published feedback rate, items sold, followers, and About-page location.
- Output: seller/host name, profile URL, public country, feedback rate and detailed seller ratings, sold/listed counts when published, follower count, live-session count, and up to three sampled categories/brands.
- Country filtering: pass ISO codes in `sellerCountries` (for example `["DE", "FR"]`) or `["EU"]` for the 27 European Union member states. The Actor verifies country from the public Store About tab before emitting a filtered lead.

When a public profile does not expose a metric, the Actor emits `null` rather than inferring it. No login or private-contact collection is used.

For eBay Profile pages that return `403` to data-center browsers, configure `BRIGHT_DATA_API_KEY` as an Apify secret and optionally `BRIGHT_DATA_ZONE` (default `web_unlocker1`). With `profileEnrichmentMode: "auto"`, the Actor uses Web Unlocker only for selected Profile pages; Live discovery continues through the public eBay GraphQL feed.
