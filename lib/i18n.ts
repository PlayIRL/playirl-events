/**
 * Lightweight in-house i18n. Single registry of English strings keyed by
 * dotted path; `t(key, params?, locale?)` returns the localized string.
 * No dependencies, no build step, no runtime parse cost beyond a Map lookup.
 *
 * Design constraints:
 *  - Must work in server components and client components from a single
 *    import (no async loading — every locale's strings ship with the bundle).
 *  - Must survive a swap to `next-intl` or `react-intl` without changing
 *    every callsite. That means the key shape (dotted path, ICU-style
 *    `{var}` interpolation) matches what those libraries consume.
 *  - English is the seed; missing translations fall back to English rather
 *    than rendering raw keys, so half-translated locales still ship.
 *
 * Adding a new locale: copy `en` to e.g. `fr`, translate values, register
 * via `registerLocale("fr", strings)`. The `t()` helper picks the locale
 * argument (default DEFAULT_LOCALE), falls back to English for any missing
 * key, and finally returns the raw key path if both are missing.
 */

import { DEFAULT_LOCALE } from "./locale";

type StringTree = { [key: string]: string | StringTree };

/** English source-of-truth strings. Organized by surface to keep diffs
 *  reviewable when a page's copy changes. Add new strings here first; the
 *  `t()` helper picks them up automatically. */
const EN: StringTree = {
  homepage: {
    today: "Today",
    tomorrow: "Tomorrow",
    yesterday: "Yesterday",
    no_events: "No events match your filters right now.",
    showing_in: "Showing events in {place}",
    change: "Change",
    dismiss: "Dismiss",
  },
  filters: {
    all_mtg: "All MTG",
    all_formats: "All formats",
    rcq_only_label: "RCQs only",
    rcq_only_help: "Regional Championship Qualifiers — competitive WPN events.",
    events_within: "events within",
    miles_of: "miles of",
    kilometers_of: "kilometers of",
    this_week: "This week",
    this_month: "This month",
  },
  event_card: {
    free: "Free",
    sign_in_to_save: "Sign in to save events",
    save_event: "Save event",
    remove_save: "Remove from saved",
  },
  event_detail: {
    date_label: "Date",
    time_label: "Time",
    cost_label: "Cost",
    distance_label: "Distance",
    address_label: "Address",
    source_label: "Source",
    description_label: "Description",
    not_listed: "Not listed",
  },
  location_picker: {
    placeholder: "City, address, or postcode",
    use_current: "Use my current location",
  },
  errors: {
    location_not_found: "Could not find a location matching \"{label}\". Try a city, postcode, or street address.",
    location_required: "Location is required. Enter a city, postcode, or address.",
  },
  cookie_banner: {
    notice: "We use a small number of cookies to keep you signed in and remember your theme + location preferences. No tracking, no ads.",
    privacy_link: "Privacy",
    accept: "Got it",
  },
};

// French dictionary. Magic format names ("Commander", "Modern") stay in
// English — they're proper nouns in every locale Wizards ships the game in.
const FR: StringTree = {
  homepage: {
    today: "Aujourd'hui",
    tomorrow: "Demain",
    yesterday: "Hier",
    no_events: "Aucun événement ne correspond à vos filtres pour le moment.",
    showing_in: "Événements à {place}",
    change: "Modifier",
    dismiss: "Ignorer",
  },
  filters: {
    all_mtg: "Tout MTG",
    all_formats: "Tous les formats",
    rcq_only_label: "RCQ uniquement",
    rcq_only_help: "Regional Championship Qualifiers — événements WPN compétitifs.",
    events_within: "événements dans un rayon de",
    miles_of: "miles autour de",
    kilometers_of: "kilomètres autour de",
    this_week: "Cette semaine",
    this_month: "Ce mois-ci",
  },
  event_card: {
    free: "Gratuit",
    sign_in_to_save: "Connectez-vous pour enregistrer",
    save_event: "Enregistrer",
    remove_save: "Retirer des favoris",
  },
  event_detail: {
    date_label: "Date",
    time_label: "Heure",
    cost_label: "Tarif",
    distance_label: "Distance",
    address_label: "Adresse",
    source_label: "Source",
    description_label: "Description",
    not_listed: "Non indiqué",
  },
  location_picker: {
    placeholder: "Ville, adresse ou code postal",
    use_current: "Utiliser ma position actuelle",
  },
  errors: {
    location_not_found: "Impossible de trouver \"{label}\". Essayez une ville, un code postal ou une adresse.",
    location_required: "Lieu requis. Entrez une ville, un code postal ou une adresse.",
  },
  cookie_banner: {
    notice: "Nous utilisons quelques cookies pour vous garder connecté et mémoriser vos préférences de thème et de lieu. Pas de pistage, pas de publicité.",
    privacy_link: "Confidentialité",
    accept: "J'ai compris",
  },
};

