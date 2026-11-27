/* ===== Player photos and team logos: the ONE place they come from =====
   Every player photo and NFL team logo on the site is asked for through tmPhoto() and tmTeamLogo(). No image
   address for a player or a team is written anywhere else.

   TM_PHOTO_MODE decides what those return:
     'off'       no photos, no logos. The site draws its own fallback (team-colour jersey, initials). Safe to ship.
     'licensed'  reads from the licensed set the owner adds later (TM_PHOTO_LICENSED below). A missing file falls
                 back to the same drawing as 'off'.
     'private'   real photos for design work on a private branch only. Must never reach main:
                 scripts/check-photos.mjs fails the build if it does. Everything it needs is in /private-photos/.

   Both functions return an image address, or null when there is nothing to show. Callers must handle null and a
   picture that fails to load. */
var TM_PHOTO_MODE='private';
/* where licensed images will live once bought. {id} is the player's id on this site (e.g. jahmyr-gibbs), {team} the
   team's short name in lower case (e.g. det). Fill the folder, then set the mode to 'licensed'. */
var TM_PHOTO_LICENSED={head:'/licensed-photos/head/{id}.webp',hero:'/licensed-photos/hero/{id}.webp',logo:'/licensed-photos/logo/{team}.webp'};
/* on a developer's own machine the mode can be flipped for testing without editing this file */
try{if(/^(localhost|127\.0\.0\.1)$/.test(location.hostname)){var _m=localStorage.getItem('tm-photo-mode');if(_m==='off'||_m==='licensed'||_m==='private')TM_PHOTO_MODE=_m}}catch(e){}
if(TM_PHOTO_MODE==='private'){(function(){var s=document.createElement('script');s.src='/private-photos/private.js?v=1';
  s.onload=function(){try{window.dispatchEvent(new Event('tm-photos'))}catch(e){}};s.onerror=function(){TM_PHOTO_MODE='off'};document.head.appendChild(s)})()}
/* kind: 'head' (small headshot) or 'hero' (large picture for the My Team hero) */
function tmPhoto(playerId,kind){
  if(TM_PHOTO_MODE==='off'||!playerId||/^dst-/.test(playerId))return null;
  if(TM_PHOTO_MODE==='licensed'){var t=TM_PHOTO_LICENSED[kind==='hero'?'hero':'head'];return t?t.replace('{id}',encodeURIComponent(playerId)):null}
  var P=window.TM_PHOTO_PRIVATE;return P?(kind==='hero'?P.hero(playerId):P.head(playerId)):null}
/* true when the hero picture is a full cut-out (stands on the pitch) rather than a head-and-shoulders shot */
function tmPhotoIsCutout(playerId){var P=window.TM_PHOTO_PRIVATE;return TM_PHOTO_MODE==='private'&&!!P&&P.isCutout(playerId)}
function tmTeamLogo(team){
  if(TM_PHOTO_MODE==='off'||!team)return null;
  if(TM_PHOTO_MODE==='licensed'){var t=TM_PHOTO_LICENSED.logo;return t?t.replace('{team}',encodeURIComponent(String(team).toLowerCase())):null}
  var P=window.TM_PHOTO_PRIVATE;return P?P.logo(team):null}
