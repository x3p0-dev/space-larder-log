import { useCallback, useMemo, useRef, useState } from 'preact/hooks';
import { useMutation, useQuery } from '@spacefast/zero/client';

import type { Role } from '../../shared/roles';
import type { SourceKind } from '../../shared/source';
import type { SourceMix } from '../../shared/seed';
import type { RestockEntry } from '../../shared/restock';
import type { Claim } from '../../shared/claim';
import type {
	ClaimsResult,
	HouseholdData,
	HouseholdListResult,
	HouseholdResult,
	HouseholdSummary,
	InvitePreviewResult,
	ItemDraft,
	PantryData,
	PantryResult,
	ProfileResult,
	Stamps,
	TermDraft,
	TermKind,
} from '../../shared/types';

/**
 * The bridge between the capsule and the UI.
 *
 * Three live subscriptions — `households`, `pantry`, `household` — and every
 * mutation the app calls. Components below this take plain data and callbacks;
 * nothing else in `client/` imports from `@spacefast/zero/client`.
 *
 * Since D33 a caller can belong to several households, so every scoped mutation
 * names the one it is for. That id is **not** taken from the caller's argument
 * list: it is the id the `household` query says it answered for, injected here,
 * so a component can no more write to the wrong household than it can read from
 * one. The server verifies it against the caller's memberships regardless.
 */

/**
 * What a subscription looks like before its first result arrives.
 *
 * `useQuery` seeds its state with `getQueryValue(...) ?? []` — a hardcoded
 * empty **array**, whatever the query's real return shape is. Our queries
 * return objects, so an array at the top level can only mean "no result yet".
 * That is the loading signal; there is no other one, because Zero emits
 * `query.result` on success only and never reports a query failure to the
 * client at all.
 */
function isLoading(value: unknown): boolean {
	return Array.isArray(value) || value === null || typeof value !== 'object';
}

export type PantryStatus =
	| { state: 'loading' }
	| { state: 'guest' }
	| { state: 'no-household' }
	| { state: 'ready'; pantry: PantryData; household: HouseholdData };

export type PantryApi = {
	status: PantryStatus;
	/** Every household the caller belongs to. Empty until the list arrives. */
	households: HouseholdSummary[];
	/**
	 * The household the server actually answered for, which is not always the
	 * one that was asked for — a selection left over from a household you have
	 * since left resolves to a different one. The caller reconciles against
	 * this rather than trusting what it stored.
	 */
	currentHouseholdId: string;
	/** The last mutation error, for a banner. Cleared by `dismissError`. */
	error: string | null;
	dismissError: () => void;

	/** Resolves to the new household's id, so the caller can switch to it. */
	createHousehold: (name: string, ink: string, sources: SourceMix) => Promise<string | null>;
	updateHousehold: (patch: { name?: string; defaultThreshold?: string; ink?: string }) => Promise<void>;

	/**
	 * `stamps` is supplied by **undo only**, carrying the removed row's own
	 * `addedAt` / `changedAt` so the restored item lands back in its place under
	 * *Recently added* rather than at the top (D17, D44). An ordinary add omits
	 * it and the server stamps now.
	 */
	addItem: (draft: ItemDraft, stamps?: Stamps) => Promise<string | null>;
	/**
	 * A whole review table, written once (D67).
	 *
	 * One call rather than a loop of `addItem`, for `restockItems`' reason: a
	 * bulk commit is many writes that mean one act, and half of them landing is
	 * the state it exists to prevent. Resolves the number written, or `null` when
	 * the server refused — which leaves the review exactly as it was, because
	 * that is where the typing is.
	 */
	addItems: (drafts: readonly ItemDraft[]) => Promise<number | null>;
	/** True when the server accepted the edit. False leaves the sheet open. */
	updateItem: (id: string, patch: Partial<ItemDraft>) => Promise<boolean>;
	adjustQty: (id: string, delta: number) => Promise<void>;

	/**
	 * Every live claim in the household — who is getting what (D66).
	 *
	 * An array rather than a `QueryState`, because there is nothing useful for a
	 * caller to do with *loading* here: an empty list reads as *nobody has
	 * claimed anything*, which is what the screen should show while the answer
	 * is in flight and is the safe direction — the alternative is briefly
	 * offering to put away somebody else's shopping.
	 */
	claims: Claim[];
	/** Tick a row. False when the server refused — somebody else holds it. */
	claimItem: (id: string) => Promise<boolean>;
	/** Untick rows. Yours only; nothing you can press releases somebody else's. */
	releaseClaims: (ids: readonly string[]) => Promise<boolean>;
	/**
	 * A whole trip's counts, written once (D64).
	 *
	 * One call rather than a loop of `updateItem`, because a put-away is several
	 * writes that mean one thing and half of them landing is the state it exists
	 * to prevent. True when the server took them; false leaves the sheet open
	 * with the numbers somebody typed still in it.
	 */
	restockItems: (entries: RestockEntry[]) => Promise<boolean>;
	/** True when the row is really gone — the undo toast is armed on this. */
	removeItem: (id: string) => Promise<boolean>;

	createTerm: (kind: TermKind, draft: TermDraft & { kind?: SourceKind }, stamps?: Stamps) => Promise<string | null>;
	updateTerm: (kind: TermKind, id: string, patch: { name?: string; ink?: string }) => Promise<void>;
	/**
	 * True when the term is really gone — the undo toast is armed on this.
	 *
	 * Same reason `removeItem` reports one. Undo re-creates the term, so an undo
	 * offered for a delete the server refused would mint a duplicate.
	 */
	deleteTerm: (kind: TermKind, id: string) => Promise<boolean>;
	/** Stores only — locations and types have no kind. See `shared/source.ts`. */
	setSourceKind: (storeId: string, kind: SourceKind) => Promise<void>;

	/** Resolves to the new code, or null when the server refused. */
	createInvite: (role: Role) => Promise<{ code: string; expiresAt: string } | null>;
	/** True when the code is dead. The plain toast only says so if it is. */
	revokeInvite: (inviteId: string) => Promise<boolean>;
	/** The joined household's id, or null when the server refused. */
	redeemInvite: (code: string) => Promise<string | null>;

	changeRole: (membershipId: string, role: Role) => Promise<void>;
	/** True when they are out. */
	removeMember: (membershipId: string) => Promise<boolean>;
	leaveHousehold: () => Promise<boolean>;
	/**
	 * Owner only, and only ever reached from the typed confirmation.
	 *
	 * Leaving a household you are the last member of would strand it, so the
	 * server refuses (D22) and this is what that case does instead — the row
	 * relabels to *Delete household* and takes this path.
	 */
	deleteHousehold: () => Promise<boolean>;
};

