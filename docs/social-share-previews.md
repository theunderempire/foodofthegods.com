# Social share previews for recipe share links

## Why this needs server-side support

The web app is a static SPA served by Caddy. Social crawlers (Facebook,
WhatsApp, Slack, Discord, X, LinkedIn, Telegram, iMessage, ...) do **not**
execute JavaScript: when they fetch
`https://theunderempire.com/foodofthegods/recipes/<id>/share` they see only the
static `index.html`, so client-side tags can never produce a recipe-specific
preview.

The pieces:

- `web/index.html` carries site-wide fallback Open Graph / Twitter tags — this
  is what crawlers see for every non-share page (and for share pages if the
  proxy rule below is not installed).
- The API serves `GET /recipe/:id/share` — a server-rendered HTML page with
  recipe-specific Open Graph tags, Twitter Card tags, and schema.org `Recipe`
  JSON-LD (used by Google rich results and Pinterest rich pins). It reuses the
  same public field projection as the JSON share endpoint (no `userId`), sits
  behind the same public-recipe rate limiter, and returns 404 (with generic
  tags) for unknown ids. Humans who land on it are redirected to the SPA share
  page via `<meta http-equiv="refresh">` + `location.replace`.
- A Caddy rule (below) routes crawler user-agents that request the SPA share
  URL to the API endpoint. Regular browsers keep getting the static SPA.

## Caddy configuration (on the server)

Add this inside the `theunderempire.com` site block, **before** the static
file-server / SPA fallback handlers. `foodofthegods-api:3000` is reachable
because the API container joins the external `caddy-net` network.

```caddyfile
@fotgShareCrawler {
    path_regexp fotgShare ^/foodofthegods/recipes/([^/]+)/share/?$
    header_regexp crawler User-Agent (?i)(facebookexternalhit|facebot|twitterbot|slackbot|discordbot|whatsapp|telegrambot|linkedinbot|pinterest|redditbot|skypeuripreview|applebot|googlebot|bingbot|duckduckbot|embedly|iframely|mastodon|bluesky|snapchat|vkshare)
}
handle @fotgShareCrawler {
    rewrite * /recipe/{re.fotgShare.1}/share
    reverse_proxy foodofthegods-api:3000
}
```

Then reload Caddy (`docker exec caddy caddy reload --config /etc/caddy/Caddyfile`
or however the caddy container is managed).

An unlisted crawler falls through to the SPA and gets the site-wide fallback
tags from `index.html` — degraded, not broken.

## Environment

The preview page builds absolute URLs from:

- `APP_URL` — public base of the web app (default
  `https://theunderempire.com/foodofthegods`); already used for links in
  registration emails.
- Recipe `imageUrl` values are already absolute (thumbnail service prefixes
  `VITE_API_BASE_URL`), so `og:image` works as long as that was set correctly
  when the thumbnail was generated. Relative/missing images degrade to a
  text-only card.

## Verifying

From the server (or anywhere, once deployed):

```sh
curl -A "facebookexternalhit/1.1" https://theunderempire.com/foodofthegods/recipes/<id>/share
# → should return HTML containing og:title with the recipe name

curl https://theunderempire.com/foodofthegods-api/recipe/<id>/share
# → hits the API endpoint directly, same HTML
```

Then sanity-check with the platforms' debuggers:

- Facebook: https://developers.facebook.com/tools/debug/
- LinkedIn: https://www.linkedin.com/post-inspector/
- Google rich results (JSON-LD): https://search.google.com/test/rich-results

Facebook and LinkedIn cache previews aggressively — use the debuggers'
"scrape again" after changes.
