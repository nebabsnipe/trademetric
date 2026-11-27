/* Player photos for the redesign.
   Every photo slot on the site (the My Team hero cut-out, and the small headshots in lists) reads from this one list.
   It is empty on purpose: add a line per player only for photos TradeMetric has a licence to use.
   A player with no line here gets the jersey tile in his team's colours instead, so every page looks finished with no photos.

   hero: a cut-out with a see-through background (PNG or WebP, about 600px tall), shown big on My Team
   head: a small square headshot (about 96px), shown in lineup rows and lists

   Example:
     window.TM_PHOTOS = {
       "00-0036900": { hero: "/photos/hero/00-0036900.webp", head: "/photos/head/00-0036900.webp" }
     };
   The key is the player's id, the same one the stats use. */
window.TM_PHOTOS = {};
