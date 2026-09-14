import { capsule, query, mutation, endpoint, text, table, string, boolean, id } from '@spacefast/zero/server';

import type { AuthContext, LogContext } from '@spacefast/zero/server';
import type { ReadDb, WriteDb } from './schema';
import { AccessError, administers, assertInHousehold, membershipState, requireAdmin, requireAdminWrite, requireCapability, requireMembership, signedIn } from './auth';

import { toRole, canInviteRole } from '../shared/roles';
import { wouldStrandHousehold } from '../shared/membership';
import { normalizeQty, toInt, fromInt } from '../shared/qty';
import { isSourceKind, sourceGroupWord, toSourceKind } from '../shared/source';
import { toListRule } from '../shared/listRule';
import { normalizeSeason } from '../shared/season';
import { normalizeSize } from '../shared/size';
import { BULK_MAX } from '../shared/bulkEntry';
import type { AccountHousehold, HouseholdFate, OwnershipDecision } from '../shared/accountDeletion';
import { fateOf } from '../shared/accountDeletion';
import { addedAtOf, changedAtOf, joinedAtOf, normalizeStamp, shouldTouch, stampFrom } from '../shared/stamp';
import { isCounted, padCount, readCount } from '../shared/counts';
import { ageInDays } from '../shared/lifecycle';
import type { DeletionKind } from '../shared/lifecycle';
import {
	ADMIN_IDS_VAR, ADMIN_UNDELETABLE_REFUSAL, adminWritesHeldFor, isAdminId,
	countByMonth, isActive, isDormant, isWithinDays, itemBuckets, matchScore, monthKeysBack, monthLabel,
	parseAdminIds,
	RECENT_DAYS, sharingSplit, tripsByMonth,
} from '../shared/admin';
import {
	encodeHeld, retentionCutoff, RETENTION_VAR, toRetentionMonths,
} from '../shared/activity';
import type { ActivityAction, Held, TargetKind } from '../shared/activity';
import { byName, normalizeInk, normalizeName, normalizeNotes, termBlock, termKey, isValidName } from '../shared/term';
import { CODE_BYTES, PENDING_CODE, codeFromBytes, codeFromSeed, expiryFrom, isExpired, isCodeShaped, normalizeCode } from '../shared/invite';
import type {
	AccountInvite,
	AccountResult,
	AdminAccessResult,
	AdminAccountResult,
	AdminActivityExportResult,
	AdminActivityResult,
	AdminHouseholdDetailResult,
	AdminHouseholdFilter,
	AdminHouseholdRow,
	AdminHouseholdSort,
	AdminHouseholdsResult,
	AdminOwnershipDecision,
	AdminPeopleFilter,
	AdminPeopleResult,
	AdminPeopleSort,
	AdminPersonRow,
	AdminSummaryResult,
	HouseholdListResult,
	HouseholdResult,
	ClaimsResult,
	HouseholdSummary,
	InvitePreviewResult,
	PantryResult,
	ProfileResult,
	TermKind,
} from '../shared/types';
import { SEED_LOCATIONS, SEED_TYPES, seedSourcesFor, toSourceMix } from '../shared/seed';
import { householdInk, toHouseholdInk } from '../shared/household';
import { normalizeDisplayName, pickDisplayName } from '../shared/profile';
import { devAvatarUrl, normalizeAvatarUrl } from '../shared/avatar';
import { DEV_GUESTS_VAR, guestName, isDevGuest } from '../shared/identity';

/**
 * The Larder Log capsule.
 *
 * Every mutation follows the same shape, and the order matters:
 *
 *   1. resolve the caller's membership **in the household it names** and assert
 *      a capability (`server/auth.ts`) — the id is a selector, never authority
 *   2. re-read any row it is about to touch and confirm the household matches
 *   3. normalize input through `shared/` — never trust what arrived
 *   4. write, cleaning up dependents itself (Zero has no cascading deletes)
 *   5. `invalidate()` what it touched
 *
 * Step 5 is not optional. Live queries **refetch rather than diff**, and a
 * mutation that declares nothing refreshes every subscription on the page — so
 * an item edit would drag the member list along with it. See D26.
 */

// Keys are quoted deliberately. `sf dev` rejects a server source that
// "references unsupported server global location", and its scanner counts a
// bare `location:` object key as a reference to the browser global. Quoting is
// the whole fix; the name itself is fine.
const TERM_TABLES = { 'location': 'locations', 'type': 'types', 'store': 'stores' } as const;

function termTable(kind: TermKind): 'locations' | 'types' | 'stores' {
	if (kind === 'location' || kind === 'type' || kind === 'store') return TERM_TABLES[kind];

	throw new AccessError('Unknown term kind.');
}

/**
 * The most rows one put-away may write.
 *
 * A weekly shop is not fifty items and a trip is one person's afternoon, so
 * this is a bound on a bug rather than on anybody's shopping. It matters
 * because `restockItems` is the app's only mutation that writes an unbounded
 * number of rows from one call.
 */
const RESTOCK_MAX = 200;

/** Human label for a term kind, for error copy. */
function termLabel(kind: TermKind): string {
	return kind === 'location' ? 'That location' : kind === 'type' ? 'That type' : 'That store';
}

/**
 * The name to stamp on a membership row this caller is about to be given.
 *
 * `memberships.displayName` is a **denormalized copy** of the account's name,
 * not a second name — it is what the member list and the invite card read, so
 * they never have to join a profile row per member on a live query. Every path
 * that writes one goes through here, and `setDisplayName` writes back through
 * all of them, which is what keeps the copy honest.
 *
 * The chain is the one `pickDisplayName` documents: the profile, then whatever
 * name the account already joined somewhere under, then the identity. The last
 * link is what an account created before this table has, and the reason a
 * membership minted for one is not blank.
 */
async function accountName(ctx: { auth: AuthContext; db: ReadDb | WriteDb }): Promise<string> {
	const profile = await ctx.db.profiles
		.withIndex('by_user', (r) => r.eq('userId', ctx.auth.userId))
		.first();

	if (profile) return pickDisplayName(profile.displayName, ctx.auth.displayName);

	const memberships = await collectAll(() => ctx.db.memberships
		.withIndex('by_user', (r) => r.eq('userId', ctx.auth.userId))
		);

	return pickDisplayName(...memberships.map((m) => m.displayName), ctx.auth.displayName);
}

/**
 * The avatar to stamp on a membership row, from the identity that is asking.
 *
 * Deliberately **not** the chain `accountName()` walks. A name has a fallback
 * worth reaching for — an unnamed row in Members is worse than a stale one — but
 * an avatar's fallback is the initial the component already draws, so an absent
 * picture is an answer rather than a gap to paper over. `''` is the whole
 * absent case: no Gravatar, or an identity that carries no claim.
 *
 * `ctx.auth.picture` is the only route to this at all. The platform tells a
 * handler about its **caller** and never about a third party, so the two moments
 * a membership row is written are the two moments the value is in reach —
 * which is why `syncAccountAvatar` exists for every moment after them.
 */
function accountAvatar(ctx: {
	auth: AuthContext;
	env: Record<string, string | undefined>;
}): string {
	const stored = normalizeAvatarUrl(ctx.auth.picture);

	if (stored) return stored;

	// `sf dev` issues no `picture`, so without this every local membership row
	// holds '' and only the surfaces drawn from the client's own identity show a
	// face. Fenced on a *named* dev guest, which a published space cannot mint.
	const raw = ctx.env[DEV_GUESTS_VAR];

	return isDevGuest(ctx.auth, raw)
		? normalizeAvatarUrl(devAvatarUrl(guestName(ctx.auth.userId)))
		: '';
}

/**
 * The database schema, as specified in `.docs/data-model.md`.
 *
 * **It has to be declared in this file, and it has to be a literal.** The
 * capsule compiler does not execute the capsule to learn its schema — it runs a
 * regex over the source of the server *entry* only, and never follows an
 * import. A schema defined in `server/schema.ts` and imported here typechecks,
 * compiles, and publishes an artifact with **zero tables and zero migrations**,
 * with no warning anywhere. It cost us a blocked Phase 2 publish; see
 * `.claude/docs/spacefast.md`.
 *
 * Consequences for editing it:
 *
 * - Keep every table a plain literal entry. A helper that returns a table, a
 *   spread, or a computed key is invisible to the compiler.
 * - No nested braces inside a `table({ ... })` body — the extractor's match is
 *   non-greedy and stops at the first `}`.
 * - After any change here, run `npx sf publish --dry-run` and confirm the table
 *   shows up in `.spacefast/zero/artifact.json`. Typecheck cannot see this.
 *
 * Two platform facts confirmed against `sf dev` on 2026-08-24 that this schema
 * leans on:
 *
 * - `id("table")` is a **type hint, not a foreign key**. A row whose `id()`
 *   field points at nothing inserts happily. Every referential rule in this app
 *   is enforced in a handler or not at all.
 * - The built-in `createdAt` / `updatedAt` are ISO 8601 UTC strings and so
 *   compare correctly as plain strings. `invites.expiresAt` uses the same
 *   encoding on purpose (D24).
 */
export const schema = {

	// The account's own name (D46), keyed by `ctx.auth.userId` rather than by a
	// row id — an identity is not a row this app creates, so `by_user` is the
	// only way in and every read goes through it. One row per account at most:
	// `setDisplayName` looks before it inserts, because Zero has no unique
	// constraint to lean on any more than it has a foreign key.
	//
	// Stamped from birth on purpose. Nothing orders profiles by time today, but
	// D44's own note is that a column is permanent and a row written without one
	// never gets one — and this table has no rows yet, so the stamps cost
	// nothing here and could not be added for free later.
	profiles: table({
		userId: string(),
		displayName: string(),
		addedAt: string().default(''),
		changedAt: string().default(''),
	}).index('by_user', ['userId']),

	// `ink` is the household's colour token (D42) — the tile on the rail, in the
	// switcher and on the invite card. Added after the fact, so a row from before
	// it holds '' and `householdInk()` resolves that to a stable default.
	// **Nothing may sit between this table's closing brace and its `.index(...)`
	// chain, and no comment inside it may contain a brace followed by a paren.**
	// That is the compiler's parser, not a style rule. It finds a table with one
	// regex whose body is non-greedy up to the first such pair, and whose index
	// chain has to follow immediately. A comment in the gap drops **every**
	// index; a comment quoting that pair truncates the **columns**. Both
	// typecheck, both run under `sf dev`, and both surface only as a wrong
	// artifact — which is D27's rule reaching indexes as well as tables, and is
	// how the four below were found missing after they were written.
	//
	// `households` declared no index at all until 2026-09-02, so every read of
	// it walked `by_creation` — no sort, no filter and no search that was not a
	// full table scan. These four let the console ask its questions as ranges:
	//
	//   by_name    A–Z, and prefix search via gte(name, q) + lt(name, q + '\uffff')
	//   by_added   *Newest*, and the twelve month buckets as twelve ranges
	//   by_items   *Biggest pantry*, and each pantry-size band as one range
	//   by_changed *Last active*, and `dormant` as one range against a cutoff
	//
	// The last two are inert until their columns are maintained. They are here
	// now because the cost of adding an index is paid against the row count at
	// the time it is added — free today, a table rewrite at a million.
	households: table({
		name: string(),
		// Provenance only. Ownership is memberships.role — see D22.
		createdBy: string(),
		defaultThreshold: string().default('1'),
		ink: string().default(''),
		addedAt: string().default(''),

		// --- the rollup columns ---
		//
		// D44 refused `households` a `changedAt` because "nothing orders
		// households by recency". The console does, and it used to answer by
		// scanning four whole tables on every load (`lastActiveByHousehold`,
		// now deleted) — which is exactly what cannot happen at the scale this
		// is being built for. One maintained column replaced that function.
		//
		// **`bumpHousehold` is the only thing that may write any of these.**
		// Thirty hand-written increments would disagree exactly once, and there
		// is no aggregate to check a counter against, so a wrong one is wrong
		// forever with nothing to detect it.
		//
		// **`''` is *not counted*, and it is never zero.** Every household that
		// predates these columns holds it and nothing backfills (D44's standing
		// rule), so a reader that treats it as zero reports those households as
		// empty, ownerless and dormant at once. `isCounted` in
		// `shared/counts.ts` is that distinction; `readCount` deliberately
		// cannot make it, because its callers are rendering a number.
		//
		// `itemCount` is **zero-padded** and has to stay that way: text sorts
		// lexicographically, so an unpadded count puts a 9-item household above
		// a 10-item one. See `shared/counts.ts`, which owns the width.
		//
		// **All four are maintained now.** `bumpHousehold` is the single writer
		// and it is the only thing that may touch them; `readCount` reads them
		// and `isCounted` is what separates *this household holds nothing* from
		// *nothing has counted this household yet*. The two are different facts
		// and collapsing them reports every unrepaired household as empty.
		//
		// `ownerCount` exists rather than being derived from `memberCount`
		// because *no owner* is one of the three things Overview flags, and
		// answering it from the membership table is the scan this stage removes.
		// It is padded like the others for consistency of format, not because
		// anything sorts by it — a column whose encoding depends on whether
		// somebody later adds an index is a column that will be got wrong.
		changedAt: string().default(''),
		itemCount: string().default(''),
		memberCount: string().default(''),
		ownerCount: string().default(''),
	})
		.index('by_name', ['name'])
		.index('by_added', ['addedAt'])
		.index('by_items', ['itemCount'])
		.index('by_changed', ['changedAt']),

	memberships: table({
		householdId: id('households'),
		userId: string(),
		displayName: string(),
		// A denormalized copy of the account's avatar URL, for the same reason
		// `displayName` is one: the member list is a live query and must not join
		// a row per member to draw a face. '' means none — an account with no
		// Gravatar, and every row written before this column existed.
		picture: string().default(''),
		role: string().default('viewer'),
		// When this account joined this household, ISO 8601 UTC. D44 skipped this
		// table on the grounds that nothing ordered it by time; the console does
		// — *Recently joined* is one of `adminPeople`'s sorts and three surfaces
		// print the date — so by D44's own rule the app writes its own. Read it
		// through `joinedAtOf`, never raw: every row written before this column
		// holds nothing and falls back to the platform's `createdAt`.
		joinedAt: string().default(''),
	})
		.index('by_user', ['userId'])
		.index('by_household', ['householdId']),

	// by_creator exists because demoting a member has to revoke the invites
	// they created (D21).
	invites: table({
		householdId: id('households'),
		code: string(),
		role: string(),
		// ISO 8601 UTC, written at mint time as now + 14 days. "" means never.
		expiresAt: string(),
		createdBy: string(),
		revoked: boolean().default(false),
		// When the link was minted, and whether it ever turned into a person.
		// The invite is the whole growth loop and none of it was recorded: a
		// redemption wrote a membership and never touched the row that caused
		// it, so *how many links convert* was unanswerable in both directions.
		//
		// **First redemption only.** Nothing revokes an invite on use, so one
		// link can admit several people; what these answer is *did this
		// convert, and how long did it take*, which is the question a
		// conversion rate is made of.
		addedAt: string().default(''),
		redeemedAt: string().default(''),
		redeemedBy: string().default(''),
	})
		.index('by_code', ['code'])
		.index('by_household', ['householdId'])
		.index('by_creator', ['createdBy']),

	// `icon` is written as `''` and read by nothing: the glyph sets were cut
	// before v1 (D34) and the column is kept because dropping one needs
	// `sf db migrate --drop`, while filling it again later is additive.
	locations: table({
		householdId: id('households'),
		name: string(),
		ink: string(),
		icon: string(),
		// D44's pair. `addedAt` is ours because the platform's `createdAt` cannot
		// be set by app code and so cannot survive an undo's re-insert; `changedAt`
		// is ours for the same reason `updatedAt` is not used. Both default to ''
		// and nothing backfills, so `addedAtOf()` / `changedAtOf()` fall back.
		addedAt: string().default(''),
		changedAt: string().default(''),
	}).index('by_household', ['householdId']),

	// Same as `locations`: reserved, not read. See D34.
	types: table({
		householdId: id('households'),
		name: string(),
		ink: string(),
		icon: string(),
		// D44's pair. `addedAt` is ours because the platform's `createdAt` cannot
		// be set by app code and so cannot survive an undo's re-insert; `changedAt`
		// is ours for the same reason `updatedAt` is not used. Both default to ''
		// and nothing backfills, so `addedAtOf()` / `changedAtOf()` fall back.
		addedAt: string().default(''),
		changedAt: string().default(''),
	}).index('by_household', ['householdId']),

	// Stores never had the `icon` column at all.
	//
	// `kind` is what makes a store a *source* (D58) — `shop`, `grow` or `make`,
	// and `''` for every row written before it, which `toSourceKind()` resolves
	// to `shop`. That default is not a placeholder: every source in the app was
	// a shop until this column existed, so an unset value is the right answer
	// rather than a missing one.
	stores: table({
		householdId: id('households'),
		name: string(),
		ink: string(),
		kind: string().default(''),
		// D44's pair. `addedAt` is ours because the platform's `createdAt` cannot
		// be set by app code and so cannot survive an undo's re-insert; `changedAt`
		// is ours for the same reason `updatedAt` is not used. Both default to ''
		// and nothing backfills, so `addedAtOf()` / `changedAtOf()` fall back.
		addedAt: string().default(''),
		changedAt: string().default(''),
	}).index('by_household', ['householdId']),

	// `addedAt` is when the *item* entered the pantry, which outlives the row it
	// is on: undo re-inserts (D17), so a restored item is a new row with a new
	// `createdAt`, and this is what carries its place in *Recently added* across
	// that. Zero refuses an app-set `createdAt` outright, so the stamp has to be
	// ours, and `changedAt` is ours for the same reason. Both were added after
	// the fact, so a row from before them holds '' and the fallbacks in
	// `shared/stamp.ts` answer for it.
	items: table({
		householdId: id('households'),
		name: string(),
		locationId: id('locations'),
		qty: string(),
		threshold: string(),
		// How big *one* of the thing is, and in what unit — a pair that is never
		// half-set (`shared/size.ts`). `unit` holds a slug, never an
		// abbreviation, for the reason D32 gives about term colours: what is
		// stored must survive us changing what it prints.
		size: string().default(''),
		unit: string().default(''),
		// Never joins the run list, however low it gets. **Retired twice** — by
		// D60, which took its control away, and by D65, which replaced it with
		// `listRule` below. Nothing writes `true` any more and an edit through
		// the tri-state clears it. Kept because dropping a column needs
		// `sf db migrate --drop` while filling it again is additive (D34), and
		// because the rows that already hold it must keep behaving as they did.
		// `listRuleOf` is the one place the two are reconciled.
		offShoppingList: boolean().default(false),
		// Whether this item joins the run list at all (D65) — '' automatic,
		// 'always', or 'never'. *Low at* is the sentence *put this on the list
		// when I'm down to N*, and both overrides amend it.
		//
		// **Automatic is the absence of an override**, stored as '', so there is
		// no third literal to keep in step with this default — and so every row
		// written before the column reads back as the behaviour it already had.
		listRule: string().default(''),
		// When a grown thing is ready, as two month numbers — `'6'` to `'9'`, and
		// `''` for no season at all (D58). A pair that is never half-set, the way
		// `size` and `unit` are, and `shared/season.ts` owns that rule.
		//
		// **Months, not dates**: a season repeats and a date does not, so there is
		// no year, no locale and no format to store. `seasonFrom` above
		// `seasonTo` wraps the turn of the year — November to February is a real
		// season and reads as one.
		seasonFrom: string().default(''),
		seasonTo: string().default(''),
		notes: string().default(''),
		addedAt: string().default(''),
		changedAt: string().default(''),
	}).index('by_household', ['householdId']),

	itemTypes: table({
		itemId: id('items'),
		typeId: id('types'),
		householdId: id('households'),
	})
		.index('by_item', ['itemId'])
		.index('by_type', ['typeId'])
		.index('by_household', ['householdId']),

	itemStores: table({
		itemId: id('items'),
		storeId: id('stores'),
		householdId: id('households'),
	})
		.index('by_item', ['itemId'])
		.index('by_store', ['storeId'])
		.index('by_household', ['householdId']),

	// A person's shopping trip in one household (D66). **The thirteenth table.**
	//
	// One live row per person per household. It exists so the twenty-four hours
	// run **from the last tick rather than from the first** — D41's rule, which
	// per-claim expiry could not express without rewriting every claim on every
	// tick — and so a put-away has something to name.
	//
	// **`restocks.tripId` becomes a real row id with this**, which is what that
	// column's own note predicted: it was a client-minted opaque string, kept so
	// the rows written before trips existed could still be grouped afterwards.
	//
	// No `displayName` and no `picture`. The claim carries a `userId` and the
	// name is resolved from `memberships` at read time, so there is no second
	// copy of a person's name to go stale or to scrub. **That is the whole
	// privacy position**: a trip is transient, dies when it is put away or
	// abandoned, and goes with the account when it is deleted — nothing in the
	// larder itself ever records who touched a thing.
	trips: table({
		householdId: id('households'),
		userId: string(),
		at: string(),
	})
		.index('by_household', ['householdId'])
		.index('by_user', ['userId']),

	// One row: *I am getting this* (D66). **The fourteenth table.**
	//
	// **A claim is not a write.** It says somebody intends to get the item and
	// touches nothing about the item itself — the count is written once, at the
	// put-away. That is what makes it safe to share: the collision D41 rejected
	// sharing to avoid is the whole feature, because it is what stops the
	// double-buy.
	//
	// `householdId` is denormalised off the trip so the run list's read is one
	// indexed scan rather than a join, and so the cascade can find these rows
	// without walking trips first — the same trade `itemTypes` already makes.
	//
	// Expiry lives on the trip, not here, so a row is live exactly while its
	// trip is.
	claims: table({
		householdId: id('households'),
		tripId: id('trips'),
		itemId: id('items'),
		userId: string(),
		at: string(),
	})
		.index('by_household', ['householdId'])
		.index('by_trip', ['tripId'])
		.index('by_item', ['itemId']),

	// One trip's worth of counts, written once each by the put-away (D64). **The
	// twelfth table, and the second added for a reader that does not exist yet.**
	//
	// `profiles` was the first, and D44 is the argument for both: a column — or
	// a table — is permanent, nothing backfills it, and every put-away that
	// happens before this exists is a data point nobody can ever recover. The
	// reader is *trends, tier 2*: with three or more rows against an item, the
	// sheet's *Low at* hint can say **how often** you restock it.
	//
	// **Intervals are all it may ever promise.** A put-away doubles as drift
	// correction, so `toQty − fromQty` is sometimes a purchase and sometimes a
	// fix and nothing here can tell them apart. The dates are trustworthy; the
	// quantities are not, and the two counts are stored anyway because the row is
	// written once and read forever — a column that turns out to be needed later
	// cannot be added to rows that already exist.
	//
	// **No `userId`, and that is the privacy line rather than an omission.** A
	// name rides the *trip*, which is transient and dies with the account that
	// owns it; nothing in the larder itself ever records who touched a thing, so
	// deleting an account stays a clean operation rather than a scrubbing job.
	// `tripId` is the trip's own id and says only that several rows arrived
	// together.
	//
	// `kind` is the source's — shop, grow or make — copied rather than joined,
	// so a reader can tell a shop run from a harvest without asking whether the
	// source still exists or still carries the kind it had that day. '' when the
	// row named no source at all.
	//
	// No `changedAt`: a restock is an event and is never edited. `at` is ours
	// rather than the platform's `createdAt`, for D44's reason — a stamp this app
	// reads back is a stamp this app writes.
	restocks: table({
		householdId: id('households'),
		itemId: id('items'),
		tripId: string().default(''),
		fromQty: string(),
		toQty: string(),
		kind: string().default(''),
		at: string(),
	})
		.index('by_item', ['itemId'])
		.index('by_household', ['householdId']),

	// The admin console's audit log (D62). **The eleventh table, and the first
	// new one since `profiles`.**
	//
	// Two things about its shape are forced by the platform and worth reading
	// before editing it.
	//
	// **Every field is a string, including the counts**, because there is no
	// numeric type — the same constraint `qty` lives under. Nothing sorts on
	// them, so nothing is at risk from "10" < "2" here.
	//
	// **`held` is JSON in a string**, and that is the smaller of two bad
	// options. Zero has no array or JSON type; the alternative is five columns
	// that only a deletion row ever fills, and a column is permanent with
	// nothing to backfill it (D44). `shared/activity.ts` owns the encoding and
	// its decoder never throws, because a row is written once and read forever.
	//
	// **The denormalisation is deliberate and it is only here.** A deletion row
	// is the only surviving record of the thing it describes, so it carries its
	// own copy — `targetName`, `targetInk`, `targetId` and `held` — and an
	// `id()` pointing at a deleted household would resolve to nothing. Every
	// other row could join, and denormalises anyway so that one read answers.
	//
	// No `changedAt`: an audit row is never edited. `at` is ours rather than the
	// platform's `createdAt` for D44's reason — a stamp this app sorts by is a
	// stamp this app writes.
	// See `shared/lifecycle.ts` for what this deliberately does not hold. No id,
	// no name, no household, no account — a row says only that a thing of some
	// kind ended, when, and how old it was, which is what lets churn be measured
	// without keeping data about somebody who asked to be forgotten.
	deletions: table({
		kind: string(),
		at: string(),
		// Whole days, decimal, '' when the birth stamp predates D44.
		ageDays: string().default(''),
	})
		.index('by_at', ['at']),

	activity: table({
		at: string(),
		// '' for an actor that is not a person. See `ACTOR_KINDS`.
		actorId: string().default(''),
		actorName: string().default(''),
		actorKind: string().default('person'),
		action: string(),
		targetKind: string().default(''),
		targetId: string().default(''),
		targetName: string().default(''),
		// A household's colour token, so a deleted household's tile still draws
		// in the log. '' for every other target.
		targetInk: string().default(''),
		// A role, a name — whatever the action moved between. Both '' when the
		// action moved nothing.
		fromValue: string().default(''),
		toValue: string().default(''),
		held: string().default(''),
	}).index('by_at', ['at']),
};

