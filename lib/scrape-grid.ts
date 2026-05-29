// Scrape grids — anchor points fed to the WotC store/event sweep. Each anchor
// pulls stores within `radiusMi` of its coordinates; overlap between anchors
// is fine (dedup happens by store ID).
//
// Spacing: ~150mi between anchors with a 100mi search radius gives reliable
// coverage with modest overlap. CONUS is the historical default; INTL grids
// (CA, UK, EU, AU, JP) are opt-in via config.scrapeRegions — admins assemble
// the desired grid by concatenating the constants here (e.g. CONUS + CA + UK).

export interface ScrapeRegion {
  /** Human label for logs ("Philadelphia", "Houston grid #4"). */
  label: string;
  lat: number;
  lng: number;
  /** Search radius in miles. */
  radiusMi: number;
  /** ISO 3166 alpha-2 country code. Optional — falls back to per-event
   *  reverse-geocode when missing. Setting this on the grid pre-stamps every
   *  store hit from the anchor with the right country, which avoids a
   *  Nominatim round-trip for stores whose coords clearly belong to one
   *  country (e.g. a Tokyo anchor never resolves to anything but JP). */
  country?: string;
}

export const CONUS_GRID: ScrapeRegion[] = [
  // === Northeast ===
  { label: "Boston, MA", lat: 42.3601, lng: -71.0589, radiusMi: 100 },
  { label: "Portland, ME", lat: 43.6591, lng: -70.2568, radiusMi: 100 },
  { label: "Burlington, VT", lat: 44.4759, lng: -73.2121, radiusMi: 100 },
  { label: "Albany, NY", lat: 42.6526, lng: -73.7562, radiusMi: 100 },
  { label: "New York, NY", lat: 40.7128, lng: -74.0060, radiusMi: 100 },
  { label: "Philadelphia, PA", lat: 39.9526, lng: -75.1652, radiusMi: 100 },
  { label: "Pittsburgh, PA", lat: 40.4406, lng: -79.9959, radiusMi: 100 },
  { label: "Buffalo, NY", lat: 42.8864, lng: -78.8784, radiusMi: 100 },
  { label: "Washington, DC", lat: 38.9072, lng: -77.0369, radiusMi: 100 },
  { label: "Richmond, VA", lat: 37.5407, lng: -77.4360, radiusMi: 100 },

  // === Southeast ===
  { label: "Raleigh, NC", lat: 35.7796, lng: -78.6382, radiusMi: 100 },
  { label: "Charlotte, NC", lat: 35.2271, lng: -80.8431, radiusMi: 100 },
  { label: "Charleston, SC", lat: 32.7765, lng: -79.9311, radiusMi: 100 },
  { label: "Atlanta, GA", lat: 33.7490, lng: -84.3880, radiusMi: 100 },
  { label: "Savannah, GA", lat: 32.0809, lng: -81.0912, radiusMi: 100 },
  { label: "Jacksonville, FL", lat: 30.3322, lng: -81.6557, radiusMi: 100 },
  { label: "Orlando, FL", lat: 28.5383, lng: -81.3792, radiusMi: 100 },
  { label: "Miami, FL", lat: 25.7617, lng: -80.1918, radiusMi: 100 },
  { label: "Tampa, FL", lat: 27.9506, lng: -82.4572, radiusMi: 100 },
  { label: "Tallahassee, FL", lat: 30.4383, lng: -84.2807, radiusMi: 100 },

  // === Mid-Atlantic / Appalachia ===
  { label: "Roanoke, VA", lat: 37.2710, lng: -79.9414, radiusMi: 100 },
  { label: "Knoxville, TN", lat: 35.9606, lng: -83.9207, radiusMi: 100 },
  { label: "Nashville, TN", lat: 36.1627, lng: -86.7816, radiusMi: 100 },
  { label: "Memphis, TN", lat: 35.1495, lng: -90.0490, radiusMi: 100 },
  { label: "Louisville, KY", lat: 38.2527, lng: -85.7585, radiusMi: 100 },
  { label: "Birmingham, AL", lat: 33.5186, lng: -86.8104, radiusMi: 100 },
  { label: "Mobile, AL", lat: 30.6954, lng: -88.0399, radiusMi: 100 },

  // === Midwest ===
  { label: "Cleveland, OH", lat: 41.4993, lng: -81.6944, radiusMi: 100 },
  { label: "Columbus, OH", lat: 39.9612, lng: -82.9988, radiusMi: 100 },
  { label: "Cincinnati, OH", lat: 39.1031, lng: -84.5120, radiusMi: 100 },
  { label: "Detroit, MI", lat: 42.3314, lng: -83.0458, radiusMi: 100 },
  { label: "Indianapolis, IN", lat: 39.7684, lng: -86.1581, radiusMi: 100 },
  { label: "Chicago, IL", lat: 41.8781, lng: -87.6298, radiusMi: 100 },
  { label: "Milwaukee, WI", lat: 43.0389, lng: -87.9065, radiusMi: 100 },
  { label: "Madison, WI", lat: 43.0731, lng: -89.4012, radiusMi: 100 },
  { label: "Minneapolis, MN", lat: 44.9778, lng: -93.2650, radiusMi: 100 },
  { label: "St. Louis, MO", lat: 38.6270, lng: -90.1994, radiusMi: 100 },
  { label: "Kansas City, MO", lat: 39.0997, lng: -94.5786, radiusMi: 100 },
  { label: "Des Moines, IA", lat: 41.5868, lng: -93.6250, radiusMi: 100 },
  { label: "Omaha, NE", lat: 41.2565, lng: -95.9345, radiusMi: 100 },
  { label: "Fargo, ND", lat: 46.8772, lng: -96.7898, radiusMi: 100 },
  { label: "Sioux Falls, SD", lat: 43.5446, lng: -96.7311, radiusMi: 100 },

  // === South / Gulf Coast ===
  { label: "New Orleans, LA", lat: 29.9511, lng: -90.0715, radiusMi: 100 },
  { label: "Baton Rouge, LA", lat: 30.4515, lng: -91.1871, radiusMi: 100 },
  { label: "Little Rock, AR", lat: 34.7465, lng: -92.2896, radiusMi: 100 },
  { label: "Tulsa, OK", lat: 36.1540, lng: -95.9928, radiusMi: 100 },
  { label: "Oklahoma City, OK", lat: 35.4676, lng: -97.5164, radiusMi: 100 },

  // === Texas ===
  { label: "Dallas, TX", lat: 32.7767, lng: -96.7970, radiusMi: 100 },
  { label: "Houston, TX", lat: 29.7604, lng: -95.3698, radiusMi: 100 },
  { label: "Austin, TX", lat: 30.2672, lng: -97.7431, radiusMi: 100 },
  { label: "San Antonio, TX", lat: 29.4241, lng: -98.4936, radiusMi: 100 },
  { label: "El Paso, TX", lat: 31.7619, lng: -106.4850, radiusMi: 100 },
  { label: "Lubbock, TX", lat: 33.5779, lng: -101.8552, radiusMi: 100 },
  { label: "Corpus Christi, TX", lat: 27.8006, lng: -97.3964, radiusMi: 100 },

  // === Mountain / Southwest ===
  { label: "Denver, CO", lat: 39.7392, lng: -104.9903, radiusMi: 100 },
  { label: "Colorado Springs, CO", lat: 38.8339, lng: -104.8214, radiusMi: 100 },
  { label: "Albuquerque, NM", lat: 35.0844, lng: -106.6504, radiusMi: 100 },
  { label: "Santa Fe, NM", lat: 35.6870, lng: -105.9378, radiusMi: 100 },
  { label: "Phoenix, AZ", lat: 33.4484, lng: -112.0740, radiusMi: 100 },
  { label: "Tucson, AZ", lat: 32.2226, lng: -110.9747, radiusMi: 100 },
  { label: "Las Vegas, NV", lat: 36.1699, lng: -115.1398, radiusMi: 100 },
  { label: "Reno, NV", lat: 39.5296, lng: -119.8138, radiusMi: 100 },
  { label: "Salt Lake City, UT", lat: 40.7608, lng: -111.8910, radiusMi: 100 },
  { label: "Boise, ID", lat: 43.6150, lng: -116.2023, radiusMi: 100 },
  { label: "Billings, MT", lat: 45.7833, lng: -108.5007, radiusMi: 100 },
  { label: "Cheyenne, WY", lat: 41.1400, lng: -104.8202, radiusMi: 100 },

  // === West Coast ===
  { label: "Seattle, WA", lat: 47.6062, lng: -122.3321, radiusMi: 100 },
  { label: "Spokane, WA", lat: 47.6588, lng: -117.4260, radiusMi: 100 },
  { label: "Portland, OR", lat: 45.5152, lng: -122.6784, radiusMi: 100 },
  { label: "Eugene, OR", lat: 44.0521, lng: -123.0868, radiusMi: 100 },
  { label: "San Francisco, CA", lat: 37.7749, lng: -122.4194, radiusMi: 100 },
  { label: "Sacramento, CA", lat: 38.5816, lng: -121.4944, radiusMi: 100 },
  { label: "Fresno, CA", lat: 36.7378, lng: -119.7871, radiusMi: 100 },
  { label: "Los Angeles, CA", lat: 34.0522, lng: -118.2437, radiusMi: 100 },
  { label: "San Diego, CA", lat: 32.7157, lng: -117.1611, radiusMi: 100 },
];

