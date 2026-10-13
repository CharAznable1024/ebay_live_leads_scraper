# eBay Live Lead Scraper

Custom Apify Actor for public eBay Live host and seller discovery. It outputs one `ebay_live_host_lead` per host, not one row per live session.

## Design

- Discovery: public eBay Live browse, channel, and event pages.
- Aggregation: all sampled sessions for one public host are combined.
- Qualification: optional public host-country and follower thresholds.
- Output: seller/host name, profile URL, public country when published, follower count, live count/status, sampled categories/brands, and evidence URLs.

eBay Live does not consistently publish a host-wide `items_sold` or complete inventory count. Those fields are therefore emitted as `null`, rather than inferred. No login or private-contact collection is used.
