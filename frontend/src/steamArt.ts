// Real, long-standing Steam CDN paths (the same ones the Steam client and
// store pages use) - not an API call, just a predictable URL shape keyed
// on a Steam App ID. These are the PRIMARY source when a table declares
// steamAppId; a table's own logoUrl/heroUrl are the fallback if the
// Steam-derived image 404s or steamAppId isn't set - see FallbackImage.
const STEAM_CDN = 'https://cdn.cloudflare.steamstatic.com/steam/apps';

// "header" is the classic 460x215 landscape capsule - matches the sidebar
// cover box's own landscape aspect ratio far better than the portrait
// library_600x900 capsule would (which needs heavy cropping to fill it).
// Verified live (curl): header.jpg exists on this CDN, cover.jpg does not.
export function steamHeaderUrl(appId: string): string {
  return `${STEAM_CDN}/${appId}/header.jpg`;
}

export function steamHeroUrl(appId: string): string {
  return `${STEAM_CDN}/${appId}/library_hero.jpg`;
}

export function steamLogoUrl(appId: string): string {
  return `${STEAM_CDN}/${appId}/logo.png`;
}

// "0" is Valve's own placeholder/test app id, and it's NOT the same as
// "unset" from this CDN's point of view - verified live (curl): app 0's
// header.jpg resolves with a real 200 and a genuine (tiny, blank) JPEG,
// not a 404. FallbackImage only advances to the next candidate on a load
// *failure*, so a naive "0" would silently "succeed" with that blank
// placeholder image instead of ever trying a table's own headerUrl/
// logoUrl/heroUrl. Treat "0" (and empty) as if steamAppId were never set.
export function hasSteamAppId(appId: string | undefined): appId is string {
  return !!appId && appId !== '0';
}
