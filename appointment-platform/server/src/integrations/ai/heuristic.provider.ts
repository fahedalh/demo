import { DateTime } from 'luxon';
import type { AIProvider, SearchIntent } from './types';

const CATEGORY_WORDS: Record<string, string[]> = {
  healthcare: ['doctor', 'clinic', 'dentist', 'dental', 'physio', 'medical', 'lab', 'طبيب', 'عيادة', 'أسنان'],
  beauty: ['hair', 'haircut', 'salon', 'barber', 'spa', 'massage', 'nails', 'beauty', 'صالون', 'حلاق', 'مساج'],
  education: ['tutor', 'lesson', 'math', 'english', 'course', 'workshop', 'training', 'مدرس', 'دروس', 'دورة'],
  professional: ['lawyer', 'legal', 'consultant', 'accountant', 'tax', 'advisor', 'محامي', 'مستشار', 'محاسب'],
  automotive: ['car', 'oil change', 'tyre', 'tire', 'detailing', 'inspection', 'garage', 'سيارة', 'صيانة'],
  hospitality: ['room', 'meeting', 'venue', 'event', 'photo', 'photography', 'hotel', 'قاعة', 'تصوير'],
  government: ['passport', 'document', 'licence', 'license', 'permit', 'id card', 'جواز', 'رخصة'],
};

/** Dependency-free natural-language parser — always available, also the LLM fallback. */
export const heuristicProvider: AIProvider = {
  key: 'heuristic',
  async parseSearch(text, today, categories) {
    const t = ` ${text.toLowerCase()} `;
    const out: SearchIntent = {};
    for (const [slug, words] of Object.entries(CATEGORY_WORDS)) {
      if (categories.includes(slug) && words.some((w) => t.includes(w))) {
        out.category = slug;
        break;
      }
    }
    const price = t.match(/(?:under|below|less than|max|<|أقل من)\s*\$?\s*(\d+)/);
    if (price) out.maxPrice = Number(price[1]);
    const rating = t.match(/(\d(?:\.\d)?)\s*\+?\s*(?:stars?|نجوم)/);
    if (rating) out.minRating = Math.min(5, Number(rating[1]));
    else if (/top rated|best|highly rated|الأفضل/.test(t)) out.minRating = 4.5;
    const city = t.match(/\b(?:in|near|at|في)\s+([a-z؀-ۿ][a-z؀-ۿ\s]{1,30}?)(?=\s+(?:under|below|for|on|tomorrow|today|this|next|with)\b|\s*$|[,.])/);
    if (city) out.city = city[1].trim().replace(/\b\w/g, (c) => c.toUpperCase());
    const base = DateTime.fromISO(today);
    if (/\btoday\b|اليوم/.test(t)) out.date = base.toISODate()!;
    else if (/\btomorrow\b|غدا|غداً/.test(t)) out.date = base.plus({ days: 1 }).toISODate()!;
    else {
      const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      const idx = days.findIndex((d) => t.includes(d));
      if (idx >= 0) {
        let d = base.plus({ days: 1 });
        while (d.weekday !== idx + 1) d = d.plus({ days: 1 });
        out.date = d.toISODate()!;
      }
    }
    if (/morning|صباح/.test(t)) out.partOfDay = 'morning';
    else if (/afternoon|ظهر|بعد الظهر/.test(t)) out.partOfDay = 'afternoon';
    else if (/evening|night|مساء/.test(t)) out.partOfDay = 'evening';
    const stop = /\b(i|need|want|a|an|the|book|booking|appointment|for|in|near|at|under|below|less|than|max|today|tomorrow|this|next|morning|afternoon|evening|night|with|stars?|top|rated|best|highly|on|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d+|\$)\b/g;
    const residual = t.replace(out.city ? out.city.toLowerCase() : '\u0000', ' ').replace(stop, ' ').replace(/[^a-z؀-ۿ\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (residual && !out.category) out.q = residual.slice(0, 60);
    else if (residual) out.q = residual.split(' ').filter((w) => !(CATEGORY_WORDS[out.category!] ?? []).includes(w)).join(' ').slice(0, 60) || undefined;
    return out;
  },
  async describeBusiness(i) {
    const list = i.services.slice(0, 4).join(', ');
    if (i.locale === 'ar') {
      return `${i.name} وجهتك الموثوقة في ${i.city ?? 'منطقتك'} لخدمات ${i.category}. نقدّم ${list || 'خدمات متكاملة'} بفريق محترف ومواعيد مرنة يمكنك حجزها عبر الإنترنت خلال ثوانٍ.`;
    }
    const opener = i.tone === 'luxury' ? 'An elevated' : i.tone === 'friendly' ? 'A friendly, welcoming' : 'A trusted';
    return `${opener} ${i.category.toLowerCase()} destination${i.city ? ` in ${i.city}` : ''}, ${i.name} offers ${list || 'a full range of services'} delivered by an experienced team. Pick a time that suits you and book online in seconds.`;
  },
};