// Canada — population is concentrated south within 100mi of the US border,
// so a relatively thin grid covers >90% of WPN stores. Add northern anchors
// (Yellowknife, Whitehorse) if a user reports a gap.
export const CA_GRID: ScrapeRegion[] = [
  { label: "Vancouver, BC", lat: 49.2827, lng: -123.1207, radiusMi: 120, country: "CA" },
  { label: "Victoria, BC", lat: 48.4284, lng: -123.3656, radiusMi: 100, country: "CA" },
  { label: "Kelowna, BC", lat: 49.8880, lng: -119.4960, radiusMi: 120, country: "CA" },
  { label: "Calgary, AB", lat: 51.0447, lng: -114.0719, radiusMi: 120, country: "CA" },
  { label: "Edmonton, AB", lat: 53.5461, lng: -113.4938, radiusMi: 120, country: "CA" },
  { label: "Saskatoon, SK", lat: 52.1332, lng: -106.6700, radiusMi: 150, country: "CA" },
  { label: "Regina, SK", lat: 50.4452, lng: -104.6189, radiusMi: 120, country: "CA" },
  { label: "Winnipeg, MB", lat: 49.8951, lng: -97.1384, radiusMi: 150, country: "CA" },
  { label: "Thunder Bay, ON", lat: 48.3809, lng: -89.2477, radiusMi: 150, country: "CA" },
  { label: "Sudbury, ON", lat: 46.4917, lng: -80.9930, radiusMi: 120, country: "CA" },
  { label: "Toronto, ON", lat: 43.6532, lng: -79.3832, radiusMi: 100, country: "CA" },
  { label: "London, ON", lat: 42.9849, lng: -81.2453, radiusMi: 100, country: "CA" },
  { label: "Ottawa, ON", lat: 45.4215, lng: -75.6972, radiusMi: 100, country: "CA" },
  { label: "Montreal, QC", lat: 45.5017, lng: -73.5673, radiusMi: 100, country: "CA" },
  { label: "Quebec City, QC", lat: 46.8139, lng: -71.2080, radiusMi: 120, country: "CA" },
  { label: "Halifax, NS", lat: 44.6488, lng: -63.5752, radiusMi: 120, country: "CA" },
  { label: "Moncton, NB", lat: 46.0878, lng: -64.7782, radiusMi: 120, country: "CA" },
  { label: "St. John's, NL", lat: 47.5615, lng: -52.7126, radiusMi: 100, country: "CA" },
];

