/*
 * The app's one route.
 *
 * **`@spacefast/zero` 0.4.1 moved routing into `pages/`**, and the CLI's own
 * scaffold states the rule outright: *"Addressable pages live in `pages/`…
 * An optional `client/index.tsx` may explicitly export `Layout`; it is not a
 * page."* Before 0.4.1 the compiler generated a root `index.html` that mounted
 * `client/index.tsx` for us, and **the 0.4.1 dev server does not serve that
 * file at all** — `GET /` resolves a page route or answers 404, so the whole
 * app was unreachable locally until this file existed. See the 2026-09-10
 * entries in `.claude/docs/spacefast.md`.
 *
 * **`"use client"` is what makes it the app rather than a document.** A `.tsx`
 * page without that directive is compiled to static markup owned by WordPress;
 * with it, the page is mounted in the browser and the compiler emits the same
 * `#root` shell plus `/client.js` the generated `index.html` used to be.
 *
 * **The app itself did not move.** `client/index.tsx` still holds `App` and
 * still runs the four boot side effects (fonts, icons, theme colour, the
 * install listener) at module scope — importing it here is what runs them, in
 * the same order and at the same moment as before.
 */

"use client";

import { App } from '../client/index';

export default function IndexPage() {
	return <App />;
}
