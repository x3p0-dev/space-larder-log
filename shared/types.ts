/**
 * The domain vocabulary, shared by the client and the server capsule.
 *
 * These types track `.docs/data-model.md`: quantities are strings (there is no
 * numeric column), taxonomy references are **row ids** rather than names, and
 * accordion state is absent because it is UI, not data.
 *
 * The move from names to ids is what Phase 2 bought. A rename is now a
 * single-row update instead of a rewrite of every item that mentioned the term.
 */

import type { Role } from './roles';
import type { SourceKind } from './source';
import type { Claim } from './claim';
import type { AccountHousehold, HouseholdFate } from './accountDeletion';
import type { AdminItemBucket } from './admin';

export type TermKind = 'location' | 'type' | 'store';

/**
 * A taxonomy term. `ink` is a color *token* rather than a hex (D32) — the
 * theme table in `client/lib/palette.ts` says what it looks like.
 *
 * No `icon`. The Cellar design identifies a term by its name and its color dot,
 * so the picker and the glyph sets were cut before v1 (D34). The `icon` column
 * survives on `locations` and `types`, written as `''` — a column is additive
 * to re-populate and destructive to drop.
 */
export type Term = {
	id: string;
	name: string;
	ink: string;
	/**
	 * Zero's own insert stamp, ISO 8601 UTC — never written by this app, and it
	 * cannot be (D35, D44). Kept only as the last fallback for rows written
	 * before the two below existed.
	 */
	createdAt: string;

	/** When this entered the household, as this app stamps it. See `shared/stamp.ts`. */
	addedAt: string;

	/** When it was last edited. Bumped by every mutation that writes a visible field. */
	changedAt: string;
};

/**
 * The editable subset of a term, as the composer holds it.
 *
 * The stamps are omitted for the same reason `ItemDraft` omits them: no form
 * holds one, and the single caller that supplies a value is undo, which passes
 * them beside the draft.
 */
export type TermDraft = Omit<Term, 'id' | 'createdAt' | 'addedAt' | 'changedAt'>;

/**
 * A store, plus the one thing that makes it a *source*: what you do to get
 * things from it (D58).
 *
 * A separate type rather than a `kind` on `Term`, because the column is only on
 * `stores` and a field that is meaningfully `''` on two taxonomies out of three
 * is a field every reader has to remember not to trust. `Source` is a `Term`
 * everywhere a `Term` is wanted — the filter chips, the item sheet's chip row
 * and the applied-filter bar all take it unchanged, which is the whole point of
 * putting the kind on the term rather than on the item.
 */
export type Source = Term & { kind: SourceKind };

/**
 * A row's stamps, as undo hands them back to a create mutation.
 *
 * Both optional: a create with neither is stamped now, which is every path
 * except a restore.
 */
export type Stamps = { addedAt?: string; changedAt?: string };