// German dictionary.
const DE: StringTree = {
  homepage: {
    today: "Heute",
    tomorrow: "Morgen",
    yesterday: "Gestern",
    no_events: "Aktuell keine Events, die zu deinen Filtern passen.",
    showing_in: "Events in {place}",
    change: "Ändern",
    dismiss: "Schließen",
  },
  filters: {
    all_mtg: "Alle MTG",
    all_formats: "Alle Formate",
    rcq_only_label: "Nur RCQs",
    rcq_only_help: "Regional Championship Qualifiers — kompetitive WPN-Events.",
    events_within: "Events im Umkreis von",
    miles_of: "Meilen um",
    kilometers_of: "Kilometer um",
    this_week: "Diese Woche",
    this_month: "Diesen Monat",
  },
  event_card: {
    free: "Kostenlos",
    sign_in_to_save: "Anmelden zum Speichern",
    save_event: "Event speichern",
    remove_save: "Aus Favoriten entfernen",
  },
  event_detail: {
    date_label: "Datum",
    time_label: "Uhrzeit",
    cost_label: "Preis",
    distance_label: "Entfernung",
    address_label: "Adresse",
    source_label: "Quelle",
    description_label: "Beschreibung",
    not_listed: "Nicht angegeben",
  },
  location_picker: {
    placeholder: "Stadt, Adresse oder PLZ",
    use_current: "Meinen Standort verwenden",
  },
  errors: {
    location_not_found: "Konnte \"{label}\" nicht finden. Versuche eine Stadt, PLZ oder Adresse.",
    location_required: "Standort erforderlich. Gib eine Stadt, PLZ oder Adresse ein.",
  },
  cookie_banner: {
    notice: "Wir verwenden ein paar Cookies, um dich angemeldet zu halten und deine Theme- und Standort-Einstellungen zu speichern. Kein Tracking, keine Werbung.",
    privacy_link: "Datenschutz",
    accept: "Verstanden",
  },
};

// Spanish dictionary.
const ES: StringTree = {
  homepage: {
    today: "Hoy",
    tomorrow: "Mañana",
    yesterday: "Ayer",
    no_events: "Ningún evento coincide con tus filtros ahora mismo.",
    showing_in: "Eventos en {place}",
    change: "Cambiar",
    dismiss: "Descartar",
  },
  filters: {
    all_mtg: "Todo MTG",
    all_formats: "Todos los formatos",
    rcq_only_label: "Solo RCQ",
    rcq_only_help: "Regional Championship Qualifiers — eventos WPN competitivos.",
    events_within: "eventos en un radio de",
    miles_of: "millas de",
    kilometers_of: "kilómetros de",
    this_week: "Esta semana",
    this_month: "Este mes",
  },
  event_card: {
    free: "Gratis",
    sign_in_to_save: "Inicia sesión para guardar",
    save_event: "Guardar evento",
    remove_save: "Quitar de guardados",
  },
  event_detail: {
    date_label: "Fecha",
    time_label: "Hora",
    cost_label: "Precio",
    distance_label: "Distancia",
    address_label: "Dirección",
    source_label: "Fuente",
    description_label: "Descripción",
    not_listed: "No indicado",
  },
  location_picker: {
    placeholder: "Ciudad, dirección o código postal",
    use_current: "Usar mi ubicación actual",
  },
  errors: {
    location_not_found: "No se encontró \"{label}\". Prueba con una ciudad, código postal o dirección.",
    location_required: "Ubicación obligatoria. Introduce una ciudad, código postal o dirección.",
  },
  cookie_banner: {
    notice: "Usamos algunas cookies para mantenerte con sesión iniciada y recordar tus preferencias de tema y ubicación. Sin rastreo, sin anuncios.",
    privacy_link: "Privacidad",
    accept: "Entendido",
  },
};

