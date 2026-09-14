/**
 * Taking a copy of something with you (D68).
 *
 * **Export is two features, and drawing it against the deletion rules is what
 * split it.** The pantry is the one thing account deletion has already
 * established *is not yours* — it belongs to the household and survives you —
 * so *Download your data* and *Export the pantry* are different exports, in
 * different places, answering different questions:
 *
 * | | Where | What it is |
 * |---|---|---|
 * | **Your data** | The account pane | Four fields, because there is nothing else. A legal obligation, not a feature |
 * | **The pantry** | Settings → Pantry settings | The household's rows. The one anybody wants |
 *
 * **Neither is a backup, because nothing imports one back.** Saying so is
 * cheap; the alternative is somebody deleting a household they thought they had
 * saved.
 *
 * **The two exports that describe rows offer CSV or JSON** — the pantry here,
 * and the audit log in `client/lib/activityExport.ts`. *Your data* does not:
 * it is four fields, two of which are lists of objects, and a CSV of that is a
 * file with two shapes in it.
 *
 * The *shape* of a file is domain logic and lives here. Handing one to a
 * browser is not — that reaches `Blob`, `URL` and `document`, three of the
 * identifiers the capsule compiler's denylist rejects outright — so the
 * download itself stays in `client/lib/download.ts` beside the app's first
 * one.
 */

import type { Item, Source, Term } from './types';
import { formatSize } from './size';

