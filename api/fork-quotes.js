// Fork-only: keyless share prices for the ticker strip of the AI Chip Monitor.
//
// Reads Yahoo Finance's public chart endpoint, one request per symbol, and
// returns last price and the change against the previous close. A symbol that
// fails is left out; the response never carries a made-up number. The CDN
// caches the answer for a minute. Prices can be delayed by the exchange.
export const config = { runtime: 'edge' };

const SYMBOLS = [
  ['NVDA', 'NVDA'], ['AMD', 'AMD'], ['AVGO', 'AVGO'], ['TSM', 'TSM'], ['MU', 'MU'],
  ['INTC', 'INTC'], ['ASML', 'ASML'], ['SMCI', 'SMCI'], ['ARM', 'ARM'], ['MRVL', 'MRVL'],
  ['MSFT', 'MSFT'], ['GOOGL', 'GOOGL'], ['AMZN', 'AMZN'], ['META', 'META'], ['ORCL', 'ORCL'],
  ['CRWV', 'CRWV'], ['BABA', 'BABA'], ['^SOX', 'SOX'], ['^IXIC', 'NASDAQ'], ['^GSPC', 'S&P 500'],
];
const UA = 'Mozilla/5.0 (compatible; NvidiaMonitor/1.0; +https://github.com/nclamvn/nvidia-monitor)';

async function loadQuote([yahooSymbol, label]) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=1d&interval=1d`;
    const resp = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: controller.signal });
    if (!resp.ok) return null;
    const meta = (await resp.json())?.chart?.result?.[0]?.meta;
    const price = Number(meta?.regularMarketPrice);
    const prev = Number(meta?.chartPreviousClose ?? meta?.previousClose);
    if (!Number.isFinite(price) || !Number.isFinite(prev) || prev <= 0) return null;
    return {
      symbol: label,
      price,
      changePct: ((price - prev) / prev) * 100,
      currency: typeof meta.currency === 'string' ? meta.currency : 'USD',
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: { 'Content-Type': 'application/json', Allow: 'GET, HEAD' } });
  }
  const quotes = (await Promise.all(SYMBOLS.map(loadQuote))).filter(Boolean);
  return new Response(JSON.stringify({ quotes, asOf: new Date().toISOString(), source: 'Yahoo Finance' }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Public, read-only data; the companion graph site reads it cross-origin.
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': quotes.length
        ? 'public, max-age=30, s-maxage=60, stale-while-revalidate=300'
        : 'public, max-age=0, s-maxage=20',
    },
  });
}
