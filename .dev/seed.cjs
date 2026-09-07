/*
 * Seeds a local `sf dev` database with data worth clicking.
 *
 * It drives the **real handlers** over `POST /__spacefast/zero/run`, one call at
 * a time, exactly as `?demo` does and for the same reason: a row written any
 * other way is not the row the app produces. Nothing here is a fixture the
 * client would recognise as special — every household, item, invite and audit
 * entry is an ordinary one the moment it lands.
 *
 * **Dot-prefixed for D29's reason**: `sf publish` mirrors the project root and
 * does not honour `.gitignore`, but the serving layer refuses dot-prefixed
 * paths. This is a development tool and has no business being fetchable.
 *
 * **`.cjs`, not `.js`.** `package.json` says `"type": "module"`, so a `.js`
 * here is an ES module and `require` is not defined in one. The extension is
 * the whole fix, and it is also what lets this reach the CommonJS build of
 * `shared/` that `npm test` produces.
 *
 * Usage:
 *
 *     node .dev/seed.cjs <capability-token> [port]
 *
 * The token is the `#zero-dev-capability=` fragment printed in `sf dev`'s
 * banner. The two identities come from `LARDER_DEV_GUESTS` in `.env.server`,
 * so seeding and signing in cannot disagree about who exists.
 *
 * **Do not edit any project file while this runs.** `sf dev` watches the tree
 * and reloads the runtime on a change; a reload mid-run drops whichever call is
 * in flight, which presents as a handler refusing a household it just created.
 *
 * It is **additive and not idempotent** — every run makes another set of
 * households. For a clean slate, stop `sf dev`, delete
 * `.spacefast/zero/dev-state.sqlite`, start it again, and run this once.
 */
const { execSync } = require('child_process');
const { existsSync, readFileSync } = require('fs');
const path = require('path');

// Derived, never written down: this file is `.dev/seed.cjs`, so the project
// root is one level up. A literal path here breaks the moment the checkout
// moves or is renamed, and it breaks silently -- the `existsSync` below just
// rebuilds into a directory nobody reads.
const ROOT = path.resolve(__dirname, '..');

//  is TypeScript, and `npm test` already compiles it. Build it if it
// is not there rather than making that a step somebody has to remember.
if (! existsSync(path.join(ROOT, '.test-out/shared/demoItems.js'))) {
	execSync('npx tsc -p tsconfig.test.json', { cwd: ROOT, stdio: 'inherit' });
}

const { resolveDemoItems } = require(path.join(ROOT, '.test-out/shared/demoItems.js'));

/** The two names to seed as, read from the file that decides who may sign in. */
function devGuests() {
	const line = readFileSync(path.join(ROOT, '.env.server'), 'utf8')
		.split(String.fromCharCode(10)).find((l) => l.startsWith('LARDER_DEV_GUESTS='));
	const names = (line ?? '').slice('LARDER_DEV_GUESTS='.length).split(/[\s,]+/).filter(Boolean);

	if (names.length < 6) {
		console.error('Need six names in LARDER_DEV_GUESTS. Add more and restart `sf dev`.');
		process.exit(1);
	}
	return names;
}

const CAP = process.argv[2];
const PORT = process.argv[3] || '4173';
const BASE = `http://127.0.0.1:${PORT}`;

if (! CAP) { console.error('usage: node seed.js <capability-token> [port]'); process.exit(1); }

const [JUSTIN, ALICE, BOB, CAROL, DAVE, ERIN] = devGuests();

async function call(guest, body) {
	const res = await fetch(`${BASE}/__spacefast/zero/run?guest=${guest}`, {
		method: 'POST',
		headers: {
			authorization: `Bearer ${CAP}`,
			origin: BASE,
			'content-type': 'application/json',
			cookie: `spacefast_zero_dev_${PORT}=${CAP}`,
		},
		body: JSON.stringify(body),
	});
	const json = await res.json();
	if (json.ok === false) throw new Error(`${body.name}: ${JSON.stringify(json.error)}`);
	return json;
}

const query = (guest, name, args = []) => call(guest, { op: 'query.run', name, args }).then((r) => r.data);
const mutate = (guest, name, args = []) => call(guest, { op: 'mutation.run', name, args }).then((r) => r.result);

async function bootstrap() {
	const res = await fetch(`${BASE}/__spacefast/zero/bootstrap`, {
		method: 'POST',
		headers: { authorization: `Bearer ${CAP}`, origin: BASE },
	});
	if (! res.ok && res.status !== 204) throw new Error(`bootstrap ${res.status}`);
}

/*
 * Things a household grows and makes, which `shared/demoItems.ts` has none of.
 *
 * The demo table is a supermarket run — every row names Grocery, Warehouse or
 * Market — so a household seeded from it draws **one** run-list band and no
 * segment, whatever sources it has. These are what make Harvest and Make real.
 *
 * The seasons are chosen against the month this is read in, not at random:
 * some are current, some are not, and `Collard Greens` wraps across the new
 * year, which is the case that reads as an empty range if the rule is written
 * as a plain `from <= m && m <= to`.
 */