export function usePantryData(selectedHouseholdId: string | null): PantryApi {
	/*
	 * `''` rather than null, because the capsule's queries take a string. An
	 * empty one means "no preference" — a first load on a new device, or one
	 * whose stored selection has not been read yet — and the server answers
	 * with the caller's default household.
	 */
	const preferred = selectedHouseholdId ?? '';

	/*
	 * The list takes no argument on purpose: it is the one subscription a
	 * switch does not disturb, so the switcher keeps its rows while the pantry
	 * underneath it is still catching up.
	 */
	const listResult = useQuery<HouseholdListResult>('households');
	const pantryResult = useQuery<PantryResult>('pantry', preferred);
	const householdResult = useQuery<HouseholdResult>('household', preferred);
	/*
	 * Its own subscription, and that is the point of it (D66): every tick by
	 * anybody invalidates this, and `pantry` above carries the items, both join
	 * tables and all three taxonomies. Folding claims into it would refetch the
	 * whole pantry for every member each time somebody ticked a row in a shop.
	 */
	const claimsResult = useQuery<ClaimsResult>('claims', preferred);

	const [error, setError] = useState<string | null>(null);

	const rawCreateHousehold = useMutation<[string, string, SourceMix], { householdId: string }>('createHousehold');
	const rawUpdateHousehold = useMutation<[string, { name?: string; defaultThreshold?: string; ink?: string }], void>('updateHousehold');
	const rawAddItem = useMutation<[string, ItemDraft & Stamps], { id: string }>('addItem');
	const rawAddItems = useMutation<[string, ItemDraft[]], { count: number }>('addItems');
	const rawUpdateItem = useMutation<[string, string, Partial<ItemDraft>], void>('updateItem');
	const rawAdjustQty = useMutation<[string, string, number], void>('adjustQty');
	const rawRestockItems = useMutation<[string, RestockEntry[]], { count: number }>('restockItems');
	const rawRemoveItem = useMutation<[string, string], void>('removeItem');
	const rawClaimItem = useMutation<[string, string], { claimed: boolean }>('claimItem');
	const rawReleaseClaims = useMutation<[string, string[]], { released: number }>('releaseClaims');
	const rawCreateTerm = useMutation<[string, TermKind, TermDraft & Stamps & { kind?: SourceKind }], { id: string }>('createTerm');
	const rawUpdateTerm = useMutation<[string, TermKind, string, { name?: string; ink?: string }], void>('updateTerm');
	const rawDeleteTerm = useMutation<[string, TermKind, string], void>('deleteTerm');
	const rawSetSourceKind = useMutation<[string, string, string], void>('setSourceKind');
	const rawCreateInvite = useMutation<[string, string], { code: string; expiresAt: string }>('createInvite');
	const rawRevokeInvite = useMutation<[string, string], void>('revokeInvite');
	const rawRedeemInvite = useMutation<[string], { householdId: string }>('redeemInvite');
	const rawChangeRole = useMutation<[string, string, string], void>('changeRole');
	const rawRemoveMember = useMutation<[string, string], void>('removeMember');
	const rawLeaveHousehold = useMutation<[string], void>('leaveHousehold');
	const rawDeleteHousehold = useMutation<[string], void>('deleteHousehold');

	/**
	 * Runs a mutation and surfaces its failure.
	 *
	 * A mutation rejection *does* reach the client — unlike a query's — carrying
	 * the server's message verbatim. Every message a handler throws is written
	 * to be shown to a person, so this displays it rather than a generic string:
	 * "3 items are stored in Freezer" is the whole point of D16's refusal.
	 */
	const run = useCallback(async <T,>(work: () => Promise<T>): Promise<T | null> => {
		try {
			const result = await work();
			setError(null);
			return result;
		} catch (thrown) {
			setError(thrown instanceof Error ? thrown.message : 'Something went wrong.');
			return null;
		}
	}, []);

	const status: PantryStatus = useMemo(() => {
		if (isLoading(pantryResult) || isLoading(householdResult)) return { state: 'loading' };

		// Both queries resolve the same membership, so they agree on everything
		// but timing. Whichever reports a non-ready state first is the answer.
		for (const result of [householdResult, pantryResult]) {
			if (result.state === 'guest') return { state: 'guest' };
			if (result.state === 'no-household') return { state: 'no-household' };
		}

		if (pantryResult.state !== 'ready' || householdResult.state !== 'ready') {
			return { state: 'loading' };
		}

		const { state: _p, ...pantry } = pantryResult;
		const { state: _h, ...household } = householdResult;

		return { state: 'ready', pantry, household };
	}, [pantryResult, householdResult]);

	const households = useMemo(() => (
		! isLoading(listResult) && listResult.state === 'ready' ? listResult.households : []
	), [listResult]);

	/*
	 * The household every scoped mutation below is aimed at. Empty until the
	 * query answers, which is also when the UI that calls them is still behind
	 * the loading gate — and if one slips through anyway, the server refuses a
	 * write with no household named rather than guessing at one.
	 */
	const currentHouseholdId = status.state === 'ready' ? status.household.household.id : '';

	/*
	 * `[]` while the query is in flight or refused, which reads as *nobody has
	 * claimed anything*. That is the safe direction: the opposite would briefly
	 * paint somebody else's rows as yours.
	 *
	 * **An answer for a different household is not an answer**, and this is the
	 * guard that says so. Two `claims` subscriptions can be live at once — the
	 * current household's, and one made with `''` before the stored selection
	 * was read, which the server heals onto your *default* household (D33) and
	 * answers honestly with its claims. Both are re-subscribed on every
	 * invalidation, and `useQuery` keeps whichever response arrives last, so the
	 * healed answer — usually empty — would land on the run list and clear every
	 * tick on screen. Measured on 2026-09-10: the server log showed the client
	 * reading `claims` for the open household and for the healed one in the same
	 * breath, over and over, while boxes ticked and unticked with nobody
	 * touching them.
	 *
	 * So the reading is pinned to the household actually on screen, and the last
	 * good one is held rather than falling back to `[]` — a switch keeps the
	 * previous list for a beat instead of blinking every box off.
	 */
	const lastClaims = useRef<{ householdId: string; answeredAt: number; claims: Claim[] }>(
		{ householdId: '', answeredAt: 0, claims: [] }
	);

	const claims = useMemo(() => {
		const answered = claimsResult.state === 'ready' ? claimsResult : null;
		const held = lastClaims.current;

		/*
		 * **An answer that overtakes a newer one is refused.** Both conditions
		 * are load-bearing and they fail differently: a *different household*
		 * empties the list (the healed answer for your default household is a
		 * legitimate empty cart), and an *older answer for this household* puts
		 * back rows you have already released. `>=` rather than `>` so two
		 * answers inside one millisecond do not deadlock the reading.
		 */
		if (answered
			&& answered.householdId === currentHouseholdId
			&& (held.householdId !== currentHouseholdId || answered.answeredAt >= held.answeredAt)
		) {
			lastClaims.current = {
				householdId: answered.householdId,
				answeredAt: answered.answeredAt,
				claims: answered.claims,
			};
		}

		return lastClaims.current.householdId === currentHouseholdId ? lastClaims.current.claims : [];
	}, [claimsResult, currentHouseholdId]);

	return {
		status,
		households,
		currentHouseholdId,
		error,
		dismissError: useCallback(() => setError(null), []),

		createHousehold: useCallback(async (name, ink, sources) => {
			const result = await run(() => rawCreateHousehold(name, ink, sources));

			return result ? result.householdId : null;
		}, [run, rawCreateHousehold]),

		updateHousehold: useCallback(async (patch) => {
			await run(() => rawUpdateHousehold(currentHouseholdId, patch));
		}, [run, rawUpdateHousehold, currentHouseholdId]),

		addItem: useCallback(async (draft, stamps) => {
			const result = await run(() => rawAddItem(currentHouseholdId, { ...draft, ...stamps }));
			return result ? result.id : null;
		}, [run, rawAddItem, currentHouseholdId]),

		addItems: useCallback(async (drafts) => {
			const result = await run(() => rawAddItems(currentHouseholdId, [...drafts]));

			return result ? result.count : null;
		}, [run, rawAddItems, currentHouseholdId]),

		// A refusal has to be distinguishable from success: the edit sheet stays
		// open on false so the typing survives, the way `addItem` keeps its draft.
		updateItem: useCallback(async (id, patch) => (
			(await run(() => rawUpdateItem(currentHouseholdId, id, patch).then(() => true))) === true
		), [run, rawUpdateItem, currentHouseholdId]),

		adjustQty: useCallback(async (id, delta) => {
			await run(() => rawAdjustQty(currentHouseholdId, id, delta));
		}, [run, rawAdjustQty, currentHouseholdId]),

		claims,

		// A refusal has to be distinguishable from success: the optimistic tick
		// is rolled back on false, and the server's own sentence — *Someone else
		// is already getting that.* — is what `run` puts on screen.
		claimItem: useCallback(async (id) => (
			(await run(() => rawClaimItem(currentHouseholdId, id).then(() => true))) === true
		), [run, rawClaimItem, currentHouseholdId]),

		releaseClaims: useCallback(async (ids) => (
			(await run(() => rawReleaseClaims(currentHouseholdId, [...ids]).then(() => true))) === true
		), [run, rawReleaseClaims, currentHouseholdId]),

		restockItems: useCallback(async (entries) => (
			(await run(() => rawRestockItems(currentHouseholdId, entries).then(() => true))) === true
		), [run, rawRestockItems, currentHouseholdId]),

		// `void` here is what armed the undo toast for removals the server had
		// refused — and undo re-runs `addItem`, so pressing it duplicated the row.
		removeItem: useCallback(async (id) => (
			(await run(() => rawRemoveItem(currentHouseholdId, id).then(() => true))) === true
		), [run, rawRemoveItem, currentHouseholdId]),

		createTerm: useCallback(async (kind, draft, stamps) => {
			const result = await run(() => rawCreateTerm(currentHouseholdId, kind, { ...draft, ...stamps }));
			return result ? result.id : null;
		}, [run, rawCreateTerm, currentHouseholdId]),

		updateTerm: useCallback(async (kind, id, patch) => {
			await run(() => rawUpdateTerm(currentHouseholdId, kind, id, patch));
		}, [run, rawUpdateTerm, currentHouseholdId]),

		deleteTerm: useCallback(async (kind, id) => (
			(await run(() => rawDeleteTerm(currentHouseholdId, kind, id).then(() => true))) === true
		), [run, rawDeleteTerm, currentHouseholdId]),

		setSourceKind: useCallback(async (storeId, kind) => {
			await run(() => rawSetSourceKind(currentHouseholdId, storeId, kind));
		}, [run, rawSetSourceKind, currentHouseholdId]),

		createInvite: useCallback(async (role) => (
			run(() => rawCreateInvite(currentHouseholdId, role))
		), [run, rawCreateInvite, currentHouseholdId]),

		revokeInvite: useCallback(async (inviteId) => (
			(await run(() => rawRevokeInvite(currentHouseholdId, inviteId).then(() => true))) === true
		), [run, rawRevokeInvite, currentHouseholdId]),

		// The returned id matters twice: the caller clears the stashed code on
		// success and keeps it on failure, and the household it names is the one
		// to switch to. Redemption takes no current household — the code says
		// which one it is for.
		redeemInvite: useCallback(async (code) => {
			const result = await run(() => rawRedeemInvite(code));

			return result ? result.householdId : null;
		}, [run, rawRedeemInvite]),

		changeRole: useCallback(async (membershipId, role) => {
			await run(() => rawChangeRole(currentHouseholdId, membershipId, role));
		}, [run, rawChangeRole, currentHouseholdId]),

		removeMember: useCallback(async (membershipId) => (
			(await run(() => rawRemoveMember(currentHouseholdId, membershipId).then(() => true))) === true
		), [run, rawRemoveMember, currentHouseholdId]),

		leaveHousehold: useCallback(async () => (
			(await run(() => rawLeaveHousehold(currentHouseholdId).then(() => true))) === true
		), [run, rawLeaveHousehold, currentHouseholdId]),

		deleteHousehold: useCallback(async () => (
			(await run(() => rawDeleteHousehold(currentHouseholdId).then(() => true))) === true
		), [run, rawDeleteHousehold, currentHouseholdId]),
	};
}