/** An inventory row. `qty` and `threshold` are decimal strings — see D4. */
export type Item = {
	id: string;
	name: string;
	locationId: string;
	typeIds: string[];
	storeIds: string[];
	qty: string;
	threshold: string;
	/**
	 * How big *one* of the thing is — a quart of milk, a 12 oz bag of coffee.
	 *
	 * A decimal string like `qty`, and half of a pair that is never half-set:
	 * `shared/size.ts` owns the rule, and both halves are `''` when there is no
	 * size at all, which is the ordinary case for anything counted rather than
	 * packaged.
	 */
	size: string;
	/** The size's unit **key** — a slug (`quart`), never its abbreviation (`qt`). */
	unit: string;
	/**
	 * Keep this item off the run list, however low it gets.
	 *
	 * **Retired (D60), and kept only for the rows that already hold it.** It was
	 * written for the things a household grows or brews and never shops for; a
	 * source's kind answers that better and says which, so nothing sets this any
	 * more. `needsBuying` still reads it, the sheet still offers to *clear* it,
	 * and the column stays for the reason `icon` does (D34).
	 *
	 * It hides the item from one *view* and changes nothing about what is true
	 * of it: the card still reads *running low*, and the three status pills —
	 * which count stock, not shopping — do not move.
	 */
	offShoppingList: boolean;
	/**
	 * Whether this item joins the run list at all — `''`, `'always'` or
	 * `'never'` (D65).
	 *
	 * *Low at* is the sentence **put this on the list when I'm down to N**, and
	 * both overrides amend that sentence: `always` keeps a row on the list
	 * whatever the count says, `never` keeps it off however low it gets.
	 * Automatic is the **absence** of an override and is stored as `''`, so
	 * there is no third literal to keep in step with the schema's default.
	 *
	 * `shared/listRule.ts` owns every rule, including the one that matters most:
	 * **`listRuleOf` folds the retired `offShoppingList` in as `never`**, so a
	 * row written before this column existed behaves exactly as it did and stops
	 * being legacy the first time anybody edits it.
	 *
	 * Like the flag it replaces, it changes one *view* and nothing that is true:
	 * a `never` item that is low still reads *Low* on its card and still counts
	 * toward the three status pills.
	 */
	listRule: string;
	/**
	 * When a grown thing is ready — two month numbers as strings, `''` for none.
	 *
	 * A pair that is never half-set (`shared/season.ts`), and asked for only
	 * when the item names a source you **grow** (D58). It moves a row between
	 * groups on the harvest card and changes nothing about the item: an
	 * out-of-season tomato still reads *out* on its card and still counts toward
	 * the three status pills.
	 *
	 * It is on the item because the item is the only object there is. It belongs
	 * on a planting — D59.
	 */
	seasonFrom: string;
	seasonTo: string;
	notes: string;
	/**
	 * Zero's own insert stamp, ISO 8601 UTC — never written by this app, and it
	 * cannot be (D35, D44). Kept only as the last fallback for rows written
	 * before the two below existed.
	 */
	createdAt: string;

	/** When this entered the household, as this app stamps it. See `shared/stamp.ts`. */
	addedAt: string;

	/** When it was last edited. Bumped by every mutation that writes a visible field. */
	changedAt: string;
};

/**
 * The editable subset of an item, as the add and edit forms hold it.
 *
 * `createdAt` is omitted with `id` for the same reason: both are the platform's
 * to assign, and `insert()` rejects either one outright. `addedAt` and
 * `changedAt` are omitted because no form holds one — the server stamps them,
 * and the single caller that supplies values is undo, which passes them beside
 * the draft rather than in it.
 */
export type ItemDraft = Omit<Item, 'id' | 'createdAt' | 'addedAt' | 'changedAt'>;

export type Member = {
	id: string;
	userId: string;
	displayName: string;
	/** The account's avatar URL, or '' for none. See shared/avatar.ts. */
	picture: string;
	role: Role;
};

export type Invite = {
	id: string;
	code: string;
	role: Role;
	expiresAt: string;
	createdBy: string;
};

export type ThemeOverride = 'system' | 'light' | 'dark';

/**
 * Why queries report a state instead of throwing.
 *
 * Zero's client emits `query.result` **only on success** — there is no error
 * path for a subscription. A query that throws simply never emits, and
 * `useQuery` keeps returning its initial value forever, which is
 * indistinguishable from "still loading". A first-run user with no household
 * would sit on a blank screen with no way to route them to setup.
 *
 * So every expected condition is a value, and a `throw` in a query is reserved
 * for genuine bugs. Confirmed against the client bundle 2026-08-24; see
 * `.docs/notes.md`.
 */
export type QueryState<T> =
	| ({ state: 'ready' } & T)
	/** Signed out. The gate normally prevents this, but the query is defensive. */
	| { state: 'guest' }
	/** Signed in, belonging to no household at all — the first-run path. */
	| { state: 'no-household' };

export type PantryData = {
	items: Item[];
	locations: Term[];
	types: Term[];
	/** Stores carry a kind, and are the only taxonomy that does — see `Source`. */
	stores: Source[];
};

export type HouseholdData = {
	household: { id: string; name: string; defaultThreshold: string; ink: string };
	me: { membershipId: string; userId: string; role: Role };
	members: Member[];
	invites: Invite[];
};

/**
 * One row of the household switcher.
 *
 * The count is items, because that is what the popover shows and what tells two
 * pantries apart at a glance. `role` is this user's role *there* — it can
 * differ in every household they belong to.
 */
export type HouseholdSummary = {
	id: string;
	name: string;
	role: Role;
	itemCount: number;
	/**
	 * The colour token the tile is drawn in, already resolved (D42).
	 *
	 * Never `''`: the server runs `householdInk()` over the stored value, so a
	 * row written before the column existed arrives with its stable default
	 * rather than leaving every reader to compute one.
	 */
	ink: string;
};

