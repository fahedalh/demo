import { useEffect } from 'react';

/** Sets document title and meta description (SEO for public pages). */
export function useDocumentTitle(title?: string, description?: string) {
  useEffect(() => {
    if (title) document.title = `${title} · Bookly`;
    if (description) {
      let m = document.querySelector('meta[name="description"]');
      if (!m) {
        m = document.createElement('meta');
        m.setAttribute('name', 'description');
        document.head.appendChild(m);
      }
      m.setAttribute('content', description.slice(0, 160));
    }
  }, [title, description]);
}