export default capsule({
	name: 'Larder Log',
	schema,

	queries: {
		/**
		 * Who the caller is, by the only name anyone else in a household sees.
		 *
		 * The first thing the client asks, and the one query that can answer
		 * before there is a household to answer about — which is the point.
		 * Someone accepting an invite never sees *Name your household*, and they
		 * are exactly the person whose name other people need, so the name is
		 * collected before the path forks (D46).
		 *
		 * **`needsName` is not "has no profile row".** An account that predates
		 * this table carries the identity name it joined under on every
		 * membership it holds; sending it through a screen it has effectively
		 * already answered would be a wall in front of people who were using the
		 * app yesterday. So an inherited name grandfathers the account, and only
		 * an account with no name *anywhere* is stopped.
		 *
		 * Nothing here is the identity's own `displayName`. The client has that
		 * already and uses it to prefill the field — a suggestion is not an
		 * answer, and reporting one as `displayName` would make `needsName`
		 * disagree with the value beside it.
		 */
		profile: query(async (ctx): Promise<ProfileResult> => {
			if (! signedIn(ctx)) return { state: 'guest' };

			const row = await ctx.db.profiles
				.withIndex('by_user', (r) => r.eq('userId', ctx.auth.userId))
				.first();

			if (row) return { state: 'ready', displayName: row.displayName, needsName: false };

			const memberships = await collectAll(() => ctx.db.memberships
				.withIndex('by_user', (r) => r.eq('userId', ctx.auth.userId))
				);

			const inherited = pickDisplayName(...memberships.map((m) => m.displayName));

			return { state: 'ready', displayName: inherited, needsName: inherited === '' };
		}),

		/**
		 * Every household the caller belongs to, for the switcher.
		 *
		 * Deliberately thin: a name, this caller's role *there*, and an item
		 * count. Anything more would be a second copy of `household`, refetched
		 * every time any of them changed.
		 *
		 * Takes no argument, so it is the one subscription that survives a
		 * switch untouched — which is what lets the switcher stay on screen and
		 * keep its checkmark honest while the other two queries re-run.
		 */
		households: query(async (ctx): Promise<HouseholdListResult> => {
			if (! signedIn(ctx)) return { state: 'guest' };

			const rows = await collectAll(() => ctx.db.memberships
				.withIndex('by_user', (r) => r.eq('userId', ctx.auth.userId))
				);

			if (rows.length === 0) return { state: 'no-household' };

			const summaries: HouseholdSummary[] = [];

			for (const row of rows) {
				const household = await ctx.db.households.get(row.householdId);

				// A membership whose household is gone is skipped rather than
				// reported: there is nothing to switch to and nothing to fix.
				if (! household) continue;

				const items = await collectAll(() => ctx.db.items
					.withIndex('by_household', (r) => r.eq('householdId', row.householdId))
					);

				summaries.push({
					id: household.id,
					name: household.name,
					role: toRole(row.role),
					itemCount: items.length,
					// Resolved here, once, so the switcher and the rail never have
					// to decide what an unset colour looks like.
					ink: householdInk(household.ink, household.id),
				});
			}

			if (summaries.length === 0) return { state: 'no-household' };

			// Same ordering `selectMembership` defaults by, so the list's first
			// row is the one an unset selection lands on.
			summaries.sort((a, b) => a.id.localeCompare(b.id));

			return { state: 'ready', households: summaries };
		}),

		/**
		 * The account pane's one read — you, and what your deletion would do (D68).
		 *
		 * **It answers whether or not you are in a household.** `no-household` is
		 * not one of its states, because an account in none can still be named,
		 * exported and deleted — that is the simplest path through this flow
		 * rather than an edge of it. `profile` declines the same union for the
		 * same reason.
		 *
		 * **Five indexed reads per household, and no scan of anything.** The
		 * console's equivalent walks whole tables because it is answering about a
		 * space; this is answering about one person, and every read here is
		 * `by_household` on a household the caller is already in. That is what
		 * makes it affordable — but it is still not free, which is why the client
		 * subscribes only while the pane is pushed rather than beside `pantry`.
		 *
		 * The counts are per household and per taxonomy because a row set to
		 * *delete it* says on its own face what goes with it, and a number nobody
		 * can check is the one thing that screen must not print.
		 */
		account: query(async (ctx): Promise<AccountResult> => {
			if (! signedIn(ctx)) return { state: 'guest' };

			const userId = ctx.auth.userId;

			const mine = await collectAll(() => ctx.db.memberships
				.withIndex('by_user', (r) => r.eq('userId', userId))
				);

			const households: AccountHousehold[] = [];
			const invites: AccountInvite[] = [];
			const now = Date.now();

			const minted = await collectAll(() => ctx.db.invites
				.withIndex('by_creator', (r) => r.eq('createdBy', userId))
				);

			for (const row of mine) {
				const household = await ctx.db.households.get(row.householdId);

				// A membership pointing at a household that is gone. `id()` is not
				// a foreign key, so this is a real state rather than a defensive
				// flourish — and a row nobody can reach is not a household to
				// decide the fate of.
				if (! household) continue;

				const [members, items, locations, stores, types] = await Promise.all([
					collectAll(() => ctx.db.memberships.withIndex('by_household', (r) => r.eq('householdId', household.id))),
					collectAll(() => ctx.db.items.withIndex('by_household', (r) => r.eq('householdId', household.id))),
					collectAll(() => ctx.db.locations.withIndex('by_household', (r) => r.eq('householdId', household.id))),
					collectAll(() => ctx.db.stores.withIndex('by_household', (r) => r.eq('householdId', household.id))),
					collectAll(() => ctx.db.types.withIndex('by_household', (r) => r.eq('householdId', household.id))),
				]);

				households.push({
					id: household.id,
					name: household.name,
					ink: householdInk(household.ink, household.id),
					role: toRole(row.role),
					// Your own membership's stamp, which is what the account
					// export names — the pre-flight itself has no use for it.
					joinedAt: joinedAtOf(row),
					members: members.length,
					items: items.length,
					locations: locations.length,
					sources: stores.length,
					types: types.length,
					// The household's own word, so a garden household reads
					// *sources* on this screen exactly as its drawer does (D58).
					sourceWord: sourceGroupWord(stores.map((s) => ({ kind: toSourceKind(s.kind) }))),
					/*
					 * **Everyone else, whatever their role.** Receiving a household
					 * promotes them, and the confirm says so out loud — filtering to
					 * existing owners would hide the only candidate in a household
					 * that has exactly one.
					 */
					candidates: members
						.filter((m) => m.userId !== userId)
						.map((m) => ({
							id: m.id,
							name: m.displayName || 'Someone',
							picture: normalizeAvatarUrl(m.picture ?? ''),
							role: toRole(m.role),
						})),
				});

				for (const invite of minted) {
					if (invite.householdId !== household.id) continue;

					invites.push({
						household: household.name,
						role: toRole(invite.role),
						expiresAt: invite.expiresAt,
						live: ! invite.revoked && ! isExpired(invite.expiresAt, now),
					});
				}
			}

			// The same ordering the switcher takes, so the pre-flight lists the
			// households in the order the app has been listing them all along.
			households.sort((a, b) => a.id.localeCompare(b.id));

			return {
				state: 'ready',
				name: await accountNameOf(ctx.db, userId, ctx.auth),
				/*
				 * Empty in production and always will be (D56) — a Spacefast
				 * account carries no `email` claim. It is here because the export
				 * has to describe what is held rather than what would be nice, and
				 * an absent field is the honest answer.
				 */
				email: ctx.auth.email ?? '',
				// The pane needs this to explain itself, because the refusal's own
				// sentence never reaches a person in production.
				administers: isAdminId(userId, ctx.env[ADMIN_IDS_VAR]),
				households,
				invites,
			};
		}),

		/**
		 * The named household, its members, and its live invites.
		 *
		 * Separate from `pantry` so an item edit does not refetch the member
		 * list — the one split `invalidate()` actually makes worthwhile (D26).
		 */
		/**
		 * Every live claim in this household (D66) — who is getting what.
		 *
		 * **Its own query rather than a corner of `pantry`.** A tick by anybody
		 * invalidates this, and `pantry` carries the items, both join tables and
		 * all three taxonomies; folding claims in would refetch that for every
		 * member each time somebody ticked a row in a shop.
		 *
		 * **Expiry is applied on read as well as on write** — a trip older than
		 * the window simply is not returned. Pruning happens at write time (there
		 * is no scheduler, so a table nothing is adding to is a table nothing is
		 * pruning), and that means a household nobody is shopping in keeps its
		 * stale rows until somebody starts a trip. Filtering here is what makes
		 * that invisible rather than wrong.
		 *
		 * It carries no names. `household` already returns every member with a
		 * display name and a picture, so the client resolves a face from the id —
		 * which is what keeps a second copy of a person's name out of the
		 * database.
		 */
		claims: query(async (ctx, householdId: string): Promise<ClaimsResult> => {
			const state = await membershipState(ctx, householdId);

			if (state.kind === 'guest') return { state: 'guest' };
			if (state.kind === 'none') return { state: 'no-household' };

			const { membership } = state;
			const live = await liveTripsIn(ctx.db, membership.householdId, Date.now());
			const byTrip = new Set(live.map((t) => t.id));

			const rows = await collectAll(() => ctx.db.claims
				.withIndex('by_household', (r) => r.eq('householdId', membership.householdId))
				);

			return {
				state: 'ready',
				// The household this answers *for*. `selectMembership` heals a
				// request it cannot place, so the caller has to be able to tell.
				householdId: membership.householdId,
				// When it was computed, so a response that overtakes a newer one
				// can be recognised and dropped. See `ClaimsData`.
				answeredAt: Date.now(),
				claims: rows
					.filter((row) => byTrip.has(row.tripId))
					.map((row) => ({ itemId: row.itemId, userId: row.userId, tripId: row.tripId })),
			};
		}),

		household: query(async (ctx, householdId: string): Promise<HouseholdResult> => {
			const state = await membershipState(ctx, householdId);

			// Queries report rather than throw — a thrown query never reaches the
			// client at all. See `QueryState` in `shared/types.ts`.
			if (state.kind === 'guest') return { state: 'guest' };
			if (state.kind === 'none') return { state: 'no-household' };

			const { membership } = state;

			const household = await ctx.db.households.get(membership.householdId);

			// The membership row outlived its household. Recoverable from the
			// client's point of view: offer to start a new one.
			if (! household) return { state: 'no-household' };

			const members = await collectAll(() => ctx.db.memberships
				.withIndex('by_household', (range) => range.eq('householdId', membership.householdId))
				);

			const invites = await collectAll(() => ctx.db.invites
				.withIndex('by_household', (range) => range.eq('householdId', membership.householdId))
				);

			const now = Date.now();

			return {
				state: 'ready',
				// The id is the reconciliation point: the client stores a
				// selection per device, and this is the household the server
				// actually answered for (D33).
				household: {
					id: household.id,
					name: household.name,
					defaultThreshold: household.defaultThreshold,
					ink: householdInk(household.ink, household.id),
				},
				me: { membershipId: membership.id, userId: membership.userId, role: membership.role },
				members: members.map((m) => ({
					id: m.id,
					userId: m.userId,
					displayName: m.displayName,
					picture: m.picture ?? '',
					role: toRole(m.role),
				})),
				// Live codes only. A revoked or expired invite is noise in the UI,
				// and a code is a credential we needn't keep handing back out.
				invites: invites
					.filter((i) => ! i.revoked && ! isExpired(i.expiresAt, now))
					.map((i) => ({
						id: i.id,
						code: i.code,
						role: toRole(i.role),
						expiresAt: i.expiresAt,
						createdBy: i.createdBy,
					})),
			};
		}),

		/**
		 * The whole pantry in one payload: items, their join rows, and all three
		 * taxonomies.
		 *
		 * One query rather than several is deliberate (D26). Zero re-runs a live
		 * query whole or not at all, so splitting this would trade real
		 * complexity for savings that round to zero — the join rows dominate the
		 * payload and they refetch with the items however it is carved up.
		 */
		pantry: query(async (ctx, householdId: string): Promise<PantryResult> => {
			const state = await membershipState(ctx, householdId);

			if (state.kind === 'guest') return { state: 'guest' };
			if (state.kind === 'none') return { state: 'no-household' };

			// Not necessarily the id that was asked for: `membershipState` falls
			// back when the caller is no longer a member of the one they named.
			const resolvedId = state.membership.householdId;

			const [items, itemTypes, itemStores, locations, types, stores] = await Promise.all([
				collectAll(() => ctx.db.items.withIndex('by_household', (r) => r.eq('householdId', resolvedId))),
				collectAll(() => ctx.db.itemTypes.withIndex('by_household', (r) => r.eq('householdId', resolvedId))),
				collectAll(() => ctx.db.itemStores.withIndex('by_household', (r) => r.eq('householdId', resolvedId))),
				collectAll(() => ctx.db.locations.withIndex('by_household', (r) => r.eq('householdId', resolvedId))),
				collectAll(() => ctx.db.types.withIndex('by_household', (r) => r.eq('householdId', resolvedId))),
				collectAll(() => ctx.db.stores.withIndex('by_household', (r) => r.eq('householdId', resolvedId))),
			]);

			// Joined here rather than in the client so the payload is
			// self-describing, and because the client would otherwise rebuild
			// these maps on every refetch — and refetches are the common case.
			const typesByItem = new Map<string, string[]>();
			for (const row of itemTypes) {
				const list = typesByItem.get(row.itemId) ?? [];
				list.push(row.typeId);
				typesByItem.set(row.itemId, list);
			}

			const storesByItem = new Map<string, string[]>();
			for (const row of itemStores) {
				const list = storesByItem.get(row.itemId) ?? [];
				list.push(row.storeId);
				storesByItem.set(row.itemId, list);
			}

			return {
				state: 'ready',
				items: items.map((item) => ({
					id: item.id,
					name: item.name,
					locationId: item.locationId,
					qty: item.qty,
					threshold: item.threshold,
					size: item.size,
					unit: item.unit,
					offShoppingList: item.offShoppingList,
					// **Coalesced here and nowhere else.** `.default('')` applies to
					// an insert and does not backfill, so every row written before
					// this column reads back `null` — and the generated row type
					// still says `string`, so nothing downstream would catch it.
					// The rule that column added after rows exist is nullable, and
					// the type will not say so.
					listRule: item.listRule ?? '',
					seasonFrom: item.seasonFrom,
					seasonTo: item.seasonTo,
					notes: item.notes,
					typeIds: typesByItem.get(item.id) ?? [],
					storeIds: storesByItem.get(item.id) ?? [],
					// Zero's own stamp (D35). Nothing writes it, and nothing can.
					createdAt: item.createdAt,
					// Ours, and the ones every ordering in the app actually uses —
					// see `shared/stamp.ts`. Both are `''` on a row written before
					// the columns, which is what the fallbacks are for.
					addedAt: item.addedAt,
					changedAt: item.changedAt,
				})),
				// A–Z, once and here, so the drawer's filters, the item sheet's
				// chips and the shopping list's cards cannot disagree about the
				// order of the same three lists.
				locations: byName(locations).map(termDto),
				types: byName(types).map(termDto),
				stores: byName(stores).map(sourceDto),
			};
		}),

		/**
		 * What an invite link says about itself, to whoever is holding it.
		 *
		 * **The one query that answers a guest.** Every other read resolves a
		 * membership first; this one cannot, because the whole point of the
		 * `?join=` landing is to tell a signed-out stranger which household they
		 * have been asked into and by whom. The code is the authorization.
		 *
		 * What it will not do is confirm that a code *existed*. Unknown,
		 * malformed and **revoked** all return the same bare `invalid`, matching
		 * `redeemInvite`'s refusal to distinguish them — naming the household
		 * behind a dead link would tell a stranger something about it. Expiry is
		 * the exception the design asks for: an expired code is one someone was
		 * genuinely given, and the screen exists to say who to ask for another.
		 */
		invitePreview: query(async (ctx, rawCode: string): Promise<InvitePreviewResult> => {
			const code = normalizeCode(rawCode);

			if (! isCodeShaped(code)) return { state: 'invalid' };

			const invite = await ctx.db.invites
				.withIndex('by_code', (r) => r.eq('code', code))
				.first();

			if (! invite || invite.revoked) return { state: 'invalid' };

			const row = await ctx.db.households.get(invite.householdId);

			// The invite outlived its household. Nothing to join and nothing to
			// explain, so it is the same dead link as a revoked one.
			if (! row) return { state: 'invalid' };

			const members = await collectAll(() => ctx.db.memberships
				.withIndex('by_household', (r) => r.eq('householdId', invite.householdId))
				);

			// The household's own colour now, not its first location's — which is
			// what this stood in for until `households.ink` existed (D42). The
			// card and the rail still agree the moment you land inside, and they
			// agree on something somebody chose.
			const household = { name: row.name, ink: householdInk(row.ink, row.id) };

			// Checked before expiry: someone who is already in is already in, and
			// telling them a link they cannot use has also run out would be two
			// pieces of bad news for one non-problem.
			if (signedIn(ctx) && members.some((m) => m.userId === ctx.auth.userId)) {
				return { state: 'member', household, householdId: invite.householdId };
			}

			const inviter = members.find((m) => m.userId === invite.createdBy)?.displayName ?? 'an owner';
			const role = toRole(invite.role);

			if (isExpired(invite.expiresAt, Date.now())) {
				return { state: 'expired', household, role, inviter };
			}

			return { state: 'valid', household, role, inviter, expiresAt: invite.expiresAt };
		}),

		/**
		 * Whether the caller administers the space.
		 *
		 * The one console query that is cheap enough to run on every load, and
		 * the only one anybody who is not an administrator ever calls: the
		 * account menu subscribes to it to decide whether to draw its *Admin*
		 * row, and everything else in the console is behind that row.
		 *
		 * It answers `false` rather than refusing, because it *is* the refusal —
		 * the two console queries below use `denied`, and this one is what stops
		 * a non-administrator from reaching them in the first place.
		 */
		adminAccess: query(async (ctx): Promise<AdminAccessResult> => {
			/*
			 * `writesHeld` rides along rather than being a second query or a
			 * constant the client reads for itself. The rule depends on *who is
			 * asking* now — a dev guest is exempt — and a client that worked that
			 * out from its own identity would be a second copy of a security
			 * rule, which is the arrangement `termBlock` exists to avoid.
			 */
			// A non-administrator is told `true`, which is the safe direction: it
			// is not a permission (`requireAdminWrite` re-checks everything), it
			// is what the client would render if it ever asked.
			return {
				admin: administers(ctx),
				writesHeld: ! administers(ctx) || adminWritesHeldFor(ctx.auth),
			};
		}),

		/**
		 * Overview — four cards, twelve months, and what needs attention.
		 *
		 * **Four tables now, and it used to be seven.** Every *per-household*
		 * question — how many items, how many members, is there an owner, when
		 * was it last touched — is a column on the row this walk already has,
		 * maintained by `bumpHousehold`. That deleted `lastActiveByHousehold`,
		 * which read `items`, `locations`, `types` and `stores` **whole** on
		 * every load; at eighteen seeded terms per household those three term
		 * tables were the largest block of rows this query touched, and they are
		 * gone rather than made cheaper.
		 *
		 * **What is still a scan, and why each one is still here:**
		 *
		 * - `households` — the walk itself. Removing it means driving the list
		 *   off `by_name` / `by_items` / `by_changed` with `paginate`, which is
		 *   a different piece of work: search becomes a prefix range and each
		 *   chip becomes its own range read.
		 * - `memberships` — *People* and *N new people* are counts of **distinct
		 *   accounts across the space**, and there is no accounts table to ask.
		 *   A per-household column cannot answer a question whose unit is not a
		 *   household.
		 * - `items` — `newItems` needs a per-row stamp inside a window. The
		 *   total no longer needs the scan; the delta still does.
		 * - `restocks` — the trips series, for the same reason.
		 *
		 * All three of those are month buckets and space totals — stages 3 and
		 * 4 in `.claude/docs/design/scale.md`, and both are counters, which is
		 * what the concurrency question gates. Stage 2 is the half that did not
		 * have to wait for an answer, because these columns are written only by
		 * the handful of people inside one household.
		 */
		adminSummary: query(async (ctx): Promise<AdminSummaryResult> => {
			if (! administers(ctx)) return { state: 'denied' };

			const nowIso = new Date().toISOString();
			// `invites` is no longer read: *Live invites* was the weakest of the
			// four cards — a small state number — and its slot went to *Active*,
			// which answers whether anybody is using the app. Dropping the card
			// dropped a whole table scan with it.
			const [households, memberships, items, restocks] = await Promise.all([
				collectAll(() => ctx.db.households.withIndex('by_creation')),
				collectAll(() => ctx.db.memberships.withIndex('by_creation')),
				collectAll(() => ctx.db.items.withIndex('by_creation')),
				collectAll(() => ctx.db.restocks.withIndex('by_creation')),
			]);

			// One pass each, keyed by household, so the per-household questions
			// below are lookups rather than a filter per household.
			const owners = new Set<string>();
			const people = new Set<string>();
			const memberFirstSeen = new Map<string, string>();
			const memberCount = new Map<string, number>();

			for (const m of memberships) {
				if (toRole(m.role) === 'owner') owners.add(m.householdId);

				people.add(m.userId);
				memberCount.set(m.householdId, (memberCount.get(m.householdId) ?? 0) + 1);

				// The earliest membership an account holds is the closest thing
				// to when it joined — there is no accounts table to ask.
				const joined = joinedAtOf(m);
				const seen = memberFirstSeen.get(m.userId);

				if (! seen || joined < seen) memberFirstSeen.set(m.userId, joined);
			}

			let noOwner = 0, dormant = 0, empty = 0, active = 0, uncounted = 0;
			// One entry per household, **zeros included** — a map keyed by the
			// households that *have* items would drop every empty one and leave
			// the first band reading zero forever.
			const sizes: number[] = [];

			// One entry per household here too, and for the same reason `sizes` is:
			// a household with no memberships at all is an orphan, and counting
			// only the ones that have some would drop it from the split rather
			// than counting it as solo.
			const members: number[] = [];

			for (const h of households) {
				/*
				 * **Every per-household figure below now reads a column** — this
				 * is the whole of what stage 2 buys. `lastActiveByHousehold` used
				 * to answer the stamp by reading `items`, `locations`, `types`
				 * and `stores` *whole*, which at eighteen seeded terms per
				 * household is the largest single block of rows this query
				 * touched. It is gone.
				 *
				 * `isCounted` rather than `readCount` for the guard, because the
				 * two states this has to keep apart — *holds nothing* and *has
				 * never been counted* — are the same number through `readCount`
				 * and opposite facts on the screen. A household nobody has
				 * repaired yet is excluded from all four tallies and from both
				 * distributions, and reported separately, rather than being
				 * silently filed as an empty, dormant, ownerless pantry.
				 */
				if (! isCounted(h.itemCount) || ! isCounted(h.memberCount) || ! isCounted(h.ownerCount)) {
					uncounted++;
					continue;
				}

				const held = readCount(h.itemCount);
				const seen = h.changedAt || addedAtOf(h);

				if (readCount(h.ownerCount) === 0) noOwner++;
				if (isDormant(seen, nowIso)) dormant++;
				// Not the complement of dormant: 30 days against 90, and an
				// unmeasured household is neither.
				if (isActive(seen, nowIso)) active++;
				if (! held) empty++;

				sizes.push(held);
				members.push(readCount(h.memberCount));
			}

			const sharing = sharingSplit(members);

			const months = monthKeysBack(nowIso);
			// Per month, and therefore not a running total: these bars sum to
			// what arrived in the window, never to the card's figure.
			const series = countByMonth(households.map((h) => addedAtOf(h)), months)
				.map((value, i) => ({
					month: months[i],
					// The year rides the ends only, which is what the board
					// draws: `Sep 2025 · Dec · Mar · Jun · Aug 2026`.
					label: monthLabel(months[i], i === 0 || i === months.length - 1),
					value,
				}));

			return {
				state: 'ready',
				households: households.length,
				people: people.size,
				items: items.length,
				active,
				solo: sharing.solo,
				shared: sharing.shared,
				newHouseholds: households.filter((h) => isWithinDays(addedAtOf(h), nowIso, RECENT_DAYS)).length,
				newPeople: [...memberFirstSeen.values()]
					.filter((iso) => isWithinDays(iso, nowIso, RECENT_DAYS)).length,
				newItems: items.filter((i) => isWithinDays(addedAtOf(i), nowIso, RECENT_DAYS)).length,
				noOwner,
				dormant,
				empty,
				uncounted,
				series,
				trips: tripsByMonth(restocks, months).map((value, i) => ({
					month: months[i],
					label: monthLabel(months[i], i === 0 || i === months.length - 1),
					value,
				})),
				buckets: itemBuckets(sizes),
			};
		}),

		/**
		 * The household list — searched, filtered by one chip, sorted, and paged.
		 *
		 * **Every one of those four happens here, over the whole scan**, and
		 * that is deliberate rather than lazy. `paginate()` exists and would
		 * page the raw table cheaply, but it cannot answer *matching* or the
		 * three chip counts without reading the rest anyway, and it cannot sort
		 * by a derived column at all — items and last-active are computed, not
		 * stored. Slicing a list we already hold is the honest version of what
		 * the boards draw. The scaling note on `adminSummary` applies here too.
		 *
		 * **Search covers the name and the id, and nothing else.** The boards say
		 * *"Search by name, member or email"*; there are no emails to search
		 * (D56 — a Spacefast account carries no `email` claim and a handler is
		 * only ever told about its caller), so the placeholder says what is true.
		 * Member names are searched, because those the app does hold.
		 */
		adminHouseholds: query(async (
			ctx,
			args: {
				search?: string;
				filter?: AdminHouseholdFilter;
				sort?: AdminHouseholdSort;
				offset?: number;
				pageSize?: number;
			} = {}
		): Promise<AdminHouseholdsResult> => {
			if (! administers(ctx)) return { state: 'denied' };

			const nowIso = new Date().toISOString();
			/*
			 * **`items` is not read here any more, and neither are the three term
			 * tables.** Both the item count and the last-active stamp are columns
			 * on the row this walk already has, so what is left is the households
			 * themselves and the memberships — and memberships stay only because
			 * this list draws faces and searches member names, neither of which
			 * is a count.
			 */
			const [households, memberships] = await Promise.all([
				collectAll(() => ctx.db.households.withIndex('by_creation')),
				collectAll(() => ctx.db.memberships.withIndex('by_creation')),
			]);

			const byHousehold = new Map<string, typeof memberships>();

			for (const m of memberships) {
				const list = byHousehold.get(m.householdId);

				if (list) list.push(m); else byHousehold.set(m.householdId, [m]);
			}

			const rows: AdminHouseholdRow[] = households.map((h) => {
				const members = byHousehold.get(h.id) ?? [];
				const active = h.changedAt || addedAtOf(h);
				const count = readCount(h.itemCount);

				/*
				 * **The list is more forgiving than Overview, deliberately.** A
				 * summary that files an uncounted household as empty publishes a
				 * wrong number; a *row* that does is one line an administrator is
				 * looking straight at, beside the household's name, with the
				 * repair one call away. So the row renders the count it has and
				 * the flags fall out of it — but `noOwner` is read from the
				 * memberships that are in hand rather than from `ownerCount`,
				 * because that is the flag with a destructive fix attached and it
				 * must never be raised by a column nobody has written.
				 */
				return {
					id: h.id,
					name: h.name,
					// Resolved here for the reason `HouseholdSummary.ink` is:
					// every row written before D42 holds '' and one resolver
					// beats a `householdInk()` at every render site.
					ink: householdInk(h.ink, h.id),
					// Three faces then a count — the stacked trio's existing cap
					// (D55), applied before the DTO leaves rather than after.
					faces: members.slice(0, 3).map((m) => ({ name: m.displayName, picture: m.picture ?? '' })),
					members: members.length,
					items: count,
					lastActive: active,
					noOwner: ! members.some((m) => toRole(m.role) === 'owner'),
					dormant: isDormant(active, nowIso),
					empty: isCounted(h.itemCount) && count === 0,
				};
			});

			const counts = {
				noOwner: rows.filter((r) => r.noOwner).length,
				dormant: rows.filter((r) => r.dormant).length,
				empty: rows.filter((r) => r.empty).length,
			};

			const filter = args.filter ?? 'all';
			const chipped = rows.filter((r) => (
				filter === 'no-owner' ? r.noOwner
					: filter === 'dormant' ? r.dormant
					: filter === 'empty' ? r.empty
					: true
			));

			const needle = (args.search ?? '').trim().toLowerCase();
			const searched = needle
				? chipped.filter((r) => (
					r.name.toLowerCase().includes(needle) ||
					r.id.toLowerCase().includes(needle) ||
					(byHousehold.get(r.id) ?? []).some((m) => m.displayName.toLowerCase().includes(needle))
				))
				: chipped;

			const sort = args.sort ?? 'name';

			searched.sort((a, b) => {
				// A tie always falls back to the name, so a page boundary lands
				// in the same place twice. Row ids are sequential integers on the
				// hosted runtime and would sort as strings, which is not an order
				// anybody could predict.
				//
				// `relevance` is only reachable while `needle` is set — the client
				// drops it the moment the field is cleared — but it is checked
				// against the needle here too, because a stale argument must not
				// leave every row scoring zero and the list in id order.
				if (sort === 'relevance' && needle) {
					const sa = matchScore(needle, a.name, memberNames(byHousehold, a.id), a.id);
					const sb = matchScore(needle, b.name, memberNames(byHousehold, b.id), b.id);

					return sb - sa || a.name.localeCompare(b.name);
				}

				if (sort === 'items') return b.items - a.items || a.name.localeCompare(b.name);
				if (sort === 'members') return b.members - a.members || a.name.localeCompare(b.name);
				if (sort === 'recent') {
					// '' sorts last rather than first: a household with nothing
					// readable is not the most recently active one.
					if (a.lastActive !== b.lastActive) {
						if (! a.lastActive) return 1;
						if (! b.lastActive) return -1;

						return a.lastActive < b.lastActive ? 1 : -1;
					}

					return a.name.localeCompare(b.name);
				}

				return a.name.localeCompare(b.name);
			});

			const pageSize = Math.min(Math.max(Math.floor(args.pageSize ?? ADMIN_PAGE_SIZE), 1), 100);
			// Clamped against the *filtered* length, so narrowing the chip while
			// on page 4 lands on the last page rather than on nothing.
			const offset = Math.max(0, Math.min(Math.floor(args.offset ?? 0), Math.max(0, searched.length - 1)));

			return {
				state: 'ready',
				rows: searched.slice(offset, offset + pageSize),
				matching: searched.length,
				total: rows.length,
				counts,
				offset,
				pageSize,
			};
		}),

		/**
		 * One household — board 3, the page the metadata-only rule is about.
		 *
		 * **Everything it returns is a count, a name, or a date.** That is not an
		 * observation about what happens to be here; it is the rule, and this
		 * handler is where it is enforceable. There is no route from it to an
		 * item, a note, a quantity or a term name, and adding one would need this
		 * comment deleted first.
		 *
		 * Unlike the two above, it reads through `by_household` rather than
		 * scanning: it is about one row, so the indexes the app already declares
		 * are exactly right and there is nothing to bucket.
		 */
		adminHousehold: query(async (
			ctx,
			householdId: string
		): Promise<AdminHouseholdDetailResult> => {
			if (! administers(ctx)) return { state: 'denied' };

			const household = householdId ? await ctx.db.households.get(householdId) : null;

			// A household deleted while the page was open, or an id typed wrong.
			// It is a state rather than a throw for the reason every query here is
			// (see `QueryState`) — a query that throws never emits at all.
			if (! household) return { state: 'missing' };

			const id = household.id;
			const [memberships, items, locations, types, stores, invites] = await Promise.all([
				collectAll(() => ctx.db.memberships.withIndex('by_household', (r) => r.eq('householdId', id))),
				collectAll(() => ctx.db.items.withIndex('by_household', (r) => r.eq('householdId', id))),
				collectAll(() => ctx.db.locations.withIndex('by_household', (r) => r.eq('householdId', id))),
				collectAll(() => ctx.db.types.withIndex('by_household', (r) => r.eq('householdId', id))),
				collectAll(() => ctx.db.stores.withIndex('by_household', (r) => r.eq('householdId', id))),
				collectAll(() => ctx.db.invites.withIndex('by_household', (r) => r.eq('householdId', id))),
			]);

			const nowIso = new Date().toISOString();
			const now = Date.now();
			const months = monthKeysBack(nowIso);

			// Items added per month, on rows this handler has already collected
			// for `holds.items` — so the chart costs the arithmetic and not a
			// second scan. `addedAtOf` rather than `changedAtOf`: an item edited
			// last week did not arrive last week, and a chart that said so would
			// make every active household look like it was still filling up.
			const series = countByMonth(items.map((i) => addedAtOf(i)), months)
				.map((value, i) => ({
					month: months[i],
					label: monthLabel(months[i], i === 0 || i === months.length - 1),
					value,
				}));

			// The newest stamp on anything this household owns. It is computed
			// rather than read off `changedAt` because this page has already
			// paid for all four scoped reads — and because a page about one
			// household is the right place for the answer to come from the rows
			// rather than from a counter that could have drifted.
			let lastActive = '';

			for (const row of [...items, ...locations, ...types, ...stores]) {
				const iso = changedAtOf(row);

				if (iso && iso > lastActive) lastActive = iso;
			}

			// Who minted each invite, by name. `createdBy` is a userId and the
			// membership rows are the only place this app can turn one into a
			// name — an account that has since left the household resolves to ''
			// and the client says *someone who has left* rather than an id.
			const nameOf = new Map<string, string>();

			for (const m of memberships) nameOf.set(m.userId, m.displayName);

			const owned = memberships.some((m) => toRole(m.role) === 'owner');

			return {
				state: 'ready',
				createdAt: addedAtOf(household) || household.createdAt,
				household: {
					id,
					name: household.name,
					ink: householdInk(household.ink, id),
					faces: memberships.slice(0, 3).map((m) => ({ name: m.displayName, picture: m.picture ?? '' })),
					members: memberships.length,
					items: items.length,
					lastActive,
					noOwner: ! owned,
					dormant: isDormant(lastActive, nowIso),
					empty: items.length === 0,
				},
				holds: {
					items: items.length,
					locations: locations.length,
					stores: stores.length,
					types: types.length,
				},
				members: memberships.map((m) => ({
					id: m.id,
					userId: m.userId,
					name: m.displayName,
					picture: m.picture ?? '',
					role: toRole(m.role),
					joinedAt: joinedAtOf(m),
				})),
				series,
				// Live only. A revoked or expired invite is not a fact about the
				// household any more, and a list that kept them would grow forever
				// while saying less each time.
				invites: invites
					.filter((i) => ! i.revoked && ! isExpired(i.expiresAt, now))
					.map((i) => ({
						id: i.id,
						role: toRole(i.role),
						expiresAt: i.expiresAt,
						issuedAt: i.createdAt,
						issuedBy: nameOf.get(i.createdBy) ?? '',
						// **No `code`.** See `AdminInvite` — a code is the
						// authorization, so putting one here would hand every
						// administrator a quiet way into any pantry, which is the
						// one thing this page's own refusal card promises not to do.
					})),
			};
		}),

		/**
		 * Board 4 — every person in the space.
		 *
		 * **A person is not a row.** There is no accounts table, so this is the
		 * union of `profiles` and the distinct `userId`s across `memberships`,
		 * and both halves are needed: a profile with no memberships is somebody
		 * who named themselves and left everywhere, and a membership with no
		 * profile is an account that predates D46.
		 *
		 * **There is no `LAST SEEN` column and the boards' one cannot be built.**
		 * Nothing records a session. The nearest derivable value — the newest
		 * activity across the households they belong to — is activity by *anyone*
		 * in them, so it would attribute another member's edit to this person and
		 * be confidently wrong on the exact screen an administrator would trust
		 * it. `JOINED` takes the column instead, which is a date this app really
		 * holds.
		 *
		 * The same scan caveat as `adminSummary` applies, and more so: this reads
		 * five tables end to end.
		 */
		adminPeople: query(async (
			ctx,
			args: {
				search?: string;
				filter?: AdminPeopleFilter;
				sort?: AdminPeopleSort;
				offset?: number;
				pageSize?: number;
			} = {}
		): Promise<AdminPeopleResult> => {
			if (! administers(ctx)) return { state: 'denied' };

			const adminIds = parseAdminIds(ctx.env[ADMIN_IDS_VAR]);
			const [households, memberships, profiles] = await Promise.all([
				collectAll(() => ctx.db.households.withIndex('by_creation')),
				collectAll(() => ctx.db.memberships.withIndex('by_creation')),
				collectAll(() => ctx.db.profiles.withIndex('by_creation')),
			]);

			const rows = buildPeople(households, memberships, profiles, adminIds, ctx.auth);

			const counts = {
				admins: rows.filter((r) => r.admin).length,
				noHousehold: rows.filter((r) => r.households === 0).length,
				soleOwner: rows.filter((r) => r.soleOwnerOf > 0).length,
			};

			const filter = args.filter ?? 'all';
			const chipped = rows.filter((r) => (
				filter === 'admins' ? r.admin
					: filter === 'no-household' ? r.households === 0
					: filter === 'sole-owner' ? r.soleOwnerOf > 0
					: true
			));

			const needle = (args.search ?? '').trim().toLowerCase();
			const searched = needle
				? chipped.filter((r) => (
					r.name.toLowerCase().includes(needle) ||
					r.userId.toLowerCase().includes(needle) ||
					r.tiles.some((t) => t.name.toLowerCase().includes(needle))
				))
				: chipped;

			const sort = args.sort ?? 'name';

			searched.sort((a, b) => {
				if (sort === 'relevance' && needle) {
					const sa = matchScore(needle, a.name, a.tiles.map((t) => t.name), a.userId);
					const sb = matchScore(needle, b.name, b.tiles.map((t) => t.name), b.userId);

					return sb - sa || a.name.localeCompare(b.name);
				}

				if (sort === 'households') return b.households - a.households || a.name.localeCompare(b.name);
				if (sort === 'joined') {
					if (a.joinedAt !== b.joinedAt) {
						if (! a.joinedAt) return 1;
						if (! b.joinedAt) return -1;

						return a.joinedAt < b.joinedAt ? 1 : -1;
					}

					return a.name.localeCompare(b.name);
				}

				return a.name.localeCompare(b.name);
			});

			const pageSize = Math.min(Math.max(Math.floor(args.pageSize ?? ADMIN_PAGE_SIZE), 1), 100);
			const offset = Math.max(0, Math.min(Math.floor(args.offset ?? 0), Math.max(0, searched.length - 1)));

			return {
				state: 'ready',
				rows: searched.slice(offset, offset + pageSize),
				matching: searched.length,
				total: rows.length,
				counts,
				offset,
				pageSize,
			};
		}),

		/**
		 * Board 5 — one account: where they are a member, and what they can do
		 * there.
		 *
		 * **What those households hold stays behind the same line the household
		 * page draws.** A member count and an item count are counts; there is no
		 * route from here to anything inside one.
		 *
		 * `soleOwner` on each household is the whole reason this query exists in
		 * the shape it does — it is what the pre-flight has to ask about, and
		 * computing it client-side would mean shipping every membership in the
		 * space to work out one person's.
		 */
		adminAccount: query(async (ctx, userId: string): Promise<AdminAccountResult> => {
			if (! administers(ctx)) return { state: 'denied' };

			if (! userId) return { state: 'missing' };

			const adminIds = parseAdminIds(ctx.env[ADMIN_IDS_VAR]);
			const [households, memberships, profiles, invites] = await Promise.all([
				collectAll(() => ctx.db.households.withIndex('by_creation')),
				collectAll(() => ctx.db.memberships.withIndex('by_creation')),
				collectAll(() => ctx.db.profiles.withIndex('by_creation')),
				collectAll(() => ctx.db.invites.withIndex('by_creator', (r) => r.eq('createdBy', userId))),
			]);

			const person = buildPeople(households, memberships, profiles, adminIds, ctx.auth)
				.find((p) => p.userId === userId);

			// An id that names nobody. It is a state and not a throw for the
			// reason every query here is — a throw never emits at all.
			if (! person) return { state: 'missing' };

			const items = await collectAll(() => ctx.db.items.withIndex('by_creation'));
			const itemCount = new Map<string, number>();

			for (const it of items) {
				itemCount.set(it.householdId, (itemCount.get(it.householdId) ?? 0) + 1);
			}

			const byId = new Map(households.map((h) => [h.id, h]));
			const mine = memberships.filter((m) => m.userId === userId);

			return {
				state: 'ready',
				person,
				households: mine.flatMap((m) => {
					const household = byId.get(m.householdId);

					// A membership pointing at a household that is gone. `id()` is
					// not a foreign key, so this is a real state rather than a
					// defensive flourish — and a row nobody can reach is not a
					// household this person is in.
					if (! household) return [];

					const siblings = memberships.filter((x) => x.householdId === m.householdId);
					const owners = siblings.filter((x) => toRole(x.role) === 'owner').length;

					/*
					 * **`fateOf`, so the dialog asks for exactly what the handler
					 * requires.** It was `role === 'owner' && owners === 1`, which
					 * is *only owner* rather than *needs a decision* and made a
					 * household the person is alone in a question with one answer.
					 */
					const fate = fateOf(toRole(m.role), siblings.length, owners);

					return [{
						id: household.id,
						name: household.name,
						ink: householdInk(household.ink, household.id),
						role: toRole(m.role),
						members: siblings.length,
						items: itemCount.get(household.id) ?? 0,
						fate,
						// Only where the pre-flight will ask. A list of names per
						// household per person is the whole membership table
						// arriving to answer a question almost nobody asks.
						candidates: fate === 'decide'
							? siblings
								.filter((x) => x.userId !== userId)
								.map((x) => ({ id: x.id, name: x.displayName || 'Someone' }))
							: [],
					}];
				}),
				invitesIssued: invites.filter((i) => ! i.revoked && ! isExpired(i.expiresAt, Date.now())).length,
				isSelf: userId === ctx.auth.userId,
			};
		}),

		/**
		 * Board 9 — the audit log, newest first.
		 *
		 * **This is the one place in Larder Log where an observed timestamp is
		 * the point.** The item sheet deliberately shows no timestamps anywhere;
		 * that rule is about items, and a log whose rows cannot be placed in time
		 * is not a log.
		 *
		 * It is the console's only query that reads **one** table, and the only
		 * one that pages with `by_at` rather than by slicing a scan — an audit
		 * log is append-only and ordered by the column it is indexed on, which is
		 * the shape `paginate()` was built for. It is still `collect()`d here for
		 * the total, which is the same scan caveat as everywhere else and the
		 * first thing to change when the table has real rows in it.
		 *
		 * `targetGone` is resolved per row because only the server can look, and
		 * it is what lets an opened entry say on its own face that the thing it
		 * describes no longer exists.
		 */
		adminActivity: query(async (
			ctx,
			args: { offset?: number; pageSize?: number } = {}
		): Promise<AdminActivityResult> => {
			if (! administers(ctx)) return { state: 'denied' };

			const all = await collectAll(() => ctx.db.activity.withIndex('by_at').order('desc'));
			const pageSize = Math.min(Math.max(Math.floor(args.pageSize ?? ADMIN_PAGE_SIZE), 1), 100);
			const offset = Math.max(0, Math.min(Math.floor(args.offset ?? 0), Math.max(0, all.length - 1)));
			const page = all.slice(offset, offset + pageSize);

			// One lookup per row on the page, not per row in the table.
			const rows = await Promise.all(page.map(async (r) => {
				let targetGone = false;

				if (r.targetKind === 'household' && r.targetId) {
					targetGone = ! (await ctx.db.households.get(r.targetId));
				} else if (r.targetKind === 'account' && r.targetId) {
					const still = await ctx.db.memberships
						.withIndex('by_user', (q) => q.eq('userId', r.targetId))
						.first();
					const profile = await ctx.db.profiles
						.withIndex('by_user', (q) => q.eq('userId', r.targetId))
						.first();

					targetGone = ! still && ! profile;
				}

				return {
					id: r.id,
					at: r.at || r.createdAt,
					actorId: r.actorId,
					actorName: r.actorName,
					actorKind: r.actorKind,
					action: r.action,
					targetKind: r.targetKind,
					targetId: r.targetId,
					targetName: r.targetName,
					targetInk: r.targetInk,
					fromValue: r.fromValue,
					toValue: r.toValue,
					held: r.held,
					targetGone,
				};
			}));

			return {
				state: 'ready',
				rows,
				total: all.length,
				offset,
				pageSize,
				retentionMonths: toRetentionMonths(ctx.env[RETENTION_VAR]),
			};
		}),

		/**
		 * A slice of the log, for export.
		 *
		 * **A range, not everything.** A button that hands over every row invites
		 * the habit of handing over every row, and an audit export is the one
		 * thing in this console that leaves it entirely.
		 *
		 * The bounds are inclusive of `from` and exclusive of `to`, which is what
		 * makes "one month" composable — the next month's `from` is this month's
		 * `to`, and no row is counted twice or missed at the boundary.
		 *
		 * It is capped, and it **says** when the cap bit. A truncated audit
		 * export that looks complete is worse than no export at all, so the flag
		 * rides the result rather than being inferred from the row count.
		 */
		adminActivityExport: query(async (
			ctx,
			from: string,
			to: string
		): Promise<AdminActivityExportResult> => {
			if (! administers(ctx)) return { state: 'denied' };

			// Bad bounds return an empty range rather than the whole table. The
			// failure mode of the opposite default is handing over everything.
			const lower = Number.isFinite(Date.parse(from)) ? from : '';
			const upper = Number.isFinite(Date.parse(to)) ? to : '';

			if (! lower || ! upper || lower >= upper) {
				return { state: 'ready', rows: [], from: lower, to: upper, capped: false, limit: EXPORT_LIMIT };
			}

			const page = await ctx.db.activity
				.withIndex('by_at', (r) => r.gte('at', lower).lt('at', upper))
				.order('desc')
				.take(EXPORT_LIMIT + 1);

			const capped = page.length > EXPORT_LIMIT;
			const rows = (capped ? page.slice(0, EXPORT_LIMIT) : page).map((r) => ({
				id: r.id,
				at: r.at || r.createdAt,
				actorId: r.actorId,
				actorName: r.actorName,
				actorKind: r.actorKind,
				action: r.action,
				targetKind: r.targetKind,
				targetId: r.targetId,
				targetName: r.targetName,
				targetInk: r.targetInk,
				fromValue: r.fromValue,
				toValue: r.toValue,
				held: r.held,
				// Not resolved here. An export is a record of what the log says,
				// and a column that means "true when you asked" is not a fact
				// about the event — it would read as data and age into a lie.
				targetGone: false,
			}));

			return { state: 'ready', rows, from: lower, to: upper, capped, limit: EXPORT_LIMIT };
		}),
	},

	mutations: {
		/**
		 * The account's name, set on first run and changed from Settings later.
		 *
		 * Two writes, and the second is the one to be careful about: the profile
		 * row is the record, and every membership this account holds carries a
		 * **copy** of the name so the member list and the invite card can be read
		 * without a join. A rename that skipped the copies would show the new
		 * name to the person who typed it and the old one to everybody else,
		 * which is the failure mode that makes a denormalized column worse than
		 * no column at all.
		 *
		 * Not scoped to a household, alone among the writes: an account is not
		 * inside one, and this is reachable before any exists.
		 */
		setDisplayName: mutation(async (ctx, rawName: string) => {
			if (! signedIn(ctx)) throw new AccessError('Sign in to use Larder Log.');

			const displayName = normalizeDisplayName(rawName);

			// Required, not skippable — the alternatives are an unnamed row in
			// Members or an email address, which is not a name and exposes one.
			if (! displayName) throw new AccessError('Enter the name you want the rest of your household to see.');

			const now = stampFrom(Date.now());

			const existing = await ctx.db.profiles
				.withIndex('by_user', (r) => r.eq('userId', ctx.auth.userId))
				.first();

			if (existing) {
				await ctx.db.profiles.update(existing.id, { displayName, changedAt: now });
			} else {
				await ctx.db.profiles.insert({
					userId: ctx.auth.userId,
					displayName,
					addedAt: now,
					changedAt: now,
				});
			}

			const memberships = await collectAll(() => ctx.db.memberships
				.withIndex('by_user', (r) => r.eq('userId', ctx.auth.userId))
				);

			for (const row of memberships) {
				// Skipped rather than rewritten when it already agrees: a rename
				// across five households should not be five writes when it is one.
				if (row.displayName === displayName) continue;

				await ctx.db.memberships.update(row.id, { displayName });
			}

			// `invitePreview` names the inviter, and it is read by someone who is
			// not signed in and cannot refresh anything themselves.
			ctx.invalidate('profile', 'household', 'invitePreview', 'account');
		}),

		/**
		 * Bring the caller's own avatar copy up to date, everywhere they belong.
		 *
		 * **Without this the column would be write-once at join time**, which is
		 * the wrong shape for the commonest case there is: somebody joins, then
		 * sets up their Gravatar afterwards. It is also the only thing that can
		 * reach a row written *before* the column existed — nothing backfills
		 * (D44), so every membership on the published space today holds `''` and
		 * would hold it forever.
		 *
		 * Deliberately not folded into `setDisplayName`, which is the other
		 * write-through: that one fires on a rename, and a picture changing has
		 * nothing to do with a name changing.
		 *
		 * Safe to call on every load, and the client does. It reads the caller's
		 * own rows and writes only the ones that disagree, so the steady state is
		 * a handful of index reads and no writes at all — and it can only ever
		 * write `ctx.auth.picture` onto rows keyed by `ctx.auth.userId`, which is
		 * why it needs no household argument and has nothing to authorize beyond
		 * being signed in.
		 */
		syncAccountAvatar: mutation(async (ctx) => {
			if (! signedIn(ctx)) throw new AccessError('Sign in to use Larder Log.');

			const picture = accountAvatar(ctx);

			const memberships = await collectAll(() => ctx.db.memberships
				.withIndex('by_user', (r) => r.eq('userId', ctx.auth.userId))
				);

			let changed = false;

			for (const row of memberships) {
				if (row.picture === picture) continue;

				await ctx.db.memberships.update(row.id, { picture });
				changed = true;
			}

			// Nothing moved on screen if nothing was written, and this runs on
			// every load — an unconditional invalidate would refetch the household
			// for every member of it on each other member's page load.
			if (changed) ctx.invalidate('household');
		}),

		/**
		 * A new household, owned by the caller — their first, or their fifth.
		 *
		 * D18 refused this to anyone who already belonged somewhere. D33 dropped
		 * that: the seeding below is what makes a second household usable the
		 * moment it is created, and the client switches to the id returned.
		 *
		 * Kept out of `requireMembership()` so that helper stays resolve-or-throw
		 * and remains usable from a read-only query context.
		 */
		createHousehold: mutation(async (ctx, name: string, ink?: string, sources?: unknown) => {
			if (! signedIn(ctx)) throw new AccessError('Sign in to use Larder Log.');

			const now = Date.now();

			const household = await ctx.db.households.insert({
				name: normalizeName(name) || 'My Pantry',
				createdBy: ctx.auth.userId,
				defaultThreshold: '1',
				addedAt: stampFrom(now),
				// **The rollup is seeded here rather than bumped afterwards**,
				// because this is the one moment all three counts are known
				// without reading anything: a new household holds no items and
				// exactly one member, who is its owner. Bumping instead would
				// mean a read and a second write to reach the same values, and
				// would send every new household through `bumpHousehold`'s
				// self-heal on its first item for no reason.
				//
				// It is also what keeps the repair a bounded job forever: from
				// today no household is ever born uncounted, so the set needing
				// repair is the households that already existed and never grows.
				changedAt: stampFrom(now),
				itemCount: padCount(0),
				memberCount: padCount(1),
				ownerCount: padCount(1),
				// Both creation surfaces arrive with one already picked — the first
				// colour unused across the caller's households. An absent or bogus
				// one stores '' and takes the id-derived default rather than
				// pinning every such household to one shared token.
				ink: toHouseholdInk(ink),
			});

			await ctx.db.memberships.insert({
				householdId: household.id,
				userId: ctx.auth.userId,
				// The account's name, not the identity's (D46). The two differ for
				// anyone who changed theirs, and this row is what the member list
				// renders.
				displayName: await accountName(ctx),
				picture: accountAvatar(ctx),
				role: 'owner',
				// The same `now` the household took, so a creator's join and the
				// household's birth are one instant rather than two a
				// millisecond apart.
				joinedAt: stampFrom(now),
			});

			// Seed the taxonomies. Without at least one location the household
			// cannot hold an item at all — `locationId` is required and there
			// are no nullable fields — so a bare household is a dead end.
			//
			// These go in through `insert` rather than `createTerm`, so they are
			// the one path that could leave a term unstamped. `stamps` is the
			// same object for every one of them: they arrive together, and
			// staggering them by a millisecond each would imply an order that
			// isn't real.
			const stamps = { addedAt: stampFrom(now), changedAt: stampFrom(now) };

			for (const seed of SEED_LOCATIONS) {
				await ctx.db.locations.insert({
					householdId: household.id,
					name: seed.name,
					ink: normalizeInk(seed.ink),
					icon: '',
					...stamps,
				});
			}

			for (const seed of SEED_TYPES) {
				await ctx.db.types.insert({
					householdId: household.id,
					name: seed.name,
					ink: normalizeInk(seed.ink),
					icon: '',
					...stamps,
				});
			}

			// The one taxonomy the caller has a say in (D61). `toSourceMix`
			// separates *never asked* from *asked and answered none*: an absent
			// argument takes the buy-only default, an explicit all-false seeds
			// nothing. A household with no sources is not a dead end the way one
			// with no locations would be — `itemStores` is a join table, so an
			// item can name none.
			//
			// Normalized here rather than trusted: the client is not an
			// authority on anything, and `kind` reaches a column that decides
			// which band a row lands in.
			for (const seed of seedSourcesFor(toSourceMix(sources))) {
				await ctx.db.stores.insert({
					householdId: household.id,
					name: seed.name,
					ink: normalizeInk(seed.ink),
					kind: toSourceKind(seed.kind),
					...stamps,
				});
			}

			ctx.invalidate('households', 'household', 'pantry', 'claims', 'account');

			return { householdId: household.id };
		}),

		updateHousehold: mutation(async (ctx, householdId: string, patch: { name?: string; defaultThreshold?: string; ink?: string }) => {
			const membership = await requireCapability(ctx, householdId, 'household:settings');

			const next: {
				name?: string; defaultThreshold?: string; ink?: string; changedAt?: string;
			} = {};

			if (patch.name !== undefined) {
				if (! isValidName(patch.name)) throw new AccessError('A household needs a name.');
				next.name = normalizeName(patch.name);
			}

			if (patch.defaultThreshold !== undefined) {
				next.defaultThreshold = normalizeQty(patch.defaultThreshold);
			}

			// Colour rides the same capability as the name: both are the one look
			// every member of the household sees, so both are the owner's.
			if (patch.ink !== undefined) next.ink = toHouseholdInk(patch.ink);

			/*
			 * **A deliberate widening of what *last active* means**, and it is
			 * free. `lastActiveByHousehold` — the scan this column replaces —
			 * read `items`, `locations`, `types` and `stores`, so renaming a
			 * household or changing its threshold counted as nothing and a
			 * household could be renamed weekly and still report as dormant.
			 * This row is already being written; the stamp rides along.
			 *
			 * Written into the same patch rather than through `touchHousehold`
			 * for exactly that reason — a second call would be a second read and
			 * a second write of the row already open here.
			 */
			const now = Date.now();

			if (shouldTouch((await ctx.db.households.get(membership.householdId))?.changedAt, now)) {
				next.changedAt = stampFrom(now);
			}

			await ctx.db.households.update(membership.householdId, next);

			ctx.invalidate('households', 'household');
		}),

		// --- items ---

		addItem: mutation(
			async (
				ctx,
				householdId: string,
				draft: {
					name: string;
					locationId: string;
					qty: string;
					threshold: string;
					size?: string;
					unit?: string;
					offShoppingList?: boolean;
					/** '' automatic, 'always' or 'never' (D65). Anything else is automatic. */
					listRule?: string;
					// Both, or neither — `normalizeSeason` discards a half rather
					// than completing it. Only a grow item ever carries one, and
					// undo carries it back with the rest of the row.
					seasonFrom?: string;
					seasonTo?: string;
					notes?: string;
					typeIds?: string[];
					storeIds?: string[];
					/**
					 * The removed row's own stamps, on the undo path only (D17).
					 *
					 * Absent on an ordinary add, where both are now. Supplied, each
					 * is still validated and clamped — see `normalizeStamp`. Undo
					 * carries both so a restored item is indistinguishable from the
					 * one that was removed, which is what undo is supposed to mean.
					 */
					addedAt?: string;
					changedAt?: string;
				}
			) => {
				const membership = await requireCapability(ctx, householdId, 'item:write');

				if (! isValidName(draft.name)) throw new AccessError('An item needs a name.');

				// One clock read for both stamps: two calls can straddle a
				// millisecond, and an item whose `changedAt` predates its `addedAt`
				// is a row that was modified before it existed.
				const now = Date.now();

				// The location must be one of ours. `id()` is not a foreign key,
				// so nothing beneath this line would catch a bogus reference.
				assertInHousehold(await ctx.db.locations.get(draft.locationId), membership, 'That location');

				// One place makes the pair whole, and it is the same one the sheet
				// calls — a client that sends a number with no unit stores neither.
				const size = normalizeSize(draft.size, draft.unit);
				const season = normalizeSeason(draft.seasonFrom, draft.seasonTo);

				const item = await ctx.db.items.insert({
					householdId: membership.householdId,
					name: normalizeName(draft.name),
					locationId: draft.locationId,
					qty: normalizeQty(draft.qty),
					threshold: normalizeQty(draft.threshold),
					size: size.size,
					unit: size.unit,
					offShoppingList: draft.offShoppingList === true,
					// `toListRule` resolves anything it does not recognise to '',
					// which is the behaviour the app had before the column — so a
					// client sending nonsense gets automatic rather than an error.
					listRule: toListRule(draft.listRule),
					seasonFrom: season.seasonFrom,
					seasonTo: season.seasonTo,
					notes: normalizeNotes(draft.notes),
					addedAt: normalizeStamp(draft.addedAt, now),
					changedAt: normalizeStamp(draft.changedAt, now),
				});

				await syncJoins(ctx.db, membership.householdId, item.id, draft.typeIds ?? [], draft.storeIds ?? []);

				// The maintained count and the last-active stamp, in one call
				// that owns both. `now` rather than a second clock read, so the
				// household's stamp and the item's cannot straddle a millisecond.
				await bumpHousehold(ctx.db, membership.householdId, { items: 1 }, now);

				// The switcher shows an item count, so adding or removing a row
				// changes the list. `adjustQty` and `updateItem` do not, which is
				// why they leave `households` alone — the hot path stays cheap.
				ctx.invalidate('pantry', 'households');

				return { id: item.id };
			}
		),

		/**
		 * A whole review table, written at once.
		 *
		 * **The bulk-entry commit** (D67). A pasted list and the common-items
		 * checklist both land on one review, and this is the only thing that writes
		 * from it — twenty-two items that mean one act, from one press, so half of
		 * them landing is the state it exists to prevent.
		 *
		 * `restockItems`' construction, for `restockItems`' reason: **every draft is
		 * resolved before anything is written**. `id()` is not a foreign key, so
		 * that loop is the only thing standing between a bogus location and a row
		 * pointing at somebody else's household — and a refusal has to arrive with
		 * the table still exactly as it was, because the table is where the typing
		 * is.
		 *
		 * **There is no undo**, and that is a decision rather than an omission.
		 * D36 governs records that go away; nothing here does. What the client arms
		 * instead is a plain toast — the run of items is visible in the grid behind
		 * it, and a bulk *un*-write would be a second destructive mutation built to
		 * reverse a constructive one.
		 */
		addItems: mutation(
			async (
				ctx,
				householdId: string,
				drafts: {
					name: string;
					locationId: string;
					qty?: string;
					threshold?: string;
					size?: string;
					unit?: string;
					typeIds?: string[];
					storeIds?: string[];
				}[]
			) => {
				const membership = await requireCapability(ctx, householdId, 'item:write');

				if (! Array.isArray(drafts) || drafts.length === 0) {
					throw new AccessError('There is nothing to add.');
				}

				if (drafts.length > BULK_MAX) {
					throw new AccessError('That is more than one list.');
				}

				// Resolve everything first, exactly as the put-away does. A bad row
				// refuses the whole call and leaves the review untouched, which is
				// what lets the table say *nothing is written until you press Add*
				// and still be true after a failure.
				const resolved = [];

				for (const draft of drafts) {
					if (! isValidName(draft.name)) throw new AccessError('Every item needs a name.');

					assertInHousehold(await ctx.db.locations.get(draft.locationId), membership, 'That location');

					resolved.push({ draft, size: normalizeSize(draft.size, draft.unit) });
				}

				// One clock read for the whole list: rows that arrived together should
				// say so, and two calls can straddle a millisecond. It is the same
				// trade `createHousehold` makes across its fifteen seeded terms —
				// staggering them would imply an order that is not real.
				const at = stampFrom(Date.now());

				for (const row of resolved) {
					const item = await ctx.db.items.insert({
						householdId: membership.householdId,
						name: normalizeName(row.draft.name),
						locationId: row.draft.locationId,
						qty: normalizeQty(row.draft.qty),
						threshold: normalizeQty(row.draft.threshold),
						size: row.size.size,
						unit: row.size.unit,
						// Nothing this route can set, and each is `''`/false for a
						// reason the review makes plain: it has a name, a count, a
						// shelf and three chips, and no control for anything else.
						offShoppingList: false,
						listRule: '',
						seasonFrom: '',
						seasonTo: '',
						notes: '',
						addedAt: at,
						changedAt: at,
					});

					await syncJoins(
						ctx.db,
						membership.householdId,
						item.id,
						row.draft.typeIds ?? [],
						row.draft.storeIds ?? []
					);
				}

				// **One bump for the whole batch, not one per row.** Twenty-two
				// items are one act — the mutation's own premise — and twenty-two
				// read-modify-writes against the same household row would be
				// twenty-two chances for the counter to be the thing that goes
				// wrong on the path built to make bulk entry survivable.
				await bumpHousehold(
					ctx.db,
					membership.householdId,
					{ items: resolved.length },
					Date.parse(at)
				);

				// `households` because the switcher shows an item count — the same
				// pair `addItem` invalidates, for the same reason.
				ctx.invalidate('pantry', 'households');

				return { count: resolved.length };
			}
		),

		updateItem: mutation(
			async (
				ctx,
				householdId: string,
				itemId: string,
				patch: {
					name?: string;
					locationId?: string;
					qty?: string;
					threshold?: string;
					size?: string;
					unit?: string;
					offShoppingList?: boolean;
					listRule?: string;
					seasonFrom?: string;
					seasonTo?: string;
					notes?: string;
					typeIds?: string[];
					storeIds?: string[];
				}
			) => {
				const membership = await requireCapability(ctx, householdId, 'item:write');

				const item = assertInHousehold(await ctx.db.items.get(itemId), membership);

				// Unconditional: this mutation is only reached by someone pressing
				// Save, and the join rows below can change without a single column
				// in `next` doing so.
				const next: Record<string, string | boolean> = { changedAt: stampFrom(Date.now()) };

				if (patch.name !== undefined) {
					if (! isValidName(patch.name)) throw new AccessError('An item needs a name.');
					next.name = normalizeName(patch.name);
				}

				if (patch.locationId !== undefined) {
					assertInHousehold(await ctx.db.locations.get(patch.locationId), membership, 'That location');
					next.locationId = patch.locationId;
				}

				if (patch.qty !== undefined) next.qty = normalizeQty(patch.qty);
				if (patch.threshold !== undefined) next.threshold = normalizeQty(patch.threshold);
				if (patch.notes !== undefined) next.notes = normalizeNotes(patch.notes);
				if (patch.offShoppingList !== undefined) next.offShoppingList = patch.offShoppingList === true;

				/*
				 * **Writing the rule drains the column it replaces.**
				 *
				 * `offShoppingList` said exactly what `never` says and every row
				 * carrying it predates this column, so an edit through the segment
				 * writes the whole answer into `listRule` and clears the old flag
				 * in the same patch. `listRuleOf` prefers the new column, so the
				 * two can never disagree in between.
				 *
				 * That is what makes D60's *the flag drains out as people meet it*
				 * actually happen: before this it could only ever be cleared by a
				 * control that did nothing else.
				 */
				if (patch.listRule !== undefined) {
					next.listRule = toListRule(patch.listRule);
					next.offShoppingList = false;
				}

				// The two halves move together or not at all. A patch naming only
				// one of them could otherwise leave the pair half-set, which is the
				// single state `shared/size.ts` exists to prevent — so the other
				// half is read off the stored row and the two are normalized
				// together.
				if (patch.size !== undefined || patch.unit !== undefined) {
					const size = normalizeSize(
						patch.size !== undefined ? patch.size : item.size,
						patch.unit !== undefined ? patch.unit : item.unit
					);
					next.size = size.size;
					next.unit = size.unit;
				}

				// The season's two halves move together for exactly the reason the
				// size's do, and through the same shape of guard: one month with no
				// other end is not a season, so a patch naming one reads the other
				// off the row and normalizes the pair.
				if (patch.seasonFrom !== undefined || patch.seasonTo !== undefined) {
					const season = normalizeSeason(
						patch.seasonFrom !== undefined ? patch.seasonFrom : item.seasonFrom,
						patch.seasonTo !== undefined ? patch.seasonTo : item.seasonTo
					);
					next.seasonFrom = season.seasonFrom;
					next.seasonTo = season.seasonTo;
				}

				await ctx.db.items.update(item.id, next);

				if (patch.typeIds !== undefined || patch.storeIds !== undefined) {
					await syncJoins(ctx.db, membership.householdId, item.id, patch.typeIds, patch.storeIds);
				}

				// No count moved — editing an item is not adding one — and it is
				// still exactly the activity `dormant` is asking about.
				await touchHousehold(ctx.db, membership.householdId, Date.now());

				ctx.invalidate('pantry');
			}
		),

		/** The hottest path: `+1` / `-1`, clamped at zero by `fromInt`. */
		adjustQty: mutation(async (ctx, householdId: string, itemId: string, delta: number) => {
			const membership = await requireCapability(ctx, householdId, 'item:write');

			const item = assertInHousehold(await ctx.db.items.get(itemId), membership);

			// Only ever one step. A client asking for -999 is a bug or an attack,
			// and neither deserves to be honored.
			const step = delta < 0 ? -1 : 1;

			const now = Date.now();

			// The hot path is not exempt: a quantity is information about the item,
			// so `-1` on a card is a change like any other (D44).
			await ctx.db.items.update(item.id, {
				qty: fromInt(toInt(item.qty) + step),
				changedAt: stampFrom(now),
			});

			// **The one call in the app where the granularity earns its keep.**
			// `shouldTouch` makes a run of presses on one card a single write to
			// the household rather than one per press, and the value it is
			// protecting is only ever read as a number of days.
			await touchHousehold(ctx.db, membership.householdId, now);

			ctx.invalidate('pantry');
		}),

		/*
		 * --- claims: the shared trip (D66) ---
		 *
		 * A claim says *I am getting this* and touches nothing about the item.
		 * The count is written once, at the put-away — which is what makes a
		 * claim safe to share, and what makes the two people at two shops that
		 * D41 rejected sharing to avoid into the case this screen is for.
		 */

		/** Tick a row. Refuses one somebody else already holds. */
		claimItem: mutation(async (ctx, householdId: string, itemId: string) => {
			const membership = await requireCapability(ctx, householdId, 'item:write');

			assertInHousehold(await ctx.db.items.get(itemId), membership);

			const now = Date.now();
			const live = await liveTripsIn(ctx.db, membership.householdId, now);
			const held = await liveClaimOn(ctx.db, itemId, live);

			/*
			 * **You cannot claim a row somebody else holds.** Taking one over is
			 * not drawn — *she is at Publix and forgot* is a real case and a
			 * small pile of etiquette, and it is under D66's open questions.
			 *
			 * Your own row is a no-op rather than an error: two devices, or a
			 * double tap, should not produce a refusal for a state that is
			 * already what was asked for.
			 */
			if (held) {
				if (held.userId !== membership.userId) {
					throw new AccessError('Someone else is already getting that.');
				}

				return { claimed: true };
			}

			const trip = await openTrip(ctx.db, membership.householdId, membership.userId, live, now);

			await ctx.db.claims.insert({
				householdId: membership.householdId,
				tripId: trip.id,
				itemId,
				// Denormalised off the trip so the run list's read is one indexed
				// scan and no join — the trade `itemTypes` already makes.
				userId: membership.userId,
				at: stampFrom(now),
			});

			ctx.invalidate('claims');

			return { claimed: true };
		}),

		/**
		 * Untick rows — one, or everything `Clear checks` had on screen.
		 *
		 * **It releases only your own**, and nothing you can press releases
		 * somebody else's cart. A list of ids rather than one, because the client
		 * knows which rows are in front of you and this does not: with a Store
		 * filter on, the trip holds claims for rows nobody can see, and a control
		 * beside `Hide 3 checked` must not quietly clear seven.
		 */
		releaseClaims: mutation(async (ctx, householdId: string, itemIds: string[]) => {
			const membership = await requireCapability(ctx, householdId, 'item:write');

			if (! Array.isArray(itemIds) || itemIds.length === 0) return { released: 0 };

			const wanted = new Set(itemIds);
			const mine = await myClaimsIn(ctx.db, membership.householdId, membership.userId, Date.now());
			const going = mine.filter((c) => wanted.has(c.itemId));

			for (const claim of going) await ctx.db.claims.delete(claim.id);

			// Only when something moved: an unconditional invalidate would refetch
			// every member's claims for a press that did nothing.
			if (going.length > 0) ctx.invalidate('claims');

			return { released: going.length };
		}),

		/**
		 * The put-away — a whole trip's counts, written once (D64).
		 *
		 * **One mutation rather than a loop of `updateItem`**, and that is the
		 * whole reason it exists. A put-away is several writes that mean one
		 * thing, from a phone in a car park on a bad connection; a client-side
		 * loop can half-commit and leave you with no way to tell which half. It
		 * is also the only write in the app that is worth a spinner.
		 *
		 * **It sets, it does not add.** The stepper asked *how many do you have
		 * now* — the question every other stepper in the app asks — so this
		 * writes exactly what it was handed. A delta would be a second mental
		 * model for one control, and the sheet would have to say which it meant.
		 *
		 * Each row also writes a `restocks` event, which nothing reads yet. See
		 * the table's own note: the reader is trends, and a row that was never
		 * written cannot be recovered later.
		 *
		 * **Every entry is checked, and one bad entry refuses the whole call.**
		 * Partial success is the state this mutation exists to prevent, so it
		 * resolves every item up front and writes nothing until all of them are
		 * ours.
		 */
		restockItems: mutation(
			async (
				ctx,
				householdId: string,
				entries: {
					itemId: string;
					/** What is on the shelf now, not what was added. */
					qty: string;
					/**
					 * The source kind the row was filed under, or '' for a row
					 * that named no source.
					 *
					 * The client's answer rather than a recomputation, because the
					 * *band* decided it: an item you both buy and grow is filed
					 * under the card it was ticked on, and the server rederiving
					 * it could disagree with the screen it came from.
					 */
					kind?: string;
				}[]
			) => {
				const membership = await requireCapability(ctx, householdId, 'item:write');

				if (! Array.isArray(entries) || entries.length === 0) {
					throw new AccessError('There is nothing to put away.');
				}

				if (entries.length > RESTOCK_MAX) {
					throw new AccessError('That is more than one trip.');
				}

				// Resolve everything first. `id()` is not a foreign key, so this
				// loop is the only thing standing between a bogus id and a write
				// into somebody else's household.
				const resolved = [];

				for (const entry of entries) {
					const item = assertInHousehold(await ctx.db.items.get(entry.itemId), membership);

					resolved.push({ item, qty: normalizeQty(entry.qty), kind: entry.kind });
				}

				// One clock read for the whole trip: rows that arrived together
				// should say so, and two calls can straddle a millisecond.
				const now = Date.now();
				const at = stampFrom(now);

				/*
				 * **The trip is resolved here, not sent** (D66). It was a
				 * client-minted opaque string, because there was no trip table to
				 * name; there is now, and the server is holding the row. Asking
				 * the client which trip it is in would be asking it to tell us
				 * something we already know better — and it is the same instinct
				 * that makes a household id a selector rather than an authority.
				 *
				 * `''` when nothing was claimed: putting away a row you never
				 * ticked is legal, and it belongs to no trip.
				 */
				const live = await liveTripsIn(ctx.db, membership.householdId, now);
				const tripId = live.find((t) => t.userId === membership.userId)?.id ?? '';

				for (const row of resolved) {
					/*
					 * **A put-away writes the count and nothing else** (D65,
					 * amended). It used to clear an `always` pin, on D64's
					 * reasoning that a check can be abandoned but a purchase
					 * cannot — which answered *when* the pin should end without
					 * asking whether it should end at all.
					 *
					 * It should not. `always` is a standing preference: *keep this
					 * on my list whatever happens*. A control labelled **Always**
					 * that quietly stops after one trip makes the word lie, and
					 * leaves somebody wondering why the thing they pinned is gone.
					 * The only thing that ends a pin is somebody setting it back.
					 */
					await ctx.db.items.update(row.item.id, { qty: row.qty, changedAt: at });

					await ctx.db.restocks.insert({
						householdId: membership.householdId,
						itemId: row.item.id,
						tripId,
						fromQty: row.item.qty,
						toQty: row.qty,
						// '' is a real answer here — a storeless row — so this
						// cannot go through `toSourceKind`, which resolves
						// everything it does not recognise to `shop`.
						kind: isSourceKind(row.kind) ? row.kind : '',
						at,
					});
				}

				/*
				 * **The put-away ends the trip** (D64's rule 2, now a real row).
				 * The counts are written and the trip is over, so its claims go
				 * with it — which is also what frees every row it held for
				 * somebody else.
				 *
				 * It ends **your** trip and never anybody else's: two people can
				 * be shopping the same list, and putting your half away must not
				 * empty her cart.
				 */
				await endTripsFor(ctx.db, membership.householdId, membership.userId);

				// **The strongest activity signal in the app**, and the whole
				// reason *Shopping trips* is on Overview: somebody stood in a
				// kitchen and finished a run. It moves no count — a put-away sets
				// quantities and adds no rows — so it is a touch.
				await touchHousehold(ctx.db, membership.householdId, now);

				ctx.invalidate('pantry', 'claims');

				return { count: resolved.length };
			}
		),

		/**
		 * A hard delete. Undo is a client-held tombstone that re-runs `addItem`
		 * (D17), so there is no `deletedAt` and nothing filters on one.
		 */
		removeItem: mutation(async (ctx, householdId: string, itemId: string) => {
			const membership = await requireCapability(ctx, householdId, 'item:write');

			const item = assertInHousehold(await ctx.db.items.get(itemId), membership);

			await clearJoinsForItem(ctx.db, item.id);
			await clearRestocksForItem(ctx.db, item.id);
			// A claim on a row that no longer exists is invisible to every read
			// and impossible to clear — see D66's own open question about what
			// happens to a claim when somebody deletes the item mid-trip. This is
			// the half of it that is not a question.
			await clearClaimsForItem(ctx.db, item.id);
			await ctx.db.items.delete(item.id);

			// After the delete — `bumpHousehold`'s standing rule, and this is
			// the direction that makes it obvious why.
			await bumpHousehold(ctx.db, membership.householdId, { items: -1 }, Date.now());

			ctx.invalidate('pantry', 'households', 'claims');
		}),

		// --- taxonomy ---

		createTerm: mutation(
			async (
				ctx,
				householdId: string,
				kind: TermKind,
				draft: {
					name: string;
					ink: string;
					/**
					 * A source's kind, from either of the two callers that have
					 * one.
					 *
					 * **Composing one is the ordinary path now.** All three of the
					 * app's draft rows carry the glyph, so a garden is a garden
					 * from the moment it is named — D58 shipped without that and
					 * made you name the source, press *Done*, re-open the panel
					 * with the pencil and find the row again to say what it was.
					 *
					 * Undo is the other caller and is why this argument existed
					 * first: undo re-inserts (D17), the same trade the stamps
					 * below make, so without it a restored garden would come back
					 * a shop.
					 *
					 * Unvalidated on purpose — `toSourceKind` resolves anything it
					 * does not recognise to `shop`, so a client sending nonsense
					 * gets the default rather than an error.
					 *
					 * Ignored for `location` and `type`, which have no column.
					 */
					kind?: string;
					/** The deleted term's own stamps, on the undo path only. See `addItem`. */
					addedAt?: string;
					changedAt?: string;
				}
			) => {
				const membership = await requireCapability(ctx, householdId, 'taxonomy:write');
				const tableName = termTable(kind);

				if (! isValidName(draft.name)) throw new AccessError('A name is required.');

				const existing = await collectAll<{ id: string; name: string }>(() => ctx.db[tableName]
					.withIndex('by_household', (r) => r.eq('householdId', membership.householdId)));

				const key = termKey(draft.name);

				if (existing.some((t) => termKey(t.name) === key)) {
					throw new AccessError(`"${normalizeName(draft.name)}" already exists.`);
				}

				const name = normalizeName(draft.name);
				const ink = normalizeInk(draft.ink);
				const owner = membership.householdId;
				const now = Date.now();
				const stamps = {
					addedAt: normalizeStamp(draft.addedAt, now),
					changedAt: normalizeStamp(draft.changedAt, now),
				};

				// `stores` has no `icon` column; the other two get the empty string
				// the reserved column holds (D34).
				const row =
					tableName === 'stores'
						? await ctx.db.stores.insert({
							householdId: owner, name, ink, kind: toSourceKind(draft.kind), ...stamps,
						})
						: await ctx.db[tableName].insert({ householdId: owner, name, ink, icon: '', ...stamps });

				// A term is one of the four tables `lastActiveByHousehold` used to
				// read, so the household's stamp has to move with it or the column
				// would be a narrower answer than the scan it replaced.
				await touchHousehold(ctx.db, membership.householdId, Date.now());

				ctx.invalidate('pantry');

				return { id: row.id };
			}
		),

		updateTerm: mutation(
			async (
				ctx,
				householdId: string,
				kind: TermKind,
				termId: string,
				patch: { name?: string; ink?: string }
			) => {
				const membership = await requireCapability(ctx, householdId, 'taxonomy:write');
				const tableName = termTable(kind);

				const term = assertInHousehold(
					await ctx.db[tableName].get(termId),
					membership,
					termLabel(kind)
				);

				const next: Record<string, string> = { changedAt: stampFrom(Date.now()) };

				if (patch.name !== undefined) {
					if (! isValidName(patch.name)) throw new AccessError('A name is required.');

					const siblings = await collectAll<{ id: string; name: string }>(() => ctx.db[tableName]
						.withIndex('by_household', (r) => r.eq('householdId', membership.householdId)));

					const key = termKey(patch.name);

					if (siblings.some((t) => t.id !== termId && termKey(t.name) === key)) {
						throw new AccessError(`"${normalizeName(patch.name)}" already exists.`);
					}

					// A rename is now a single-row update. Under the Phase 1
					// name-joined model this had to rewrite every item that
					// referenced the term.
					next.name = normalizeName(patch.name);
				}

				if (patch.ink !== undefined) next.ink = normalizeInk(patch.ink);

				await ctx.db[tableName].update(term.id, next);

				await touchHousehold(ctx.db, membership.householdId, Date.now());

				ctx.invalidate('pantry');
			}
		),

		/**
		 * What you do to get things from this source — shop, grow or make (D58).
		 *
		 * Its own mutation rather than a `kind` on `updateTerm`'s patch, because
		 * that handler's second argument is *already* called `kind` and means the
		 * taxonomy. `updateTerm(id, 'store', x, { kind: 'grow' })` reads as a
		 * contradiction and would be one to maintain.
		 *
		 * Stores only, and there is no `TermKind` parameter for the same reason:
		 * `locations` and `types` have no column, so a caller naming one is asking
		 * for something that cannot exist rather than something it may not do.
		 */
		setSourceKind: mutation(async (ctx, householdId: string, storeId: string, kind: string) => {
			const membership = await requireCapability(ctx, householdId, 'taxonomy:write');

			if (! isSourceKind(kind)) throw new AccessError('Unknown source kind.');

			const store = assertInHousehold(
				await ctx.db.stores.get(storeId),
				membership,
				termLabel('store')
			);

			// A no-op still costs a refetch of every subscriber's pantry, and the
			// menu is a radio group where pressing the current row is the ordinary
			// way to close it.
			if (toSourceKind(store.kind) === kind) return;

			await ctx.db.stores.update(store.id, { kind, changedAt: stampFrom(Date.now()) });

			await touchHousehold(ctx.db, membership.householdId, Date.now());

			ctx.invalidate('pantry');
		}),

		deleteTerm: mutation(async (ctx, householdId: string, kind: TermKind, termId: string) => {
			const membership = await requireCapability(ctx, householdId, 'taxonomy:write');
			const tableName = termTable(kind);

			const term = assertInHousehold(
				await ctx.db[tableName].get(termId),
				membership,
				termLabel(kind)
			);

			/*
			 * A term is deletable only once nothing references it — every kind,
			 * not just `location`.
			 *
			 * D16 guarded locations because they are *required*: Zero has no
			 * nullable column, so deleting one in use leaves a dangling id that
			 * renders as a silent box. Types and stores are optional tags, and
			 * this handler used to delete their join rows and carry on.
			 *
			 * That asymmetry is what changed. The editing row now shows an item
			 * count beside a trash that is live in every case, and the count is
			 * there to make the outcome predictable *before* the press. A count
			 * that means "blocked" on the Location rows and "these tags are
			 * about to vanish" on the Type rows teaches nothing.
			 *
			 * Counted off the join indexes rather than by scanning items, which
			 * is what `by_type` and `by_store` are for. Locations have no join
			 * table — the id is a column on the item — so that one still scans.
			 */
			const used = kind === 'location'
				? (await collectAll(() => ctx.db.items
					.withIndex('by_household', (r) => r.eq('householdId', membership.householdId))
					)
				).filter((i) => i.locationId === termId).length
				: kind === 'type'
					? (await collectAll(() => ctx.db.itemTypes.withIndex('by_type', (r) => r.eq('typeId', termId)))).length
					: (await collectAll(() => ctx.db.itemStores.withIndex('by_store', (r) => r.eq('storeId', termId)))).length;

			/*
			 * The client draws its blocked dialog from this same call, so the
			 * refusal and the explanation can never disagree — including the
			 * group's own word, which is `Source` rather than `Store` in a
			 * household that grows or cooks anything (D58). That costs one extra
			 * `collect()` on a delete that is about to be refused, which is the
			 * rarest path in the handler.
			 */
			const sources = kind === 'store'
				? await collectAll(() => ctx.db.stores
					.withIndex('by_household', (r) => r.eq('householdId', membership.householdId))
					)
				: [];

			const blocked = termBlock(
				kind,
				term.name,
				used,
				kind === 'store'
					? sourceGroupWord(sources.map((r) => ({ kind: toSourceKind(r.kind) })))
					: kind
			);

			if (blocked) throw new AccessError(blocked.body);

			await ctx.db[tableName].delete(term.id);

			await touchHousehold(ctx.db, membership.householdId, Date.now());

			ctx.invalidate('pantry');
		}),

		// --- invites and membership ---

		createInvite: mutation(async (ctx, householdId: string, grantedRole: string) => {
			const membership = await requireCapability(ctx, householdId, 'invite:create');

			const granted = toRole(grantedRole);

			// D21. Owners mint any level, editors mint viewer only. The editor
			// tier can only grow by owner action, and this is half of why —
			// `changeRole` below is the other half.
			if (! canInviteRole(membership.role, granted)) {
				throw new AccessError(`You cannot invite someone as ${granted}.`);
			}

			// Two writes, because the fallback entropy source *is* the row id and
			// so cannot be known before the insert, so a caller must never observe
			// the placeholder.
			//
			// `ctx.transaction` is gone as of @spacefast/zero 0.4.1 and the handler
			// itself is the transaction now — the SDK's own `email` docblock says a
			// mutation "commits both or neither", and the runtime docs say a handler
			// runs "in one transaction with the database". So the wrapper was doing
			// nothing the mutation was not already doing, and removing it changes
			// what a caller can see by nothing at all.
			const mintedAt = Date.now();

			const invite = await ctx.db.invites.insert({
				householdId: membership.householdId,
				code: PENDING_CODE,
				role: granted,
				expiresAt: expiryFrom(mintedAt),
				createdBy: membership.userId,
				// The same clock reading the expiry is derived from, so the
				// two cannot disagree about when this link began.
				addedAt: stampFrom(mintedAt),
				// `revoked` is deliberately omitted rather than written as `false`.
				// It is the schema's only boolean column and this is its only
				// insert, which makes it the prime suspect for the hosted runtime's
				// 500; `.default(false)` produces the identical row either way.
			});

			const code = inviteCode(ctx.log, ctx.env, invite.id);

			await ctx.db.invites.update(invite.id, { code });

			ctx.invalidate('household');

			return { code, expiresAt: invite.expiresAt };
		}),

		revokeInvite: mutation(async (ctx, householdId: string, inviteId: string) => {
			const membership = await requireCapability(ctx, householdId, 'invite:revoke');

			const invite = assertInHousehold(
				await ctx.db.invites.get(inviteId),
				membership,
				'That invite'
			);

			await ctx.db.invites.update(invite.id, { revoked: true });

			// `invitePreview` too: a stranger may be sitting on the landing card
			// this link opened, and revoking is meant to reach them.
			ctx.invalidate('household', 'invitePreview');
		}),

		redeemInvite: mutation(async (ctx, rawCode: string) => {
			if (! signedIn(ctx)) throw new AccessError('Sign in to join a household.');

			const now = Date.now();
			const code = normalizeCode(rawCode);

			if (! isCodeShaped(code)) throw new AccessError('That invite code is not valid.');

			const invite = await ctx.db.invites
				.withIndex('by_code', (r) => r.eq('code', code))
				.first();

			// One message for missing, revoked, and expired alike — a code is a
			// bearer credential, and separating the cases tells a guesser which
			// codes exist.
			if (! invite || invite.revoked || isExpired(invite.expiresAt, now)) {
				throw new AccessError('That invite is no longer valid.');
			}

			// D18 refused a second membership anywhere; D33 narrows that to the
			// household the code is for. The check has to stay in some form: a
			// code must never change a current member's role, in either
			// direction, and a duplicate row would do exactly that.
			const existing = await collectAll(() => ctx.db.memberships
				.withIndex('by_user', (r) => r.eq('userId', ctx.auth.userId))
				);

			if (existing.some((row) => row.householdId === invite.householdId)) {
				throw new AccessError('You are already a member of that household.');
			}

			await ctx.db.memberships.insert({
				householdId: invite.householdId,
				userId: ctx.auth.userId,
				// The account's name, not the identity's (D46) — and this is the
				// path that most needs it: someone arriving on an invite is the
				// person the rest of the household is about to see a name for.
				displayName: await accountName(ctx),
				picture: accountAvatar(ctx),
				role: toRole(invite.role),
				joinedAt: stampFrom(now),
			});

			// A joiner is a member, and an owner-role invite makes an owner —
			// so `noOwner` has to move here too, or an ownerless household
			// rescued by an invite would stay flagged.
			await bumpHousehold(
				ctx.db,
				invite.householdId,
				{ members: 1, owners: toRole(invite.role) === 'owner' ? 1 : 0 },
				now
			);

			// **First redemption only**, and the guard is the whole point: an
			// invite is not revoked on use, so a link shared with a family
			// admits several people. Overwriting on each one would turn *how
			// long did this take to convert* into *when did the last person
			// wander in*.
			if (! invite.redeemedAt) {
				await ctx.db.invites.update(invite.id, {
					redeemedAt: stampFrom(now),
					redeemedBy: ctx.auth.userId,
				});
			}

			ctx.invalidate('households', 'household', 'pantry', 'invitePreview', 'account');

			return { householdId: invite.householdId };
		}),

		changeRole: mutation(async (ctx, householdId: string, membershipId: string, nextRole: string) => {
			const membership = await requireCapability(ctx, householdId, 'member:role');

			const members = await collectAll(() => ctx.db.memberships
				.withIndex('by_household', (r) => r.eq('householdId', membership.householdId))
				);

			const target = members.find((m) => m.id === membershipId);

			if (! target) throw new AccessError('That member is no longer in this household.');

			const role = toRole(nextRole);

			// D22: a household always keeps an owner. Demoting the last one
			// leaves it unadministrable — how these systems strand people.
			if (role !== 'owner' && wouldStrandHousehold(members, membershipId)) {
				throw new AccessError(
					'This household needs at least one owner. Make someone else an owner first.'
				);
			}

			const wasOwner = toRole(target.role) === 'owner';

			await ctx.db.memberships.update(target.id, { role });

			// The member count cannot move here — the same person is still in
			// the household — but the owner count can, in either direction.
			// Passing `0` rather than omitting the key is deliberate: it keeps
			// the column on the self-heal's list, so a household repaired by a
			// role change comes back with all three counts true rather than one.
			await bumpHousehold(
				ctx.db,
				membership.householdId,
				{ owners: (role === 'owner' ? 1 : 0) - (wasOwner ? 1 : 0) },
				Date.now()
			);

			// D21: a demotion must not leave the invites they minted working —
			// an owner dropped to editor would otherwise keep minting editors.
			await revokeInvitesBy(ctx.db, membership.householdId, target.userId);

			ctx.invalidate('household', 'account');
		}),

		removeMember: mutation(async (ctx, householdId: string, membershipId: string) => {
			const membership = await requireCapability(ctx, householdId, 'member:remove');

			const members = await collectAll(() => ctx.db.memberships
				.withIndex('by_household', (r) => r.eq('householdId', membership.householdId))
				);

			const target = members.find((m) => m.id === membershipId);

			if (! target) throw new AccessError('That member is no longer in this household.');

			if (wouldStrandHousehold(members, membershipId)) {
				throw new AccessError(
					'This household needs at least one owner. Make someone else an owner first.'
				);
			}

			await revokeInvitesBy(ctx.db, membership.householdId, target.userId);
			// **A claim goes with the person who made it.** A row reading *In
			// Sarah's cart* after Sarah has left is a row nobody can clear —
			// which is the state D66's own refusal (*you cannot claim a row
			// somebody else holds*) would otherwise make permanent.
			await endTripsFor(ctx.db, membership.householdId, target.userId);
			await ctx.db.memberships.delete(target.id);

			await bumpHousehold(
				ctx.db,
				membership.householdId,
				{ members: -1, owners: toRole(target.role) === 'owner' ? -1 : 0 },
				Date.now()
			);

			ctx.invalidate('households', 'household', 'claims', 'account');
		}),

		leaveHousehold: mutation(async (ctx, householdId: string) => {
			const membership = await requireMembership(ctx, householdId);

			const members = await collectAll(() => ctx.db.memberships
				.withIndex('by_household', (r) => r.eq('householdId', membership.householdId))
				);

			if (wouldStrandHousehold(members, membership.id)) {
				throw new AccessError(
					'You are the only owner. Make someone else an owner, or delete the household.'
				);
			}

			await revokeInvitesBy(ctx.db, membership.householdId, membership.userId);
			// **A claim goes with the person who made it.** A row reading *In
			// Sarah's cart* after Sarah has left is a row nobody can clear —
			// which is the state D66's own refusal (*you cannot claim a row
			// somebody else holds*) would otherwise make permanent.
			await endTripsFor(ctx.db, membership.householdId, membership.userId);
			await ctx.db.memberships.delete(membership.id);

			await bumpHousehold(
				ctx.db,
				membership.householdId,
				{ members: -1, owners: toRole(membership.role) === 'owner' ? -1 : 0 },
				Date.now()
			);

			// The list is what the client falls back through: losing this row is
			// how it learns to show one of the others, or the first-run screen.
			ctx.invalidate('households', 'household', 'pantry', 'claims', 'account');
		}),

		/** Owner only. Deletes every row scoped to the household, children first. */
		deleteHousehold: mutation(async (ctx, householdId: string) => {
			const membership = await requireCapability(ctx, householdId, 'household:delete');

			// The cascade lived here as a second copy of `deleteHouseholdRows`'
			// list — identical, and identical is how two lists start. One funnel
			// now, which is also the one place a deletion gets recorded.
			await deleteHouseholdRows(ctx.db, membership.householdId);

			ctx.invalidate('households', 'household', 'pantry', 'claims', 'account');
		}),

		/*
		 * --- your own account (D68) ---
		 *
		 * Two writes the app has never had, and the first exists because the
		 * second needs it: a household cannot be left by its only owner (D22),
		 * so an account that owns three of them cannot be deleted until
		 * ownership is something a person can hand over.
		 *
		 * Neither is an admin write and neither is behind `ADMIN_WRITES_HELD`.
		 * The console's six reach households the caller is not in; these two
		 * reach only the caller's own memberships, and every one of them is
		 * resolved through `requireCapability` or through `by_user` on the
		 * caller's own id.
		 */

		/**
		 * Hands a household over: they become Owner and **you become an Editor**.
		 *
		 * **Promote is not transfer**, and the second half is the part the app had
		 * no control for at all — the role menu can add an owner, and your own row
		 * carries no trigger, so there was nowhere to step yourself back from.
		 *
		 * Promotion happens first, so there is never an instant with no owner —
		 * the state this exists to get a household *out* of. Only the caller is
		 * demoted: a household with two other owners keeps both, because handing
		 * yours over is not a claim about theirs.
		 *
		 * **D21 applies to the demotion, not to the promotion.** An owner dropped
		 * to editor keeps minting editors through a link already in the wild, so
		 * the caller's invites in this household die with their role. The person
		 * receiving it is gaining privilege, and nothing they have issued is
		 * suddenly too generous.
		 */
		transferOwnership: mutation(async (ctx, householdId: string, toMembershipId: string) => {
			const membership = await requireCapability(ctx, householdId, 'member:role');

			const members = await collectAll(() => ctx.db.memberships
				.withIndex('by_household', (r) => r.eq('householdId', membership.householdId))
				);

			const target = members.find((m) => m.id === toMembershipId);

			if (! target) throw new AccessError('That member is no longer in this household.');

			// Handing it to yourself is a no-op that would then demote you out of
			// the household you still own — the one case where the obvious guard
			// is load-bearing rather than defensive.
			if (target.id === membership.id) {
				throw new AccessError('Choose someone else to hand this household to.');
			}

			const promoted = toRole(target.role) !== 'owner';

			if (promoted) {
				await ctx.db.memberships.update(target.id, { role: 'owner' });
			}

			await ctx.db.memberships.update(membership.id, { role: 'editor' });

			/*
			 * **Net zero when the target was already an owner, and that is not a
			 * reason to skip the call.** The caller is always an owner — that is
			 * what `member:role` means — so the demotion is always `-1`, and the
			 * promotion is `+1` only when it really happened. A household with
			 * two owners handing over to the second one ends with one, which is
			 * the arithmetic rather than an exception to it.
			 */
			await bumpHousehold(
				ctx.db,
				membership.householdId,
				{ owners: (promoted ? 1 : 0) - 1 },
				Date.now()
			);

			await revokeInvitesBy(ctx.db, membership.householdId, membership.userId);

			ctx.invalidate('households', 'household', 'pantry', 'account');
		}),

		/**
		 * Deletes your own account: every membership, every trip, and the profile.
		 *
		 * **It does not delete the identity, and it cannot.** A Spacefast account
		 * lives on the platform; what this app owns is the rows keyed to its
		 * `userId`. Signing in again would produce a stranger with the same id and
		 * no history — which is the honest description, and it is what the card at
		 * the end says in so many words.
		 *
		 * **The plan is the server's, not the client's.** `fateOf` in
		 * `shared/accountDeletion.ts` decides what happens to each household, and
		 * both halves read it: the dialog to draw its two groups, and this to
		 * decide which rows it is owed an answer for. Two descriptions of *which
		 * households are a question* would disagree exactly once, in production,
		 * over somebody's data.
		 *
		 * Order matters and it is the reverse of what reads naturally: **every
		 * decision is validated before anything is written**, because a
		 * half-applied deletion leaves a household transferred to somebody and an
		 * account still present, with no record of either.
		 *
		 * **Nothing is logged**, and that is D62's rule rather than an omission:
		 * the audit log records *administration* — things done from the console to
		 * households and accounts that are not the caller's — and never what a
		 * person does to their own. `deleteHousehold` a few lines up writes no row
		 * either, and this is the same act at the scale of an account.
		 */
		deleteMyAccount: mutation(async (ctx, decisions: OwnershipDecision[] = []) => {
			if (! signedIn(ctx)) throw new AccessError('Sign in to use Larder Log.');

			const userId = ctx.auth.userId;

			/*
			 * **An administrator's account is not the app's to delete.**
			 * `LARDER_ADMIN_IDS` is set out of band and nothing in the app can
			 * edit it, so removing the rows would leave the environment still
			 * naming an account that no longer exists — and the next sign-in with
			 * that identity would mint a brand-new empty one holding the console.
			 * The fix for *this administrator should go* is `.env.server`, which
			 * is where the trust was granted.
			 *
			 * It is checked here as well as being hidden in the pane, because a
			 * hidden control is one devtools call from a deleted account — the
			 * same arrangement `ADMIN_WRITES_HELD` has, and `termBlock`'s before
			 * it: one rule the server throws and the client renders.
			 */
			if (isAdminId(userId, ctx.env[ADMIN_IDS_VAR])) {
				throw new AccessError(ADMIN_UNDELETABLE_REFUSAL);
			}

			const mine = await collectAll(() => ctx.db.memberships
				.withIndex('by_user', (r) => r.eq('userId', userId))
				);

			const profile = await ctx.db.profiles
				.withIndex('by_user', (r) => r.eq('userId', userId))
				.first();

			// --- the plan, recomputed from the rows rather than trusted ---

			/** `householdId → what happens to it`, for every household you are in. */
			const plan = new Map<string, { fate: HouseholdFate; membershipId: string }>();

			for (const m of mine) {
				const household = await ctx.db.households.get(m.householdId);

				// A membership pointing at a household that is gone: delete the
				// row below and decide nothing about a household nobody can reach.
				if (! household) continue;

				const members = await collectAll(() => ctx.db.memberships
					.withIndex('by_household', (r) => r.eq('householdId', m.householdId))
					);

				const owners = members.filter((x) => toRole(x.role) === 'owner').length;

				plan.set(m.householdId, {
					fate: fateOf(toRole(m.role), members.length, owners),
					membershipId: m.id,
				});
			}

			// --- validate every decision, then write ---

			const answered = new Map<string, OwnershipDecision>();

			for (const decision of Array.isArray(decisions) ? decisions : []) {
				const entry = plan.get(decision.householdId);

				/*
				 * A decision about a household that needed none means the client
				 * and the server disagree about the state — a household somebody
				 * else took over while the dialog was open, or a stale one. Dropping
				 * it quietly would let that dialog delete a pantry nobody chose.
				 */
				if (! entry || entry.fate !== 'decide' || answered.has(decision.householdId)) {
					throw new AccessError('Something changed while you were deciding. Open this again.');
				}

				if (decision.action === 'transfer') {
					const members = await collectAll(() => ctx.db.memberships
						.withIndex('by_household', (r) => r.eq('householdId', decision.householdId))
						);

					const target = members.find((x) => x.id === decision.toMembershipId);

					if (! target || target.userId === userId) {
						throw new AccessError('Choose someone else in that household to hand it to.');
					}
				} else if (decision.action !== 'delete') {
					throw new AccessError('Something changed while you were deciding. Open this again.');
				}

				answered.set(decision.householdId, decision);
			}

			for (const [householdId, entry] of plan) {
				if (entry.fate !== 'decide' || answered.has(householdId)) continue;

				const household = await ctx.db.households.get(householdId);

				throw new AccessError(
					household
						? `Decide what happens to ${household.name} first.`
						: 'Something changed while you were deciding. Open this again.'
				);
			}

			// --- write ---

			for (const [householdId, entry] of plan) {
				const decision = answered.get(householdId);

				/*
				 * **`goes` is deleted without being asked about**, which is the one
				 * place this handler acts on a household with no decision attached.
				 * You are its only member: there is nobody to hand it to, so a
				 * screen that asked would be offering a choice with one answer.
				 */
				if (entry.fate === 'goes' || decision?.action === 'delete') {
					await deleteHouseholdRows(ctx.db, householdId);
					continue;
				}

				if (decision?.action !== 'transfer') continue;

				const members = await collectAll(() => ctx.db.memberships
					.withIndex('by_household', (r) => r.eq('householdId', householdId))
					);

				// Re-found rather than carried from the validation pass — the same
				// re-read-before-you-write rule every other handler follows.
				const target = members.find((x) => x.id === decision.toMembershipId);

				if (target && toRole(target.role) !== 'owner') {
					await ctx.db.memberships.update(target.id, { role: 'owner' });
					await bumpHousehold(ctx.db, householdId, { owners: 1 }, Date.now());
				}
			}

			// Everything that is left. A household deleted above has had its
			// memberships removed with it, so this skips rows that are gone.
			for (const m of mine) {
				const still = await ctx.db.memberships.get(m.id);

				if (! still) continue;

				await revokeInvitesBy(ctx.db, m.householdId, userId);
				/*
				 * **Live trips go with the account** (D66). A claim is the one row
				 * in this database that records who touched what, and it is
				 * transient precisely so that deleting an account stays a clean
				 * operation rather than a scrubbing job.
				 */
				await endTripsFor(ctx.db, m.householdId, userId);
				await ctx.db.memberships.delete(m.id);

				/*
				 * The household survives and is one member lighter. `m.role` is
				 * the role this account held there — a sole owner cannot reach
				 * this line, because a household they solely owned was either
				 * deleted or transferred above, so the owner count only falls
				 * where somebody else is still holding it.
				 */
				await bumpHousehold(
					ctx.db,
					m.householdId,
					{ members: -1, owners: toRole(m.role) === 'owner' ? -1 : 0 },
					Date.now()
				);
			}

			// The profile's own stamp is the account's birthday as far as this
			// app is concerned, and it is about to be unreadable.
			await recordDeletion(ctx.db, 'account', profile ? addedAtOf(profile) : '');

			if (profile) await ctx.db.profiles.delete(profile.id);

			ctx.invalidate(
				'households', 'household', 'pantry', 'profile', 'claims', 'account',
				// The console is looking at a space one fewer account and possibly
				// two fewer households than it was.
				'adminAccount', 'adminPeople', 'adminSummary', 'adminHouseholds', 'adminHousehold'
			);
		}),

		/*
		 * --- the admin console's writes (D62) ---
		 *
		 * Six mutations that reach into a household the caller is **not** a
		 * member of, which is a thing nothing else in this capsule does. Every
		 * one of them starts with `requireAdminWrite` and there is no second line
		 * of defence anywhere beneath it — Zero has no row-level security, and an
		 * administrator has no membership row to resolve against.
		 *
		 * **All six are switched off right now.** `requireAdminWrite` is
		 * `requireAdmin` plus `ADMIN_WRITES_HELD`, and that flag is `true` while
		 * the console is being read rather than used. The handlers below are
		 * whole and unmodified on purpose: what is being tried out is the real
		 * console, and turning it back on is one constant in `shared/admin.ts`.
		 *
		 * Three rules are carried over deliberately rather than reimplemented,
		 * because an administrator is not exempt from any of them:
		 *
		 * - **D22's last-owner guard.** An admin cannot demote or remove a
		 *   household's only owner. That is not a limitation, it is the flow: the
		 *   fix for an ownerless household is to *promote* somebody, and a
		 *   console that could strand one would be manufacturing the very state
		 *   Overview flags as needing attention.
		 * - **D21's invite revocation.** A demotion or a removal kills the
		 *   invites that person minted, or an owner dropped to editor keeps
		 *   minting editors through a link already in the wild.
		 * - **The delete cascade**, children first, because Zero has none.
		 *
		 * Each invalidates the three console queries **and** the app's own, since
		 * the people affected are elsewhere with the app open and the whole point
		 * is that what they see changes.
		 */

		/** The household this admin write names, or a refusal. Never a membership. */
		adminSetRole: mutation(async (
			ctx,
			householdId: string,
			membershipId: string,
			nextRole: string
		) => {
			requireAdminWrite(ctx);

			const members = await adminMembersOf(ctx.db, householdId);
			const target = members.find((m) => m.id === membershipId);

			if (! target) throw new AccessError('That member is no longer in this household.');

			const role = toRole(nextRole);

			// D22, and it is what makes the ownerless case fixable rather than
			// creatable: promoting is always allowed, demoting the last owner
			// never is.
			if (role !== 'owner' && wouldStrandHousehold(members, membershipId)) {
				throw new AccessError(
					'This household needs at least one owner. Make someone else an owner first.'
				);
			}

			// Nothing to do, and saying so beats a write plus a refresh for
			// every subscriber — the same short-circuit `setSourceKind` makes,
			// and the reason a role menu's current row is a safe place to press.
			if (toRole(target.role) === role) return;

			const before = toRole(target.role);

			await ctx.db.memberships.update(target.id, { role });

			// An administrator is not exempt from the bookkeeping either — the
			// console's whole purpose is fixing the ownerless households
			// Overview flags, and a promotion that did not clear the flag would
			// make the console argue with itself.
			await bumpHousehold(
				ctx.db,
				householdId,
				{ owners: (role === 'owner' ? 1 : 0) - (before === 'owner' ? 1 : 0) },
				Date.now()
			);

			await revokeInvitesBy(ctx.db, householdId, target.userId);

			await logActivity(ctx, {
				action: 'member.role',
				targetKind: 'membership',
				targetId: target.id,
				targetName: target.displayName,
				fromValue: before,
				toValue: role,
			});

			ctx.invalidate(
				'adminHousehold', 'adminSummary', 'adminHouseholds', 'adminActivity',
				'household', 'pantry'
			);
		}),

		adminRemoveMember: mutation(async (ctx, householdId: string, membershipId: string) => {
			requireAdminWrite(ctx);

			const members = await adminMembersOf(ctx.db, householdId);
			const target = members.find((m) => m.id === membershipId);

			if (! target) throw new AccessError('That member is no longer in this household.');

			if (wouldStrandHousehold(members, membershipId)) {
				throw new AccessError(
					'This household needs at least one owner. Make someone else an owner first.'
				);
			}

			const household = await ctx.db.households.get(householdId);

			await revokeInvitesBy(ctx.db, householdId, target.userId);
			// **A claim goes with the person who made it.** A row reading *In
			// Sarah's cart* after Sarah has left is a row nobody can clear —
			// which is the state D66's own refusal (*you cannot claim a row
			// somebody else holds*) would otherwise make permanent.
			await endTripsFor(ctx.db, householdId, target.userId);
			await ctx.db.memberships.delete(target.id);

			await bumpHousehold(
				ctx.db,
				householdId,
				{ members: -1, owners: toRole(target.role) === 'owner' ? -1 : 0 },
				Date.now()
			);

			await logActivity(ctx, {
				action: 'member.remove',
				targetKind: 'membership',
				targetId: target.id,
				targetName: target.displayName,
				toValue: household?.name ?? '',
			});

			ctx.invalidate(
				'adminHousehold', 'adminSummary', 'adminHouseholds', 'adminActivity',
				'households', 'household', 'pantry'
			);
		}),

		adminRevokeInvite: mutation(async (ctx, householdId: string, inviteId: string) => {
			requireAdminWrite(ctx);

			const household = await ctx.db.households.get(householdId);

			if (! household) throw new AccessError('That household no longer exists.');

			const invite = await ctx.db.invites.get(inviteId);

			// The household id is checked against the row rather than trusted,
			// even though an administrator could name any household anyway. It
			// costs one comparison and it means a mismatched pair is a refusal
			// instead of a revocation somewhere nobody was looking.
			if (! invite || invite.householdId !== household.id) {
				throw new AccessError('That invite no longer exists.');
			}

			if (invite.revoked) return;

			await ctx.db.invites.update(invite.id, { revoked: true });

			await logActivity(ctx, {
				action: 'invite.revoke',
				targetKind: 'invite',
				targetId: invite.id,
				// The invite's own name is the household it lets you into — a code
				// is the one thing that must never reach this table.
				targetName: household.name,
				fromValue: toRole(invite.role),
				toValue: household.name,
			});

			// `invitePreview` too: a stranger may be sitting on the landing card
			// this link opened, and revoking is meant to reach them.
			ctx.invalidate(
				'adminHousehold', 'adminSummary', 'adminActivity', 'household', 'invitePreview'
			);
		}),

		/**
		 * Deletes a household and everything in it, on behalf of nobody in it.
		 *
		 * **The app's second typed confirmation, and it earns it.** The first —
		 * deleting your own last household — earned the exception by destroying
		 * data belonging to more than one screen. This destroys data belonging to
		 * people who are not in the room, and the typing happens client-side
		 * because the server has no way to tell a deliberate call from a careless
		 * one and should not pretend otherwise.
		 *
		 * The cascade is `deleteHousehold`'s, verbatim and for the same reason:
		 * join rows, then what they point at, then the household. Zero has no
		 * cascading deletes, so a table missed here is rows that outlive every
		 * route to them.
		 */
		adminDeleteHousehold: mutation(async (ctx, householdId: string) => {
			requireAdminWrite(ctx);

			const household = await ctx.db.households.get(householdId);

			if (! household) throw new AccessError('That household no longer exists.');

			// Counted **before** the cascade, because after it there is nothing
			// left to count and this row is the only surviving record of what was
			// there. That is the whole reason a deletion entry denormalises.
			const held = await countHousehold(ctx.db, household.id);

			await deleteHouseholdRows(ctx.db, household.id);

			await logActivity(ctx, {
				action: 'household.delete',
				targetKind: 'household',
				targetId: household.id,
				targetName: household.name,
				targetInk: householdInk(household.ink, household.id),
				held,
			});

			ctx.invalidate(
				'adminHousehold', 'adminSummary', 'adminHouseholds', 'adminActivity',
				'households', 'household', 'pantry'
			);
		}),

		/**
		 * Hands a household over: one member becomes its owner, and everyone who
		 * was an owner stops being one.
		 *
		 * **This is the capability the app did not have**, and it is not what the
		 * role menu does. Promoting somebody adds an owner; transferring *moves*
		 * ownership, which is two writes that have to happen together or the
		 * household briefly has two owners and might keep them. Deletion is what
		 * forced it to exist — and now that it does, the orphan case has
		 * something to call.
		 *
		 * A household with **no** owner is the case this is really for, and it
		 * needs no `from`: there is nobody to demote, so the transfer is the
		 * promotion. That is why the demotion is derived from the row rather than
		 * named by the caller — a client that had to say who the current owner
		 * was would be a client that could get it wrong.
		 */
		adminTransferOwnership: mutation(async (
			ctx,
			householdId: string,
			toMembershipId: string
		) => {
			requireAdminWrite(ctx);

			const members = await adminMembersOf(ctx.db, householdId);
			const target = members.find((m) => m.id === toMembershipId);

			if (! target) throw new AccessError('That member is no longer in this household.');

			// The promotion first, so there is never an instant with no owner —
			// which is the state this exists to get a household *out* of.
			const wasOwner = toRole(target.role) === 'owner';

			if (! wasOwner) {
				await ctx.db.memberships.update(target.id, { role: 'owner' });
			}

			const previousOwners: string[] = [];

			for (const m of members) {
				if (m.id === target.id || toRole(m.role) !== 'owner') continue;

				previousOwners.push(m.displayName);
				await ctx.db.memberships.update(m.id, { role: 'editor' });
				// D21: a demoted owner's invites stop working, or somebody who
				// has just been handed a household finds the previous owner still
				// minting editors through a link already out.
				await revokeInvitesBy(ctx.db, householdId, m.userId);
			}

			/*
			 * **This one ends at exactly one owner, whatever it started at**, so
			 * the delta is derived from the final state rather than accumulated
			 * through the loop. A hand-over is not a promotion: every other owner
			 * was just demoted, and the arithmetic has to say so in one place
			 * rather than once per iteration.
			 */
			await bumpHousehold(
				ctx.db,
				householdId,
				{ owners: 1 - (previousOwners.length + (wasOwner ? 1 : 0)) },
				Date.now()
			);

			const household = await ctx.db.households.get(householdId);

			await logActivity(ctx, {
				action: 'household.transfer',
				targetKind: 'household',
				targetId: householdId,
				targetName: household?.name ?? '',
				targetInk: household ? householdInk(household.ink, household.id) : '',
				fromValue: previousOwners.join(', '),
				toValue: target.displayName,
			});

			ctx.invalidate(
				'adminHousehold', 'adminAccount', 'adminPeople', 'adminHouseholds',
				'adminActivity', 'household', 'pantry'
			);
		}),

		/**
		 * Deletes an account: every membership it holds, and its profile row.
		 *
		 * **It does not delete the identity, and it cannot.** A Spacefast account
		 * lives on the platform; what this app owns is the rows keyed to its
		 * `userId`. So this removes the person from Larder Log completely, and
		 * signing in again would produce a stranger with the same id and no
		 * history — which is the honest description and belongs in the copy.
		 *
		 * **The pre-flight is what makes it reachable at all.** D22 blocks a sole
		 * owner from leaving a household; run that rule against every household
		 * at once and deleting an account becomes a wall for exactly the people
		 * most likely to want it. `decisions` turns each block into a choice, and
		 * the handler refuses rather than guessing when one is missing.
		 *
		 * Order matters and it is the reverse of what reads naturally: every
		 * decision is **validated before anything is written**, because a
		 * half-applied deletion leaves a household transferred to somebody and an
		 * account still present, with no record of either. Zero gives a mutation
		 * one transaction, but a thrown error partway through is still the worst
		 * possible moment to discover the third row was malformed.
		 */
		/**
		 * Recompute `households`' rollup columns from the rows that are the truth.
		 *
		 * **This is the backfill, and it is a mutation rather than an endpoint on
		 * purpose.** An `endpoint` gets a full `ServerContext` and **no
		 * `ctx.auth`** — the finding that stopped the console's own bootstrap
		 * problem being solvable that way — so an endpoint could not tell an
		 * administrator from a stranger, and this rewrites every household in the
		 * space.
		 *
		 * **`requireAdmin`, not `requireAdminWrite`.** The hold exists so that the
		 * first look at the console cannot delete somebody's pantry; a repair
		 * destroys nothing, and holding it would mean the console's numbers could
		 * not be made true until the hold came off — which is backwards, since
		 * reading correct numbers is the whole of what the hold leaves you able to
		 * do.
		 *
		 * **One page per call, with the cursor handed back.** A repair that walked
		 * a million households inside one mutation would be one request holding
		 * every row in memory, which is the failure this entire stage exists to
		 * avoid; and there is no scheduler to hand it to. So the caller loops, and
		 * `remaining` is deliberately *not* returned — nothing can know how many
		 * rows are left without walking them, and a fabricated total is worse than
		 * an honest cursor.
		 *
		 * It is idempotent: a household already holding true counts is written
		 * again with the same values, and `checked` minus `repaired` says how many
		 * were already right.
		 */
		adminRepairCounts: mutation(async (
			ctx,
			args: { cursor?: string | null; pageSize?: number } = {}
		) => {
			requireAdmin(ctx);

			const pageSize = Math.min(Math.max(Math.floor(args.pageSize ?? REPAIR_PAGE), 1), REPAIR_PAGE);

			const result = await ctx.db.households
				.withIndex('by_creation')
				.paginate({ cursor: args.cursor ?? null, numItems: pageSize });

			let repaired = 0;

			for (const household of result.page) {
				const truth = await recountHousehold(ctx.db, household.id);

				/*
				 * **The stamp is repaired from the rows too, and it is the reason
				 * `activityInHousehold` still exists.** A household nothing has
				 * written since the column arrived has `changedAt` of `''`, and
				 * reading that as *never active* would report every one of them
				 * as dormant — the exact shape of wrong this stage is here to
				 * stop. The expensive scan survives for the one caller that has
				 * to produce a true answer from nothing.
				 */
				const found = await activityInHousehold(ctx.db, household.id);

				const next: Record<string, string> = {
					itemCount: padCount(truth.items),
					memberCount: padCount(truth.members),
					ownerCount: padCount(truth.owners),
				};

				/*
				 * **The repair never moves this stamp backwards, and that is not
				 * a nicety — it is the difference between a repair and a
				 * regression.** `activityInHousehold` can only see rows that
				 * still exist: items and the three taxonomies. It cannot see a
				 * rename, a role change, somebody joining or leaving, or — the
				 * sharpest case — an item that has been *deleted*, whose stamp
				 * went with it. All of those move `changedAt` through
				 * `bumpHousehold`, and every one of them is genuinely more
				 * recent than anything the scan can find.
				 *
				 * Measured rather than reasoned about: a run of membership
				 * changes left the three counts correct and this stamp the only
				 * field the repair wanted to rewrite, backwards.
				 *
				 * So the rule is *the later of what is stored and what can be
				 * found*, which still backfills an unset column from the rows —
				 * the case the repair exists for — while leaving a maintained
				 * stamp alone. A household with neither has its birth, the
				 * `addedAtOf` fallback made concrete so nothing downstream has to
				 * keep falling back.
				 */
				const stored = household.changedAt || '';

				next.changedAt = (found > stored ? found : stored) || addedAtOf(household);

				const wasRight =
					household.itemCount === next.itemCount &&
					household.memberCount === next.memberCount &&
					household.ownerCount === next.ownerCount &&
					household.changedAt === next.changedAt;

				if (! wasRight) repaired += 1;

				await ctx.db.households.update(household.id, next);
			}

			ctx.invalidate('adminSummary', 'adminHouseholds', 'adminHousehold', 'households');

			return {
				checked: result.page.length,
				repaired,
				cursor: result.isDone ? null : result.continueCursor,
				done: result.isDone,
			};
		}),

		adminDeleteAccount: mutation(async (
			ctx,
			userId: string,
			decisions: AdminOwnershipDecision[] = []
		) => {
			requireAdminWrite(ctx);

			if (! userId) throw new AccessError('That account no longer exists.');

			/*
			 * **Including the caller's own, and including every other
			 * administrator.** One administrator deleting a peer's account is the
			 * sharper half of this guard: the console can already reach any
			 * household, and this is the one row it must not be able to remove,
			 * because `LARDER_ADMIN_IDS` would still name it afterwards.
			 *
			 * `isAdminId`, not `isAdminUser` — the question is about the *target*,
			 * who is not in the room, and `isAdminUser` answers a question about
			 * a caller. See its docblock: the two must not be swapped.
			 */
			if (isAdminId(userId, ctx.env[ADMIN_IDS_VAR])) {
				throw new AccessError(ADMIN_UNDELETABLE_REFUSAL);
			}

			const mine = await collectAll(() => ctx.db.memberships
				.withIndex('by_user', (r) => r.eq('userId', userId))
				);

			const profile = await ctx.db.profiles
				.withIndex('by_user', (r) => r.eq('userId', userId))
				.first();

			if (mine.length === 0 && ! profile) {
				throw new AccessError('That account no longer exists.');
			}

			/*
			 * **What happens to each household, from `fateOf` — the same function
			 * the app's own deletion reads, and the same one the dialog draws
			 * from.** This handler used to carry its own classification, and it
			 * was missing the `members <= 1` test that D68 names in so many
			 * words: *tested before the role, and that ordering is the rule —
			 * testing the role first makes a sole-member household a question,
			 * which is a screen offering a choice with one answer.*
			 *
			 * So the console demanded a decision about a household the target was
			 * **alone** in, where *transfer* has nobody to name and *delete* is
			 * the only workable answer — while `deleteMyAccount`, on the very
			 * same household, filed it as `goes` and destroyed it without asking.
			 * Two descriptions of *which households are a question*, disagreeing
			 * exactly once, over somebody's data. There is one now.
			 */
			const plan = new Map<string, { fate: HouseholdFate; membershipId: string }>();

			for (const m of mine) {
				const household = await ctx.db.households.get(m.householdId);

				// A membership pointing at a household that is gone: delete the
				// row below and decide nothing about a household nobody can reach.
				if (! household) continue;

				const members = await collectAll(() => ctx.db.memberships
					.withIndex('by_household', (r) => r.eq('householdId', m.householdId))
					);

				const owners = members.filter((x) => toRole(x.role) === 'owner').length;

				plan.set(m.householdId, {
					fate: fateOf(toRole(m.role), members.length, owners),
					membershipId: m.id,
				});
			}

			/** The households that are a *question*, and only those. */
			const needed = [...plan]
				.filter(([, entry]) => entry.fate === 'decide')
				.map(([householdId, entry]) => ({ householdId, membershipId: entry.membershipId }));

			// --- validate everything, then write ---

			const answered = new Map<string, AdminOwnershipDecision>();

			for (const d of decisions) {
				const need = needed.find((n) => n.householdId === d.householdId);

				// A decision about a household that needed none means the client
				// and the server disagree about the state. Dropping it quietly
				// would let a stale dialog delete a household nobody chose.
				if (! need) {
					throw new AccessError('Something changed while you were deciding. Open this again.');
				}

				if (answered.has(d.householdId)) {
					throw new AccessError('Something changed while you were deciding. Open this again.');
				}

				if (d.action === 'transfer') {
					const members = await collectAll(() => ctx.db.memberships
						.withIndex('by_household', (r) => r.eq('householdId', d.householdId))
						);

					const target = members.find((x) => x.id === d.toMembershipId);

					if (! target || target.userId === userId) {
						throw new AccessError('Choose someone else in that household to hand it to.');
					}
				} else if (d.action !== 'delete') {
					throw new AccessError('Something changed while you were deciding. Open this again.');
				}

				answered.set(d.householdId, d);
			}

			const unanswered = needed.filter((n) => ! answered.has(n.householdId));

			if (unanswered.length > 0) {
				const household = await ctx.db.households.get(unanswered[0].householdId);

				throw new AccessError(
					household
						? `Decide what happens to ${household.name} first.`
						: 'Something changed while you were deciding. Open this again.'
				);
			}

			// --- write ---

			// The account's own name, captured before its profile goes. After the
			// deletion there is nothing left to resolve it from, and this row is
			// the only surviving record that the account existed.
			const goingName = await accountNameOf(ctx.db, userId, ctx.auth);

			for (const [householdId, entry] of plan) {
				const decision = answered.get(householdId);
				const household = await ctx.db.households.get(householdId);

				/*
				 * **`goes` is destroyed without being asked about**, and that is
				 * the half of this fix that is not a refusal. Removing the last
				 * membership and leaving the household standing manufactures a
				 * pantry nobody can reach — the exact state D68 was written to
				 * prevent, and the reason the requirement and the write had to
				 * move together rather than one at a time.
				 */
				if (entry.fate === 'goes' || decision?.action === 'delete') {
					// Counted before the cascade, and logged as its own entry: a
					// household deleted this way is as gone as one deleted from its
					// own page, and the log must not make the two look different.
					const held = await countHousehold(ctx.db, householdId);

					await deleteHouseholdRows(ctx.db, householdId);

					await logActivity(ctx, {
						action: 'household.delete',
						targetKind: 'household',
						targetId: householdId,
						targetName: household?.name ?? '',
						targetInk: household ? householdInk(household.ink, household.id) : '',
						held,
					});

					continue;
				}

				if (decision?.action !== 'transfer') continue;

				const members = await collectAll(() => ctx.db.memberships
					.withIndex('by_household', (r) => r.eq('householdId', householdId))
					);

				const target = members.find((x) => x.id === decision.toMembershipId);

				// Re-found rather than carried from the validation pass: the same
				// re-read-before-you-write rule every other handler follows.
				if (target) {
					const wasOwner = toRole(target.role) === 'owner';

					await ctx.db.memberships.update(target.id, { role: 'owner' });

					if (! wasOwner) {
						await bumpHousehold(ctx.db, householdId, { owners: 1 }, Date.now());
					}

					await logActivity(ctx, {
						action: 'household.transfer',
						targetKind: 'household',
						targetId: householdId,
						targetName: household?.name ?? '',
						targetInk: household ? householdInk(household.ink, household.id) : '',
						fromValue: goingName,
						toValue: target.displayName,
					});
				}
			}

			// Everything that is left. A household that was deleted above has had
			// its memberships removed with it, so this skips rows that are gone.
			for (const m of mine) {
				const still = await ctx.db.memberships.get(m.id);

				if (! still) continue;

				await revokeInvitesBy(ctx.db, m.householdId, userId);
				/*
				 * **Live trips go with the account** (D66), which is the promise
				 * the design makes in so many words: *delete account still removes
				 * a display name, an email, an avatar, membership rows and invites
				 * — plus any live trips, which nobody will miss.*
				 *
				 * It is also what keeps the privacy line true. A claim is the one
				 * row in this database that records who touched what, and it is
				 * transient precisely so that deleting an account stays a clean
				 * operation rather than a scrubbing job.
				 */
				await endTripsFor(ctx.db, m.householdId, userId);
				await ctx.db.memberships.delete(m.id);

				// `deleteMyAccount`'s own arithmetic, on the console's copy of
				// the flow. The two handlers are deliberately not one function
				// (D68), so this is one of the places they have to be kept in
				// step by hand.
				await bumpHousehold(
					ctx.db,
					m.householdId,
					{ members: -1, owners: toRole(m.role) === 'owner' ? -1 : 0 },
					Date.now()
				);
			}

			await recordDeletion(ctx.db, 'account', profile ? addedAtOf(profile) : '');

			if (profile) await ctx.db.profiles.delete(profile.id);

			await logActivity(ctx, {
				action: 'account.delete',
				targetKind: 'account',
				targetId: userId,
				targetName: goingName,
				held: { households: mine.length },
			});

			ctx.invalidate(
				'adminAccount', 'adminPeople', 'adminSummary', 'adminHouseholds', 'adminHousehold',
				'adminActivity', 'households', 'household', 'pantry', 'profile', 'claims'
			);
		}),
	},

	endpoints: {
		// `mode` is required as of @spacefast/zero 0.4.1, and it is the field the
		// platform's runner had been demanding since 2026-09-06 while no released
		// compiler emitted it — see `.claude/docs/spacefast.md`. It reads nothing,
		// so `read` is both true and the narrower capability set.
		status: endpoint({ mode: 'read', method: 'GET', path: '/api/status' }, () => text('ok')),
	},
});