const GROW_MAKE = [
	// --- Garden, in season now ---
	{ name: 'Tomatoes', locationName: 'Pantry', typeNames: ['Produce'], storeNames: ['Garden', 'Grocery'], qty: '0', threshold: '2', seasonFrom: '6', seasonTo: '9', notes: 'Also at the store out of season — it lands on Buy and Harvest both.' },
	{ name: 'Basil', locationName: 'Pantry', typeNames: ['Produce'], storeNames: ['Garden'], qty: '1', threshold: '2', seasonFrom: '5', seasonTo: '10' },
	{ name: 'Bell Peppers', locationName: 'Refrigerator', typeNames: ['Produce'], storeNames: ['Garden'], qty: '1', threshold: '3', seasonFrom: '7', seasonTo: '10' },
	{ name: 'Zucchini', locationName: 'Refrigerator', typeNames: ['Produce'], storeNames: ['Garden'], qty: '4', threshold: '2', seasonFrom: '6', seasonTo: '8' },

	// --- Garden, not yet: the sub-group at the foot of the harvest card ---
	{ name: 'Kale', locationName: 'Refrigerator', typeNames: ['Produce'], storeNames: ['Garden'], qty: '0', threshold: '1', seasonFrom: '9', seasonTo: '11' },
	{ name: 'Strawberries', locationName: 'Freezer', typeNames: ['Produce'], storeNames: ['Garden'], qty: '0', threshold: '1', seasonFrom: '4', seasonTo: '6' },
	{ name: 'Collard Greens', locationName: 'Refrigerator', typeNames: ['Produce'], storeNames: ['Garden'], qty: '0', threshold: '2', seasonFrom: '11', seasonTo: '2', notes: 'November to February — the range that wraps the year.' },

	// --- Kitchen ---
	{ name: 'Sourdough Bread', locationName: 'Pantry', typeNames: ['Baked Goods'], storeNames: ['Kitchen'], qty: '0', threshold: '1' },
	{ name: 'Chicken Stock', locationName: 'Freezer', typeNames: ['Canned Goods'], storeNames: ['Kitchen'], qty: '2', threshold: '4', size: '1', unit: 'quart' },
	{ name: 'Granola', locationName: 'Pantry', typeNames: ['Breakfast'], storeNames: ['Kitchen'], qty: '1', threshold: '1', notes: 'On hand equals low at, which is low.' },
	{ name: 'Yogurt', locationName: 'Refrigerator', typeNames: ['Dairy'], storeNames: ['Kitchen'], qty: '3', threshold: '1' },
	{ name: 'Dill Pickles', locationName: 'Pantry', typeNames: ['Condiments'], storeNames: ['Kitchen', 'Garden'], qty: '0', threshold: '2', seasonFrom: '7', seasonTo: '9', notes: 'Grown and made — two kinds, two glyphs on the card.' },
];

/** Resolve `GROW_MAKE` against a household's own terms and write it. */
async function addExtras(guest, householdId) {
	const pantry = await query(guest, 'pantry', [householdId]);
	const byName = (terms) => new Map(terms.map((t) => [t.name.trim().toLowerCase(), t.id]));
	const locations = byName(pantry.locations);
	const types = byName(pantry.types);
	const stores = byName(pantry.stores);
	let added = 0;

	for (const row of GROW_MAKE) {
		const locationId = locations.get(row.locationName.toLowerCase());
		if (! locationId) continue;

		await mutate(guest, 'addItem', [householdId, {
			name: row.name,
			locationId,
			qty: row.qty,
			threshold: row.threshold,
			size: row.size,
			unit: row.unit,
			notes: row.notes,
			seasonFrom: row.seasonFrom,
			seasonTo: row.seasonTo,
			typeIds: row.typeNames.map((n) => types.get(n.toLowerCase())).filter(Boolean),
			storeIds: row.storeNames.map((n) => stores.get(n.toLowerCase())).filter(Boolean),
		}]);
		added++;
	}
	return added;
}

/** Every item in `shared/demoItems.ts`, against one household's own terms. */
async function fillPantry(guest, householdId, limit) {
	const pantry = await query(guest, 'pantry', [householdId]);
	const { drafts } = resolveDemoItems(pantry.locations, pantry.types, pantry.stores, Date.now());
	const take = limit ? drafts.slice(0, limit) : drafts;

	for (const draft of take) {
		const { addedAt, changedAt, ...rest } = draft;
		await mutate(guest, 'addItem', [householdId, rest]);
	}
	return take.length;
}