// UK + Ireland — dense population, smaller geography than the US. ~80mi
// anchor spacing covers it with manageable overlap, and the country code
// is pre-stamped because WotC's locator never disambiguates GB/IE coords
// against Continental Europe.
export const UK_IE_GRID: ScrapeRegion[] = [
  { label: "London, UK", lat: 51.5074, lng: -0.1278, radiusMi: 80, country: "GB" },
  { label: "Birmingham, UK", lat: 52.4862, lng: -1.8904, radiusMi: 80, country: "GB" },
  { label: "Manchester, UK", lat: 53.4808, lng: -2.2426, radiusMi: 80, country: "GB" },
  { label: "Leeds, UK", lat: 53.8008, lng: -1.5491, radiusMi: 80, country: "GB" },
  { label: "Newcastle, UK", lat: 54.9783, lng: -1.6178, radiusMi: 80, country: "GB" },
  { label: "Edinburgh, UK", lat: 55.9533, lng: -3.1883, radiusMi: 100, country: "GB" },
  { label: "Glasgow, UK", lat: 55.8642, lng: -4.2518, radiusMi: 100, country: "GB" },
  { label: "Aberdeen, UK", lat: 57.1497, lng: -2.0943, radiusMi: 120, country: "GB" },
  { label: "Inverness, UK", lat: 57.4778, lng: -4.2247, radiusMi: 120, country: "GB" },
  { label: "Cardiff, UK", lat: 51.4816, lng: -3.1791, radiusMi: 80, country: "GB" },
  { label: "Bristol, UK", lat: 51.4545, lng: -2.5879, radiusMi: 80, country: "GB" },
  { label: "Southampton, UK", lat: 50.9097, lng: -1.4044, radiusMi: 80, country: "GB" },
  { label: "Norwich, UK", lat: 52.6309, lng: 1.2974, radiusMi: 80, country: "GB" },
  { label: "Plymouth, UK", lat: 50.3755, lng: -4.1427, radiusMi: 80, country: "GB" },
  { label: "Belfast, UK", lat: 54.5973, lng: -5.9301, radiusMi: 80, country: "GB" },
  { label: "Dublin, IE", lat: 53.3498, lng: -6.2603, radiusMi: 80, country: "IE" },
  { label: "Cork, IE", lat: 51.8985, lng: -8.4756, radiusMi: 80, country: "IE" },
  { label: "Galway, IE", lat: 53.2707, lng: -9.0568, radiusMi: 100, country: "IE" },
];