// --- helpers ---

/**
 * Read every row a query matches, rather than the first thousand of them.
 *
 * **`collect()` silently truncates at 1,000 rows.** Not a table limit, not a
 * write limit, and not specific to an index — any single result set, with or
 * without a range predicate. Measured on 2026-09-02: a space holding 3,045
 * items answered `1000` to one `collect()`, and a household really holding
 * 1,200 answered `1000` to a scoped one. It is `MAX_LOCAL_QUERY_ROWS` in the
 * CLI's own bundle, applied as `results.slice(0, maxRows)` **whether or not a
 * `limit()` was asked for**, so the caller cannot tell a complete answer from a
 * cut one.
 *
 * That is the worst shape a limit can have. A truncated read is not an error,
 * not a slow page and not a warning — it is a number that is quietly too small,
 * and everything computed from it inherits the lie. It is why the console
 * reported a 40-item household as the biggest pantry in a space containing a
 * 1,200-item one.
 *
 * **`paginate()` walks past it and costs nothing to use.** `numItems` is
 * clamped to the same 1,000, but the cursor advances — measured at 3,245 rows
 * in 4 pages. For any result *under* the cap it is a single call with `isDone`
 * already true, which is exactly what `collect()` was, so this is a strict
 * improvement at every call site rather than a trade.
 *
 * **Takes a thunk, not a builder.** A builder resets its own state once it has
 * been read, so reusing one across pages is a bug that would look like an
 * early stop. Opening a fresh one per page is correct however the SDK behaves.
 *
 * **It cannot throw**, because a query that throws never emits and the client
 * cannot tell that apart from loading. A cursor that fails to advance ends the
 * walk instead — a short answer beats a hung subscription.
 */