/**
 * One household's pantry, for taking a copy of it away (D68).
 *
 * **Its own hook and mounted rather than flagged**, exactly as the console's
 * heavy queries are: it names a household that is *not* the one the app is
 * showing, so it cannot come from `usePantryData`'s subscription. The one
 * caller renders for as long as it takes the answer to arrive and then unmounts
 * itself, which is the honest version of a one-shot read in a client that only
 * has subscriptions.
 *
 * The server resolves the id against the caller's own memberships, as every
 * scoped query does — an id here is a selector and never an authority, so a
 * household this account is not in answers with somebody else's default rather
 * than with its contents.
 */
export function usePantryOf(householdId: string): PantryData | null {
	const result = useQuery<PantryResult>('pantry', householdId);

	if (isLoading(result) || result.state !== 'ready') return null;

	const { state: _s, ...data } = result;

	return data;
}

/**
 * What an invite link says about itself, live.
 *
 * Its own hook rather than a field on `usePantryData`, because the `?join=`
 * landing is reached **before** any of that exists: a signed-out visitor has no
 * membership, no household, and nothing for the other three subscriptions to
 * answer with. This is the only read on that screen.
 *
 * `null` while the code is absent or the query has not answered — the same
 * absent-value signal every other query uses, since Zero reports no failures to
 * a subscriber (see `isLoading` above).
 */