// Continental Europe — covers the WPN-active footprint (DACH, France, BeNeLux,
// Iberia, Italy, Nordics, Poland, Czechia). Russia / former-CIS are intentionally
// excluded; WotC's locator returns near-zero stores there and the geopolitical
// + currency mess isn't worth chasing without a user request. Country codes
// pre-stamped per anchor so we don't depend on Nominatim for every event.
export const EU_GRID: ScrapeRegion[] = [
  // France
  { label: "Paris, FR", lat: 48.8566, lng: 2.3522, radiusMi: 100, country: "FR" },
  { label: "Lyon, FR", lat: 45.7640, lng: 4.8357, radiusMi: 100, country: "FR" },
  { label: "Marseille, FR", lat: 43.2965, lng: 5.3698, radiusMi: 100, country: "FR" },
  { label: "Bordeaux, FR", lat: 44.8378, lng: -0.5792, radiusMi: 120, country: "FR" },
  { label: "Nantes, FR", lat: 47.2184, lng: -1.5536, radiusMi: 100, country: "FR" },
  { label: "Toulouse, FR", lat: 43.6047, lng: 1.4442, radiusMi: 120, country: "FR" },
  { label: "Strasbourg, FR", lat: 48.5734, lng: 7.7521, radiusMi: 80, country: "FR" },
  { label: "Lille, FR", lat: 50.6292, lng: 3.0573, radiusMi: 80, country: "FR" },
  // Iberia
  { label: "Madrid, ES", lat: 40.4168, lng: -3.7038, radiusMi: 120, country: "ES" },
  { label: "Barcelona, ES", lat: 41.3851, lng: 2.1734, radiusMi: 100, country: "ES" },
  { label: "Valencia, ES", lat: 39.4699, lng: -0.3763, radiusMi: 100, country: "ES" },
  { label: "Seville, ES", lat: 37.3886, lng: -5.9823, radiusMi: 120, country: "ES" },
  { label: "Bilbao, ES", lat: 43.2630, lng: -2.9350, radiusMi: 100, country: "ES" },
  { label: "Lisbon, PT", lat: 38.7223, lng: -9.1393, radiusMi: 100, country: "PT" },
  { label: "Porto, PT", lat: 41.1579, lng: -8.6291, radiusMi: 100, country: "PT" },
  // Italy
  { label: "Rome, IT", lat: 41.9028, lng: 12.4964, radiusMi: 100, country: "IT" },
  { label: "Milan, IT", lat: 45.4642, lng: 9.1900, radiusMi: 100, country: "IT" },
  { label: "Naples, IT", lat: 40.8518, lng: 14.2681, radiusMi: 100, country: "IT" },
  { label: "Turin, IT", lat: 45.0703, lng: 7.6869, radiusMi: 100, country: "IT" },
  { label: "Bologna, IT", lat: 44.4949, lng: 11.3426, radiusMi: 80, country: "IT" },
  { label: "Palermo, IT", lat: 38.1157, lng: 13.3615, radiusMi: 120, country: "IT" },
  // BeNeLux
  { label: "Amsterdam, NL", lat: 52.3676, lng: 4.9041, radiusMi: 80, country: "NL" },
  { label: "Rotterdam, NL", lat: 51.9244, lng: 4.4777, radiusMi: 80, country: "NL" },
  { label: "Brussels, BE", lat: 50.8503, lng: 4.3517, radiusMi: 80, country: "BE" },
  { label: "Antwerp, BE", lat: 51.2194, lng: 4.4025, radiusMi: 80, country: "BE" },
  { label: "Luxembourg, LU", lat: 49.6116, lng: 6.1319, radiusMi: 60, country: "LU" },
  // DACH
  { label: "Berlin, DE", lat: 52.5200, lng: 13.4050, radiusMi: 100, country: "DE" },
  { label: "Hamburg, DE", lat: 53.5511, lng: 9.9937, radiusMi: 100, country: "DE" },
  { label: "Munich, DE", lat: 48.1351, lng: 11.5820, radiusMi: 100, country: "DE" },
  { label: "Cologne, DE", lat: 50.9375, lng: 6.9603, radiusMi: 80, country: "DE" },
  { label: "Frankfurt, DE", lat: 50.1109, lng: 8.6821, radiusMi: 80, country: "DE" },
  { label: "Leipzig, DE", lat: 51.3397, lng: 12.3731, radiusMi: 80, country: "DE" },
  { label: "Stuttgart, DE", lat: 48.7758, lng: 9.1829, radiusMi: 80, country: "DE" },
  { label: "Vienna, AT", lat: 48.2082, lng: 16.3738, radiusMi: 100, country: "AT" },
  { label: "Graz, AT", lat: 47.0707, lng: 15.4395, radiusMi: 80, country: "AT" },
  { label: "Zurich, CH", lat: 47.3769, lng: 8.5417, radiusMi: 80, country: "CH" },
  { label: "Geneva, CH", lat: 46.2044, lng: 6.1432, radiusMi: 80, country: "CH" },
  // Nordics
  { label: "Copenhagen, DK", lat: 55.6761, lng: 12.5683, radiusMi: 100, country: "DK" },
  { label: "Aarhus, DK", lat: 56.1629, lng: 10.2039, radiusMi: 100, country: "DK" },
  { label: "Stockholm, SE", lat: 59.3293, lng: 18.0686, radiusMi: 100, country: "SE" },
  { label: "Gothenburg, SE", lat: 57.7089, lng: 11.9746, radiusMi: 100, country: "SE" },
  { label: "Malmö, SE", lat: 55.6050, lng: 13.0038, radiusMi: 80, country: "SE" },
  { label: "Oslo, NO", lat: 59.9139, lng: 10.7522, radiusMi: 100, country: "NO" },
  { label: "Bergen, NO", lat: 60.3913, lng: 5.3221, radiusMi: 120, country: "NO" },
  { label: "Helsinki, FI", lat: 60.1699, lng: 24.9384, radiusMi: 100, country: "FI" },
  { label: "Tampere, FI", lat: 61.4978, lng: 23.7610, radiusMi: 100, country: "FI" },
  { label: "Reykjavik, IS", lat: 64.1466, lng: -21.9426, radiusMi: 120, country: "IS" },
  // Central / Eastern EU
  { label: "Warsaw, PL", lat: 52.2297, lng: 21.0122, radiusMi: 100, country: "PL" },
  { label: "Krakow, PL", lat: 50.0647, lng: 19.9450, radiusMi: 100, country: "PL" },
  { label: "Gdansk, PL", lat: 54.3520, lng: 18.6466, radiusMi: 100, country: "PL" },
  { label: "Prague, CZ", lat: 50.0755, lng: 14.4378, radiusMi: 100, country: "CZ" },
  { label: "Brno, CZ", lat: 49.1951, lng: 16.6068, radiusMi: 80, country: "CZ" },
  { label: "Bratislava, SK", lat: 48.1486, lng: 17.1077, radiusMi: 80, country: "SK" },
  { label: "Budapest, HU", lat: 47.4979, lng: 19.0402, radiusMi: 100, country: "HU" },
  // Greece
  { label: "Athens, GR", lat: 37.9838, lng: 23.7275, radiusMi: 100, country: "GR" },
  { label: "Thessaloniki, GR", lat: 40.6401, lng: 22.9444, radiusMi: 100, country: "GR" },
];

