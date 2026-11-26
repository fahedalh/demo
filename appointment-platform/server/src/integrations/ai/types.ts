export interface SearchIntent {
  q?: string;
  category?: string; // category slug
  city?: string;
  maxPrice?: number;
  minRating?: number;
  date?: string; // YYYY-MM-DD
  partOfDay?: 'morning' | 'afternoon' | 'evening';
}

export interface DescriptionInput {
  name: string;
  category: string;
  city?: string;
  services: string[];
  tone?: 'professional' | 'friendly' | 'luxury';
  locale: 'en' | 'ar';
}

export interface AIProvider {
  key: string;
  parseSearch(text: string, today: string, categories: string[]): Promise<SearchIntent>;
  describeBusiness(input: DescriptionInput): Promise<string>;
}
