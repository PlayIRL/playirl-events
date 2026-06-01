/**
 * Per-country fallback locations used when the viewer's location can't be
 * resolved any other way (no URL params, no user prefs, IP-geo failed) but
 * we DO know their country from a cookie / Accept-Language / inferred locale.
 *
 * Picking a sensible default city per country beats the alternative — which
 * is dumping every German viewer onto "events near Philadelphia." The choices
 * favor the largest WPN-active metropolis in each country; admins can change
 * the global site default via /admin/config but these per-country defaults
 * are baked here.
 *
 * Country codes are ISO 3166 alpha-2.
 */

export interface CountryDefault {
  lat: number;
  lng: number;
  /** Display label shown in the location chip, in the same "City, REGION"
   *  shape the reverse-geocoder emits for every other location — a state /
   *  province code for US & CA, an ISO country code elsewhere (GB shown as
   *  the friendlier "UK"). Place names aren't translated; "Tokyo" stays
   *  "Tokyo" everywhere. */
  label: string;
}

const COUNTRY_DEFAULTS: Record<string, CountryDefault> = {
  // North America (US & CA use state / province code)
  US: { lat: 39.9526, lng: -75.1652, label: "Philadelphia, PA" },
  CA: { lat: 43.6532, lng: -79.3832, label: "Toronto, ON" },
  MX: { lat: 19.4326, lng: -99.1332, label: "Mexico City, MX" },
  // UK + Ireland
  GB: { lat: 51.5074, lng: -0.1278, label: "London, UK" },
  IE: { lat: 53.3498, lng: -6.2603, label: "Dublin, IE" },
  // Western Europe
  FR: { lat: 48.8566, lng: 2.3522, label: "Paris, FR" },
  DE: { lat: 52.5200, lng: 13.4050, label: "Berlin, DE" },
  NL: { lat: 52.3676, lng: 4.9041, label: "Amsterdam, NL" },
  BE: { lat: 50.8503, lng: 4.3517, label: "Brussels, BE" },
  LU: { lat: 49.6116, lng: 6.1319, label: "Luxembourg, LU" },
  AT: { lat: 48.2082, lng: 16.3738, label: "Vienna, AT" },
  CH: { lat: 47.3769, lng: 8.5417, label: "Zurich, CH" },
  // Southern Europe
  ES: { lat: 40.4168, lng: -3.7038, label: "Madrid, ES" },
  PT: { lat: 38.7223, lng: -9.1393, label: "Lisbon, PT" },
  IT: { lat: 41.9028, lng: 12.4964, label: "Rome, IT" },
  GR: { lat: 37.9838, lng: 23.7275, label: "Athens, GR" },
  // Nordics
  DK: { lat: 55.6761, lng: 12.5683, label: "Copenhagen, DK" },
  SE: { lat: 59.3293, lng: 18.0686, label: "Stockholm, SE" },
  NO: { lat: 59.9139, lng: 10.7522, label: "Oslo, NO" },
  FI: { lat: 60.1699, lng: 24.9384, label: "Helsinki, FI" },
  IS: { lat: 64.1466, lng: -21.9426, label: "Reykjavik, IS" },
  // Central / Eastern Europe
  PL: { lat: 52.2297, lng: 21.0122, label: "Warsaw, PL" },
  CZ: { lat: 50.0755, lng: 14.4378, label: "Prague, CZ" },
  SK: { lat: 48.1486, lng: 17.1077, label: "Bratislava, SK" },
  HU: { lat: 47.4979, lng: 19.0402, label: "Budapest, HU" },
  RO: { lat: 44.4268, lng: 26.1025, label: "Bucharest, RO" },
  // Oceania
  AU: { lat: -33.8688, lng: 151.2093, label: "Sydney, AU" },
  NZ: { lat: -36.8485, lng: 174.7633, label: "Auckland, NZ" },
  // East Asia
  JP: { lat: 35.6762, lng: 139.6503, label: "Tokyo, JP" },
  KR: { lat: 37.5665, lng: 126.9780, label: "Seoul, KR" },
  CN: { lat: 31.2304, lng: 121.4737, label: "Shanghai, CN" },
  TW: { lat: 25.0330, lng: 121.5654, label: "Taipei, TW" },
  HK: { lat: 22.3193, lng: 114.1694, label: "Hong Kong, HK" },
  SG: { lat: 1.3521, lng: 103.8198, label: "Singapore, SG" },
  // South + Southeast Asia
  IN: { lat: 19.0760, lng: 72.8777, label: "Mumbai, IN" },
  TH: { lat: 13.7563, lng: 100.5018, label: "Bangkok, TH" },
  VN: { lat: 10.8231, lng: 106.6297, label: "Ho Chi Minh City, VN" },
  PH: { lat: 14.5995, lng: 120.9842, label: "Manila, PH" },
  ID: { lat: -6.2088, lng: 106.8456, label: "Jakarta, ID" },
  MY: { lat: 3.1390, lng: 101.6869, label: "Kuala Lumpur, MY" },
  // South America
  BR: { lat: -23.5505, lng: -46.6333, label: "São Paulo, BR" },
  AR: { lat: -34.6037, lng: -58.3816, label: "Buenos Aires, AR" },
  CL: { lat: -33.4489, lng: -70.6693, label: "Santiago, CL" },
  CO: { lat: 4.7110, lng: -74.0721, label: "Bogotá, CO" },
  PE: { lat: -12.0464, lng: -77.0428, label: "Lima, PE" },
  // Africa
  ZA: { lat: -26.2041, lng: 28.0473, label: "Johannesburg, ZA" },
};

/**
 * Resolve a default lat/lng+label for the given ISO country code. Returns
 * null when we don't have a baked-in default — the caller should fall back
 * to the global hardcoded default. We deliberately don't return a "nearest
 * country we know" lookup; mis-stamping a Bulgarian user onto Athens is
 * worse than dropping them on the global default with a clear
 * `isCustom=false` hint.
 */
export function getCountryDefaultLocation(
  countryCode: string | null | undefined,
): CountryDefault | null {
  if (!countryCode) return null;
  return COUNTRY_DEFAULTS[countryCode.toUpperCase()] ?? null;
}