// Australia + New Zealand — population clusters on the coastline, so coverage
// follows the perimeter rather than filling the interior. Wider radii where
// the next nearest city is hundreds of km away.
export const AU_NZ_GRID: ScrapeRegion[] = [
  { label: "Sydney, AU", lat: -33.8688, lng: 151.2093, radiusMi: 120, country: "AU" },
  { label: "Melbourne, AU", lat: -37.8136, lng: 144.9631, radiusMi: 120, country: "AU" },
  { label: "Brisbane, AU", lat: -27.4698, lng: 153.0251, radiusMi: 120, country: "AU" },
  { label: "Gold Coast, AU", lat: -28.0167, lng: 153.4000, radiusMi: 80, country: "AU" },
  { label: "Perth, AU", lat: -31.9505, lng: 115.8605, radiusMi: 150, country: "AU" },
  { label: "Adelaide, AU", lat: -34.9285, lng: 138.6007, radiusMi: 120, country: "AU" },
  { label: "Hobart, AU", lat: -42.8821, lng: 147.3272, radiusMi: 120, country: "AU" },
  { label: "Canberra, AU", lat: -35.2809, lng: 149.1300, radiusMi: 80, country: "AU" },
  { label: "Darwin, AU", lat: -12.4634, lng: 130.8456, radiusMi: 150, country: "AU" },
  { label: "Cairns, AU", lat: -16.9203, lng: 145.7710, radiusMi: 150, country: "AU" },
  { label: "Newcastle, AU", lat: -32.9283, lng: 151.7817, radiusMi: 80, country: "AU" },
  { label: "Auckland, NZ", lat: -36.8485, lng: 174.7633, radiusMi: 120, country: "NZ" },
  { label: "Wellington, NZ", lat: -41.2865, lng: 174.7762, radiusMi: 120, country: "NZ" },
  { label: "Christchurch, NZ", lat: -43.5321, lng: 172.6362, radiusMi: 150, country: "NZ" },
];

