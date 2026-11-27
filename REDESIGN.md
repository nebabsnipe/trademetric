# TradeMetric redesign

A full visual redesign, built on the `redesign-desktop` branch. **Not on main.** The owner will only ship it once player-photo licensing is bought.

## Where things are
- `css/tokens.css`: every colour, type size, spacing step and corner size (`--tm-*`). Dark by default, with a light version. Use only these.
- `css/redesign.css`: the desktop look (701px and wider), loaded after `css/styles.css`. Section 1 points the old variable names at the tokens, so every page picks up the new colours, type and corners. Sections 2 to 4 are the top bar, the core pieces and My Team.
- `js/photos.js`: the one list every photo slot reads (`TM_PHOTOS`). Empty on purpose. Only licensed photos go in it. Never download, hotlink or generate images of real players, teams or logos.
- The phone layout (the "Phone layout" block in `css/styles.css` and `js/mobile.js`) is untouched. Phone screenshots are pixel-for-pixel the same as before.

## The look
- Near-black page, one loud accent (`--tm-accent` to `--tm-accent-deep`), used big in the hero and sparingly elsewhere.
- Type: Anton for page headlines and big numbers only (28px and up). Inter for everything else. No italics anywhere on desktop.
- Sizes: 12, 14, 16, 20, 28, 40, 64, 96. Spacing: 4, 8, 12, 16, 24, 32, 48, 64. Corners: cards 20, small pieces 12, pills and buttons 999.
- The hero is loud; the data under it is calm.

## Core pieces (all in `css/redesign.css`)
Pill navigation (`.nav`), card (`.card`), buttons (`.btn`, `.seg`), page heading (`.hero h1`, `.kicker`), stat tile (`.tile`), player row (`.lrow`, `.slot`, `.lproj`), totals (`.total`), My Team hero (`.hero-team`, `.hero-star`, `.hero-num`), glass tiles (`#v-team .tiles`).

## Photo slots
- My Team hero shows the top projected starter: his cut-out if `TM_PHOTOS[id].hero` exists, his jersey tile if not.
- Small player badges (`av()` in `js/app.js`) show `TM_PHOTOS[id].head` if it exists, the jersey badge if not.

## Status
- Done: tokens, core pieces, My Team on desktop. Waiting for the owner's sign-off.
- Next, one tab at a time after sign-off: Trades, Players, News, Season Sim, League, Account. Those tabs already carry the new colours and type but keep their old layouts.
- Then the phone layout, on a `redesign-phone` branch made from this one. It must not edit `css/tokens.css` or the core pieces without asking.
