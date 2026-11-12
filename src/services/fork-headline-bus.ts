// Fork-only. The latest headlines per news category, published by the data
// loader and read by the map pulse overlay and the footer ticker. Keeps them
// decoupled from the loader.
export interface PulseHeadline {
  category: string;
  title: string;
  link: string;
  /** Feed the item came from (a search topic or a publication). */
  source: string;
  snippet: string;
  at: number;
}

const byCategory = new Map<string, PulseHeadline[]>();

export function publishHeadlines(
  category: string,
  items: ReadonlyArray<{ title: string; link: string; source: string; snippet?: string; pubDate?: Date | string | number }>,
): void {
  byCategory.set(category, items.slice(0, 30).map((item) => ({
    category,
    title: item.title,
    link: item.link,
    source: item.source,
    snippet: item.snippet ?? '',
    at: item.pubDate ? new Date(item.pubDate).getTime() : Date.now(),
  })));
}

export function allHeadlines(): PulseHeadline[] {
  return [...byCategory.values()].flat();
}
