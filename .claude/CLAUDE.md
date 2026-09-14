# CLAUDE.md

Project instructions for Claude Code. Read this before doing anything else.

## What this project is

**Larder Log** — a pantry and freezer inventory tracker for a household. Track
what you have, how much, and where it lives; see what's low or out; build a
shopping list per store.

**This is NOT a WordPress plugin.** It lives in
`/wp-content/plugins/space-larder-log/` purely for convenience. The parent
directory really is full of WordPress plugins -- the `x3p0-*` siblings beside
it are the genuine article -- and this is not one of them. WordPress-era
`.gitignore` entries are the only leftover still in the tree. Ignore all of
that.

**The repository is `x3p0-dev/space-larder-log`**, renamed from
`x3p0-larder-log` on 2026-09-03 along with the working directory. `x3p0-` is
the WordPress namespace and this project is Spacefast-specific, which is what
the rename records. GitHub redirects the old URL indefinitely, so the commit
links in every published version's git provenance still resolve -- **but that
redirect dies the moment anything else claims the name `x3p0-dev/x3p0-larder-log`**,
so do not create one.

Never propose custom post types, taxonomies, post meta, `wp-scripts`,
`plugin.php`, or anything else WordPress. If a request seems to assume
WordPress, say so rather than building it.

## Current state

**v37 is live as of 2026-09-10** (`ver_a70cef5710e44680a67a3301c1dcc3f3`, 154
files, **4** uploaded, 70 seconds) and it is **non-migrating** — the plan was
zero operations, since v32 created the tables. It carries three fixes to the run
list's ticks and nothing else; see *The run list's ticks* below, which is the
account of a bug that took a whole evening and whose root cause is **still
unexplained**. Verified: `GET /` 200, `/api/status` `ok`, fifteen tables /
fifteen queries / thirty-two mutations, no pending version, `answeredAt` present
in the served bundle, and the anonymous probe answering exactly as v32's did.

**v32 went live earlier the same day, and it carries D64 through D76.**
`ver_9b0cdd816c5243ebb04a6d0dbc60eed2`, 156 files, 54 uploaded, 47 seconds —
the first publish since v19 on 2026-08-31 and **the largest migration this
project has run**: `applied: true`, `pendingOperationCount: 0`, both schema
hashes equal at `sha256:d0306af4…`, and **4 `create_table` (`claims`,
`deletions`, `restocks`, `trips`) + 27 `add_column` + 12 `add_index`**, additive
throughout. **Fifteen tables, fifteen queries, thirty-two mutations** live.
**So every *"built and unpublished"* line below is now stale** — restock (D64),
the list override (D65), shared claims (D66), bulk entry (D67), delete account
(D68), the charts (D69, D72), the scale rollup (D70, D76), the deletion ledger
(D71), the A–Z run list (D74) and both exports (D75) are all in production. Only
D73's type sort is genuinely unbuilt, and it is unbuilt on purpose.

**It ended a nine-day publishing blockade.** Every version finalized between
2026-09-01 and 2026-09-10 answered `422 zero_artifact_mode_invalid` — the
platform's runner began requiring an `executionMode` on each emitted handler and
no released compiler wrote one. **`spacefast@0.4.1` / `@spacefast/zero@0.4.1`
emit it**, and the hand-patched toolchain that worked around it is retired.

**One thing has to be done by hand, once**: press **Count them** on the
console's Overview. The live household predates D76's rollup columns, so it
reports as *not counted* until the repair walks it.

Verified the usual way plus two new checks: `GET /` 200 — **and `/` is a page
route now, not a static `index.html`** — `/api/status` `ok`, all three payload
hashes `shasum`-matching `.spacefast/zero/public/`, D29 holding (`.claude/`,
`.docs/`, `.env.server`, `.spacefast/`, `.dev/` all 403), `theme.json` and
`sf.jsonc` 404 while `package-lock.json` serves, all seven icons 200, and the
**anonymous probe answering exactly as v17 taught it to**: `households`,
`profile`, `account` and `claims` all `guest`, `adminAccess`
`{admin:false, writesHeld:true}`, `adminSummary` `denied`, and
`createHousehold`, `addItems`, `restockItems`, `deleteMyAccount` and
`adminRepairCounts` all refused. No pending version and no operation in flight.

**`LICENSE.md` stopped serving raw and is a rendered document now** — `/LICENSE`
308s to `/LICENSE/` and returns HTML, because 0.4.1 treats a payload `.md` as a
document. Nothing depended on it; the old check that it serves at `/LICENSE.md`
is retired.

**The rollback point, if it is ever needed**: `sf rollback
ver_28fb39a4d5aa40a4b8ed9f53c5987d34` returns to v19 — but that is eleven
tables against fifteen, and `blockIncompatibleRollback: true`, so it is not a
free move any more.

**Phase 5 — the admin console — is built and live.** The whole of D62's
design except board 10, in seven stages on 2026-08-29: the pushed drawer pane,
Overview, the household list and page, People and the account page, ownership
transfer, the account-deletion pre-flight, the audit log with retention and
export, the orphan dialog, the list states and 390. **Its schema change went
out with v15** — `activity`, the eleventh table — so every publish since has
been non-migrating. It *is* reachable in
production now: `.env.server` carries `LARDER_ADMIN_IDS` with Justin's real
`account:` id beside his dev `guest:` one — see *Going live needs one id that
nothing will tell you* below, which is how that id was found. See *The admin
console (D62)* below, which is the single account of it. **Its mobile layouts
were looked at on 2026-08-30 and read correctly.**
**Its interaction states were swept on 2026-08-30** — ten controls were missing
hover, press, focus or an open state they were written to have, and all seven
screens' `Loading…` became a state that can escalate; see *Every console
control has its states now*, which also lists what is left in its *Gaps*.
**Its six writes are switched off** as of 2026-08-30 — `ADMIN_WRITES_HELD` in
`shared/admin.ts`, refused server-side by `requireAdminWrite` and greyed out on
both screens that hold them, so the first look at the console cannot delete
anything. See *The writes are held, and the console is read-only*.
**It gained two charts on 2026-09-02** (D69) — *Pantry sizes* on Overview and
*Items added* on a household page — and **lost the cumulative line**, whose slot
is *New households per month* now. No schema change; the sparklines that went
into the stat cards with them were built and removed the same day. See *Two
charts that say what the counts cannot*.

**Built and unpublished: restock (D64), the list override (D65) and shared claims (D66).** A check on the run list is a **claim**
now, and the count is written once, at the put-away — the trip bar's right half,
empty since the list was first drawn. Built from
`.claude/docs/design/restock.md` on 2026-08-31. **One schema change**: `restocks`,
the twelfth table, and **twenty-six mutations** — the new one is `restockItems`.
**D65 built the first of the two things restock unblocked**: the `Always` /
`Never` tri-state, which adds `items.listRule` and finally gives D60's retired
column a control that can set it. **D66 then built shared claims** — the half
deferred at the start, and the one that makes the list a shared list: `trips`
and `claims`, the thirteenth and fourteenth tables, so a row somebody else has
ticked draws **their face in the tick column** and cannot be taken. **Trends
tier 2 is the one part of `restock.md` still unbuilt**, and it is
**decided against for now** — the log records put-aways, and two of the three
ways to raise a count write nothing, so *you restock this every three weeks*
would be a confident sentence about a biased sample. See *Restock — the trip
that ends (D64)*, *The list override is a tri-state (D65)* and *Claims are
shared (D66)* below.

**Built and reverted the same day: the run list's type sort (D73).** A source
card orders its rows alphabetically, which is the order that is cheapest to
compute rather than one anybody chose; the household's **Type** terms already
sit in an order and the run list has never read it. Built from
`.claude/docs/design/run-list-sorting.md` on 2026-09-02 and **taken back out the
same day** — `client/`, `shared/` and `tests/` are byte-identical to what they
were before, checked against `HEAD`. **The rule was never the problem; the
control was**, and the measurement that killed it is worth keeping: **row 2 in
list mode has about five pixels spare at a docked 1120**, so anything added to
it costs the run segment its words. See *The type sort is built, measured and
reverted (D73)* below, which records what is settled and where to start again.

**Built and unpublished: delete account (D68).** The last capability the app had
no control for — you could not hand a household over, so you could not leave the
ones you solely own, so you could not delete your account at all. Built from
`.claude/docs/design/delete-account.md` on 2026-09-01. **No schema change**:
fourteen tables, **fifteen** queries, **thirty-one** mutations — `account`,
`transferOwnership` and `deleteMyAccount` — and `db.migrations` empty. The
account menu's identity row is a **door** now rather than a display, and the
display name moved with it into a pushed *Your account* pane. **Export arrived
with it and is two features**, in two places. **Both exports that describe
rows offer CSV or JSON** as of 2026-09-02, which reverses its *one file, no
picker* — see *An export is CSV or JSON* (D75). See *Delete account — leaving every
household at once (D68)* below.

**Built and unpublished: bulk entry (D67).** The adoption wall — twenty items is
a sample dataset and a real pantry is two hundred. Built from
`.claude/docs/design/bulk-entry.md` on 2026-08-31. **No schema change**:
fourteen tables, fourteen queries, **twenty-nine** mutations, the new one being
`addItems`, and `db.migrations` empty. Two sources — a paste dialog and a
common-items checklist — feeding **one review table**, and nothing is written
until Add. The `Add item` primary is a **split button** now, the app's first.
**`Save and add another` was built and removed the same day** on Justin's own
look at it: the sheet's footer is too cramped for a third control, and
`ItemSheet.tsx` is byte-identical to what it was before the work. See *Bulk
entry — the adoption wall (D67)* below.

**D64 and D65 worked on the first pass** — a real session on 2026-08-31, which
no phase of this size has managed before; **390 and a twenty-row put-away are
what that session did not cover**. **D66 was exercised in part** — two named
guests on one machine, the claimed row and its face confirmed — and its copy
went through three passes on the strength of that.

**Live as of v18: autofill (D63) and three fixes.** Two suggestion menus — one under
the item name on the Add / Edit sheet, one under the top-bar search — built from
`.claude/docs/design/autofill.md` on 2026-08-31. No schema change; the artifact
is unchanged. It also brings the item grid's search into line with the menu's
matching, gives the search field the `×` D45 has claimed since it was written,
and adds `shared/suggest.ts` and `shared/catalog.ts`. **`Dry Goods` is a
fifteenth seeded type** with it (D50, amended), which reaches new households
only. See *Autofill — the name field and search (D63)* below.

**Three fixes rode with it, all found by using the app.** The console's two
cross-links landed on a list rather than on the row that was pressed; the
Members card's last row overflowed its own corner; and `useAvatarSync` had never
run, because a membership written before `memberships.picture` existed reads
back as **`null`** rather than the declared `''` and the row type says `string`
either way. The last is a **capsule** change and the only one of the three that
is not client-only. See *The console's two seams land where they were aimed* and
*An old row reads back `null`, and the avatar sync never ran* below.

**v18 is live** as of 2026-08-31 (`ver_f8f24058016d4a5bb1b9ea8900ec94f6`, 134
files, **16** uploaded, 22 seconds), and it is **non-migrating**: no schema
change, `db.migrations` empty, eleven tables. It carries autofill and the three
fixes above — **the capsule moved**, so it is the first publish since v14 that
is not client-only. Verified the usual way: `GET /` 200, `/api/status` `ok`, all
three payload hashes `shasum`-matching `.spacefast/zero/public/`, D29 holding
(`.claude/`, `.docs/`, `.env.server`, `.spacefast/` all 403), `theme.json` and
`sf.jsonc` 404 while `LICENSE.md` and `package-lock.json` serve, and all seven
icons 200. **The anonymous probe answers byte-identically to v17** — `households`
and `profile` `guest`, `adminAccess` `{admin:false, writesHeld:true}`,
`adminSummary` `denied`, `createHousehold` refused — so the capsule change
moved nothing about who may do what.

**It took two attempts, and the first failed after the payload was staged.**
`Creating version` died on `Runtime API request timed out after 10000ms`, a
client-side 10s cap rather than a server refusal. **Nothing was created** —
`sf versions list` still showed v17 live with no v18 — and the plain retry
succeeded. **Check `sf versions list` before retrying a publish that dies at
that step**, rather than assuming either outcome. Logged in
`.claude/docs/spacefast.md`.

**v17 rebuilt the auth model.** Local is a named
`?guest=` identity, production is authenticated accounts only, `guest:local` is
refused everywhere, and the admin hold now exempts dev guests so the deletion
flows are testable locally and unreachable live. **Two people can be tested on
one machine for the first time.** See *Local is a named guest now* below.
**`sf dev` needs `?guest=<name>` in the URL now** — a bare `http://127.0.0.1:4173/`
shows a card telling you so.

**v17 is live** as of 2026-08-30 (`ver_2f2cacb9334c41489376766ea7a043ab`, 130
files, **9** uploaded, 25 seconds), and it is **client-and-handlers only**: no
schema change, `db.migrations` empty, and `zero.css` and `site.webmanifest`
byte-identical to v16's — only `client.js` moved. It carries the auth rebuild,
and **the probe that matters was run against the live space immediately after**,
which is the whole point of the version. An anonymous `curl` now gets:

| query | v17 answers an anonymous caller |
|---|---|
| `households` | **`guest`** — v16 answered `no-household`, measured minutes before |
| `profile` | `guest` |
| `adminAccess` | `{admin: false, writesHeld: true}` |
| `adminSummary` | `denied` |
| `createHousehold` | **refused** — a 500, which is what a thrown refusal looks like |

Only `households` and `adminAccess` were measured on **both** versions; the
other three rows are v17 alone.

**The `isSignedIn` bypass is closed in production.** Verified the rest of the
usual way in the same pass: `GET /` 200, `/api/status` `ok`, all three payload
hashes `shasum`-matching `.spacefast/zero/public/`, D29 holding (`.claude/`,
`.docs/`, `.env.server`, `.spacefast/` all 403), `theme.json` and `sf.jsonc`
404 while `LICENSE.md` and `package-lock.json` serve, and all seven icons 200.
**Publishing was again a plain `npx sf publish`, first try** — the third in a
row since the rationale blockade ended.

**One thing the post-publish probe turned up, and it is not v17's doing.**
`createHousehold` refuses an anonymous caller by throwing
`AccessError('Sign in to use Larder Log.')`, and what production returns is a
500 whose `detail` is the constant `Exception generated by QuickJS` — **the
message is gone**. `server/auth.ts`'s own comment says the opposite: that a
thrown message is copied verbatim into the response body, which is the entire
reason `AccessError` exists and why its sentences are written to be read. That
was established by a spike, and the spike was almost certainly local — so it
looks like a **fourth** local/hosted divergence after `crypto`, row ids and
`ctx.log`. **Measured on the hosted side only; `sf dev` has not been re-checked.**

The consequence is bigger than one comment: **no mutation in this app can show
a person why it refused.** Every `AccessError` message — the sign-in refusal,
`'You do not have permission to do that.'`, and `ADMIN_HELD_REFUSAL`, which was
written specifically so an administrator would understand the hold — is
invisible in production, and a deliberate refusal is byte-identical to a crash
for the client *and* for monitoring. **Do not write another user-facing sentence
into a `throw` until this is settled.** The fix has a decision in it: model
refusals as a *successful* mutation returning a result union, the way queries
already return `QueryState`. Not done, and not v17's job.

**v16** (`ver_239edfa03f374616b519a0596ec77c25`) carried the admin console and,
one publish later, **the security fix v15 needed**: `isAdminUser` had a
dev-guest bypass, and the hosted runtime hands an unauthenticated caller
exactly that identity, so v15 answered `adminAccess` with
`{admin: true}` to anybody with a `curl`. **Read *The dev-guest identity is what
production hands a stranger* before writing another auth check.** `isSignedIn`
carried the same bypass until **v17** closed it.
**v15** (`ver_f9e87dfdc2f64fbd87b7bcdafcc91b76`, 129 files, 17 uploaded, 23
seconds) was the migrating publish: the `activity` table created, `applied:
true`, `pendingOperationCount: 0`, both schema hashes equal, eleven tables live.

**Phases 3 and 4 are built and published.** **v14** (2026-08-29)
(`ver_baf737f272f144f59de420f12f8c2c55`, 125 files, 7 uploaded, 18 seconds) was
**the first publish that is client-only**: no schema change, `db.migrations`
empty, and `schemaHash` byte-identical to v13's. It carries the run list's row-2
rework, the `ResizeObserver` fix, and the two hover states — see *Row 2 holds
the whole run list*. Verified the usual way plus the payload hash: `client.js`,
`zero.css` and `site.webmanifest` all `shasum`-match
`.spacefast/zero/public/`. **The first thing worth clicking on it is a resize**
— `compact` has never once been false in production before this version.

**v13** (`ver_cb18bde5f0e44c5db5fa37f75c9d4470`, 125 files, 16 seconds) carries
**all of `garden-and-kitchen.md`'s v1**: D58 (a source's kind, the STORE/SOURCE
rename, the kind menu, the item card's glyphs), the run list's three bands,
the item side's season, D60's retirement of the off-list checkbox, and D61's
first-run source mix. It took **three** columns live — `stores.kind` and
`items.seasonFrom` / `items.seasonTo` — the seventh and eighth additive schema
changes since Phase 2. Verified the usual way: `applied: true`,
`pendingOperationCount: 0`, a `migrations` array naming all three `add_column`
ops with their defaults, and `data.schemaHash` equal to
`data.plan.appliedSchemaHash` — read at their two different depths.

**v13 was the publish that ended the rationale blockade**, and **v14 confirmed
it**: a second plain `npx sf publish`, first try, no shim. It went out with
a plain `npx sf publish`, first try, no shim and no `NODE_OPTIONS` — see
*Publishing works* below, which is rewritten.

v12 (`ver_50b38d7b92f2450a999c7835726c6411`, 121 files) carried Phases 4.13 and
4.14 and D52–D57, and is **the publish that took four columns live in one go**:
`items.size`, `items.unit`, `items.offShoppingList` (D52/D53) and
`memberships.picture` (D55), the fourth, fifth and sixth additive schema changes
since Phase 2.

v11 (`ver_1c0448898da744d3b2b42a89c4272e21`, 93 files) carried Phases 4.10–4.12
and D45–D51, and took the `profiles` table live (D46).

v10 (`ver_0026484fd67c495b8d3b7d52b9215d67`) was the legacy-hex swatch fix. v9 added a
document-level `color-scheme` meta and removed `/api/probe`, which is **gone
from the artifact and 404s in production even with its key**. v8 is what carried
the schema:

**v8** (`ver_09cc0c8a8bb34dd38ed92fae693c63d4`, 105 files, 16 seconds) carried
everything through D44 — the nine stamp columns, the A–Z term order, and the
device fixes. The v4 publish on 2026-08-26 ended a three-day blockade; v5–v7
were the probe rounds that found the hosted-runtime divergences. Publishing
needed a rationale-header shim from v4 through v12; **it does not any more** —
see *Publishing works plainly again* below.

**The hosted runtime is a different JS engine from the one `sf dev` runs**,
which broke `createInvite` in production while it worked locally — read *The
hosted runtime is not the engine `sf dev` runs* before writing any handler.

A real Spacefast Zero project: `sf.jsonc`,
`theme.json`, a Preact + TypeScript client in `client/`, pure domain logic in
`shared/`, and a capsule in `server/` holding the full schema from
`.docs/data-model.md`, **fifteen** live queries, and **thirty-two** mutations
across **fifteen** tables. The `restocks`, `trips` and `claims` tables,
`items.listRule`, one query and eight mutations are restock's, bulk entry's and
account deletion's (D64–D68) and are **unpublished** — built and verified
locally, not yet in a version. **Only D64–D66 cost schema**; D67 and D68 added
handlers and nothing else. `deletions` is D71's fifteenth table, and
`households`' four rollup columns plus `adminRepairCounts` are D70's and D76's —
all also unpublished. The schema is
declared inline in `server/index.ts` and **has to be** — see
[D27](../.docs/decisions.md#d27-the-schema-has-to-be-a-literal-in-the-server-entry)
before editing it.

Data lives in the database. **Four** `localStorage` call sites remain, all
correct: the per-device theme override (D25), which household this device is
pointed at (D33), the shopping trip's ticks, its id and its list mode (D41, D64 — a record per
household now, so a trip survives switching away and back), and where the
view was left — drawer, tab and filters (D51). Same reasoning throughout — a
dark-mode choice on a phone should not follow you to a desktop, neither should
which pantry you were last looking at, and neither should which shelf you had
filtered to; the trip is a record of what is in *this* person's cart right now.

**A user may belong to several households** as of 2026-08-25
([D33](../.docs/decisions.md#d33-a-user-may-belong-to-several-households),
which supersedes D18). Every query and scoped mutation names a household, and
the id is a **selector, never an authority** — handlers resolve it against the
caller's own memberships. Reads heal (`selectMembership` falls back to a
deterministic default when the requested household is not yours), writes refuse
(`findMembership` matches exactly or throws). Roles are per household: the same
person can be an owner in one pantry and a viewer in another. It needed **no
migration** — D3 built the schema for this.

The React/Vite prototype in `src/` is **deleted**, along with `index.html`,
`vite.config.js`, and the react/vite/tailwind dependencies. Zero compiles
Tailwind itself. There is no `npm run prototype` any more.

Phase 3 added the client half of households, members, and invites — the six
server handlers had shipped with Phase 2. Invite links are `/?join=<code>`
rather than `/join/<code>`, because the published space serves nothing at an
unknown path and `sf publish --dry-run` prints `SPA false`
([D28](../.docs/decisions.md#d28-an-invite-link-is-joincode-not-joincode)).
The project's own docs are no longer in the publish payload: `docs/` is `.docs/`
and this file is `.claude/CLAUDE.md`, both behind the serving layer's 403 on
dot-prefixed paths
([D29](../.docs/decisions.md#d29-the-projects-own-documentation-is-kept-out-of-the-publish-payload)).
**Phase 3 is exercised end to end as of 2026-08-27**: an invite was minted on
the published space and **a second person redeemed it and joined the
household**. Invites, membership and roles have now been through a real two-user
round trip rather than one identity in two tabs. D33's other half is closed
too: one identity in two households was already verified server-side, and two
*people* sharing one household now is.

Phase 4's read-only pass landed on 2026-08-25: every write affordance is gated
on `can()` and is **absent rather than disabled**, with one "View only" chip
explaining it ([D30](../.docs/decisions.md#d30-a-viewers-missing-controls-are-absent-not-disabled),
which amends D20). Verified locally against the real code path — `sf dev` makes
you an owner, so a throwaway endpoint rewrote the caller's own role, and it has
been removed. The rest of Phase 4 was already built and the roadmap now says so.

### The Cellar reskin (Phase 4.5) is built, and is the bulk of the current diff

Everything structural in `.claude/docs/design/ui-directions.md` is implemented,
the household switcher included — it was the last one deferred, and D33 settled
the decision it was waiting on. What landed on 2026-08-25:

- **Tokens.** `theme.json` carries the warm-brown palette and an 8-step type
  scale as `light-dark()` pairs. Term colors became *tokens* rather than hexes
  ([D32](../.docs/decisions.md#d32-a-term-stores-a-color-token-not-a-color));
  `shared/palette.ts` says which exist, `client/lib/palette.ts` says what they
  look like.
- **Both themes.** Light and dark come from the same table, including a full
  dark quad for all sixteen term colors.
- **New surfaces.** Item card, the dark left drawer (docked / slide-over /
  68px collapsed rail with flyouts), the Filter and Settings panes, the item
  sheet for add *and* edit, and the sort menu. (The contextual shopping list
  that landed with it has since been replaced — see Phase 4.8.)
- **Interaction states** live in `client/lib/controlStyles.ts` as literal class
  strings — `DRAWER_*` and `PAGE_*`. Inline styles cannot express `:hover`,
  which is why the drawer shipped once with no feedback at all.
- **Nine components were replaced and deleted**: `Sidebar`, `FacetSection`,
  `SettingsDrawer`, `TaxonomyManager`, `ItemFields`, `ChipPicker`,
  `IconPicker`, plus the `createTermFor` adapter.
- **The household switcher is built** (2026-08-25) — the drawer's household row
  and the rail's household flyout both open it: every household you belong to
  with your role and item count, a check on the current one, then *New
  household* and *Join with a link*. `HouseholdSwitcher` is the contents; each
  host owns its own dismissal.
- **Term icons were cut** and the `icon` column kept, holding `''`
  ([D34](../.docs/decisions.md#d34-term-icons-are-cut-and-the-column-is-kept)).
  `shared/icons.ts` and `client/lib/icons.ts` are gone. Do not "clean up" the
  column: dropping it needs `sf db migrate --drop`, refilling it is additive.

**Published as of 2026-08-26 (v4) and seen by a second person on 2026-08-27.** Two `font-mono` sites remain: the switcher's invite-code field,
which is arguably a real monospace use, and one loading string in `Pantry`.

### Destructive actions (Phase 4.6) are built — 2026-08-26

The spec's *Destructive actions* section, governed by
[D36](../.docs/decisions.md#d36-undo-what-comes-back-confirm-what-doesnt):
**undo what comes back, confirm what doesn't**. Two components replace the three
idioms that were there before.

- **`Toast.tsx` / `useToasts.ts`** — actionable (6s, Undo, dismiss) and plain
  (3.5s, no controls); the drawer surface in both themes; a timer bar that
  pauses on hover and focus; max 3 stacked; Cmd/Ctrl+Z from anywhere. Each row
  owns its own countdown, so hovering one pauses only that one. `UndoToast` is
  deleted.
- **`ConfirmDialog.tsx`** — one shell for confirm, blocked, and the app's only
  typed confirmation. **Crimson is never a button**: the primary is the ordinary
  ink/cream fill, and crimson appears once as the icon tint.
- **Every term kind now blocks while in use**, widening D16 from locations
  alone. `termBlock` in `shared/term.ts` is one rule the server throws and the
  client renders — do not write that sentence twice. The trash on an editing row
  is **live in every case and neutral, never disabled** (a disabled control
  cannot explain itself), with the item count beside it.
- **Leave household** moved to the foot of the Household section and relabels to
  *Delete household* for the last member. `deleteHousehold` finally has a client
  caller.
- ***Recently added* got a sort at all** (D35). It previously applied none, so
  it rendered oldest-first — the opposite of its label. It sorted on the
  platform's `createdAt` until D44 moved it to `addedAt` on 2026-08-27.

### Flows outside the shell (Phase 4.7) are built — 2026-08-26

The spec's *Flows outside the shell* and *The marketing page*. Everything before
the app shell.

- **The signed-out surface is two pages**
  ([D37](../.docs/decisions.md#d37-the-signed-out-surface-is-two-pages-not-one)):
  `/` is a marketing page, any other URL is a bounce to the sign-in card. The
  entry routes on the visitor's reason for being there — invitation, then an
  abandoned sign-in, then the path.
- **New components.** `MarketingPage`, `SignInCard` (plus `SigningInCard` and
  `SignInFailedCard`), `FirstRun`, `InviteLanding`, and the furniture they share
  in `OutsideShell` and `Brand`. `JoinBox` and the in-app invite banner are
  **deleted**; the `Gate` in `Pantry.tsx` no longer handles invites at all.
- **The hero mock is the real `ItemCard` and its steppers are live** — three
  sample rows, stocked / low / out, with working plus and minus so a visitor
  watches the ramp move rather than reading about it. `HeroMock` holds the
  quantities so a press re-renders three cards and not the page. The step is
  `fromInt(toInt(qty) + step)`, the same expression `adjustQty` runs — do not
  reimplement the clamp. `ItemCard`'s `canExpand={false}` drops the chevron:
  there is no *Edit* or *Remove* behind the accordion on a public page.
- **`invitePreview` is the one query that answers a guest**
  ([D39](../.docs/decisions.md#d39-an-invite-preview-is-the-one-query-that-answers-a-guest)).
  The code is the authorization. Unknown, malformed and **revoked** collapse to
  one bare `invalid` — naming the household behind a dead link would tell a
  stranger something about it. Expired is the exception, because that screen
  exists to say who to ask for a new one.
- **Signing in is the accept**
  ([D38](../.docs/decisions.md#d38-signing-in-is-the-accept)). The consent is
  written beside the code in `sessionStorage` *before* the redirect, and
  `Pantry` redeems on arrival. Zero's sign-in is a full-page
  `location.assign` — there is no popup and no promise that survives it.
- **The empty household.** At zero items the top bar carries neither the sort
  trigger nor an *Add item*; the empty state owns the screen's only primary.
  `empty` is `items.length === 0`, **not** `sorted.length === 0` — a filter that
  matches nothing is a different screen and keeps its one quiet sentence.
- **Seeds are generic now** — Pantry · Refrigerator · Freezer and Grocery ·
  Warehouse · Market ([D40](../.docs/decisions.md#d40-seeded-terms-are-generic-and-there-are-still-three-stores)).
  **Types are the exception and were rewritten on 2026-08-27** — see *The
  seeded types cover a supermarket* below.
- **`Theme` gained `dark`, `accent`, `disabledBg` and `disabledText`**;
  `theme.json` gained `wordmark-md`, `wordmark-lg`, `headline-sm` and
  `headline`. `accent` exists because the page wordmark was hard-coding the
  light crimson in both themes.

### The shopping list (Phase 4.8) is built — 2026-08-26

The spec's *Shopping list*, governed by
[D41](../.docs/decisions.md#d41-the-shopping-list-is-a-mode-and-its-checks-are-local):
**the list is a view of the items, not a thing you keep.** It is a *mode* that
replaces the content column, not a modal over it. `ShoppingListModal` and the
store banner above the grid are **deleted**; the Store filter is a filter again.

- **`shared/shoppingList.ts`** (now `shared/runList.ts` — D58) owns the grouping and both orderings — groups
  A–Z with the storeless one last, and **rows plain A–Z** — it was
  out-before-low then A–Z, the *Needs restocking* sort reused rather than
  written twice, until **D74** dropped the status step (2026-09-02). An item
  naming several stores appears under **every** one of them, so the count is of
  items and never of rows. `npm test` is at 150 assertions.
- **`ShoppingList.tsx`** — one card per store in
  `md:grid-cols-[repeat(auto-fill,minmax(min(460px,100%),1fr))]`. **`auto-fill`,
  not `auto-fit`**, and that is the opposite of the item grid on purpose: with
  one card left after a store filter, `auto-fit` would stretch it across the
  screen. The card header is the tag component stretched to the card's width.
- **The whole row is the checkbox** (amended 2026-08-28 — see below). Below
  `md` it stacks — the spec leaves the exact breakpoint open and `md` is a
  choice made here.
- **`ShoppingListTrigger.tsx`** sits **immediately after the three status
  pills** and is **secondary** — `surface` on `line strong`, ink label, ink
  count pill. Placement does the work colour would have: the eye crosses
  `9 in stock · 6 running low · 5 out` and lands on the thing to do about it.
  It was amber for one round, which put it a gap away from `6 running low` —
  already amber, and meaning something else. Hidden when nothing is low or out.
  **Its count is the household's, never the filtered one.** When space is short
  it drops its label for a cart glyph.
- **The trigger is a toggle that stays put** (2026-08-27, amending D41). It was
  a pair — *Shopping list* going in, `‹ Back to items` coming out — and below
  `md` the two lived in **different rows**, so a press moved the thing under
  your finger. Now it holds its slot at every width, keeps its label, and wears
  the **low tint** when the mode is on — `low.bg` filled, `low.ink` for border
  and label, count pill inverted, `aria-pressed` — which is what the first
  boards drew for it. **Amber is still rejected at rest** and the reason is why
  it works here: in list mode the status pills are not on screen, so nothing
  else in the row is amber. Its border is the low *text* colour, never the
  border token, per the contrast note above.
- **Row 2's left slot holds its width in both modes.** The pills go
  `invisible` rather than unmounting and *Back to items* is laid over them
  absolutely, because unmounting them slid the trigger a third of the way across
  a 1440 screen on every press. `visibility: hidden` keeps the geometry *and*
  drops the pills from the tab order, which `opacity-0` would not.
- **The exit is quiet now** — chevron plus bold words on nothing, resolving
  under the pointer. Its resting half is `PAGE_BUTTON_QUIET` in
  `controlStyles`, **shared with the sort trigger**, which is the other quiet
  control in that row.
- **Row 2 sizes off the measured content column, not the viewport.** A
  `ResizeObserver` on `<main>` sets `compact` below `ROW2_FULL_PX` (910, derived
  from the parts), which is what the pills, the trigger and the sort all read.
  `md:` was wrong in the middle: a docked drawer costs 340px, so a 1280 screen
  leaves 872 and is as cramped as a phone. **Do not put these controls back on a
  breakpoint.**
- **Below `md` the trigger lives in the mobile header**, squared up with the
  wordmark opposite the menu button — it is chrome, and moving it there is what
  lets the status pills and the sort share one line at 390. **It stays there in
  list mode too**, tinted. The *exit* stays in row 2 with the list it exits. Row
  2 drops `Showing X of Y` when compact.
- **`useTripChecks.ts`** — checks in `localStorage`, the **third** thing there
  after the theme (D25) and the household (D33). Cleared when the item leaves
  the list, after 24 hours with no ticking, or on a household switch. The
  household id is stored *in* the record rather than used as its key, because a
  key per household would hand yesterday's ticks back on a switch away and back.
- **`Theme` gained `divider`** — a hairline *inside* a card. Softer than
  `border` in light and identical to it in dark: at `#E2D5C0` a rule every 56px
  stripes a card into a ladder, and anything below `#3E3527` vanishes at the
  dark fill.
- **Row 2 empties out and re-fills in list mode** — the status pills go (you are
  already filtered to low and out) and so does the sort trigger (the list has
  one fixed order). *Back to items* takes the left, over the pills' reserved
  width; the trigger stays exactly where it was and tints; and
  `11 to buy · 4 stores · 3 in the cart` takes the right. **Row 1 never
  changes**, so the switch reads as the content changing rather than the app
  changing.
- **The status pills tighten at 390 rather than truncating** — padding 16 → 13,
  gap 9 → 7, label 14 → 13.5 — which is what makes room for the trigger's row.

**Built twice.** The first pass was specced against a top bar with a title and
no status pills, which **does not exist**; the `-2` boards drew the real one and
the trigger changed colour and position. The mobile primary was left alone —
the boards draw *Add item* at 390 as a square in row 1, and the pinned bottom
bar is correct. **The lesson is the spec's own: anything not drawn on a canvas
drifts out of the design document silently.**

**One copy change on the marketing page**, and it is the only place the build
now differs from the front-door boards: the third benefit said *"Nothing to tick
off"*, which the checkbox makes false.

Verified the usual way: the capsule compiles and reloads, `npm run typecheck`
is clean, `npm test` passes, and every new utility class is in `/zero.css` —
checked by **printing the selectors**, not by hand-writing the escaped form.

### Household colour (Phase 4.9) is built — 2026-08-26

The spec's *Household colour*, governed by
[D42](../.docs/decisions.md#d42-a-household-has-a-colour-and-it-is-one-of-the-sixteen).
**The first of two additive schema changes since Phase 2** (the other is D44's
nine stamp columns): `households.ink`,
a colour token defaulting to `''`. Nine tables and sixteen mutations still; the
column applies on the next publish with no flag.

- **The rail, the switcher and the invite card all drew a tile that nothing
  set.** The rail took the *first location's* colour and `invitePreview`
  returned the same stand-in, so every seeded household was olive and renaming a
  location could recolour a pantry. `invitePreview` no longer reads `locations`.
- **`shared/household.ts`** — `householdLetter()` (first letter of the first word
  that is not an article: *The Lake Cabin* gives **L**), `householdInk()`
  (an unset colour resolves from the row **id**, so it survives a rename), and
  `toHouseholdInk()` (a token or `''`; a legacy hex is refused, unlike
  `normalizeInk` for terms). In `shared/` because the server answers them too.
  `npm test` is at 165 assertions.
- **`HouseholdTile.tsx`** — one shape at every size, radius **30%** of the side
  and the letter Playfair 700 at **42%**, both derived so a fifth size is a
  number rather than a table entry. The fill follows the **theme**, not the
  surface: light `base` + cream letter, dark variant + near-black. Rail hover and
  press are the colour mixed 10% toward white and 9% toward black — derived, via
  `--tile` / `--tile-hover` / `--tile-press` custom properties, because a
  `:hover` cannot be an inline style. This replaced the hard-coded
  `#A85E33 / #B96A3C / #98522B` triple, which was one household's terracotta
  written down as though it were a token.
- **`HouseholdIdentity.tsx` is the term composer**, not a new component — 26px
  swatch, 40–44px field at radius 11, the 8 × 2 picker **inline**. Settings'
  pencil flips the section into `TermPanel` (`HOUSEHOLD · EDITING`, *Done*).
  Owners only. **No tile preview**, and that is the one place the build
  knowingly differs from the boards: the spec asks for a 34px preview on the
  grounds that the tile is elsewhere, but the drawer's own household row is
  directly above the panel and already shows it.
- **A selected chip keeps its dot, everywhere** (2026-08-27). The item sheet's
  Location / Type / Store chips dropped theirs on selection, on the reasoning
  that the fill already said what the dot was for — but the fill says
  *selected*, and only the dot says *which term*. The drawer's filter chips
  already kept theirs; this is the sheet catching up. **The dot reads against
  the chip, not the sheet**: a selected chip is filled with `inkBg`, the page's
  inverse, so the dot takes the *other* theme's value —
  `entityColorFor(id, terms, on ? ! dark : dark)`. That is not only consistent
  but measurably better, since those two palettes are tuned against exactly
  these two grounds: across all sixteen colours the worst dot-on-fill contrast
  goes from 1.98:1 to 3.09:1, clearing the 3:1 non-text floor everywhere.
- **Every picker draws one palette, and it follows the theme** — light `base` in
  light, the dark variant in dark, on the drawer and on a card alike.
  `ColorPicker`'s `onDark` now governs the **well and the selected ring only**,
  and `TermRow`'s swatch takes the same rule. The old surface-dependent dot was
  wrong in two places, not one: in dark mode the item sheet drew light bases
  while the chips it recoloured took `darkDot`.
  **One divergence survives on purpose** — a term chip's dot on the drawer is
  still `drawerDot(c)` in both themes, so the Filter tab shows a light base in
  the picker and a brighter ink on the chip below. Only eight of sixteen
  `onDrawer` values exist; the question is written up in `.docs/notes.md` under
  *Product questions*, to settle when they are finished. **Do not "fix" it in
  passing.**
- **A collision is allowed and nothing mentions it.** There is **no uniqueness
  rule**, and nothing is disabled (D36's reason: a disabled control cannot
  explain itself). The spec's caption — *Aqua — also used by **The Shop**.* —
  was built and removed: with nothing restricted there is nothing to explain, so
  it printed the absence of a rule. That is the **second** deliberate departure
  from the boards, with the missing tile preview. `TermColor` gained `name` and
  it now survives only as each dot's `aria-label` and `title`, which is the one
  place it earns its keep — sixteen bare circles announce as "Choose color 7".
- **`ModalShell.tsx` is `ConfirmDialog`'s box, extracted** — scrim, focus trap,
  Escape, the fade, and `DialogButtons`. `NewHouseholdDialog` is the confirm
  shell with a form in it, which is what the spec asks for in so many words. The
  switcher's inline create form is **gone**: a name and a colour do not fit in a
  264px flyout without pushing the household list off the bottom. Joining stays
  inline — a code is one field.
- **The colour arrives already chosen** on both creation surfaces: the first
  unused across the households you are in, walking the sixteen in order.
- **A just-created household now actually opens.** `Pantry`'s selection heal
  adopts the server's answer whenever the selection is absent from `households`
  — but that list is a separate live query and re-emits *after* the create
  mutation resolves, so for one round trip a brand-new id looked stale and got
  bounced back to the household you were already in. Joining had the same hole,
  and so did the switcher's old inline create; this is **not** new to the
  dialog. A deliberate selection now `claim`s the id and the heal waits.
  **Do not "simplify" the claim away** — "not in the list" only means stale if
  the list is current, and nothing can ask it whether it is. Two signals release
  it: the list carrying the id, or `household` resolving to it.

**Verified without a browser**: typecheck clean, 165 assertions pass, the
artifact shows `ink` on `households` with `default: ""`, the three `--tile`
classes are in `/zero.css` in the right order (base → hover → active), and the
**real handlers** were driven over `POST /__spacefast/zero/run` — an explicit
`color-7` stored, an omitted colour resolving to a stable default,
`updateHousehold` writing a new one, `invitePreview` returning the household's
own colour.

**And clicking it found what none of that could — 2026-08-27.** A real session
on a Pixel 8 Pro
and with a second person found six defects nothing in this list could have
caught — a stale effect dependency, a ring clipped by `overflow-x-auto`, a
`100vh` drawer running past the mobile viewport, a hover painted the colour of
the row under it, a picker that snapped shut, and a chip that dropped its dot.
**Compiling, curling and reading the artifact prove a build is coherent, not
that it is usable.**

### The applied filter bar (Phase 4.10) is built — 2026-08-27

The spec's *Applied filters*, governed by
[D45](../.docs/decisions.md#d45-the-applied-filters-are-a-row-of-the-top-bar-not-a-badge-on-the-drawer):
**a filter you cannot see is a filter you cannot remove.** A third top-bar row —
`Clear filters`, then one chip per active term — present only while at least one
**term** filter is on, so most of the time the bar is still two rows. No schema
change; nothing server-side moved.

- **`AppliedFilters.tsx`** is the whole component. It takes resolved filters and
  two callbacks and owns nothing but the 140ms exit. **A chip's key is
  `kind:id`** — row ids are unique only within a table, and the hosted runtime
  issues sequential integers, so a location and a store both holding `"4"` is
  the normal state of a seeded household.
- **Three new `PAGE_*` styles**, and the rule behind them generalises: **an
  interaction state on the ground moves away from the ground, not toward it.**
  The app's usual ghost hover is `surface-alt`, which *is* the ground gradient's
  middle stop — a chip hovering to it goes from a step lighter than the ground
  to exactly the ground and reads as disappearing. `line` moves the other way in
  both themes at once. Controls on a **card** keep sinking to `surface-alt`,
  where it is a real step.
- **Hover, pressed and focus are one treatment, and there is no transform.** The
  chip is leaving the moment you press it, so a separate press state has nothing
  to report — and with the two merged a `scale()` would fire on *hover*. The
  focus ring is crimson, not the page's ink: ink is what the chip is made of.
- **The whole chip is the target.** The `×` is a glyph, not a second hit area.
  Removal gets no toast — D36 is about records, and a filter is neither a record
  that comes back nor one that does not.
- **`Clear filters` takes every term *and* the status pill, never the search.**
  Search has its own `×` and you can see it working. The drawer's
  *Clear all filters* now calls the **same function**, and its visibility moved
  with it: gated on terms-or-status rather than on "anything at all", or a
  search alone would put a no-op button on the Filter tab. `clearAllFilters` —
  search included — survives for the empty state, where the copy says the
  filters *together* rule everything out.
- **Desktop wraps; mobile scrolls, and that split is `md:`, not the measured
  column.** This is **not** the mistake the row-2 note warns about. Row 2 asks
  whether its labels fit, which a docked drawer changes without the viewport
  moving. This row asks whether there is a **scroll gesture** — a mouse has
  none, so a docked drawer at 1280 must still wrap. Different question,
  different axis. At 390 the clear is pinned outside the scroller and the chips
  bleed past the gutter with `pr-[18px] -mr-[18px]`, which cancels on desktop.
- **`Clear filters` is padded symmetrically at every width, and the row has a
  gap.** Both were the same 2px mistake, found on a phone. The boards give the
  clear `padding: 0 12px 0 2px` so its label sits flush with the column edge —
  but on touch the hover fill is the only press feedback there is, and 2px put
  that fill hard against the *C*. At 12px the label lines up with the status
  pills' labels one row above, which is the alignment that was actually wanted.
  The chips' scroller keeps its `pl-1` **uncancelled** for the other half: those
  4px plus the row's `gap-1` are the 8px the two boxes had none of.
- **The mobile menu button carries the crimson total**, so the fact that
  something is filtering survives scrolling past row 3. Same construction as the
  rail badges, except the ring is the page ground and therefore follows the
  theme where the rail's cannot.
- **Row 3 stays in list mode.** The list obeys the same filters. Row 1 never
  changes and row 2 swaps contents, which is what makes the switch read as the
  content changing rather than the app changing.
- **The live region is in `Pantry`, not in the bar** — the bar unmounts with its
  last chip, so *Filters cleared* would be announced from a node that has just
  been removed. It quotes **matching-of-household** (`Showing 12 of 20`), which
  is the spec's own sentence; row 2's `Showing X of Y` is a different pair
  (rendered-so-far of matching) and the two have always disagreed on screen.
- **Under `prefers-reduced-motion` the chip still fades**, it only loses the 4px
  rise — `motion-safe:-translate-y-1`. A chip that blinks out gives no sign the
  press did anything, which is the one job the motion has.
- **Focus moves to `Clear filters`** when a chip is removed and the bar
  survives — the element that had focus is gone, and focus falling to the body
  restarts a keyboard user at the top of the document. It paints no ring after a
  mouse press, because a programmatic `focus()` matches `:focus-visible` only
  when the interaction that led to it was keyboard-driven.

**Filtering is multi-select now, and that is the other half of this** — OR
inside a group, AND across groups. Each group holds a **list** of ids;
`shared/filter.ts` owns the rule and is in `shared/` because an `every` where a
`some` belongs still compiles, still runs, and hands back an empty grid.
`npm test` is at 235 assertions.

- `FilterSection` and the rail flyouts **toggle** and carry `aria-pressed`;
  *All items* lights on an **empty** group rather than tracking an id.
- **The rail's quick-filter flyout stays open on a pick**, alone among the
  rail's menus: a group holds several terms, so closing after each one means
  reopening the panel to add the second.
- The rail badges count the group. `emptyCopy` counts **terms, not groups**, so
  two locations land in the "anything else" branch — correctly, since with
  *Pantry or Freezer* on and nothing showing neither name is the cause.
- The add sheet prefills a location **only when the filter is unambiguous**, and
  the shopping list names a store only when exactly one is on.
- **The late paths use functional setters.** A chip's removal fires 140ms after
  the press and `restoreTerm` fires after a round trip; either could otherwise
  write back an array captured before something else touched the same group.

**Verified without a browser**: typecheck clean, 222 assertions pass — fourteen
of them new, covering the OR/AND rule including the case that separates it from
OR-across — `sf dev` on `--port 4199` compiles and serves, and **every** new
utility is in the live `/zero.css`, checked by *printing and unescaping the
selectors*, including the `md:` variants' line numbers to prove each lands after
the base rule it overrides.

### The account's display name (Phase 4.11) is built — 2026-08-27

The spec's *First run — the display name*, drawn on
`.claude/docs/design/display-name-light.html` / `-dark.html`, governed by
[D46](../.docs/decisions.md#d46-the-display-name-is-on-the-account-and-it-is-asked-before-the-fork):
**the account carries a name; the identity does not carry it for us.** A real
signup on the published space is janky in a way the design assumed away — plenty
of accounts arrive through my.spacefast.com with no profile name, and the ones
that have one did not set it here. `ctx.auth.displayName` is a **suggestion, not
an answer**.

**The third additive schema change since Phase 2**, after `households.ink` (D42)
and D44's nine stamp columns. Now **ten tables, five queries, seventeen
mutations**; it applies on the next publish with no flag.

- **`profiles`** — `userId`, `displayName`, `addedAt`, `changedAt`, on a
  `by_user` index, which is the only way in. **Stamped from birth on purpose**:
  D44's own note is that a column is permanent and a row written without one
  never gets one, and this table had no rows yet. There is no unique constraint
  any more than `id()` is a foreign key — `setDisplayName` reads before it
  inserts, and that read *is* the one-row-per-account rule.
- **`memberships.displayName` is now a documented copy**, not a second name.
  `setDisplayName` **writes back through every membership** the account holds;
  skipping that would show the new name to the person who typed it and the old
  one to everybody else, which is worse than having no column. Rows already
  agreeing are skipped, so a rename across five households is one write.
  `accountName()` in the capsule is the single place a membership's name is
  resolved — profile → membership → identity — and both `createHousehold` and
  `redeemInvite` stamp through it.
- **`needsName` is narrower than "has no profile row".** An account that
  predates the table carries the Gravatar name it joined under on every
  membership, which is a name it effectively already gave; sending those people
  through a required screen would be a wall in front of everyone who was using
  the app yesterday. So the query falls back to the memberships and stops only
  an account with **no name anywhere**. Verified by creating a household with no
  profile row and watching `needsName` come back false with the inherited name.
- **The gate is above the invite landing, not below it.** Someone accepting an
  invite never sees *Name your household* and is exactly the person whose name
  the household is about to see. The consented auto-redeem waits on
  `nameSettled` for the same reason — the write-through would fix the membership
  a beat later either way, and waiting is what keeps the others from seeing the
  wrong name in between. The screen **blocks on the `profile` query** rather
  than painting the invite card and replacing it, which costs nothing since
  every subscription starts in the same tick.
- **`shared/profile.ts`** owns the rule — `normalizeDisplayName`,
  `isValidDisplayName`, and `pickDisplayName`, the fallback chain both halves
  walk. `npm test` is at **235 assertions**.
- **`Pantry` renders `accountName` everywhere a person appears**, resolved from
  the profile with the identity as fallback. The entry now passes
  `auth.displayName` **raw** — the old `|| 'Signed in'` made an absent name look
  present, which is precisely the case this screen exists to catch, and it would
  have prefilled the field with *Signed in*.
- **Two deliberate departures from the boards.** The account row carries a
  *Sign out*: the screen is required, so without one an account signed in by
  mistake has no exit that is not clearing cookies. And the field's hint is
  **gone** — both of its branches explained where a prefilled value came from,
  and [D48](../.docs/decisions.md#d48-a-name-nobody-typed-is-not-an-answer)
  removed the prefill.

**Editing the name in the drawer landed with Phase 4.12** — in the account menu
rather than a Settings section, since D49 removed the Account block. It goes
through the same `setDisplayName`, which was already the right shape: it upserts,
and the write-through is what a rename needs.

**A fresh `sf dev` now hits the name card first**, since a dev guest has no
profile row and no household to inherit from. That is the only way to click the
screen locally, and it costs one Enter.

**Verified without a browser**: typecheck clean, 235 assertions, the artifact
shows `profiles` with `by_user` plus `profile` and `setDisplayName`, every new
utility is in the live `/zero.css` (selectors printed and unescaped, exact
match), and the **real handlers** were driven over `POST /__spacefast/zero/run`
on a second `sf dev` at `--port 4199`.

### The sign-in button names no provider — 2026-08-27

[D47](../.docs/decisions.md#d47-the-sign-in-button-names-no-provider). Copy
only: no schema change, no new utility classes, nothing server-side moved.

**`SignInWithGravatar` does not go to Gravatar.** It redirects to
`api.spacefast.com/v1/access/acquire/…`, which redirects to
`my.spacefast.com/sign-in`. That is **Spacefast account sign-in**, and
`GET /v1/auth/capabilities` — public, unauthenticated, and the only way to know
— reports what it offers: `wpcom` **and an emailed one-time code and a
password**, with `google` and `github` present but `false`. So the old label
was sending most of the people who pressed it after an account they do not
need. This is also why real signups arrive nameless (D46): an email-code
account has no profile behind it.

- **The labels are the act.** *Sign in*, *Sign in to join*, and *Signing in…*
  while the redirect is in flight. `GravatarButton` is **`SignInButton`**,
  `GravatarMark` is **deleted**, and lucide's `LogIn` replaces it on the card,
  the marketing hero and nav, and the invite landing.
- **The lanes are deliberately not named in copy.** They are deployment flags
  that can change without telling us, and the next screen shows them anyway.
- **The avatar is a different question and keeps its name.** `auth.picture` is
  a real `gravatar.com/avatar/…` URL, so every *"the Gravatar avatar"* comment
  in the client is still true.
- **The alias is `hostedSignIn`, not `startSignIn`** — the obvious name
  collides with the app's own handler one screen down in `client/index.tsx`,
  and the collision compiles into a recursive call. `typecheck` caught it.
- **The boards still say Gravatar** on the sign-in, invite and display-name
  screens. That is the third knowing departure from the design documents, after
  D42's missing tile preview and its removed collision caption.

**Not built, and written up in D47's rejected list:** restricting the app to
email and password (the platform pins `provider` to one literal), and building
either credential ourselves. Passwords are the one thing this runtime is worst
at — no `crypto`, so a KDF means iterating `shared/sha256.ts`, which measures
5.8s for OWASP's 600k rounds *on Node with a JIT* and is an interpreter away
from that in production.

Verified: typecheck clean, 235 assertions, `sf dev` on `--port 4199` compiles,
and the served `/client.js` carries every new string with **no `Gravatar` left
in the bundle**.

### Neither name arrives prefilled — 2026-08-27

[D48](../.docs/decisions.md#d48-a-name-nobody-typed-is-not-an-answer), amending
D46. Client only: no schema change, no new utility classes, nothing server-side
moved.

**The display name and the household name both start empty**, and each screen's
primary stays disabled until something is typed. D46 exists because
`ctx.auth.displayName` is a suggestion rather than an answer — and then seeded
the field with it. `FirstRun` went further and composed
`` `${displayName}’s Household` ``, a name assembled here out of a suggestion.
The default path through both screens was Enter, which accepted a value nobody
chose and reported success having collected nothing.

- **`DisplayNameCard` no longer takes a `suggestion`.** The prop, the
  `inherited` memo and the `useMemo` import are deleted. `Pantry` stops passing
  it; `displayName` still reaches `FirstRun` for `SignedInRow` and the avatar.
- **The display-name hint is gone entirely** — both branches only ever explained
  where the prefilled value came from, and the paragraph above the field already
  says what the name is for. **The household hint keeps its colour sentence**
  and loses *Taken from your own name*.
- **Focus but do not select**, on both. Select-on-mount existed so typing would
  replace a name you did not choose.
- **Still no placeholder on the display name**, and the rule is firmer now: a
  placeholder there would have to be an example *person's* name, which is a
  prefill that merely cannot be submitted by accident. `HouseholdIdentity`'s own
  *Household name* is a category, not an example, and stays.
- **`needsName` is untouched**, so everyone it grandfathers still never reaches
  either screen. What stopped is the identity name's use as a starting value.

Verified: typecheck clean, 235 assertions, and the running `sf dev` recompiled
and served a `/client.js` with none of the removed strings and the kept one
intact.

### The app opens where you left it — 2026-08-27

[D51](../.docs/decisions.md#d51-the-app-opens-where-you-left-it-and-where-you-left-it-is-a-property-of-the-device).
Client only: no schema change, no handler moved, no new utility class.

`client/hooks/useViewState.ts` and a **fourth `localStorage` key**,
`larder.v4.<userId>.view`, after the theme (D25), the household (D33) and the
trip (D41). It restores **`drawerCollapsed`**, **`drawerTab`**, **all three
term-filter groups**, and **the status pill**.

- **The shopping-list mode was already restored** and did not change — D41 put
  it in the trip record beside the ticks, where it expires 24 hours after the
  last tick and clears on a household switch. The mode and the cart are one
  answer to one question; two keys would let the app come back into list mode
  with an empty cart it had been told about.
- **The prune effect's new `ready` guard is the load-bearing line in the whole
  change.** The three term lists are `[]` while `pantry` is in flight, so
  without it the effect runs once against nothing and drops every restored
  filter before the household it belongs to has arrived. With it, the effect
  that already handled "someone deleted the term you were filtering by" also
  handles "these ids are from a household this device has left" — a row id
  belongs to exactly one household, so both are the same rule.
- **Restoring a filter is only safe because D45 shipped first.** An app that
  reopens three filters deep with no way to see them is an app hiding most of
  your pantry for no stated reason. Row 3 is what makes the state legible on
  arrival.
- **The restore is render-time, not an effect** — `readViewState()` feeds the
  `useState` initialisers, because an effect runs after paint and the grid would
  flash unfiltered. It costs nothing: the shell does not render until
  `api.status` is `ready`.
- **`drawerOpen` is deliberately not restored.** It is the mobile slide-over —
  a panel over the thing you opened the app to see — and it is the flag the dock
  effect exists to clear. Seeding it true hands that effect a slide-over the
  layout does not account for.
- **Search is not restored and is not in the record at all**, which is also what
  keeps the write cheap: the one high-frequency field never triggers a
  `setItem`. Sort is not restored either — one line in the same record if it
  should be.
- **Nothing read back is trusted.** A non-array where `locations` belongs would
  throw inside `.includes` on the first render, which is a blank screen rather
  than a lost filter.

Verified: typecheck clean, 239 assertions, `sf dev` recompiled, and the served
`/client.js` carries the `.view` key and both drawer fields. **This is the
change most worth looking at on a second load**, since every part of it is about
what the second load looks like.

**More of the view is likely to be stored, and the candidates are written up in
`.docs/notes.md` under *Product questions*** — the sort, an add or edit in
progress, how far down you had scrolled, per-household filters, whether a
restored filter should expire, and which of it belongs to the account rather
than the device. **The fork to notice there:** another per-device field costs a
line in the same record, while anything that should follow a person across their
phone and desktop is a schema change and therefore D27. That note also records
the one thing the storage keys cannot do — a field whose *meaning* changes has
no migration but bumping the `larder.v4.` prefix, which discards the theme, the
household, the trip and the view on every device at once.

### The seeded types cover a supermarket — 2026-08-27

[D50](../.docs/decisions.md#d50-the-seeded-types-are-a-supermarket-and-the-other-two-taxonomies-are-not),
amending D40. `shared/seed.ts` only: no schema change, no handler moved, no new
class.

D40 seeded all three taxonomies on one rule — *generic, so a household renames
rather than deletes* — and it was only ever right for two of them. **A type is
not a shelf you name or a shop you choose; it is a kind of food, and those are
the same in every kitchen.** So types are seeded for **coverage** instead: the
nine inherited from the design's sample data had no home for bread, canned
tomatoes, cereal, cooking oil or a frozen pizza, which is five detours through
the composer in a normal week.

**Fourteen now** — Produce · Dairy · Meat · Baked Goods · Grains · Canned Goods
· Condiments · Oils & Vinegars · Spices · Baking · Breakfast · Snacks ·
Beverages · Frozen Meals — each earning its place against *would a household
hold two or more things that fit here and nowhere else?*, which keeps *Oils &
Vinegars* and drops *Sweets*, *Soups*, *Deli* and *Pet*.

**The names stay short.** Only **Protein → Meat** is a real rename; the rest
of the nine merely pluralised. A first pass widened six into pairs (*Dairy &
Eggs*, *Meat & Seafood*, *Bread & Bakery*, …) and was **reverted the same
day** — nobody wonders where eggs go, and a chip is read at a glance. The
two-word names left are each one idea with no one-word name.

- **Two colour tokens are left unspent on purpose** — `color-11` and
  `color-16`. `proposeColor()` hands out the first token a group has not taken
  and falls back to `color-1` once they are all gone, so seeding sixteen would
  make a household's own first type arrive wearing Produce's olive. `npm test`
  asserts the headroom, and that no two seeds in a group share a colour.
- **`Frozen Meals` is not a repeat of the Freezer location.** Meat, frozen
  vegetables and ice cream all live in a freezer and all belong elsewhere on
  the list; pizza and burritos have nowhere else to go.
- **Non-food types were rejected, not forgotten** — *Household*, *Cleaning*,
  *Pet*. Real things on real pantry shelves, but `.docs/overview.md` defines a
  type as "what kind of *food* it is", so adding them is a decision about what
  the app is for and wants that file changed in the same breath.
- **This reaches new households only.** `createHousehold` seeds once and
  nothing backfills; a backfill would have to reason about terms a household
  has already renamed, recoloured or deleted deliberately. **The published
  household still holds the old nine** and gains the missing five by hand, once.

`npm test` is at **239 assertions**. Typecheck clean. Nothing to click — the
change is a list of strings the server reads at household creation.

### The sidebar drawer redesign (Phase 4.12) is built — 2026-08-27

The spec's *Settings tab*, drawn on
`.claude/docs/design/larderlogdrawerpreview.html`, governed by
[D49](../.docs/decisions.md#d49-settings-is-three-blocks-and-members-are-a-level-down).
**Client only**: no schema change, no new handler — still ten tables, five
queries, seventeen mutations.

The pane had six labelled sections and printed the same two facts three times
over — you in Account, again in Members, again in the row at the foot; the
household in the switcher and again under its own heading. Three rules cut it
down: **the household tile appears once** (in the switcher), **you appear once**
(in the row at the foot), and **scope is in the label**.

- **Three blocks and a row.** *Household* — name and colour behind the pencil,
  the item count in meta, a **Members** row with three stacked avatars and a
  chevron, and *Leave household* **inside the same card** under a hairline. The
  rename panel is **flush** with that card rather than a box inside it — a
  rounded `TermPanel` there put three nested outlines on one screen, and only
  the innermost (the colour picker's well) says anything →
  *Preferences*, which are yours (Appearance) → *Pantry settings*, which are the
  household's (the default low-stock threshold). **There is no Account block**,
  and nothing says whether you are signed in: if you are reading it, you are.
- **The threshold moved out of Preferences and became a stepper.** It is a fact
  about the pantry, not about the person looking at it. A stepper also has no
  empty state, which is what the old commit-on-blur field existed to survive.
  **Its minus at zero stays live and faint**, never disabled — the item card's
  rule.
- **`MembersPane.tsx` is a second level, pushed by the chevron.** Members and
  invites are one subject and get the full 340 together, which is what finally
  **settled the standing complaint that invite links are cramped**. The pane
  **drops the Filter / Settings tabs while pushed** — back is the only way out —
  and a household switch pops it. `Drawer` owns that state for exactly that
  reason.
- **`RoleMenu.tsx` — the role word is the trigger.** Owner only, never on your
  own row, and *Remove from household* is the last row of the same menu, so
  there is no `⋯`. **Selection is a check, not a fill** (the sort menu's rule's
  second user) and **nothing in it is disabled**: the last-owner case is
  unreachable from a menu only an owner sees on somebody else's row.
- **`AccountMenu.tsx` is one component in two places** — the drawer's foot row
  and the collapsed rail's account flyout. Identity row with a pencil that flips
  it **in place** into the composer's field, a hairline, *Sign out*. **This is
  where the display name is edited now**, which Phase 4.11 deferred. No toast:
  the row returning read-only with the new name is the confirmation.
- **The invite composer is the term composer again** — the dashed row stays put
  and drops the panel in below itself, role chips with *Editor* preselected, and
  a sentence that changes with the chip. **Expiry is a countdown, not a date**
  inside the app; the `?join=` landing keeps its date deliberately. All but the
  newest invite card collapses to its header.
- **`Theme.drawer` gained `menu` and `menuLine`** — the two menus are near the
  drawer's own body on purpose, separated by their border and shadow. Reusing
  the sort menu's cream popover was rejected: it would put the brightest thing on
  screen over the darkest panel in the app.
- **`useDismiss.ts`** is the Escape + outside-press pair the switcher had inline.
  **Its ref wraps the trigger as well as the panel** — a handler exempting only
  the panel closes on `pointerdown` and lets the trigger reopen on the `click`,
  which is the bug the rail needed a `dismissed` ref for.
- **Three control styles went with the surfaces they described** —
  `DRAWER_ICON_DANGER`, `DRAWER_CARD`, and the on-drawer form of
  `DRAWER_GHOST_DANGER`. Both surviving crimson ghosts now sit on a **card**, so
  the hover is `drawer-raised-hover`: painted with the drawer's own values they
  hovered to exactly the colour they were already on.

**One knowing departure from the boards**, the fifth overall: the rail's account
flyout keeps the rail's own flyout surface and only its width moves to 292.
Household and appearance sit a few pixels above it on that surface, and one
flyout in three wearing a different fill reads as a different kind of thing.

**Verified without a browser**: typecheck clean, 235 assertions, `sf dev` on
`--port 4199` compiles and serves, and **every class literal in the twelve
touched files** was diffed against the live `/zero.css` by unescaping the
sheet's own selectors — printed, never hand-written.

### Four fixes from a real shop, and a way to reset a trip — 2026-08-28

Client only: no schema change, no handler moved, no new decision beyond D41's
amendment.

- **The press no longer drops *Back to items* half its own height.** It was
  centred with `top-1/2 -translate-y-1/2` over the hidden status pills *and*
  carried the row's `active:translate-y-px`. **Tailwind writes both to
  `--tw-translate-y`**, so a press replaced `-50%` with `1px` and the button
  fell ~21px for as long as you held it. It centres with `top-0 bottom-0
  my-auto` now, which leaves the transform to the press. **Never pair an
  absolute-centring transform with the press nudge** — the two cannot coexist
  on one element, and neither `typecheck` nor a class-presence grep sees it.
  `CollapsedRail`'s tooltip is the only other `-translate-y-1/2` and is
  `pointer-events-none`, so this was the only site.
- **A press on a shopping-list row ticks it, anywhere on the row** — D41's new
  amendment. The name and the counts used to open the Edit sheet, which is a
  form over a shopping list, arriving from the half of the row the thumb aims
  at. `onOpenItem` is gone from all three levels of the component and from
  `Pantry`'s call site.
- **The Edit sheet does not put the caret in the name field.** Adding still
  does — one next step, an empty field. Editing opens on a whole item and
  nothing knows which part of it you came for, so a caret in the name says
  *rename this* and on a phone throws the keyboard over the fields you were
  reaching for. Focus still has to **enter** the dialog or Tab would walk the
  pantry behind it, so the sheet takes `tabIndex={-1}` and focuses itself,
  `outline-none` because a ring around a 480px panel says nothing the panel
  does not.
- **The phone column has one vertical rhythm and it is 24px** — above the
  wordmark, wordmark to search, search to the status pills. It was 16 / 36 / 24,
  which reads as three unrelated bands rather than one column. The header takes
  `pt-6`, and the 24 between it and the search is **split between two owners**,
  as it always was: the header's `pb-3` and the content wrapper's `pt-3`. The
  wrapper's old `py-6` was replaced rather than trimmed — its bottom half never
  applied, `pb-28` and `md:pb-[30px]` having overridden it all along. Row 2's
  own `pt-6` is the third gap and did not move. **Desktop is untouched**:
  `md:pt-[30px]` still wins above `md`, checked by line number in the sheet.

**And *Clear checks* exists** — D41's fourth rule, and the only one with a
button. `useTripChecks` gained `uncheck(ids)` / `recheck(ids)`; the trip bar
gained a ghost opposite *Hide N checked*, and the all-checked bar a second one
before *Back to items*. It clears **what is on screen** — with a Store filter
on, the trip holds ticks for rows nobody can see, and a control beside
`Hide 3 checked` must not quietly clear seven — and it arms an ordinary
actionable toast, *Cleared 3 checks*, with Undo. **No confirm and no crimson**:
D36 governs records, a tick is not one, and a dialog in front of a phone in a
shop costs more than the mistake. The all-checked bar wraps now (`min-h-[70px]`
+ `flex-wrap`) because two sentences and two controls do not fit one line at
390.

**The all-checked bar has one control now, and it is *Clear checks*.**
*Back to items* is gone from it — a third way out of a mode that already has
two, when the state's own subject is the trip. That is also what fixed the
wrap: with two buttons the wrapped line was a pair pinned right under a
sentence starting 47px in, two ragged edges and neither shared. **Two
alternatives were built and reverted on the way**, and both are worth knowing.
Filling the line (`w-full` + `flex-1`, symmetric padding) aligned the block but
turned two ghosts into centred prose — a label on nothing reads as a control
only while its *position* is the affordance, which the ends of a bar give it
and the middle of its own line does not. Then giving them a box
(`bg-surface` + `line-strong`, since `line` measures 1.21:1 on this surface)
made them buttons and made the bar busy. **One control needs neither fix**: it
hangs off `ml-auto` at the row's end, wrapping or not, which is the shape the
trip bar above it already has. The glyphs stayed from that round —
`RotateCcw` on both *Clear checks*, `EyeOff` / `Eye` on the hide toggle — so
the ghosts say *control* at rest without spending an edge. `LIST_GHOST` is
unchanged, and `ShoppingList` no longer takes an `onBack`.

Verified: typecheck clean, 239 assertions, and on a throwaway `sf dev --port
4199` every new utility (`top-0`, `bottom-0`, `my-auto`, `w-full`, `h-full`,
`text-left`, `outline-none`, `md:pt-[30px]`, `flex-wrap`, `min-h-[70px]`,
`basis-[200px]`) is in the live `/zero.css` with the served
`/client.js` carrying the new class literals and none of the old. **All three
are press-time behaviour**, so all three want a thumb.

### Add / edit item, redesigned (Phase 4.13) — 2026-08-28

`.claude/docs/design/add-edit-item.md`, drawn on
`.claude/docs/design/larderlogaddedititem.html`. Governed by
[D52](../.docs/decisions.md#d52-an-item-has-a-size-and-a-size-is-a-pair-that-is-never-half-set)
and
[D53](../.docs/decisions.md#d53-some-things-are-never-shopped-for-and-that-is-a-property-of-the-item).

**The fourth and fifth additive schema changes since Phase 2**, in one edit:
`items.size`, `items.unit` and `items.offShoppingList`. Still **ten tables, five
queries, seventeen mutations** — three more fields through the two item
mutations that already existed. It applies on the next publish with no flag, as
`households.ink`, D44's nine columns and the `profiles` table all did.
**`offShoppingList` is the app's second boolean column** and compiles exactly as
`invites.revoked` does.

- **An item has a size, and a size is a pair that is never half-set.**
  `shared/size.ts` owns it: fourteen units in three groups, and one function —
  `normalizeSize` — that both the sheet and the server call. A unit with no
  number becomes `1`; a number with no unit, or an unknown unit key, becomes
  neither. Between that and the sheet's two rules there is **no invalid state
  left to validate**, which is why nothing anywhere renders a size error.
- **`unit` stores a slug, never the abbreviation** — `quart`, not `qt`, on D32's
  reasoning about term colours. **Half pint printing as `cup` is the case that
  would otherwise be unfixable**: `1 ½ pt` reads as one and a half pints, which
  is a different quantity and the commonest use of that unit.
- **`offShoppingList` is read by exactly one function, `needsBuying`.** `statusKeyFor`
  does not see it. So an excluded item still reads *Out* on its card and still
  counts toward the three status pills, while the store card, its count and the
  cart total all drop it. **That split is the whole idea** — the pills count
  stock, the list counts shopping — and it is the thing to keep right.
- **The sheet is four sections**: Item · Count · Location / Store / Type ·
  Notes, micro-label over content, separated by a `divider` hairline. The three
  taxonomies share **one** rule because they are one question asked three times.
  **Grouping is labels and rules, never a fill**: a recessed panel on this sheet
  already means *you are editing something* — it is the inline composer — and a
  second one that only grouped would empty that meaning out.
- **One field treatment, and its border is `ink-muted` on a contrast finding.**
  The composer's old field border measures **2.80:1** on the panel and **2.45:1**
  on the sheet in dark; `ink-muted` clears 5:1 on all four surface-and-theme
  combinations. Same measurement that sent the shopping list's checkbox to this
  token. **`PAGE_FIELD` is now what a field on the page ground looks like**;
  `PAGE_INPUT` survives for the top bar's search alone, and **`PAGE_BUTTON` is
  deleted** — the sheet's old asymmetric minus was its last caller.
- **`UnitMenu.tsx` is the sort menu's construction, and its trigger is a field
  rather than a ghost** — the ghost treatment is for a control on the ground,
  this one sits on a form. The abbreviation sits in the check's reserved slot on
  every row but the current one. Caps at 320px and opens scrolled to the current
  unit; fifteen rows would otherwise be 593px of menu.
- **Two matched steppers, and *Low at* is a peer rather than a caption.**
  Symmetric and neutral, and **neither takes the card's ink plus**: the sheet has
  exactly one primary and it is *Save*. **The numeral is a text field** — 2 to 15
  is thirteen taps otherwise — capped at four digits, which is what fits an 85px
  cell at 390. `useHoldRepeat.ts` adds the accelerating hold, and **the first
  step still comes from `onClick`** so a tap fires once through the path that
  already works for a thumb, a mouse and the keyboard.
- **A live status line right of the `COUNT` label**, in the status ramp's own
  dot and text. **This is what makes the threshold easy rather than merely
  bigger.** It forced a rule the docs never stated: **`on hand == low at` is
  low** — which is what `statusKeyFor` already did, and now has a test.
- **`CheckBox.tsx`** is the shopping list's 22px box, extracted rather than drawn
  twice. The rhyme is the point: the box that takes a row off the list you are
  shopping, and the box that keeps an item off every list.
- **The card gained the size beneath the name** (not beside it — names are long,
  and the list's own 460px collision is on record) **and a struck cart left of
  the status** when the item is kept off the list. The status does not move. The
  cart is `ShoppingCart` under `Slash`, since lucide has no struck one, and it is
  **the first thing to challenge**: a glyph nobody has been taught, on a card
  that otherwise carries no icons beside the name.
- **The list row gained the size riding with the name**, before the badge — at
  the shelf *"Butter, 1 lb"* is one phrase. **The stacking floor was left at
  460**, not raised to the design's derived 520: the row already wraps on
  measured content rather than at a hard breakpoint, and 520 would change the
  grid's column count at 1440 on an unmeasured number. Worth a look on a real
  screen.

**Three deliberate departures from the boards.** The status line does **not**
crossfade — there is no stylesheet in this project and therefore no `@keyframes`
to reach for, and a 140ms fade is not worth appending a `<style>` at boot for.
The sheet keeps its full-height right-edge geometry on desktop rather than the
boards' floating card, which is how the boards draw it in isolation; the spec's
own table says *480 from the right*. And **`Household default` rides the *Low
at* sub-label after a middot**, rather than sitting on a line under the field:
the note is about the number the field arrived holding, so it belongs beside
that field's name, and a line of its own made two side-by-side steppers unequal.
It truncates rather than wraps — the pair measures 156px inside the 173px a
stepper gets at 390.

**That note tracks the value, not a touched flag**, which is a fourth departure
and the one worth knowing. The spec says it *disappears the moment the number is
changed*; built that way it was a one-way `thresholdTouched` boolean, and it
left the sheet saying nothing about a threshold that **was** the household's —
which is the only thing the line exists to say. It is now
`toInt(threshold) === toInt(defaultThreshold)` on the Add sheet, so stepping away
and back brings it back. `toInt` on both sides, so an empty field and a leading
zero read as the numbers they are. **`ItemSheet` takes `defaultThreshold`
again** — it was dropped when the hint stopped naming the number.

**Verified without a browser**: typecheck clean, **285 assertions** (46 new),
the artifact shows all three columns with defaults and `db.migrations` empty,
`sf dev` on `--port 4199` compiles and serves, every new class literal is in the
live `/zero.css` — printed and unescaped, never hand-written — and the **real
handlers** were driven over `POST /__spacefast/zero/run`: a whole pair stored, a
unit with no number resolving to 1, a bare number and a bogus unit key both
resolving to neither, a unit-only patch keeping the number it did not name, and
`offShoppingList` set and cleared. **Every interesting part of this is
press-time behaviour**, so all of it wants a thumb.

### The app now says it is installable (Phase 4.14) — 2026-08-28

`.claude/docs/design/install-as-an-app.md`, drawn on
`.claude/docs/design/larderloginstallmockup.html`. Governed by
[D54](../.docs/decisions.md#d54-the-offer-to-install-is-one-row-in-settings-and-there-is-no-banner).
**Client only**: no schema change, no handler moved, no new `theme.json` token —
still ten tables, five queries, seventeen mutations.

The manifest shipped on 2026-08-27 and **nothing in the app has ever said so**.
This is one row — *Add to home screen*, in Settings › Preferences under
Appearance, behind the block's own hairline. **There is no banner, no
interstitial and no badge anywhere else.**

- **Two rules, and everything follows.** *Nothing offers to install what is
  already open* — four `display-mode` queries plus `navigator.standalone`, which
  is the only answer there is on a home-screen Safari. And *the row appears only
  where a path actually exists*, which is what the sort trigger and the
  shopping-list trigger already refuse to be.
- **One control, two labels** — **Install** where a browser handed the page a
  prompt, **Show me** everywhere the path is a menu. Same pill, same geometry,
  same position; the label carries the difference, which is the shopping-list
  trigger's rule.
- **A prompt is one path, not the definition of one**, and this is the part that
  was got wrong first. `beforeinstallprompt` was treated as the proxy for *a
  path exists* — but **Chrome installs any page from its own ⋮ menu**, with no
  manifest, no service worker and no prompt, and **the page is never told**.
  There is no API to ask. So the row keyed to the prompt stayed hidden on
  desktop Chrome while the browser sat there offering to install it. Now four
  `steps` modes carry the four menus that can be named — iOS, Chrome on Android,
  Chrome on the desktop, Safari on macOS — each in that browser's own words.
  **Edge, Opera, Samsung Internet, Vivaldi and Firefox answer `none`**: they all
  carry `Chrome/` or have a real path, and none of their menus has been checked.
- **The label follows the platform** — *Add to home screen* on a phone,
  **Install as an app** on a desktop, which has no home screen. The one
  departure from the boards, which drew the phone's words on the 1440 board
  before the row had desktop steps to be wrong about.
- **The event is captured at boot, not when Settings opens.**
  `beforeinstallprompt` fires once and early, so `watchInstall()` runs from the
  entry beside `installFonts()` and `installAppIcon()` and `client/lib/install.ts`
  holds the event. Waiting for the drawer would mean the row could only ever
  appear on a reload after the one that mattered — which the design doc listed
  as an open question and this is the answer to. **The event is dropped before
  the dialog opens**, not after: it can be prompted once, a second press throws,
  and a pill that fires nothing is the worst version of this row.
- **The steps panel is the inline composer on a fourth surface.** It drops in
  below the row and **the row stays put**, 180ms in and 140ms out — the applied
  chip's exit — animated on `grid-template-rows`, because a panel of unknown
  height has no pixel value for `max-height` to guess at. Instant under
  `prefers-reduced-motion`. **The words are Safari's own**: *Share* and *Add to
  Home Screen* are what the buttons say, and the share mark is drawn **beside**
  the word rather than instead of it.
- **`Theme.drawer` gained `inkMeta` (`#A5937A`) on a contrast finding.**
  `inkFaint` — the rail's rest colour — had been standing in for drawer meta
  text everywhere and measures **4.28:1** on the light theme's raised fill. It
  is fine on the drawer gradient and fails on the card that sits on it, which is
  where every meta line in the Settings pane actually lives. `drawerTheme()`'s
  `textMuted` resolves to it now, so the household's item count and the members
  count moved with the new row.
- **The steps panel's hairline is `#6E5F4B`, hard-coded, and that is the second
  finding.** The composer's own `#3B3126` reads **1.10:1** on `drawer-raised`;
  the fill alone is 1.31:1, so the panel has no edge at all. **The invite
  composer and the Filter tab's term composer have the same bug and were
  deliberately left alone** — one row should not quietly restyle three
  components.
- **The detection is exercised against eleven real user agents**, including the
  two that are easy to get wrong: **iPadOS 17 reports itself as a Mac** (a touch
  count is what separates them) and **Chrome's own user agent contains
  `Safari/`**. It lives in `client/lib/install.ts` and **cannot move to
  `shared/`** — it reads `navigator`, which is on the capsule compiler's server
  denylist — so it is checked by driving the compiled module, not by `npm test`.
- **There is no service worker anywhere in this project**, and that is the open
  risk under all of it: Chrome has historically wanted one before it will fire
  `beforeinstallprompt`, so the **Install** branch may be dead everywhere. The
  manifest is complete and its three icons serve — checked against the live
  space. **DevTools ▸ Application ▸ Manifest ▸ Installability** settles it. The
  steps variant is what makes the row useful either way.

**Discovery is unsolved on purpose, and this is the thing to remember about the
whole change.** A banner was drawn at 358 × 127 and cut: it cost ~125px at the
top of a 390 screen where the top bar already takes three rows, it needed a
whole dismissal design to be tolerable, and it made the already-installed case
worse. **Nobody opens Settings to see what is in it** — so installing is now
reachable only by someone who already suspects it is possible. That is on the
record rather than left to be noticed later, and it is the first thing to
revisit if install numbers come back at zero.

**Verified without a browser**: typecheck clean, 285 assertions, `sf dev` on
`--port 4199` compiles and serves, and **all 65 class literals** in the new
component and the two new control styles were diffed against the live
`/zero.css` by unescaping the sheet's own selectors — printed, never
hand-written — including the line numbers proving each `md:` rule lands after
the base it overrides. The served `/client.js` carries every new string.
**The row is now visible under `sf dev`**, which the first cut was not: desktop
Chrome on loopback resolves to `chromium`, so it renders *Install as an app* and
**Show me**. That is honest rather than a dev switch — Chrome really will
install a localhost page from that menu. What still cannot be reached locally is
the **Install** pill, which needs a browser that fires the prompt, and the iOS
and Android steps.

### Members have faces (D55) — 2026-08-28

`.docs/decisions.md` D55. **The sixth additive schema change since Phase 2**:
`memberships.picture`, a string defaulting to `''`. Ten tables and five queries
still; **eighteen mutations**, the new one being `syncAccountAvatar`. Applies on
the next publish with no flag.

Only your *own* avatar was ever a picture, and **nothing decided that** —
`DrawerAvatar` has taken a `picture` since Phase 4.12 and calls the initial "the
fallback"; the members' rows were the one caller with nothing to pass. It read as
deliberate because **the boards draw a letter for everyone, your own row
included**, so your face was the departure rather than their initials.

- **It stores a URL, and therefore no email.** `ctx.auth.picture` is already the
  finished Gravatar URL and the server had simply never read it. That is the
  whole privacy argument: `ctx.gravatar.avatarUrl(email)` is free and was the
  obvious tool, but it needs an *address*, and every member of a household would
  have been able to read every other member's.
- **The two stamp sites are the only two moments the value is in reach.** The
  platform tells a handler about its **caller**, never a third party — so
  `createHousehold` and `redeemInvite` stamp through `accountAvatar(ctx)`,
  beside the `accountName(ctx)` already there.
- **`syncAccountAvatar` is what makes it visible at all.** Stamped-at-join and
  left alone, the column is write-once — wrong for the ordinary case (join
  first, set up Gravatar later) and, worse, **every row on the published space
  today holds `''` and nothing backfills** (D44). It writes only rows that
  disagree and **invalidates only when it wrote**; an unconditional invalidate
  would refetch the household for every member on each other member's load. A
  second call in a row reports `changedTables: []`.
- **`onError` is load-bearing.** The platform's URL carries `d=404` on purpose,
  so an account without a Gravatar serves **no image** and the consumer draws
  its own initial. Both avatar components rendered a bare `<img>`, so that
  account got the browser's broken-image glyph — already true of your own
  avatar, never hit. They hold the URL that *failed* rather than a boolean, so a
  changed picture retries with no effect to reset a flag.
- **The stacked trio was already capped** at `members.slice(0, 3)` with the
  count in words below it, and did not move. No "+2" bubble: a fourth circle
  that is not a person is a worse thing to overlap than a person.

**Verified without a browser**: typecheck clean, **295 assertions**, the
artifact shows `picture` with `default: ""` and `db.migrations` empty, and the
**real handlers** were driven over `POST /__spacefast/zero/run` — the members
DTO carrying the column, the reconcile clearing a seeded picture, and a second
call writing nothing. **One half cannot be clicked here at all**: `sf dev`
issues no `auth.picture`, so the stamping path needs the
published space. What *is* local is the rendering, via `?members`.

### The account row, and the app's first outbound link (D56) — 2026-08-28

**Client only**: no schema change, no handler moved. Ten tables, five queries,
eighteen mutations.

- **`auth.email` is empty in production by design.** It is the identity token's
  `email` claim, read straight off the JWT by `createAuthFromToken` with no
  lookup and no fallback, and a Spacefast account carries none. `pairwise_sub`
  preferred over `sub` for the user id, plus the SDK's own comment about
  deriving a Gravatar profile *"without ever touching the email behind it"*, say
  it is a privacy stance rather than an omission. **`auth.picture` is present** —
  confirmed on the live site — so D55 is safe. `docs/zero.md` promises `email`
  with no caveat; logged as a docs gap.
- **The dev guest no longer reports an email**, only hashes one for its avatar.
  It briefly showed `justintadlock@gmail.com` and made the local account row a
  line taller than the published one. **A dev switch may reveal what production
  hides; it must never invent what production lacks.** Both render sites were
  already `{email && …}` — *absent, not blank* — so production never changed.
- **`Change your picture` ships**, the board's third row, which had been marked
  *"Do not build yet — nowhere to send anyone."* There is now. Its own block
  between the identity row and *Sign out*, `CircleDot` in front and
  `ExternalLink` behind. **Naming Gravatar here is right where naming it on the
  sign-in button was wrong (D47)**: that button went to a Spacefast account, this
  genuinely goes to Gravatar. Label stays the board's four words (292px menu);
  the destination rides the accessible name, which *contains* the visible label.
  Points at `/profile/avatars`, the editor — Gravatar bounces a signed-out
  visitor through sign-in and back to it. No `onDone()`: it opens a tab beside
  the app, and a menu that shut itself would read as the app forgetting where
  you were.
- **The app's first `target="_blank"` and first `rel="noopener noreferrer"`**,
  and its first use of `no-underline`.

Verified: typecheck clean, 295 assertions, and on a throwaway `sf dev --port
4199` **all 32 class literals** in the touched component were diffed against the
live `/zero.css` by unescaping the sheet's own selectors — printed, never
hand-written — with `.no-underline` among them. The served `/client.js` carries
the URL, both labels, `_blank` and `noopener noreferrer`.

### The front door says it is a beta (D57) — 2026-08-28

`.claude/docs/design/beta-badge.md`, drawn on
`.claude/docs/design/larderlogbetabadgeboards.html`. **Client only**: no schema
change, no handler moved, no new `theme.json` token — still ten tables, five
queries, eighteen mutations.

**The marketing page discloses the stage and the app shell does not repeat it.**
`BetaBadge` in `Brand.tsx`, drawn twice in the nav (the wordmark there is
responsive and the badge derives its metrics from a number) and once in the
footer. Nothing else: not the drawer header, not the mobile header row, not
`<title>`, not the manifest name, not the icon.

**It was built the spec's way first and rejected**, and that is the part worth
keeping. The spec's rule is *the wordmark never appears without it* — a marker
on some screens and not others stops being a disclosure and becomes decoration.
Sound about disclosure, wrong about audience: **a caveat is read once, when you
are deciding.** A permanent pill above the item grid re-serves it on every load
to somebody who has already signed up, in the two places the app is least able
to spare the width. The rule still holds *within* the marketing page, which is
why the footer keeps it.

- **It is not a control.** Not focusable, no press state, no tooltip, no link.
  The tag component with no dot. The markup says `Beta` and the caps are CSS, so
  a screen reader is handed a word; it is deliberately **not** `aria-hidden`, so
  the nav announces *Larder Log Beta*.
- **A fill one step off the ground, a `meta` edge, a `body` label** — `border`,
  `textMuted`, `text`, so both themes come from one expression. **The fill does
  none of the separating** (1.10:1 light, 1.45:1 dark), so the edge is the whole
  component. It is the **second** component to borrow a text token for its
  border, after the shopping-list checkbox, which is starting to look like the
  answer to the *top-bar controls have no edge* question.
- **The drawer trio is measured and not built** — `drawer.raised` /
  `drawer.inkMeta` / `drawer.inkMuted`, 8.70:1 and 10.44:1 — and is recorded in
  `BetaBadge`'s comment so that surface is a trio rather than a measuring
  exercise if it is ever wanted.
- **It scales off the wordmark's set size** — height 0.66, label 0.55 of the
  height, padding 0.39 of the height, gap 0.37 of the set size — the way
  `HouseholdTile` derives its radius and letter. **The 9px label floor is applied
  to the input** (`Math.max(24, size)`), which is what the spec's *"the footer
  takes Small unchanged"* amounts to in one expression. **The gap belongs to the
  badge**, as a `marginLeft`, which is why both call sites wrap the wordmark and
  badge in a gapless row of their own.
- **The nav is 20/24, not the spec's assumed 27**, so both its badges are small.
  That is the derivation doing its job rather than a departure.
- **The sign-in card and the `?join=` landing are now the only signed-out
  surfaces without a marker**, which makes them candidates rather than
  exclusions — see D57's *Open*. The invite landing has no wordmark at all.

**One unrelated fix rode along.** The mobile header's `Log` was hard-coded
`#BE3346` in both themes — 3.11:1 on the dark ground, the exact bug
`theme.accent` was added to fix, on the one wordmark that never got it. Now
`theme.accent`, 4.81:1 in dark. Found while the badge was still attached to that
wordmark, and kept when it was removed.

**Verified without a browser**: typecheck clean, 322 assertions, `sf dev` on
`--port 4199` compiles and serves, and **every class literal** in the new
component was diffed against the live `/zero.css` by unescaping the sheet's own
selectors — printed, never hand-written — including `.-top-px` resolving to
`top: -1px` and `@property --tw-border-style` carrying `initial-value: solid`,
which is what makes a bare `border` paint the inline `borderColor`.

**`?signedout` is the only way to look at it locally** —
`http://127.0.0.1:4173/?signedout`. The cap-height alignment (a flat
`-top-px`) and the gap beside the italic `g` are arguments made on paper.

### A source carries a kind (Phase 4.15a, D58) — 2026-08-29

`.claude/docs/design/garden-and-kitchen.md`, drawn on
`.claude/docs/design/larderloggardenkitchenboards.html`. **The seventh additive
schema change since Phase 2**: `stores.kind`, a string defaulting to `''`. Ten
tables and five queries still; **nineteen mutations**, the new one being
`setSourceKind`. Applies on the next publish with no flag.

**The first of three builds from that document** — the run list's bands and the
item side's season and ingredients both read this column, so it exists first.

- **A store carries a kind — shop, grow or make**, and it is a property of the
  *term*, not the item, not a fourth term group, and not a mode. *The Garden* is
  a term like any other: a colour, a name, a count, a chip that filters, a tag on
  a card. **The drawer never learns what a kind is**, and **the item card did not
  change at all** — which is the strongest argument for putting it here.
- **Why it exists: `NO STORE` was carrying two opposite meanings.** Baking Soda
  has no store because nobody set one — a gap. Frozen Peaches may have none
  because *there isn't one*. The list drew them identically.
- **`shared/source.ts`** owns every rule — `toSourceKind` (anything unrecognised,
  `''` included, is a `shop`; a query that throws is invisible, so nothing here
  throws) and `sourceGroupWord`. `npm test` is at **342 assertions**.
- **The group renames itself** — `Store`, or `Source` once one source is not a
  shop. **Five places move together**, one more than the design doc names: the
  Filter heading, the dashed chip, the composer's micro-label, the item sheet's
  group label, and the **blocked-delete dialog**, which would otherwise say *"A
  store can only be deleted…"* under a heading reading `SOURCE`. `termBlock`
  takes a `noun` and both halves pass it, so the server's throw and the client's
  dialog stay one string. The rail's flyout **label** moves with them; **its
  storefront glyph deliberately does not** — a neutral mark has not been drawn,
  and inventing one would put an unlearned glyph on the one surface that is
  nothing but glyphs.
- **The rule is "does anything here fail to be a shop", not "how many distinct
  kinds are there"**, and that is a **knowing departure from the doc's prose**,
  which says *one kind and it is a Store*. Its own table says otherwise, and a
  household whose every source is a garden has exactly one kind. The table wins.
  `npm test` asserts the gardens-only case specifically.
- **`SourceKindMenu` is `RoleMenu` with different words in it** — nothing new is
  drawn. **The trigger is the glyph, not a word**: a 340px row cannot spend a
  slot on *Shop*. Shop sits at `drawer.inkFaint`, grow and make brighten to
  `inkMuted`, so a glance down the panel says which rows are not shops.
  `DRAWER_KIND` is `DRAWER_TRASH`'s geometry with **no colour of its own** — the
  glyph's colour is an inline style, which would beat a class's `:hover` colour,
  so the hover is the fill alone.
- **A new source is a shop unless you say otherwise** (amended 2026-08-29, and
  D58 had this wrong). It shipped with no kind control on any composer; the kind
  is not something you discover afterwards, and saying *The Garden* is a garden
  meant naming it, pressing *Done*, re-opening the group with the pencil and
  finding the row again. **All three draft rows carry the glyph now** — the
  Filter tab's `NEW` panel, its editing panel's add row, and the item sheet's
  `+ Source` composer — in the slot an editing row already spends on it, and
  **defaulting to shop**, which is what `toSourceKind` resolves an absent value
  to. A household that never touches it composes exactly the row D58 composed.
  **`createTerm` did not change**: the draft's optional `kind` existed for undo,
  and composing is a second caller of an argument that was already there.
- **The composer stopped hanging past its column, on both surfaces**, and that
  bug is older than any of this — `TermPanel` has carried a `-mx-2.5` since
  Phase 4.5. It was there to read as a tray opening rather than a card floating
  in a list, and it read as neither: on the item sheet it hung 10px outside the
  fields, the micro-labels and the season and make panels either side of it, and
  in the Filter tab it hung outside the chips it drops under **and outside the
  `EDITING` card** — which is the same panel one state along and has always sat
  on the pane's gutter. One panel disagreeing with itself one state later is the
  clearest argument there was. **The margin is gone rather than made a prop**:
  it was added as `bleed`, defaulting on, with the sheet turning it off, and
  then nothing wanted it on. One geometry now — the panel's edges are its
  column's, `px-3.5` inside, which is the season panel's `p-3.5` and the editing
  card's `pl-3.5`.
- **The kind menu is on cream for the first time**, since one of the three
  composers is the item sheet. `SourceKindMenu` takes an `onDark` and re-skins
  the way `TermRow` and `panelSkin` do — the drawer keeps `DrawerMenu`, the
  sheet gets `PAGE_MENU`, which is the sort menu's popover and therefore the box
  the unit menu opens a few pixels away on the same sheet. **The reverse would
  be the mistake `DrawerMenu` already records**: a cream popover over the
  darkest panel in the app. **`PAGE_KIND` fills to `surface`, not
  `surface-alt`** — the composer panel *is* `surface-alt`, so the usual ghost
  hover would move the control to the colour it is already on (D45's rule, on a
  different ground).
- **`setSourceKind` is its own mutation**, not a `kind` on `updateTerm`'s patch:
  that handler's second argument is *already* called `kind` and means the
  taxonomy. It **short-circuits an unchanged value and invalidates nothing** —
  the menu is a radio group where pressing the current row is how you close it.
- **Undo carries the kind back.** `createTerm`'s draft takes an optional `kind`,
  **undo only**, the same trade the stamps make (D44). Undo is a re-insert
  (D17), so without it a restored garden comes back a shop.
- **The item count left the editing row** — D36's own delta, and a consequence of
  the glyph taking its slot rather than a change of mind. At 340px a fifth
  control left the field ~150px, which is where *Calfee Cattle* truncates.
  **Counts stay on the chips at rest.** D16's widening to all three kinds stands
  without it; that rule was argued from the count, never about it.

**Two things landed with the revised spec on 2026-08-29.**

- **The item card carries one glyph** — sprout or pot, 15px in `textMuted`,
  leftmost in a top-right cluster that is now **glyph · dot · chevron**. A
  bought item has nothing there and **the absence is the point**. The first
  version of the spec said the card changed *not at all*; the glyph adds *what
  kind*, which the tag cannot say — a household can call a grow source anything
  and colour it anything. **Meta grey, never the term's colour**: the status dot
  stays the only coloured thing in that corner. The objection that nearly killed
  the off-list cart does not apply — this glyph is taught three times (band
  headers, segment tabs, the editing row) before a card shows it.
  `itemSourceKind()` returns `null` far more often than not, and **grow wins a
  tie** on the run list's own band order. **A make item kept off the list draws
  both this and the struck cart**, which will be common — worth watching.
- **Every editing panel gained a way to add a term**, and that gap was **not
  this feature's**. The dashed chip is hidden while editing — the panel *is* the
  group — which left the Filter pane as the one place you could rename,
  recolour and delete a term but not make one. All three groups, not just
  sources. Both add affordances are the same draft row on two surfaces and are
  never both open; the editing panel's own *Done* commits it.

**Verified without a browser**: typecheck clean, **353 assertions**, the artifact
shows `stores.kind` with `default: ""`, `setSourceKind` among nineteen
mutations, ten tables and `db.migrations` empty; every class literal in the four
touched files was diffed against a live `/zero.css` by unescaping the sheet's
own selectors — printed, never hand-written — and the **real handlers** were
driven over `POST /__spacefast/zero/run` on a throwaway `sf dev --port 4199`:
seeded stores resolving `''` to `shop`, a new source arriving as a shop, shop →
grow → shop, a repeat write reporting `changedTables: []` *and*
`changedQueries: []`, a bogus kind refused, a bogus kind on create landing as a
shop, a cross-household id refused, a kind surviving a create, and the blocked
dialog saying **"A source can only be deleted once nothing uses it."**

The menu is the only new surface. **To see any of it locally**: Filter tab →
`+ Store` → name it → the pencil → press the cart glyph. The seeded three are
all shops, so a fresh household says `Store` until you change one.

### The run list (Phase 4.15b, D58) — 2026-08-29

**Client only**: no schema change, no handler moved. Ten tables, five queries,
nineteen mutations.

**`shared/shoppingList.ts` is `shared/runList.ts`**, `shoppingGroups` is
`runBands`, `ShoppingList.tsx` is `RunList.tsx` and `ShoppingListTrigger.tsx` is
`RunListTrigger.tsx` — all four `git mv`'d, so history follows. The list groups
by **kind first, source second**, and **nothing about a card changed**: same
460px `auto-fill` grid, same header, same rows, same trip bar.

- **A band appears only when it holds something**, always Buy · Harvest · Make.
  A household with nothing but shops gets one band, no headers and no segment —
  **today's shopping list byte for byte**, which is most of why this shape won.
- **An item appears under every source it names, which now means two bands.**
  Tomatoes bought in February and picked in July are on both cards, counted once
  by each — so **the bands need not add up to the total**, exactly as the store
  cards never summed to it.
- **The storeless group is Buy's, and its test is against *every* source.** An
  item naming only The Garden has a source, so it must not also turn up in Buy
  asking to be given a shop.
- **`needsBuying` gates every band**, so *Keep off the list* keeps an item off
  Harvest and Make too — what the checkbox says is *never remind me about this*,
  and a harvest list is a reminder. **That narrows what D53's checkbox is for**:
  it was written for "the things a household grows or brews", and a grow source
  now says that better and says which. The label lost the word *shopping* with
  it, and so did the card's `aria-label`.
- **The trigger says `To get`** — *Shopping list* stopped being true the moment
  three of the seventeen were things you pick. **Its cart glyph stays** at the
  compact width and is the one thing still saying *shop*; recorded rather than
  solved, in the same place the rail's storefront is. Its count is unchanged: the
  household's total across all bands.
- **`All` is the default and the whole design**, and carries no glyph — the
  drawer's `All items` argument reused. **The active tab is not the ink
  primary** (*Add item* is on screen and ink is what you press), so it is
  `surface` on `borderStrong`: a raised tab on a sunk track. An inactive tab
  carries a **transparent 1px border** so picking one does not shift its
  neighbours by a pixel.
- **The segment's counts are the filtered set's; the trigger's is the
  household's.** That pair has always been allowed to disagree.
- **The trip line shrinks to the cart clause when the segment is up** —
  `12 to buy · 4 stores` is what the segment now says in tabs you can press.
- **The active tab is resolved once and read three times.** A chosen band can
  empty under you, so it falls back to `All`. Reading the raw tab in one place
  and the fallback in another draws every band with no headers over them — built,
  caught, fixed before it shipped.

**One departure from the boards, and it is forced.** **The Make card is a Buy
card**: the doc's own refinement says the row is 56px "until a recipe gives it
something to say", and recipes are not being built (D59), so there is no second
line and no *short 3 carrots*. **Board 1 draws it in the taller form and is
drawing the mockup.**

**The segment's own row lasted a day — see *Row 2 holds the whole run list*
below.** It shipped beneath row 2 because row 2's left slot held its width in
both modes so the trigger never moved when pressed, and in compact that slot
*was* the slack. The answer was to spend both: the trigger leaves the row in
list mode, and its 135px and the slot's 368 become the segment.

**Verified without a browser**: typecheck clean, **368 assertions** (15 new,
covering band order, the two-kind item counted once by each band, the storeless
group staying on Buy, an excluded grown item reaching no band, and a `''` kind
landing on Buy), and every class literal in the four touched files diffed
against the live `/zero.css` by unescaping the sheet's own selectors — printed,
never hand-written. The served `/client.js` carries `To get`, `Harvest` and
`Run list`.

**`?demo` cannot show it** — the seeded sources are
all shops, so it draws one band and no segment. To see the bands locally:
`?demo`, then Filter → the pencil → **Add a source** → *The Garden* → the cart
glyph → **Grow** → Done, then tag two low items with it. Extending `?demo` is
the obvious fix and was not done: `DEMO_ITEMS`' distribution is pinned by
`npm test` on purpose and adding rows moves eight assertions.

### Row 2 holds the whole run list — 2026-08-29

**Client only**: no schema change, no handler moved, no new utility class — every
one it uses was already in the sheet. Ten tables, five queries, nineteen
mutations.

**Row 2 is one line at every width, the segment included.** The segment had
shipped in a scrolling row of its own below the measured column, which was a
**fifth** row at 390 in a top bar whose documented worst case was already four.

- **The row's right end is the chrome, in both modes**: in grid mode the trigger
  and the sort, in list mode the segment. Neither end is about the pantry — the
  left is what you have, the right is how you are looking at it.
- **List mode is two controls and a clause**: *Back to items* on the left, the
  trip count, and the segment at the right end.
- **The trigger is a glyph and a count at every width**, and it moved from after
  the status pills to beside the sort. It wore *To get* with room; the count
  pill already says how much and the glyph says what kind, and a word beside the
  sort's own short label is the odd one out. The words survive in `aria-label`,
  which reads *To get, 17 across every kind*. **What this gives up is the
  on-ramp** — the eye crossing `9 in stock · 6 running low · 5 out` and landing
  on the thing to do about it, which is the argument D41 used for placing it
  there instead of colouring it.
- **The sort names its choice the short way at every width** — `Restock`, not
  `Sort · Needs restocking`. The glyph and the word *Sort* are gone with the
  long form: a chevron says it opens, its position says what kind of control it
  is, and the full name is still on the menu's own rows and in its accessible
  name.
- **`Showing 20 of 63` is deleted.** The pills to its left carry every count
  that matters and the grid is directly below; its pair — rendered-so-far of
  matching — was never the pair the live region announces (matching of
  household), so the two disagreed on screen by design.
- **`ROW2_FULL_PX` is 580, re-measured.** Three of the four parts the old 910
  was derived from are gone or shrunk: the count line deleted, the trigger down
  to ~72, the sort to ~100. **`compact` is now mostly a touch-geometry flag** —
  the pills' short words and the row's shared 44px — since the two controls that
  used to shed words have none left to shed. The cost is that a landscape phone
  clears it and takes the 40px row; the gain is that a docked drawer on a 1280
  desktop stops wearing a 390 layout with 300px of the row empty.
- **The trigger is the way *in* only, on desktop.** Row 2 drops it in list mode.
  *Back to items* is the way out and says so; a second exit whose count is the
  **household's** would argue with a screen counting the **filtered** set; and
  its 135px is what the segment wears its labels with. **So the press removes
  the thing under the pointer** — the thing D41's amendment was written against
  — and what it buys is the whole run list on one row with its words on.
  **Below `md` none of that applies**: the trigger is in the mobile header in
  both modes and never moves, which is the arrangement D41 was really
  protecting, since the pair it replaced put the way in and the way out in
  *different rows* on a phone.
- **The pills' 368px reserved slot is gone with it.** They unmount rather than
  going `invisible`; there is no longer an x to hold still. Three things paid
  for the fifth row, in order: that slot, the trigger's 135, and then the trip
  clause and the segment's words, which share one threshold.
- **Every control on the row shares a height** — 44px compact, 40 full — off row
  2's own `compact`. The segment was `h-10` at every width and stood 4px short
  of its neighbours on a phone.
- **`compact` was stuck `true` on every screen, and had been for as long as it
  has existed — see *The observer never attached* below.** Everything row 2 has
  ever been documented to do at full width was unreachable.
- **Whether the segment wears its words is a different question from
  `compact`.** `compact` is `< 910` measured on the content column, so a docked
  drawer on a 1280 screen would drop the words with ~470px spare. `compact` is
  geometry alone; `iconOnly` is `ROW2_LIST_PX + runSegmentPx(kinds, false)`, a
  threshold that moves with the band count.
- **`ROW2_LIST_PX` is 265** — the exit at ~145, `3 in the cart` at ~88, and the
  row's gaps. It was 400 with the trigger in it, which put a three-band
  household's labels at 820 of column and hid them on any window that was not
  most of a 1440. At 265 that is ~685, and **the drawer does not dock below
  1120** — so every desktop arrangement this app has wears the words.
- **`runSegmentPx()` lives beside the markup it measures**, in `RunSegment.tsx`:
  `ROW2_FULL_PX`'s method applied to a control with no single width.
- **The observer stores the width now, not the boolean.** `compact` derives from
  it, and still starts at 0 — which reads as compact — for the reason the
  boolean started `true`.
- **The segment's scroller bleeds right below `md` only.** Above `md` it never
  scrolls at all: `iconOnly` guarantees it fits, which is D45's rule (a mouse
  has no scroll gesture) satisfied by arithmetic rather than by a wrapper.

**The glyphs changed twice and settled as a family.**

- **The trigger is a basket once the household grows or makes anything.** The
  cart is the **Buy band's** glyph — band header, segment tab, item card — so a
  household with a garden had one cart meaning *the whole run* a gap from
  another meaning *the shop part of it*. **The test is `sourceGroupWord`'s**,
  not "has grow *and* make" as asked: the collision is with the cart, and one
  garden creates it as well as a garden and a kitchen do. So the trigger is a
  basket precisely when the drawer's group reads *Source* rather than *Store* —
  one rule, already written down, both surfaces moving together. It follows the
  **household's** sources, not the filtered set's bands, which is what its count
  already does.
- **`All` wears the basket too, reversing its own rule.** It carried no mark at
  first, on the drawer's `All items` argument — the absence of a choice is not a
  member of the set. What changed is that the basket became free: it already
  means *everything to get* rather than *the shop part of it*, and with the
  trigger off this row on desktop it had nowhere else to be. The segment now
  reads as one family — the whole basket, then the three ways things get into
  it. **And having a mark is what lets it drop its word** with the others, so
  glyph-only is four glyphs rather than three and a word.
- The band tabs take an `aria-label` carrying the word **and the count**, since
  `aria-label` replaces what is under it rather than prefixing it.

**The tabs hover on the edge and the words, never on the fill**, and that is
forced rather than chosen. The selected tab is the *raised* one — `surface` on a
`surface-alt` track — and `surface` is lighter than the track in **both** themes,
so D45's *move away from the ground* means darker, and there is no darker step
to take: light has `border` at `#E2D5C0` and works, while dark's track is
already `#221C14` with only the `#1F1912` canvas beneath it, three units and
invisible. A fill hover would have to run *toward* the selected fill, and a tab
that looks half-selected on a control whose whole job is saying which one is
selected is worse than no hover.

So an unselected tab grows a `border` where it had a transparent one, and the
selected tab deepens `borderStrong` to `textFaint` — **toward the text in
whichever direction the theme requires**, darker in light and brighter in dark.
One idea, both states, and **the selected tab gets feedback too**, which matters
because pressing it is a no-op: a dead control beside three live ones reads as
broken rather than as current. The words brighten to `textStrong` with it and
the count follows on `group-hover`.

**It goes through custom properties**, `--tab-line` / `--tab-ink` / `--tab-meta`
and two hover twins, because the rest colours come off the `theme` object at
runtime and **an inline `border-color` beats any `hover:` class** — which is
exactly how the sort trigger once shipped with no hover at all.
`HouseholdTile`'s `--tile` trio is the same trick. The arbitrary values need the
`[color:var(…)]` type hint: a bare `text-[var(--x)]` is ambiguous between size
and colour and compiles to nothing. All six rules were confirmed emitted, with
the three hover rules landing after the bases they override — checked by line
number, not assumed.

#### The observer never attached — 2026-08-29

**The bug under all of it, and it is older than any of this.** `Pantry` returns
a loading screen while `api.status` is not `ready`, so `<main>` does not exist on
the component's first render — and the column's `ResizeObserver` lived in a
`useEffect(…, [])` that read `columnRef.current`, found `null`, and returned.
**It never attached, on any load.** `compact` was therefore permanently `true`
and **every control on row 2 has been wearing its 390 form on a 1440 desktop**:
the status pills' short words, the sort trigger's, `Showing X of Y` hidden
outright, and the run trigger as a bare glyph — which is why the trigger looked
like "the shopping cart icon" on a desktop at all.

**The fix is a callback ref**, so the effect depends on the element rather than
on a theory about when it exists — and it is **the fix already written a few
hundred lines below for `sentinel`**, whose comment calls it "the general fix:
there is no longer a render path that can mount the sentinel without waking the
observer." The same mistake was left in place one screen up.

**The rule: an `[]` effect is only safe against a ref whose element is mounted
on the component's first render.** `Pantry` has four early returns above
`<main>`. A sweep found no third instance — the only other `[]` effects reading a
ref are `DisplayNameCard`'s and `FirstRun`'s autofocus, and both fields are
unconditional in components that do not return early.

**This is the second time a browserless verification chain has certified a
control that could not run.** Typecheck, assertions, an artifact read and a
class-literal diff all pass on a component whose observer is inert; nothing
short of a resize in a real browser can see it. It joins the D42 round in
*Compiling, curling and reading the artifact prove a build is coherent, not that
it is usable.*

**And the item card's chevron got a hover state it only appeared to have.** It
carried `text-ink-faint group-hover:text-ink-muted` — the rule fires, and it is
`#9B8B75` to `#6F6049` on 17px of 1.5px stroke, from a header the width of the
card. So the one element that responded was the one nobody was pointing at, and
it read as a card with no hover at all. `CARD_CHEVRON` gives the glyph a 26px
round well filling to `surface-alt`, **the card's own ghost step** — the move
`CARD_ACTION_GHOST` makes a few pixels below it, and the opposite of what a
control on the page ground does (D45). The whole row is still the button and
the focus ring still wraps it; the well is only where the affordance is
*drawn*.

**It paints 25px and occupies 17, and that is load-bearing.** The first cut was
26px in flow, which grew the header's cluster from the glyph's 17px to 26 and
**pushed the ordinary card past its `min-h-[188px]` floor** — at which point
every card is its own content height again and a row stops lining up, which is
exactly how it was reported. Collapsed cards are equalised by that floor rather
than by `align-items: stretch`, because a grid row is sized by its tallest
item's content and stretch would let an open card drag its whole row down; a
floor only equalises what fits under it. `-my-1` and `-mr-1` give back exactly
the 8px the circle added on each axis, so the glyph's centre, the status badge
and the card's height are all where they were, and the circle bleeds into the
card's own padding. **Do not resize it without re-deriving the floor.**

**Verified without a browser**: typecheck clean, 445 assertions, the dry-run
artifact unchanged (ten tables, five queries, nineteen mutations,
`db.migrations` empty), every class literal in the three touched files diffed
against the freshly built `.spacefast/zero/public/zero.css` by unescaping the
sheet's own selectors — printed, never hand-written — with `md:mr-0` confirmed
by byte offset to land after the base `-mr-[18px]`, and the built `/client.js`
carrying `shopping-basket` beside `shopping-cart`.

**This one is entirely widths, heights and glyphs**: it wants a real 390 phone, a docked drawer at 1280, and a household with all
three bands. `?demo` still cannot produce a band — the seeded sources are all
shops.

### The item side (Phase 4.15c, D58) — 2026-08-29

**The eighth additive schema change since Phase 2**: `items.seasonFrom` and
`items.seasonTo`, both `''`. Ten tables, five queries, nineteen mutations. That
is the *whole* schema cost of the item side, because **the ingredients are not
here and never will be** (D59).

- **`shared/season.ts`** owns every rule. **Months, not dates** — a season
  repeats and a date does not, so there is no year, no locale and no format.
  **A pair that is never half-set**, and `normalizeSeason` **discards a half
  rather than completing it**: completing means guessing a value nobody typed,
  which D48 settled once for names. A patch naming one month reads the other off
  the row, exactly as the size pair does.
- **The range wraps, and it is the case worth a test.** November to February is
  a real season; read literally as `11 <= m <= 2` it is empty, which would move
  an item to `NOT YET` in every month of the year including the ones it is ready
  in.
- **An unset season is always in season**, which is what makes it safe to ask
  about every item.
- **`NOT YET`** is a sub-group at the foot of a harvest card. Its rows keep the
  56px height and lose exactly two things — the checkbox (nothing to pick) and
  the status badge (the slot says *Ready in September*). **Not focusable and not
  in the tab order.**
- **An out-of-season row does not count** — not toward its band, not toward the
  trigger — **but the item is unchanged**: still *out* on its card, still in the
  three status pills. That is the one place those two numbers deliberately
  disagree, and `runIds` reading off the bands rather than filtering in parallel
  is what stops them drifting.
- **Only the harvest card is affected.** Something you buy at Publix *and* pick
  in July is still on the Buy card in February, counted once by the band it is
  really on.
- **The season panel is the inline composer**, from `panelSkin` rather than the
  boards' two hexes — it sits a few pixels from where a `+ Source` opens one, so
  literals would mean a panel that stopped matching its neighbour on the first
  re-theme. **`MonthMenu` is `UnitMenu` with twelve rows** and no *no month* row.
- **The make panel is the season panel's twin, and promises nothing** (amended
  2026-08-29). It sits in the **same place** — below the source chips, before
  Type, so an item naming both a garden and a kitchen gets both panels in the
  run list's own band order — and wears the **same `panelSkin` surface**, radius,
  padding and micro-label. It was a `surfaceAlt` card below Type reading
  *Recipes are coming*; that is a roadmap on a form, dating the sheet against a
  feature D59 does not commit to and apologising for a panel already doing its
  whole job. The label states the fact — **`MADE, NOT BOUGHT`** rather than the
  boards' `MADE BY`, which heads a list of ingredients that will never be there
  — and the copy says only what the kind changed: running low puts the item on
  the **Make** band rather than on a shopping card. **A statement**, not an empty
  state and not a disabled control — no icon, no amber, nothing to press. Make
  items only. **Two departures from the spec's *Made by — what ships*** and both
  deliberate.
- **Deselecting a grow source does not clear the season.** The panel goes and
  the months stay, so putting the source back brings them with it. Discarding
  what somebody typed because they touched another control is a silent write,
  and the value is inert — `runBands` reads it in the harvest band and nowhere
  else.

**The item card now wears every kind it has**, one glyph per distinct kind in
band order, amending this feature's own first pass (which drew one and broke a
tie toward grow). **An item naming no source still draws nothing** — D58's table
splits an empty source three ways and the first is *not set yet*, a gap.

**The off-list marker stopped being a struck cart**, for two reasons that
arrived together: a cart is now the *shop* kind's glyph, and a cart beside a
struck cart in one cluster is the worst pair of marks on the screen — and the
strike was claiming the wrong thing anyway, since `needsBuying` gates every band.
`ListX` says *off the list* and collides with nothing.

**Verified without a browser**: typecheck clean, **419 assertions** (49 new,
covering the wrap-around both ways, the half-set discard, a one-month season,
and every `NOT YET` case including the bought-and-grown row that stays on Buy),
the artifact shows both columns with `default: ""` and `db.migrations` empty,
every class literal in the four touched files diffed against the live
`/zero.css` by unescaping the sheet's own selectors, and the **real handlers**
driven over `POST /__spacefast/zero/run`: a whole pair stored, a start with no
end and an end with no start both stored as neither, a bogus month stored as
neither, a patch naming one half reading the other off the row (both ways),
`11`–`2` surviving storage, and clearing one half clearing the pair.

The season panel needs a grow source selected on the sheet and the make panel
needs a make one, so both are behind the same setup the bands are.

**That completes `garden-and-kitchen.md`'s v1.** Everything left in that
document — recipes, the ingredient panel, quantities, units, the picker, the
*See recipe* link and both models on board 6 — is a **marked mockup** governed by
[D59](../.docs/decisions.md#d59-processes-depend-on-the-pantry-the-pantry-depends-on-nothing).

### The off-list checkbox is retired (D60) — 2026-08-29

**Client only, and there is no migration.**
[D60](../.docs/decisions.md#d60-the-off-list-checkbox-is-retired-and-the-column-is-kept)
amends D53: a source's kind answers the question the checkbox was invented for,
and answers it better. **You grow it, you make it, or you buy it** — the first
two go to their own bands without anybody ticking anything.

**The checkbox says it worse than the kind does**, which is the argument rather
than mere duplication: it hides an item from the list *without saying where it
went*, while a grow source puts it on a Harvest card while it does so.

- **`items.offShoppingList` stays.** Dropping a column needs
  `sf db migrate --drop`; filling one again is additive — the same trade D34
  made for `icon`, which is still there holding `''`. **Do not "clean up"
  either.**
- **`needsBuying` still reads it**, so a row ticked before today behaves exactly
  as it did. Nothing about existing data moves.
- **The control is a way out, not a way in.** The sheet draws it **only on an
  item that already carries the flag**; pressing it clears the flag and unmounts
  the row. So it can be cleared and never set, and the flag drains out of the
  database as people meet it rather than being migrated out from under them.
  **Absent where it would create a new one, present where it is the only way out
  of an old one** — D30's rule doing a job it was not written for. Removing it
  outright would strand every ticked row off every band with no way back.
- **The card's `ListX` marker is a legacy marker now** and draws only for those
  rows. It goes on its own when the last one is cleared.
- **Putting it back is deleting one condition.** The column, both mutations'
  normalisation, the `ItemDraft` field, the undo path and `needsBuying` are all
  untouched — only the sheet's `value.offShoppingList &&` guard stands between
  today and the control returning.
- **`?demo` still seeds three flagged rows, on purpose.** Nothing in the UI can
  set the flag any more, so they are the only way to reach the legacy state
  locally: the marker, the clear-only checkbox, and the two-item gap between the
  status pills and the run list's total that made D53's split countable.

**[D59](../.docs/decisions.md#d59-processes-depend-on-the-pantry-the-pantry-depends-on-nothing)
is the rule to not violate**: processes depend on the pantry, and the pantry
depends on nothing. A recipe references items; a planting references items;
neither is referenced back, so **a pantry item gains no recipe-shaped field at
all**. Everything about recipes, ingredients, quantities and unit arithmetic in
that design doc is a **marked mockup** and is not being built.

### First run asks where your food comes from (D61) — 2026-08-29

`.claude/docs/design/garden-and-kitchen.md`, *First run asks where your food
comes from*, drawn on **board 1** of the boards file. **No schema change** —
`stores.kind` shipped with D58 and this writes it at seed time. Ten tables, five
queries, **nineteen mutations**; `createHousehold` gained an optional third
argument and `db.migrations` is still empty.

**Three checkboxes under the name field, on both creation surfaces.** Buy ticked,
grow and make off. Buy seeds Grocery · Warehouse · Market as `shop`; grow seeds
**Garden** (fern, `color-11`); make seeds **Kitchen** (mulberry, `color-5`).

- **`SourceMixRows.tsx` is the whole component**, and it is on **both**
  `FirstRun` and `NewHouseholdDialog` — the design doc draws only the first-run
  card. The second household somebody makes is as likely to be the one with the
  garden, and asking on only one surface leaves the other seeding three shops
  and pointing back at a kind menu two levels into a drawer.
- **It looks like it breaks *one field, one button, nothing else* and does
  not.** That rule was written against a **preview** — fifteen seeded chips in a
  recessed panel, explaining what a household is. This is a **question**, and
  the answer changes what gets *written*. The test it passes: **Enter still
  finishes the screen**, because the defaults are the household that existed
  before the question did.
- **It is not the prefill D48 forbids.** D48 is about a *name* — a name nobody
  typed is not an answer and a filled field submits as though it were. A tick is
  a closed question whose commonest answer is knowably yes, legible without
  reading a field, with a hint under it saying what it will do.
- **Nothing is required and nothing is disabled**, which is a **deliberate
  departure from the brief that asked for it** — *maybe require at least one
  checkbox* was raised and dropped in favour of the spec, which argues the
  seed-nothing path is worth having. Untick all three and you get the locations
  and types and no sources. **That is not a dead end the way no locations would
  be**: `itemStores` is a join table so an item can name none, while
  `locationId` is required and D16 refuses to delete the last one. Sources are
  the one taxonomy that can start empty — and this is the cleanest version of
  the *seed no stores* argument open since D40.
- **An absent mix and an empty one are different answers**, and that is the
  load-bearing line. `toSourceMix(undefined)` is the buy-only default — every
  caller that predates the question. `{}` and an explicit all-false are somebody
  unticking all three. Collapse them and you either force shops on a household
  that refused them or drop the seed for every caller that omitted the argument.
  Each field is compared against `true` rather than coerced, so `{buy:'yes'}` is
  **not** a tick.
- **No definite article** — *Garden*, not *The Garden*, which is a change from
  how D58 and the design doc write them in prose. Every other seeded term is a
  bare noun, and a chip reading *The Garden* beside one reading *Market* is one
  term written as a phrase and the rest as labels. It also keeps
  `householdLetter()`'s article rule off terms, where it was never meant to go.
- **`SEED_STORES` is `SEED_SHOPS`**, and the seeded shops now carry
  `kind: 'shop'` explicitly rather than leaning on `toSourceKind`'s `''`
  fallback. Nothing behaves differently.
- **`CARD_CHECKBOX_ROW` is `PAGE_CHECKBOX_ROW` with one token moved** — the ring
  offsets against `surface` rather than `canvas`, because both creation cards
  are `surface` while the item sheet's ground is a near-`canvas` gradient. The
  hover is unchanged and still right: `surface-alt` is a real step from
  `surface` in both themes (D45).
- **The glyph beside each label is the run list's own**, so this is the
  **fourth** place the sprout and the pot are taught before an item card draws
  one. The label carries the weight of its own answer — 600 on `textStrong`
  ticked, 500 on `text` not — so the block reads at a glance rather than by
  inspecting three 22px boxes.
- **The hint has four states, not the doc's three**: it also answers *nothing
  ticked*, which the design's table treats as an aside and which is a real
  answer here.
- **This retires a settled D58 line.** *The seeded stores are all shops, so a
  new household is a `STORE` household on day one* — that is now an answer
  rather than a property of the seed, and a household that ticks grow reads
  `SOURCE` before it holds a single item.
- **A second step was drawn and lost** — `NEW HOUSEHOLD · STEP 2 OF 2`, *How do
  you stock it?* It reads better and turns *one screen, not a wizard* into a
  wizard, then grows a *Back* and a step count.

**This reaches new households only**, as D50's types do — nothing backfills, and
the published household keeps the three shops it has.

**Verified without a browser**: typecheck clean, **445 assertions** (26 new,
covering the absent-versus-empty pair, truthiness not being a tick, the band
order, the article rule, and the group word flipping on the seed), the artifact
shows ten tables, nineteen mutations, `db.migrations` empty and `/api/status` as
the only endpoint, and **all 70 class literals** in the three touched components
plus the new control style were diffed against a live `/zero.css` by unescaping
the sheet's own selectors — printed, never hand-written. The **real handler** was
driven over `POST /__spacefast/zero/run` on a throwaway `sf dev --port 4199`
across all eight branches: buy-only, all three, grow-only, make-only, none,
**the argument omitted** (three shops — backward compatible), a bogus non-object
payload (three shops), and `{buy:'yes',grow:1,make:{}}` (none). Locations (3) and
types (14) are untouched in every branch, and the group word reads `Source` for
the grow household and `Store` for the other two.

The three rows and the moving hint are the only new surface, and `?signedout`
does not reach first run — a fresh `sf dev` with no household does, and the
dialog is one press from the drawer's switcher.

### The admin console (D62) — 2026-08-29

`.claude/docs/design/admin-console.md`, drawn on
`.claude/docs/design/larderlogadminconsoleboards.html` — twenty-six boards on
three pages, **built in seven stages in one day**. The whole of it except board
10.

**One schema change**: `activity`, the eleventh table, which applies on the next
publish with no flag as `profiles` did. **Thirteen queries** and **twenty-five
mutations** — eight new queries (`adminAccess`, `adminSummary`,
`adminHouseholds`, `adminHousehold`, `adminPeople`, `adminAccount`,
`adminActivity`, `adminActivityExport`) and six new writes (`adminSetRole`,
`adminRemoveMember`, `adminRevokeInvite`, `adminDeleteHousehold`,
`adminTransferOwnership`, `adminDeleteAccount`).

**Board 10 — *seeing inside a household* — is decided against**, on 2026-08-29,
and recorded in D62 as a decision rather than an omission because the design
document asks for exactly that. Metadata-only holds; support means asking
somebody inside the household. **Do not build it without reopening the
decision** — and if it is reopened, the amber banner and the household being
told are not negotiable parts of it.

#### The shape

- **The console is a pane, not a surface** — pushed into the app drawer exactly
  as Members is, so the way out is the gesture the app already teaches and it
  inherits collapse, the rail and the account row for free. **There is no admin
  shell.** The content column swaps; everything outside it does not.
- **`/admin` cannot exist** — `SPA false`, so the edge 404s it before the app is
  reached, which is a **better** refusal than board 8's: it says less, and says
  it identically to an administrator and a stranger. `?admin` is the deep link
  and is **not a gate** — every console query re-checks the flag server-side.
- **The console is not in `useViewState` (D51).** An app that reopens on a list
  of every household in the space has forgotten what it is for.
- **The collapsed rail is the console's while the console is open**, which is
  the design's own instruction: **back-to-the-pantry takes slot 2**, where the
  household switcher sits, *"for the same reason: it is the control that says
  which thing you are looking at."* The four sections take the filter groups'
  places and Settings goes with them — every one of those is a control over *a*
  household, and the console is not about being in one. Expand, appearance and
  you survive, because none of them is.

#### Who administers

- **A name in `LARDER_ADMIN_IDS`** in `.env.server`, read through `ctx.env`,
  which **reaches query handlers** — confirmed against a running capsule, and
  the fact the whole design rests on. **Fail-closed**: absent or empty means
  nobody. **There is no admin role and nothing in the UI grants it**, ever.
- **`sf dev`'s guest is an administrator, and that is the third deliberate
  hole** after D14's client gate and `isSignedIn`'s server-side twin. Without it
  the console cannot be clicked at all. Take it out with D14.
- **`requireAdmin` is the most load-bearing line in `server/`.** The six console
  mutations are the only ones in the capsule that reach a household the caller
  is not a member of, and there is no backstop beneath them: Zero has no
  row-level security and an administrator has no membership row to resolve
  against.
- **An administrator is exempt from none of the household's own rules** — D22's
  last owner, D21's invite revocation on a demotion or removal, and the delete
  cascade all carry over. A console that could strand a household would be
  manufacturing the state its own Overview flags as needing attention.

#### The two lines it will not cross

- **The console never shows an invite code.** A code *is* the authorization
  (D39), so showing it hands every administrator a silent route into any pantry
  — which is what the refusal card in the other column of the same page promises
  it does not do. *An administrator can already delete a household* does not
  rescue it: **deleting is loud, recorded and irreversible; joining is none of
  the three.** That sentence is the one to re-read if either rule is revisited.
- **The log records administration and nothing a household does to its own
  pantry**, verified rather than assumed — an `addItem` and a `createInvite`
  both wrote zero rows. And it records no address, no device, no session.

#### What the platform could not give

Three board fields, and none is a later stage:

- **Every email.** D56 — a Spacefast account carries no `email` claim and a
  handler is only ever told about its caller. Search covers names and ids.
- **Storage**, on Overview and per household. The server context carries no
  storage handle in either direction. *Live invites* takes the fourth card.
- **Last seen**, on People and on an account. Nothing records a session, and the
  derivable proxy would attribute another member's edit to this person.

Also cut: the `Awaiting deletion` chip, which needs a hold column (*Sole owner*
takes its place and is more useful), and `Signs in with`, which D47 settled.

#### Counting is a scan

**`by_creation` is on every table, including `households`, which declares no
index at all** — that is what let a cross-cutting surface ship with almost no
schema change. It also means **a count is a full scan**, since Zero's query
builder is `collect` / `take` / `first` / `paginate` with no aggregate. Six of
the eight queries read whole tables. Fine at this size, **not fine in the low
thousands**, and the fix then is a denormalised counts row per household
maintained by the mutations that already invalidate, not a smarter query.

**Last-active is computed, not stored.** `households` still has no `changedAt`
(D44 argued it out); the console takes the newest `changedAtOf()` across a
household's items and three taxonomies. **An unknown last-active is not
dormant** — every pre-D44 row holds `''`, and the alternative flags the oldest
households as abandoned.

#### The audit log

- **A deletion entry denormalises and nothing else does**, and its counts are
  taken **before** the cascade. The card says so on its own face.
- **`held` is JSON in a string** because Zero has no array, JSON or numeric
  type. Its decoder **never throws**.
- **The action is a stored slug; the sentence is assembled.** An unrecognised
  slug still reads as a time and a person.
- **A millisecond stamp was not enough, and this is the bug worth
  remembering.** Two rows from one mutation landed on the same millisecond and
  `by_at` descending put a transfer **above the deletion that caused it**.
  `logActivity` never reuses a stamp now. Per-isolate, so concurrent requests
  can still tie. **Nothing but reading the rows back would have found this.**
- **`actorName` is a copy that survives the account.** An audit log you can
  erase by deleting yourself is not one — and **both deletion screens say so**,
  which the design asks for a lawyer's read on.
- **Retention is enforced and is not a control in the console.** A deliberate
  narrowing: an administrator who can shorten retention can erase the record of
  what administrators did. `LARDER_RETENTION_MONTHS` sits beside
  `LARDER_ADMIN_IDS`; enforcement is **append-time**, because there is no
  scheduler, so **a log nothing is adding to is a log nothing is pruning**.
- **Export is a range and it says when it was capped.** Bad bounds return
  nothing, never everything. CSV, carrying the stored stamp.
- **`client/lib/activityCsv.ts`, not `shared/`** — it reaches `Blob`, `URL` and
  `document`, three identifiers the capsule compiler's denylist rejects. The
  app's first download of any kind.

#### One component in two hosts, and the bug that follows

**`AccountMenu` is rendered twice** — the drawer's foot row and the collapsed
rail's flyout — and the *Admin* row shipped wired to the drawer alone. The
result was a menu that had the row or did not **depending on whether the drawer
happened to be collapsed**, which is invisible to a typecheck, to the class
diff, and to every handler test. It was found by using the app.

Two fixes, and the second is the one that matters:

- `CollapsedRail` takes `onOpenAdmin` and passes it through, like the drawer.
- **`openAdmin` and `closeAdmin` are defined once in `Pantry`** and handed to
  both hosts, rather than inlined at each call site. A handler written twice is
  a handler that will be changed once.

**Neither of them moves the drawer**, which is the correction that came with
the rail's console state. `openAdmin` un-collapsed for one round, on the
reasoning that the console *is* the drawer pane and opening it behind a folded
drawer would leave no visible way back — true until the rail carried
back-to-the-pantry and all four sections, and false the moment it did. **Going
to the console and coming back is a change of what you are looking at, not a
change of how much chrome you want beside it**, and somebody who has folded the
drawer away has already said what they want. The household switcher never
touched it and was right not to.

**Below `md` there is no rail**, and the account menu is only reachable from
inside the open slide-over — so the drawer is already open there and there is
nothing for either handler to set.

**The rule: anything either host hands `AccountMenu` has to be handed by both.**
The same applies to `RoleMenu`, which has the drawer and the console.

**And it exposed a worse state.** Collapsing the drawer while the console was
open left the console in the content column beside a rail still offering to
filter a pantry — two apps in one screen. That is what the rail's console state
above fixes, and it is why the "deliberate gap" it used to be recorded as was
not one.

#### Components and craft

- **The chart is `@spacefast/zero/charts`**, an undocumented platform module, so
  it costs nothing against the bundle. `lineChartLayout` does the arithmetic;
  every colour is overridden, because its slot palette is a blue that belongs to
  nothing in this app.
- **`RoleMenu` gained `onDark`** and is the console's one component that changes
  surface, exactly as the design predicted.
- **The Members card is the one card that does not clip.** A popover inside
  `overflow-hidden` is cropped at the card's edge.
- **The pre-flight is 520 rather than 420** — the console's one deviation from
  the confirm shell, and `ModalShell` gained a `width` prop (a number, not a
  class, because Tailwind scans for static strings). **Its disabled primary is
  right there and nowhere else**: D36 is about a control whose reason is
  off-screen, and here the reason *is* the screen.
- **`adminTransferOwnership` is a real hand-over**, not a promotion: promote
  first so there is never an instant with no owner, then demote every other
  owner. It takes no `from` — the ownerless case has nobody to name.
- **A refusal is a banner on the page, not a toast.** *Make someone else an
  owner first* is an instruction about a control below it, and an instruction
  must not time out.
- **Crimson is still never a button.** Every destructive trigger is crimson text
  on nothing; every confirm takes the ordinary ink primary.
- **Searching adds *Best match* and takes the chips away**, and clearing the
  field restores the sort the list had before. **Day one drops the search and
  chips entirely** — `total === 0`, not `matching === 0`.
- **At 390 the chips scroll and nothing is pinned**, every control clears 44px
  and the rows clear 78. The `md:` split there is D45's rule (is there a scroll
  gesture?), not row 2's (do the labels fit?).
- **Activity is deliberately not drawn at 390.** Three of its four parts are
  long; it may not belong on a phone at all.

#### Verified, and how

Typecheck clean, **548 assertions**, the artifact at eleven tables / thirteen
queries / twenty-five mutations / `db.migrations: []` with `/api/status` still
the only endpoint. Every class literal across the console's ten files diffed
against the freshly built `zero.css` by unescaping the sheet's own selectors —
printed, never hand-written, proved each round to discriminate against
deliberately bogus classes, and **every `md:`/`lg:` override confirmed by byte
offset to land after its base**.

The **real handlers** were driven over `POST /__spacefast/zero/run` throughout,
on throwaway households and seeded probe accounts so nothing of Justin's was
ever at risk: every list axis; every pre-flight refusal with the household
unchanged after all six; the delete cascade **scanned for orphans across all
nine tables** (zero in each — Zero has no foreign keys, so nothing else would
notice); pruning watched to actually delete (retention `0` took the log from 12
rows to 1, then 24 pruned nothing); export returning nothing for reversed and
garbage bounds; the orphan state manufactured and fixed; and **every query and
mutation driven once with the dev-guest bypass disabled**, answering `denied` or
refusing. Four throwaway probes were added and removed, each with the artifact
printed to prove it went.

**Two escaping traps, both found here**: the bundler escapes `’` as `\u2019`
**and** `—` as `\u2014`, so a `grep -F` for copy containing either returns 0
and looks exactly like a missing string.

**The first thing clicked here found a bug none of the checks above could**:
the *Admin* row was missing from the rail's account flyout. **To see it**: the account row → **Admin**, from the drawer's
foot **or** the collapsed rail, or `http://127.0.0.1:4173/?admin`. The local database has
`Preflight Test` and `Preflight Solo` to destroy and 7 audit rows to open. What
it cannot show locally is a space with **no** households (day one), a second
real person, or 390.

### Every console control has its states now — 2026-08-30

**Client only**: no schema change, no handler moved, no new decision. Eleven
tables, thirteen queries, twenty-five mutations, `db.migrations` still empty —
the artifact is byte-for-byte the shape D62 left it.

A sweep of every button, field and menu in the console's ten files against the
app's own control vocabulary. **Ten controls were missing states they were
written to have**, and the shape of the failure is one the app has now recorded
four times: **an inline style beats a `hover:` class, silently.**

- **The console's two sort triggers had no shell at all.**
  `PAGE_BUTTON_QUIET`'s own comment says it is *resting colours only* and names
  the four things a caller has to bring — `border`, `transition-colors`,
  `active:translate-y-px` and `PAGE_FOCUS`. `Pantry`'s two call sites bring all
  four; the console's four brought `border`. So the console's sort trigger and
  both back buttons had a hover, no transition, no press nudge and **no focus
  ring**, and the sort trigger had **no open state** — an `aria-expanded` a
  screen reader could hear and nobody could see. It borrows `SortMenu`'s open
  fill, which is now `PAGE_BUTTON_QUIET_ON` in `controlStyles` rather than a
  `TRIGGER_ON` local to that file; three callers is past where a shared rest and
  two private opens is a good trade.
- **Six inline `color`s were each byte-identical to the token beside them**, so
  they changed nothing at rest and did exactly one thing: beat the style's own
  `hover:text-*`. `theme.text` *is* `ink-body` in both themes, `theme.textMuted`
  *is* `ink-muted`, `d.inkMuted` *is* `on-dark-muted`. The three pagers and the
  pre-flight's unanswered row lost theirs outright; the drawer's four nav rows
  had all three of theirs turned into classes, which is what makes
  `DRAWER_NAV_ROW`'s `hover:text-on-dark` fire **for the first time** — the glyph
  and the count now move one step with the label on `group-hover`, the run
  segment's rule.
- **The refusal banner's `×` was `class="shrink-0"` and nothing else** — the one
  control in the app with no hover, no press and no ring of its own.
  `PAGE_BANNER_X` is `DRAWER_PANEL_X`'s light twin and makes the same choice for
  the same reason: **it moves the fill and never the text**, because the crimson
  is inherited from the banner and a `hover:text-*` would announce that pointing
  at the dismiss changed what the sentence beside it means. The fill goes *up*
  to `surface`, D45's rule on the lighter of the two grounds.
- **`PAGE_GHOST_DANGER` exists because `LIST_GHOST_ON_CARD` plus an inline
  crimson is not the same thing and looks like it.** Three destructive triggers
  wore that pairing, so each carried a `hover:text-ink` it could not perform.
  The crimson is declared at rest now and the hover is only the fill — which is
  `DRAWER_GHOST_DANGER`'s construction, one surface over. Crimson is still never
  a button. **Two of the three then needed a second fix — see below.**
- **Two utilities for one property is a coin toss, not an override**, and that
  is the trap under the obvious fix. `text-ink-muted text-ink-body` on one
  element is resolved by **sheet order**, not attribute order — so the
  pre-flight's unanswered trigger and Activity's *Export* each got a whole
  constant (`PAGE_SUNK_UNSET`, `PAGE_BUTTON_OUTLINE_ON`) rather than three
  classes appended beside the closed one.
- **`DRAWER_NAV_ROW_ON`** is `DRAWER_CHIP_ON` with its ring offset moved to
  `drawer-raised`. The selected nav row was drawing its focus ring against the
  drawer gradient while the three rows around it got it right; they are one
  block and take one offset.

**What was checked and found correct**: every menu row's missing press nudge
(app-wide — `SortMenu`'s rows have none either), `PAGE_ICON` on both search
clears, `RoleMenu` on both surfaces, the three confirms, the pager's disabled
half, and the chevron rotations. The synthetic `<a download>` in
`activityCsv.ts` never enters the document long enough to have a state.

#### And the loading state could never become anything else

`AdminLoading.tsx`, shared by all seven console screens, replacing seven copies
of `Loading…` in 14px grey — which is the pre-`EmptyState` mistake repeated for
loading rather than for emptiness.

**The escalation is the reason it exists and the platform forces it.** Zero
emits `query.result` on success only — there is no error path — so a query that
throws leaves its subscription on the initial value **forever**, byte-identical
to one still in flight. Nothing can tell those apart, so **time is the only
signal there is**: past ten seconds the copy stops claiming to be loading and
says something went wrong *probably*, which is the strongest honest claim
available. The control is **Reload** rather than *Try again* because that is
what it does — `useQuery` hands back no refetch handle and there is nothing to
retry.

**Nothing paints for the first half-second.** Every console subscription opens
in the same tick as the pane, so the ordinary case resolves before this would
draw, and a word that flashes and vanishes reads as a glitch. It is the pane's
own scope-line argument — absent rather than wrong for a beat.

**Denied still paints nothing at all**, which did not change: every console
query re-checks the flag server-side, and a screen explaining the refusal would
be the 403 the app decided against showing anybody.

**Verified without a browser**: typecheck clean, 548 assertions, the dry-run
artifact unchanged (eleven tables, thirteen queries, twenty-five mutations,
`db.migrations: []`, `/api/status` the only endpoint), **all 657 class literals
across the console's twelve touched files** and **all 58 utilities in the six
new control styles** diffed against the freshly built
`.spacefast/zero/public/zero.css` by unescaping the sheet's own selectors —
printed, never hand-written, and proved each round to discriminate against a
deliberately bogus class — with every variant confirmed by **byte offset** to
land after the base it overrides (`hover:text-on-dark` after
`text-on-dark-muted`, both `group-hover:` rules after their bases,
`hover:bg-surface` after `bg-surface-alt`).

**This one is entirely hover, press and focus**: it wants a pointer, a Tab key and a screen that takes ten seconds to answer.

#### A hover has to move against the ground, and a class cannot see the ground

**Both *Delete* buttons shipped from the sweep above with no visible states at
all, and the sweep is what put them there.** `PAGE_GHOST_DANGER` hovers to
`surface-alt`; *Delete household* and *Delete account* each sit in a strip
filled `surface-alt` at the foot of their card. So the hover landed on the
colour the button was already on, and the focus ring offset against a fill that
was not behind it. Reported from a real session as *"the delete account and
delete household buttons have no interactive states"*, which is exactly what
they had.

**The rule was quoted in the constant's own comment and then not applied to the
callers.** D45 — *an interaction state moves away from its ground* — is now on
its fourth component, after the applied-filter chips, `LIST_GHOST` /
`LIST_GHOST_ON_CARD` and `PAGE_KIND`. `PAGE_GHOST_DANGER_SUNK` is the twin whose
hover goes **up** to `surface`, because on the lighter of the two grounds away
means up. *Revoke* keeps the card form: it sits on the invite row, which is
`surface`, and was correct all along — which is why one of the three survived.

**The check that missed it was asking the wrong question.** A class-literal diff
proves a rule exists in the sheet; it cannot see what is painted underneath, so
`hover:bg-surface-alt` on a `surface-alt` strip passes it and does nothing on
screen. The ground-aware check that replaced it resolves each control's nearest
painted ancestor — expanding `controlStyles` constants, because `PAGE_MENU` *is*
`bg-surface` and a popover read as unpainted blames its rows on whatever is
behind it — and compares that against the hover target and the ring offset.
**Across the console it now reports 36 controls and 0 flagged**, and every
finding it produced along the way was read against the source before being
acted on: three of its first five flags were its own bugs, not the app's.

It found two smaller siblings of the same defect while it was there, both
ring-offsets rather than dead hovers:

- **The pre-flight's choice trigger** wore `PAGE_SUNK`, whose ring offsets
  against `surface` because the console's role menu opens on a `Card`. The
  pre-flight's rows are `surface-alt`. `PAGE_SUNK_ON_ROW` and its `_UNSET` twin
  are that one token moved; the hover was already right, which is why it did not
  read as dead.
- **The console's two search clears** wore `PAGE_ICON`, whose `ring-offset-canvas`
  is correct for its three item-sheet callers and wrong over a `bg-surface`
  field. `PAGE_ICON_IN_FIELD` is the field's form. The app has no search clear of
  its own — these are the first two.

#### And the same bug across the app proper — 2026-08-30

The check was then run over all 144 controls in `client/`, and every flag read
against the source before being acted on. **Four were real.**

- **Both drawer segmented controls** — Filter / Settings, and Appearance's three
  theme options — wore `DRAWER_CHIP_ON` on their selected half, which is right
  for a filter chip on the gradient and wrong inside a `drawer-well` track two
  ways at once. The offset painted a colour that is not behind it, **and there
  was nowhere for an offset ring to go**: the track is `p-1` with `gap-1`, so
  `ring-2 ring-offset-2` reaches exactly 4px — flush to the track's inner edge
  and touching the next tab across the gap. `DRAWER_SEGMENT_ON` puts the ring
  **inside**, which is what the unselected half has always done.

  **And going inset forced a colour change, which exposed the worse half of it.**
  On the pill's own cream fill `ring-on-dark` measures **1.00:1** — it *is* that
  colour — and `focus-dark` reaches only 3.01:1. `drawer-press-ink` is
  **13.70:1** and is the pill's own label colour, so the ring is a text token
  doing what the shopping-list checkbox and the beta badge already do with a
  border. The unselected half keeps `ring-on-dark` at 15.09:1 light and 16.62:1
  dark.
- **`SortMenu`'s rows were `PAGE_MENU_ROW` character for character apart from
  the focus ring** — `PAGE_FOCUS` offsets against `canvas`, and they are inside a
  `surface` popover. They are `PAGE_MENU_ROW` now, which fixes the offset and
  removes the duplicate in one line.
- **The Filter tab's *Add a …* row inside the editing card** and **the invite
  card's *Copy link*** each offset against the gradient while sitting on
  `drawer-raised`. `DRAWER_CHIP_ADD_ON_CARD` is new; `DRAWER_PRIMARY_ON_CARD`
  already existed for the install pill and this caller had been missed.

**Five flags remain and all five are the checker's**, each confirmed by reading:
the walk crosses a **sibling** carrying a fill — `Pantry`'s *Add item* beside the
search `<label>`, the filter chips beside a `DRAWER_CHIP`, the switcher's rows
beside their own selected row — and blames it as the ancestor.

**The blind spot worth knowing**, because it is where the remaining real ones
are: **the check can only name a fill that is a `theme.json` token.** A control
inside `DrawerMenu` (`drawer.menu`, `#15110B`) or on a `panelSkin` panel
(`#262019`) has an ancestor the check reads as unpainted, so it walks past.
`AccountMenu`'s *Save*, the switcher's four controls and the invite composer's
*Create* are all in that position, and **their offsets cannot be right**: the
switcher alone is hosted by two surfaces with different fills, so no single
offset serves it. `DRAWER_MENU_ROW`'s comment already states the answer —
*"the menu's own fill is not a `theme.json` token, so there is nothing for a
ring offset to resolve against"*, hence `ring-inset`. Switching those controls
over is a real piece of work with a decision in it (inset everywhere, or promote
`menu` to a token) and is **not** done.

**The lesson, and it is the third of its kind here.** Typecheck, the class diff
and the artifact read all passed on two buttons that did nothing under a
pointer, exactly as they passed on an inert `ResizeObserver` and on a rail
flyout missing its *Admin* row. **Every browserless check this project has
verifies that something is present, and none of them verifies that it does
anything.** The ground check narrows that gap by one class of bug and does not
close it.

#### The chart has a tooltip — 2026-08-30

The design's *Dark* section specifies the surface and nothing else, and the
surface is the whole of what it needed to say: **it is the rail's `Tip` with two
lines in it.** The app already had a tooltip and it already borrows the drawer's
darkest layer, so this stays a near-black box with cream text in **both** themes
rather than inverting into a cream card on a dark chart — the toast's argument,
one component over. `bg-drawer-well` on `border-drawer-line`, the month in
`on-dark-faint` caps over the count in `on-dark`.

- **A band, not a dot.** The twelve points are ~50 viewBox units apart and the
  marker is 4 across, so hit-testing the dot would mean aiming at the one part
  of the chart that moves as the data does. Each band runs midpoint-to-midpoint
  with the two ends running out to the plot's edges, so the plot is covered and
  there is no gap between months where nothing happens. It is *the whole row is
  the checkbox*, applied to a chart.
- **The scale is worked out, not assumed, and that is the load-bearing line.**
  The `<svg>` is `width: 100%` with a fixed height, so its box and its `viewBox`
  rarely share an aspect ratio — and the default `xMidYMid meet` then renders at
  the **smaller** of the two scales and centres the slack. A wide card leaves
  the chart centred horizontally at natural size; a narrow one shrinks it and
  centres it vertically. Treating a point as *x over 640 of the width* puts the
  tooltip beside the month it names, on most widths.
- **It measures on `pointerenter`, so there is still no `ResizeObserver`** —
  twelve measurements at most, never one a frame. That is what keeps the
  chart's own comment true rather than quietly reversing it.
- **A transparent backdrop under the bands clears the tooltip**, because
  `pointerleave` on the `<svg>` is not enough: the axis strip and the
  letterboxed slack are both *inside* the element, and on a narrow card that
  slack is tens of pixels. Backdrop and bands are **siblings**, so entering one
  leaves the other — one state change either way. A pair of `onPointerLeave`s on
  the bands cannot do it: leave and enter are separate dispatches, so that
  version renders a null between two months and flickers.
- **The tooltip is clamped to the card and the marker is what makes that
  honest.** Measuring the box would mean rendering it to find its width and
  again to place it. When the clamp bites the box stops sitting over its own
  dot — and the vertical rule and the marker are still on the month, which is
  the half of the answer that has to be exact.
- **The twelve values moved into the `aria-label` and the tooltip is
  `aria-hidden`.** The label read only the ending value before, so the series
  was pointer-only. The alternative — twelve focusable months — would put twelve
  tab stops between the stat cards and *Needs attention*. The label spells the
  year out on every month, because `label` alone reads `Mar` in the middle of
  the range.
- **No transition.** Twelve bands a pointer sweeps across would restart a fade
  on each one, and the box is not appearing and disappearing so much as moving
  between months.

Verified with the rest of the pass: 675 class literals across the console's
twelve files, 0 missing, and the artifact unchanged.

**What it cannot show locally** is a space with twelve
months of real households — `?demo` fills one household, not a year of them.

#### A member row opens that person — 2026-08-30

**Client and one DTO field**: no schema change, no new handler, no new class —
every utility the row uses was already in the sheet. Eleven tables, thirteen
queries, twenty-five mutations, `db.migrations` still empty.

The seam between the console's two halves ran **one way**. An account page's
household rows opened the household; a household's member rows opened nothing,
so getting from *this household has a member called Nora* to *what else is Nora
in* meant going back to People and searching for her by name. Reported from a
real session, and it is the obvious thing to try on that card.

- **`AdminMember` carries a `userId` beside its `id`, and the two are different
  things.** `id` is the **membership** — what `adminSetRole` and
  `adminRemoveMember` take. `userId` is the account, which is what the account
  page is keyed by. The row writes to one and navigates to the other, which is
  why it needs both. The handler's return type is
  `Promise<AdminHouseholdDetailResult>`, so **`typecheck` is what proves the DTO
  actually carries the new field** — an untyped object literal would not have
  been caught.
- **The row is two controls, not one, and that is forced.** The account page's
  household rows are a single full-width `<button>`; a member row already holds
  the role trigger, which is a button, so the same construction would nest one
  inside another. The left part takes the padding, the `ADMIN_ROW` fill and the
  chevron; the trigger keeps its own hit area outside it — which is also what
  stops a press on *Owner* from navigating away from the menu it just opened.
- **`ADMIN_ROW`'s ring offsets against `surface`, which is this card's fill**, so
  the ground rule holds without a new twin (D45). Nothing new was added to
  `controlStyles`.
- **The `pl-3 pr-5` wrapper keeps the card's 20px gutter** while giving the
  chevron and the role word the row's usual 12px between them. The card is
  already `clip={false}` for the popover, so nothing crops.

#### Going live needs one id that nothing will tell you — 2026-08-30

**`LARDER_ADMIN_IDS` is the only thing standing between the console and
production**, and it is fail-closed by design: absent means nobody, and there is
no bootstrap path in the UI and never will be (D62). So the console cannot be
opened until a real `account:…` id is written into `.env.server` — and **the
platform offers no supported way to learn one**:

- `ctx.auth` tells a handler about its **caller** only, so no query can report
  somebody else's id, and the console's own queries are behind the gate anyway.
- An `endpoint` gets a full `ServerContext` and **no `ctx.auth`**, so the probe
  trick that answered the runtime questions cannot answer this one.
- **`sf db export` fails exactly as `sf db dump` does** — both 500 with
  `zero_db_connect_failed` on `households`, confirmed 2026-08-30 with two
  request ids and written up in `.claude/docs/spacefast.md`. So the two commands
  that would print the `memberships` rows are the two that are broken.

**Amended 2026-09-07: there is a supported route, and the two broken commands
are broken for a stated reason.** The rewritten docs say `sf db dump` *"reads
through the space's live runtime, so it needs the app to be reachable"* — so
`zero_db_connect_failed` was never a database fault. It is the runtime lane, the
same one `zero_artifact_mode_invalid` is in.

**`sf db console` is the answer to this whole section.** It mints a
**single-use phpMyAdmin sign-in URL with full SQL authority** over the space's
database (`POST /v1/spaces/{spaceId}/db/console`, or **Database → Open db
console** in the dashboard). It opens a browser by default, because of what the
URL grants; `--show-secret` prints it instead and is the deliberate override.
**So `select userId from memberships` is one query away**, and the claim above
that the platform offers no supported way to learn an `account:` id is retired.
Nothing else in this section changes: `LARDER_ADMIN_IDS` is still the only gate,
still fail-closed, and still set out of band.

**The route below still works and is kept for the case where the console is
not to hand** — it needs no dashboard, no browser session on api.spacefast.com,
and no full-SQL grant, which makes it the smaller thing to reach for. The SDK
stores the identity at `localStorage['stattic_zero_identity']` — a JSON record
carrying `token` and `userId` — so signed in on the live space, devtools
console:

```js
JSON.parse(localStorage.getItem('stattic_zero_identity')).userId   // "account:…"
```

`AUTH_STORAGE_KEY` is in `@spacefast/zero/dist/client.js`; **`readStoredIdentity`
is not re-exported from the public `./client` entry**, so this is a storage key
read out of `dist`, not an API. Do not build anything on it beyond this one
lookup.

**`LARDER_RETENTION_MONTHS=24` is already in `.env.server`**; `INVITE_SECRET` is
too. Only the admin list is missing.

#### The writes are held, and the console is read-only — 2026-08-30

**One constant, and a copy pass beside it.** No schema change, no handler
removed: eleven tables, thirteen queries, twenty-five mutations, `/api/status`
the only endpoint, `db.migrations` still empty. The artifact is the shape D62
left it.

**`ADMIN_WRITES_HELD` in `shared/admin.ts` is `true`**, so the console can be
read and nothing in it can be pressed. It went in *before* the console had ever
been published, so the first people to open it cannot delete somebody's pantry
with a mis-press.

- **All six writes, not the three that were asked for.** The two deletions and
  the role change were the request; member removal, invite revocation and the
  ownership transfer went with them because they are one class of thing, and a
  switch with exceptions is a switch nobody can reason about at a glance.
- **`requireAdminWrite` is the whole server half** — `requireAdmin` plus the
  flag, and the six mutations already began with the one line, so there is no
  second list of six to go stale. **A separate function rather than a line
  inside `requireAdmin`**, because the two refusals are different facts: one
  says you are not an administrator, the other says nobody is writing anything
  today, and collapsing them would send an administrator to
  `LARDER_ADMIN_IDS` looking for a problem that is not there. **Admin is checked
  first**, so a stranger guessing mutation names still learns only that they
  lack permission — telling them the console's writes are *temporarily* held
  would confirm the console exists (D39's instinct).
- **The client hides the path and the server refuses it**, and the second is the
  one that matters. A disabled button is one devtools call from a deleted
  household; the flag is read on both sides from the same constant, which is
  `termBlock`'s arrangement — one rule the server throws and the client renders.
- **Nothing was deleted.** Every handler, dialog, confirm and audit path is
  whole and still compiled, so what is being tried out is the real console with
  its writes bolted shut rather than a smaller one. **Turning it back on is that
  one constant**, plus deleting the notices.
- **`AdminHeldNotice` is what earns the exception to D36.** *A disabled control
  cannot explain itself* is a rule about a reason that is off-screen; the notice
  puts it on-screen, once, above the controls it applies to. It draws only on
  the household page and one account — **the two screens that have writes** —
  because a notice above a screen you could only ever read would be an apology
  for nothing. **Neutral, not amber**: amber in this console means *needs
  attention*, and it is on the same page as the real ones.
- **`PAGE_HELD` fades and never recolours.** The crimson on both *Delete*
  buttons is the app saying *this destroys something*, and that stays true while
  the button is asleep; repainting it neutral would say the control had become
  something else.
- **The role trigger is disabled, not removed**, and that is the one place D30's
  *absent, not disabled* is deliberately not followed: this trigger is the only
  place a member's role is **written on the page**, so hiding it would take a
  fact away in order to disable a control. `RoleMenu` gained a `held` prop; the
  drawer's own members pane never passes it.
- **The orphan dialog changes its primary rather than disabling it.** It opens
  by itself on arrival, so a dead button in it would be a thing nobody chose to
  press offering something it cannot do. *Close*, and both bodies gain a
  sentence saying the fix is on hold.

**Verified against the real handlers**, over `POST /__spacefast/zero/run` on a
throwaway `sf dev --port 4199`: **all six refuse with the hold's own sentence**,
`adminAccess` still answers `{admin: true}`, and an ordinary `createHousehold`
is untouched. Every id passed was a nonexistent one, and **the refusal arriving
instead of *that household is gone* is the proof the hold short-circuits ahead
of the row lookup**. 559 assertions, typecheck clean, 172 class literals across
the six touched files diffed against the freshly built `zero.css` — proved to
discriminate against a bogus class — and the artifact unchanged.

#### American English, US dates, and the Oxford comma — 2026-08-30

A copy pass over the console, done with the hold.

- **Dates are `Mar 4, 2026` now, and there is one of them.** The console had
  **four** copies of the day-first `4 Mar 2026` — three `MONTHS` arrays and four
  near-identical formatters across `AdminHousehold`, `AdminPeople` and
  `AdminActivity` — which had already drifted into two spellings (`Mar` on two
  screens, `March` on a third). `usDate`, `usLongDate` and `usDateFrom` in
  `shared/admin.ts` replace all of them, beside `monthLabel`, which was already
  there. **UTC throughout**, unchanged: a date in the reader's zone would put a
  household's creation on the day before it west of Greenwich, and the audit
  log — which prints the zone — would then contradict the page it was opened
  from. The fallback is a parameter because the callers mean different things by
  an unreadable stamp (*unknown* for a join date, *at some point* for a
  creation).
- **`AdminActivity`'s range labels go through `monthLabel`**, so the log, the
  chart and the range menu share one month vocabulary rather than three.
- **Two British spellings shipped in user-facing copy** and are the only two:
  `recognise` and `Unrecognised action`, both in the audit log's action
  fallback. The tests asserted the old spelling, so they moved with it.
- **Three missing Oxford commas**, all in lists of three: the delete dialog's
  *its locations, sources, and types*, and both search placeholders. The
  Activity blurb's four-item list takes none — it has no conjunction, so there
  is nothing for a serial comma to precede.
- **The comments are still written in British English** — *colour*, *centres*,
  *behaviour* — throughout this file and the source. That was left alone: the
  copy pass was about what ships, and rewriting hundreds of comments is churn
  with a real chance of breaking a class literal quoted inside one. Worth a
  deliberate decision rather than a drive-by.

#### Still open in the console's own *Gaps*

Unbuilt on purpose:

- **Concurrent edits.** Two administrators can act on one household at once and
  nothing says so. The console re-reads on every invalidate, so the second one
  sees the first's result — it just never learns that is what happened.
- **The rest of mobile.** Overview, People and one account have no 390 board.
  They *render* at 390 — the counts go 2 × 2, every control clears 44px — and
  **were looked at in a real browser on 2026-08-30 and read correctly**, which
  closes the practical half of this. What is still true is that nothing was
  drawn against, so the layouts are inherited rather than designed, and
  **Activity at 390 is still the one deliberately left undecided**.
- **Announcements** and **running cost**, both from *future-ideas*; the second
  is one the platform cannot answer any more than storage.
- **Can a household see the Activity rows that touch it?** Still admin-only,
  still unasked.

### Two charts that say what the counts cannot (D69) — 2026-09-02

**Client, `shared/` and one query's return shape**: no schema change, no handler
added — fourteen tables, fifteen queries, thirty-one mutations,
`db.migrations` empty, `/api/status` still the only endpoint. `.docs/data-model.md`
needs nothing; the schema did not move.

**Overview counts households, people and items, and none of the three says
whether anybody is using the app.** Forty households averaging six items and
four holding three hundred read identically on the four cards.

- **Pantry sizes** — households by items held, in five bands (`0` · `1–9` ·
  `10–49` · `50–199` · `200+`), horizontal bars. **The adoption measure**: D67
  was built because twenty items is a sample dataset and a real pantry is two
  hundred, and nothing reported whether that wall was cleared. Overview's
  *holding nothing* count is this chart's first band already.
- **New households per month** replaced the cumulative line **in its own slot**.
  A running total only rises, so *are we still growing* arrives as a change in
  slope; twelve columns say it outright.
- **Items added · last 12 months** on the household page, the same component
  over that household's rows. Its question is whether the pantry is alive, which
  a cumulative count cannot answer — every household's would look alike.

**The rule D69 records: a cumulative total is a *shape*, a per-month count is a
*chart*.** The sparkline half was built — three stat cards, three scales, which
is the one thing a shared axis cannot do — and **removed the same day** on
Justin's own look at it. `StatCard` and its four call sites are **byte-identical
to what they were before**, checked against `HEAD` rather than assumed.

- **The band labels are derived from the floors**, never written beside them.
  `ITEM_BUCKET_FLOORS` is the only place a boundary exists; moving one re-labels
  its neighbours and fails three assertions. `10–49` printed over a rule that
  admits 50 is a chart that is plausible, stable and off by one forever.
  **`200` is `BULK_MAX`**, so the top band is a household that took more than
  one sitting to get there.
- **`itemBuckets` takes one entry per household, zeros included.** The server
  walks `households`, not the `itemCount` map — the map holds only households
  that *have* items, so its values alone leave the first band reading zero
  forever while *holding nothing* reads two, on one screen. **Reproduced by
  mutation against the real handler.**
- **The bands are not controls, and every one is neutral.** Only `empty` has a
  filter behind it, and *Needs attention* already routes there; amber in this
  console means *needs attention* and is already saying so about the same rows.
- **`countByMonth` bars never sum to the total beside them**, because a stamp
  outside the window counts nowhere. On a household page they undercount twice
  over: nothing records a removed item, so the columns count arrivals and cannot
  fall. Both hosts say so; **`addedAtOf`, never `changedAtOf`** — an item edited
  last week did not arrive last week.
- **`MonthBars` is one component in two hosts**, owning the plot and not the
  card. The console already paid for a component wired into one of two hosts,
  with the rail's missing *Admin* row.
- **`cumulativeByMonth` is deleted** — the revert took its only caller, and two
  near-identical month-bucketing functions where one is unused is a trap: the
  wrong one still returns twelve plausible numbers. **A guard inside
  `countByMonth` went the same way**, having survived every mutation aimed at
  it — the lookup is by exact month, so the exclusion is structural. Same
  finding as the `if (! userId)` in `isAdminId`.

**The platform's chart module is degenerate on small and empty data, and only a
numeric probe finds it.** `niceTicks` divides the range into five, so a space
whose busiest month added one draws an axis reading `0 · 0.25 · 0.5 · 0.75 · 1` —
rare for a cumulative series and **the ordinary case for a per-month count**.
And a completely quiet twelve months hands back five ticks all valued `0` with a
**`null` `y`** and **`NaN`** bar heights, so the gridlines collapse onto the top
of the plot with a duplicate key. Ticks are now integers, deduped, floored; a bar
draws only on a positive finite height, which covers the empty month and the
empty year at once. Exercised across max 0, 1, 2, 4 and 40.

**`clip={false}` costs two things and the second one shipped wrong.** The chart
card cannot clip or the tooltip is cropped — the fourth time this app has met
that, after the console's Members card, the bulk review table and the transfer
menu. **The other half is that every painted full-bleed child then has to round
its own corners**, and the card's footer strip sat square on the card's curve
until it took `rounded-b-[19px]` — the card's 20 less its 1px border, the same
number the Members card's last row uses. **Found by looking at it.**

**Verified without a browser**: typecheck clean, **969 assertions**, and every
rule proved by mutation — a `>` for `>=` on the band floors fails 10, moving a
floor fails 3 *and re-labels the band*, labelling a single-number band as a range
fails 1, trusting an unclamped count fails 2 (and showed `NaN` falling through
every band), writing `countByMonth` as a running total fails 4, and clamping
out-of-window stamps into the first column fails 3. The artifact is unchanged.
**137 class literals across three files** diffed against the freshly built
`.spacefast/zero/public/zero.css` by unescaping the sheet's own selectors —
printed, never hand-written, and proved each round to catch an injected bogus
class. The new code adds **no responsive variant**, so there is no byte-offset
ordering to check.

The **real handlers** were driven over `POST /__spacefast/zero/run` on throwaway
`sf dev` servers, with a **throwaway endpoint added and removed** each time to
backdate rows — the artifact's endpoint list printed to prove it went. Six
households at 0 · 0 · 5 · 12 · 50 · 201 items put one row on each band boundary
from both sides; six more spread across and *before* the window gave a line of
`[2,2,2,2,2,4,4,4,4,4,4,6]` against bars of `[1,0,0,0,0,2,0,0,0,0,0,2]`, which
is the whole argument for the swap measured rather than asserted, with the bars
summing to 5 where the line ends at 6. A household seeded to
`[3,0,0,0,5,2,0,0,0,0,0,3]` with one item dated 2023 proved the window
excludes it and that the bars do not sum to `holds.items`; an empty household
still returns twelve zeroed months. `adminSummary` and `adminHousehold` both
still answer `denied` to an anonymous caller.

**Nothing local can show either chart with real shape** — every row created under `sf dev` lands in the current month, so the
bars draw one column, and `?demo` fills one household rather than a space. The
backdating that made the verification possible is not something a person
clicking the app can do.

### An export is CSV or JSON, and the button has a chevron (D75) — 2026-09-02

**Client and `shared/` only**: no schema change, no handler moved — fifteen
tables, fifteen queries, thirty-one mutations, `db.migrations` empty,
`/api/status` the only endpoint, and the artifact byte-for-byte what D71 left.
The capsule does not import `shared/exportData.ts` at all.

**The two exports that describe rows now offer both formats**, and *Your data*
is unchanged. **This reverses D68's *one file, no picker*** — a line that was
right about the cost of a picker and wrong that there is only one answer.

- **CSV is losing something the data has, in both of them.** An item names
  several sources and several types (D4 — there are no array columns), so a CSV
  cell flattens each into one string with a `; ` in it; and a deletion entry's
  `held` is a set of counts denormalised at the cascade, which a cell can only
  take as the sentence `12 items · 3 types`. **JSON is where those stay what
  they are**, and that is the whole argument for offering it.
- **The choice is made at the press and remembered nowhere** — not in
  `useViewState` (D51), not anywhere. A format is a property of what you are
  about to do with the file, not of the device; a remembered one is a setting
  somebody has to find before they can trust what the button hands over.
  **CSV is first everywhere**, because it is the deliverable.
- **One reading, two renderings.** `pantryRows()` resolves the household once —
  names not ids, A–Z — and both files are built from it, with the CSV's own
  column names as the JSON keys. A JSON file assembled by its own second
  traversal would drift a column at a time and every file would still open. Same
  arrangement in `activityExport.ts`, where `fieldsOf()` is the shared half and
  `held` is the one field that differs.
- **Counts stay strings in JSON too.** `on_hand` and `low_at` are decimal
  strings all the way down (D1), and a `Number()` at the export boundary would
  invent a precision the database never held and hand back `null` for the empty
  ones.
- **`client/lib/activityCsv.ts` is `client/lib/activityExport.ts`**, `git mv`'d
  so history follows — a filename claiming one format on a module that offers
  two is the kind of thing that is still true-looking a year later.

**The control is a different shape in each of the three places, because the
rooms are different.**

- **Settings → Pantry settings is a split — the app's second after *Add item***,
  and this is what Justin asked for on looking at the first build. **Two buttons
  side by side were built and replaced**: a pair reads as two features, and a
  split reads as one control with a default, which is what an export is. The
  label says `CSV` rather than *Export* — the row's label already says what the
  control is for, so the button's word is free to say *which file*, which is the
  sort trigger's rule about naming the current choice. The menu is **one row**,
  because `AddMenu`'s rule keeps the default out of it and there is exactly one
  alternative. `DrawerMenu`, opening **upward**: the export row is the last thing
  in the pane.
- **`DRAWER_SPLIT` is `PAGE_SPLIT` with both halves of its ring moved** —
  `ring-ink` is the page's near-black and nearly invisible on the drawer, and
  `ring-offset-canvas` names a fill nowhere near this control. **D45's rule on
  its sixth component.** `PAGE_SPLIT_HALF` needs no twin: it paints through
  `--split-hover` / `--split-press`, which the caller derives from the fill it
  has — and **the drawer is dark in both themes**, so that derivation has one
  direction where `AddMenu`'s needs two.
- **The audit log gets a group in the menu it already has.** Format is a
  *modifier* — the menu stays open and the sort menu's crimson check marks it —
  and a range is the *act*, which downloads and closes. A micro-label and a
  hairline stop `CSV` reading as a seventh range. **One label, not two**: a
  second header over the months was built and dropped, because in a 220px menu
  two headers are heavier than the thing they organise, and it is four lines of
  height back on a menu that grew by five — which matters on the one console
  screen with no 390 board. **Its trigger gained a chevron**, which it had never
  had.
- **The pre-flight's *Export it first* is a menu.** That row already holds a
  tile, a name, a consequence line and the decision trigger, and a format loose
  in it would be a fifth thing competing with the one control that has to be
  pressed. **The label is the instruction and has to survive** — a bare `CSV`
  beside `Delete it` says nothing. `useFixedMenu`, because the dialog card is
  `overflow-y-auto max-h-[90vh]` and a scroll container clips absolutely
  positioned descendants at its padding box.

**Verified without a browser**: typecheck clean, **1022 assertions** (14 new),
and every new rule **proved by mutation** — flattening the JSON arrays like CSV
fails 2, pinning the extension to `.csv` fails 1, `Number()`-ing the counts
fails 1, making `pantryFile` ignore its format fails 1, dropping the shared A–Z
sort fails 7, and drifting one JSON key from its CSV column fails 2. Joining the
arrays inside the *shared* reading does not fail an assertion — it throws inside
`pantryCsv`, which is the single-reading arrangement refusing to let one format
be got wrong on its own. The artifact is unchanged, and **384 class literals
across five files** were diffed against the freshly built
`.spacefast/zero/public/zero.css` by unescaping the sheet's own selectors —
printed, never hand-written, and proved each round to find a real class and
refuse a bogus neighbour (`my-[8px]`, `w-71`, `w-[185px]`). The built
`/client.js` carries `As a JSON file`, `Export as JSON` and
`application/json;charset=utf-8`, and no longer carries `as a spreadsheet`.

**One trap the checker walked into again, and it is the eighth round of the same
lesson.** The class-literal extractor read `${...}` interpolations inside
template literals as class names, so every ternary in a `class={`…`}` reported
its `?`, its `:` and both quoted operands as missing — 17 false positives on the
first run, four of them in files nothing had touched. **Strip the expressions
before splitting**, exactly as comments have to be stripped before reading
source. A check that reports a missing class is worth nothing until it has been
shown to find one that is really there and refuse one that is really absent.

All of it is press-time: the split's two halves and its upward menu, `↓`
opening that menu from the label, Escape handing focus back, the format check
in the console's menu, and the pre-flight's chevron. **To see it locally**:
Settings → Pantry settings, or `?admin` → Activity → Export.

### A run list card is A–Z, and nothing else (D74) — 2026-09-02

**One comparator in `shared/runList.ts`**: no schema change, no handler moved,
the artifact unchanged. Amends **D41's store card** — *rows out-before-low then
A–Z* — and the line D58 carried forward with it.

**A row's status is already on the row**, in a badge with a colour and a word.
Sorting by it a second time spent the card's whole order restating something you
can see without moving your eyes, and paid for it with the one property a list
you are walking a shop with wants: **an order you can predict without reading
anything.** Butter is where Butter was last time; it does not climb to the top
because somebody took the last one, and it does not fall back when a put-away
lands. That is the run list's own objection to reordering under a thumb, applied
to the status rather than to the tick.

- **The card has one order now instead of two.** `NOT YET` has always been plain
  A–Z — nothing down there has a badge — and the rows above it now agree with
  it. One `byName` serves both.
- **`putAwayRows` changed by not changing**: it walks the bands rather than
  sorting again, so *the screen you just ticked, read back to you* stays true for
  free. It is pinned separately anyway, because that is the assertion that would
  catch the two drifting apart.
- **`RANK` and `byStatusThenName` were deleted, not kept** — D69's rule about
  `cumulativeByMonth`: two near-identical orderings where one is unused is a
  trap, because the wrong one still returns a plausible card.
- **`runList.ts` still belongs in `shared/`, but not for the reason its docblock
  gave.** That reason was out-before-low being one sentence the client and the
  restock sort must not write twice; what keeps it there is the grouping, which
  is invisible when wrong.
- **Nothing else moved** — the cards are still A–Z with the storeless one last,
  the badge is unchanged, and the three status pills never saw this ordering.

**The change passed all 1006 assertions on the first run, and that was the
finding.** The fixture pinning the row order was Costco's Bacon, Butter and
Coffee — and Bacon is out *and* first alphabetically, so the two rules agreed on
it. **A rule nothing discriminates is a rule that can be reversed by accident.**
Two assertions were added with fixtures written to disagree (an out row whose
name sorts last must stay last, on the card *and* on the put-away sheet); both
fail when out-before-low is put back, which was measured rather than assumed.
**1008 assertions.**

**It is one line of behaviour**: open the run list on
a card holding a mix of out and low rows and read down it.

### The type sort is built, measured and reverted (D73) — 2026-09-02

`.claude/docs/design/run-list-sorting.md`, drawn on
`.claude/docs/design/runlistsortingmockups.html`. **Built in full and reverted
the same day. Nothing ships** — no schema change, no source change, the artifact
byte-for-byte what D72 left, and `npm test` back at 1006. The removal is
complete rather than flagged off, which is `Save and add another`'s trade (D67)
and D69's sparklines'.

**Four things are settled by having built it**, and D73 has them so they do not
have to be re-derived: the grouping is a **partition of an already-ordered
list**, so out-before-low demotes from the card to the group rather than being
dropped; **source stays the card**, because a card per type averages 2.4 rows and
puts three shops in each one; a **multi-typed item places under the first of its
types in the household's order**, which has to be answered by anything that
groups by type because `itemTypes` is already a join table; and the subhead is
**`NOT YET` with a dot on it** at `NOT YET`'s own 34px.

**What killed it is a measurement about row 2, and it outlives this feature.**
At a docked 1120 — the narrowest width the drawer docks at — the content column
is **712px**, a three-band segment wearing its words spends **442**, and *Back
to items* plus the trip clause plus the row's gaps were already **265**. **That
row has about five pixels spare**, so anything added to it costs the segment its
words at 1120, and the only question is how far up the widths the damage runs:
the grid's `SortMenu` put the words back at ~1233, a `Tag` toggle at ~1219,
against ~1115 before.

**Two control shapes were tried.** The grid's `SortMenu` with two rows in it cost
~100px and could only be paid for by stripping *Back to items* to a bare
chevron — a control losing its label so another could keep a word you have to
press it to read; **two options is a boolean and a menu is the wrong shape for
one**, and the argument for it (*a bare toggle would not name the state it is
in*) is true of a bare toggle and false of a pressed one, which
`RunListTrigger` on this same row has been demonstrating all along. A `Tag`
toggle — the rail's own glyph for the taxonomy, the console chips' own ink
on-state — fit once the exit shortened to **`‹ Items`** at `compact`, which hands
back ~56px of its ~86 and leaves the segment ~207px of scroller against the ~213
it had with no toggle at all. **That was the best version, and it is still a
control nobody asked for on the one row that cannot afford one.**

**Where to start again**, in D73's own words: the **threshold rule the design
already worked out and discarded** (a subhead heads two or more rows) is the
cheapest version that exists — no control, no state, no schema, nothing on row 2
— and it is what the sort control had made unnecessary; or take the choice off
row 2 entirely into *Pantry settings*, at the cost of a column (D27). **Either
one wants an authored term order first**, and that is unsettled in the design:
the Filter tab's type row cannot hold both a drag handle and its count at 340px,
and a keyboard reorder path with an announcement per step is something nothing
in this app has.

**`typeSections` was deleted rather than left in `shared/` with only its tests
calling it** — D69 deleted `cumulativeByMonth` for exactly that reason, and it is
in the history if it is wanted back.

### Overview measures behaviour now, not just inventory (D72) — 2026-09-02

**Client and one query's return shape**: no schema change — fifteen tables,
fifteen queries, thirty-one mutations, `db.migrations` empty, `/api/status` the
only endpoint. The artifact is byte-for-byte what D71 left.

**Every figure on Overview counted something that *existed*.** 115 households
created and abandoned read identically to 115 used weekly. Three changes fix
that, and one of them makes the screen cheaper rather than dearer.

- ***Active* replaced *Live invites* in the fourth card.** Live invites was a
  small piece of state nobody acts on; *Active* is households touched inside
  `RECENT_DAYS`. **Dropping the card dropped a whole table scan** — `adminSummary`
  no longer reads `invites` at all.
- **`isActive` is not the complement of `isDormant`, deliberately.** 30 days
  against 90, and an **unmeasured** household is neither — so `active + dormant`
  is less than the total and the card says *touched in the last 30 days* rather
  than implying the remainder is idle. A mutation making it `! isDormant(…)`
  fails two assertions.
- ***Shopping trips*, and it counts trips rather than rows.** The record of a
  finished trip is in **`restocks`, not `trips`** — a put-away ends its trip and
  deletes it, so what survives is one row per item sharing a `tripId` and one
  `at`. Counting rows would answer *how many things were put away*, a bigger
  number that looks just as plausible on a chart; the mutation that does so
  fails two assertions. **`tripId || at` is the key**, because `tripId` defaults
  to `''` and every row of one put-away shares its stamp.
- **The trips bars erode, and the card says so.** A restock row dies with its
  item (D64), so a past month falls as items are removed — a floor on what
  happened, never a history. Stated on the card's own face, as the deletion
  entry's denormalised counts are.
- ***Sharing* is the only figure here that does not rise when one person makes
  five pantries.** Households, people and items all do. It measures D33 and D66
  — neither of which has ever been able to report whether it landed. `>= 2`, and
  the boundary is the whole function: `> 2` counts households of three or more
  and reads as a plausible, quieter number nothing contradicts.
- **`solo + shared === households` exactly**, because both are counted by walking
  `households` rather than the membership map — a household with no memberships
  is an orphan, and the map alone would drop it rather than count it solo. The
  same reason `sizes` is built that way (D69).
- **`PantrySizes` became `Distribution` with two callers.** *Sharing* is the same
  shape asking a different question, and drawing the bars twice is two places to
  keep a rounding, a track colour and an `aria-label` in step. `MonthBars`
  already made this trade for the two twelve-month series.

**Verified**: typecheck clean, **1006 assertions** (13 new), all three rules
proved by mutation, the artifact unchanged, and **60 class literals diffed
against the freshly built `zero.css`** by unescaping the sheet's own selectors —
0 missing, and proved to find a real class and refuse a bogus one. The extractor
**strips comments before reading source**, which is the trap that has cost this
project six rounds.

Driven against the real handler on the seeded local space: 115 households, **80
active**, **85 shared + 30 solo summing exactly to 115**, and twelve months of
trips reading `[13, 10, 6, 24, 13, 18, 15, 22, 19, 30, 44, 11]` after ~240
put-aways were seeded — the first time either chart has had shape locally.
`invites` is gone from the payload.

The rail now holds two cards where it held one, and *Sharing*'s label column
is 66px against a 172px track — both want a real screen, and the 390 layout is
inherited rather than designed, as the rest of Overview's is.

### The two things the app was throwing away (D71) — 2026-09-02

**The twelfth additive schema change since Phase 2**: `invites.addedAt`,
`.redeemedAt`, `.redeemedBy`, and **`deletions`, the fifteenth table**. Fifteen
queries and thirty-one mutations still — no handler was added, only writes
inside four that already existed. `db.migrations` empty, `/api/status` the only
endpoint.

**Working out what data the product questions need produced a much smaller
answer than expected.** `trips`, `claims`, `restocks` and `activity` all already
carry timestamps, so *trips completed per month* — the strongest available signal
that the app is **used** rather than merely filled — needs no new data, only a
chart. Counts, distributions, retention and active-household rates are all
derivable from rows that exist. **So the only thing that could not wait was what
the app was discarding**, and there were exactly two.

- **Invites recorded nothing about themselves.** No creation date, and redemption
  wrote a membership without touching the row that caused it — so the entire
  growth loop was unanswerable, and unanswerable **retroactively**, which is what
  made it urgent. The mint stamp is **the same clock reading the expiry comes
  from**, and the redemption is **first-only**: nothing revokes an invite on use,
  so one family link admits several people, and overwriting would turn *how long
  did this take to convert* into *when did the last person wander in*.
- **`deletions` is churn without a person in it.** No id, no name, no household,
  no account — a row says a thing of some kind ended, when, and how old it was,
  so an export of the table is a list of dates. That is what lets churn be
  counted without breaking D62's rule that the app never logs what somebody does
  to their own things. **`ageDays` is the half a bare count cannot answer** —
  *forty left this month* is a number, *half were under a week old* is a finding —
  and it is knowable only at the moment of deletion. **Append-only rather than a
  monthly counter**, which sidesteps the open concurrency question entirely.
- **`deleteHousehold` stopped carrying its own copy of the cascade.** It was
  byte-identical to `deleteHouseholdRows`', and identical is how two lists start.
  One funnel now, which is also the single place a household's deletion is
  recorded.
- **Item removals are knowingly not recorded** — every `removeItem` on a hot path
  for a signal pantry size already shows. D69's note that *Items added* can only
  rise stands, unresolved on purpose.

**Verified against the real handlers** on a throwaway `sf dev`: an invite minted
and redeemed **twice**, the row naming the first redeemer; a household deleted
from its own page and another through the console, recording `0` and `439` days;
an account deleted **both** self-serve and through the console, each writing its
own row plus one for the household that went with it. **993 assertions**, three
`ageDays` rules proved by mutation, the artifact read (fifteen tables,
`db.migrations: []`) and **`.docs/data-model.md` diffed against it with zero
gaps**.

**And it turned up a real bug in a path nothing had exercised — not fixed, see
below.**

#### `adminDeleteAccount` asked a question D68 says it must not — found 2026-09-02, fixed the same day

**`fateOf` is supposed to be the one classification both deletion paths read**,
and the console does not read it. `adminDeleteAccount` computes its own:

```ts
if (toRole(m.role) === 'owner' && owners.length === 1) needed.push(…)
```

**The `members <= 1` test is missing**, and D68 names that exact omission: *"tested
before the role, and that ordering is the rule: testing the role first makes a
sole-member household a question, which is a screen offering a choice with one
answer."*

So the console demands a decision about a household the target is **alone** in,
where *transfer* has nobody to name and *delete* is the only workable answer —
while `deleteMyAccount`, on the same household, files it as `goes` and destroys
it without asking. Measured: deleting a one-person account through the console
refuses with *"Decide what happens to Bob Solo first."*

**Fixed 2026-09-02**, in its own pass as that deferral asked for. No schema
change and no new handler — fifteen tables, fifteen queries, thirty-two
mutations, `db.migrations: []`, the artifact byte-identical to what D76 left.

**It was in four places, not one**, because the flag the console was reading is
not the question the deletion asks:

- **`adminDeleteAccount` builds a `plan` from `fateOf`**, exactly as
  `deleteMyAccount` does, and its `needed` set is the `decide` entries of that
  plan. One description of *which households are a question*.
- **Its write phase destroys a `goes` household** rather than deleting the last
  membership and leaving it standing. That was the other half of the deferral
  and the reason the two could not be separated: removing the last membership
  manufactures a pantry nobody can reach, which is the state D68 exists to
  prevent. It is logged as `household.delete`, so a household destroyed this way
  looks in the audit log exactly like one destroyed from its own page.
- **`AdminPersonHousehold.soleOwner` became `fate: HouseholdFate`**, computed by
  `fateOf` in `adminAccount`. `candidates` now rides `fate === 'decide'`, which
  is also when it can never be empty.
- **The console's delete dialog has three groups**, the app's pre-flight's own
  split. It filtered on `soleOwner` and put everything else under a tail line
  reading *you simply leave them. Nothing to decide* — **false for a household
  nobody else is in**, which is destroyed. So the console both asked about
  households it should not have *and* then described the answer wrongly.

**`soleOwnerOf` is deliberately unchanged.** It counts households an account is
the only *owner* of, which is true of a solo household and is what the People
list's *Sole owner* chip and filter say. What was wrong was the account page's
note **using** it to promise a screen that asks — that now counts the `decide`
households, which is the claim it was making all along.

**Proved by mutation against the real handler**: putting the old role-first
classification back makes the console refuse with *"Decide what happens to Bob
Solo first."*, and the fixed one refuses with *"Decide what happens to Bob
Shared first."* — the household that really is a question. Then the write
measured: one decision for the shared household, and afterwards `Bob Solo` is
**gone rather than orphaned**, no household is left at zero members, Carol owns
the transferred one, Bob is gone from People, and the log carries
`household.delete`, `household.transfer` and `account.delete`.

**And the two paths were run against identical shapes and agreed** — the same
two-household setup deleted through the console and through `deleteMyAccount`
left the same nothing behind. `adminRepairCounts` reported zero rollup drift
after all of it.

### Stages 0 and 1 of the scale work are built (D70) — 2026-09-02

**The eleventh additive schema change since Phase 2**, and the first that is
about the shape of the app rather than a feature: `households.changedAt` and
`households.itemCount`, plus **four indexes on a table that declared none**.
Counts unmoved — fourteen tables, fifteen queries, thirty-one mutations.

- **All 89 `collect()` calls are `collectAll()`.** It paginates until done, and
  **below the cap it is one call with `isDone` already true** — identical cost to
  what it replaced, which is why it went everywhere rather than only where the
  console reads. It **takes a thunk, not a builder** (a builder resets its state
  once read, so reusing one across pages would look like an early stop) and it
  **cannot throw** (a query that throws never emits, so the client would sit on a
  permanent loading state); a cursor that fails to advance ends the walk.
- **`pantry` was affected too, and worse than the console.** It reads a
  household's items and both join tables the same way, and **the join tables
  cross 1,000 first** — an item may name several types and several sources, so
  store chips would have started vanishing from cards at roughly 600–700 items
  while the item list still looked complete.
- **`shared/counts.ts` pins the storage format**: twelve digits, zero-padded,
  **permanent**. Text sorts lexicographically, so an unpadded count column stores
  the right number, reads back the right number, and orders a *biggest pantries*
  list behind the household holding nine. `readCount` treats `''` **and `null`**
  as *not counted* — `joinedAtOf`'s rule, one file over.
- **Two of the four indexes shipped inert**, because nothing maintained their
  columns yet, and that was the decision. **An index costs what the table holds
  when you add it**: free then, a rewrite at a million. **All four are live as of
  D76**, one stage later the same day. `''` in either column means **not
  counted, never zero** — read it as zero and every household reports empty; read
  an empty `changedAt` as never-active and every household reports dormant.
- **`changedAt` reverses D44 on purpose.** That decision refused it because
  *"nothing orders households by recency"*; the console does, and computes it by
  scanning **four whole tables per load**. One maintained column deletes
  `lastActiveByHousehold`.

**Verified against the real handlers** on a throwaway `sf dev` with a fresh
database: a household seeded to **1,400 items** where `pantry` used to stop at
1,000 now returns all 1,400 **with every item past 1,000 still carrying its type
chip** — the join-table truncation, reproduced and then gone. `adminSummary`
reports 1,400 rather than 1,000, the pantry-size band lands on `200+`, and
`adminHouseholds` names the right biggest pantry. **`paginate()` honours
`.order('desc')`** — checked because `adminActivity` depends on it, and the audit
log still reads newest-first. Then the whole flow re-run on the new schema from
an empty database: create, add, and all four console and account queries correct.
986 assertions, typecheck clean, one throwaway endpoint added and removed.

**The artifact is read and correct** — fourteen tables, fifteen queries,
thirty-one mutations, `db.migrations: []`, `/api/status` the only endpoint,
`memberships.joinedAt` and `households.changedAt` / `.itemCount` all
`string` / `default: ""`, all four new indexes present, every other table's
indexes intact, and **`.docs/data-model.md` diffed against it with zero gaps**
across tables, columns, indexes, queries and mutations.

**It took two goes, and the first is the reason the check exists.** The four
indexes were written correctly, typechecked, and ran — and the artifact reported
`households` with **`indexes: []`**. The compiler's schema regex requires the
`.index(...)` chain to follow `})` separated only by whitespace, and there was a
comment in the gap. Moving that comment *inside* the braces then hit the other
end of the same regex — it quoted `})`, which is exactly the pair the non-greedy
body match stops at, so the **column list** truncated instead. **A comment
warning about the first bug caused the second.** The explanation now sits above
the table declaration, where neither can happen. See the verification section's
D27 note, which is widened to cover both.

**Stage 2 shipped the same day — see below.** It did *not* wait on the
concurrency question, and the reason is that its columns are written only by the
people inside one household. **Stage 3 is next and is the one still blocked**:
band counters and month buckets are single space-wide rows that every household
increments.

### Stage 2 — the rollup is maintained, and `''` is not a zero (D76) — 2026-09-02

**The thirteenth additive schema change since Phase 2**: `households.memberCount`
and `.ownerCount`, joining the `changedAt` and `itemCount` D70 declared and left
inert. Fifteen tables, fifteen queries, **thirty-two** mutations — the new one is
`adminRepairCounts` — `db.migrations` empty, `/api/status` still the only
endpoint, and all four `households` indexes intact.

**`lastActiveByHousehold` is deleted.** It read `items`, `locations`, `types` and
`stores` **whole** on every load of two console screens, and at eighteen seeded
terms per household those three term tables were the largest single block of rows
either query touched.

| query | before | after |
|---|---|---|
| `adminSummary` | 7 table scans | **4** — households, memberships, items, restocks |
| `adminHouseholds` | 6 table scans | **2** — households, memberships |

**The three left in `adminSummary` each have a named reason and none is an
oversight.** `memberships` answers *People* and *N new people*, which count
**distinct accounts across the space** — a per-household column cannot answer a
question whose unit is not a household. `items` survives only for `newItems`,
which needs a per-row stamp inside a window; the total is a column sum now.
`restocks` is the trips series. All three are stages 3 and 4, both counters, both
gated on the concurrency question. **`adminHouseholds` still walks `households`
itself** — driving that off `by_name` / `by_items` / `by_changed` with `paginate`
is its own piece of work, because search becomes a prefix range and each chip
becomes its own range read.

- **`bumpHousehold` is the only writer of all four columns**, and it has to stay
  that way: there is no aggregate to check a counter against, so a wrong one is
  wrong forever with nothing to detect it, and thirty hand-written increments
  would disagree exactly once.
- **`''` is *not counted*, and it is never zero.** `readCount` collapses the two
  because its callers are rendering a number; `isCounted` is the predicate a
  *writer* needs, because bumping an uncounted column by one stores `1` for a
  household holding forty. **A reader needs it for a sharper reason**: an
  unrepaired household read as zero is empty, ownerless *and* dormant at once —
  three plausible wrong numbers on the one screen that flags exactly those
  states. Overview leaves them out of every tally and reports `uncounted`, with a
  sentence in the *Needs attention* footer when it is not zero. **The household
  list is deliberately more forgiving** — a row renders the count it has, because
  that is one line somebody is looking straight at rather than a published
  figure — but `noOwner` there is still read from the memberships in hand,
  because it is the flag with a destructive fix attached.
- **A household is counted at birth**, in `createHousehold`'s own insert: it holds
  no items and exactly one member, who is its owner. That is also what keeps the
  repair a bounded job forever — the set needing it never grows.
- **Everything older self-heals on first write.** `bumpHousehold` recounts that
  household from its rows rather than assuming zero — six indexed reads, once,
  bounded by one household — so the backfill is something the app does to itself
  as people use it, and `adminRepairCounts` is for drift and for households nobody
  has touched.
- **Call `bumpHousehold` after the write it accounts for, never before**, and the
  recount drops the delta rather than applying it. **Built the other way first**:
  the recount added the delta to a truth that already contained it, and a
  five-item household reported six. Caught before it shipped and then proved by
  mutation against the real handler.
- **The repair never moves `changedAt` backwards, and that was found by
  measurement rather than by reading.** A run of membership changes left all three
  counts correct and the stamp the only field the repair wanted to rewrite —
  backwards, because `activityInHousehold` can only see rows that still exist and
  cannot see a rename, a role change, somebody joining or leaving, or **an item
  that has been deleted**. It takes the later of stored and found now.
- **`shouldTouch` is what keeps the stepper cheap.** `adjustQty` is the hottest
  write and D44 refuses to exempt it from stamping, so the household's stamp moves
  too — but only when the stored one is a minute stale. `RECENT_DAYS` is 30 and
  `DORMANT_DAYS` is 90, so a minute cannot move a household across either line,
  and ten presses on one card are one write rather than ten.
- **`updateHousehold` touches, which widens what *last active* means.** The scan
  this replaced read four tables and none was `households`, so a household could
  be renamed weekly and still report as dormant. That row is already being
  written; the stamp rides along.
- **`adminRepairCounts` is `requireAdmin`, not `requireAdminWrite`.** It destroys
  nothing, and holding it would mean the console's numbers could not be made true
  until the hold came off — backwards, since reading correct numbers is the whole
  of what the hold leaves you able to do. **One page per call with the cursor
  handed back**; `remaining` is deliberately not returned, because nothing can
  know how many rows are left without walking them.

**Verified**: typecheck clean, **1037 assertions** (15 new), and the two new
shared rules **proved by mutation** — treating `''` as counted fails 2, making
`shouldTouch` always write fails 2, and letting it ignore a future stamp fails 1.
The artifact is fifteen tables / fifteen queries / thirty-two mutations /
`db.migrations: []` with `/api/status` the only endpoint and all four indexes
present, and **`.docs/data-model.md` was diffed against it with zero gaps** across
tables, columns, queries and mutations. **137 class literals** in the one touched
component diffed against the freshly built `zero.css` by unescaping the sheet's
own selectors — 0 missing, and proved to find `text-[12.5px]` and refuse
`text-[12.6px]`.

The **real handlers** were driven over `POST /__spacefast/zero/run` on a
throwaway in-memory `sf dev --port 4199`, as three named dev guests, with **one
throwaway endpoint added and removed** to reproduce the uncounted state — the
artifact's endpoint list printed to prove it went. A household counted at birth;
three items counted; **the columns blanked to the state every published row is
in**, and Overview reporting `uncounted: 1` with `empty`, `noOwner`, `dormant`
and `active` all `0` and every band empty rather than misfiling it; a fourth item
then recounting to **4 rather than 1**; the ordering bug mutated back in and
measured reporting **6 for a 5-item household**; the repair correcting that drift
6 → 5 and reporting `repaired: 0` on a second pass; invites redeemed as editor and
as owner; a demotion, a promotion, a hand-over, a removal and a leave, with the
last-owner guard still refusing; `removeItem` decrementing; a seven-row `addItems`
landing as 7; a household deleted and a whole account deleted; **five households
blanked and backfilled by walking the cursor in three pages of two**, second pass
`repaired: 0`; and an anonymous caller and a non-admin dev guest both refused.
**After roughly thirty mutations the repair reported zero drift**, which is the
single strongest check available here.

#### The sentence shipped without its control, and that is the lesson

**Found immediately by using it.** A local database of **115 households**, all
predating the columns, so Overview correctly dropped *Active*, *Needs attention*
and *Pantry sizes* — and said *115 households are not counted yet. Run the
repair.* with **nothing to press**. `adminRepairCounts` was reachable only by a
`curl`. Reported as *I don't know what the repair is*, which is the exact
sentence a handler name leaking into user-facing copy produces.

- **The button is in the footer beside the sentence**, absent at zero (D30). Not
  a confirm — the repair recomputes columns from rows that are already the truth
  and is idempotent, so a dialog would be asking permission to make the screen
  correct. No toast: the figures above are invalidated and simply appear.
- **The copy lost the word *repair*.** The sentence says *not counted yet* and
  the button says **Count them**, which is the act in the sentence's own
  vocabulary rather than the mutation's name.
- **`useRepairCounts` owns the cursor loop**, because the handler is one page by
  design. `RUNAWAY_PAGES` and a cursor-not-advancing guard are the two backstops,
  which is `collectAll`'s arrangement on the read side.
- **The hold does not cover it**, which is what makes the button work at all
  today — `requireAdmin` rather than `requireAdminWrite`, decided when the
  mutation was written and paying off here.

**Timed at the reported size**: 115 households seeded with 15 types, 3 sources, a
location and up to 29 items each, every rollup column blank — Overview reproduced
the exact reported state (`uncounted: 115`, every other figure `0`, every band
empty), and the walk cleared it in **three pages and 38ms**. One throwaway
seeding endpoint added and removed, with the artifact's endpoint list printed to
prove it went.

**The general rule: a sentence that names a fix is a promise the same screen has
to keep.** It is worse than saying nothing — it tells somebody their console is
wrong and leaves them without the thing that would mend it. **And a handler's
name is not a word a person knows.**

**The published space needs it pressed once
after the next publish** — its one household predates the columns.

### The target is 1,000,000+ households, and that is a design constraint now — 2026-09-02

Stated on 2026-09-02: tens of thousands of households, **possibly a million**.
Almost nothing in the app proper is wrong at that scale and almost everything in
the console is. The whole analysis is
[`.claude/docs/design/scale.md`](docs/design/scale.md) — **read it before
touching a console query or adding a column**. The three things it turns on:

- **A count is a scan, a scan stops at 1,000, and nothing says so.** See the
  entry below.
- **There is no numeric type, so a maintained count is a string** — and any
  count the console *sorts* by has to be **zero-padded to a fixed width**, which
  is a storage format and therefore permanent (D27).
- **`households` declares no index at all.** Every read walks `by_creation`.
  That is the single largest schema gap and **the one item with a deadline**: an
  index is additive and free today and an outage at a million rows.

**And the load-bearing unknown is concurrency.** Every number in that design is
a counter, and a counter here is a read-modify-write on a string. `ctx.transaction`
is documented only as *commit both or neither* — nothing says it takes a row
lock. Twenty concurrent increments against `sf dev` lost nothing, and **that
measurement is worthless**: the same run took 1.05s for 20 × 50ms spins, so the
dev runtime serialised them and there was never a race. **This is the dev-guest
trap exactly** — local evidence that looks like an answer. It has to be asked of
Spacefast, not measured here.

### `memberships` carries its own join stamp (D44, amended) — 2026-09-02

**The tenth additive schema change since Phase 2**: `memberships.joinedAt`,
ISO 8601 UTC defaulting to `''`. Counts are unmoved — **fourteen tables, fifteen
queries, thirty-one mutations** — because this is a column on a table that
already existed, written by two mutations that already ran.

**D44's own condition came true.** That decision left `memberships` unstamped
*"unless any of them ever grows a chronological view"*, and the console grew
four: *Recently joined* is one of `adminPeople`'s sorts, and the date prints on
an account page, on every member row of a household, and in D68's account
export. All four were sorting on the platform's `createdAt`, which is the exact
thing D44 exists to stop.

- **Two write sites, and they are the only two**: `createHousehold` stamps the
  creator with **the same `now` the household took**, so a creator's join and
  their pantry's birth are one instant rather than two a millisecond apart;
  `redeemInvite` stamps the joiner. `redeemInvite` gained a `now` of its own and
  its expiry check reads it, so the refusal and the stamp cannot disagree.
- **`joinedAtOf()` in `shared/stamp.ts` is the one reader**, falling back to
  `createdAt` — **permanently, not transitionally**: every membership on the
  published space predates the column and nothing backfills. For a row nothing
  has rewritten the two are the same instant, which is why the fallback costs
  nothing.
- **`||` and not `??`, and that is the load-bearing character.** A column added
  after rows exist reads back **`null`**, not the declared `''`, and the row type
  says `string` either way — the finding that left `useAvatarSync` inert for as
  long as `memberships.picture` has existed. `npm test` pins the null case *and*
  the ordering it produces, because a raw read sorts a `null` **above** a real
  stamp and hands back a list that is plausible and wrong.
- **The account export gained its join date**, which `shared/exportData.ts` had
  been carrying a comment about since D68 — *"an omission rather than a choice…
  the first thing to do if this file ever has to be complete."* It is
  `member_of[].joined` now, and `AccountHousehold` carries `joinedAt` for it.
- **`memberships` still has no `changedAt`**, deliberately. A role change, a name
  write-through and an avatar sync all rewrite the row and nothing orders by it —
  the same test that gated `joinedAt` until today.

**Verified**: typecheck clean, **973 assertions** (4 new), and the resolver
**proved by mutation** — dropping the fallback fails 3, one of them the ordering
rather than the resolver, which is the assertion that would catch it in
production. The **real handlers** were driven over `POST /__spacefast/zero/run`
on a throwaway `sf dev --port 4199` as two named dev guests: both insert paths
stamping, and a row blanked back to `''` — the state every published row is in —
resolving to its `createdAt` through `adminHousehold`, `adminPeople` and
`account` alike. Three throwaway endpoints were added and removed.

**The artifact was read on 2026-09-02 and the column is there** —
`memberships.joinedAt`, `string`, `default: ""`, `nullable: false`, with
`db.migrations` still empty. The dry run had been refusing with
`credential_expired` and no longer does.

### Overview is not slow. It is capped, and above 1,000 rows it is wrong — 2026-09-02

**Measured rather than reasoned about**, and it inverts the question. A
throwaway `sf dev` was seeded to ~3,200 items across 54 households and
`adminSummary` timed against `adminAccess` as a baseline: **~3.5ms against
~0.9ms, and it does not move as the data grows.** It cannot, and the reason is
the finding.

**`collect()` returns at most 1,000 rows, silently.** Not a table limit, not a
write limit, and not specific to an index — **any single result set**, with or
without a range predicate. Proved by the sum of 54 scoped reads (3,045)
exceeding any one read (1,000), and confirmed in the CLI's own bundle:
`MAX_LOCAL_QUERY_ROWS = 1e3`, applied as `results.slice(0, maxRows)` **whether
or not a `limit()` was asked for**. Written up in `.claude/docs/spacefast.md`.

**So the scaling note in `adminSummary`'s own docblock is wrong in the direction
that matters.** It says the scan *"stops being fine somewhere in the low
thousands"* and that the fix is a denormalised counts row. It never gets slow —
it silently stops counting at 1,000 per table:

| what breaks | how |
|---|---|
| *Items tracked*, *Households*, *People* | cap out at 1,000 each |
| *Pantry sizes* (D69) | households whose items sort late read as **empty** — the adoption chart reporting the opposite of the truth |
| *Needs attention* → holding nothing | inflated by the same rows |
| `dormant` | `lastActiveByHousehold` reads truncated items *and* three truncated term tables |
| `adminHouseholds` | `total`, `matching`, every row's `items`, and the **items sort** |

**Demonstrated, not inferred**: with a 1,200-item household in the space, the
console named a **40-item** household as the biggest pantry in it.

**And it is not only the console.** `pantry` reads a household's items and both
join tables with the same scoped `collect()`, so **the join tables truncate
first** — an item may name several types and several sources, so `itemStores`
reaches 1,000 well before `items` does, and store chips would start vanishing
from cards at roughly 600–700 items. D67 caps a bulk *batch* at 200 and nothing
caps a pantry's total.

**`paginate()` is the way out and it costs nothing.** `numItems` is clamped to
the same 1,000 but the cursor walks: measured at **3,245 rows in 4 pages, 13ms**
flat, and **1,200 in 2 pages** on a scoped range where `collect()` returned
1,000. For any result under the cap it is one call with `isDone` already true —
identical to `collect()` — so a `collectAll()` helper is a strict improvement at
every call site rather than a trade.

**What is not known, and cannot be settled from here.** Every constant is named
`MAX_LOCAL_*`, which reads as a dev-harness limit. **That is a guess**, and it is
the same shape of guess that made `isAdminUser`'s dev-guest branch look safe
before it leaked the console to anonymous callers in v15. An admin query answers
`denied` to an anonymous caller and the live space holds 1,000 of nothing, so
there is no probe that answers it — it wants a documented answer from the
platform. **The fix is correct either way**: if the hosted runtime has no cap, a
paginate loop still returns everything in one page.

**Nothing has been changed for this yet.** The sweep is `collect()` →
`collectAll()` across the console's whole-table reads and `pantry`'s scoped ones,
and it is a decision worth taking deliberately rather than on the way past.

### Autofill — the name field and search (D63) — 2026-08-31

`.claude/docs/design/autofill.md`, drawn on
`.claude/docs/design/larderlognameautofill.html` — twelve boards on four pages,
both themes. **Client only apart from two new `shared/` modules**: no schema
change, no handler moved. Eleven tables, thirteen queries, twenty-five
mutations, `db.migrations` still empty — the artifact is byte-for-byte the shape
the console left it.

**Two suggestion menus, and they are one component.** `SuggestMenu.tsx` is the
sort menu's construction at the sort menu's tokens — its **third** user after
the unit menu — and everything that differs between the two fields is which
groups they build.

- **Nothing in either menu is ever *selected*, and that is what frees the
  fill.** The sort and unit menus mark the current row with a crimson check
  because with a fill doing both jobs a hovered row looks chosen. A suggestion
  has no current value, so `surface-alt` means highlight outright — **one
  treatment for the pointer and the keyboard cursor alike**, driven from an
  index rather than from `:hover`, so a pointer on row three and an arrow key on
  row one cannot paint the menu twice. **Sunk works here where D45 found it
  fails on the ground**: a menu is a card, so sunk is a real step down from it.
- **440 in both menus.** On the sheet that is the name field's own width. In the
  top bar the field is a banner — about 1221px at a 1372 column — so search
  takes 440 too and aligns left, which lands it on exactly one column of the
  grid.
- **One row shape, three kinds of row — all 38px, 48 at 390.** The item row was
  56 and stacked, the name over `3 on hand · Pantry`, while catalog and term
  rows were single lines. **Two constructions in one 440px menu read as two
  different kinds of control**, and the stacked one spent a whole line on a
  sentence rather than a fact: *on hand* is what the number in that slot has
  always meant. The item row **is** the term row now, with a status dot and a
  size in it — mark · name · right-aligned **`Location · N`**, against the term
  row's `Store · 6`. The size still rides with the name (the run list's rule,
  and the only place a size-only match can show why the row is there). **The
  boards and the design doc's table both draw the two-line form.**
- **The name field answers about names and nothing else.** Two groups —
  `IN YOUR PANTRY`, then `COMMON ITEMS`. A `TERMS` group was drawn here and cut
  on 31 Aug: *Baking* the type and *Baking Soda* the item collided in a field
  labelled `ITEM`. **The term row survives as a search component.**
- **Search matches names, sizes and term names. Never notes.** Typing `pint`
  finds your pints; `co` does **not** return Costco's six items, it returns the
  things *called* co-something and offers **Costco** as a term beside them.
- **A match is a prefix of any word**, and **the grid now obeys the same rule**.
  It was `name.toLowerCase().includes()`, so `eef` found Ground Beef and `pint`
  found nothing at all. The menu is a shortcut into results already on screen
  underneath it, and a menu listing a row the grid has ruled out is a menu
  nobody can trust. **`matchAt` returns an offset rather than a boolean**,
  because the matched characters going to 700 is the *whole* explanation of a
  rule that is never written on screen.
- **Two characters, never on focus. Six rows, and it never scrolls.** The unit
  menu scrolls because fifteen units are a fixed set you are choosing from; this
  is a guess you improve by typing another letter. **Nothing matches, so nothing
  opens** — there is no *No matches* row and no *see all* row.
- **Editing fills the name and nothing else; adding fills everything it can.**
  An edit sheet is open on a whole item somebody already described, and a menu
  that overwrote five fields because the name prefix-matched another row would
  be a silent write to fix a typo in one. **The menu is the same on both
  sheets; only what a press does changes.**
- **Adding from a pantry row carries the name, the size and the three chips —
  never a count.** *Low at* is a count rather than a property: copying it would
  carry Ground Beef's 15 onto a jar of anything. That settles the question the
  sheet's *Household default.* hint left open. **The watch-out is on the
  record**: picking Ground Beef when you already have Ground Beef makes the
  duplicate one tap, and nothing catches it — exploration **C** is the drawn
  answer if it bites.
- **Adding from a catalog row carries the name, the type and the shelf.** The
  catalog is `{ name, type, place }` now rather than bare strings: *Half and
  Half* is Dairy and it goes in the refrigerator, in every household there has
  ever been. **Never a source** — where you buy a thing is one household's own
  vocabulary (D40). **Both are matched by name, exactly**, against terms that
  already exist, and **a catalog pick never creates one**: a household that
  renamed *Dairy* gets nothing filled rather than something wrong.
- **Nothing in either menu leaves the screen you are on, and there is no
  chevron.** An item row in search **fills the field with that item's name**,
  which narrows the grid to it — a shortcut through typing, not a way into the
  item. It opened that item's Edit sheet for one round, which put a form over
  the pantry from the control whose whole job is finding things in it. **That
  also removed the one place a viewer had to be gated**: filling a search field
  is a read.
- **A term row applies the filter and clears the query.** The two are
  alternative ways of narrowing one grid, and a stale query on a fresh filter
  narrows it twice — usually to nothing. Clearing empties the menu, which is
  what closes it. **This retires *terms are a set you work through***, which
  was the reason a term row used to stay open.
- **The search group is `FILTERS`, not `TERMS`.** *Terms* is the app's own word
  everywhere a term is a thing you look **at**; this menu is the one place it is
  a thing you are about to **do**, and the row does a drawer chip's job. **A
  term already applied is dropped rather than marked**, which keeps *nothing is
  ever selected* true.
- **The search field finally has its `×`.** D45 has said since it was written
  that *search has its own `×`*, and it did not. **Escape closes the menu and
  keeps the query; a second Escape clears the field** — the two steps that `×`
  collapses into one. **`Clear filters` still does not touch search**, and now
  doubly right: the menu's term rows put chips in that bar.
- **The field is a `combobox` over a `listbox`**, the shape the unit trigger
  already takes two controls away on the same sheet, with `aria-activedescendant`
  and a politely announced count that changes **only when the number moves**.
  **Nothing is highlighted until an arrow key says so** — a pre-selected first
  row makes Enter commit a guess nobody made, which is D48 one control over.
- **`shared/suggest.ts` and `shared/catalog.ts`** are the two new modules, in
  `shared/` for the reason `filter.ts` is: a substring where a word prefix
  belongs still compiles, still runs, and hands back a plausible list nobody can
  explain. **The catalog is a hand-written US-centric list with no source and no
  locale, and it does not learn** — all four are open questions in the design
  doc rather than gaps here. It is **281 rows**, and growing it has a visible
  cost the design did not have: the six-row cap binds harder, so `be` now
  answers Beef Broth · Beef Roast · Beets where the boards drew Beets · Bell
  Peppers · Berries.
- **A bean is two rows, and that is the one pair in the list.** Thirteen common
  US-market beans — black, black-eyed, butter, cannellini, chickpea, fava,
  garbanzo, great northern, kidney, lima, navy, pinto, red — each as the can
  (`Canned Goods`, the cupboard) and as `<Bean>, Dry` (`Dry Goods`, the bulk
  shelf). They run out independently and their sizes are not comparable, so one
  row could not serve both. **The suffix is not decoration**: the comma is a
  word separator to `matchAt`, so typing `dry` lists the bulk shelf and typing
  `kidney` finds both forms. `npm test` pins the pairing in both directions —
  half a pair is invisible when wrong, since the menu still opens and still
  answers.
- **`Garbanzo Beans` and `Chickpeas` are both here, and that is a knowing
  duplicate.** They are one bean under the two names US cans actually print, and
  somebody typing either has to find something — but picking one and picking the
  other make two different items, which is the *Berries* / *berries* hazard the
  design doc already records. A real fix needs the catalog to carry aliases
  resolving to one entry, which is a shape change rather than a list edit.
- **`Dry Goods` is the fifteenth seeded type** (D50, amended) — the bulk shelf,
  which the catalog needed and `Grains` was standing in for. It takes
  `color-11`, so **the reserved headroom is down from two unspent tokens to
  one**; a sixteenth would take it to nothing. **Nothing backfills**, so an
  existing household adds it once by hand — Justin's local *The Tadlock
  Household* already has it, at the same `color-11` `proposeColor()` would have
  handed out. `?demo`'s Long-Grain White Rice carries it as a second type, so
  the chip is not dead under `?demo`.

**Verified without a browser**: typecheck clean, **642 assertions** (73 new,
covering the word-prefix rule and the substring it refuses, the separators, the
empty query that has to match *everything* for the grid and *nothing* for the
highlight, the two-character floor, the caps, the catalog's dedupe against the
pantry, what a pick carries and what it must not, a size-only match and where it
does and does not bold, the applied-term exclusion keyed by `kind:id`, and —
after the 31 Aug revisions — that every catalog row names a type and a shelf a
seeded household really has, that the list is A–Z, that a renamed term fills
nothing rather than the wrong thing, and that every bean has both of its rows),
the
dry-run artifact unchanged (eleven tables, thirteen queries, twenty-five
mutations, `db.migrations: []`, `/api/status` the only endpoint), and **all 124
class literals across the three touched files** diffed against the freshly built
`.spacefast/zero/public/zero.css` by unescaping the sheet's own selectors —
printed, never hand-written, proved to discriminate against a bogus class — with
`md:w-[440px]`, `md:h-[38px]`, `focus-within:border-line-strong` and
`motion-reduce:transition-none` each confirmed by **byte offset** to land after
the base it overrides. A throwaway `sf dev --port 4199` compiled, served
`GET /` 200 and `/api/status` `ok`, and its `/client.js` carries every new
string.

**One trap the check itself walked into, and it is the fifth of its kind.** The
selector printer's negated character class did not exclude the backslash, so
`.md\:flex` unescaped to `md\` and **every variant in the app looked missing** —
seventeen false positives, including four that were provably in the sheet. A
check that reports a missing class is worth nothing until it has been shown to
find one that is really there *and* one that is really absent.

Every interesting part is press-time and keyboard-time: the arrows, the two
Escapes, the pick, the chevron's navigation, and the term row that stays open.
**To see it locally**: any two characters in the item name field, or in the
top bar's search.

### Restock — the trip that ends (D64) — 2026-08-31

`.claude/docs/design/restock.md`, drawn on
`.claude/docs/design/larderlogrestockmockup.html` — six boards, one page, light
theme, desktop. **One schema change**: `restocks`, the **twelfth** table, which
applies on the next publish with no flag as `profiles` and `activity` did.
Thirteen queries and **twenty-six** mutations; `/api/status` is still the only
endpoint and `db.migrations` is empty.

**A check is a claim, not a write.** Ticking a row says *I am getting this*; the
count is written once, at the put-away. The reason it went undesigned for so
long is real — **the app cannot know how many you bought**, so every design in
which a tick writes a count is guessing — and the answer is to stop guessing and
ask on a screen you are looking at while standing in front of the shelf.

- **`shared/restock.ts`** owns both rules. `restockPrefill` is
  `max(low at + 1, on hand + 1)` — the smallest thing that is certainly true.
  **`on hand + 1` is not the redundant half**: an item already above its
  threshold would otherwise prefill to a step *down* from what is on the shelf,
  and `npm test` pins that case. `putAwayRows` walks the bands rather than
  sorting again, so the sheet is the screen you just ticked read back to you.
- **One row per item, never per list row.** Something you buy at either of two
  shops is one thing to put away, and the first band and group to claim it names
  it — bands run Buy · Harvest · Make, groups run A–Z, so a row is filed under
  the first place you would have found it. The case that matters is *across
  bands*: bought in February and picked in July gets one row, on Buy.
- **`restockItems` is one mutation and that is the point.** A put-away is
  several writes that mean one thing, from a phone in a car park, and half of
  them landing is the state it exists to prevent. **Every entry is resolved
  before anything is written**, capped at `RESTOCK_MAX` (200). It is also the
  only place in the app where a spinner is the honest answer.
- **The stepper asks *how many do you have now***, the question every other
  stepper asks — **which makes this the only self-correcting moment in the
  product.** Counts drift and nobody audits a shelf; the flow that ends the trip
  is the flow that fixes the drift. It is also why the log may only ever promise
  **intervals**: `toQty − fromQty` is sometimes a purchase and sometimes a fix
  and nothing can tell them apart.
- **`Stepper.tsx` is extracted, not drawn twice** — `ItemSheet`'s own control,
  now shared at two sizes. The put-away's is 132 × 44 against the sheet's
  full-width 56, and the reason generalises: on Add / Edit the two steppers are
  the heroes of their section, while here every row has a name to read and the
  stepper is a peer of its row.
- **The trip bar keeps one shape at every count.** Three controls now — *Hide N
  checked* and *Clear checks* group left, *Put N away* on the right — and
  **the separation is carried by the fill, not by a divider**: two ghosts and a
  primary is already three weights. **Two ink controls on one screen and it
  earns it**: a bar below the grid is its own surface the way a sheet's footer
  is, and it is the terminal action of the whole mode.
- **At 390 the two ghosts drop to glyph-only 44px squares.** That is what the
  glyphs are for — not decoration on a desktop, but the thing that survives at
  the width where this bar matters most.
- **The 70px completion variant is deleted.** It was green for something still
  pending and its second line described the button now standing beside it. The
  disc moved to the screen *after* the put-away — *Everything's put away.* — and
  a finished trip **empties the list by arithmetic**, so nothing removes
  anything. **No toast**, for the reason four other triggers are already settled
  on: rows leaving the list you are looking at is the most visible confirmation
  in the app.
- **That screen is held open deliberately.** A put-away drops the household's
  total to zero in the same breath as the write lands, and the mode is normally
  alive only while there is something to get — so `justPutAway` holds it for
  exactly one screen, and only while the list is *really* empty. A trip that put
  away half the list never draws the card.
- **`Clear checks` moved to the left group** — the right half is where the write
  goes, and *Hide* and *Clear* are one subject. It already armed a toast, which
  is now load-bearing rather than polite: a check used to be free, and it is a
  claim now.
- **Switching households no longer clears anything** (replacing D41's rule 3).
  Each household keeps its own trip, expiring on its own clock, and
  `useTripChecks`'s reader **accepts D41's single-record shape** so upgrading
  does not throw away a trip halfway round a shop.
- **The trip has an id**, minted at the first tick and written onto every
  restock row. Opaque, and deliberately not a row id — there is no trip table
  yet. It is the id there will be, so rows written before that exists can still
  be grouped afterwards.
- **`restocks` carries no `userId`, and that is the privacy line.** A name rides
  the trip, which dies with the account that owns it; nothing in the larder ever
  records who touched a thing, so deleting an account stays a clean operation.
  `kind` is copied rather than joined and goes through **`isSourceKind`, never
  `toSourceKind`** — `''` is a real answer (a storeless row) and `toSourceKind`
  resolves everything it does not recognise to `shop`.
- **A restock row dies with its item**, which is the opposite of the audit log's
  choice and for a stated reason: the log denormalises so it can outlive its
  subject, and there is nothing to say about how often you restock a row that
  does not exist. `restocks` is in **both** household cascades and in
  `removeItem`.

- **The bar fades in over 160ms and does not slide.** It appears under a grid
  that is already reflowing to make room for it, and two things moving at once
  reads as the page settling rather than as a control arriving. A flag flipped
  in an effect rather than a CSS animation, because there is no stylesheet to
  hold `@keyframes` — an effect runs after the first paint, so `opacity-0` is
  what lands and the flip is what transitions. **The fade survives
  `prefers-reduced-motion`**, which is the applied-filter chip's own rule: that
  setting asks for no *movement*, and there is none here to drop.
- **The put-away sheet has no motion, and that is the spec satisfied rather
  than skipped.** *It takes the Add / Edit sheet's motion unchanged* — and
  `ItemSheet` has never had any. Nothing was invented for the copy that the
  original does not do.
- **Two announcements through the trip's own live region**, separate from the
  filters' — they answer different acts and a shared region would have each
  overwrite the other. Committing says `3 counts updated. 4 left to get.`;
  clearing says `3 checks cleared.`, because the toast appears in a corner with
  no focus moved to it and is never read.
- **What is left is counted, not read off `toBuyTotal`.** That number comes from
  a live query which has not re-emitted a line after the write, so reading it
  would announce the total from *before* the trip — the one number the sentence
  must not say. Every row that now clears its threshold leaves the list and
  `putAway` holds one row per item, so subtracting is exact.

**Deferred by request: shared claims** — *in Sarah's cart*, the half that makes
a trip the household's and stops the double-buy. Until it lands, two people at
two shops still collide silently. **`N in the cart` therefore keeps its
wording**; the design's `N in your cart` exists because there may be someone
else's. Also unbuilt, and marked optional by the document itself: the
`Always` / `Never` tri-state (board 5) and trends tier 2 (board 6) — **the log
is collecting for the second one from today**, which is the whole argument for
building the table now.

**One more trap, and it is the standing one.** `duration-[160ms]` was checked by
hand with a grep whose escaping was wrong, reported missing, and is **provably in
the sheet** — the class-literal checker, which unescapes the sheet's own
selectors, had already said 0 missing and was right. *Print the selector; never
hand-write the escaped form* has now cost this project six rounds.

**Verified without a browser**: typecheck clean, **671 assertions** (23 new,
covering the prefill's second half, band order and the filed-under rule across
both groups and bands, the storeless row's three absences, the two-card item
counted once, and a `NOT YET` row that cannot be put away), the dry-run artifact
at twelve tables / thirteen queries / twenty-six mutations / `db.migrations: []`
with `/api/status` still the only endpoint, and **436 class literals across five
files** diffed against the freshly built `.spacefast/zero/public/zero.css` by
unescaping the sheet's own selectors — printed, never hand-written, and proved
to catch both a nonsense class and a real-but-unused variant — with every `md:`
override confirmed by **byte offset** to land after its base.

The **real handler** was driven over `POST /__spacefast/zero/run` on a throwaway
`sf dev --port 4199`, as two named dev guests: the doc's own three-row trip
(5 · 14 · 6) written and read back, all three `restocks` rows carrying the right
`fromQty` / `toQty` / `kind` and **one shared `at` and `tripId`**; an empty and a
non-array payload refused; **a bogus id refusing the whole call with the good row
beside it left untouched**, which is the resolve-first guarantee; 201 entries
refused; a bogus kind and a missing kind both stored as `''` rather than `shop`;
`qty: "abc"` normalized; a **viewer** refused; and the `removeItem` and
`deleteHousehold` cascades both watched to actually delete. One throwaway
endpoint was added and removed, with the artifact printed to prove it went.

**Two traps the class check itself walked into**, and both are the fifth and
sixth of their kind. The tokenizer read *comments* as strings, so an apostrophe
in a sentence opened a string that ran through the markup after it and reported
117 phantom classes. And a selector's **pseudo-class is not part of its name** —
`.hover\:text-ink:hover` has to yield `hover:text-ink` — so three classes that
are provably in the sheet were reported missing. **A check that reports a
missing class is worth nothing until it has been shown to find one that is
really there and one that is really absent.**

**It worked on the first pass** — a real session on 2026-08-31, which is the
check none of the above substitutes for and the one every previous phase of
this size has failed on the first pass. The trip bar, the put-away sheet and the
after-the-trip screen all read correctly.

**What that session did not cover**, so it is still open rather than proved:
**390** — the bar's glyph-only ghosts and the sheet as a bottom sheet are both
specced in prose and drawn nowhere — and **a sheet of twenty rows**, which the
design's own open questions raise and which was drawn at three. **To see it
locally**: `?demo`, tick two or three rows, then *Put N away*.

### The list override is a tri-state (D65) — 2026-08-31

`restock.md`'s *What this unblocks*, drawn on **board 5**. **One schema change**:
`items.listRule`, the ninth additive change since Phase 2 — `''` automatic,
`'always'`, `'never'`. Twelve tables, thirteen queries, twenty-six mutations,
`db.migrations` still empty.

**Automatic · Always · Never, under the two steppers in `COUNT`** — because
*low at* is the sentence *put this on the list when I'm down to N* and both
overrides amend that sentence rather than replacing it. It goes where the
sentence is set.

**The copy is not the design's, and that is the first thing to know about it.**
Built as drawn it read as *not very clear what it does*, and three things were
wrong. ***The list* names nothing anybody can point at** — the run list has had
three bands since D58, so the sentence names the one this item lands on and
follows the source chips two sections below it. ***Until you buy it* is simply
false for a tomato you pick**, which is the sharpest case of the same problem.
And ***count* is the wrong noun**: the sheet is covered in counts and every one
is a number, while what this is about is the shelf — **stock** is the word the
pills and badges already use.

| State | Hint |
|---|---|
| **Automatic** | *On your shopping list when your stock is down to **4**.* |
| **Always** | *Always on your shopping list, however much stock you have.* |
| **Never** | *Never on your shopping list. It still shows as low or out on its card.* |

`listNameFor` supplies the name — *shopping list* for a shop **and for an item
naming no source at all** (the storeless group is Buy's), *harvest list*,
*make list*, and *your shopping and harvest lists* for an item that is really on
both cards, with the serial comma at three. **It matches vocabulary the app
already had**: the season panel has said *the harvest list* since D58.

**The segment also gained a sub-label**, which is the other half of the fix: the
two steppers beside it each name their field and this had none. Same list name,
capitalised — *Shopping list*, *Harvest list* — and it moves with the chips too.

- **It closes a question D53 could only half-answer.** D53 gave *some things are
  never shopped for* a checkbox; D58's source kinds answered that better and D60
  retired the control, leaving a clear-only box that could subtract and never
  add. **The question none of them could answer is the opposite one** — the
  thing you want on the list whatever the count says. Three states answer both.
- **`shared/listRule.ts` owns every rule, the copy included**, and `listRuleOf` is the load-bearing
  one: it **folds the retired `offShoppingList` in as `never`**, the way
  `changedAtOf` folds its own fallback chain, so nothing else has to remember a
  second spelling exists. Reading it wrong is invisible — a muted row would
  simply come back onto a list months after anybody last thought about it.
- **An edit drains the old column.** `updateItem` writes `listRule` and clears
  `offShoppingList` **in the same patch**, and `listRuleOf` prefers the new one,
  so the two can never disagree in between. That is what finally makes D60's
  *the flag drains out as people meet it* actually happen — before this it could
  only be cleared by a control nobody had a reason to press.
- **`always` outranks the count and nothing else.** It does **not** outrank the
  season: an out-of-season harvest row still files under `NOT YET`, because
  *whatever the count says* is a claim about wanting the thing, not about
  whether it has grown. `npm test` pins that boundary and a deliberate mutation
  making `always` beat the season fails two assertions.
- **The pills are unmoved.** `statusKeyFor` never sees the rule, so a `never`
  item that is low still counts in `6 running low`. D53's split intact, and the
  muted-pantry worry closes itself.
- **`EXTRA` is what an `always` row says instead of a status.** A row forced onto
  the list with nothing wrong with it has no status to report, which is exactly
  what frees the slot. **Quiet by having no hue at all** — sunk fill, `border`
  edge, `textMuted` label — which is `NO STORE`'s argument: the three status
  colours mean something here and a fourth tint would have to mean a fourth
  thing. **A row that is genuinely low or out keeps its status**, however it got
  on the list.
- **`always` means always, and this overrules D64.** `restock.md`'s rule was
  *`Always` clears on the put-away, not on the check*, which asked **when** the
  pin should end and never asked **whether**. A control labelled `Always` that
  quietly stops after one trip makes the word lie — and the tell was that two
  rounds of hint-writing went into excusing it, first *until you buy it* and then
  *until you put it away*. **A behaviour that needs its copy to apologise is
  usually the thing that is wrong.** Now nothing ends a pin but somebody setting
  it back: verified against the real handlers, where it survived a put-away, a
  `+` on a card and an ordinary edit, and went only when the segment moved.
  `never` was already permanent and nobody proposed expiring that.
- **What it costs is real and it is honest.** A finished trip no longer empties
  the list by arithmetic when a pinned row is on it, so *Everything's put away.
  Nothing is low or out.* is unreachable for a household that pins anything —
  because there **is** still something on the list, which is exactly what the old
  behaviour was papering over.
- **`ListRuleSegment.tsx` is the run list's segment**, same track, same
  raised-tab-on-a-sunk-track, same custom-property hover — `radio` rather than
  `tab`, and `flex-1` rather than content width, because these three are a fixed
  set filling a 480px sheet. **Not the ink fill**: the sheet has exactly one ink
  control and it is *Save*, which is the third time that answer has been reached
  for the same reason.
- **The card marker follows the rule and `always` gets none.** `ItemCard`'s
  `ListX` draws for `listRuleOf(item) === 'never'` rather than the raw column.
  An `always` item is visible on the list, which is where you look for it — so
  **the four-glyph top-right cluster the design prices but does not solve is not
  created here.**
- **`?demo`'s Peanut Butter is pinned**, stocked and with a store, which is the
  only way to see the `EXTRA` badge or the `always` branch locally without
  setting one by hand. It is the design's own sample row. The fixture's pinned
  distribution is asserted, including that it must be **stocked** — a low pinned
  row keeps its status and the badge never draws.
- **Not `listMode`.** The app already uses that word for *is the run list
  showing*, and a column sharing it would read as the same thing three screens
  apart.

**Verified without a browser**: typecheck clean, **719 assertions** (48 new,
covering the legacy fold in both directions, the new column winning, the
season boundary, all four `isExtra` cases, every list name including the
storeless one and the serial comma, all three hints in three vocabularies, and a
bogus value resolving to automatic rather than throwing — plus one assertion
that the word *count* appears in none of the copy) — and **both new rules were proved
by mutation**: deleting the legacy fold fails 6, making `always` beat the season
fails 2. The artifact shows `items.listRule` with `default: ""`, twelve tables,
twenty-six mutations and `db.migrations: []`. **532 class literals** across
seven files diffed against the freshly built sheet, 0 absent, with both
`--seg-*` hover rules confirmed by byte offset to land after their bases.

The **real handlers** were driven over `POST /__spacefast/zero/run`: all four
values through `addItem` and `updateItem`, a bogus string and a non-string both
landing as automatic, a legacy row keeping its flag until an edit and losing it
in the same patch, **a pin surviving a put-away, a `+` on a card and an
ordinary edit and going only when the segment itself moved**, and a viewer
refused.

**It worked too** — the same 2026-08-31 session. The
segment, its moving hint and the `EXTRA` badge are the new surfaces and all
three read correctly. **To see it locally**: `?demo` — Peanut Butter is pinned,
so it is on the run list wearing `EXTRA` — then open any item and the segment is
under the two steppers.

#### The run list's ticks — three fixes, and a cause still unexplained (v37)

**A whole evening, seven wrong theories, and the fix that shipped was chosen by
bisection rather than by diagnosis.** Read this before touching
`useTripChecks.ts` or the `claims` query, because most of the value here is in
what has been *eliminated*.

**The report**: boxes on the run list tick and untick on their own — sometimes
seconds after a press, sometimes with nobody touching the page, in more than one
household.

**What shipped, all three measured separately:**

- **Your tick stands until something real changes it.** The reconcile that
  dropped the optimistic echo the instant the `claims` query agreed is gone. An
  echo is replaced when you toggle that row again, rolled back when the server
  refuses, cleared on a household switch, and gone on reload.
- **The echo settles on the query, not the mutation** — see the section below,
  which is a genuine defect with its own failure mode.
- **`claims` echoes the household it resolved and stamps its answer.** The
  server heals a request it cannot place onto your default household (D33), so
  an answer *about a different household* was arriving indistinguishable from an
  empty cart; and `useQuery` keeps whichever response **arrives** last rather
  than whichever was **issued** last, so a stale answer could overtake a fresh
  one. The client now pins its reading to the household on screen and refuses
  any answer older than the one it is already showing.

**The bisection is the evidence, and it is what to trust:**

| build | result |
|---|---|
| optimistic overlay off — screen is the server's answer | **holds still** |
| overlay on, echo never dropped | **holds still** |
| overlay on, echo dropped when the server agrees | **moves** |
| ditto, plus refusing out-of-order answers by server clock | **moves** |

Four configurations, consistent. **Every build that lets go of your own tick
misbehaves and every build that keeps it is fine** — and dropping an echo that
agrees with the server is arithmetically invisible at that instant, so the
movement has to come from the server's answer changing back afterwards. What
makes that unexplained rather than solved: with the overlay *off*, that same
changing answer would be visible directly, and it was not.

**So the shipped shape is the one configuration that was watched behaving.** Its
cost is stated in the code: for a row **you have touched**, this device's view
wins until you toggle it again or reload, so your own tick changing underneath
you from a second device will not show. **Somebody else's claim is unaffected** —
`theirs` is read from the server and outranks the overlay — so D66's double-buy
protection, the reason the feature exists, is intact.

**What is eliminated, with measurements, so nobody repeats it:**

- **The server.** The same `claims` query answered identically fifteen times in
  a row; the database held steady while the tester sat still; row counts moved
  only on real presses.
- **The wire.** `zero.invalidate ["claims"]` frames were watched arriving on a
  raw websocket for both a claim and a release.
- **Identity.** `me` matched the claims' `owners` on every emit; `base.theirs`
  was always 0.
- **Listener dispatch.** `queryKey` is `name` + `JSON.stringify(args)`, and the
  server echoes `args` back, so results cannot cross subscriptions.
- **The checkbox and the click path.** `CheckBox` is a pure controlled span;
  every toggle logged `isTrusted true`, `detail 1`, one click one toggle; the
  toast timer only closes and never undoes; the Cmd/Ctrl+Z handler is properly
  guarded.
- **Row keys.** `key={item.id}` and `checked={checked.has(item.id)}` throughout.

**Two things that were *not* the bug but wasted hours, and are worth knowing:**

- **`sf dev` hard-reloads the browser on any file change**, `.claude/` and
  `.test-out/` included — so writing documentation or running `npm test` while
  somebody is testing reloads their page, and **a reload mid-flight kills an
  in-flight mutation**, losing the write. Seventeen reloads in one session. Use
  `sf dev --no-watch` while anybody is testing. See `.claude/docs/spacefast.md`.
- **Two browser tabs make the server log unreadable.** Three theories were built
  on a log that turned out to hold two clients' traffic interleaved, each
  behaving correctly. **Ask how many tabs are open before reading a shared
  log.**

**And the amplifier**: on `sf dev`, a mutation costs **4–7 seconds** once
clients are subscribed — even one that writes nothing and invalidates nothing —
against ~260 ms reads at the same moment. An optimistic UI written to cover a
round trip is carrying the interface alone for whole seconds, which turns every
ordering subtlety into a visible defect. Measured, cause not established, in
`spacefast.md`.

**Where to start if it recurs**: the bisection tool, not a theory. Switching the
overlay off, then switching only its removal off, split the problem in half
twice in minutes — after hours of instrumenting one variable at a time. **And
instrumentation that changes load is not a neutral observer**: a `ctx.log` added
to two query handlers was very nearly filed as a two-second platform cost, and
was not.

#### The echo settled on the wrong event — fixed 2026-09-10

**Reported from using the list: *first click seems to tick, then untick, then
tick again*, with boxes going unticked later while hovering or doing something
else.** All of it is one defect, and the file's own comment described the fix it
did not perform:

```
// Held until the query re-emits, so the box does not blink off between
// the write landing and the subscription catching up.
settle(id);
```

**It settled on the mutation resolving, and those are two different events.**
D66 gave `claims` its own subscription precisely so a tick does not refetch the
pantry — so a claim is *written* by one round trip and *read* by another, and in
between the server's own view is still the old one. Dropping the echo there fell
back to it. The three states the report names are exactly the three the code
produced: the echo, the stale read, the query catching up. Every press did it,
which is why the later ones look like they happen at random moments.

- **`toggle`, `uncheck` and `recheck` now settle only on a refusal.** A success
  settles nothing; the echo stands until the query agrees with it.
- **`base` is the server's unechoed view**, split out of the `index` memo — the
  reconcile has to compare against *that*, because comparing the echo with the
  echoed result agrees by construction and would never settle anything.
- **One effect owns settling**, and its rule is that an entry survives exactly as
  long as the server disagrees with it. An id that has left the list goes too,
  or the map leaks an entry per restocked row for the life of the trip.

**A second cause was theorised and disproved, and not "fixed".** `usePantryData`
resolves `claims` to `[]` unless the query is `ready`, which looked like it would
blank every tick on screen during each refetch. It does not: `useQuery` holds its
value in `useState` and replaces it only when a result arrives, so a refetch
keeps the previous answer. **Reading the SDK settled in a minute what a plausible
story would have turned into a wrong change.**

**Client-only** — the artifact is unchanged at fifteen tables, fifteen queries,
thirty-two mutations, `db.migrations: []` — typecheck clean, 1,037 assertions.
The **real handlers** were driven over `POST /__zero/run`: `claimItem` writing
and `changedQueries: ["claims"]`, the `claims` query returning the row
immediately after, a re-claim of your own row reporting `changedTables: []` and
`changedQueries: []` (the deliberate no-op), and `releaseClaims` taking it back
out. **The server was never wrong here**, which is what narrowed it to the echo.

**Not verifiable without a browser**: every part of this is press-time, and the
hook is Preact state, so `npm test` — which covers `shared/` only — cannot reach
it. It wants a real tick on a real list.

### Claims are shared, and that stops the double-buy (D66) — 2026-08-31

`restock.md`'s *Claims are shared, and that is the feature* — the half deferred
when D64 was built, and the one that makes the run list a **shared** list.
**Two schema changes**: `trips` and `claims`, the thirteenth and fourteenth
tables. **Fourteen queries, twenty-eight mutations**, `db.migrations` still
empty.

**D41 refused to share ticks and its reason reads well** — *a tick that means
"in my cart" cannot be read by someone else without saying whose.* So it says
whose, and **the collision that rule was avoiding is the entire feature**: two
people at two shops was the failure mode and it is now the case the screen is
for.

- **A claim is not a write**, which is what makes sharing safe (D64). It says
  somebody intends to get the item and touches nothing about it; the count is
  written once, at the put-away.
- **Two tables, and the trip is the one that needs justifying.** It exists so
  the twenty-four hours run from the **last** tick rather than the first —
  D41's rule, which per-claim expiry cannot express without rewriting every
  claim on every tick. It also makes `restocks.tripId` a real row id, exactly as
  that column's note predicted, and gives the put-away something to *name*.
- **Neither table stores a name.** A claim carries a `userId`; `household`
  already returns every member with a display name and a picture, so the face is
  resolved client-side from an id we have. **Nothing in the larder records who
  touched a thing** — a trip is transient and goes with the account, which is
  what keeps account deletion a clean operation rather than a scrubbing job.
- **`claims` is its own query, deliberately.** A tick by anybody invalidates it,
  and `pantry` carries the items, both join tables and all three taxonomies —
  folding it in would refetch that for every member each time somebody ticked a
  row in a shop.
- **Yours only, everywhere it counts.** `Hide N checked`, `Put N away` and row
  2's `N in your cart` all count yours; hers stay visible because they are still
  on the list until she buys them, and **you cannot put away what you do not
  have**. Driven for real: a put-away ended one trip and left the other standing.
- **The server names the trip.** `restockItems` took a `tripId` from the client
  and now resolves its own — the client was telling the server something the
  server was holding, which is the instinct that makes a household id a selector
  rather than an authority.
- **`localStorage` shrank rather than becoming the queue** the design predicted.
  The server made it redundant for ticks — they survive a reload, a second
  device and a flat battery — so what is left there is **list mode alone**, per
  household. A tick still paints instantly through an optimistic echo in
  component state, and a refusal rolls it back with the server's own sentence on
  screen. **No durable outbox**, which is one of the design's open questions.

#### The tick column is the answer, not the count slot

The design puts an 18px avatar and *In Sarah's cart* in the **count slot** and
leaves the checkbox column **empty**. Built that way it read as wordy, and the
cause was structural rather than verbal: **the empty gutter threw away the one
position on the row where the eye already looks for that answer**, then
re-explained it on the far right.

| tick column | means |
|---|---|
| empty box | nobody |
| checked box | **you** |
| a face | **them** |

- **A face is not the box the design refused.** Its reason was that *a box you
  cannot fill reads as unchecked* — true of a box, false of a person: the slot
  is visibly **occupied** rather than visibly empty. There is still nothing
  there to press, so the rest of that sentence holds. **A knowing departure.**
- **22px, not the design's 18.** That number was for the count slot beside 13px
  text; here it shares a column with `CheckBox` and a circle four pixels shy of
  the boxes above it reads as floating.
- **The count slot keeps the sentence** — *In Justin's cart*, at a first name,
  which fits only because the face left and took a circle and its gap with it.
  One span and **not** a visible name with a spoken twin: the words on screen
  *are* the sentence a screen reader should hear.
- **Three passes went into that slot** — full sentence, name only, sentence
  again — and none of the wordings is what unlocked it. **Moving the face into a
  column that was already asking the same question** is.
- **No cart or basket glyph, and the reason generalises.** The cart is the shop
  kind's mark and the basket is the run trigger's; either would gain a third
  meaning on the one screen that teaches the first two, and on a **Harvest** card
  a cart is plainly wrong — she is picking, not shopping.

#### A face, because a person in this app has one

`ClaimAvatar` draws the real Gravatar and falls back to the initial. **It was
built as a letter first and that was a rule broken**: 18px being small for a
photograph is a reason to accept a smudge, not to invent an exception to D55,
which every other surface follows. **`onError` is load-bearing** — the
platform's URL carries `d=404`, so an account without a Gravatar serves no image
and the consumer draws its own initial; without it that account gets the
browser's broken-image glyph. It cannot reuse `DrawerAvatar`, which hard-codes
the drawer's palette because the drawer is dark in both themes.

**Verified**: typecheck clean, **745 assertions** (26 new, covering the split
in both directions, the unknown-caller case that must read as *nothing is mine*,
the possessive including the `s`-ending form, and the nameless fallback that
still says something true), the artifact at fourteen tables / fourteen queries /
twenty-eight mutations / `db.migrations: []` with `/api/status` still the only
endpoint, and every class literal in the touched files diffed against the
freshly built sheet.

The **real handlers** were driven over `POST /__spacefast/zero/run` as **two
named dev guests at once**: both saw both claims correctly attributed; a claim
on somebody else's row **refused**; re-claiming your own a no-op; releasing
somebody else's **0 released**; a put-away ending one trip and leaving the other
standing; the restock rows carrying the **server-resolved** trip id, shared
across the trip; leaving a household taking the leaver's claims; and
`deleteHousehold` clearing trips, claims and restocks together.

**This is the one that most wants two browsers open.**

### Bulk entry — the adoption wall (D67) — 2026-08-31

`.claude/docs/design/bulk-entry.md`, drawn on
`.claude/docs/design/larderlogbulkentrydesign.html` — eleven boards on three
pages, light theme. **No schema change**: fourteen tables, fourteen queries,
**twenty-nine** mutations — `addItems` — `db.migrations` empty and
`/api/status` still the only endpoint. A cross-cutting feature that costs one
handler is a feature the data model was already shaped for.

**Paste and the common-items checklist are both just *sources*. The review
table is the destination, and nothing is saved until you press Add.** That is
the whole structure and it is what stops the two features being two features: a
checklist that committed on its own would put thirty-one items into the pantry
at 0 on hand, which by the run list's own rule is thirty-one rows on your
shopping list on day one.

- **The `Add item` primary is a split button, the app's first.** The label opens
  the Add sheet exactly as it did; the chevron opens a menu holding the other
  two routes. **The Add sheet carries none of it** — three rounds went into
  fitting *many* into the sheet and all three lost to one objection: the sheet
  is for one item, and the button is for choosing. **The default is deliberately
  absent from the menu.**
- **Each half lights on its own**, which rules out `PAGE_BUTTON_PRIMARY`'s
  `hover:opacity-90`: fading one half shows the ground through it and puts a
  seam down a control whose whole point is being one shape. So it goes through
  `--split-hover` / `--split-press` — **the fifth time this app has hit *an
  inline `background` beats any `hover:` class*** — and the hover is derived
  with `mixHex` rather than looked up, because the design's `#332B22` is light's
  `drawer.raised` and dark's primary is *cream* (away from the ground means
  darker there, D45). The light end lands within three units of the drawn number.
- **One focus stop.** `focus-within` on the wrapper, the chevron `tabIndex={-1}`,
  `↓` opens the menu from the label, Escape hands focus back.
- **At 390 the chevron joins the pinned bottom bar, not row 1**, and that is a
  knowing departure. The mobile board draws it beside search on the reasoning
  that *the primary is already a 52px square at this width* — **which the build
  does not have**: below `md` row 1 is search alone and mobile's primary is the
  bar. A second one up there is three ways to add on one phone screen. It also
  answers the number the design flags as most likely to be wrong: the 34px
  chevron cell was under the 44px floor, and down here there is a full row to
  spend, so the chevron is 44 and search is untouched.
- **The review replaces the content column exactly as the run list does.** Row 1
  does not change; row 2 becomes `‹ Back to items` and the counts, in the trip
  clause's slot. **Not in `useViewState` (D51)** — an app that reopens on a
  half-reviewed paste has forgotten what it is for. `listMode` and `bulkMode`
  are mutually exclusive, because row 2 has one left-hand exit.
- **`Set for checked` is the part that decides whether this works.** Bulk entry that
  leaves you assigning three chips per row two hundred times has not solved the
  wall it was built for. **Location replaces and the other two toggle** — the
  chip row's single-versus-multi rule applied to a column — and the toggle
  direction reads what is already true of every row, which is the only way *Set
  for all* is also *unset for all*.
- **A duplicate arrives unchecked, in amber, showing what you already have.**
  Its tick column **stands empty and holds its width** (the `NOT YET` rule: a
  row that loses its box must not slide its name 36px left), and a ticked
  duplicate is still never written — `bulkDrafts` is the real guard and the tick
  is belt and braces.
- **The parse works from the end**, which is the only reading that survives
  `Butter 1 lb 2` — left to right that is an item called *Butter* sized 1 with a
  count of *lb*. Commas are separators and nothing more. **It never claims the
  whole line**: `12` is an item called *12*, because popping a token that would
  leave no name is how a parse silently deletes a row.
- **The paste guesses no shelf, shop or type; the checklist reads the two the
  catalog carries.** Not an inconsistency — a pasted line is a word somebody
  typed, a catalog row *carries* a type and a place, and D63 already settled
  that picking one on the Add sheet reads both. **The boards draw filled type
  chips on pasted rows and the design's own prose says the opposite twice**, so
  the prose wins.
- **The checklist leaves out what the household already has.** It answers *what
  should I add*; thirty-one ticks with twelve refused is a worse screen than a
  shorter list.
- **`addItems` is `restockItems`' construction** — every draft resolved before
  anything is written, one clock read for the run, capped at `BULK_MAX` (200).
  **A refusal leaves the table exactly as it was**, which is what *nothing is
  written until you press Add* has to mean on the way out as well as in.
- **No undo, and that answers the design's own open question.** D36 governs
  records that go away and nothing here does; what a run of twenty-two lacks is
  *visibility*, so it arms the **plain** toast (`lead` alone, no control). An
  undo would mean a second, destructive bulk mutation written to reverse a
  constructive one.
- **The empty larder keeps both routes spelled out** — the ink primary, then
  *Add several at once ›* as a pressable sentence. A deliberate second idiom,
  allowed because this is the one screen with room; worth revisiting if the app
  grows another empty state.
- **`ModalShell` gained `sheet`** — a bottom sheet below `md`. *Destructive
  actions* centres a confirm because a confirm is a question; this is an entry
  surface with a keyboard about to cover half the screen. **A sheet fades and
  does not scale**, because the card's 96% entry pulls a bottom sheet away from
  the edges it is flush with.

**`Save and add another` was built whole and removed the same day**, on Justin's
own look at it: three controls in a 480px footer and a fourth full-width row at
390 is a cramped sheet. **`ItemSheet.tsx` is byte-identical to what it was
before this work** — the removal is complete rather than hidden behind a flag.
The rules it forced are on the record in D67 if it comes back: the terms carry
and the item clears, the header is the confirmation rather than a toast, and
*Cancel* has to relabel to *Done* once anything is saved.

**Verified without a browser**: typecheck clean, **807 assertions** (61 new,
covering all four parse shapes plus the end-first case that separates the rule
from any other reading, the glued unit, plurals, the line the parse must not
claim, the cap being real in `parseList` and deliberately *not* in
`countLines`, the duplicate arriving unchecked, what a commit carries and what
it must not, the catalog route's type and shelf against the paste's absence of
both, and the checklist's grouping including that every catalog row finds a
seeded card) — and **all four new rules were proved by mutation**: reading the
parse left-to-right fails 16, a substring duplicate check fails 1, writing a
ticked duplicate fails 1, and offering what the household already holds fails 2.
**One of those mutations initially passed**, which found a real gap: the
duplicate test only pinned one direction, and *Butter* against a pantry holding
*Salted Butter* is the half it was missing. Both directions are asserted now.

The artifact is fourteen tables / fourteen queries / twenty-nine mutations /
`db.migrations: []`, and **`.docs/data-model.md` was diffed against it** — zero
tables, columns, mutations or queries missing. **335 class literals across six
files** plus **both new control-style constants' twelve utilities** diffed
against the freshly built `.spacefast/zero/public/zero.css` by unescaping the
sheet's own selectors — printed, never hand-written, and proved to find a real
class and refuse a nonsense one — with every `md:` override confirmed by **byte
offset** to land after its base.

The **real handler** was driven over `POST /__spacefast/zero/run` on a throwaway
`sf dev --port 4199`: the design's own three rows written at once and read back
with their sizes, units and join rows intact and **one shared stamp across the
run**; an empty payload and a non-array both refused; **a nameless row and a
bogus location each refusing the whole call with the good rows beside them left
unwritten**, which is the resolve-first guarantee measured rather than asserted;
201 rows refused; `qty: "abc"` normalized to `0` and bogus type and store ids
dropped while the row still landed; a **cross-household location** refused; and
a **viewer** refused with D20's own sentence.

Every interesting part is press-time: the split's two halves, the chevron
menu, the paste sheet's parse, `Set for checked` across twenty-two rows, and
the review at 390 where the row stacks two-deep. **To see it locally**: the
chevron beside *Add item*, or `?demo` then the chevron, or a fresh household's
empty state for the spelled-out pair.

#### Six changes from the first look at it — 2026-09-01

**Client and `shared/` only**: no schema change, no handler moved — fourteen
tables, fourteen queries, twenty-nine mutations, `db.migrations` empty, the
artifact byte-for-byte the shape D67 left it.

- **The paste route is the Add / Edit sheet now, not a centred dialog.**
  `PasteListDialog` is **`PasteListSheet`** — same scrim, same right-edge
  geometry, same gradient, same header and sticky footer, the field filling the
  panel on desktop and fixed at 220px below `md`. `PutAwaySheet` already made
  this move; the argument is stronger here, because **this surface and the Add
  sheet are two answers to one question**, reached from the two halves of one
  split button. A card floating in the middle of the screen beside a panel
  hinged to the right edge is that button saying they are different kinds of
  act. The parse sentence moved **above** the field — every other hint on this
  board reports on something already typed and this one is a rule you need
  before the first line — and the primary wears an **arrow rather than the
  board's check**, because every other primary there writes something and this
  one hands the lines to the review. **`ModalShell`'s `sheet` prop is deleted**:
  this was its only caller. **What the move gives up** is `ModalShell`'s focus
  trap and its focus return, neither of which `ItemSheet` or `PutAwaySheet` has
  either — worth fixing on all three at once or not at all.
- **`Set for all` is `Set for checked`**, and **only the label moved**. The
  handler always skipped a duplicate and always skipped anything unticked, so
  the old label described a reach the function declined to have — on a screen
  whose entire left column is ticks.
- **The review card does not clip its own popovers.** `overflow-hidden` was
  there to hold the header band's fill inside the radius and it cropped every
  picker, from the band and from every row, at the card's edge — **the console
  Members card's bug exactly**, and the same price: the band now rounds its own
  `rounded-t-[19px]` (the card's 20 less its 1px border). **Where a picker opens
  is measured, not assumed** — see below; the static breakpoint rule that first
  replaced the clipping was wrong in both directions.
- **The table is A–Z, sorted once when the batch arrives** — the order is a
  property of the batch rather than something recomputed from the live rows, and
  it is what puts two lines both saying *Butter* next to each other where they
  can be seen. `key` stays tied to the **source** line, so the second of them is
  still `line-7` however far up it sorted.
- **The commit bar says *Nothing is saved until you press Add*.**
- **`bulkWritable` is the one rule `setForChecked`, `bulkSummary` and
  `bulkDrafts` all read**, so the button's number and what the button writes
  cannot disagree. The row's fixed `md:h-[62px]` became a `min-h`.

**The name was made editable and reverted the same day** — every row a field,
duplicates included, with `findExisting` re-run per keystroke so a row could be
renamed out of its own collision. **The review answers *which of these, and with
what tags*; correcting a word belongs to the Add sheet**, one screen away. It
also restored `existing` as the one field on a row nothing can change. **Two
rules are worth keeping if it returns** and are written up in D67: the tick must
follow *writability and only writability*, and `bulkWritable` must refuse a
**blank** name as well as a duplicate — `addItems` refuses a nameless draft and
refuses the **whole call** with it, so one emptied field would take twenty-one
good rows down and read as a broken server.

**Verified without a browser**: typecheck clean, **812 assertions**, and the
A–Z sort **proved by mutation** — dropping it fails 3, one of them the key that
must not move with it. Every class literal in the touched files diffed against
the freshly built `.spacefast/zero/public/zero.css` by unescaping the sheet's
own selectors — printed, never hand-written, proved to find a real class and
refuse a bogus one — with `md:left-auto`, `md:right-0` and `md:py-2.5` confirmed
by **byte offset** to land after their bases.

**The pickers near the card's edges want a pointer.**

#### And four more, from the second look — 2026-09-01

**Client only**: the artifact is unchanged again — fourteen tables, fourteen
queries, twenty-nine mutations, `db.migrations: []`.

- **The tick is a gutter, and every line hangs off it.** The row was one flex
  line that wrapped, so a wrapped line began *under the checkbox* — which reads
  as belonging to the row above, because **a checkbox is a column, not the first
  word of a paragraph**. It is a fixed 22px span now with everything else in one
  column beside it, at every width. The tick takes **two derived offsets**: none
  when the row is stacked, where the name is the first thing in the column and
  `min-h-[22px]` makes that line a tick's height whatever the name measures, and
  `lg:mt-[11px]` — (44 − 22) / 2 — when the row is one line and the column's
  height is the stepper's.
- **The count is the app's stepper**, in the row form it was extracted for
  (D64), which brings the Add sheet's own field treatment because that is what a
  `Stepper` is made of. It was the one number in the app you could not press.
  **That moved the row's horizontal layout from `md` to `lg`**: 132px where a
  bare field was 76, and at 768 with the rail beside it the fixed columns left
  the name about 90px of a column it has to be readable in.
- **Every control's states, checked against the ground it is painted on.** Three
  real defects, and two of them are the console sweep's own bug on a new screen:
  - **The three *Set for checked* triggers had a dead hover and an invisible open
    state.** `PAGE_BUTTON_QUIET` hovers to `surface-alt` and opens to
    `surface-alt`; the header band **is** `surface-alt`. `PAGE_BUTTON_QUIET_SUNK`
    and `PAGE_BUTTON_QUIET_ON_SUNK` move that one token to `surface` — on the
    lighter of the two grounds, away means up (D45).
  - **The tick had no hover at all.** `LIST_TARGET` is a focus ring and nothing
    else, which is right where it came from — on the run list *the whole row is
    the checkbox*, so the row's hover is the box's. Here it is a 22px button in
    a gutter with nothing behind it. `CARD_CHECK_TARGET` gives it a 30px well
    that **occupies 22** (`p-1 -m-1`), which is `CARD_CHEVRON`'s trick and its
    warning.
  - **Four ring offsets named a colour that was not behind them** — both row
    chips (`canvas`, on a `surface` card), the commit bar's primary and the
    band's triggers (`canvas`, on `surface-alt`). `CARD_CHIP_ADD`,
    `CARD_CHIP_ON`, `PAGE_BUTTON_PRIMARY_ON_SUNK` and `PAGE_FOCUS_ON_SUNK`.
    **The run list's trip bar had the identical defect on the identical ground**
    and was fixed with it — its *ghost* had always had the offset right, which is
    what makes the pair legible as a mistake rather than a choice.
- **`PAGE_FIELD` gained a hover, so every field in the app did.** The border
  steps one shade toward the text — darker in light, brighter in dark, the run
  segment's rule. **A border rather than a fill, because a field cannot use
  D45**: `bg-surface` is the field's identity, and this style sits on the item
  sheet's gradient, on a `surface` card and inside a stepper, three grounds no
  single fill moves away from. **A field was the one control in the app with
  nothing under the pointer** — a caret, a focus halo, a selection colour and no
  hover — which reads as inert on any surface holding several. It survives the
  name field's removal because it belongs to the field, not to that screen; the
  review still wears it on every stepper.
- **And the whole field family now agrees on one `transition` utility.** Two
  `transition-*` classes on one element is the coin toss the console sweep
  warns about — both set `transition-property` and **sheet order** decides. The
  halos are *designed* to be worn with `PAGE_FIELD` at eight call sites, so
  leaving one on `transition-shadow` would have made the pair a toss at every
  one. **`PAGE_INPUT` had that bug already**, against `PAGE_FIELD_HALO_WITHIN` on
  the top bar's search, and it is fixed here too.

**Verified without a browser**: typecheck clean, 812 assertions, the artifact
unchanged, 270 utilities across the two touched components and the thirteen
control styles diffed against the freshly built `zero.css` by unescaping the
sheet's own selectors — printed, never hand-written, proved to find
`hover:border-ink` and refuse `hover:border-inkk` — with `hover:border-ink`,
`lg:flex-row`, `lg:w-[300px]`, `xl:w-[340px]` and `lg:py-2.5` each confirmed by
**byte offset** to land after the base it overrides.

**And a ground-aware check over every control on the screen**, resolving
each one's painted ancestor against its hover target and its ring offset: **0
flagged**, proved to catch both classes of defect by injecting each in turn.
**It reported two false positives first, and the cause is the standing trap** —
its extractor read *comments* as source, so an apostrophe in `the field's
identity` opened a string and swallowed the class list. **Sixth time a tokenizer
in this project has read prose.** Strip comments before reading source, every
time.

All four are pointer-and-width work: the wrap at 390 and between `md` and
`lg`, the stepper in a row, and every hover the check can only prove exists.
**The name field went in with these four and came out again the same day** —
see the note above; what it leaves behind is the row's gutter, which was worth
having on its own.

#### A picker opens where there is room, and that is measured — 2026-09-01

**Client, plus one `shared/` module**: the artifact is unchanged.
`shared/menuPlacement.ts` is not imported by the capsule.

**Two clipping reports, one cause.** At 390 the review's right-most pickers were
cut off at the side of the screen, and a picker on the last row was cut off at
the bottom. **The clipping ancestor is `Pantry.tsx`'s content column**, which
carries `overflow-x-hidden` deliberately — the root cannot have it, because
setting one overflow axis makes the other compute to `auto` and leaves the
drawer's `position: sticky` with nothing to stick to. **And that is why both
axes clip**: `overflow-x: hidden` gives `overflow-y: auto` by the same rule.
**Do not fix this by loosening that wrapper.** A popover belongs inside the
viewport; that is the layer that moved.

- **A static breakpoint rule cannot answer this, and the first attempt proved
  it in both directions.** The pickers had been hung *right above `md`, left
  below it*. Both of the review's trigger groups **wrap** — the row's chips and
  the band's three triggers — so where a trigger sits is decided by the content
  beside it rather than by the window: at 390 the chips end up in the right half
  of the row (left-hung ran off the right), while the band's triggers wrap to
  the **left gutter** (right-hung would run off the other side). **A position
  that depends on content cannot be derived from a breakpoint**, which is the
  exact opposite of the run segment, whose widths really are arithmetic.
- **`placeMenu` in `shared/menuPlacement.ts` is the rule, and it is pure.** It
  takes the trigger's box, the viewport and the panel's own two numbers, and
  returns a **corner** and a **height**. It names no browser global, so
  `npm test` can see it — and it returns a corner rather than a class string,
  so no Tailwind literal is ever written in a file the scanner is not reading
  for one. The four literals stay in `BulkReview` as **complete strings**: two
  utilities for one property is the coin toss sheet order decides.
- **It measures the trigger and never the panel**, which keeps it to one pass —
  the panel's width is a constant and its height has a cap, so both bounds are
  known before it is drawn. That is the chart tooltip's rule reached the same
  way. `useLayoutEffect`, because a `useEffect` runs after paint and the panel
  would be drawn once in the wrong corner before moving.
- **Two mechanisms, and they do different halves.** The corner flips **up** only
  when there is not room below *and* there is more room above — a panel that
  flips into a tighter space has moved for nothing. The height then **shortens
  to the room it actually has**, so a squeezed window opens a shorter scrolling
  panel rather than one hanging off the screen. The cap is an inline style,
  which beats the `max-h-[320px]` class rather than fighting it.
- **The horizontal side is chosen by which one spills less**, not by which half
  of the screen the trigger is in, with a tie going left — the reading order.

**Verified**: typecheck clean, **824 assertions** (12 new), and **all three
rules proved by mutation** — pinning the corner to the left fails 2, *and one of
the two is the reported bug reproduced* (`the panel is on the screen: got
false`); never flipping up fails 3; leaving the height at its cap fails 3. The
assertions are written as geometries rather than as expected corners alone:
`fits()` recomputes the panel's rect from the placement and asserts it is inside
the viewport, so a rule that returns a plausible corner and still clips is
caught. Both reported cases are in there by their real numbers — a chip in the
right half of a 390 row, and a trigger 54px off the fold.

**This one especially wants a real phone**: every
number in it is a viewport measurement the test can only simulate.

#### One badge, beside the thing it is about — 2026-09-01

**Client only**; the artifact is unchanged.

- **The `New` badge is gone.** It was on every row that was not a duplicate,
  which is nearly all of them — and **new is what a row on this screen *is*
  unless it says otherwise**, so the marker was on twenty rows to distinguish
  them from two. **A marker earns its place by being the exception.**
- **`Already here` is `In Pantry`, and it moved next to the name.** It
  had been a 120px column at the row's far end, which put the answer to *have I
  got this already* a whole row's width from the word it answers about, and made
  every row reserve space for it. The wording moved with it: **`Already here` is
  true of the row you are looking at as much as of the pantry**, and naming the
  pantry is what makes it an answer rather than a label. **Two words, not
  three** — a pill beside a name that truncates should spend as little of the
  line as it can. Amber still, and still over its own *4 on hand · low at 6*.
- **The name is the only left-aligned thing, and that is what right-aligns the
  rest.** It takes the row's slack (`lg:flex-1`); the stepper and the chip
  column are fixed widths after it, so their edges line up down the table
  without any of them knowing what the others measure. The chips take
  `lg:justify-end` so the column ends at the row's edge rather than fraying by
  however wide three term names happen to be. **Below `lg` nothing changes** —
  the chips follow the stepper on their own line, where left is the reading
  order and there is nothing to line up with.
- **The freed 120px went to the chips and the name**, 300 → 340 at `lg` and 340
  → 380 at `xl`, which is what stops a row wearing *Refrigerator · Warehouse
  Club · Canned Goods* from wrapping to two lines.

**Verified**: typecheck clean, 824 assertions, artifact unchanged, 270 utilities
diffed against the freshly built `zero.css` — `lg:justify-end`, `lg:w-[340px]`
and `xl:w-[380px]` all present, a bogus `xl:w-[381px]` refused, and each
confirmed by **byte offset** to land after its base. The bundle carries
*Already in Pantry* once and neither `Already here`, `"New"`, nor the badge
column's `w-[120px]` at all. Ground check still 10 controls, 0 flagged.

**One thing to look at on a phone**: even at `IN PANTRY` the pill costs a 390
title line something, so a long name on a duplicate row truncates harder than it
did. That is the row whose point *is* the badge, so it is the right trade — but
it is the first thing to check on a real screen.

#### `Set for checked` is the batch's own value now — 2026-09-01

**Client, plus two `shared/` functions**; the artifact is unchanged.

Reported as *confusing* rather than as broken, which is what a hidden state
looks like from the outside.

- **Each menu *is* the batch's value.** Every ticked row is a term every row the
  band would write already carries; a press adds one to that set or takes it out,
  and **every target row then holds exactly what the menu shows**. `Dairy` then
  `Baking` gives the batch both; pressing `Dairy` again leaves it with `Baking`.
  A location's set holds one, because a shelf is one.
- **What that replaced was a toggle with a hidden direction.** A press added the
  term unless every checked row already carried it, in which case it took it off
  all of them — **what a press did depended on a fact about twenty rows that
  nothing on screen reported**, and setting `Dairy` on a batch already holding
  `Baking` left the rows still disagreeing. **Two things fix it together**: the
  tick makes the direction visible, and writing the whole set makes one press
  enough to make every row agree. **Multi-select survives**, which a plain
  single-select would have cost — and did, for one build.
- **Each menu ticks what the whole batch already carries**, so a run of presses
  can be read back rather than remembered. `checkedTerms` is a stronger claim
  than *some row has it*: a tick beside `Dairy` says the batch **is** Dairy, and
  it goes the moment one row stops being. **Nothing is ticked when nothing is
  ticked** — with no target rows there is no batch to describe, and `every` over
  an empty list is `true`, so an unguarded version ticks every term in the menu
  at once.
- **Pressing the ticked term clears it**, which is the only other thing a press
  there could honestly mean — and the only way *unset for all* survives the
  toggle going.
- **The menu closes on a pick only for location** — the row chip's rule and the
  rail quick-filter's, for the reason both have it: a set is built by pressing
  twice, and a menu that shut in between would have to be reopened for each one.
- **Both rules are in `shared/`** (`setTermForChecked`, `checkedTerms`) because
  both are invisible when wrong: a toggle where a replace belongs still moves
  chips, and a checkmark computed from one row rather than from all of them
  still draws.

**Verified**: typecheck clean, **845 assertions** (21 new), artifact unchanged,
and **six mutations caught** — writing `[id]` instead of the set (the
single-select build) fails 5, putting the old hidden toggle back fails 5 *and
prints the reported bug* (`got [["t-spice","t-dairy"]]`), treating a location as
a set fails 1, reading the check as *some* rather than *every* fails 1, dropping
the empty-batch guard fails 1, and letting a set touch unticked rows fails 2.
Ground check 10 controls, 0 flagged; the bundle carries `In Pantry` and neither
of the two strings it replaced.

### Delete account — leaving every household at once (D68) — 2026-09-01

`.claude/docs/design/delete-account.md`, drawn on
`.claude/docs/design/larderlogdeleteaccountboards.html` — six boards, light
theme, desktop except board 6. **No schema change**: fourteen tables, **fifteen**
queries, **thirty-one** mutations, `db.migrations` empty and `/api/status` still
the only endpoint. A feature this size costing one query and two handlers is a
feature the data model was already shaped for.

**Account deletion is *leave household* run against every household at once**,
and D22's last-owner guard does not survive the trip. **One blocked dialog is a
step; five is a wall** — so every block becomes a choice, every choice becomes
one row, and the set is asked once at the end rather than five times on the way
past.

- **`fateOf` in `shared/accountDeletion.ts` is the whole classification, and
  both halves read it** — the dialog to draw its two groups, and
  `deleteMyAccount` to decide which rows it is owed an answer for. Two
  descriptions of *which households are a question* would disagree exactly once,
  in production, over somebody's data. **`members <= 1` is tested before the
  role**, and that ordering is the rule: testing the role first makes a
  sole-member household a *question*, which is a screen offering a choice with
  one answer. `npm test` fails ten assertions on the swap.
- **The identity row in the account menu is a door now.** It lost its pencil,
  gained a chevron, and opens *Your account* — the **third** use of the pushed
  pane after Members and Administration, so the way out is the gesture the app
  already teaches. **`Delete account` sits inside the account's own card under a
  hairline, exactly where *Leave household* sits inside the Household card**;
  that parallel is the argument rather than a coincidence.
- **The cost is that the display name moved**, out of the menu D49 put it in on
  purpose. The idiom survives intact one push further in — a read-only row that
  flips in place, Escape cancels, no toast — and **the crimson menu row that lost
  is on the record** as the fallback if this turns out to be the worse trade.
- **`openAccount` un-collapses the drawer, which is the opposite of
  `openAdmin`.** The console has a rail form and this pane has none, so a press
  on the rail's flyout would set a flag and reveal nothing. Both handlers are
  defined once in `Pantry` and handed to both hosts, which is the rule the
  missing *Admin* row cost a real session to learn.
- **The pre-flight is two groups, not the console's tail line.** A sole-member
  household is *destroyed* and the rest are merely *left*; one sentence covering
  both flattens the first into the second. Its disc is **amber** — this is the
  blocked dialog turned into a choice, and the last screen where *hold on* is
  still true — and **its primary is the one in the app that does not name a
  destructive verb**, because the verb is on the next screen.
- **One trigger, not two chips.** Transfer needs a **name**, so it is one
  question with several answers, which is a menu. **No row in it is marked as
  current**, because a transfer has no incumbent — and it carries a micro-label
  header, which no other menu in the app has: without it the delete row reads as
  a fourth person.
- **Transfer is its own capability, and it is what unblocked all of this.**
  `transferOwnership` promotes the target and **demotes the caller to Editor**,
  in that order so there is never an instant with no owner. Only the caller is
  demoted — handing yours over is not a claim about anybody else's. It is a row
  in the role menu under its own hairline, **not crimson**: nothing is destroyed.
- **Its confirm's disc is crimson though nothing is destroyed, and that
  generalises the ramp.** Blocked is amber because it is a *precondition*; a
  confirm is crimson because it is *final*. **The ramp is picked by finality, not
  by data loss** — the existing two users generalised rather than a new rule.
- **The app's third typed confirmation**, and it asks for the **display name**: a
  typed confirm buys a beat of deliberation rather than authentication, so it
  takes the name a person thinks of as theirs. **The body is a list, which is
  new** — up to five households in three fates — so the sentence says what the
  *account* loses and a read-only recap accounts for the households one by one.
  **The recap and the count read one function**, which they did not at first: an
  unanswered row showed as deleted in the list and was left out of *two of them
  go with you*.
- **There is no hold, and that is a decision.** A thirty-day grace period was
  drawn in full and cut. **If somebody wants to delete their account, that is
  their decision.** The design cost was never the three cards — a held account is
  *already out* of its households, and **a grace period that reaches other people
  is not a grace period**, so the honest version hands you back an account with
  nothing in it. **The accepted cost is stated**: a mistake has no recourse and no
  support path, which is the trade *Delete household* already makes.
- **The card at the end is the app's first screen that is neither signed out nor
  signed in.** The session is still live — this removes the app's rows and cannot
  reach the Spacefast identity behind them — so it is the 440 card with a
  **neutral** disc (the console's 404 rule: no status colour when it makes no
  claim). **Its button signs out**, or *Back to Larder Log* lands on the
  first-run screen offering to name a household. **No toast**: there is no app
  left to show one in, which is the fifth settled case.
- **Nothing is logged**, and that is D62's rule rather than an omission: the
  audit log records *administration*, and never what a person does to their own
  — `deleteHousehold` writes no row either.
- **`account` is subscribed only while the pane is pushed.** Five indexed reads
  per household is nothing once and a page-load tax on everybody beside
  `pantry`, so `AccountPane` holds the hook and only exists while the pane is —
  the console's own mounted-not-flagged arrangement.

#### A transform traps every `fixed` beneath it, and the drawer has one

**The two dialogs shipped inside the drawer and were 340px wide**, which is what
the first look at this found: *the delete account cards are stuck inside the
sidebar instead of modals over the entire screen*.

`ModalShell` is `fixed inset-0`, and the drawer's `<aside>` carries
`transition-transform` with `translate-x-0` for its slide-over. **A transform on
an ancestor becomes the containing block for every `position: fixed`
descendant**, so `inset-0` resolved against the drawer rather than the viewport.
There is no CSS escape from that; the layer has to move.

**The rule was already written down in this codebase and I walked past it.**
`MembersPanel`'s docblock has said since Phase 4.12: *the modal is owned by
`Pantry`, which is the only place that can put one over the whole app.* Every
other modal in the app obeys it — `ConfirmDialog`, `NewHouseholdDialog`,
`ItemSheet`, `PutAwaySheet`, `PasteListSheet` — and the console's own
`AccountDeleteDialog` obeys it by accident, because `AdminConsole` renders in the
**content column** while only `AdminPane`'s nav is in the drawer.

So `Pantry` owns the flow now: both dialogs, the step, the chosen map, the busy
flag, the refusal, and `ExportPantry`. **The pane hands over a snapshot rather
than the subscription** — `{ name, households }`, taken at the press — and that
is safe for the reason the recap is: the server recomputes the whole plan from
`fateOf` and refuses a decision it was not owed, so a stale snapshot can only be
*refused*, with the server's own sentence, in the dialog. It also keeps the
query to **one** subscription and leaves the dialogs with no loading state.

**A `preact/compat` portal inside `ModalShell` was measured and rejected.** It
would have fixed every future caller in one place and costs almost nothing in
the bundle — but it makes the containing-block problem invisible again, and the
app already has one rule for this that every other modal follows. One idiom
beats two.

**A sweep found no second instance.** `AccountPreflight` and
`AccountDeleteConfirm` were the only positioned-`fixed` elements ever rendered
inside the drawer's subtree; the three other `fixed` matches in there are the
word in prose.

**This is the fifth time a browserless chain has certified something that could
not work**, after the inert `ResizeObserver`, the rail's missing *Admin* row, the
two dead hovers and the two `Delete` buttons. Typecheck, 920 assertions, the
artifact read, the class-literal diff and the ground check all passed on two
dialogs clipped to a quarter of the screen — because **every one of them asks
whether a rule exists, and none of them asks what box it resolves against.**
The ground check narrowed that gap for *colour*; nothing here sees *geometry*.
**A `fixed` element is only as fixed as its ancestors' transforms allow.**

#### And the transfer menu was cut off, by two different boxes

Reported on the same look: **the *Choose* dropdown gets cut off.** Two clipping
ancestors, and only one of them could be removed.

- **The `Needs a decision` block carried `overflow-hidden`**, which was buying
  nothing: its rows have no fill of their own — they sit on the dialog's surface
  — so the only thing that could poke past the radius is a 1px rule at the
  vertical middle, where the radius does not reach. It is gone. **Third time
  this app has paid for an `overflow-hidden`**, after the console's Members card
  and the bulk review table.
- **`ModalShell`'s card is `overflow-y-auto max-h-[90vh]`, and that one stays.**
  The pre-flight is the tallest dialog in the app, and a short window has to be
  able to reach its footer. A scroll container clips its absolutely-positioned
  descendants at its padding box, so **the popover moves layer instead**:
  `position: fixed`, placed from the trigger's measured box. That is D67's own
  sentence — *a popover belongs inside the viewport; that is the layer that
  moved* — reached again from the other side.

**`fixed` works here and would not work one component over**, which is the pair
worth holding together: a dialog card has no transform, and the drawer's
`<aside>` has one. The same three words are the fix in one place and the bug in
the other.

**`shared/menuPlacement.ts` gained `menuOrigin`.** `placeMenu` names a *corner*,
which is all an `absolute` panel needs — the browser does the arithmetic from
`left-0` or `right-0`. A panel escaping its ancestor needs the numbers, so this
turns a corner into viewport coordinates and **clamps on both axes**: a corner is
chosen from the panel's *cap* and the panel is often shorter, and a trigger can
sit closer to an edge than the 12px inset all by itself. `client/hooks/useFixedMenu.ts`
is the two reads of `window` around it, and **it closes the menu on scroll and
resize** — a fixed panel does not travel with a scrolling ancestor, so rather
than pretend otherwise it goes, which is what makes *the trigger cannot move
while its own menu is open* true here rather than merely assumed.

**The console's own pre-flight had the identical bug and nobody had reported
it** — same construction, same shell, same `overflow-y-auto`. It is fixed with this one.

**Ten new assertions, and all three rules proved by mutation**: dropping the
viewport clamp fails 4, hanging *up* from the trigger's bottom rather than its
top fails 1, and right-aligning to the trigger's left edge fails 2. The
assertions are written as **geometries** rather than as expected coordinates
alone — `fixedFits` recomposes the panel's rect from the placement and asserts it
is inside the viewport, so a rule returning plausible numbers that still clip is
caught — and the reported case is in there by its real numbers.

#### And then its last row was cut off, by a coin toss a variant always wins

Reported next: **the delete row's second line is cut off on desktop and not on a
phone.** That asymmetry *is* the diagnosis.

The row was `${PAGE_MENU_ROW_DANGER} h-auto py-2 items-start` — three utilities
appended beside a constant that already sets two of those properties. **Two
utilities for one property is a coin toss settled by sheet order**, which the
console sweep recorded twice and this is the third. Read off the built sheet by
byte offset: `.h-11` lands at 17300 and `.h-auto` at 18401, so the base height
lost and the row grew — but **`.md\:h-9` is in a media block at 75371**, after
both, so above `md` the row was clamped to 36px and the second line was clipped.

**A variant always beats a base utility**, because variants are emitted after the
base layer. That is what makes this class of bug look like a *desktop-only* or
*mobile-only* problem when it is neither.

Both call sites are **whole constants** now, which is the remedy this file
already names: `PAGE_MENU_ROW_DANGER_STACKED`, and `PAGE_MENU_FIXED` for the
second collision in the same component — `PAGE_MENU` carries `absolute` and
`fixed` was appended over it. That one was going the right way *by luck*
(`.absolute` at 10385, `.fixed` at 10427), which is the worst state for a rule
to be in.

**A sweep for the whole class of bug now exists**, over every
constant-plus-literal class list in `client/`: it expands the constants, groups
utilities by the CSS property they set, and reports a collision — naming the
variant explicitly when one is involved, because that case is a certainty rather
than a toss. **143 sites, 11 collisions**, of which mine were two.

**One more was real and is fixed**: the paste sheet's *Common items* row appended
`w-[calc(100%+20px)]` over `PAGE_MENU_ROW_ON_SHEET`'s `w-full`, and lost the toss
by 249 bytes — so it has been 20px short of its own negative margins since D67.
It takes an inline width now, which beats any class outright.

**The remaining nine are left alone, and that is a scope decision.** Eight are
`rounded-*` pairs differing by 1–2px across the console, the drawer and three
sheets, and one is a dead `h-9` that `PAGE_MENU_ROW` overrides to a *larger*
touch target. Fixing them means quietly restyling eight components on the way
past a dropdown, which is the trade D54 already refused for a hairline. They are
on the record here instead.

**And the check that found them re-taught the standing lesson on itself.** A
hand-written `grep` for `.w-\[calc...\]` reported it **absent** from the sheet;
the class-literal checker, which unescapes the sheet's own selectors, said it was
there and was right — the hand-written pattern had the `%` and `+` escaping
wrong. **Seventh round.** Print the selector; never hand-write the escaped form.

#### And then the list inside it could not be scrolled — 2026-09-01

Reported next, and clarified in the same breath: **the inner list is cut off,
not the dropdown.** That distinction is the whole diagnosis — the panel was
placed correctly and sized correctly, and its contents were unreachable.

**`useFixedMenu` closed the menu on its own scroll.** The listener is
`window.addEventListener('scroll', onClose, true)`, and `capture` is there for a
real reason: a scroll inside the dialog card does not bubble to `window`, and a
`fixed` panel does not travel with a scrolling ancestor, so it has to go. **But
capture also sees the panel's own scroll events**, so the wheel over the list
dismissed the thing being read. `overflow-y-auto` was on the box the whole time
and working; it never survived a frame.

- **The fix is one `contains`.** The panel is a DOM descendant of the trigger's
  wrapper however far `fixed` has moved it on screen, so a scroll originating
  inside it is the menu being read rather than the page moving under it. The
  outer rule — *anything that moves the trigger closes the menu* — is unchanged,
  and it is what makes *the trigger cannot move while its own menu is open* true
  rather than merely assumed.
- **It surfaced only when a household got a fifth candidate.** The menu is
  header + people + divider + delete row: three candidates is ~249px against the
  280 cap and nothing overflows, five is ~285 and it bites. Riverside Kitchen
  went from one member to six the same morning. **A cap that has never been
  reached is a scroller that has never been tested.**
- **The panel is a flex column now and only the people scroll.** Scrolling the
  whole box would take the header *and* the crimson row that destroys something
  below the fold, which is the one row nobody should have to go looking for.
  **`min-h-0` is the load-bearing utility**: a flex item's floor is its content
  until it is told otherwise, so without it the list never shrinks and the panel
  overflows exactly as before. The scroller takes `role="none"` so the rows stay
  the menu's own children rather than becoming a group inside it.
- **The console's copy had both halves of this too**, same construction, same
  shell — fixed with it.

**One thing on the same path is knowingly left alone**: `menuOrigin` positions
an **upward**-opening panel from its *cap* rather than its real height, so a
menu with one or two candidates that flips up floats a gap above its trigger.
The clean fix is to anchor the panel's bottom instead of its top, which changes
the shared placement contract and its assertions; nobody has reported it.

#### The account menu stopped repeating you — 2026-09-01

Reported on the same look: **the popup from the profile row at the bottom
should be *Your account ›*. No reason to repeat the user profile name.**

The identity row shipped as the avatar, the name and the email over again, and
the component's own comment defended it — *the same row one level further in, so
it reads as continuing rather than as arriving somewhere new*. **The row you
pressed to get here is that row, a few pixels below, still on screen.** A menu
that opens with a copy of its own trigger has spent its widest row saying
something you can already see; *Your account* is the only new fact in it, which
is what is behind the door.

- **All three rows are one row now** — glyph, label, `DRAWER_MENU_ROW` — and
  **only this one takes a chevron**, because only this one pushes a level. That
  mark is already spent on exactly that job by the Settings pane's *Members* row.
- **One rule instead of two.** It used to sit under the identity row, which
  earned it by being a taller card row among menu rows; three identical rows with
  a rule between each pair reads as three unrelated things. *Your account* and
  *Admin* are both places to go and now group together; signing out is not, and
  keeps the rule above it.
- **`name`, `email` and `picture` are gone from the component and from both
  hosts**, which took `accountEmail` off `CollapsedRail` entirely — the rail has
  never displayed one.
- **What it costs is the collapsed rail**, where the flyout was the one place a
  name appeared, its trigger being a bare 38px avatar. Not lost: that control's
  own tooltip is `accountName`, and the pane behind the row opens on it. **The
  drawer, where this was pure repetition, is the case that decides it**, and one
  component in two hosts stays one component rather than growing a prop.

Verified: typecheck clean, 947 assertions, client-only (the artifact is
untouched — no capsule or `shared/` file moved for either fix), every class
literal diffed against the **live** `/zero.css` off the running `sf dev` by
unescaping the sheet's own selectors and proved to refuse nonsense, and the
served bundle carrying both new panel class strings, `Your account` and
`user-round` while carrying neither old panel string. **Neither has been
clicked** — both are pointer work.

#### An administrator's account cannot be deleted

**`LARDER_ADMIN_IDS` is set out of band and nothing in the app can edit it**, so
an account the environment names is not the app's to delete: removing the rows
would leave the variable still naming an account that no longer exists, and the
next sign-in with that identity would mint a brand-new empty one holding the
console. **The fix for *this administrator should go* is `.env.server`**, which
is where the trust was granted.

- **`isAdminId(userId, raw)` in `shared/admin.ts` is about a *target*, and that
  is the whole difference from `isAdminUser`.** That one answers *may you open
  the console* and **refuses a guest outright**, because the hosted runtime hands
  an anonymous caller a guest identity and v15 leaked the space for twenty
  minutes on exactly that. This one answers *is this id written in the list*,
  about somebody who is not in the room. **Swapping the two would reintroduce
  that hole by another name**, and both docblocks say so.
- **It does not refuse guests, deliberately.** `LARDER_ADMIN_IDS` legitimately
  holds `guest:justin-…` beside the real `account:` id, so the local
  administrator is protected too — otherwise the one guard that matters is the
  one that cannot be exercised locally. A `guest:` id still administers nothing;
  that is `isAdminUser`'s question and it is unchanged.
- **It fails *open*, which is the opposite of every other rule in that file.**
  With no list nobody is named, so nobody is protected and an ordinary account
  deletes normally. A guard that refused everything on an unset variable would
  make the app undeletable by accident.
- **Both deletion paths refuse**: `deleteMyAccount` on the caller, and
  `adminDeleteAccount` on the target — the sharper half, since one administrator
  removing a peer's rows is the case the console could otherwise reach. Both
  check **before the row lookup**, so a named id that holds nothing gets the
  guard's answer rather than *that account no longer exists*.
- **The client renders the reason and never the refusal.** A thrown message is
  invisible in production (QuickJS replaces it), so the `account` query reports
  `administers` and the pane draws `ADMIN_UNDELETABLE_NOTE` from it; the console
  reads `person.admin`, which every People row already carries. The throws are
  the enforcement, not the explanation — a hidden control is one devtools call
  from a deleted account.
- **The row is absent rather than disabled, and that differs from the hold on
  purpose.** `ADMIN_WRITES_HELD` leaves its controls on screen wearing
  `PAGE_HELD` because the hold is *temporary* and the control comes back. This is
  not a hold: it is what the account **is** for as long as the environment says
  so, and a permanently dead button is a worse thing to look at than a sentence
  saying where the switch really is. D30's rule, with the sentence doing the job
  the viewer's *View only* chip does. **The console's held notice goes with it**
  on an administrator's page — a notice above a screen you could only ever read
  would be an apology for nothing.

**One mutation found dead code rather than a hole.** An `if (! userId) return
false;` in front of the lookup survived every mutation aimed at it, because
`parseAdminIds` drops blanks and *that is its stated job* — a trailing comma
cannot put `''` in the list, so nothing with no id can match one. It is gone, and
the three assertions about empty ids now pin the **composition**: deleting the
filter in `parseAdminIds` fails five, one of which is the guard's own.

**Verified against the real handlers** on a throwaway `sf dev --port 4199`:
`adminAccess` `{admin:true}` and `account` `administers: true` for the named
guest, `deleteMyAccount` refused with his rows untouched afterwards; a second
guest not in the list reporting `administers: false` and deleting normally; the
console refusing **its own caller's id** and refusing **a peer administrator's
`account:` id** — one that holds no rows at all, which is the proof the guard
short-circuits ahead of the lookup — and still deleting an ordinary account
beside them, with People going from two rows to one.

**Export arrived with it and is two features**, because the pantry is the one
thing this flow has established **is not yours**. *Download your data* is four
fields in the account pane — **four because there is nothing else**, which is the
same fact the deletion copy leans on — and *Export the pantry* is the
household's rows as CSV in Pantry settings, where scope is in the label, and it
survives your deletion. **No invite codes in the export** (D39: a code *is* the
authorization, and a live one on disk is a worse place for it) and **no join
date**, which is an omission rather than a choice — `memberships` carries no
stamp, because D44 stamped five tables and skipped this one. **Neither is a
backup, because nothing imports one back.** A pre-flight row set to *delete it*
carries *Export it first*, which is the only moment in the app where a pantry is
about to stop existing and somebody is looking straight at it — and it is a real
export rather than a message: `ExportPantry` mounts, subscribes to that
household's `pantry`, downloads once and asks to be unmounted, which **is** the
one-shot read in a client that only has subscriptions.

**Three small extractions rode with it.** `ClaimAvatar` left `RunList` as
`PersonAvatar` with a size, because the transfer trigger wanted the same face at
18px; the download became `client/lib/download.ts`, so `activityCsv` and both new
exports share one `<a download>`; and RFC 4180 moved to `shared/exportData.ts`,
because three copies of *quote everything and double an embedded quote* is three
chances to quote a comma differently.

**It contradicts `admin-console.md` in two places and this wins.** *Needs
attention* lists **awaiting deletion** and the log's `Automatic` actor is defined
as *an account deleted after its hold*; **there is no hold**, so neither state
exists. And D62's *same dialog, two places — only the title changes* is no longer
true: the app's pre-flight has two labelled groups and two screens where the
console's has a tail line and one.

**Three interaction-state defects were found and fixed, and they are the same
one.** Three cream primaries — the pane's *Done* pill, its *Get it*, and Pantry
settings' *CSV* — took `DRAWER_PRIMARY`, whose ring offsets against the drawer
gradient, while all three sit on a **raised card**. `DRAWER_PRIMARY_ON_CARD`
already existed for the install pill and is exactly this. **D45 on its fifth
component**, and the fourth time this project has shipped a control whose state
was written against the wrong ground.

**Verified without a browser**: typecheck clean, **947 assertions** (102 new,
covering all three fates and the ordering that separates the rule from any other
reading, the two groups, what the payload carries and what it must not, the
copy in every branch including the serial comma and the source group's own word,
the recap agreeing with the count, the possessive's `s`-ending form, the CSV's
names-not-ids and its A–Z, and the account file's four fields with no code) —
and **three rules proved by mutation**: testing the role before the member count
fails 10, sending the sole-member households as decisions fails 5, and defaulting
an unanswered row to *leave* fails 2. The dry-run artifact is fourteen tables /
fifteen queries / thirty-one mutations / `db.migrations: []` with `/api/status`
the only endpoint, and **`.docs/data-model.md` was diffed against it** — zero
tables, columns, mutations or queries missing. **764 class literals across
fifteen files** diffed against the freshly built
`.spacefast/zero/public/zero.css` by unescaping the sheet's own selectors —
printed, never hand-written, and **proved by injecting a nonsense class into a
file under test and watching it be reported**. The new components introduce **no
responsive variant of their own**, so there is no new byte-offset ordering to
check: everything responsive here comes from `ModalShell` and control styles that
already shipped.

The **real handlers** were driven over `POST /__spacefast/zero/run` on a
throwaway `sf dev --port 4199`, as three named dev guests at once. `transferOwnership`:
handing it to yourself refused, a nonexistent membership refused, an **editor**
refused with D20's own sentence, and the real hand-over promoting Bob and leaving
Justin an Editor. `deleteMyAccount`: **no decisions refused by name**
(*Decide what happens to Calfee Household first.*), a decision about a household
that needed none refused, a transfer naming **yourself** refused, a bogus action
refused, the same household twice refused — and **the account read back unchanged
after all five**, which is the validate-then-write guarantee measured rather than
asserted. Then the real one: Calfee handed to Alice, who is its sole owner
afterwards; the two sole-member households **gone from the space** on the admin
console's own household list; Justin gone from People entirely; his profile
answering `needsName` again; and Bob's household untouched. An anonymous caller
gets `guest` from the query and *Sign in to use Larder Log.* from both mutations.
The two cascade lists — `deleteHousehold`'s own and `deleteHouseholdRows`' —
were diffed and agree.

**This is the one that most wants a real session**: every interesting part is press-time and keyboard-time — the door, the pane's
in-place rename, the trigger's menu, the two Escapes, the typed field, the
transfer's confirm, and both downloads. **To see it locally**: the account row at
the foot of the drawer → the identity row. A second `?guest=` name in another
window is what makes the pre-flight have anything to decide.

### The console's two seams land where they were aimed — 2026-08-31

**Client only**: no schema change, no handler moved, no new class. Eleven
tables, thirteen queries, twenty-five mutations, `db.migrations` still empty.

**Both cross-links between the console's two halves went to the wrong screen.**
A member row opening an account, and an account page's household row opening
that household, were each composed at the `AdminConsole` level out of the host's
own handlers — `onOpen('')`, then `onOpenPerson(id)`, then `onSection('people')`.
**`onSection` is `goAdmin`, and `goAdmin` means *the list, from the top***: it
clears both open ids, including the one that had just been set a line above. So
a member row landed on the People **list** and a household row on the Households
**list** — the right section every time, and never the row you pressed.

- **`goAdminPerson` and `goAdminHousehold` are their own handlers in `Pantry`**,
  beside `goAdmin` rather than built out of it. They set the section *and* the
  id together and clear only the other half. **The section still has to move**:
  landing on an account page while the drawer's nav block lit *Households* would
  be the drawer saying something untrue.
- **`onCrossToPerson` and `onCrossToHousehold` are separate props** rather than
  a second use of `onSection`, so the seam cannot be reassembled at a call site
  out of parts that fight. This is *A handler written twice is a handler that
  will be changed once*, one rung up: a handler **composed** twice is a handler
  that will be composed wrongly.

**And the last member row's hover overflowed the card.** The Members card is the
one card in the console that does not clip — `clip={false}` is what buys the
role menu its popover, since a popover inside `overflow-hidden` is cropped at
the card's edge — and the price is that nothing rounds the rows inside it. The
bottom row's `hover:bg-surface-alt` squared off past the card's 20px radius.
**Only the bottom left showed it**: the role trigger's own `<span>` is unfilled,
so the right corner is the card's. The last row takes `rounded-bl-[19px]` — the
card's radius less its 1px border, which is where the inner edge actually is.

**A hover fill is the second thing `clip={false}` costs, and the first was
known.** Anything full-bleed added to that card has to round its own corners;
the rows are inset otherwise, which is why this took a real pointer to find.

Verified: typecheck clean, the artifact unchanged, and `.rounded-bl-\[19px\]` in
the freshly built `zero.css` — printed from the sheet's own selectors and proved
to discriminate against a bogus radius.

### An old row reads back `null`, and the avatar sync never ran — 2026-08-31

**No schema change** — eleven tables, thirteen queries, twenty-five mutations —
but this one touches the capsule, and it is the platform finding that matters
most since the dev-guest identity.

**`.default('')` applies to an insert and does not backfill.** Every membership
written before `memberships.picture` shipped (D55, live in v12) reads back as
**`null`**, not the schema's `''` — read off the published space through the
app's own `household` query. **And the generated row type says `string`**, with
no `| null`, so `typecheck` cannot see it: the `null` travelled through the DTO
into a Preact prop also declared `string`. Logged in
`.claude/docs/spacefast.md`.

- **It disabled the one thing written to fix exactly those rows.**
  `useAvatarSync` reads `null` as *the query has not answered* — `''` is a real
  value meaning no picture — so `?.picture ?? null` collapsed the two meanings
  and short-circuited the hook forever, **on precisely the rows it exists to
  reconcile**. The absence is now read off the **row** (`myMembership ? … : null`)
  rather than off the column, which is the distinction that was missing.
- **Four DTOs coalesce with `?? ''` at the capsule boundary**, so the `null`
  stops at the one place that can see the column at all rather than at each of
  the client's readers. Every additive column this project has shipped assumed a
  declared default is what an old row reads back as; ours all normalize `''` and
  `null` identically **by luck**, and this one did not.
- **The rule that generalises: a column added after rows exist is nullable, and
  the type will not say so.** Coalesce it where it is read out of the database.

**And `sf dev` now populates the column, so it can be looked at.** `sf dev`
issues no `picture`, so every local membership held `''` — which left the
drawer's foot row (drawn from the client's own identity) showing a face while
the Members pane, the Settings trio and all four admin surfaces showed letters.
That reads as an intermittent bug and was a missing dev switch.
`devAvatarUrl()` in `shared/avatar.ts` is the fifth, **fenced on a named dev
guest**, an identity a published space cannot mint — the same guarantee
`adminWritesHeldFor()` already rests on. **A hash, never an address**: the
finished digest, read off the live space's own `auth.picture`, so no address is
compiled into the capsule and nothing needs `shared/sha256.ts`. It must stay
equal to what `client/lib/devIdentity.ts` hashes at boot, or the two faces
differ and `useAvatarSync` writes on every load instead of settling. Only a
guest named `justin…` gets one, so `?members` still shows the mixed row a real
household is. **Take it out with D14.**

**It reveals rather than invents** (D56's rule): `ctx.auth.picture` **is**
populated on the hosted runtime, confirmed against the live space on
2026-08-31, so what renders locally is the value production really writes.

### Empty results — 2026-08-26

`EmptyState.tsx` is the app's one empty screen for the content column, drawn
from the first-run board: Playfair italic 27px, a 420px body, at most one
action. Before it, only the empty household got that treatment and every other
empty result got `Nothing here yet.` in 14px grey.

`emptyCopy()` in `Pantry.tsx` picks the words **and** the action together, so an
action can never clear a filter the title did not name. **A status chip on its
own gets no button** — the chip you pressed is still on screen and now reads
`0`. One term or one search names itself and clears itself; anything more says
so and clears everything.

**`?signedout` is a dev-only switch and the only way to see any of this
locally.** D14's loopback hole makes every local visitor a signed-in dev guest,
which puts the whole signed-out surface out of reach under `sf dev`. It only
ever *removes* access and is ignored off loopback. Take it out with D14.

**`POST /__spacefast/zero/run` calls a query by name over plain HTTP** and is
now the cheapest honest verification we have — it exercises the handler the
client calls rather than a copy of it in a throwaway endpoint. It needs the
bearer token **and** the bootstrap cookie; the cookie alone answers
`{"error":"unauthorized"}`. All five `invitePreview` branches were checked this
way. Undocumented; written up in `.claude/docs/spacefast.md`.

**The sign-in function is exported under one name and it is the wrong one.**
`@spacefast/zero/client` resolves to `dist/public-client.d.ts`, which exports
only `signInWithGoogle` — Lakebed compatibility, and it goes nowhere near
Google. `client/index.tsx` aliases it to `hostedSignIn` on import (D47). Do not
"fix" the name back, and do not rename the alias to `startSignIn`: that is
already the app's own handler in the same file, and the collision compiles into
a recursive call.

**The item grid is fluid and the drawer docks at 1120px, not `md`.** Cards are
`md:grid-cols-[repeat(auto-fit,minmax(320px,1fr))]` — tracks always divide the
row exactly, so the gutter is 16px everywhere and there is no remainder. Two
alternatives were built and reverted: capping the card inside a `1fr` track puts
the remainder *between* cards (104px at 1440), and capping the track at 420 puts
it at the right edge. Collapsed cards match via `min-h-[188px]` + `mt-auto` on
the quantity row, **not** `align-items: stretch` — a grid row is sized by its
tallest item's content, so an open card would drag its row down.

**Never pair `min-[1120px]:` with a `md:` class on the same property** —
Tailwind emits arbitrary variants first, so `md:` wins at 1120 and the rule
silently does nothing. Use a bounded `md:max-[1120px]:` range instead; pairing
with a base utility is fine. **`min-[1120px]:` is derived from the 320px card
floor and must be re-derived if that changes.** Docking spends 340px and must
not cost a column; with a 336px track only 1064–1128 and 1400–1464 survive, and
no Tailwind breakpoint is in either (`lg`, `xl` and `2xl` each lose one). The
number lives in **three** places — the class literals in `Drawer` and
`CollapsedRail`, plus `DOCK_PX` in `Pantry`. Tailwind resolves a class by
scanning for a static string, so it cannot be interpolated and the duplication
is unavoidable; keep them equal.

**`drawerOpen` only means anything below the dock, and has to be cleared above
it.** Two callers set it at any width (the rail's expand control, and the
blocked-leave dialog's *Open Members*) because below the dock it is the only
thing that reveals the drawer. Above the dock the set looks like a no-op and is
not: the flag persists, and narrowing the window turns it into a `fixed`
slide-over that nothing in the layout accounts for, so only the 68px rail holds
the column open and the item grid runs underneath it. `DOCK_PX` exists for the
effect that clears it. Below it the 68px rail *is* the
drawer regardless of `drawerCollapsed`; `CollapsedRail` renders unconditionally
and hides itself above the threshold via its `autoOnly` prop.

**Never declare a component inside another component.** `CollapsedRail` had
`Control` and `Tip` nested in it, which gave them a new function identity per
render — Preact reads that as a new component *type* and rebuilds the whole
subtree, so any re-render between a `pointerdown` and its `click` swapped the
element out and dropped the click. It presented as "the rail needs two clicks,
sometimes"; the 400ms tooltip timer was what landed in the gap. Both are at
module scope now and take a `chrome` prop.

**The rail owns flyout dismissal, not `RailFlyout`.** A press anywhere outside
the open panel closes it — including on the rail itself — so the rail keeps a
`dismissed` ref recording what the current gesture just closed, and `toggle()`
compares against that rather than against `menu`, which `pointerdown` has
already nulled.

`theme.json` gained `focus-dark` and `drawer-danger`. **`theme.json` is strict
JSON — no comments**, unlike `sf.jsonc`; a `//` line stops `sf dev` from
starting at all.

**Verified without a browser** (there isn't one): the capsule compiles and
reloads, every new utility class and both tokens are in `/zero.css`, the term
counts and refusal sentence were exercised through a throwaway endpoint, and the
artifact still shows nine tables, sixteen mutations, **zero migrations**.

Phase 4's typography question is also closed, in the opposite direction from
the one the notes predicted. Zero has no webfont mechanism — `theme.json`'s
`fontFace` is discarded silently — but the `--font-disp` / `--font-sans` /
`--font-mono` tokens it emits are already complete stacks, so the only missing
piece is a stylesheet. `client/lib/fonts.ts` appends a Google Fonts `<link>`
for Playfair Display and Karla at boot (plus IBM Plex Mono, interim — the
Cellar spec has no monospace, but ten `font-mono` sites still reference one)
([D31](../.docs/decisions.md#d31-webfonts-are-declared-by-the-client-at-boot-and-served-by-google)).
The Cellar reskin's token layer is in for **both** themes — see Phase 4.5 in
the roadmap. Layout is untouched: the drawer, item card, and add-item sheet are
still the pre-Cellar components, so the app currently reads as the same
interface in a new palette.
The family names there must keep matching the `theme.json` literals exactly —
that is the entire contract between the two files. `client/lib/appIcon.ts` does
the same trick for the page title, favicons and `theme-color`: the generated
shell exposes only a title, and `sf dev` hardcodes even that, so all of it is
appended to `document.head` at boot. The icons are inlined as data URIs
because `sf dev` serves no project static files. Self-hosting was built first
and rejected: `sf dev` serves no project static files, so a self-hosted face is
invisible locally and appears only after a publish. **Confirmed rendering under
`sf dev` on 2026-08-25** — the whole reason for choosing a remote URL was that
this check is possible at all.

### The app is installable — 2026-08-27

`site.webmanifest` at the project root, linked from `installAppIcon()` — the
**fourth** thing appended to `document.head` at boot, after the webfont
stylesheet, the icons and the two metas. **No new artwork**: the 192, 512 and
maskable-512 PNGs staged with the icon set in August are correct. The maskable
one was measured, not assumed — the glyph is a 181 × 226 box centred in the 512,
so the furthest ink is 145px from centre against the 205px the 80% safe zone
allows.

**The manifest cannot be a data URI, and that is the one place it departs from
how the icons get past the missing head hook.** `start_url` and `scope` resolve
against the **manifest's own URL**; a `data:` URL is no base to resolve `/`
from, so both would fall back to the page the app was installed from — often
`/?join=<code>` here, pinning an expiring invite as the front door.
`purpose` is split across two files and **never combined into `"any maskable"`**:
the `any` pair keeps its 22% rounding, the maskable is full bleed, and one file
claiming both would put those rounded corners inside Android's mask to be
cropped a second time.

**The `theme-color` meta became a pair and follows the *app's* theme.** Dark is
`#1F1912` — `canvas` exactly; light stays on the oat `#E2D5C0`, a deliberate
half-step darker than the page. **It is not a `media` attribute**, because the
app's theme stops being the OS's the moment a device overrides it (D25), and an
installed app has no tab strip to absorb the difference — the status bar sits
directly on the page. `appIcon` exports `setThemeColor`; the boot value reads
`prefers-color-scheme` so there is no flash, and **exactly one owner sets it
after**: `Pantry` while signed in, the entry's `App` only while signed out.
Effects run child-first, so an unguarded `App` would overwrite the override with
the system value a tick later. The **manifest's** `theme_color` and
`background_color` cannot vary by scheme at all, so they are the light values
and the cold-launch splash is light for everyone.

**Two undocumented platform rules turned up, both in `.claude/docs/spacefast.md`:**

1. **`sf publish` mirrors the project root selectively.** `LICENSE.md` ships and
   `README.md` does not; `package-lock.json` ships and `package.json` does not.
   There is no stated rule — run a dry run and list
   `.spacefast/zero/public/`.
2. **Being in the payload does not mean it serves.** `theme.json` and
   `sf.jsonc` are staged and **404 in production**, because the edge hides the
   platform's own config on top of D29's dot-prefix 403. So `--dry-run` is
   necessary evidence and not sufficient.

**A manifest has no local proxy at all.** `sf dev` serves no static files, so
`/site.webmanifest` comes back as the SPA shell and Chrome logs a manifest parse
error on every local load — harmless, and unavoidable without a dev-only branch
that would make the thing untestable everywhere. Whether it serves, with what
content type, and whether a Pixel offers to install it were **post-publish
checks**. **Two of the three are now answered, on v11**: `/site.webmanifest`
serves `200 application/manifest+json; charset=utf-8` (769 B) and all three
icons serve as `image/png`, so the edge maps the extension correctly with no
configuration. **Installing it needs a phone**, which is the half a curl
cannot answer.

**And as of 2026-08-28 the app finally offers to be installed** — one row in
Settings › Preferences, D54. See *The app now says it is installable* above.

### Every ordered row carries its own stamps (D44) — 2026-08-27

**The rule: a timestamp this app sorts by is a timestamp this app writes.** The
platform's `createdAt` and `updatedAt` are readable but **cannot be set by app
code** — an insert supplying one is refused outright, *"Zero manages
items.createdAt; app code cannot set it directly"*, confirmed against a running
capsule rather than inferred from the docs' "those names are reserved". So
neither survives a re-insert, and undo is a re-insert (D17). **Do not try
again.**

**The second additive schema change since Phase 2**, and the largest: nine
columns across five tables, all ISO 8601 UTC strings defaulting to `''`. Nine
tables and sixteen mutations still; applies on the next publish with no flag,
exactly as `households.ink` did.
[D44](../.docs/decisions.md#d44-the-app-writes-its-own-timestamps-because-the-platforms-cannot-survive-an-undo)
has the table.

- **`items`, `locations`, `types`, `stores` get both** `addedAt` and
  `changedAt`. **`households` gets `addedAt` only** — nothing orders households
  by recency and a rename is not an event anything reacts to.
- **`shared/stamp.ts`** owns every rule: `stampFrom`, `normalizeStamp` (falls
  back to now for anything unparseable and **clamps a future stamp**, so a bad
  value cannot pin a row to the top of a list forever), `addedAtOf`, and
  `changedAtOf`, whose fallback chain is `changedAt` → `addedAt` →
  `createdAt`. `npm test` is at 198 assertions.
- **`changedAt` is bumped by every mutation that writes a visible field** —
  `updateItem`, `adjustQty`, `updateTerm`. **`adjustQty` is not exempt**: a
  quantity is information about the item, and the hot path being hot is not a
  reason for it to lie.
- **Nothing reads `changedAt` yet**, and that is deliberate. The column has to
  exist before there are rows to stamp — a row written without one never gets
  one, because nothing backfills.
- **The fallbacks are permanent, not transitional.** Every row that exists on
  the published space today holds `''` forever.
- **Both create mutations take stamps beside the draft, not in it.**
  `ItemDraft` and `TermDraft` omit them, because no form holds one — undo is the
  only caller that passes any.
- **`createHousehold` seeds fifteen terms through `insert`, not `createTerm`**,
  so it is the one path that could leave a term unstamped. It shares one stamp
  across all fifteen: they arrive together, and staggering them by a millisecond
  each would imply an order that isn't real.

**Term lists are A–Z now**, sorted once in the `pantry` query so the drawer's
filters, the item sheet's chips and the shopping list's cards cannot disagree.
They were in `collect()` order — seed order, then creation order. This also
closes what D36 recorded as "a restored term appends". `byName()` is in
`shared/term.ts`; `termDto()` in the capsule is the one place the three
taxonomies' shared DTO shape is written down.

**Not covered:** `memberships`, `invites`, and the join tables. Nothing orders
them by time today, and a column is permanent — if any of them grows a
chronological view, it needs stamps *before* the rows that would want them.

Verified against the real handlers over `POST /__spacefast/zero/run`, on a
**second `sf dev` started with `--port 4199`** so the one already running was
undisturbed: three items added in order and the middle one removed and undone
(`addedAt` order keeps it in place, `createdAt` order — the bug — puts it
first); seeded terms A–Z and stamped; `changedAt` moving on `adjustQty` and
again on `updateItem` while `addedAt` holds still; a removed item and a deleted
term both restored with **both** stamps byte-identical and a visibly newer
`createdAt`; a renamed store re-sorting alphabetically.

### Local is a named guest now, and production is authenticated accounts only — 2026-08-30

**The fix for the leak above, done properly rather than by deletion.** Nothing
is published: this is on `master`, verified against a throwaway `sf dev`, and
the live space is still v16.

**The requirement was two things at once** — every feature testable locally,
including the console and multi-person households, and a published space where
only an authenticated account has any permission at all. The old arrangement
achieved neither: it let a stranger in *and* it could not produce a second
person locally.

#### The discovery that made it possible

**`sf dev` mints an identity from a `?guest=<name>` parameter.**
`namedGuestAuth` in the CLI's `zero-dev-server.js` turns `?guest=alice` into
`guest:alice` / `Alice` / `guest` / not authenticated. Undocumented, and it is
the whole answer: **two names are two people**, so invites, roles, the members
pane and the console's People list can all be exercised on one machine — which
this file has said for months was impossible without the published space.

**And production ignores the parameter, which is the load-bearing fact.**
Checked against the live space on 2026-08-30: `?guest=alice`,
`?stattic_zero_guest=alice` and `?guest=local` all returned the *same* identity
as no parameter at all. So a named guest can only come from `sf dev`. **Re-test
that if any of this is revisited** — it is the assumption everything below rests
on, and it is the kind of assumption that broke last time.

#### The rule

`shared/identity.ts` is rewritten around one idea: **`guest:local` is the only
identity a published space can mint, so it is the one that is never signed in.**

- **`ANON_GUEST_NAME`** is `'local'`, excluded inside `parseDevGuests` rather
  than at the call site — a rule enforced in one place cannot be forgotten in a
  second. Naming it in `LARDER_DEV_GUESTS`, with or without the `guest:` prefix,
  does nothing.
- **`isSignedIn(auth, devGuests)`** is *a real account* (`! isGuest &&
  isAuthenticated`, both required so a future identity setting only one is
  refused) **or** a named guest the environment lists.
- **`isAdminUser(auth, adminIds, devGuests)` is built on `isSignedIn`** instead
  of repeating its conditions. There were two descriptions of *who is a person*
  in this codebase and they disagreed about `guest:local` in the direction that
  mattered. Now there is one.
- **`signedIn(ctx)` and `administers(ctx)` in `server/auth.ts` are what handlers
  call.** The rules need `ctx.env` now, and threading it through fifteen call
  sites by hand is how one of them ends up passing the wrong variable.

**`LARDER_DEV_GUESTS` ships to production and is safe by construction.**
`.env.server` is the platform's only env source — there is no
`.env.development`, checked — so it uploads whatever we do. It cannot open
anything, because a published space cannot mint the identities it names.
**Use random suffixes anyway** (`justin-9bfb4160`): the exclusion of `local` is
the defence that holds today, and the suffix is what keeps this safe if the
platform ever starts honouring `?guest=`. Two independent things would have to
go wrong instead of one — which is exactly what the old bypass lacked.

**`LARDER_ADMIN_IDS` holds both spellings of one person**: `account:LDV6…` on
the published space, `guest:justin-…` locally. Justin's real id was read off the
console's own People row on v15.

#### What this costs, and the screen that pays for it

**A bare `sf dev` is nobody now.** `DevGuestCard` is what a loopback visitor
with no `?guest=` sees: the URL to use, and where the name has to be listed.
Without it a local server would show the marketing page with no explanation,
which is the worst version of a correct security change. The client gate in
`client/index.tsx` moved with it — it accepts a *named* guest, never `local`.

**`?demo`, `?members`, `?signedout` and the dev Gravatar are unchanged** and
still loopback-only. They were never the hole: the hole was server-side, and a
client gate is not security.

#### The hold is a production hold now

`ADMIN_WRITES_HELD` blocked the console's six writes everywhere, which made the
deletion flows untestable anywhere — defeating the point of local testing.
**`adminWritesHeldFor(auth)` exempts a dev guest**, and that is exact rather
than approximate: a `guest:` id can only come from `sf dev`, so *exempt from the
hold* and *running locally* are the same set.

So **delete a household locally and watch the cascade and the audit row; you
cannot do it on the live site.** `adminAccess` reports `writesHeld` alongside
`admin`, and the console renders from that answer rather than reading the
constant — the client must not hold a second copy of a security rule. It
defaults to *held* while the query is in flight, which is the safe direction.

#### Verified, and how

`npm test` at **569 assertions**, with the identity and admin blocks rewritten
as the tripwire: the anonymous guest refused with no list, with a list, when
named as `local`, and when named as `guest:local` in **both** variables at once
— which is the worst thing anybody could write in `.env.server`.

Driven against a throwaway `sf dev --port 4199`, which is the part that matters:

| as | `adminAccess` | console reads | admin write |
|---|---|---|---|
| no `?guest=` (production's stranger) | `admin:false` | `denied` | refused |
| `?guest=justin-…` (listed, in `LARDER_ADMIN_IDS`) | `admin:true` | ready | **succeeds**, audit row written |
| `?guest=alice-…` (listed, not an admin) | `admin:false` | `denied` | refused |
| `?guest=…-unlisted` | not signed in | `denied` | refused |

And a **complete two-person round trip on one machine**, which had never been
possible: Justin names himself, creates a household, mints an editor invite;
Alice previews it, redeems it, and is refused `createInvite` as an editor —
D20's capability matrix running for real rather than in a unit test. The console
then lists both people, with `admin=true` on one row and `false` on the other.

### The dev-guest identity is what production hands a stranger — 2026-08-30

**v15 leaked the admin console's data to anyone on the internet for about twenty
minutes. v16 closed it.** This is the most important thing in this file about
how to verify anything.

**What happened.** `isAdminUser` opened with `if (isDevGuest(auth)) return
true;` so the console could be clicked under `sf dev`. Immediately after
publishing v15, a probe of the live space with **no credentials at all** —

```bash
curl -s -X POST -H 'content-type: application/json' \
  -d '{"op":"query.run","name":"adminAccess","args":[]}' \
  https://larderlog.view.fast/__spacefast/zero/run
```

— answered `{"admin": true}`, and `adminSummary` returned every household,
person and item count in the space. `POST /__spacefast/zero/run` exists in
production, needs no token, and **the hosted runtime hands an unauthenticated
caller `guest:local` / `Local` / `guest` / not authenticated** — byte-identical
to what `sf dev` issues, because the SDK's `currentGuestName()` defaults to the
literal `'local'`.

**The fix is one line and it is the absence of a line.** `isAdminUser` no longer
has a dev-guest branch at all: a guest is never an administrator, whatever
`LARDER_ADMIN_IDS` says. That also makes it safe for the list to contain
`guest:local`, since that id only ever arrives attached to `isGuest: true`.
**The console is therefore unreachable under `sf dev`** — flipping the function
is a deliberate local edit that must never ship, and four assertions in
`npm test` exist to stop it coming back.

**The hold is what stopped this being catastrophic**, and that is luck rather
than design. `ADMIN_WRITES_HELD` went in an hour before the publish; without it,
`{"admin": true}` for anonymous callers would have put `adminDeleteHousehold` on
the open internet.

#### The verification lesson, which is the point of this entry

**The bypass was checked, and the check was good, and it answered a question
nobody had asked.** On 2026-08-27 a keyed probe reported `schemes ["account"]`
and `anyDevGuest false` on production against `sf dev`'s `["guest"]` and `true`
— it was even validated for discrimination by running it where the hole was
known to be open. All of that is sound. But it enumerated **stored membership
rows**: who had ever signed in. It said nothing whatever about **what identity
an anonymous request is handed**, which is the actual condition, and that
distinction survived three months and a dozen readings of the comment.

- **Ask the runtime, not its data.** A question about what a request receives
  is answered by making a request.
- **A bypass keyed on an identity is only as safe as your knowledge of every
  identity the runtime can mint** — and nothing here had ever asked the runtime
  that directly.
- **This is the fourth time a check certified something it could not see**,
  after the inert `ResizeObserver`, the rail's missing *Admin* row, and the two
  dead hover states. The first three were browserless checks missing behaviour.
  **This one is different and worse: the check ran against production, passed,
  and was about the wrong noun.**

#### Closed the same day — see *Local is a named guest now* above

**`isSignedIn` had the same bypass. It is gone.** What follows is what was true
for the few hours between the two changes, kept because the scope analysis is
the thing to redo if this is ever reopened.

**`isSignedIn` had the same bypass.** An unauthenticated
caller passes it, so anybody can act as user `guest:local` on the published
space: `households` answers them `no-household`, and `createHousehold` would
work. **No real user's data is exposed** — every household read resolves through
`memberships`, and that identity holds none — so the exposure is anonymous
writes and whatever any *other* anonymous caller created under the same shared
id, not a breach of Justin's pantry.

It was left in deliberately rather than fixed in the same publish: **removing it
makes `sf dev` unusable**, since the CLI ships no sign-in flow and every local
request is that guest. That is a development-halting trade and a decision, not a
patch. The options are a real local sign-in stub from the platform, a
`ctx.env`-gated dev flag that is scrubbed before publishing, or accepting that
local work needs the bypass and narrowing what a guest may do. **Do not close
this by deleting the branch without deciding how `sf dev` works afterwards.**

### Publishing works plainly again, and v14 is live — 2026-08-29

**Phases 3 through 4.9 are published.** `sf publish` completed for the first
time since v2: **v4**, `ver_d80a395f07144ce6863ba75b212a1486`, 71 files, 18
seconds. The platform's `finalize` / `runtime_api_not_found` failure — which
killed v3 on 2026-08-25 and wedged three spaces on 2026-08-24 — **is fixed on
their side**. Nothing here changed to cause that.

Verified again on **v14**, and this is the standing checklist: `GET /` 200,
`/api/status` → `ok`, `/client.js` (378 KB) and `/zero.css` (77 KB) serve,
`/site.webmanifest` serves as `application/manifest+json` with all seven
`/icons/*`, **D29 holds** (`/.claude/CLAUDE.md`, `/.docs/decisions.md`,
`/.env.server`, `/.spacefast/state.json` all 403), `theme.json` and `sf.jsonc`
404 while `LICENSE.md` and `package-lock.json` serve, every class literal in
`client/` is in the **live** `/zero.css`, and all three new columns migrated
additively with no flag — as D44's nine columns, `households.ink`, the
`profiles` table and v12's four did before them.

**Cheaper than curling the live space for the bytes: hash the payload against
it.** `.spacefast/zero/public/` holds the *real* `zero.css` and `client.js` that
ship, so a class check can read that file rather than bootstrapping `sf dev` —
and after the publish, `shasum` on both sides proves the live space is serving
exactly what was built. All three of `client.js`, `zero.css` and
`site.webmanifest` matched byte for byte on v13.

**The maskable icon is `icon-maskable-512.png`.** A check that curls
`/icons/maskable-512.png` gets a 404 that looks like a missing asset and is
only a wrong filename. All seven icons serve; list
`.spacefast/zero/public/icons/` rather than typing the names from memory.

**Read `plan`, not the footer, to confirm a migration applied.** `sf db` prints
`Pending operations: 9` after a successful nine-column migration — it is
counting the version's `migrations` array, which is the changelog of what this
migration *did*, not a queue of what is outstanding. The real answer is
`--json` → `data.plan`: `applied: true`, `pendingOperationCount: 0`, and
`appliedSchemaHash` equal to `schemaHash`. **The human-readable output says the
opposite of the truth here**, and the same trap sank the D42 check, which read
the declared `tables` list and concluded `ink` had migrated — right answer,
wrong evidence.

**The two hashes sit at different depths, and the obvious read is `undefined`.**
It is `data.schemaHash` but `data.plan.appliedSchemaHash` — so
`data.plan.schemaHash` is `undefined`, and comparing that against the applied
hash reports a **spurious mismatch on a clean migration**. That happened on the
v11 check and cost a round trip on v12 as well. Print the `plan` keys rather
than assuming them. `invitePreview` answers an unauthenticated caller
over `POST /__spacefast/zero/run`, which **exists in production too**, not just
under `sf dev`.

**The `x-spacefast-rationale` blockade is over, as of 2026-08-29.** A plain
`npx sf publish` now works, first try. **v13 went out with no shim, no
`NODE_OPTIONS` and no out-of-band header**, ending a four-day workaround that
every publish from v4 to v12 depended on.

**It was not fixed the way this file predicted.** The prediction was that npm
would ship a CLI with `--rationale` or `SPACEFAST_RATIONALE`. **Neither
exists**, and both were checked against the new release *before* publishing:
`spacefast@0.2.2` still has no `SPACEFAST_RATIONALE` among its env vars, its
whole `x-spacefast-*` vocabulary is `client`, `client-capabilities`, `country`,
`idempotency-principal`, `language`, `runtime`, `version` — **`rationale` is
still not a header this CLI can send** — and `sf publish --help` lists no flag
for one. So **the platform stopped asking**; the requirement was dropped or is
now satisfied server-side. Do not read this as "the CLI caught up".

**The CLI is on `spacefast@0.2.2` now**, up from 0.0.26, and `@spacefast/zero`
moved with it. That jump is what to re-do if this ever regresses — and it was
safe for a reason worth repeating: **the compiled capsule was diffed across both
compilers before publishing** (tables, every column with its type and default,
indexes, queries, mutations, endpoints, migrations, runtime) and came back
**byte-identical**. The only payload difference was the content-hash directory
holding the platform modules. **Diff the artifact across a toolchain change
before trusting it**; it costs one dry run.

**The shim is retired, and this is what it was**, kept only so it can be rebuilt
if the requirement returns: a `fetch` wrapper loaded with `NODE_OPTIONS=--import`
that added a **truthful** rationale to `*.spacefast.com` requests. Two things
the rewrite had to get right, both learned on v11. Match the host with
`/(^|\.)spacefast\.com$/` and not a bare `includes('spacefast.com')`, or a
lookalike domain would be handed the rationale too. And seed a `Headers` from
the incoming `Request`'s own headers before setting anything, because passing
`init.headers` to `fetch` **replaces** rather than merges — get that wrong and
the CLI's `authorization` is silently dropped, which presents as an auth failure
rather than a shim bug. Spec-faithfulness matters in one place: when
`init.headers` *is* present it must win outright, because that is what `fetch`
itself does. Test against a stubbed transport before pointing it at a real
publish.

**If it ever comes back, the rationale must be true.** It exists so an
agent-driven mutation is attributable. Do not misrepresent the caller to dodge
it — `SPACEFAST_CLIENT` feeds `x-spacefast-client` and would do exactly that.
Supplying the metadata is compliance; hiding it is not.

**Two things the new CLI does that the old one did not.** Uploads are
**incremental** — v13 reported `Files 125` and `Uploading files 34 files`, so
those two numbers disagreeing is normal and not a truncated payload. And the
version record carries **git provenance nothing was asked for**: the commit URL,
branch and repository, with the commit message used as the changelog when `-m`
is omitted. Pass `-m` to say what the version actually carries, since one commit
message rarely describes a whole publish.

**`--dry-run` still is not sufficient, in a new way.** The real publish printed
`Warning: ignored 2 unsupported file(s) on this plan:
.claude/docs/pantry-tracker-mockup.jsx, .idea/x3p0-larder-log.iml` — *after*
creating the version, and the dry run said nothing about it. Neither file
matters here, but the rule is unstated and the warning arrives too late to act
on. This is the second documented case of a dry run being necessary and not
sufficient, after staged-but-404ing `theme.json`.

The full write-up is in [`.claude/docs/spacefast.md`](docs/spacefast.md).

### A term's ink is a token **or** a legacy hex, and both must render — 2026-08-27

**The bug that looked like a device bug.** The term composer's 26px swatch — the
button beside the name field that opens the picker — rendered as blank space on
one phone and correctly on another. It was never the phone. The two were signed
in to **different households**, and the one that failed was seeded before D32.

`normalizeInk` deliberately stores **either** a colour token **or** a legacy
`#rrggbb`. `termColorFor()` resolves only the token half and returns
`undefined` for a hex; `TermRow` fell back to `'transparent'`, which is
invisible three times over — no fill, an inset ring already painted in the
panel's own colour, and an outer ring in the colour that had just gone
transparent. Pressing it showed a ring because the *open* state's ring is the
only one with a colour of its own. Fixed by using `themed()`, which has the
legacy branch, and is why every chip on the page rendered those terms correctly
the whole time.

**The rule: anything that turns a stored `ink` into a colour must handle both
forms.** `termColorFor()` is a **token lookup, not an ink resolver** — reach for
`themed()` or `entityColorFor()` unless you are iterating the palette itself.
Audited on 2026-08-27: `chipDot()` already falls through to the raw hex,
`ColorPicker` only ever maps `DEFAULT_PALETTE` so its lookups always resolve,
and `HouseholdTile` / `HouseholdIdentity` are safe for a different reason —
`toHouseholdInk` **refuses** a hex, so a household's ink is always a token or
`''` resolved upstream by `householdInk()`.

**Two wrong guesses came first, and both shipped.** `h-dvh` (the picker was
supposedly below the mobile fold — it was on screen and pressable) and a
document-level `color-scheme` meta (Android auto-dark — it does not make things
transparent). Both are correct changes on their own merits and were kept. **The
lesson is the one this file already gives:** the reporter's own words held the
answer — *"the colour swatches themselves work correctly, it's just the button
next to the input"* — and two publishes were spent before that detail was asked
for. **Ask what still works before theorising about what does not.**

### The hosted runtime is not the engine `sf dev` runs — 2026-08-27

**This is the trap that cost three days, and it will happen again.** The
artifact reports `serverRuntime: "quickjs-rust"`. `sf dev` runs something else.
A capsule can typecheck, pass the compiler, work perfectly under `sf dev`, and
still throw in production. Three divergences are **confirmed against the
published space**, not inferred:

| | `sf dev` | hosted |
|---|---|---|
| `crypto` | present | **`undefined`** |
| row ids | v4 UUIDs | **sequential integers** (`"4"`, `"6"`) |
| `ctx.log` | prints to console | reaches `sf logs runtime` |

**An uncaught handler exception still logs nothing** — no message, no stack,
just a 500. `ctx.log` *is* the way out and it does work in production; nothing
writes there unless you call it. Instrument deliberately.

**How that was established, and how to do it again:** a keyed `endpoint` that
**returns** its findings rather than logging them. (`/api/probe` itself was
**removed in v9** once both its questions were answered — it is not there to
reuse; write a fresh one and remove it again.) An endpoint gets a full
`ServerContext` — `db`, `transaction`, `log`, `env` — and needs no auth, so it
is the only way to interrogate the hosted runtime. Give it a `?key=` and a
`404` without it. Two guesses were burned before this (`crypto`, then the one
`boolean` column) at a publish apiece; the probe answered everything at once.
**Reach for it third-guess-first.**

**The capsule compiler enforces a global denylist**, in
`@spacefast/zero-compile/dist/analyze.js`, undocumented anywhere:

```js
UNSAFE_GLOBAL_PATTERN            = Bun|Deno|Function|__dirname|__filename|eval|process
ZERO_SERVER_UNSAFE_GLOBAL_PATTERN = BroadcastChannel|SharedWorker|WebSocket|Worker|
  XMLHttpRequest|document|global|globalThis|localStorage|location|navigator|
  sessionStorage|window
```

It is a **denylist of the inappropriate, not an allowlist of the available** —
`crypto` is on neither list, so the compiler admits it and the runtime still
lacks it. It matches **transpiled code, not comments**. Never write `globalThis`
in `server/`; use a bare identifier behind `typeof x !== 'undefined'`, which is
also the only form that survives a missing binding without a `ReferenceError`.
The same rules ban dynamic `import()`, `require()`, and `shared/` importing from
`client/` or `server/`.

**Invite codes are the one thing this all landed on — see
[D43](../.docs/decisions.md#d43-an-invite-code-is-a-secret-mixed-with-the-row-because-the-runtime-has-no-randomness).**
`INVITE_SECRET` lives in `.env.server` (gitignored; the artifact records only
`env: {file, names}` and the file is **not** among the uploaded payload files).
`shared/sha256.ts` is hand-written because there is no host primitive, and is
checked against the FIPS 180-4 vectors. `crypto` is still preferred when
present, so **`sf dev` never exercises the path production uses** — if you touch
`inviteCode`, force `crypto` off locally *and* keep the unit tests green.

### `sf db dump` is broken — 2026-08-26, explained 2026-09-07

`zero_db_dump_failed`, a 500 from the edge, with or without the rationale
header, against a healthy space. `sf db` works in the same second and still
prints the live table list. This is the command that CLAUDE.md used to name for
verifying a publish and for closing out the D14 auth check, so **both now need
another route**.

**Why, and what to use instead.** The rewritten docs state it outright: *"The
dump reads through the space's live runtime, so it needs the app to be
reachable."* So `sf db dump` and `sf db export` are not database commands that
happen to fail — they are **runtime** commands, and they fail wherever the
capsule lane does. `sf db` keeps working because it reads **version metadata**,
which is also why `sf runtime status` answers *"while the runtime is asleep or
moving"* and is the better first call when something is wrong.

**`sf db console` is the route that does not go through the runtime**: a
single-use phpMyAdmin URL with full SQL authority, from the dashboard or the
CLI. See *Going live needs one id that nothing will tell you* above.

### Two auth bypasses, and they are not equally safe

`sf dev` ships no sign-in flow (`signInPath` and `signInUrl` are both null), so
`auth.isGuest` never goes false locally. Two separate holes exist because of it:

1. **The client gate** (`client/index.tsx`) lets a guest through on loopback
   hostnames only — D14. **Confirmed inert in production**: a signed-out
   visitor on the published space gets the sign-in screen. The orange
   "Dev guest · not signed in" chip that used to mark this was removed on
   2026-08-25; the drawer's Account section names the dev guest instead, which
   is where someone looks to find out who they are. If that ever stops being
   true, put a marker back.
2. **The server** (`shared/identity.ts`) used to accept the exact identity
   `sf dev` issues — `guest:local` / `Local` / `guest` / not authenticated.
   **That was never inert in production**: the hosted runtime mints those four
   values for any unauthenticated caller, so `isSignedIn` returned true for
   anybody with a `curl`. **It is gone** — see *Local is a named guest now*,
   which replaced it with named `?guest=` identities that a published space
   cannot produce. The probe quoted below is **evidence about the wrong thing**
   — it enumerated stored membership rows, not what an anonymous request
   receives — and it is kept only because understanding why it convinced
   everybody is the whole lesson. The keyed `/api/probe` endpoint reported:

   ```
   production:  schemes ["account"]  anyDevGuest false   (4 memberships, 2 users)
   sf dev:      schemes ["guest"]    anyDevGuest true    (1 membership,  1 user)
   ```

   **That reasoning was careful and still wrong.** The probe was checked for
   discrimination — run against `sf dev`, where the hole is open, it came back
   `true` — so it does detect *the condition it measures*. What it measures is
   **which identities have rows in `memberships`**, which is a fact about who
   has signed in, not about what the runtime hands somebody who has not.
   Production issues `account:` identities *to people who sign in*, and
   `guest:local` to everybody else. **Ask the runtime, not its data.**

Don't widen either one, and take both out if Spacefast ships a local sign-in
stub.

**`sf dev` issues one fixed identity**, so a second local tab is the same user.
That is enough to watch a mutation propagate; it is not enough to test two
members of a household. Anything touching sign-in, invites, or roles has to be
checked against the published space — which, as of 2026-08-27, two real people
have now done.

See `.docs/roadmap.md` for the phases.

## Target platform: Spacefast Zero

The app will be published on [Spacefast Zero](https://spacefast.com/docs/zero):
a Preact client plus a typed server "capsule" holding the database schema and
handlers, with hosted sign-in and live queries built in. One `sf publish`
compiles the capsule, migrates the database, and activates the version.

### Constraints that must never be forgotten

These are hard platform limits and they shape everything:

1. **No numeric column type.** Schema fields are `string()`, `boolean()`,
   `id(table)` only. `qty` and `threshold` are decimal strings — parse at the
   edges, validate server-side, and **never sort by them in the database**
   ("10" sorts before "2").
2. **No array or JSON type.** Many-to-many needs join tables (`itemTypes`,
   `itemStores`).
3. **No row-level security.** Every household boundary is a hand-written check.
   Resolve the household server-side from `ctx.auth.userId`; never trust a
   client-supplied `householdId`; re-read a row and verify before writing.
4. **Destructive migrations need explicit flags** (`sf db migrate --drop` /
   `--rename`). Additive changes apply on publish. Getting the schema right
   early is worth real effort.

### Reading the Spacefast docs

**The docs were rewritten wholesale on 2026-09-05** — `spacefast/docs` #41,
every page replaced — and the single-file runtime reference this project leaned
on is gone. `https://spacefast.com/docs/zero-runtime.md` is **~212 lines** now:
a hub that declares Zero, shows one minimal app, and hands the depth to siblings
— `/database`, `/crons`, `/storage`, `/logs`, `/environment-variables`,
`/config-file`, `/limits`, `/routing`, `/access`. The 674-line page it replaced
survives only in git history, at `ffbd49e^:content/zero-runtime/index.mdx`.

**Read the repo, not the site.** `github.com/spacefast/docs` is public and a
shallow clone is 25 MB:

```bash
git clone --depth 60 https://github.com/spacefast/docs.git
```

`content/` holds every authored page; `generated/` holds what a page cannot —
**591 error-code pages** under `generated/errors/`, the OpenAPI snapshots, the
CLI reference, and the package changelogs. And `git log` is the only way to see
what a rewrite *changed*, which is how the endpoint `mode` requirement was found
at all.

**The docs described `0.4.1` before it existed, and that gap is closed as of
2026-09-10.** They documented `endpoint({ mode, method, path })` while
`@spacefast/zero@0.2.2` had no `mode` on `EndpointRoute` and adding one was a
`TS2353` — which was the whole blockade. `0.4.1` **requires** it. Read the
2026-09-07 and 2026-09-10 entries in `.claude/docs/spacefast.md` together: the
lesson that outlives the bug is that these pages ran **ahead** of npm by four
days, so a page describing an API the installed SDK cannot express means *check
npm*, not *the page is wrong*.

**`/docs/zero.md` 404s** (checked 2026-08-29, still true) — 2026-09-06 made
`/docs/zero-runtime` canonical and left the old routes as redirects. The 404
body is 25 KB of HTML, so a script that does not check the status code gets a
page of `<script>` tags where it expected Markdown, and a browser sees nothing
wrong. **`https://spacefast.com/docs/llms.txt` is the index that names the
current URL of every page** — check it there before assuming a page is gone.

A plain `curl` works — **the 403 to programmatic fetches was fixed on
2026-08-25**, so the browser User-Agent this file used to insist on is no longer
needed:

```bash
curl -sL https://spacefast.com/docs/zero-runtime.md
```

Every docs page has a `.md` twin at the same path. Prefer it over the HTML. If a
page ever 403s again, a desktop browser User-Agent was the old workaround.

**`.claude/docs/zero-agent-rules.md` is still worth reading beside them.** It is
the `AGENTS.md` that `sf init --runtime zero` scaffolds, and it was for months
the only place documenting the static-class-names rule, the semantic token
vocabulary, the server's import restrictions, and the fact that platform modules
don't count against the client bundle budget. **The 2026-09-05 rewrite covers
all four now**, so the gap it filled has closed — but it is pinned to the
toolchain we actually compile against, which the new pages are not.

## Documentation map

Depth lives in `.docs/`. Read the relevant one before proposing architecture —
most of it is already decided.

| File | What's in it |
|---|---|
| `.docs/overview.md` | What the app is, concept vocabulary, goals, **non-goals** |
| `.docs/architecture.md` | Zero's shape, project layout, data flow, auth, constraints |
| `.docs/data-model.md` | Schema, indexes, ownership rules, cascade deletes, query surface |
| `.docs/roadmap.md` | Phases 0–5 in dependency order, each with a "done when" |
| `.docs/decisions.md` | D1–D76, with reasoning and rejected alternatives. **D27 governs every schema edit**; **D32 governs term colors**; **D35 and D44 govern row timestamps**; **D36 governs destructive actions**; **D41 governs the shopping list**; **D42 governs the household colour**; **D43 governs invite codes**; **D45 governs the applied filter bar**; **D46 governs the account's display name**, amended by **D48, which forbids prefilling either name**; **D47 governs the sign-in copy**; **D49 governs the Settings pane, the Members pane and both drawer menus**; **D50 governs the seeded types, amended on 2026-08-31 by the fifteenth, `Dry Goods`**; **D51 governs what the view restores on load**; **D52 governs an item's size**; **D53 governs keeping an item off the shopping list, retired by D60**; **D54 governs the offer to install**; **D55 governs a member's avatar**; **D56 governs the account row and its outbound link**; **D57 governs the beta badge, and narrows the spec that describes it**; **D58 governs a source's kind, the group's own name, the run list's bands, an item's season and the item card's glyphs, and amends D36's editing row and D53's checkbox**; **D59 governs which way a reference may point once recipes and plantings exist, and is why no ingredient panel is being built on an item**; **D60 retires D53's off-list checkbox while keeping its column and its behaviour**; **D61 governs what first run asks and what each answer seeds, and retires D58's line that a new household is a `STORE` household on day one**; **D62 governs the admin console — that it is a drawer pane rather than a surface, that an administrator is a name in `LARDER_ADMIN_IDS` and nothing in the UI grants it, that the console never prints an invite code, that retention is set out of band, and that *seeing inside a household* is decided against**; **D63 governs the two suggestion menus — that a suggestion menu answers the question its field asks, that a match is a prefix of any word and the grid matches the same way, that adding fills everything the row knows while editing fills only the name, and that nothing in either menu leaves the screen you are on**; **D64 governs restock — that a check is a claim rather than a write, that the count is set once at the put-away and set rather than added, that the prefill is `max(low at + 1, on hand + 1)`, that a whole trip is one mutation which resolves every row before writing any, that the `restocks` log records no `userId`, and that a trip now survives a household switch — amending D41; **D65 governs the list override — that it is a tri-state living where *low at* is set, that the retired `offShoppingList` folds into `never` and drains on the first edit, that `always` outranks the count and never the season, and that a pinned row with nothing wrong with it says `EXTRA` where its status would be**; **D66 governs shared claims — that a claim says whose and that is what stops the double-buy, that a trip is a row so the day runs from the last tick, that neither table stores a name, and that a claimed row's face goes in the tick column rather than leaving it empty**; **D67 governs bulk entry — that paste and the checklist are two *sources* feeding one review, that nothing is written until Add, that the way in is a split on the primary rather than anything inside the Add sheet, that the parse reads a line end-first and guesses no shelf, shop or type, that a duplicate arrives unchecked and is never written however it is ticked, and that a bulk commit gets a plain toast and no undo**; **D68 governs deleting your own account — that it is *leave household* run against every household at once, that one blocked dialog is a step and five is a wall, that `fateOf` is the one classification both halves read, that promoting somebody is not handing a household over, that the icon-disc ramp is picked by **finality** rather than by data loss, that deleting is immediate and there is no hold, and that export is two features because the pantry was never yours — amending D49, D36 and D22, and contradicting two lines of D62**; **D69 governs the console's charts — that a cumulative total is a *shape* and a per-month count is a *chart*, that the band labels are derived from their floors so a boundary and its label cannot drift apart, that a distribution's bands are neither controls nor coloured, and that per-month bars never sum to the total beside them — amending D62, whose Overview no longer draws a cumulative line**; **D70 governs how a read and a count are shaped for scale — that `collect()` truncates at 1,000 rows silently so every full read goes through `collectAll`, that a count in a column is a zero-padded string because text sorts lexicographically, and that indexes and columns are added while the table is small because the cost is paid against the row count at the time**; **D71 governs what is recorded when something is destroyed — that invites now carry when they were sent and whether they converted, that a deletion writes a row holding no id, name, household or account, and that item removals are knowingly not recorded**; **D72 governs what Overview measures — that *Active* replaced *Live invites*, that a completed trip is counted from `restocks` rather than `trips` and as trips rather than rows, and that *Sharing* is the only figure there that does not rise when one person makes five pantries**; **D74 governs a run list card's row order — A–Z and nothing else, because the status is already on the row in a badge and the order is the one thing a list you walk a shop with should be able to predict; amending D41 and D58**; **D75 governs the two exports that describe rows — that each offers CSV or JSON, that the choice is made at the press and remembered nowhere, that one reading of the data renders both files so they cannot drift, and that `held` and an item's sources are the counts and the arrays they really are in JSON where CSV can only flatten them; amending D68's *one file, no picker***; **D73 records the run list's type sort as built, measured and reverted — what stays true (source is the card, the sections are a partition of an already-ordered list, a multi-typed item places under the first of its types in the household's order) and what stopped it (row 2 in list mode has about five pixels spare at a docked 1120, so any control added to it costs the segment its words). Nothing ships; D41's *the list has one fixed order* still stands**; **D76 governs the household rollup — that `itemCount`, `memberCount`, `ownerCount` and `changedAt` are maintained by `bumpHousehold` and nothing else, that `''` is *not counted* and never zero (so an unrepaired household is excluded from Overview's figures rather than filed as empty, ownerless and dormant at once), that a household is counted at birth and everything older self-heals on its first write, and that `bumpHousehold` is called **after** the write it accounts for; completing the columns D70 declared** |
| `.docs/notes.md` | Open platform questions, and what the v2 publish and Phase 3 answered |
| `.claude/docs/design/ui-directions.md` | **The current design spec** (Aug 2026, "Cellar") — palette, type, structure. **Its *Order inside a card* is stale**: *out before low, then A–Z* was dropped for plain A–Z by **D74** |
| `.claude/docs/design/larderlogdesigns-4.html` | The rendered final mockup that spec describes |
| `.claude/docs/design/larderlogshoppinglistboards-2.html` | **The 16 boards for the shopping list** — eight screens, light and dark. Supersedes the `-1` file, which drew a top bar the app does not have |
| `.claude/docs/design/larderloghouseholdcolourboards.html` | **The 8 boards for the household colour** — four screens, light and dark |
| `.claude/docs/design/appliedfilterbar.html` | **The applied filter bar** — a live page rather than boards: desktop, 390, and the state strip, in both themes |
| `.claude/docs/design/add-edit-item.md` | **The add / edit item redesign** (28 Aug) — the sheet's four sections, the size, the two steppers, and the off-list checkbox. A section of the design spec kept as its own doc, because `ui-directions.md` has no patch operation |
| `.claude/docs/design/larderlogaddedititem.html` | **The 9 boards for that redesign** — the sheet in both themes, the size row and its unit menu, the two steppers, where the size shows, 390, and keeping an item off the list |
| `.claude/docs/design/install-as-an-app.md` | **Install as an app** (28 Aug) — the one Settings row that offers it, the banner that was cut and why, and two contrast findings that leave the row. Its own doc for the reason `add-edit-item.md` is |
| `.claude/docs/design/larderloginstallmockup.html` | **The 5 boards for it** — desktop 1440, the row's states with the panel-edge finding drawn both ways, Preferences in three states × both themes, 390, and the appears-where matrix |
| `.claude/docs/design/garden-and-kitchen.md` | **Garden and Kitchen** (rev. 29 Aug) — a source carries a kind, the shopping list becomes a run list of three bands with a segment over it, and an item gains a season. Its own doc for the reason `add-edit-item.md` is; it **replaces *Shopping list* wholesale**. **Read its *what is in v1 and what is a mockup* callout first**: everything about recipes, ingredients, quantities and units is a marked mockup (D59). **Its lede is stale** — it still promises an item gains "ingredients with quantities", which the callout eight lines below and the *Ingredients — on the recipe, never on the item* section both contradict. **Built: all of v1** — D58 (the kind, the rename, the menu, the card glyph), the run list, the item side, and **D61**, its *First run asks where your food comes from* section. **Its *Inside a band nothing changes* is stale in one clause**: rows are plain A–Z now, not out before low then A–Z (**D74**) |
| `.claude/docs/design/larderloggardenkitchenboards.html` | **The 9 boards for it** — **board 1 is first run** (the card, the hint in four states, the rejected second step, and the three seeded drawers with `STORE` becoming `SOURCE`); its card still draws the pre-D48 prefilled name and hint, which the build does not have. Then — the run list at 1440, entry and the three card types, ingredients (**mockup**), setting the kind with the STORE/SOURCE naming rule, the item side, where this goes (**mockup**), and the two structures that lost. Light theme only. **Board 2 draws both spellings of the trigger**; *To get* is the one chosen. **Board 1 draws the Make rows at 76px with a batch line, which is the mockup** — in v1 they are 56px like every other row |
| `.claude/docs/design/autofill.md` | **Autofill — the name field and search** (31 Aug) — the two suggestion menus, what each group holds, the matching rule, what picking carries, and the four questions it closes under *Gaps*. Its own doc for the reason `add-edit-item.md` is. **Built, all of it** (D63) — **and four of its rules were reversed the same day, in the build rather than in the document**, so read D63 beside it: the search menu's item row **fills the field** instead of opening an Edit sheet (so **the chevron and the whole *a chevron means the row leaves the screen* section describe a build that does not exist**), a term row **clears the query** instead of keeping the menu open, the group is **`FILTERS`** rather than `TERMS`, and a catalog row now carries a **type and a shelf**. On geometry the build went past both: the boards draw the sheet's item row at 50 and the search term row at 44, the doc's table reconciles them at 56 and 38/48, and **what shipped is 38/48 for all three kinds** — the item row was restyled to the term row's single line on 31 Aug, so **every drawn item row in this file is two-line and the build's is not** |
| `.claude/docs/design/larderlognameautofill.html` | **The 12 boards for it** — name field at 480 in both themes, row anatomy, 390, the rules, the settled picking behaviour, search at 1372 in both themes, search at 390 with the no-match state, what the search menu does, and two explorations. **The search boards draw a stale top bar** — `Showing 2 of 20`, a `Shopping list` trigger and `Sort · Recently added`, all three of which row 2's rework replaced — **and every item row on them carries a chevron the build does not draw**. **Explorations A and C are not a spec**; C is the answer to reach for if the duplicate watch-out bites |
| `.claude/docs/design/restock.md` | **Restock — the trip that ends** (31 Aug) — a check becomes a claim, the trip bar's reserved right half becomes *Put N away*, and the put-away sheet writes a whole trip's counts at once. Its own doc for the reason `add-edit-item.md` is; it **replaces *Shopping list → Checks are local, and they expire* wholesale**. **Read its *what is specced and what is a consequence* callout first**: the claim, the trip, the bar, the sheet and the `Clear checks` delta are specced; the **`Always` / `Never` tri-state** and **trends tier 2** are separate features it merely unblocks. **Built** (D64) — **except shared claims**, deferred by request, so no row ever draws *In Sarah's cart* and `N in the cart` keeps its wording rather than becoming `N in your cart`. **Its *Claims are shared* section is built** (D66) — **but not its row layout**: the face moved from the count slot into the checkbox column the doc says to leave **empty**, and grew 18px → 22 to match the `CheckBox` it stands in for. **Its `Always` / `Never` section is built too** (D65) — **but not its hint copy**: all three sentences were rewritten on the first look at the built control, because *the list* names nothing a person can point at, *until you buy it* is false for anything you pick, and *count* is the wrong noun for what is on a shelf. **Its hint table therefore describes copy that does not ship**, and its segment is drawn without the sub-label the build gives it. **Trends tier 2 is the one part still unbuilt**, and the `restocks` log is collecting for it. **Its put-away sheet is described as *out before low* and is A–Z now** (**D74**) — the sheet walks the bands, so it followed the card without being touched |
| `.claude/docs/design/larderlogrestockmockup.html` | **The 6 boards for it** — the run list with three checked, the put-away sheet, the screen after, the trip bar's anatomy with its undo toast, the tri-state, and trends tier 2. Light theme, desktop; **mobile is not drawn at all** — the bar's three controls at 390 are specced in prose and the sheet as a bottom sheet is asserted rather than drawn. **Boards 1, 2 and 3 all draw a row claimed by Sarah**, which is the deferred half; **board 4's "where the green belongs" card is drawn left-aligned at 440** and the build takes `EmptyState`'s centred shape instead, since the two empty states share one slot. **Board 5 is built** (D65); **board 6 is not** |
| `.claude/docs/design/bulk-entry.md` | **Bulk entry — the adoption wall** (31 Aug) — the split primary, the paste dialog, the review table, the common-items checklist, and what the empty larder does. Its own doc for the reason `add-edit-item.md` is. **It says of itself that it is a sketch, not a spec**, and about half of it was undecided — read *Open questions* before treating any of it as settled. **Built** (D67), **with five knowing departures**: the 390 chevron moved to the pinned bottom bar rather than row 1 (the board's premise — *the primary is already a 52px square at this width* — is false of the build); the bulk commit gets a **plain toast and no undo**, which answers its own first open question; the checklist **omits what the household already holds**; the paste fills no type, which is its prose over its boards; and **`Save and add another` was built and removed** for a cramped footer, so its board 4 describes a build that does not exist |
| `.claude/docs/design/larderlogbulkentrydesign.html` | **The 11 boards for it** — seven on *The flow*, one at 390, three explorations. Light theme only. **Board 6's review rows draw filled `Type` chips on pasted lines**, which both the design's prose and its own board note contradict — the note wins. **Board 3's 390 panel draws the split beside search**, which the build does not do. **Board 4 is `Save and add another`, which is not built.** The Explorations page is explicitly not a spec |
| `.claude/docs/design/delete-account.md` | **Delete account** (1 Sep) — where deletion lives, the pre-flight the sole-owner rule forces, the ownership transfer that forces, one typed confirmation and the card it leaves you on, and export. Its own doc for the reason `add-edit-item.md` is. **Built, all of it** (D68), **with five knowing departures**: the card's button says *Back to Larder Log* rather than naming a domain the app does not have; *what goes permanently* names the **sources** too, as the app's own *Delete household* confirm always has; the account export carries **no invite codes** (D39) and **no join date** (`memberships` has no stamp — D44); and the sole-member households answer themselves rather than being sent as decisions. **Its two contradictions with `admin-console.md` are real and this doc wins** — there is no hold, so neither *awaiting deletion* nor the log's `Automatic` actor describes a state that exists |
| `.claude/docs/design/larderlogdeleteaccountboards.html` | **The 6 boards for it** — where it lives (with the crimson menu row that lost), the pre-flight in two states, ownership transfer, the confirmation and the card, export, and 390. Light theme, desktop except board 6. **Board 1's menu draws an *Announcements* row**, which is a different doc's feature and is not built — the menu here is the door, Admin, and Sign out. **Board 4's hold cards are the thing that was cut**, and the board says so. **Board 5's CSV sample uses the pre-D50 type names** (*Protein*, *Condiment*) and a `store` column the build spells `sources`, because an item may name several. **Its *one file, no picker* is reversed by D75** — the pantry export is a split offering CSV or JSON, and the audit log's menu offers both too |
| `.claude/docs/design/run-list-sorting.md` | **Run list sorting** (2 Sep) — the sort control, the type subhead, where a term order would live, and one item with several types. Its own doc for the reason `add-edit-item.md` is; it amends *Shopping list → The store card*, *Shopping list → Entry and exit*, *Garden and Kitchen → The run list* and *Sort menu*. **Built in full and reverted the same day; nothing is implemented** (D73). What the build settled is in D73 rather than here — the partition rule, the multi-type placing rule, and the measurement that stopped it: **row 2 in list mode has about five pixels spare at a docked 1120**, so the sort control is the unsolved half. Its own *Where the order lives* leaves the drag handle unsettled (the row cannot hold both a handle and a count at 340px), and **the threshold rule it works out and discards under *Every card takes it* is the cheapest way back in** — the sort control is what made it unnecessary. The build drew the subhead at **34px, not the doc's 26**: that is what `NOT YET` already is. **Its premise moved underneath it**: *today a source card sorts out before low, then A–Z* was true when it was written and **D74** made the card plain A–Z, so its *By source* column now describes what already ships |
| `.claude/docs/design/runlistsortingmockups.html` | **The 6 plates for it** — the whole list at each sort, the menu open, and the three bands scoped. Desktop 1440, light theme only; **dark and mobile are not drawn**. **Its segment reads `All 29` against `Buy 22 · Harvest 3 · Make 4`** where the build reads `All 28` — the doc flags the disagreement and settles it against neither, so **neither number is spec** |
| `.claude/docs/design/scale.md` | **Building for a million households** (2 Sep) — the platform's real read/count/index limits as measured, the four-layer rollup design that follows, what it costs every mutation, and the three questions that have to be answered. **Stages 0, 1 and 2 are built** (D70, D76); its *Staging* table is the order and is kept current. **Stage 3 is next and is the one blocked on question 1** — band counters and month buckets are space-wide rows every household increments, unlike stage 2's, which are written only by one household's own members. The answer-independent design for them is recorded there: shard by `sha256` of the household id, which needs no randomness (D43) and leaves N tunable |
| `.claude/docs/design/admin-console.md` | **The admin console** (29 Aug) — the console as a pushed drawer pane, the metadata-only rule, the deletion flows, the Activity log, and *seeing inside a household*. Its own doc for the reason `add-edit-item.md` is. **It supersedes *future-ideas → The administrator page*** — the console shares the whole drawer, not "tokens and nothing else". **Built, except board 10.** Where it and the build differ, D62 says why: three fields the platform cannot give (every email, storage, last-seen), an invite code the console refuses to print, retention that is an environment variable rather than a control, and *Sole owner* in place of *Awaiting deletion* |
| `.claude/docs/design/larderlogadminconsoleboards.html` | **The 26 boards for it** — twelve screens on a **Light** page and again on **Dark**, plus two at 390 on **Mobile**. All built except board 10. **Board 10 draws both answers to *seeing inside a household* side by side and settles neither — D62 settles it, against.** Board 8's 403 is drawn beside the 404 and is explicitly the one that does not ship; in the event the platform answers `/admin` before the app is reached, so neither ships. Its sample data has three known inconsistencies, listed at the foot of the design doc, and its member rows draw emails this app has never held |
| `.claude/docs/design/beta-badge.md` | **The beta badge** (28 Aug) — the pill, its one construction, and the surfaces it skips. Its own doc for the reason `add-edit-item.md` is. **Its central rule — *the wordmark never appears without it* — was built and rejected; D57 narrows the badge to the marketing page**, so its *Where it appears* table describes a build that does not exist |
| `.claude/docs/design/larderlogbetabadgeboards.html` | **The 5 boards for it** — anatomy and the four surface pairings, the drawer header, 390 with six filters applied, what lost, and the marketing nav and footer in both themes. **Its marketing nav still draws the pre-D47 *Sign in with Gravatar* button** |
| `.claude/docs/design/larderlogdrawerpreview.html` | **The redesigned drawer** — five screens in one page: the root Settings pane, the Members pane, changing a role, making an invite, and the account menu. Light theme only; the dark counterparts are a hex-for-hex map away |
| `.claude/docs/design/display-name-light.html` / `-dark.html` | **The first-run display name** — two states, *Gravatar had a name* and *it didn't*, in both themes. **The build has one state now** — D48 removed the prefill, so neither board's hint exists |
| `.claude/docs/design/larder-log-front-door/` | **The 18 boards for the flows outside the shell** — nine screens, light and dark. Where these and the spec text disagree, these win |
| `.claude/docs/pantry-tracker-mockup.jsx` | The **superseded** design reference (see below) |
| `.claude/docs/spacefast.md` | Running feedback log on the platform |
| `.claude/docs/zero-agent-rules.md` | Zero's own `AGENTS.md`, verbatim — the best runtime reference |

**Keep these current.** When a decision gets made, add it to `.docs/decisions.md`
and remove the corresponding entry from `.docs/notes.md`. When a phase completes,
update `.docs/roadmap.md` and the status section here.

## Standing instructions

- **Ignore `/.ideas/`.** Abandoned WordPress prototyping. It is gitignored and
  untracked; do not read it for conventions, extend it, or cite it.
- **Append to `.claude/docs/spacefast.md`** after any notable interaction with
  Spacefast — docs, CLI, `sf dev`, publishing, migrations. Dated entries tagged
  good / friction / unclear / bug. Justin intends to send this feedback to the
  Spacefast team, so record concrete detail: exact errors, HTTP codes, what was
  tried. Do this as you go, not at the end.
- **The design spec is `.claude/docs/design/ui-directions.md`.** It supersedes
  `pantry-tracker-mockup.jsx`, which describes the pre-Cellar interface and is
  now history. `larderlogdesigns-4.html` is the rendered final design; page 2 of
  the linked canvas holds three rejected explorations — **ignore those**. Where
  the spec and the HTML disagree, the HTML wins; they were checked against each
  other and currently agree.
- **The old mockup is a design reference, not source.** `pantry-tracker-mockup.jsx`
  is a design artifact Justin edits and replaces wholesale. Diff it against the
  implementation rather than assuming it matches. It also contains at least one
  known bug (a stale-closure duplicate guard), and it is **name-based
  throughout** while the app now joins taxonomies by id — so it is a reference
  for *layout and interaction*, never for data shape. Don't copy from it
  blindly.

## Code conventions

- **Tabs for indentation** (`.editorconfig`, `indent_style = tab`). This applies
  to JS/JSX/TS as well as everything else.
- Single quotes in JS/TS; semicolons.
- Space after `!` in negations (`if (! name)`) — matches the existing source.
- Comments explain *why*, not *what*. Match the density of the surrounding file.
- Keep components small and props explicit. `client/` is the model to follow —
  `components/`, `hooks/`, `lib/`, `data/`, with the entry in `index.tsx` and
  the signed-in app in `Pantry.tsx`.
- **Pure domain logic goes in `shared/`, not `client/lib/`.** `shared/` imports
  nothing, so the capsule can reuse it; a validation rule written client-side
  becomes a second copy the server has to duplicate. `client/lib/theme.ts` is
  the boundary — status *derivation* is shared, status *colors* are not.
- `import type` for type-only imports (`verbatimModuleSyntax` is on).

## Commands

```bash
npm install
npm run dev          # the Zero app — `sf dev --state-backend sqlite` on :4173
npm run typecheck    # tsc --noEmit over client/, server/, shared/
npm test             # unit tests over shared/ — compiles with tsc, runs on node
```

`sf` is a pinned devDependency, **not** a global install — use the npm scripts
or `npx sf …`. Do not run the `curl … install.sh | bash` installer; the CLI
ships on npm as the `spacefast` package and the pinned version is deliberate.
**It is `spacefast@0.4.1`, pinned exactly** (no `^`), together with
`@spacefast/zero@0.4.1` — upgraded from `0.2.2` on 2026-09-10, which is the
release that **ended the `zero_artifact_mode_invalid` blockade**. The two must
move together: the CLI bundles `@spacefast/zero-compile` at its own version, and
that is what compiles the capsule.

**What that upgrade cost, so a future one is read the same way.** Two breaks,
both caught by `tsc` in one pass: `endpoint()` requires `mode` (`'read'` here,
and it is typed — a `read` handler is handed a `QueryServerContext` and cannot
reach `invalidate` or `email`), and **`ctx.transaction` is gone with no
replacement**, so `createInvite`'s two writes are flat now — the handler *is*
the transaction. And a third, which typecheck cannot see: **the capsule
compiler's global denylist became an AST walk that counts property keys and
member accesses as references**, so `shared/exportData.ts` had to quote
`location` the way `server/index.ts` already quotes it in `TERM_TABLES`. Only
the dry run finds that one. `.dev/patch-sf-cli.mjs` — the hand-patched toolchain
that worked around the blockade — is **retired**; `0.4.1` emits the same
`executionMode` records natively.

**`sf docs <terms>` searches a bundled offline copy**, new in `0.4.1`, with
`--full` / `--all` tiers and exact slugs (`sf docs errors/zero_db_transaction_active`).
It is summaries and URLs rather than whole pages, so it does not replace the
docs repo — but it is the fastest way to reach an error code's page.

`sf --help` does not list `dev`, `db`, `logs`, or `storage`, but they all exist,
as do `sf db migrate`, `sf db export`, `sf db dump`, and `sf db console`.

**And a whole release surface is hidden the same way.** `sf versions --help`
says *"List, promote, and roll back space versions"* and then lists only `get`,
`ls` and `rm` — which reads as *there is no rollback*, and that conclusion was
drawn here once. **The commands are top-level**, and all four are in the pinned
`spacefast@0.2.2`:

| | |
|---|---|
| `sf rollback <version>` | move `live` back to a ready version. Seconds; nothing rebuilds |
| `sf promote <version>` | the same operation, forwards |
| `sf channels ls` / `sf channels history` | where `live` points, and every move with its actor. **Both crash in their table renderer — use `--json`** |
| `sf apply` | push settings saved in the dashboard onto the serving runtime, **without** creating a content version |

**`sf runtime status` is the first call to make when something is wrong**, and
it was found in the docs repo rather than in `--help`. It answers from **version
metadata rather than the runtime**, so it works *"while the runtime is asleep or
moving"* — the condition this space has been in since 2026-09-01. `--json`
prints the live and pending version ids, the live URL, and for a capsule: every
table, query, mutation and **endpoint with its resolved `mode`**, both bundle
sizes, the schema hash, the `.env.server` variable **names**,
`migrateAtFinalize`, `blockIncompatibleRollback`, and the realtime paths. The
endpoint's `mode` is the field our own compiler never emits and the platform
derives anyway, which is how the 422 was pinned down.

`sf publish --target preview` creates a version without serving it, which is the
way to stage a risky publish. See
[`/docs/publish/versions`](https://spacefast.com/docs/publish/versions).

**A version can be created by the platform, not only by a publish.** A settings
change made in the dashboard mints one with `source=config_update` and zero file
changes, and it moves the live channel. `sf versions ls` shows the `source`;
`channels history` does **not** distinguish it from a publish. One of those broke
sign-in on 2026-08-31 — see `.claude/docs/spacefast.md`.

`sf dev` gates every path behind a capability token printed in its banner. To
reach it from a script, POST that token to bootstrap first — **an `Origin`
header is required or it answers 403**:

```bash
CAP=…   # the #zero-dev-capability= fragment from the sf dev banner
curl -X POST -H "authorization: Bearer $CAP" -H "origin: http://127.0.0.1:4173" \
  http://127.0.0.1:4173/__spacefast/zero/bootstrap        # 204 + Set-Cookie
curl -b "spacefast_zero_dev_4173=$CAP" http://127.0.0.1:4173/zero.css
```

**`npm run dev` passes `--state-backend sqlite`**, so the dev database now
persists across restarts in `.spacefast/zero/dev-state.sqlite` (gitignored).
The CLI's own default is `memory`, which resets every run — drop the flag for a
clean slate, or delete that file.

**That file is not portable across CLI versions, and the failure is a C
assertion.** The `0.4.1` upgrade could not load the state `0.2.2` had been
writing all morning: every capsule call answered `500` with
`Aborted(Assertion failed: list_empty(&rt->gc_obj_list), at JS_FreeRuntime)`,
while `GET /` still served 200. **Two triggers, both bisected** and written up
in `.claude/docs/spacefast.md`:

- **A row missing a column the schema declares aborts the runtime.** The
  fourteen `invites` rows written before D71 added `addedAt` / `redeemedAt` /
  `redeemedBy` did it on their own, at 4.4 KB. `0.2.2` filled the declared
  default in. **This is the normal state of every additive migration**, so
  expect it again on the next one.
- **Roughly 37,000 object properties**, and **it is not bytes** — 345 KB of
  padded rows loads, 1.05 MB of ordinary ones does not.

**The repair, if it happens again**: write the missing columns as their declared
default, and drop whole households you do not need — *whole*, so the rollups
(D76) stay true of what is left. **Choose which ones by what the console reads,
not by who can open them.** The first pass kept the seven households Justin is a
member of and emptied *New households per month*: those seven are the oldest
rows in the seed, stamped June–July 2025, and every household inside the
twelve-month window was among the 108 dropped. A fixture has to satisfy the
charts as well as the app — the window, the pantry-size bands, and the trips
series — and **selecting by size alone skews it toward empty households**, which
is the wrong direction for the one chart D69 built to measure adoption. Back the file up first; on 2026-09-10 the
original is at `.spacefast/zero/dev-state.pre-0.4.1.sqlite`. **The error names
no table, row or column**, so bisect: fractions of the snapshot, then per table,
then per field.

**`.dev/seed.cjs` rebuilds a fixture from an empty database** — six named
accounts, five households, real invites and audit rows — which is the cheap way
out if a state file is ever unrecoverable.

**`pages/index.tsx` is the app's route, and without it there is no app.**
`0.4.1` moved routing into `pages/` — the CLI's own `sf init` scaffold says
*"Addressable pages live in `pages/`… An optional `client/index.tsx` may
explicitly export `Layout`; it is not a page"* — and **the dev server serves
`GET /` only when a page claims it**, 404ing otherwise. `"use client"` is what
makes a `.tsx` page the app rather than a static document owned by WordPress.
`client/index.tsx` is unchanged and still holds `App` and the four boot side
effects; the page imports it, which is what runs them.

**Publish and dev disagree here, so check both.** Compiled without `pages/` the
payload still carries a root `index.html` and would serve `/` in production
while 404ing locally — the 2026-08-27 asymmetry again, pointing the other way.
With the page, that file is replaced by `_spacefast/pages/client.html` and `/`
is a **page route**. **No version has ever been published that way**, so it
joins `sf.jsonc`'s missing `access` on the list to check at the next publish.

**Run `sf dev --no-watch` whenever anybody is testing.** The watcher ignores
only `.git`, `.zero`, `.spacefast`, `.stattic`, `dist` and `node_modules` — so
`.claude/`, `.docs/`, `.dev/` and **`.test-out/`** are all watched, and writing
a doc or running `npm test` **hard-reloads the tester's browser**
(`op: "refresh"` → `window.location.reload()`). That is not cosmetic: a reload
mid-flight kills an in-flight mutation, so a tick or an untick on the wire is
simply lost. Seventeen reloads happened during one session on 2026-09-10 and
manufactured symptoms on top of a real bug.

**And a mutation costs 4–7 seconds on `sf dev` once a browser is subscribed** —
even one that writes nothing — against ~260 ms reads at the same moment. Do not
read local write latency as anything like production's, and do not design an
optimistic layer against it.

**And `GET /` answering 200 proves nothing on its own.** Before the bootstrap
cookie is set, `/` is the capability *gate page* for any caller; the real router
only runs afterwards. A check that stops at `curl / → 200` is reading the gate.
Bootstrap first — `POST /__zero/bootstrap` with the capability as a bearer token
— then ask. **`/__zero/…` is the `0.4.1` path**; `/__spacefast/zero/…` still
answers, and both work.

## Verifying work

Cheapest first:

- **`npm test`** — 1,037 assertions over `shared/`, compiled with the project's
  `tsc` and run on plain Node. No runner, no dependencies. It covers the things
  that are invisible when wrong: the D20 capability matrix, D18's
  one-household rule, D22's last-owner guard, invite expiry boundaries, D28's
  invite-link parsing, the dev-guest bypass in `shared/identity.ts`, D44's
  stamp guards and A–Z term ordering, D45's *OR inside a group, AND across
  groups*, D46's display-name fallback chain, D52's size pair together with
  D53's split between `needsBuying` and `statusKeyFor`, and D55's `https:`-only
  avatar rule, D58's source-kind fallbacks, the group-word rule and the item card's
  one-glyph resolver, D61's source mix — including the absent-versus-empty pair
  and what each answer seeds — and
  `?demo`'s fixture distribution and term resolution, D62's admin rule —
  every fail-closed branch, the dev-guest bypass, the console's month walk, and
  the audit log's encoding, phrasing and retention — and D63's word-prefix
  matching, which is invisible when wrong in exactly the way the filter rule is:
  a substring where a prefix belongs still returns a plausible list, and D64's
  restock prefill and put-away ordering, which are invisible when wrong in the
  same way: a prefill one out is still a plausible number and a row filed under
  the wrong band still puts something away — and D65's list override, where
  reading the retired column wrong puts a muted item back on a list months after
  anybody last thought about it — and D66's claim split, where reading *whose*
  backwards hands back a screen that looks right and lets you buy the butter
  twice — and D67's paste, where a line read left to right instead of end-first
  still yields a plausible item name and quietly moves the size into it, and
  where a duplicate check one character looser starts refusing rows somebody
  meant — and D68's `fateOf`, which is the sharpest of the lot: a household
  filed under the wrong fate still draws a row, still reads as a sentence, and
  quietly deletes or spares the wrong pantry, and **the server derives which
  decisions it requires from the same function**, so a mistake in it is a
  mistake on both sides at once.
  **Add to it** when you touch any of those — that file is the app's
  only authorization test, and the only place the filter rule is checked at
  all.
- **`npm run typecheck`** — `strict` over `client/`, `server/`, `shared/`. Still
  the fastest way to catch string-encoded numbers used as numbers.
  **It will not catch a term id rendered where a name belongs** — both are
  `string`. That bug shipped once already; see `.docs/notes.md`.
- **`npx sf publish --dry-run`, then read `.spacefast/zero/artifact.json`** —
  the only way to see what a publish would actually install: the schema,
  queries, mutations, endpoints, and migrations. **Mandatory after any schema
  edit.** The capsule compiler finds tables by regex over `server/index.ts`
  alone, so a table can vanish from the artifact while typechecking perfectly
  ([D27](../.docs/decisions.md#d27-the-schema-has-to-be-a-literal-in-the-server-entry)).
  Note that `--dry-run` is not read-only: it rewrites the build under
  `.spacefast/zero/`.

  **It is not only whole tables — two ordinary comments defeat the same regex,
  found on 2026-09-02 and both silent.** A comment **between `})` and
  `.index(`** drops **every index on that table**: the chain has to follow the
  closing brace separated only by `\s*`, and a comment is not whitespace. A
  comment **inside the braces containing a brace-then-paren pair** truncates the
  **column list** at that point, because the body is matched non-greedily to the
  first such pair anywhere — *including inside a comment*, so a note warning
  about the first bug causes the second. Both typecheck, both run correctly
  under `sf dev` against a real database, and **the artifact is the only place
  either shows**. Explanatory comments go **above** `name: table({`, never in
  the gap, and never quote that pair.

  **The schema is at `server.schema`, keyed by table name — not `db.tables`,
  not `server.schema.tables`.** `db` holds only `{ backend, migrations }`. Both
  wrong reads return `undefined` rather than erroring, and the first prints an
  empty table list, which looks exactly like the catastrophe the check exists to
  catch. This has now cost two sessions:

  **`queries` and `mutations` are arrays of plain strings**, not objects — a
  `.map(q => q.name)` over them prints a row of blanks that looks exactly like
  an empty capsule. A table's fields are `columns`, not `fields`, so a lookup
  through the wrong key reports every column as absent. Both cost a round trip
  on the v13 check.

  ```js
  const a = JSON.parse(readFileSync('.spacefast/zero/artifact.json', 'utf8'));
  Object.keys(a.server.schema)   // table names
  a.server.schema.items.columns  // [{ name, type, nullable, default }] — NOT .fields
  a.server.mutations             // array of plain STRINGS — NOT objects with .name
  a.server.queries               // likewise, plain strings
  a.server.endpoints             // [{ method, path }] — check nothing throwaway survived
  a.db.migrations                // [] when nothing additive is pending
  ```
- **Diff the artifact against `.docs/data-model.md` after any schema edit.** That
  file is the schema's prose and it is **not** named in the *Keep these current*
  instruction above, which is exactly how `restocks` and `items.listRule` got
  built, tested, documented in three other files and left out of the one whose
  whole job is the data model. Nothing catches it — typecheck cannot, the
  artifact read cannot, and the doc stays plausible because it describes eleven
  correct tables.

  ```js
  const a = JSON.parse(readFileSync('.spacefast/zero/artifact.json', 'utf8'));
  const doc = readFileSync('.docs/data-model.md', 'utf8');
  Object.keys(a.server.schema).filter((t) => ! doc.includes(`\`${t}\``));   // tables
  a.server.schema.items.columns.filter((c) => ! doc.includes(c.name));    // columns
  a.server.mutations.filter((m) => ! doc.includes(`\`${m}\``));            // and the surface
  ```

  Check the **cascade table** by hand while you are there: a new table that
  belongs to a household or an item has to appear in `deleteHouseholdRows`, in
  `deleteHousehold`'s own list, and in whichever delete owns it — and in the
  doc's *Cascade deletes* table, which is the only place all three are written
  down together.
- **`sf dev`** compiles the capsule for real. A clean start plus `GET /` and
  `GET /api/status` proves the client and server entries both resolve.
- **An unused `theme.json` token is pruned from `zero.css`, and that looks
  exactly like a rejected one.** The compiler reads every palette and
  `fontSizes` entry, but Tailwind emits a `--color-*` / `--text-*` var only
  once a class actually uses it — so `bg-drawer` compiles to nothing until
  something references it, and grepping for the var proves nothing either way.
  To check a token was *read*, run the compiler's own reader instead:

  ```bash
  node --input-type=module -e "
  import { zeroThemeSettingsFromThemeJson } from './node_modules/@spacefast/zero-compile/dist/tailwind-core.js';
  import { readFileSync } from 'fs';
  console.log(zeroThemeSettingsFromThemeJson(JSON.parse(readFileSync('theme.json','utf8'))));"
  ```
- **Curl the compiled assets** to confirm styling shipped. Zero finds Tailwind
  classes by scanning source for static strings, so "it typechecks" says nothing
  about whether a class exists. Fetch `/zero.css` (see the bootstrap dance
  above) and grep. The file escapes **brackets, colons, parentheses, commas and
  `#`**: `max-h-[80vh]` appears as `max-h-\[80vh\]`, `bg-[#4A3E2E]` as
  `.bg-\[\#4A3E2E\]`,
  `md:grid-cols-[190px_1fr]` as `.md\:grid-cols-\[190px_1fr\]`, and
  `md:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]` as
  `.md\:grid-cols-\[repeat\(auto-fill\,minmax\(300px\,1fr\)\)\]`. Grepping a
  half-escaped form returns nothing and looks exactly like a missing class.

  **The reliable check prints the selector instead of guessing at it:**

  ```bash
  grep -oE '\.[a-z:\\-]*grid-cols[^ {]*' zero.css | sort -u
  ```

  Failing that, search for a distinctive *unescaped* substring — `190px`,
  `auto-fill`. `grep -F` is necessary but **not** sufficient: the escaped form
  contains literal backslashes, so the pattern has to reproduce every one of
  them. This has now caught us **four** times — the last two reporting a fluid
  grid and an avatar's hover colour as missing when both had compiled correctly.
  Stop hand-writing the escaped form; print it.
- **An arbitrary `min-[Npx]:` variant cannot override a named breakpoint**, and
  the failure is invisible to `typecheck` and to a class-presence grep. Tailwind
  emits arbitrary media variants **before** `sm/md/lg/xl/2xl`, so for
  `md:flex min-[1120px]:hidden` both queries match at 1120 and `md:flex` wins on
  source order — the element stays visible. That shipped once: the collapsed
  rail rendered beside the open drawer.

  **Two rules that overlap cannot be ordered here.** Write one rule that covers
  exactly its band instead: `md:max-[1120px]:flex` compiles to
  `@media (width >= 48rem) { @media (width < 1120px) { … } }` and needs no
  ordering at all. Pairing an arbitrary variant with a *base* utility
  (`fixed min-[1120px]:sticky`) is fine — base utilities precede every media
  block. To check, print the line numbers and compare:

  ```bash
  grep -nF -e '.md\:flex' -e '.min-\[1120px\]\:hidden' zero.css
  ```
- **`POST /__spacefast/zero/run` runs a query by name**, over plain HTTP, and is
  the closest thing to a real client this environment has. It beats the
  throwaway-endpoint trick because it exercises *the handler the client calls*
  rather than a copy of its logic. It needs the bearer token **and** the
  bootstrap cookie — the cookie alone answers `{"error":"unauthorized"}`, which
  reads like a bad token rather than a missing scheme.

  ```bash
  curl -s -X POST -H "authorization: Bearer $CAP" -H "origin: http://127.0.0.1:4173" \
    -H 'content-type: application/json' -b "spacefast_zero_dev_4173=$CAP" \
    -d '{"op":"query.run","name":"invitePreview","args":["AAAAAAAAAA"]}' \
    http://127.0.0.1:4173/__spacefast/zero/run
  ```

  `mutation.run` takes the same envelope. Seed whatever rows the case needs with
  a throwaway endpoint first, then drive the real query — and **delete the
  endpoint before you finish**, checking the artifact's endpoint list to prove
  it went.
- **Curl the published space** for anything auth-related; it needs no bootstrap
  token. `https://larderlog.view.fast/api/status` returning `ok` is the cheapest
  proof that a publish's server half landed.
- **`sf dev` does not serve the publish payload**, so it cannot verify a static
  asset. It returns the SPA shell — `200 text/html`, 1829 bytes — for every
  unrecognized path, including `/fonts/*.woff2` and `/LICENSE.md`, the latter
  of which demonstrably *does* serve in production. Only `/`, `/zero.css`, and
  `/client.js` are real locally. This is the exact inverse of D28's routing
  asymmetry, and both times the local answer is the misleading one. To check
  what would actually ship, read `.spacefast/zero/public/` after a dry run
  rather than curling `sf dev`.

Do not claim something works because it compiled. Three hard limits:

- **There is no browser in this environment.** Justin has to click. Ask him.
  **Record what the build verified, never whether it has been clicked.** This
  file is append-only, so "nobody has clicked it" is true for the hour between
  finishing a feature and Justin looking at it, and false and permanent
  afterwards — 39 of those lines accumulated here and were retired on
  2026-09-08, having been read by a later session as a standing backlog when
  Justin clicks and tests every change. Typecheck, assertion counts, the
  artifact read and the class diff are claims that stay true; **click status is
  current state and does not belong in a document nothing ever edits back
  down.** What *is* worth writing is what a check could not reach — a path that
  needs the published space, a state `?demo` cannot produce, a number only a
  real 390 screen settles — because that stays true too.
- **The signed-out screens need `?signedout` to be reachable at all locally** —
  `http://127.0.0.1:4173/?signedout` for the marketing page,
  `/?signedout&join=<code>` for the invite landing, `/anything?signedout` for
  the sign-in card. D14 makes every loopback visitor a signed-in dev guest
  otherwise. Pressing the sign-in button under `sf dev` throws
  *"Gravatar sign-in is unavailable for this Spacefast runtime"*, which the
  entry catches and releases the button on; the *returning* and *didn't come
  back* handoff states cannot be reached locally at all.
- **There is no sign-in on `sf dev`**, and it issues one fixed identity
  (`guest:local`). So a second tab is the same user: enough to watch a mutation
  propagate, not enough to test two members of a household. Anything touching
  sign-in, invites, or roles goes to the published space.
- **`?demo` fills an empty household with sixty items** —
  `http://127.0.0.1:4173/?demo` — so everything that is only wrong *at scale*
  can be looked at: the filters, the three sorts, the shopping list's grouping
  and its store cards, `Showing X of Y`, search, and the grid's wrapping. The
  rows are **real**, written through `addItem` one at a time, which is the whole
  point — a client-side fake would mean the thing under test is not the thing
  that runs. So there is no `isDemoItem` guard and none is wanted: a demo row is
  an ordinary item the moment it lands. Loopback-only, one page load, and it
  **refuses a household that already holds items**, so it cannot run twice or
  bury a real pantry. The fixture and the resolver are `shared/demoItems.ts`
  (in `shared/` so `npm test` reaches it); the gate and the write loop are
  `client/lib/devItems.ts`. Take it out with D14 alongside the other three.
  **`npm run dev` passes `--state-backend sqlite`**, so the sixty rows — and
  your household and display name — survive a restart; without it every restart
  is a fresh empty database and a first-run screen.
  **The fixture's distribution is the point, not its size**, and `npm test`
  asserts it: 8 out / 13 low / 39 stocked, all fourteen seeded types used, eight
  items in two stores, four in none, one of those storeless *and* on the list
  (the only way D41's storeless group renders), two off-list rows that are low
  (so the pills read exactly two above the list's row count — D53 made
  countable), and `addedAt` spread over 59 days so *Recently added* sorts by
  something. **Do not "tidy" those numbers** — each one is a screen that is
  otherwise unreachable locally.
  **Never write the bare identifier `location` in `shared/`**: the capsule
  compiler text-matches it as a browser global in anything `server/` might
  import, and the same word is legal in `client/lib/`. That is why the fixture
  says `locationName`. It cost a dev-server start; see `.claude/docs/spacefast.md`.
- **`?members` puts two stand-ins in the Members panel** —
  `http://127.0.0.1:4173/?members` — so the role chips, the remove button and
  the last-owner guard can be *looked at* locally. Loopback-only, one page load,
  ignored elsewhere, and the rows never leave the client: `isDevMember` answers
  `changeRole` and `removeMember` before either reaches the network. See
  `client/lib/devMembers.ts`, and take it out with D14 alongside `?signedout`.
  It is a way to see the panel, **not** a way to test the handlers — those still
  need two real people on the published space.
- **The dev guest borrows a real Gravatar**, so the avatar's `<img>` branch is
  reachable locally at all. `sf dev`'s identity carries no `email` and no
  `picture`, so every local look at the drawer's foot row, the collapsed rail,
  the account menu and the first-run card was the initial-on-a-fill fallback.
  `client/lib/devIdentity.ts` hands the dev guest `justintadlock@gmail.com` and
  builds **the platform's own URL shape** — `?d=404&r=g&s=160` over
  `sha256Hex` of the trimmed, lowercased address, byte-identical to what
  `@spacefast/common` emits. `?gravatar=<address>` previews a different one and
  `?gravatar=none` previews the initial fallback, which is the branch a real
  account with no Gravatar gets. The display name stays *Local dev guest*.
  Loopback-only; take it out with D14 alongside the other two.
- **Everyone has a face now (D55), and `?members` is the only way to see a
  mixed row.** One stand-in carries a picture and one does not, because a real
  household is two faces and a letter — an account with no Gravatar falls back.
  The mixed row was looked at on 2026-08-28 and is fine.
- **`auth.email` is empty in production and always will be (D56).** It is the
  identity token's `email` claim and a Spacefast account carries none — the SDK
  prefers `pairwise_sub` and derives the Gravatar profile from the avatar hash
  rather than the address. The docs list `email` among what `useAuth()` returns
  and never say it can be absent. **A dev switch may reveal what production
  hides and must never invent what production lacks** — which is why the dev
  guest hashes an address for its avatar and still reports no email.
- **A failing query is invisible to the client.** Zero emits `query.result` only
  — there is no error path — so a query that throws leaves `useQuery` on its
  initial value forever, indistinguishable from loading. This is why queries
  return a `QueryState` union instead of throwing. Never add a `throw` to a
  query handler.

## Git

- Commit only when asked. Default branch is `master`.
- Don't suggest committing. Code should be reviewed by a human and a commit decision made.

This overrides any default instruction to append co-authorship trailers.

## Repo hygiene

WordPress-era leftovers were cleared on 2026-08-24. What remains is deliberate:

- **The project's documentation is dot-prefixed on purpose.** `sf publish`
  mirrors the project root into the upload and does not honor `.gitignore`, but
  the serving layer refuses dot-prefixed paths with 403. That is why the docs
  live in `.docs/` and these instructions live in `.claude/CLAUDE.md` — one of
  Claude Code's two project-instruction locations, so nothing is lost. **Do not
  move either back to the root**; see
  [D29](../.docs/decisions.md#d29-the-projects-own-documentation-is-kept-out-of-the-publish-payload).
  Markdown links in this file are relative to `.claude/`, hence the `../.docs/`.
- **`.gitignore`** is written for this project, not the old plugin. It ignores
  `node_modules`, `dist`, editor dirs, and `.ideas` — plus, pre-emptively,
  `.env*` and `/.spacefast`, both of which hold credentials (`.env.server` is
  synced to the platform on publish and still does not exist; `.spacefast` holds
  the space id and claim key and **does** exist now — publishing created it, and
  it also carries the build output the publish uploads). `.env.example` is
  deliberately un-ignored.
  (The old warning about not re-adding `/public` was a Vite concern; Vite is
  gone and no `public/` directory exists. Nothing to preserve there now.)
- **`.gitattributes`** keeps only line-ending normalization and binary
  denotes. The old `export-ignore` block was for building WordPress plugin ZIPs
  with `git archive` and had `.docs/` and `CLAUDE.md` in it; the original is at
  `.ideas/plugin-code/.gitattributes.wp-original`.
- **`.phpstorm.meta.php`** moved to `.ideas/plugin-code/`.

Still open:

- Git history starts at `c6e8901` "Phase 0." — the Vite prototype plus all
  project docs. The prototype itself was deleted in Phase 2; it is still in
  history if it is ever needed. Branch is `master`.
- **`LICENSE.md` is GPL-3.0**, inherited from the WordPress plugin convention.
  Worth a deliberate choice for a hosted app rather than a default.
