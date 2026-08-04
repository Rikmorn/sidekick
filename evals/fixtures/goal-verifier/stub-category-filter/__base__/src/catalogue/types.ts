export interface Item {
  id: string;
  title: string;
  category: string;
  keywords: string[];
}

export interface SearchQuery {
  text: string;
  category?: string;
}
