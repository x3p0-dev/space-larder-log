import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';

import { usePersistentState } from './usePersistentState';
import { indexClaims } from '../../shared/claim';
import type { Claim, ClaimIndex } from '../../shared/claim';

/**
 * A trip: what you have claimed, what somebody else has, and whether you were
 * reading the list when you last looked.
 *
 * **A check is a claim, not a write** (D64), and **it is shared** (D66). Ticking
 * a row says *I am getting this*; the count is written once, at the put-away.
 * Nothing here touches an item.
 *
 * **The claims live on the server now, and that is most of this file.** D41 put
 * them in `localStorage` for the best reason a shopping list has — reloading in
 * a shop, on a phone with two bars of signal, has to come back with the ticks
 * intact — and a shared trip does that strictly better: the ticks are on the
 * server, so they survive a reload, a second device, and a flat battery.
 *
 * **What is left in `localStorage` is list mode alone**, per household. That is
 * a fact about this device — which screen you were reading — and it is the one
 * thing that should not follow you to a desktop.
 *
 * Four rules clear a claim, and only the last has a button. All four are the
 * server's now:
 *
 * 1. The item leaves the list — anyone restocks it, and the claim goes with it.
 * 2. The trip is put away. The counts are written and the trip is over.
 * 3. Twenty-four hours pass with no put-away, counted from the **last** tick.
 * 4. *Clear checks*.
 *
 * **Switching households parks rather than clears** (D64) — a trip belongs to a
 * household, so leaving one and coming back finds it where you left it.
 */

/** Which screen this device was reading, per household. `{}` on a new device. */
type Modes = Record<string, boolean>;

/** Hoisted so the initial value is not a fresh literal on every render. */
const NO_MODES: Modes = {};

export type TripChecks = {
	/** Item ids **you** have claimed — what the checkbox reads. */
	checked: ReadonlySet<string>;
	/** How many of the rows currently on the list are yours. */
	count: number;
	/** Yours and everybody else's, split — see `indexClaims`. */
	claims: ClaimIndex;
	toggle: (id: string) => void;
	/**
	 * Untick a set of rows at once — what *Clear checks* takes off the screen.
	 *
	 * It takes ids rather than emptying the trip, because the caller knows which
	 * rows are on screen and this does not: with a Store filter on, the trip
	 * holds claims for rows nobody can see, and a control sitting beside
	 * `Hide 3 checked` must not quietly clear seven.
	 */
	uncheck: (ids: readonly string[]) => void;
	/** Puts exactly those ticks back — the toast's Undo, and nothing else. */
	recheck: (ids: readonly string[]) => void;
	listMode: boolean;
	setListMode: (on: boolean) => void;
};

/**
 * @param key         Storage key — per identity, like the theme and household ones.
 * @param householdId The list these claims belong to; `null` until it loads.
 * @param me          Your `userId`; `''` until the household query answers.
 * @param claims      Every live claim in the household, from the server.
 * @param liveIds     The ids currently on the list. Anything else has been restocked.
 * @param claim       Writes a claim. False when the server refused.
 * @param release     Releases claims. False when the server refused.
 */
