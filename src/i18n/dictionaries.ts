// Shared registry for the locale runtime and pure language configuration.
import type { Strings } from './types'
import { de } from './de'
import { en } from './en'

export type Lang = 'de' | 'en'

export const DICTIONARIES: Record<Lang, Strings> = { de, en }
export const LANGUAGES = Object.keys(DICTIONARIES) as Lang[]