// Italian dictionary.
const IT: StringTree = {
  homepage: {
    today: "Oggi",
    tomorrow: "Domani",
    yesterday: "Ieri",
    no_events: "Nessun evento corrisponde ai tuoi filtri al momento.",
    showing_in: "Eventi a {place}",
    change: "Modifica",
    dismiss: "Chiudi",
  },
  filters: {
    all_mtg: "Tutto MTG",
    all_formats: "Tutti i formati",
    rcq_only_label: "Solo RCQ",
    rcq_only_help: "Regional Championship Qualifiers — eventi WPN competitivi.",
    events_within: "eventi entro",
    miles_of: "miglia da",
    kilometers_of: "chilometri da",
    this_week: "Questa settimana",
    this_month: "Questo mese",
  },
  event_card: {
    free: "Gratis",
    sign_in_to_save: "Accedi per salvare",
    save_event: "Salva evento",
    remove_save: "Rimuovi dai salvati",
  },
  event_detail: {
    date_label: "Data",
    time_label: "Ora",
    cost_label: "Prezzo",
    distance_label: "Distanza",
    address_label: "Indirizzo",
    source_label: "Fonte",
    description_label: "Descrizione",
    not_listed: "Non indicato",
  },
  location_picker: {
    placeholder: "Città, indirizzo o CAP",
    use_current: "Usa la mia posizione attuale",
  },
  errors: {
    location_not_found: "Impossibile trovare \"{label}\". Prova con una città, CAP o indirizzo.",
    location_required: "Posizione richiesta. Inserisci una città, CAP o indirizzo.",
  },
  cookie_banner: {
    notice: "Usiamo alcuni cookie per mantenerti connesso e ricordare le tue preferenze di tema e posizione. Niente tracciamento, niente pubblicità.",
    privacy_link: "Privacy",
    accept: "Ho capito",
  },
};

// Portuguese dictionary (PT-PT; PT-BR is close enough for these short labels).
const PT: StringTree = {
  homepage: {
    today: "Hoje",
    tomorrow: "Amanhã",
    yesterday: "Ontem",
    no_events: "Nenhum evento corresponde aos teus filtros neste momento.",
    showing_in: "Eventos em {place}",
    change: "Alterar",
    dismiss: "Dispensar",
  },
  filters: {
    all_mtg: "Todo MTG",
    all_formats: "Todos os formatos",
    rcq_only_label: "Só RCQ",
    rcq_only_help: "Regional Championship Qualifiers — eventos WPN competitivos.",
    events_within: "eventos num raio de",
    miles_of: "milhas de",
    kilometers_of: "quilómetros de",
    this_week: "Esta semana",
    this_month: "Este mês",
  },
  event_card: {
    free: "Grátis",
    sign_in_to_save: "Inicia sessão para guardar",
    save_event: "Guardar evento",
    remove_save: "Remover dos guardados",
  },
  event_detail: {
    date_label: "Data",
    time_label: "Hora",
    cost_label: "Preço",
    distance_label: "Distância",
    address_label: "Endereço",
    source_label: "Fonte",
    description_label: "Descrição",
    not_listed: "Não indicado",
  },
  location_picker: {
    placeholder: "Cidade, endereço ou código postal",
    use_current: "Usar a minha localização atual",
  },
  errors: {
    location_not_found: "Não encontrei \"{label}\". Tenta uma cidade, código postal ou endereço.",
    location_required: "Localização obrigatória. Introduz uma cidade, código postal ou endereço.",
  },
  cookie_banner: {
    notice: "Usamos alguns cookies para manter-te com sessão iniciada e lembrar as tuas preferências de tema e localização. Sem rastreio, sem anúncios.",
    privacy_link: "Privacidade",
    accept: "Entendi",
  },
};

