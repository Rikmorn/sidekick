import { filterByCategory } from './filter.js';
import type { Item, SearchQuery } from './types.js';

function matchesText(item: Item, text: string): boolean {
  const needle = text.trim().toLowerCase();
  if (needle === '') return true;
  if (item.title.toLowerCase().includes(needle)) return true;
  return item.keywords.some((k) => k.toLowerCase().includes(needle));
}

export function searchCatalogue(items: Item[], query: SearchQuery): Item[] {
  const matched = items.filter((item) => matchesText(item, query.text));
  const category = query.category?.trim() ?? '';
  if (category === '') return matched;
  return filterByCategory(matched, category);
}
