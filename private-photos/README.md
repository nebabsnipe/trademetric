# PRIVATE: unlicensed placeholder photos

**Nothing in this folder may ever reach `main` or the live site.**

These are real NFL player photos and team logos used only to design the desktop redesign on the private
`desktop-redesign` branch. **No licence has been bought for any of them.**

- `private.js` lists which headshot each player uses and where it is loaded from.
- Every player uses his headshot, everywhere (owner's call, 2026-11-27: no full-body cut-outs). The hero shows it
  enlarged. Nothing is stored here except the list; the pictures load from the image host.

How it is kept off the live site:
- The site only looks in here when `TM_PHOTO_MODE` in `js/photos.js` is `private`.
- `scripts/check-photos.mjs` runs on every Vercel build and **fails the build** if the branch is `main` (or the
  build is Production) and either this folder exists or the mode is `private`.

Before going public: delete this folder, set `TM_PHOTO_MODE` to `off` (or `licensed` once photos are bought).