// Dutch dictionary.
const NL: StringTree = {
  homepage: {
    today: "Vandaag",
    tomorrow: "Morgen",
    yesterday: "Gisteren",
    no_events: "Geen evenementen die aan je filters voldoen.",
    showing_in: "Evenementen in {place}",
    change: "Wijzigen",
    dismiss: "Sluiten",
  },
  filters: {
    all_mtg: "Alle MTG",
    all_formats: "Alle formats",
    rcq_only_label: "Alleen RCQ",
    rcq_only_help: "Regional Championship Qualifiers — competitieve WPN-evenementen.",
    events_within: "evenementen binnen",
    miles_of: "mijl van",
    kilometers_of: "kilometer van",
    this_week: "Deze week",
    this_month: "Deze maand",
  },
  event_card: {
    free: "Gratis",
    sign_in_to_save: "Aanmelden om op te slaan",
    save_event: "Evenement opslaan",
    remove_save: "Verwijderen uit opgeslagen",
  },
  event_detail: {
    date_label: "Datum",
    time_label: "Tijd",
    cost_label: "Prijs",
    distance_label: "Afstand",
    address_label: "Adres",
    source_label: "Bron",
    description_label: "Beschrijving",
    not_listed: "Niet opgegeven",
  },
  location_picker: {
    placeholder: "Stad, adres of postcode",
    use_current: "Mijn huidige locatie gebruiken",
  },
  errors: {
    location_not_found: "\"{label}\" niet gevonden. Probeer een stad, postcode of adres.",
    location_required: "Locatie verplicht. Voer een stad, postcode of adres in.",
  },
  cookie_banner: {
    notice: "We gebruiken een paar cookies om je ingelogd te houden en je thema- en locatievoorkeuren te onthouden. Geen tracking, geen advertenties.",
    privacy_link: "Privacy",
    accept: "Begrepen",
  },
};

// Japanese dictionary. MTG format names + game brand stay English (proper
// nouns in Japanese publishing too); UI scaffolding translates.
const JA: StringTree = {
  homepage: {
    today: "今日",
    tomorrow: "明日",
    yesterday: "昨日",
    no_events: "現在、フィルタに一致するイベントはありません。",
    showing_in: "{place} のイベント",
    change: "変更",
    dismiss: "閉じる",
  },
  filters: {
    all_mtg: "MTG すべて",
    all_formats: "すべてのフォーマット",
    rcq_only_label: "RCQ のみ",
    rcq_only_help: "Regional Championship Qualifiers — 競技 WPN イベント。",
    events_within: "イベント検索範囲",
    miles_of: "マイル以内",
    kilometers_of: "キロメートル以内",
    this_week: "今週",
    this_month: "今月",
  },
  event_card: {
    free: "無料",
    sign_in_to_save: "保存にはサインインが必要です",
    save_event: "イベントを保存",
    remove_save: "保存から削除",
  },
  event_detail: {
    date_label: "日付",
    time_label: "時刻",
    cost_label: "参加費",
    distance_label: "距離",
    address_label: "住所",
    source_label: "出典",
    description_label: "説明",
    not_listed: "未記載",
  },
  location_picker: {
    placeholder: "都市・住所・郵便番号",
    use_current: "現在地を使用",
  },
  errors: {
    location_not_found: "「{label}」が見つかりませんでした。都市名、郵便番号、または住所を試してください。",
    location_required: "場所を入力してください。都市名、郵便番号、または住所を入力します。",
  },
  cookie_banner: {
    notice: "サインイン状態の維持、テーマと位置情報の設定保存のために少数の Cookie を使用しています。トラッキングや広告には使用しません。",
    privacy_link: "プライバシー",
    accept: "了解",
  },
};