type PageableQuery<T> = {
	paginate(options: { cursor: string | null; numItems: number }): Promise<{
		continueCursor: string | null;
		isDone: boolean;
		page: T[];
	}>;
};

async function collectAll<T>(open: () => PageableQuery<T>): Promise<T[]> {
	const rows: T[] = [];
	let cursor: string | null = null;

	for (;;) {
		const result = await open().paginate({ cursor, numItems: 1000 });

		rows.push(...result.page);

		if (result.isDone || ! result.continueCursor || result.continueCursor === cursor) break;

		cursor = result.continueCursor;
	}

	return rows;
}

/**
 * A household's members, for an admin write, or a refusal if it is gone.
 *
 * The console's equivalent of `requireCapability`'s return value: the app's
 * mutations get a `membership` back and read `membership.householdId` from it,
 * which is what makes an id a selector rather than an authority. An
 * administrator has no membership, so this is the only re-read there is — and
 * it doubles as the existence check, since a household with no row has no
 * members and every caller here needs the list anyway.
 */
async function adminMembersOf(db: WriteDb, householdId: string) {
	const household = householdId ? await db.households.get(householdId) : null;

	if (! household) throw new AccessError('That household no longer exists.');

	return collectAll(() => db.memberships
		.withIndex('by_household', (r) => r.eq('householdId', household.id))
		);
}

