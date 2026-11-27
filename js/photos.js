/* ===== Player photos and team logos: the ONE place they come from =====
   Every player photo and NFL team logo on the site is asked for through tmPhoto() and tmTeamLogo(). No image
   address for a player or a team is written anywhere else.

   TM_PHOTO_MODE decides what those return:
     'off'       no photos, no logos. The site draws its own fallback (team-colour jersey, initials). Safe to ship.
     'licensed'  reads from a licensed source the owner fills in later (TM_PHOTO_LICENSED below).
     'private'   real photos for design work on a private branch only. Must never reach main
                 (scripts/check-photos.mjs fails the build if it does).

   Both functions return an image address, or null when there is nothing to show. Callers must handle null. */
var TM_PHOTO_MODE='off';
/* filled in when licensing is bought: where licensed images live. {id} and {team} are swapped in. */
var TM_PHOTO_LICENSED={head:null,hero:null,logo:null};
/* kind: 'head' (small headshot) or 'hero' (large cut-out for the My Team hero) */
function tmPhoto(playerId,kind){
  if(TM_PHOTO_MODE==='off'||!playerId)return null;
  if(TM_PHOTO_MODE==='licensed'){const t=TM_PHOTO_LICENSED[kind==='hero'?'hero':'head'];return t?t.replace('{id}',encodeURIComponent(playerId)):null}
  return null;   /* 'private' is wired up in the photos phase */
}
function tmTeamLogo(team){
  if(TM_PHOTO_MODE==='off'||!team)return null;
  if(TM_PHOTO_MODE==='licensed'){const t=TM_PHOTO_LICENSED.logo;return t?t.replace('{team}',encodeURIComponent(String(team).toLowerCase())):null}
  return null;
}