/** RFC 4180: quote everything, and double an embedded quote. */
export function csvCell(value: string): string {
	return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

/**
 * A whole CSV, header included, ending in a newline.
 *
 * The trailing newline is not decoration: a file whose last line has none is a
 * file some tools read as one row short.
 */
export function csvFile(columns: readonly string[], rows: readonly (readonly string[])[]): string {
	const lines = [columns.join(',')];

	for (const row of rows) lines.push(row.map(csvCell).join(','));

	return `${lines.join('\n')}\n`;
}

/**
 * Which file you get.
 *
 * **Both, because the two readers want different things.** CSV is what a
 * spreadsheet opens and what somebody auditing a household actually double
 * clicks; JSON is what survives the shapes CSV cannot hold — an item names
 * several sources and several types (there are no array columns, D4), and a CSV
 * cell can only flatten those into one string with a separator in it.
 *
 * **The choice is made at the press and remembered nowhere.** It is a property
 * of what you are about to do with the file, not of the device or the
 * household, so there is no preference to set and none to find later.
 */
export type ExportFormat = 'csv' | 'json';

export function isExportFormat(value: string): value is ExportFormat {
	return value === 'csv' || value === 'json';
}

/**
 * A whole JSON file, ending in a newline.
 *
 * Two-space indent, as the account export already uses: these files are read by
 * a person about as often as by anything else, and an indent costs bytes nobody
 * is counting.
 */
export function jsonFile(value: unknown): string {
	return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * The pantry's columns.
 *
 * **Names, never ids**, so the file is readable on its own — and an item's
 * missing source is an empty cell, exactly as `NO STORE` is a real state rather
 * than a gap to apologise for.
 *
 * `sources` and `types` are plural because both are many-to-many (there are no
 * array columns — D4). **In CSV they are semicolon-joined and in JSON they are
 * real arrays**, which is the clearest example of why the format is worth
 * offering at all: a comma inside a CSV cell is a quoting problem nobody
 * reading the file should have to think about, and a separator inside a value
 * is a thing the reader has to be told about. JSON has to tell nobody.
 *
 * The keys are the same in both files, so the two describe one thing in two
 * shapes rather than being two exports.
 */
export const PANTRY_COLUMNS = [
	'name', 'size', 'on_hand', 'low_at', 'location', 'sources', 'types', 'notes',
] as const;

const JOIN = '; ';

/**
 * One row per item, resolved and ordered — the one reading of the pantry both
 * files are built from.
 *
 * **A–Z, and sorted here** rather than taken in whatever order the query
 * collected them. An export is opened by something that is not this app, and
 * the order a row happens to have been inserted in is not an order.
 *
 * **`on_hand` and `low_at` stay strings, in JSON too.** They are decimal
 * strings all the way down (there is no numeric column type — D1), and a
 * `Number()` here would be this file inventing a precision the database never
 * held, then handing back `null` for the empty ones.
 *
 * **`location` is quoted here, in the object literal below, and read with a
 * bracket** — the fix `TERM_TABLES` already takes in `server/index.ts`. The
 * capsule compiler denies the browser globals to every file in `shared/`,
 * imported by the capsule or not, and its scanner counts a bare `location`
 * property key or member access as a reference to one. The column is named
 * `location` in both files and none of that changes.
 */
export type PantryRow = {
	name: string;
	size: string;
	on_hand: string;
	low_at: string;
	'location': string;
	sources: string[];
	types: string[];
	notes: string;
};

export function pantryRows(
	items: readonly Item[],
	locations: readonly Term[],
	sources: readonly Source[],
	types: readonly Term[]
): PantryRow[] {
	const nameOf = new Map<string, string>();

	for (const t of [...locations, ...sources, ...types]) nameOf.set(t.id, t.name);

	const named = (ids: readonly string[]) =>
		ids.map((id) => nameOf.get(id) ?? '').filter(Boolean);

	return [...items]
		.sort((a, b) => a.name.localeCompare(b.name))
		.map((item) => ({
			name: item.name,
			size: formatSize(item.size, item.unit),
			on_hand: item.qty,
			low_at: item.threshold,
			'location': nameOf.get(item.locationId) ?? '',
			sources: named(item.storeIds),
			types: named(item.typeIds),
			notes: item.notes,
		}));
}

export function pantryCsv(
	items: readonly Item[],
	locations: readonly Term[],
	sources: readonly Source[],
	types: readonly Term[]
): string {
	const rows = pantryRows(items, locations, sources, types).map((r) => [
		r.name, r.size, r.on_hand, r.low_at, r['location'],
		r.sources.join(JOIN), r.types.join(JOIN), r.notes,
	]);

	return csvFile(PANTRY_COLUMNS, rows);
}

/**
 * The same rows, as a bare array.
 *
 * **No envelope.** A wrapper naming the household and the day was drawn and
 * dropped: the filename already carries both, and an array is the thing every
 * reader — `jq`, a script, a person — expects to find at the top of a file
 * called `calfee-household-2026-09-01.json`.
 */
export function pantryJson(
	items: readonly Item[],
	locations: readonly Term[],
	sources: readonly Source[],
	types: readonly Term[]
): string {
	return jsonFile(pantryRows(items, locations, sources, types));
}

/** Whichever of the two was asked for. */
export function pantryFile(
	format: ExportFormat,
	items: readonly Item[],
	locations: readonly Term[],
	sources: readonly Source[],
	types: readonly Term[]
): string {
	return format === 'json'
		? pantryJson(items, locations, sources, types)
		: pantryCsv(items, locations, sources, types);
}

/** `calfee-household-2026-09-01.csv` — the household, the day, and the format. */
export function pantryFilename(householdName: string, isoDay: string, format: ExportFormat): string {
	return `${slug(householdName) || 'pantry'}-${isoDay.slice(0, 10)}.${format}`;
}

/**
 * Everything this app holds that is the *account's* rather than a household's.
 *
 * **Four fields, because there is nothing else.** No per-item authorship
 * anywhere in Larder Log means an account has almost no data to hand back — and
 * that is the same fact the deletion copy leans on when it says the pantries
 * other people keep are untouched. The shortness of this file is the argument
 * made in a different form.
 *
 * **No invite codes**, which is the one place this departs from the design's
 * `invites_issued[]`. A code *is* the authorization (D39); a live one sitting
 * in a file on disk is a worse place for it than the app it was minted in, and
 * the export exists to describe what is held about you rather than to hand out
 * working keys. What it names instead is the household, the role and when the
 * link dies — which is everything about the invite except the way in.
 *
 * **`joined` is a date the app writes**, not the platform's insert stamp:
 * `memberships.joinedAt`, added once the console started sorting *Recently
 * joined* on it. A membership written before that column falls back to
 * `createdAt`, which for a row nothing has rewritten is the same instant.
 */
export type AccountData = {
	display_name: string;
	email: string;
	member_of: { household: string; role: string; joined: string }[];
	invites_issued: { household: string; role: string; expires_at: string; live: boolean }[];
};

export function accountDataJson(data: AccountData): string {
	return jsonFile(data);
}

/** `larder-log-account-2026-09-01.json`. */
export function accountDataFilename(isoDay: string): string {
	return `larder-log-account-${isoDay.slice(0, 10)}.json`;
}

/** `Calfee Household` → `calfee-household`. */
function slug(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}