/**
 * The last stamp this isolate handed to an audit row.
 *
 * **An audit log's one job is order, and millisecond stamps are not enough.**
 * `adminDeleteAccount` writes a `household.transfer` and then an
 * `account.delete`, and both landed on the same millisecond in testing — at
 * which point `by_at` descending put the transfer *above* the deletion that
 * caused it, so the log read as though a household had been handed over after
 * the account was already gone. Caught by driving the real handler; nothing
 * short of reading the rows back would have shown it.
 *
 * So a stamp is never reused: if the clock has not moved, the next row takes
 * the previous stamp plus a millisecond. That makes `at` strictly increasing
 * within an isolate, which is what `by_at` needs to be a true order.
 *
 * **It is per-isolate, not global**, and that is the honest limit: two
 * concurrent requests on separate isolates can still tie. At this scale nothing
 * writes concurrently, and the alternative is a sequence row and a write per
 * write. Worth revisiting if the log ever becomes busy.
 */
let lastActivityStamp = 0;

/**
 * Writes one audit row (D62).
 *
 * **Every administrative write calls this, and nothing else does.** The log
 * records administration — things done to a household or an account from the
 * console — and nothing a household does to its own pantry. `addItem` must
 * never appear here; a console that logged it would be the surveillance the
 * household page refuses to be.
 *
 * The actor is resolved through `accountName()`, the same chain the member list
 * uses, so a log row and a member row never print the same person differently.
 * It is **denormalised on purpose**: an audit row that stops naming its actor
 * once that account is deleted is an audit log you can erase by deleting
 * yourself. That is a real erasure question and the design flags it for a
 * lawyer's read; it is not a thing to decide by leaving the column joinable.
 *
 * It never throws. A write that succeeded and a log row that did not is bad; a
 * write rolled back because the *log* failed is worse, and a log is not the
 * thing the caller asked for.
 */
