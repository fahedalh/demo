import { useTranslation } from 'react-i18next';
import { localized, type LocalizedText } from '@bookly/shared';

export function useLocalized() {
  const { i18n } = useTranslation();
  return (text?: LocalizedText | string) => localized(text, i18n.language);
}
