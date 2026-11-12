// Fork-only. The latest headlines per news category, published by the data
// loader and read by the globe's live pulse overlay. Keeps the two decoupled.
export interface PulseHeadline {
  category: string;
  title: string;
  link: string;
  source: string;
  at: number;
}

const byCategory = new Map<string, PulseHeadline[]>();

export function publishHeadlines(
  category: string,
  items: ReadonlyArray<{ title: string; link: string; source: string; pubDate?: Date | string | number }>,
): void {
  byCategory.set(category, items.slice(0, 30).map((item) => ({
    category,
    title: item.title,
    link: item.link,
    source: item.source,
    at: item.pubDate ? new Date(item.pubDate).getTime() : Date.now(),
  })));
}

export function allHeadlines(): PulseHeadline[] {
  return [...byCategory.values()].flat();
}