async function logActivity(
	ctx: {
		auth: AuthContext;
		db: WriteDb;
		env: Record<string, string | undefined>;
		log: LogContext;
	},
	entry: {
		action: ActivityAction;
		targetKind?: TargetKind;
		targetId?: string;
		targetName?: string;
		targetInk?: string;
		fromValue?: string;
		toValue?: string;
		held?: Held;
	}
): Promise<void> {
	const now = Date.now();
	// Strictly increasing. See `lastActivityStamp`.
	const at = now > lastActivityStamp ? now : lastActivityStamp + 1;

	lastActivityStamp = at;

	try {
		await ctx.db.activity.insert({
			at: stampFrom(at),
			actorId: ctx.auth.userId,
			actorName: await accountName(ctx),
			actorKind: 'person',
			action: entry.action,
			targetKind: entry.targetKind ?? '',
			targetId: entry.targetId ?? '',
			targetName: entry.targetName ?? '',
			targetInk: entry.targetInk ?? '',
			fromValue: entry.fromValue ?? '',
			toValue: entry.toValue ?? '',
			held: entry.held ? encodeHeld(entry.held) : '',
		});
	} catch (err) {
		// `ctx.log` is the only way anything is heard from the hosted runtime —
		// an uncaught handler exception logs nothing at all. A missing audit row
		// is exactly the kind of silence worth breaking.
		ctx.log.error('activity log write failed', { action: entry.action, err: String(err) });
	}

	await pruneActivity(ctx);
}

