import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import ru from './locales/ru.json'

export const languageStorageKey = 'telegram-relay-language'
export type AppLanguage = 'ru' | 'en'

function getInitialLanguage(): AppLanguage {
  return localStorage.getItem(languageStorageKey) === 'en' ? 'en' : 'ru'
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ru: { translation: ru },
  },
  lng: getInitialLanguage(),
  fallbackLng: 'ru',
  interpolation: { escapeValue: false },
})

function applyLanguage(language: string) {
  const nextLanguage: AppLanguage = language === 'en' ? 'en' : 'ru'
  document.documentElement.lang = nextLanguage
  localStorage.setItem(languageStorageKey, nextLanguage)
}

applyLanguage(i18n.language)
i18n.on('languageChanged', applyLanguage)

export { i18n }
