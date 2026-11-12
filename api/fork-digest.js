// Fork-only: a keyless news digest for the Nvidia Monitor edition.
//
// Upstream serves news through /api/news/v1/list-feed-digest, which needs a
// session secret, Upstash Redis and seeded workers. This endpoint fetches the
// tech edition's RSS feeds directly and answers in the same response shape
// (ListFeedDigestResponse), so the dashboard's news panels work on a plain
// Vercel deployment. The CDN caches the answer; there is no other state.
import { CATEGORIES, FEEDS } from './_fork-feeds.js';

export const config = { runtime: 'edge' };

const FEED_TIMEOUT_MS = 7000;
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const PER_FEED = 12;
const PER_CATEGORY = 30;
const UA = 'Mozilla/5.0 (compatible; NvidiaMonitor/1.0; +https://github.com/nclamvn/nvidia-monitor)';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decode(text) {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match);
}

function clean(text) {
  return decode(decode(text)).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function tag(block, name) {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return match ? match[1] : '';
}

function atomLink(block) {
  const links = block.match(/<link\b[^>]*>/gi) || [];
  const pick = links.find((link) => /rel=["']alternate["']/i.test(link)) || links.find((link) => !/rel=/i.test(link)) || links[0];
  const href = pick && pick.match(/href=["']([^"']+)["']/i);
  return href ? decode(href[1]) : '';
}

function parseFeed(xml, feed) {
  const isAtom = !/<item[\s>]/i.test(xml) && /<entry[\s>]/i.test(xml);
  const blocks = xml.match(isAtom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi) || [];
  const fromGoogle = feed.url.includes('news.google.com');
  const items = [];
  for (const block of blocks) {
    const title = clean(tag(block, 'title'));
    const link = isAtom ? atomLink(block) : clean(tag(block, 'link'));
    const when = Date.parse(clean(tag(block, isAtom ? 'updated' : 'pubDate') || tag(block, 'published') || tag(block, 'dc:date')));
    if (!title || !/^https?:\/\//i.test(link) || !Number.isFinite(when)) continue;
    // The dashboard matches items to feeds by `source`, so it carries the feed
    // name. Google News titles already end in " - Publisher", which stays.
    const source = feed.name;
    const snippet = fromGoogle ? '' : clean(tag(block, 'description') || tag(block, 'summary')).slice(0, 280);
    items.push({ source, title, link, publishedAt: when, snippet });
    if (items.length >= PER_FEED * 2) break;
  }
  return items;
}

async function loadFeed(feed) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
  try {
    const resp = await fetch(feed.url, {
      headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5' },
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!resp.ok) return { feed, status: `http_${resp.status}`, items: [] };
    const items = parseFeed(await resp.text(), feed);
    return { feed, status: items.length ? 'ok' : 'empty', items };
  } catch (error) {
    return { feed, status: error && error.name === 'AbortError' ? 'timeout' : 'error', items: [] };
  } finally {
    clearTimeout(timer);
  }
}

function titleKey(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 90);
}

export default async function handler(req) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: { 'Content-Type': 'application/json', Allow: 'GET, HEAD' } });
  }

  const now = Date.now();
  const results = await Promise.all(FEEDS.map(loadFeed));

  const categories = {};
  const feedStatuses = {};
  const categoryStates = {};
  const publishers = new Set();
  let itemsConsidered = 0;
  let droppedFreshness = 0;
  let droppedFeedCap = 0;
  let droppedCategoryCap = 0;
  let feedCompleted = 0;

  for (const category of CATEGORIES) {
    const seen = new Set();
    const merged = [];
    let anyFeedOk = false;
    for (const result of results) {
      if (result.feed.category !== category) continue;
      feedStatuses[result.feed.name] = result.status;
      if (result.status === 'ok' || result.status === 'empty') anyFeedOk = true;
      let kept = 0;
      for (const item of result.items.sort((a, b) => b.publishedAt - a.publishedAt)) {
        itemsConsidered++;
        if (now - item.publishedAt > MAX_AGE_MS || item.publishedAt > now + 3600_000) { droppedFreshness++; continue; }
        if (kept >= PER_FEED) { droppedFeedCap++; continue; }
        const key = titleKey(item.title);
        if (seen.has(key)) continue;
        seen.add(key);
        kept++;
        merged.push(item);
      }
    }
    merged.sort((a, b) => b.publishedAt - a.publishedAt);
    droppedCategoryCap += Math.max(0, merged.length - PER_CATEGORY);
    const items = merged.slice(0, PER_CATEGORY).map((item) => {
      publishers.add(item.source);
      return {
        source: item.source,
        title: item.title,
        link: item.link,
        publishedAt: item.publishedAt,
        isAlert: false,
        locationName: '',
        importanceScore: 0,
        corroborationCount: 1,
        snippet: item.snippet,
        tickers: [],
        credibilityScore: 0,
      };
    });
    if (items.length) categories[category] = { items };
    categoryStates[category] = anyFeedOk ? 'ok' : 'missing';
  }
  for (const result of results) if (result.status === 'ok' || result.status === 'empty') feedCompleted++;

  const itemsServed = Object.values(categories).reduce((sum, bucket) => sum + bucket.items.length, 0);
  const categoryCompleted = Object.keys(categories).length;
  const state = itemsServed === 0 ? 'unavailable' : categoryCompleted < CATEGORIES.length || feedCompleted < FEEDS.length ? 'partial' : 'complete';
  const body = {
    categories,
    feedStatuses,
    generatedAt: new Date(now).toISOString(),
    coverage: {
      state,
      attemptedAt: new Date(now).toISOString(),
      itemsServed,
      publisherCount: publishers.size,
      feedTotal: FEEDS.length,
      feedCompleted,
      categoryTotal: CATEGORIES.length,
      categoryCompleted,
      categoryStates,
      droppedFeedCap,
      droppedUndated: 0,
      droppedFreshness,
      droppedCategoryCap,
      servedStale: false,
      staleAgeSeconds: 0,
      staleReason: '',
      itemsConsidered,
      publishersConsidered: publishers.size,
    },
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Public, read-only data; the companion graph site reads it cross-origin.
      'Access-Control-Allow-Origin': '*',
      // An empty answer is cached briefly so a blocked upstream is retried soon.
      'Cache-Control': itemsServed
        ? 'public, max-age=60, s-maxage=120, stale-while-revalidate=1800, stale-if-error=21600'
        : 'public, max-age=0, s-maxage=30',
    },
  });
}