/**
 * Deletes expired audit rows, a few at a time.
 *
 * Called after every append, which is the only moment this app is guaranteed to
 * be running code with a write handle — there is no scheduler. See
 * `PRUNE_PER_WRITE` for what that costs.
 *
 * `by_at` ascending with `take()` is exactly the read this wants: the oldest
 * rows first, bounded, and the index is already there for the log's own order.
 *
 * It never throws, for `logActivity`'s reason and one more: a failed prune must
 * not roll back the row it was pruning *for*. An audit entry that was not
 * written because the housekeeping after it failed is the worst possible trade.
 */
async function pruneActivity(ctx: { db: WriteDb; env: Record<string, string | undefined>; log: LogContext }): Promise<void> {
	try {
		const months = toRetentionMonths(ctx.env[RETENTION_VAR]);
		const cutoff = retentionCutoff(new Date().toISOString(), months);

		if (! cutoff) return;

		const expired = await ctx.db.activity
			.withIndex('by_at', (r) => r.lt('at', cutoff))
			.order('asc')
			.take(PRUNE_PER_WRITE);

		for (const row of expired) await ctx.db.activity.delete(row.id);
	} catch (err) {
		ctx.log.error('activity prune failed', { err: String(err) });
	}
}

/**
 * A **third party's** name, for a log row about them.
 *
 * `accountName()` answers for the *caller* and walks their identity as the last
 * link; this cannot, because the platform tells a handler about its caller and
 * never about anybody else. So the chain is one link shorter — the profile,
 * then any membership — with the caller's own identity used only when the
 * account being named happens to be theirs, which is the self-deletion case.
 *
 * It resolves to `''` rather than to an id when there is nothing: a log row
 * reading *deleted `account:7f3a…`'s account* says less than one that admits it
 * never knew the name, and the client renders the absence.
 *
 * **`ReadDb`, not `WriteDb`**, because the `account` query calls it too (D68) —
 * the typed confirmation asks you to type the name this resolves, so a second
 * resolution written for the query would be the one place the two could
 * disagree about who you are.
 */
async function accountNameOf(db: ReadDb, userId: string, auth: AuthContext): Promise<string> {
	const profile = await db.profiles
		.withIndex('by_user', (r) => r.eq('userId', userId))
		.first();

	const memberships = await collectAll(() => db.memberships
		.withIndex('by_user', (r) => r.eq('userId', userId))
		);

	return pickDisplayName(
		profile?.displayName ?? '',
		...memberships.map((m) => m.displayName),
		userId === auth.userId ? auth.displayName : ''
	);
}

/**
 * The one writer of `households`' four rollup columns, and it has to stay the
 * only one.
 *
 * **Thirty hand-written increments would disagree exactly once**, and a counter
 * that is wrong is wrong forever with nothing to detect it — there is no
 * aggregate to check it against, which is the whole reason the column exists.
 * So the padding, the clamp, the self-heal and the `changedAt` bump live here
 * and every caller passes a delta.
 *
 * **An uncounted column is recomputed rather than assumed to be zero, and that
 * is the load-bearing line.** Every household on the published space predates
 * these columns and nothing backfills (D44's standing rule), so the first write
 * to one of them finds `''`. Adding one to that would store `1` for a household
 * holding forty and carry the lie forward through every later bump. Instead the
 * first write pays for a scoped read of that household's own rows and stores
 * the truth — so the backfill is something the app does to itself as people use
 * it, and `adminRepairCounts` is for drift and for the households nobody has
 * touched, rather than a migration everything waits on.
 *
 * **The recount is bounded by one household, never by the space.** Three
 * indexed reads of rows that household already owns, once, and only on the
 * first write since the column arrived.
 *
 * **Call this after the write it is accounting for, never before.** The
 * self-heal recounts from the rows, so it can only be right if the row in
 * question is already in its final state; the incremental branch wants the same
 * order for the mirror-image reason. One rule, and it is the same rule for both
 * branches, which is why it is a rule rather than a per-caller judgement.
 *
 * A household that has been deleted is not an error: `deleteHouseholdRows`
 * removes memberships and items on its way out, and each of those call sites
 * would otherwise have to know whether the row above them still exists.
 */