/**
 * Just the list. Which one is *current* is not answered here — the `household`
 * query already echoes back the id it resolved, and two queries answering the
 * same question is two answers to keep in agreement.
 */
export type HouseholdListData = {
	households: HouseholdSummary[];
};

/**
 * Every live claim in the household — who is getting what, right now (D66).
 *
 * **Its own query, deliberately not part of `pantry`.** A tick by anybody
 * invalidates this, and `pantry` carries the items, both join tables and all
 * three taxonomies; folding claims in would refetch the whole pantry for every
 * member each time somebody ticked a row in a shop.
 *
 * The claims carry a `userId` and no name. The `household` query already
 * returns every member with a display name and a picture, so the client
 * resolves a face from the id it already has — which is what keeps a second
 * copy of somebody's name out of the database entirely.
 */
export type ClaimsData = {
	/**
	 * The household these claims are **for**, echoed back.
	 *
	 * **A query answers about a household it resolved, not the one it was
	 * asked about.** `selectMembership` heals a request it cannot place — an
	 * empty id, or one you have left — onto your default household (D33), which
	 * is the right behaviour for a read and a trap for a caller that assumes
	 * the answer matches the question. `pantry` and `household` have always
	 * echoed their resolved id; this one did not, so an answer for the wrong
	 * household was indistinguishable from an empty cart and cleared every box
	 * on screen.
	 */
	householdId: string;
	/**
	 * The server's clock when this answer was computed.
	 *
	 * **A subscription can be answered out of order.** A write re-subscribes
	 * `claims` more than once — the live invalidation and a replay catch-up —
	 * and `useQuery` keeps whichever response *arrives* last rather than
	 * whichever was *issued* last. So an answer computed before your tick can
	 * land after the one computed with it, and the row snaps back with nobody
	 * touching it. Measured on 2026-09-10 by bisection: the run list holds still
	 * with the optimistic overlay off, holds still when the overlay never
	 * settles, and only moves when a settled echo stops masking the query.
	 *
	 * One clock, one handler, so the ordering is total and the client can simply
	 * refuse anything older than what it has already shown.
	 */
	answeredAt: number;
	claims: Claim[];
};

export type ClaimsResult = QueryState<ClaimsData>;

export type PantryResult = QueryState<PantryData>;
export type HouseholdResult = QueryState<HouseholdData>;
export type HouseholdListResult = QueryState<HouseholdListData>;

/**
 * What an invite link says about itself, before anyone accepts it.
 *
 * The `?join=` landing is the one screen a **signed-out** visitor can reach
 * that reads the database, so this is the one query with no membership behind
 * it. The code is the authorization: whoever holds it was meant to see the
 * household's name and the role they are being offered.
 *
 * It does not follow `QueryState`, because "guest" is not a failure here — it
 * is half the audience. Loading is still the platform's absent-value signal.
 */
export type InviteHousehold = {
	name: string;
	/** The colour token the household tile is drawn in — see `client/lib/theme.ts`. */
	ink: string;
};

export type InvitePreview =
	/**
	 * Unknown, malformed, **or revoked**.
	 *
	 * Revoked collapses into this deliberately. `redeemInvite` already refuses
	 * to distinguish missing from revoked from expired, on the grounds that
	 * separating them tells a guesser which codes exist; a preview that named
	 * the household behind a revoked link would give that back. The landing
	 * renders it as the expired screen with one sentence changed.
	 */
	| { state: 'invalid' }
	/** A real code, past its 14 days. The inviter is named so it can be replaced. */
	| { state: 'expired'; household: InviteHousehold; role: Role; inviter: string }
	/**
	 * Signed in, and already in the household this code is for.
	 *
	 * The **only** variant carrying an id, so the card's *Open X* can switch to
	 * it. A non-member holding a code has no business learning one, and the
	 * other three variants do not offer a destination to switch to.
	 */
	| { state: 'member'; household: InviteHousehold; householdId: string }
	| { state: 'valid'; household: InviteHousehold; role: Role; inviter: string; expiresAt: string };

export type InvitePreviewResult = InvitePreview;

/**
 * The signed-in account's own name, and whether it has one yet.
 *
 * Like `InvitePreview` and unlike everything else, this does **not** follow
 * `QueryState`: `no-household` is not one of its answers. The whole point of
 * the display name is that it is asked *before* the path forks into
 * create-a-household and accept-an-invite, so a caller with no household is
 * the most ordinary case this query has.
 *
 * `needsName` is the gate, and it is narrower than "has no profile row". An
 * account that predates the `profiles` table has an identity name recorded on
 * every membership it holds, which is a name it effectively already answered
 * with — so it is grandfathered and `displayName` carries that name instead.
 * Only an account with no name anywhere is stopped.
 */