async function main() {
	await bootstrap();
	console.log(`seeding ${BASE} as ${JUSTIN} and ${ALICE}\n`);

	// --- the two people ---
	const PEOPLE = [
		[JUSTIN, 'Justin Tadlock'], [ALICE, 'Alice Chen'], [BOB, 'Bob Ferreira'],
		[CAROL, 'Carol Nwosu'], [DAVE, 'Dave Whitfield'], [ERIN, 'Erin Halvorsen'],
	];
	for (const [guest, name] of PEOPLE) await mutate(guest, 'setDisplayName', [name]);
	console.log(`${PEOPLE.length} accounts named`);

	/*
	 * **The three households are created before any of them is named**, and the
	 * big one is whichever id sorts first.
	 *
	 * `selectMembership` breaks a tie by `householdId.localeCompare` — a
	 * deliberately stable rule, and one with nothing to do with size or
	 * recency. Seeding the pantry into a household picked by name therefore
	 * opens the app on whichever of them happens to sort first, which reads as
	 * missing data. Ids are server-generated, so the only way to control that is
	 * to make all three, look, and then decide which is which.
	 *
	 * All three get the full source mix for the same reason: the mix is fixed at
	 * creation, before the sort is known.
	 */
	const ids = [];
	for (let i = 0; i < 3; i++) {
		ids.push((await mutate(JUSTIN, 'createHousehold', [
			`Household ${i + 1}`, `color-${3 + i * 4}`, { buy: true, grow: true, make: true },
		])).householdId);
	}
	ids.sort((a, b) => a.localeCompare(b));
	const [home, cabin, camp] = ids;

	await mutate(JUSTIN, 'updateHousehold', [home, { name: 'The Tadlock Household' }]);
	await mutate(JUSTIN, 'updateHousehold', [cabin, { name: 'Lake Cabin' }]);
	await mutate(JUSTIN, 'updateHousehold', [camp, { name: 'Camp Pantry' }]);

	const n = await fillPantry(JUSTIN, home);
	const extra = await addExtras(JUSTIN, home);
	console.log(`The Tadlock Household — ${n + extra} items (${extra} grown or made), and it opens by default`);

	/*
	 * Three people join through **real invites**, one per role, so the members
	 * pane has a stack of four and the role menu has somebody to demote. The
	 * invite carries the role, so this is also the only way to end up with a
	 * second owner without an admin write.
	 */
	for (const [guest, role] of [[ALICE, 'editor'], [BOB, 'viewer'], [CAROL, 'owner']]) {
		const invite = await mutate(JUSTIN, 'createInvite', [home, role]);
		await mutate(guest, 'redeemInvite', [invite.code]);
	}
	console.log('Alice (editor), Bob (viewer) and Carol (owner) joined it by invite');

	const m = await fillPantry(JUSTIN, cabin, 14);
	console.log(`Lake Cabin — ${m} items, Justin alone`);
	console.log('Camp Pantry — no items at all');

	// --- two Justin is NOT in, so the console shows households from outside ---
	const other = (await mutate(ALICE, 'createHousehold', ['Riverside Kitchen', 'color-9', { buy: true, make: true }])).householdId;
	await fillPantry(ALICE, other, 9);
	console.log("Riverside Kitchen — Alice's own, 9 items, Justin is not a member");

	const harbor = (await mutate(DAVE, 'createHousehold', ['Harbor Flat', 'color-14', { buy: true, grow: true }])).householdId;
	await fillPantry(DAVE, harbor, 6);
	console.log("Harbor Flat — Dave's own, 6 items");

	// Erin signs in and joins nothing, which is People's *No household* filter —
	// a state nothing else in the seed produces.
	console.log('Erin has an account and no household at all');

	// --- live invites, for the household page and Overview's fourth card ---
	await mutate(JUSTIN, 'createInvite', [cabin, 'viewer']);
	await mutate(JUSTIN, 'createInvite', [home, 'viewer']);
	await mutate(ALICE, 'createInvite', [other, 'editor']);
	await mutate(DAVE, 'createInvite', [harbor, 'viewer']);
	console.log('four live invites out');

	// --- audit rows, so Activity is not an empty state ---
	const members = (await query(JUSTIN, 'adminHousehold', [home])).members;
	const aliceRow = members.find((x) => x.userId === `guest:${ALICE}`);
	await mutate(JUSTIN, 'adminSetRole', [home, aliceRow.id, 'owner']);
	await mutate(JUSTIN, 'adminSetRole', [home, aliceRow.id, 'editor']);
	const otherInvites = (await query(JUSTIN, 'adminHousehold', [other])).invites;
	await mutate(JUSTIN, 'adminRevokeInvite', [other, otherInvites[0].id]);

	const doomed = (await mutate(JUSTIN, 'createHousehold', ['Old Rental', 'color-2', { buy: true }])).householdId;
	await fillPantry(JUSTIN, doomed, 4);
	await mutate(JUSTIN, 'adminDeleteHousehold', [doomed]);
	console.log('four audit entries, including a deletion with its counts');

	const summary = await query(JUSTIN, 'adminSummary');
	console.log(`\nconsole now sees: ${summary.households} households, ${summary.people} people, ${summary.items} items, ${summary.invites} live invites`);
}

main().catch((err) => { console.error('\nFAILED:', err.message); process.exit(1); });
