import { Languages } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AppLanguage } from '@/shared/config'

const languages: AppLanguage[] = ['ru', 'en']

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation()
  const currentLanguage: AppLanguage = i18n.resolvedLanguage === 'en' ? 'en' : 'ru'

  return (
    <div className="language-switcher" role="group" aria-label={t('language.selectorLabel')}>
      <Languages aria-hidden="true" size={16} />
      {languages.map((language) => (
        <button
          aria-label={t(language === 'ru' ? 'language.russian' : 'language.english')}
          aria-pressed={currentLanguage === language}
          className="language-switcher__option"
          key={language}
          onClick={() => void i18n.changeLanguage(language)}
          type="button"
        >
          {language.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