export type ProfileResult =
	| { state: 'guest' }
	| { state: 'ready'; displayName: string; needsName: boolean };

/**
 * One live invite this account minted, for *Download your data* (D68).
 *
 * **No code.** A code *is* the authorization (D39), and a working one sitting
 * in a file on disk is a worse place for it than the app it was minted in. What
 * is left names the household, the role, and when the link dies — everything
 * about the invite except the way in.
 */
export type AccountInvite = {
	household: string;
	role: Role;
	expiresAt: string;
	/** False once it is revoked or past its date. Both still describe you. */
	live: boolean;
};

/**
 * The account pane's one read: who you are, and every household you are in
 * with enough about each to say what your deletion would do to it (D68).
 *
 * **Not a `QueryState`.** `no-household` is not one of its answers — an account
 * in no households can still be named, exported and deleted, and that is the
 * simplest path through this flow rather than an edge of it. `ProfileResult`
 * declines the same union for the same reason.
 *
 * **It is subscribed only while the pane is pushed**, which is what makes its
 * cost acceptable: five indexed reads per household is nothing once, and would
 * be a page-load tax on everybody if it lived beside `pantry`.
 */
export type AccountResult =
	| { state: 'guest' }
	| {
		state: 'ready';
		/** The account's own display name — what the typed confirmation asks for. */
		name: string;
		/** `''` in production and always will be, and the export says so (D56). */
		email: string;
		/**
		 * This account is named in `LARDER_ADMIN_IDS`, so it **cannot be
		 * deleted** (D68).
		 *
		 * Reported by the server rather than derived on the client, for the
		 * reason `adminAccess` reports `writesHeld`: the client must not hold a
		 * second copy of a rule the server enforces, and it cannot read the
		 * environment anyway. The pane draws `ADMIN_UNDELETABLE_NOTE` from this
		 * — **not from the refusal**, whose text is invisible in production.
		 */
		administers: boolean;
		households: AccountHousehold[];
		invites: AccountInvite[];
	};

// --- the admin console ---

/**
 * What a console query answers when the caller is not an administrator.
 *
 * `denied` rather than `guest` / `no-household`: a signed-in owner of three
 * households is neither of those and still may not see this. It is a value and
 * not a throw for the reason every other query is (see `QueryState`) — a query
 * that throws never emits, and the client cannot tell that apart from loading.
 *
 * **The client renders nothing at all for it.** Board 8's refusal is a 404 in
 * the app's own words, not a message this union carries: naming the console in
 * a denial confirms there is one.
 */
export type AdminState<T> =
	| ({ state: 'ready' } & T)
	| { state: 'denied' };

/** Whether the account menu draws an *Admin* row. The one cheap console query. */
export type AdminAccessResult = {
	admin: boolean;
	/**
	 * Whether the console's writes are on hold **for this caller**.
	 *
	 * Server-decided rather than worked out client-side, because it depends on
	 * who is asking: the hold is a production hold and a dev guest is exempt, so
	 * the deletion flows can be exercised locally without being reachable on the
	 * live site.
	 */
	writesHeld: boolean;
};

/** One point on Overview's twelve-month line. */
export type AdminSeriesPoint = {
	/** `'2026-08'`. */
	month: string;
	/** `'Aug'`, or `'Aug 2026'` at a year boundary. */
	label: string;
	value: number;
};


/**
 * Overview's four cards and its *Needs attention* list.
 *
 * **Storage is absent and is not coming.** The boards draw `2.4 GB`; the server
 * context is `{auth, content, db, env, gravatar, log, spam}` and carries no
 * storage handle in either direction, so there is no figure to read. *Live
 * invites* takes the fourth card instead — real, administrative, and it keeps
 * the row four across.
 *
 * The three deltas count what *arrived* in the window, never a net change.
 * Nothing records a deletion (the Activity log is a later stage), so a month
 * that lost more households than it gained still reports a positive number.
 * The copy says *new*, not `+`, so the card does not claim otherwise.
 */