export function useInvitePreview(code: string | null): InvitePreviewResult | null {
	const result = useQuery<InvitePreviewResult>('invitePreview', code ?? '');

	if (! code) return null;

	return isLoading(result) ? null : result;
}

export type ProfileStatus =
	| { state: 'loading' }
	| { state: 'guest' }
	/** `displayName` is `''` exactly when `needsName` is true — see `ProfileResult`. */
	| { state: 'ready'; displayName: string; needsName: boolean };

/**
 * The signed-in account's own name.
 *
 * Its own hook rather than a field on `usePantryData`, for the same reason
 * `useInvitePreview` is: it answers **before** a household exists, and every
 * other subscription in that hook is scoped to one. Rolling it in would make
 * the first-run screen depend on three queries that have nothing to say to it.
 *
 * The error is held here rather than shared with `usePantryData`'s, because the
 * only screen that renders this one has no app shell to put a banner in.
 */
export function useProfile(): {
	status: ProfileStatus;
	/** True when the server took it. False leaves the field and its typing alone. */
	setDisplayName: (name: string) => Promise<boolean>;
	error: string | null;
	dismissError: () => void;
} {
	const result = useQuery<ProfileResult>('profile');
	const [error, setError] = useState<string | null>(null);
	const rawSetDisplayName = useMutation<[string], void>('setDisplayName');

	const status: ProfileStatus = useMemo(() => {
		if (isLoading(result)) return { state: 'loading' };
		if (result.state === 'guest') return { state: 'guest' };

		return { state: 'ready', displayName: result.displayName, needsName: result.needsName };
	}, [result]);

	return {
		status,
		setDisplayName: useCallback(async (name) => {
			try {
				await rawSetDisplayName(name);
				setError(null);

				return true;
			} catch (thrown) {
				setError(thrown instanceof Error ? thrown.message : 'Something went wrong.');

				return false;
			}
		}, [rawSetDisplayName]),
		error,
		dismissError: useCallback(() => setError(null), []),
	};
}