async function bumpHousehold(
	db: WriteDb,
	householdId: string,
	delta: { items?: number; members?: number; owners?: number },
	nowMs: number
): Promise<void> {
	const row = await db.households.get(householdId);

	if (! row) return;

	const patch: Record<string, string> = {};

	/*
	 * `''` is *not counted* and `'000000000000'` is *counted, and zero*. The
	 * two read identically through `readCount` on purpose — its callers are
	 * rendering a number — so the writer asks `isCounted` instead, which is the
	 * distinction this whole function turns on.
	 */
	const needsRecount =
		(delta.items !== undefined && ! isCounted(row.itemCount)) ||
		(delta.members !== undefined && ! isCounted(row.memberCount)) ||
		(delta.owners !== undefined && ! isCounted(row.ownerCount));

	if (needsRecount) {
		const truth = await recountHousehold(db, householdId);

		/*
		 * **The delta is dropped here, and that is the rule every caller
		 * depends on: bump *after* the write, never before.** A recount reads
		 * the rows as they are now, and the row this call is about has already
		 * been inserted or deleted — so the truth already contains the change
		 * and applying the delta on top of it would count the same item twice,
		 * in whichever direction the caller was moving.
		 *
		 * Written this way rather than as an ordering rule in ten docblocks,
		 * because the incremental branch below needs the same ordering and gets
		 * it for free: it reads the stored count, which was correct before this
		 * mutation and is stale by exactly one delta either way.
		 */
		patch.itemCount = padCount(truth.items);
		patch.memberCount = padCount(truth.members);
		patch.ownerCount = padCount(truth.owners);
	} else {
		if (delta.items !== undefined) {
			patch.itemCount = padCount(readCount(row.itemCount) + delta.items);
		}

		if (delta.members !== undefined) {
			patch.memberCount = padCount(readCount(row.memberCount) + delta.members);
		}

		if (delta.owners !== undefined) {
			patch.ownerCount = padCount(readCount(row.ownerCount) + delta.owners);
		}
	}

	/*
	 * Adding an item is activity. So the count and the stamp move together
	 * rather than through two calls, which is also what stops a caller from
	 * remembering one and forgetting the other.
	 */
	if (shouldTouch(row.changedAt, nowMs)) patch.changedAt = stampFrom(nowMs);

	await db.households.update(householdId, patch);
}

/**
 * *Something happened in here*, with no count attached.
 *
 * Editing an item, renaming a term or changing a role does not move any of the
 * three counts and is still the activity `dormant` is asking about. This is the
 * cheap half of `bumpHousehold`, and it is cheap in the way that matters:
 * **`shouldTouch` makes the ordinary case a read and no write at all.**
 *
 * `adjustQty` is why that floor exists. It is the app's hottest write, D44
 * refuses to exempt it from stamping, and without a granularity ten presses on
 * one card would be ten writes to a second row to move a value whose only
 * consumers round it to days.
 */
async function touchHousehold(db: WriteDb, householdId: string, nowMs: number): Promise<void> {
	const row = await db.households.get(householdId);

	if (! row || ! shouldTouch(row.changedAt, nowMs)) return;

	await db.households.update(householdId, { changedAt: stampFrom(nowMs) });
}

/**
 * A household's three counts, computed from the rows that are the truth.
 *
 * The self-heal inside `bumpHousehold` and the whole of `adminRepairCounts`
 * both read this, so there is one description of what each count means. A
 * second traversal somewhere else would drift by one definition — *is an owner
 * also a member?* — and both answers would look right.
 *
 * **An owner is a member**, so `owners <= members` always, and `noOwner` is
 * `owners === 0` rather than anything to do with `members`.
 */
async function recountHousehold(
	db: WriteDb,
	householdId: string
): Promise<{ items: number; members: number; owners: number }> {
	const [items, members] = await Promise.all([
		collectAll(() => db.items.withIndex('by_household', (r) => r.eq('householdId', householdId))),
		collectAll(() => db.memberships.withIndex('by_household', (r) => r.eq('householdId', householdId))),
	]);

	return {
		items: items.length,
		members: members.length,
		owners: members.filter((m) => toRole(m.role) === 'owner').length,
	};
}

/**
 * The newest activity anywhere inside a household, computed the expensive way.
 *
 * **This is what `households.changedAt` replaced**, and it survives for exactly
 * one caller: the repair, which has to be able to produce a true stamp for a
 * household nothing has written since the column arrived. Overview no longer
 * calls it, which is the point of the whole stage — it read four whole tables
 * on every load.
 *
 * Scoped to one household rather than the space, so it is four indexed reads of
 * rows that household owns. `lastActiveByHousehold`, which this replaces, took
 * the same four tables *whole*.
 */
async function activityInHousehold(db: WriteDb, householdId: string): Promise<string> {
	const [items, locations, types, stores] = await Promise.all([
		collectAll(() => db.items.withIndex('by_household', (r) => r.eq('householdId', householdId))),
		collectAll(() => db.locations.withIndex('by_household', (r) => r.eq('householdId', householdId))),
		collectAll(() => db.types.withIndex('by_household', (r) => r.eq('householdId', householdId))),
		collectAll(() => db.stores.withIndex('by_household', (r) => r.eq('householdId', householdId))),
	]);

	let newest = '';

	for (const row of [...items, ...locations, ...types, ...stores]) {
		const iso = changedAtOf(row);

		if (iso && iso > newest) newest = iso;
	}

	return newest;
}

/**
 * What a household holds, for a deletion entry's own copy of it.
 *
 * Called **before** the cascade, because afterwards there is nothing left to
 * count — which is the whole reason a deletion row denormalises rather than
 * pointing at something.
 */
async function countHousehold(db: WriteDb, householdId: string): Promise<Held> {
	const [items, locations, stores, types, members] = await Promise.all([
		collectAll(() => db.items.withIndex('by_household', (r) => r.eq('householdId', householdId))),
		collectAll(() => db.locations.withIndex('by_household', (r) => r.eq('householdId', householdId))),
		collectAll(() => db.stores.withIndex('by_household', (r) => r.eq('householdId', householdId))),
		collectAll(() => db.types.withIndex('by_household', (r) => r.eq('householdId', householdId))),
		collectAll(() => db.memberships.withIndex('by_household', (r) => r.eq('householdId', householdId))),
	]);

	return {
		items: items.length,
		locations: locations.length,
		stores: stores.length,
		types: types.length,
		members: members.length,
	};
}

/**
 * One line in the churn record. See `shared/lifecycle.ts` for what it holds and,
 * more importantly, what it does not.
 *
 * **It never throws and never blocks the deletion.** Somebody asking for their
 * household or their account to go must not be refused because a statistics row
 * could not be written — the deletion is the thing they asked for and this is
 * bookkeeping about it.
 */
async function recordDeletion(db: WriteDb, kind: DeletionKind, bornIso: string): Promise<void> {
	const now = Date.now();

	try {
		await db.deletions.insert({
			kind,
			at: stampFrom(now),
			ageDays: ageInDays(bornIso, now),
		});
	} catch {
		// Deliberately silent. There is no user-facing consequence and nothing
		// to retry against.
	}
}

/**
 * Every row a household owns, then the household — children first.
 *
 * Zero has **no cascading deletes**, so this list is the only thing standing
 * between a deleted household and rows that outlive every route to them. It is
 * `deleteHousehold`'s own order, extracted when the account pre-flight became a
 * second caller: two copies of a cascade is one copy that will be missed the
 * next time a table is added.
 */
async function deleteHouseholdRows(db: WriteDb, householdId: string): Promise<void> {
	// Read the birth stamp *before* the row carrying it goes. This is the only
	// moment a household's age is knowable, which is the whole argument for
	// recording it here rather than deriving it later from something.
	const household = await db.households.get(householdId) as { addedAt?: string } | null;

	await recordDeletion(db, 'household', household?.addedAt ?? '');

	for (const name of [
		'itemTypes',
		'itemStores',
		'restocks',
		'claims',
		'trips',
		'items',
		'locations',
		'types',
		'stores',
		'invites',
		'memberships',
	] as const) {
		const rows = await collectAll<{ id: string }>(() => db[name]
			.withIndex('by_household', (r) => r.eq('householdId', householdId)));

		for (const row of rows) await db[name].delete(row.id);
	}

	await db.households.delete(householdId);
}

/**
 * Every person in the space, from the two tables that between them define one.
 *
 * Shared by `adminPeople` and `adminAccount` so the list and the page cannot
 * disagree about who somebody is — the account page reads one row out of the
 * same array the list pages, rather than recomputing a person from the same
 * tables by a second route.
 *
 * The name walks `pickDisplayName`'s chain, one link short: the profile, then
 * any membership. There is no identity to fall back to, because the platform
 * tells a handler about its **caller** and never a third party — so an account
 * that has neither is rendered as *Someone* by the client rather than as a bare
 * id here.
 */
function buildPeople(
	households: readonly { id: string; name: string; ink: string }[],
	memberships: readonly {
		id: string; userId: string; householdId: string;
		displayName: string; picture: string; role: string;
		joinedAt: string; createdAt: string;
	}[],
	profiles: readonly { userId: string; displayName: string; addedAt: string; createdAt: string }[],
	adminIds: readonly string[],
	auth: AuthContext
): AdminPersonRow[] {
	const householdById = new Map(households.map((h) => [h.id, h]));
	const owners = new Map<string, number>();

	for (const m of memberships) {
		if (toRole(m.role) === 'owner') {
			owners.set(m.householdId, (owners.get(m.householdId) ?? 0) + 1);
		}
	}

	const byUser = new Map<string, typeof memberships[number][]>();

	for (const m of memberships) {
		const list = byUser.get(m.userId);

		if (list) list.push(m); else byUser.set(m.userId, [m]);
	}

	const profileOf = new Map(profiles.map((p) => [p.userId, p]));
	// The union, and it has to be a union: either table can hold a person the
	// other does not.
	const userIds = new Set<string>([...byUser.keys(), ...profileOf.keys()]);

	return [...userIds].map((userId) => {
		const mine = byUser.get(userId) ?? [];
		const profile = profileOf.get(userId);
		const tiles = mine.flatMap((m) => {
			const household = householdById.get(m.householdId);

			return household
				? [{ id: household.id, name: household.name, ink: householdInk(household.ink, household.id) }]
				: [];
		});

		// The earliest thing this app knows about the account. A profile row is
		// stamped from birth (D46) and a membership is stamped from the join,
		// with the platform's `createdAt` behind both for rows that predate
		// either column.
		let joinedAt = profile ? (profile.addedAt || profile.createdAt) : '';

		for (const m of mine) {
			const joined = joinedAtOf(m);

			if (! joinedAt || (joined && joined < joinedAt)) joinedAt = joined;
		}

		return {
			userId,
			name: pickDisplayName(
				profile?.displayName ?? '',
				...mine.map((m) => m.displayName),
				// The caller's own identity name, and only theirs — it is the one
				// third-party name this runtime will never hand out.
				userId === auth.userId ? auth.displayName : ''
			),
			picture: mine.find((m) => m.picture)?.picture ?? '',
			tiles: tiles.slice(0, 3),
			households: mine.length,
			owned: mine.filter((m) => toRole(m.role) === 'owner').length,
			soleOwnerOf: mine.filter(
				(m) => toRole(m.role) === 'owner' && (owners.get(m.householdId) ?? 0) === 1
			).length,
			/*
			 * Named in `LARDER_ADMIN_IDS`, and nothing else.
			 *
			 * It used to carry a second clause — *or the caller, when the caller
			 * administers by some other route* — which existed solely because
			 * `sf dev`'s guest administered by **bypass** rather than by being
			 * named. There is no such route any more: a dev guest that
			 * administers is in this list like anybody else, under its own
			 * `guest:<name>` id. One rule, and the row now says the same thing
			 * the gate does.
			 */
			admin: adminIds.indexOf(userId) !== -1,
			joinedAt,
		};
	});
}

/** A household's member names, for the relevance ladder's second rung. */
function memberNames(
	byHousehold: Map<string, { displayName: string }[]>,
	householdId: string
): string[] {
	return (byHousehold.get(householdId) ?? []).map((m) => m.displayName);
}

/** The console's page size. The boards' *Showing 1–25 of 412*. */
const ADMIN_PAGE_SIZE = 25;

/**
 * How many households one `adminRepairCounts` call may rewrite.
 *
 * **Smaller than it could be, because each one costs six indexed reads** —
 * `recountHousehold`'s two and `activityInHousehold`'s four — so a page here is
 * not a page of rows but a page of scoped scans. Fifty is a few hundred reads
 * in one request, which is a bounded thing to ask of a runtime with a request
 * timeout, and the caller loops on the cursor anyway.
 */
const REPAIR_PAGE = 50;

/**
 * How many expired audit rows one write may clear.
 *
 * **The log prunes itself as it grows**, because this app has no schedule to
 * sweep with: `logActivity` deletes what has expired immediately after it
 * appends. That is the whole enforcement mechanism, and it has one consequence
 * worth stating — a log that stops being written to stops being pruned, so the
 * last rows before a quiet period outlive their retention until something else
 * happens. Acceptable: the alternative is a cron this platform has not been
 * asked for, and rows nobody is adding to are rows nobody is reading either.
 *
 * The cap is what keeps a write bounded. A retention change that suddenly
 * expires ten thousand rows must not turn the next role change into a ten
 * thousand row delete; it takes a few each time and catches up.
 */
const PRUNE_PER_WRITE = 20;

/**
 * The most rows one export may carry.
 *
 * A live query's result crosses a websocket and is held in memory on both
 * sides, so this is a real ceiling rather than a policy. When it bites, the
 * answer is a narrower range — which is the shape the export already has.
 */
const EXPORT_LIMIT = 2000;


/**
 * One term row as the client sees it.
 *
 * The three taxonomies are the same shape and always have been; this is the one
 * place that says so, rather than three near-identical `map` bodies that have
 * to be kept in step every time a column joins the DTO.
 */
function termDto(t: { id: string; name: string; ink: string; addedAt: string; changedAt: string; createdAt: string }) {
	return {
		id: t.id,
		name: t.name,
		ink: t.ink,
		createdAt: t.createdAt,
		addedAt: t.addedAt,
		changedAt: t.changedAt,
	};
}

/**
 * A store row as the client sees it: a term, plus its kind (D58).
 *
 * The kind is resolved here rather than in the client, for the reason
 * `HouseholdSummary.ink` is: `''` is what every row written before the column
 * holds, and one resolver server-side beats a `toSourceKind()` at every render
 * site that would each have to remember to call it.
 */
function sourceDto(t: {
	id: string; name: string; ink: string; kind: string;
	addedAt: string; changedAt: string; createdAt: string;
}) {
	return { ...termDto(t), kind: toSourceKind(t.kind) };
}

/**
 * An invite code, from the best entropy this runtime offers.
 *
 * Three things about the hosted runtime, all confirmed in production on
 * 2026-08-27 and none of them true under `sf dev`:
 *
 * 1. `crypto` is `undefined`, so there is no random source to call.
 * 2. Row ids are **sequential integers** (`"4"`), not the UUIDs `sf dev` mints,
 *    so the id carries no entropy on its own.
 * 3. `ctx` offers nothing random either — `auth`, `db`, `env`, `gravatar`,
 *    `log`, `spam`.
 *
 * So the code is a SHA-256 over everything that varies, and the part that makes
 * it genuinely unguessable is `INVITE_SECRET` from the server environment: an
 * attacker who knows the row id is sequential and can guess the minute it was
 * minted still cannot produce the code without it. `Math.random()` and the
 * clock are mixed in as well, but neither is load-bearing on its own — QuickJS
 * seeds its PRNG per context and nothing documents how.
 *
 * The `typeof` guard on `crypto` is load-bearing twice over: `lib.dom` types it
 * as always present when the runtime does not define it at all, and a bare
 * reference to a missing binding throws `ReferenceError` rather than yielding
 * `undefined`. It cannot be written as a property of the global object either:
 * the capsule compiler's denylist rejects that identifier outright.
 */
function inviteCode(log: LogContext, env: Record<string, string | undefined>, rowId: string): string {
	if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
		return codeFromBytes(crypto.getRandomValues(new Uint8Array(CODE_BYTES)));
	}

	const secret = env.INVITE_SECRET ?? '';

	// Loud, because without it the codes rest on `Math.random()` and a clock,
	// and `sf logs runtime` is the only place this can be read.
	if (! secret) {
		log.warn('INVITE_SECRET is not set: invite codes are falling back to Math.random and the clock');
	}

	return codeFromSeed([
		secret,
		rowId,
		String(Date.now()),
		String(Math.random()),
		String(Math.random()),
	]);
}

/**
 * Reconciles an item's type and store join rows to exactly the given ids.
 *
 * `undefined` means "leave this side alone"; an empty array means "clear it".
 * Every id is checked against the household first — `id()` is not a foreign
 * key, so an unchecked id would happily join an item to another household's
 * term, which is the one way a household boundary could leak through a join.
 */
async function syncJoins(
	db: WriteDb,
	householdId: string,
	itemId: string,
	typeIds: string[] | undefined,
	storeIds: string[] | undefined
): Promise<void> {
	if (typeIds !== undefined) {
		const valid = await keepOwned(db.types, householdId, typeIds);

		const existing = await collectAll(() => db.itemTypes.withIndex('by_item', (r) => r.eq('itemId', itemId)));

		for (const row of existing) {
			if (! valid.has(row.typeId)) await db.itemTypes.delete(row.id);
		}

		const have = new Set(existing.map((r) => r.typeId));

		for (const typeId of valid) {
			if (! have.has(typeId)) await db.itemTypes.insert({ itemId, typeId, householdId });
		}
	}

	if (storeIds !== undefined) {
		const valid = await keepOwned(db.stores, householdId, storeIds);

		const existing = await collectAll(() => db.itemStores.withIndex('by_item', (r) => r.eq('itemId', itemId)));

		for (const row of existing) {
			if (! valid.has(row.storeId)) await db.itemStores.delete(row.id);
		}

		const have = new Set(existing.map((r) => r.storeId));

		for (const storeId of valid) {
			if (! have.has(storeId)) await db.itemStores.insert({ itemId, storeId, householdId });
		}
	}
}

/** Narrows a client-supplied id list to the ones actually in this household. */
async function keepOwned(
	tableApi: { get(id: string): Promise<{ householdId: string } | null> },
	householdId: string,
	ids: string[]
): Promise<Set<string>> {
	const kept = new Set<string>();

	for (const id of new Set(ids)) {
		const row = await tableApi.get(id);
		if (row && row.householdId === householdId) kept.add(id);
	}

	return kept;
}

/**
 * How long a trip lives without a put-away (D41, carried into D66).
 *
 * **A shopping trip does not last a day**, and under shared claims a week-old
 * claim is a lie somebody else is reading. The window runs from the **last
 * tick**, not the first, which is the whole reason a trip is a row: refreshing
 * one field beats rewriting every claim on it.
 *
 * Still a guess, and now a guess other people can see — D66's open questions.
 */
const TRIP_MS = 24 * 60 * 60 * 1000;

/** A household's trips that have not been abandoned. */
async function liveTripsIn(db: ReadDb, householdId: string, now: number) {
	const trips = await collectAll(() => db.trips
		.withIndex('by_household', (r) => r.eq('householdId', householdId))
		);

	return trips.filter((t) => now - Date.parse(t.at) <= TRIP_MS);
}

/** Whoever currently holds this row, or nothing. */
async function liveClaimOn(db: ReadDb, itemId: string, live: readonly { id: string }[]) {
	const ids = new Set(live.map((t) => t.id));
	const rows = await collectAll(() => db.claims.withIndex('by_item', (r) => r.eq('itemId', itemId)));

	return rows.find((row) => ids.has(row.tripId));
}

/** Your live claims in this household. */
async function myClaimsIn(db: ReadDb, householdId: string, userId: string, now: number) {
	const live = await liveTripsIn(db, householdId, now);
	const ids = new Set(live.filter((t) => t.userId === userId).map((t) => t.id));

	const rows = await collectAll(() => db.claims
		.withIndex('by_household', (r) => r.eq('householdId', householdId))
		);

	return rows.filter((row) => ids.has(row.tripId));
}

/**
 * Your open trip in this household, or a new one — and the moment it prunes.
 *
 * **The refresh is what makes the window run from activity**: every tick moves
 * `at`, so a slow shop cannot expire underneath somebody still walking it.
 *
 * **Pruning is append-time, for the reason the audit log's is** — there is no
 * scheduler, so a table nothing is adding to is a table nothing is pruning. A
 * household nobody shops in keeps its stale rows until somebody starts a trip,
 * which is why the `claims` query filters on read as well.
 */
async function openTrip(
	db: WriteDb,
	householdId: string,
	userId: string,
	live: readonly { id: string; userId: string }[],
	now: number
) {
	await pruneTrips(db, householdId, live, now);

	const mine = live.find((t) => t.userId === userId);

	if (mine) {
		await db.trips.update(mine.id, { at: stampFrom(now) });

		return mine;
	}

	return db.trips.insert({ householdId, userId, at: stampFrom(now) });
}

/** Drops abandoned trips and everything claimed on them. */
async function pruneTrips(
	db: WriteDb,
	householdId: string,
	live: readonly { id: string }[],
	now: number
): Promise<void> {
	void now;

	const all = await collectAll(() => db.trips
		.withIndex('by_household', (r) => r.eq('householdId', householdId))
		);

	const keep = new Set(live.map((t) => t.id));

	for (const trip of all) {
		if (keep.has(trip.id)) continue;

		await endTrip(db, trip.id);
	}
}

/**
 * Ends one trip: its claims, then the trip.
 *
 * Children first, because Zero has no cascading deletes — and a claim whose
 * trip is gone is invisible to every read, which is worse than absent.
 */
async function endTrip(db: WriteDb, tripId: string): Promise<void> {
	const claims = await collectAll(() => db.claims.withIndex('by_trip', (r) => r.eq('tripId', tripId)));

	for (const claim of claims) await db.claims.delete(claim.id);

	await db.trips.delete(tripId);
}

/** Every claim on an item, whatever trip it belongs to — the item's cascade. */
async function clearClaimsForItem(db: WriteDb, itemId: string): Promise<void> {
	const rows = await collectAll(() => db.claims.withIndex('by_item', (r) => r.eq('itemId', itemId)));

	for (const row of rows) await db.claims.delete(row.id);
}

/**
 * Every trip a person holds in one household, ended.
 *
 * Leaving a household, being removed from one, and deleting an account all
 * reach this: **a claim is somebody's intent, and it has to go when they do** —
 * a row reading *In Sarah's cart* after Sarah has left is a row nobody can
 * clear.
 */
async function endTripsFor(db: WriteDb, householdId: string, userId: string): Promise<void> {
	const trips = await collectAll(() => db.trips
		.withIndex('by_household', (r) => r.eq('householdId', householdId))
		);

	for (const trip of trips) {
		if (trip.userId === userId) await endTrip(db, trip.id);
	}
}

/** Deletes every join row belonging to an item. */
async function clearJoinsForItem(db: WriteDb, itemId: string): Promise<void> {
	const types = await collectAll(() => db.itemTypes.withIndex('by_item', (r) => r.eq('itemId', itemId)));

	for (const row of types) await db.itemTypes.delete(row.id);

	const stores = await collectAll(() => db.itemStores.withIndex('by_item', (r) => r.eq('itemId', itemId)));

	for (const row of stores) await db.itemStores.delete(row.id);
}

/**
 * Deletes every restock event belonging to an item.
 *
 * Separate from `clearJoinsForItem` because it is not a join: a join row is
 * meaningless without both ends, while a restock row is a record of something
 * that happened. It still goes, and the reason is the one D62 gives for the
 * audit log's opposite choice — the log denormalises so it can outlive its
 * subject, and this deliberately does not. There is nothing to say about how
 * often you restock an item that no longer exists.
 */
async function clearRestocksForItem(db: WriteDb, itemId: string): Promise<void> {
	const rows = await collectAll(() => db.restocks.withIndex('by_item', (r) => r.eq('itemId', itemId)));

	for (const row of rows) await db.restocks.delete(row.id);
}

/**
 * Revokes every live invite a user minted in a household.
 *
 * Invite roles are validated at creation, not at redemption, so this is the
 * only thing stopping a demoted member's outstanding codes from continuing to
 * grant the level they just lost (D21).
 */
async function revokeInvitesBy(db: WriteDb, householdId: string, userId: string): Promise<void> {
	const minted = await collectAll(() => db.invites.withIndex('by_creator', (r) => r.eq('createdBy', userId)));

	for (const invite of minted) {
		if (invite.householdId === householdId && ! invite.revoked) {
			await db.invites.update(invite.id, { revoked: true });
		}
	}
}