export type AdminSummaryData = {
	households: number;
	people: number;
	items: number;

	/**
	 * Households touched inside `RECENT_DAYS`.
	 *
	 * **The card the other three cannot be.** Households, people and items all
	 * rise when one person makes five pantries and fills them once; this is the
	 * only one that falls when nobody comes back. It replaced *Live invites*,
	 * which counted a small piece of state nobody acts on.
	 *
	 * **`active + dormant` is less than `households`, on purpose.** Dormant is
	 * 90 days and this is 30, and a household whose last activity is unknown is
	 * neither — so the card reads *of N* rather than implying the remainder is
	 * idle.
	 */
	active: number;

	/**
	 * Households by whether more than one person is in them.
	 *
	 * `solo + shared === households` exactly, because both are counted by
	 * walking `households` rather than the membership map — a household with no
	 * memberships at all is an orphan, and reading the map alone would drop it
	 * from the split rather than counting it as solo.
	 */
	solo: number;
	shared: number;

	newHouseholds: number;
	newPeople: number;
	newItems: number;

	noOwner: number;
	dormant: number;
	empty: number;

	/**
	 * Households whose rollup columns have never been written.
	 *
	 * **Nothing else on Overview counts them, which is why this exists.** Every
	 * household created from stage 2 onward is counted at birth, and every one
	 * that predates the columns holds `''` until `adminRepairCounts` reaches it
	 * or somebody writes to it. `''` is *not counted*, and reading it as zero
	 * would file those households as empty, ownerless and dormant all at once —
	 * three numbers that are wrong, plausible, and on the screen that exists to
	 * flag exactly those states.
	 *
	 * So they are excluded from the four tallies and from both distributions,
	 * and reported here instead. **Zero is the expected value**, and Overview
	 * says nothing at all when it is; a non-zero one is a sentence telling an
	 * administrator to run the repair.
	 */
	uncounted: number;

	/**
	 * Twelve months of *new households*, and **not a running total** — see
	 * `countByMonth`. These bars sum to what arrived inside the window, never
	 * to the `households` figure above them, which starts from everything that
	 * already existed.
	 */
	series: AdminSeriesPoint[];

	/**
	 * Households by how many items they hold, in five bands.
	 *
	 * **`buckets[0].households` is `empty` by another name**, and the two are
	 * computed from the same map in the same pass, so they cannot disagree.
	 * The distribution is what the count alone cannot say: whether the
	 * households that are not empty are samples or pantries.
	 */
	buckets: AdminItemBucket[];

	/**
	 * Twelve months of **completed shopping trips** — the one series here that
	 * measures somebody *doing* something rather than something existing.
	 *
	 * Counted from `restocks` and not from `trips`: a put-away ends its trip and
	 * deletes it, so what survives is one row per item sharing a `tripId` and a
	 * stamp. See `tripsByMonth`.
	 *
	 * **These bars erode.** A restock row dies with its item (D64), so a past
	 * month's count falls as items are removed. It is a floor on what happened,
	 * never an exact history, and the card says so.
	 */
	trips: AdminSeriesPoint[];
};

export type AdminSummaryResult = AdminState<AdminSummaryData>;

/** A face on a household row — three of them, then a count (D55's rule). */
export type AdminFace = {
	name: string;
	picture: string;
};

/**
 * One household as the console lists it, and as its own page opens.
 *
 * **Every field is a count, a name or a date.** That is the console's stated
 * spine and this type is where it is enforceable: if something here is ever not
 * one of the three, the household page has stopped being metadata-only.
 */
export type AdminHouseholdRow = {
	id: string;
	name: string;
	ink: string;
	faces: AdminFace[];
	members: number;
	items: number;
	/** ISO, or `''` when nothing readable has ever been stamped. */
	lastActive: string;
	noOwner: boolean;
	dormant: boolean;
	empty: boolean;
};

/** The status chips above the list, and the one that is on. */
export type AdminHouseholdFilter = 'all' | 'no-owner' | 'dormant' | 'empty';

/**
 * `relevance` is offered **only while there is a query** (D62).
 *
 * *Best match* means nothing on an unsearched list, so offering it there would
 * be a sort option that silently does nothing — and the moment a search is
 * cleared the list falls back to the sort it had before.
 */
export type AdminHouseholdSort = 'relevance' | 'name' | 'recent' | 'items' | 'members';