const LOCALES = new Map<string, StringTree>();
LOCALES.set("en", EN);
// en-US is the app default; alias it directly so plain "en-US" lookups hit
// without language-fallback parsing on every call.
LOCALES.set("en-US", EN);
LOCALES.set("en-GB", EN);
LOCALES.set("en-CA", EN);
LOCALES.set("en-AU", EN);
LOCALES.set("fr", FR);
LOCALES.set("fr-FR", FR);
LOCALES.set("fr-CA", FR);
LOCALES.set("de", DE);
LOCALES.set("de-DE", DE);
LOCALES.set("de-AT", DE);
LOCALES.set("de-CH", DE);
LOCALES.set("es", ES);
LOCALES.set("es-ES", ES);
LOCALES.set("es-MX", ES);
LOCALES.set("it", IT);
LOCALES.set("it-IT", IT);
LOCALES.set("pt", PT);
LOCALES.set("pt-PT", PT);
LOCALES.set("pt-BR", PT);
LOCALES.set("nl", NL);
LOCALES.set("nl-NL", NL);
LOCALES.set("nl-BE", NL);
LOCALES.set("ja", JA);
LOCALES.set("ja-JP", JA);

/** Register a locale's string tree. Pass either a full BCP 47 tag
 *  ("fr-FR") or a language-only key ("fr") — `t()` tries the full tag
 *  first, then the language-only fallback. */
export function registerLocale(locale: string, strings: StringTree): void {
  LOCALES.set(locale, strings);
  const lang = locale.split("-")[0];
  if (lang && !LOCALES.has(lang)) LOCALES.set(lang, strings);
}

function lookup(tree: StringTree | undefined, path: string[]): string | undefined {
  if (!tree) return undefined;
  let cursor: StringTree | string | undefined = tree;
  for (const segment of path) {
    if (typeof cursor !== "object" || cursor === null) return undefined;
    cursor = cursor[segment];
    if (cursor === undefined) return undefined;
  }
  return typeof cursor === "string" ? cursor : undefined;
}

function interpolate(template: string, params: Record<string, string | number> | undefined): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = params[key];
    return value === undefined ? `{${key}}` : String(value);
  });
}

/**
 * Translate a key for the given locale. Lookup order:
 *   1. The requested locale (full tag, e.g. "fr-FR").
 *   2. The language-only fallback (e.g. "fr").
 *   3. English.
 *   4. The raw dotted key (so missing strings surface visibly in dev).
 */
export function t(
  key: string,
  params?: Record<string, string | number>,
  locale: string = DEFAULT_LOCALE,
): string {
  const path = key.split(".");
  const full = LOCALES.get(locale);
  const langOnly = LOCALES.get(locale.split("-")[0]);
  const found = lookup(full, path) ?? lookup(langOnly, path) ?? lookup(EN, path);
  if (found === undefined) return key;
  return interpolate(found, params);
}

/** Curried `t()` bound to a specific locale. Useful in server components
 *  that resolve the locale once via `getServerLocale(await headers())` and
 *  then need to translate many strings. */
export function makeTranslator(locale: string): (key: string, params?: Record<string, string | number>) => string {
  return (key, params) => t(key, params, locale);
}

/**
 * Translation registry for tests / admin tooling. Returns the raw tree —
 * read-only for callers, mutating it doesn't affect runtime lookups (the
 * `t()` helper closes over the Map at call time). Don't ship this through
 * to clients in production; it bloats the bundle with every locale's
 * strings whether the user needs them or not.
 */
export function getRegistry(): Map<string, StringTree> {
  return LOCALES;
}