export function useTripChecks(
	key: string,
	householdId: string | null,
	me: string,
	claims: readonly Claim[],
	liveIds: ReadonlySet<string>,
	claim: (id: string) => Promise<boolean>,
	release: (ids: readonly string[]) => Promise<boolean>
): TripChecks {
	const [modes, setModes] = usePersistentState<Modes>(key, NO_MODES);

	/**
	 * Ticks that have been pressed and not yet confirmed by the server.
	 *
	 * **The echo is what makes a tick feel local when it is not.** A claim is a
	 * network write at the worst possible moment — a phone in a shop — so the box
	 * fills on the press and the round trip happens underneath. `true` is a tick
	 * in flight, `false` an untick; the entry is dropped when **the `claims`
	 * query** comes back agreeing with it, at which point the overlay has nothing
	 * left to say.
	 *
	 * **The mutation resolving is not that moment, and treating it as one is the
	 * bug this comment used to describe.** A claim is written by one round trip
	 * and read by a *different* live query — D66 gave `claims` its own
	 * subscription precisely so a tick does not refetch the pantry — so between
	 * the write landing and that subscription re-emitting, the server's own view
	 * is still the old one. Dropping the echo there fell back to it, and the box
	 * went **tick, untick, tick** on a single press: the echo, then the stale
	 * read, then the query catching up. Reported from a real shop.
	 *
	 * **A refusal rolls back and says so.** `claimItem` returns false when
	 * somebody else already holds the row, and `usePantryData` has already put
	 * the server's own sentence on screen. Silently keeping the tick would be
	 * the double-buy this feature exists to prevent.
	 */
	const [pending, setPending] = useState<ReadonlyMap<string, boolean>>(new Map());

	const settle = useCallback((id: string) => {
		setPending((prev) => {
			if (! prev.has(id)) return prev;

			const next = new Map(prev);
			next.delete(id);

			return next;
		});
	}, []);

	/**
	 * The server's own view, unechoed — what `claims` currently says.
	 *
	 * It is what `theirs` is read from, and what a row you have not touched
	 * shows. Your own touched rows come from the overlay instead; see the
	 * effect above for why.
	 */
	const base = useMemo(() => indexClaims(claims, me), [claims, me]);

	/**
	 * Your own ticks stand until something real changes them.
	 *
	 * **This is the shape the evidence chose, not the one the design wanted.**
	 * The overlay used to be dropped as soon as the `claims` query agreed with
	 * it, which reads as obviously correct and is not: on 2026-09-10 a run of
	 * bisections found the run list holds still with the overlay switched off,
	 * holds still when the echo is never dropped, and moves in every build that
	 * drops it — including one that refused out-of-order answers by server
	 * clock. Four configurations, consistent, and **the cause of the movement
	 * after the drop is still unexplained**. What is established is that letting
	 * go of your own tick is what exposes it.
	 *
	 * So the echo is not released on agreement. It is replaced when you toggle
	 * that row again, rolled back when the server refuses (see the writers
	 * below), dropped wholesale on a household switch, and gone on reload —
	 * which are the moments a tick should stop meaning anything anyway.
	 *
	 * **What this costs, plainly.** For a row *you have touched*, this device's
	 * view wins until one of those moments; your own tick changing underneath
	 * you from a second device will not show until you reload. **Somebody
	 * else's claim is unaffected** — `theirs` is read straight from the server
	 * and takes precedence over the overlay a few lines below, so the
	 * double-buy D66 exists to prevent stays prevented, which is the half that
	 * had to survive this trade.
	 *
	 * An echo for a row that has left the list is inert rather than cleaned up:
	 * the overlay below skips any id outside `liveIds`, so a restocked row's
	 * entry paints nothing. Evicting it here was part of the drop path, and the
	 * drop path is what broke.
	 */
	useEffect(() => {
		setPending((prev) => (prev.size === 0 ? prev : new Map()));
	}, [householdId]);

	/**
	 * The household's claims, split into yours and theirs, with the echo applied.
	 *
	 * **`liveIds` is what enforces rule 1.** A claim on a row that has left the
	 * list is not shown and not counted — the server drops it on the next write,
	 * and until then it simply is not here.
	 */
	const index = useMemo<ClaimIndex>(() => {
		const mine = new Set<string>();
		const theirs = new Map<string, string>();

		for (const id of base.mine) if (liveIds.has(id)) mine.add(id);
		for (const [id, who] of base.theirs) if (liveIds.has(id)) theirs.set(id, who);

		for (const [id, on] of pending) {
			if (! liveIds.has(id)) continue;
			// An echo never overrides somebody else's claim: the server would
			// refuse it, and painting it as yours in the meantime is the one lie
			// this screen must not tell.
			if (theirs.has(id)) continue;

			if (on) mine.add(id);
			else mine.delete(id);
		}

		return { mine, theirs };
	}, [base, liveIds, pending]);

	const toggle = useCallback((id: string) => {
		if (! householdId) return;

		const on = ! index.mine.has(id);


		// Somebody else's row is not yours to tick, and the checkbox is absent on
		// one — this is the guard for the paths a checkbox does not own.
		if (on && index.theirs.has(id)) return;

		setPending((prev) => new Map(prev).set(id, on));

		// The server refused, and has already said why. Dropping the echo returns
		// the row to whatever the server thinks it is. A success settles nothing —
		// the reconcile effect above owns that, when the query agrees.
		void (on ? claim(id) : release([id])).then((ok) => { if (! ok) settle(id); });
	}, [householdId, index, claim, release, settle]);

	const uncheck = useCallback((ids: readonly string[]) => {
		if (! householdId || ids.length === 0) return;

		// Yours only. Nothing here can release somebody else's cart, and the
		// server refuses it a second time.
		const going = ids.filter((id) => index.mine.has(id));

		if (going.length === 0) return;

		setPending((prev) => {
			const next = new Map(prev);
			for (const id of going) next.set(id, false);
			return next;
		});

		void release(going).then((ok) => {
			if (! ok) for (const id of going) settle(id);
		});
	}, [householdId, index, release, settle]);

	const recheck = useCallback((ids: readonly string[]) => {
		if (! householdId || ids.length === 0) return;

		// Undo runs seconds after the clear, so a row it names is normally still
		// unticked — but the same rows can be ticked by hand in the meantime, and
		// somebody else can have taken one, which the server will refuse.
		const back = ids.filter((id) => ! index.mine.has(id) && ! index.theirs.has(id));

		if (back.length === 0) return;

		setPending((prev) => {
			const next = new Map(prev);
			for (const id of back) next.set(id, true);
			return next;
		});

		for (const id of back) void claim(id).then((ok) => { if (! ok) settle(id); });
	}, [householdId, index, claim, settle]);

	const setListMode = useCallback((on: boolean) => {
		if (! householdId) return;

		setModes((prev) => ({ ...(prev && typeof prev === 'object' ? prev : {}), [householdId]: on }));
	}, [householdId, setModes]);

	return {
		checked: index.mine,
		count: index.mine.size,
		claims: index,
		toggle,
		uncheck,
		recheck,
		listMode: Boolean(householdId && modes && (modes as Modes)[householdId]),
		setListMode,
	};
}