export type AdminHouseholdsData = {
	rows: AdminHouseholdRow[];
	/** Rows matching the current search and chip — what `Showing 1–25 of N` counts. */
	matching: number;
	/** Every household, whatever is filtered. The chips' *All* count. */
	total: number;
	counts: { noOwner: number; dormant: number; empty: number };
	/** Echoed back so the pager reads the page it was actually given. */
	offset: number;
	pageSize: number;
};

export type AdminHouseholdsResult = AdminState<AdminHouseholdsData>;

/** One member, as the console sees them. A name, a role and a date — nothing else. */
export type AdminMember = {
	/** The **membership** id — what the two member writes take. */
	id: string;
	/**
	 * The account behind the membership, so the row can open that person's page.
	 *
	 * The two halves of the console meet in both directions now: a household on
	 * somebody's account page opens the household, and a member here opens the
	 * account. It is the membership that is written to and the account that is
	 * navigated to, which is why the row carries both ids.
	 */
	userId: string;
	name: string;
	picture: string;
	role: string;
	/**
	 * When they joined, resolved through `joinedAtOf` — `memberships.joinedAt`,
	 * with the platform's `createdAt` behind it for every row written before
	 * that column existed.
	 *
	 * D44 originally skipped this table because nothing ordered it by time.
	 * The console does: *Recently joined* is one of `adminPeople`'s four sorts,
	 * and this date is printed here, on an account page and in the account
	 * export. A key the app orders by is a key the app writes.
	 */
	joinedAt: string;
};

/**
 * One live invite, as the console sees it.
 *
 * **It carries no code, and that is a security decision rather than an
 * omission.** The boards draw `larderlog.app/?join=k3f9d2a7b1c8…` on the
 * household page. A code *is* the authorization (D39) — anyone holding one can
 * join the household — so printing it here would hand every administrator a
 * silent way into any pantry, and reading someone's shelves is the one thing
 * the refusal card on that same page promises the console will not do. An admin
 * can already delete a household; that is loud, recorded and irreversible,
 * which is exactly what quietly joining one is not.
 */
export type AdminInvite = {
	id: string;
	role: string;
	/** ISO, or `''` for an invite that never expires. */
	expiresAt: string;
	issuedAt: string;
	/** The member who minted it, by name. `''` when they have since left. */
	issuedBy: string;
};

export type AdminHouseholdDetailData = {
	household: AdminHouseholdRow;
	createdAt: string;
	holds: { items: number; locations: number; stores: number; types: number };
	members: AdminMember[];
	/** Live only — neither revoked nor expired. A dead invite is not a fact. */
	invites: AdminInvite[];

	/**
	 * Items added to *this* household, per month, over twelve months.
	 *
	 * **Per month rather than a running total**, because the question this page
	 * asks is whether the pantry is alive: a cumulative count only rises, so
	 * every household's would read the same shape and an abandoned one would be
	 * indistinguishable from a finished one. Empty columns say *when* it went
	 * quiet, which is the fact `dormant` reduces to a flag.
	 *
	 * It counts arrivals and cannot see departures — nothing records a removed
	 * item — so it does not sum to `holds.items` and is not meant to.
	 */
	series: AdminSeriesPoint[];
};

export type AdminHouseholdDetailResult =
	| AdminState<AdminHouseholdDetailData>
	/** The id names nothing. Deleted while the page was open, or simply wrong. */
	| { state: 'missing' };

/** A household as it appears beside a person — a tile, a name and their role. */
export type AdminPersonHousehold = {
	id: string;
	name: string;
	ink: string;
	role: string;
	members: number;
	items: number;
	/**
	 * What happens to this household when the account goes — `fateOf`'s answer,
	 * computed server-side from the memberships.
	 *
	 * **It replaced a `soleOwner` boolean, and the difference is a real bug.**
	 * *Only owner* and *needs a decision* are not the same question: a household
	 * the person is **alone** in has exactly one owner and nothing to decide,
	 * because *transfer* has nobody to name. The console asked about those
	 * anyway and refused the deletion until they were answered, while the app's
	 * own flow filed the identical household as `goes` and destroyed it without
	 * asking. D68 names that ordering — `members <= 1` before the role — and
	 * this field is what makes both halves read it.
	 */
	fate: HouseholdFate;
	/**
	 * Everyone **else** in that household, for the pre-flight's menu.
	 *
	 * Present only where it is needed — a household whose `fate` is `decide` —
	 * because it is a list of names per household per person, and shipping it
	 * for every row would be the whole membership table arriving to answer a
	 * question almost nobody asks. It is never empty where it is present: a
	 * `decide` household has other people in it by definition, which is what
	 * separates it from `goes`.
	 */
	candidates: { id: string; name: string }[];
};