// Japan — high WPN density, so anchor spacing is tight. Coverage follows
// the Tokaido megalopolis (Tokyo→Osaka), Hokkaido, Kyushu, and the major
// secondary cities. WotC's locator returns Japanese addresses; the country
// stamp lets us skip Nominatim for these.
export const JP_GRID: ScrapeRegion[] = [
  { label: "Tokyo, JP", lat: 35.6762, lng: 139.6503, radiusMi: 60, country: "JP" },
  { label: "Yokohama, JP", lat: 35.4437, lng: 139.6380, radiusMi: 50, country: "JP" },
  { label: "Saitama, JP", lat: 35.8617, lng: 139.6455, radiusMi: 50, country: "JP" },
  { label: "Chiba, JP", lat: 35.6074, lng: 140.1065, radiusMi: 50, country: "JP" },
  { label: "Nagoya, JP", lat: 35.1815, lng: 136.9066, radiusMi: 80, country: "JP" },
  { label: "Kyoto, JP", lat: 35.0116, lng: 135.7681, radiusMi: 50, country: "JP" },
  { label: "Osaka, JP", lat: 34.6937, lng: 135.5023, radiusMi: 50, country: "JP" },
  { label: "Kobe, JP", lat: 34.6901, lng: 135.1955, radiusMi: 50, country: "JP" },
  { label: "Hiroshima, JP", lat: 34.3853, lng: 132.4553, radiusMi: 100, country: "JP" },
  { label: "Sendai, JP", lat: 38.2682, lng: 140.8694, radiusMi: 100, country: "JP" },
  { label: "Sapporo, JP", lat: 43.0618, lng: 141.3545, radiusMi: 150, country: "JP" },
  { label: "Fukuoka, JP", lat: 33.5904, lng: 130.4017, radiusMi: 100, country: "JP" },
  { label: "Kumamoto, JP", lat: 32.8031, lng: 130.7079, radiusMi: 80, country: "JP" },
  { label: "Naha, JP", lat: 26.2124, lng: 127.6809, radiusMi: 80, country: "JP" },
  { label: "Niigata, JP", lat: 37.9026, lng: 139.0232, radiusMi: 100, country: "JP" },
  { label: "Kanazawa, JP", lat: 36.5613, lng: 136.6562, radiusMi: 100, country: "JP" },
];

/** Named registry of all grids. Order matters only for human display in
 *  the admin UI; runtime concat order is set by config.scrapeRegions. */
export const REGION_GRIDS = {
  CONUS: CONUS_GRID,
  CA: CA_GRID,
  UK_IE: UK_IE_GRID,
  EU: EU_GRID,
  AU_NZ: AU_NZ_GRID,
  JP: JP_GRID,
} as const;

export type RegionGridKey = keyof typeof REGION_GRIDS;

/** Concat the named grids into one ScrapeRegion[]. Passing no keys returns
 *  CONUS — the historical default. */
export function buildGrid(...keys: RegionGridKey[]): ScrapeRegion[] {
  if (keys.length === 0) return CONUS_GRID;
  return keys.flatMap((k) => REGION_GRIDS[k]);
}