/**
 * One person, as the console lists them.
 *
 * **There is no accounts table**, so a person is the union of a `profiles` row
 * and every membership sharing its `userId`. Someone can have one and not the
 * other: a profile with no memberships is somebody who named themselves and
 * then left everywhere, and a membership with no profile is an account that
 * predates D46.
 */
export type AdminPersonRow = {
	userId: string;
	name: string;
	picture: string;
	/** Up to three tiles, then a count — the members trio's rule (D55). */
	tiles: { id: string; name: string; ink: string }[];
	households: number;
	owned: number;
	soleOwnerOf: number;
	/** Named in `LARDER_ADMIN_IDS`. The only flag the console can actually see. */
	admin: boolean;
	joinedAt: string;
};

export type AdminPeopleFilter = 'all' | 'admins' | 'no-household' | 'sole-owner';
export type AdminPeopleSort = 'relevance' | 'name' | 'joined' | 'households';

export type AdminPeopleData = {
	rows: AdminPersonRow[];
	matching: number;
	total: number;
	counts: { admins: number; noHousehold: number; soleOwner: number };
	offset: number;
	pageSize: number;
};

export type AdminPeopleResult = AdminState<AdminPeopleData>;

export type AdminAccountData = {
	person: AdminPersonRow;
	households: AdminPersonHousehold[];
	/** Live invites this account minted, anywhere. A count, so still metadata. */
	invitesIssued: number;
	/**
	 * Whether this is the caller's own account.
	 *
	 * The pre-flight is the same dialog in both places and only the title
	 * changes, but the console has to know: deleting yourself here signs you out
	 * of a profile you are still holding a session for.
	 */
	isSelf: boolean;
};

export type AdminAccountResult =
	| AdminState<AdminAccountData>
	| { state: 'missing' };

/**
 * What the pre-flight answers, one row per household this account solely owns.
 *
 * `transfer` needs a `toMembershipId`; `delete` must not carry one. A household
 * the account does **not** solely own is refused rather than ignored — a
 * decision about a household that needed none means the client and the server
 * disagree about the state, and quietly dropping it would let a stale dialog
 * delete a household nobody chose.
 */
export type AdminOwnershipDecision = {
	householdId: string;
	action: 'transfer' | 'delete';
	toMembershipId?: string;
};

/**
 * One row of the audit log.
 *
 * **A time, a person, an action and a target** — the design's own four, plus
 * the denormalised copy a deletion row needs, because that row is the only
 * surviving record of the thing it describes.
 *
 * `actorName` is a copy taken at write time and stays after the account is
 * gone. **That is an erasure question and it is deliberately open**: an audit
 * log you can erase by deleting yourself is not an audit log, and the design
 * says as much and asks for a lawyer's read before it ships.
 */
export type AdminActivityRow = {
	id: string;
	at: string;
	actorId: string;
	actorName: string;
	actorKind: string;
	action: string;
	targetKind: string;
	targetId: string;
	targetName: string;
	targetInk: string;
	fromValue: string;
	toValue: string;
	/** JSON, decoded by `shared/activity.ts` — which never throws. */
	held: string;
	/**
	 * Whether the target still exists.
	 *
	 * Resolved server-side per row, because only the server can look — and it is
	 * what lets an opened entry say *this household no longer exists; everything
	 * above is the log's own copy* on its own face.
	 */
	targetGone: boolean;
};

export type AdminActivityData = {
	rows: AdminActivityRow[];
	total: number;
	offset: number;
	pageSize: number;
	/** How long rows are kept. A constant for now — see D62. */
	retentionMonths: number;
};

export type AdminActivityResult = AdminState<AdminActivityData>;

/**
 * A slice of the log, for export.
 *
 * **A range, not everything**, which is the design's own rule and a good one: a
 * button that hands over all 2,904 rows invites the habit of handing over all
 * of them. `capped` says so on its face when the range held more than one
 * export may carry — a silently truncated audit export is worse than no export.
 */
export type AdminActivityExportData = {
	rows: AdminActivityRow[];
	from: string;
	to: string;
	capped: boolean;
	limit: number;
};

export type AdminActivityExportResult = AdminState<AdminActivityExportData>;
