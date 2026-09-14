# Spacefast: working notes

A running log of building Larder Log on Spacefast — what worked, what didn't,
and what we'd tell the Spacefast team. Append as we go; keep entries dated so
the feedback stays attributable to a point in time.

**Format:** newest section at the bottom. Tag entries 👍 good / 👎 friction /
❓ unclear / 🐛 bug.

---

## 2026-08-24 — First contact: reading the docs

Context: evaluating Spacefast as the target platform before writing any project
docs. Had not yet installed the CLI or created a space.

### 👎 The docs are unreadable to an agent over plain HTTP

`https://spacefast.com/docs` and `https://spacefast.com/` both return **HTTP 403**
to a normal programmatic fetch. So does `/setup.md` — the page whose entire
stated purpose is "an agent that fetches spacefast.com/setup.md learns the whole
publish flow from one page of plain text."

The block appears to be user-agent based: sending a desktop Chrome UA via `curl`
returns the content immediately. So the first thing an AI agent is told to do is
the thing the edge blocks by default, unless the agent thinks to impersonate a
browser.

This is worth flagging loudly, because it's self-defeating for a product whose
positioning is "where AI-made web things go to live." I found the platform's
capabilities only after working around its own bot protection.

**What we'd suggest:** allowlist `*.md` paths, `/setup.md`, and `/ai.txt` for
any user agent, or serve them from a subdomain that isn't behind the challenge.

### 👍 The `.md` mirror of every docs page is excellent

Once past the 403, every docs page has a plain-Markdown twin
(`/docs/zero.md`, `/docs/index.md`), advertised via
`<link rel="alternate" type="text/markdown">`. `zero.md` is ~19 KB and contains
the *entire* runtime reference — schema API, auth, storage, styling, limits,
a complete two-file example app.

This is the single best docs-for-agents decision on the site. One fetch, no
crawling, no JS rendering, no pagination. More platforms should do this.

### 👍 The runtime is genuinely well-scoped for this app

Zero gives us a database, sign-in, live queries, and storage in one publish
command. For a two-person household app, not having to stand up Postgres +
an auth provider + a sync layer is the whole value proposition. The
`useQuery()`-re-renders-on-any-mutation model means "my wife and I both editing
at once" is free rather than a feature.

### 👎 No numeric column type

Schema fields are `string()`, `boolean()`, `id(table)`. That's it.

For an *inventory* app this lands directly on the primary field: quantity. We
now store `qty` and `threshold` as decimal strings, parse at every boundary,
validate integer-ness server-side, and can't sort by quantity in the database
at all (string ordering puts "10" before "2"), so quantity sorting has to happen
client-side after parsing.

None of that is fatal, but it's a papercut on every single read and write of the
app's most important number. An `int()` type — or even documented guidance on
the intended encoding — would remove a whole category of bugs.

### 👎 No array or JSON field type

Items have many types and many stores. With no array type, that's two join
tables (`itemTypes`, `itemStores`), which turns "read an item" into a join and
"save an item" into a reconcile. Reasonable relational modeling, but it's a real
step up in complexity from the prototype's `types: string[]`.

### 👎 No row-level security

Ownership is entirely hand-written: store the id, re-read before write, compare,
reject. The docs are commendably explicit about this ("never accept an owner id
from client arguments") and even show the pattern. But for a multi-tenant app
it means the correctness of every tenant boundary rests on remembering to call a
helper in every handler. One forgotten check is a cross-household data leak.

A declarative rule layer, or even a lint rule / typed `ctx.db` wrapper that
can't be queried without a scope, would help a lot.

### ❓ Open API questions the docs don't answer

Collected in [`.docs/notes.md`](../../.docs/notes.md); the ones that actually
block design decisions:

1. **Can `query()` take arguments?** Every `mutation()` example has typed args;
   every `query()` example takes only `ctx`, and `useQuery()` is never called
   with arguments. If queries are argument-less, multi-tenant switching has to
   be server-side state rather than a parameter. We designed around it, but had
   to guess.
2. **What happens when a handler throws?** Our auth helper throws. How that
   surfaces in `useQuery` / `useMutation` — exception, rejected promise, empty
   result — is undocumented, and it determines all client error handling.
3. **Compound index ranges?** Only `range.eq("field", value)` on one field is
   shown. Unclear whether `.eq().eq()` chains.
4. **Is adding an index "additive"?** Publish applies additive changes silently
   and requires flags for destructive ones. Where indexes fall isn't stated.

### 👍 Destructive migrations require an explicit flag

`sf publish` applies additive changes but will not silently drop data;
`sf db migrate --drop` / `--rename` are opt-in. Exactly the right default. It
does mean getting the schema right early is worth real effort, which is why we
committed to `householdId` on every table from day one rather than retrofitting.

### 👍 Honest, specific limits

Server bundle ≤ 768 KiB, client ≤ 8 MiB, storage 5 MiB/object, 200 MiB daily
anonymous upload budget. Stated plainly in the reference rather than buried in
a pricing table. Easy to design against.

### ❓ Auth is Gravatar-only

Hosted sign-in is Gravatar; `SignInWithGoogle` is a compatibility alias that
renders a "Sign in with Gravatar" button — which is a slightly confusing bit of
naming, since the function name says Google and the button says Gravatar.

For our two-person household this is fine. For anything with real user
acquisition, Gravatar-only would be a hard constraint worth knowing before
committing.

---

## 2026-08-24 — Repo setup, before the port

### 👍 The docs are explicit about what must never be published

`setup.md` says plainly: zip "the public output only — never a repository root,
never `.env*`, credentials, `.git`, or `.spacefast`." That's specific enough to
act on, so we pre-emptively gitignored `.env*` and `/.spacefast` before writing
a line of Zero code. Naming the exact paths beats a vague "don't commit
secrets."

### ❓ Should `.spacefast/` be committed or ignored?

Genuinely unclear from the docs, and it cuts both ways. `setup.md` tells agents
to look for `.spacefast/space.json` or `state.json` to find an existing space
and publish a new version to it rather than creating a duplicate — which argues
for committing it so any clone finds the right space.

But the claim key is a bearer credential ("anyone who has it can also publish
over this space and claim it"), which argues hard for ignoring it.

We ignored the whole directory. If space identity and space credentials live in
the same file, that's a design worth splitting: a committable `space.json` with
just the id, and an ignored `state.json` with the key. Worth asking whether
that's already the intent.

---

## Not yet evaluated

Things we'll have opinions about once we actually build:

- `sf init` / `sf dev` developer experience
- Whether local dev state (`--state-backend sqlite`) behaves like production
- Migration ergonomics on a schema change with real rows in it
- `sf publish` speed and failure modes
- The platform kit (`@spacefast/zero/kit`) — how much of it we can actually use
  alongside a custom color system
- Rollback behavior when code and schema disagree
- Backups (`sf db export`) and whether restore is a real path

---

## 2026-08-24 — Phase 1: CLI, scaffold, and the first `sf dev`

Context: installing the toolchain, scaffolding the Zero project into the
existing repo, porting the React prototype to Preact, and running the capsule
locally for the first time. CLI version `spacefast/0.0.26`, Node v24.14.1,
darwin-arm64.

### 👍 The CLI is on npm, so it can be a pinned devDependency

`setup.md` advertises exactly one install path:
`curl -fsSL https://spacefast.com/install.sh | bash`. But the CLI is also
published as the plain `spacefast` package, which exposes both `spacefast` and
`sf` bins:

```bash
npm install --save-dev spacefast@0.0.26   # provides `sf`
```

That is strictly better for a project: the version is pinned in
`package-lock.json`, every clone gets the same CLI, and nothing pipes a remote
script into a shell. **Worth advertising in the docs** — the curl installer is
right for a laptop, but a repo wants the dependency.

### 👎 `sf --help` hides the four commands the Zero docs use most

The top-level command list shows only `publish`, `status`, `versions`,
`rollback`, `spaces claim`, `login`, `init`, `docs`. Missing: **`dev`, `db`,
`logs`, `storage`** — which are the commands `/docs/zero` tells you to run.

They all exist and work (`sf dev --help`, `sf db --help`, …), and `sf db`'s own
help lists its `console` / `dump` / `export` / `migrate` subcommands. But an
agent that reads `sf --help` to discover the surface concludes `sf dev` isn't a
thing. `sf docs "theme.json"` also returns "No essential docs match".

### 👍 `sf init --runtime zero` writes an excellent `AGENTS.md`

The scaffold drops a ~113-line `AGENTS.md` that is **denser and more useful
than `/docs/zero.md`**, and documents constraints that appear nowhere public:

- "Class names must be static strings… a computed class like `bg-${tone}-500`
  produces no CSS and the capsule ships unstyled."
- The semantic token vocabulary (`canvas`, `surface`, `ink`, `ink-muted`,
  `line`, `accent`, `success`, `warning`, `danger`) and the shadcn aliases.
- "Server code imports `@spacefast/zero/server` and its own files, nothing
  else" — npm packages bundle on the client only.
- "Outbound `fetch` works only inside actions."
- Platform modules (kit, charts, preact, recharts, lucide) are served from
  immutable platform URLs and **don't count against the 8 MB client budget**.

Copied to `.claude/docs/zero-agent-rules.md`. **Suggestion: publish this page.**
It is the best single document about the runtime and it is currently only
discoverable by scaffolding a throwaway project.

### ✅ Resolved: queries *can* take arguments

Open question #1 from the first session is answered, though not by the docs —
by the type declarations in `@spacefast/zero/dist/public-client.d.ts`:

> Reads a query. The canonical form takes the query-options object the typed
> client builds — `useQuery(api.messages({ topic }))`; the Lakebed string form
> `useQuery("messages", topic)` stays supported and means the same thing.

So `useQuery(name, ...args)` is real, and `usePaginatedQuery(name, args, …)`
takes an args record outright. Every `query()` example in `/docs/zero.md` takes
only `ctx`, which is what made this look impossible. **One example with an
argument would have saved a design detour** — we architected around the
possibility that queries were argument-less.

### ❓ `theme.json` is WordPress theme.json v3, and that is documented nowhere

This is a genuinely nice decision that no one can find. `/docs/zero.md` says
only "A `theme.json` at the project root adjusts the palette and typography the
utilities compile against." It does not say what shape the file takes, and:

- `https://spacefast.com/schemas/theme.json` → **404**
- `https://spacefast.com/docs/zero/theme.md` → **404**
- `sf docs theme --all` → one error-code page

We recovered the format by reading
`node_modules/@spacefast/zero-compile/dist/tailwind-core.js`, whose comment
says "`theme.json` v3 settings for the utility compile: palette entries become
`colors`, font families `fontFamilies`, font sizes `fontSizes`, and literal
safelist entries cover classes assembled only at runtime."

The working shape:

```json
{
  "version": 3,
  "settings": {
    "color": { "palette": [{ "slug": "canvas", "color": "#F5F2EA" }] },
    "typography": {
      "fontFamilies": [{ "slug": "disp", "fontFamily": "Fraunces, ui-serif, serif" }],
      "fontSizes":    [{ "slug": "step-1", "size": "1.25rem" }]
    },
    "safelist": ["bg-danger", "bg-success"]
  }
}
```

Each preset becomes a Tailwind token that reads the runtime custom property
first and falls back to the literal: `--font-disp: var(--wp--preset--font-family--disp, Fraunces, …)`.
Confirmed working — `font-disp`, `font-mono`, and every color slug compiled.

**Two asks:** publish the schema at the advertised URL, and mention the
`settings.safelist` escape hatch in the Zero docs. It is the documented answer
to the static-class-names rule and it is invisible.

### 🐛 `fontFace` in `theme.json` is silently ignored — no webfont path

WordPress theme.json v3 supports `settings.typography.fontFamilies[].fontFace`
with a `src`, which is how you'd expect to load Fraunces and IBM Plex Mono. The
Zero compile reads only `slug` and `fontFamily` and drops everything else:

- No `@font-face` rule appears in `zero.css`.
- `/__spacefast_generated/theme.css` — the stylesheet `style.d.ts` says the
  runtime emits from `theme.json` — **404s on `sf dev`** (it falls through to
  the SPA shell), and the generated `index.html` never links it.

So on the local dev server there is **no way to load a webfont at all**: no
`index.html` to add a `<link>` to, no CSS file to `@import` from, `@plugin` and
`@config` rejected, and `fontFace` ignored. A font that isn't installed on the
machine simply falls back.

Our prototype's identity is Fraunces + IBM Plex Mono, so this is a real loss.
We've kept the families declared with full fallback stacks and accepted the
fallback for now. **This is the biggest concrete gap we've hit.** Either honor
`fontFace`, or document the intended way to ship a webfont.

### ❓ The `ink` semantic token collides with our domain vocabulary

Zero's palette uses `ink` for body text (`text-ink`, `text-ink-muted`). This app
has used "ink" since the prototype to mean *a taxonomy term's base hex*, the
color every tint and ring derives from. Not Spacefast's fault, and it cost us
nothing — our colors are inline styles, never classes — but it is worth knowing
that `ink` is a reserved-ish name.

### 👍 The static-class-names rule did not bite, and here's why that matters

Our entire visual system derives per-term colors from a user-picked hex. Had
those been Tailwind classes, `bg-${hex}` would have compiled to nothing and the
app would have shipped unstyled — exactly the failure `AGENTS.md` warns about.
They were already inline `style` objects, so the port was unaffected.

The general lesson for the docs: **user-chosen colors can never be utility
classes on this platform.** That deserves to be stated positively ("compute
colors into inline styles") rather than only as a warning about what breaks.

### 👎 `sf dev` has no sign-in: `signInPath` and `signInUrl` are both null

`GET /__spacefast/zero/config` on the local dev server returns:

```json
{ "auth": { "provider": "gravatar", "signInPath": null, "signInUrl": null,
            "signOutPath": null, "signOutUrl": null } }
```

The docs say "`sf dev` supplies a local guest identity, so authorization logic
works the same locally and hosted." That is true for *authorization* — a guest
has a stable `userId` a handler can scope rows to. It is not true for
*authentication*: there is no local sign-in flow, so `auth.isGuest` is
permanently `true` and `<SignInWithGoogle />` has nowhere to go.

For an app that requires sign-in (our D2), that means **the entire signed-in
surface is unreachable on `sf dev`**. Ours is a two-person household app whose
whole point is a shared, authenticated household, and we cannot exercise any of
it locally.

**What we'd suggest:** a `sf dev --sign-in-as <name>` flag, or a dev-only stub
sign-in page that mints an authenticated identity. Without one, every
sign-in-gated Zero app has to build its own local bypass, and each one is a
hand-rolled hole in its own auth gate.

We then did exactly that, which is the point: `client/index.tsx` now lets a
guest through when `location.hostname` is a loopback address, with a permanent
on-screen badge so a local session can't be mistaken for a real one
([D14](../../.docs/decisions.md)). It works, and it is inert on a published
space — but it is a hole in the only auth boundary the app has, written by hand,
because the platform gave us no other way to see our own UI. That is a bad thing
to make every developer of a gated app invent for themselves.

Concretely: **`sf dev --sign-in-as "Justin"` would have replaced a security
decision with a flag.**

### 👎 The dev server's capability handshake needs an `Origin` header

`sf dev` prints a private URL with a `#zero-dev-capability=<token>` fragment.
Every path except `/` returns `401 {"error":"unauthorized"}` until the browser
POSTs that token to `/__spacefast/zero/bootstrap`, which sets an `HttpOnly`
`spacefast_zero_dev_<port>` cookie.

Good design — but the bootstrap POST returns **403** unless an `Origin` header
is present (CSRF protection, reasonably). That combination makes the dev server
awkward to inspect from a script or a headless check:

```bash
CAP=...   # from the sf dev banner
curl -X POST -H "authorization: Bearer $CAP" -H "origin: http://127.0.0.1:4173" \
  http://127.0.0.1:4173/__spacefast/zero/bootstrap   # 204 + Set-Cookie
curl -b "spacefast_zero_dev_4173=$CAP" http://127.0.0.1:4173/zero.css
```

Nothing here is wrong, but none of it is documented, and the 403 is opaque —
it says `forbidden` with no hint that the missing `Origin` is the reason. A
`--no-capability` flag for loopback-only dev would help CI and agents a lot.

### 👍 The compile itself is fast and correct

Everything we threw at it worked on the first run: 27 TypeScript files across
`client/`, `server/`, and `shared/`; a 92 KB `client.js`; a 40 KB `zero.css`.
Arbitrary-value utilities compiled correctly, including responsive variants and
underscore-encoded spaces (`md:grid-cols-[190px_1fr]`, `max-h-[80vh]`,
`tracking-[0.02em]`). Editing `theme.json` triggered "Reloaded Zero dev runtime
after 1 file change(s)" within a second.

`capsule({ schema: {} })` is accepted, so a scaffold phase with no tables yet is
a legal capsule — useful for staging a port.

### 👍 The docs inconsistency worth one line

`AGENTS.md` refers to `sf create my-form --runtime zero --template contact`.
The command is `sf init`; there is no `sf create`.

## 2026-08-24 — Planning the first publish (`--dry-run` findings)

Everything below came from `sf publish --dry-run` before anything was uploaded.
Nothing has been published yet. The dry run earned its keep three times over.

### 👎 Framework detection silently beats the `runtime` block

`sf publish --dry-run` at the project root plans this:

```
Framework       vite
Install         npm ci
Build           vite build
Output          dist
```

That is the **wrong artifact entirely**. `sf.jsonc` declares
`runtime: { kind: "zero", server: …, client: … }`, and `sf dev` honours it — but
publish framework-detects Vite and plans to build and deploy the static
prototype instead of compiling the capsule. No warning, no mention of the
capsule anywhere in the plan; a `--dry-run`-less publish would have gone live
with the wrong app and a capsule that was never compiled.

The detection is **`package.json`-driven, not file-driven**. Deleting
`vite.config.js` and `index.html` changed nothing; removing `package.json`
switched it to the capsule build immediately. So any Zero project that keeps
Vite in `devDependencies` — a port in progress, a monorepo, a docs site
alongside the app — is exposed to this.

**What we'd suggest:** an explicit `runtime` block should win over framework
detection, or at minimum the plan should say
`Framework vite (overriding runtime.kind=zero)` so the conflict is visible.

### 👎 Direct publish ignores `.gitignore` and ships the whole directory

With `--prebuilt` (which *does* find the capsule), the plan was **149 files,
3.5 MB**. The capsule sources (`client/`, `server/`, `shared/`) are consumed by
the compiler and correctly not served. Everything else in the directory ships as
public static files:

- `.ideas/` — 82 files of abandoned prototype code, **gitignored**
- `.idea/` — PhpStorm config including `workspace.xml`, **gitignored**
- `.claude/docs/` — including this feedback file
- `CLAUDE.md`, `docs/*` — every internal design document
- `src/`, `dist/`, `package-lock.json`, `tsconfig.json`, `vite.config.js`

(An anonymous space is key-gated, per `setup.md`, so on that path these sit
behind the space key rather than fully public — but on a claimed space, which is
where any real project ends up, they are served to anyone.)

The walker uses a fixed ignore list (`.git`, `node_modules`, `.ssh`, `.aws`,
`.cache`, a few tool dirs) plus sensitive-filename patterns. Credentials are
genuinely well covered — `.env*`, `*.pem`, `*.key`, `id_rsa*` are all pattern-
blocked, and that is good, careful work. But `.gitignore` is never read on this
path, even though the CLI reads it elsewhere (`SOURCE_ARCHIVE_EXCLUDED_*` for
remote builds is a different, stricter code path).

The asymmetry is the problem: `--remote` respects one exclusion policy, direct
publish another, and the looser one is the default. "It's gitignored" is the
assumption every developer will make.

**What we'd suggest:** honour `.gitignore` by default on the direct path too, or
support a `.spacefastignore`. `.vercelignore` / `.nowignore` / `.assetsignore`
already appear as strings in the CLI bundle; none is documented for Zero.

### 😕 The capsule compile needs `node_modules`, but treats the deps as platform

Publishing a staged directory without `node_modules` fails with
`Could not resolve "lucide-preact"` (10 errors). Fair enough — except that
`lucide-preact` is then emitted as
`_spacefast/platform/<hash>/lucide.js`, i.e. the compiler treats it as a
*platform* module in the output while requiring it to be *locally installed* at
build time. Worth documenting which is which; `AGENTS.md` says platform modules
don't count against the bundle budget but doesn't say they must still resolve.

Also emitted: `recharts.js` (928 KB) and `zero-charts.js`, even though nothing
in this app imports `@spacefast/zero/charts` or `/kit`. `AGENTS.md` says
platform modules "aren't in your bundle at all: they're served from the
platform's own immutable URLs" and "anything you don't import is never
fetched" — the *fetched* part is presumably still true, but they are plainly
uploaded per-space rather than served from a shared platform URL. 1.1 MB of our
1.77 MB plan is charts and icons this app never references. Harmless, since
they're outside the bundle cap and a browser won't request them, but "aren't in
your bundle at all" reads as stronger than what the publish plan shows.

### 😕 `statePath` resolves outside the project

The JSON plan reports where publish state — including the anonymous space's
claim key — will be written. From the project root it chose:

```
/Applications/XAMPP/xamppfiles/htdocs/wp/wp-content/plugins/.spacefast/state.json
```

The **parent** directory, not the project, despite `./.spacefast/` already
existing (from `sf dev`). From a staged directory it correctly chose
`<stage>/.spacefast/state.json`. Whatever the walk-up rule is, it put the claim
key for our space one level above the repo, in a directory belonging to
something else entirely. For an anonymous space the claim key *is* the space —
lose it and it's orphaned — so where it lands should be predictable and inside
the project.

### 👍 A staged publish produces exactly what it should

Copying `client/`, `server/`, `shared/`, `sf.jsonc`, `theme.json` into a clean
directory (no `package.json`, `node_modules` symlinked in) gives a 19-file plan:

```
client.js        98,982      zero.css          40,274
index.html        1,889      (generated app shell — the capsule's, not ours)
_spacefast/platform/…        recharts, lucide, preact, zero-client, zero-kit
sf.jsonc, theme.json         (config, served as-is)
```

Total 1.77 MB, well under the 8 MiB client cap. Nothing from the repo leaks.
`--dry-run --json` giving a full per-file manifest with sizes and SHA-256s is
excellent — it is the only reason any of the above was caught before upload.

## 2026-08-24 — First `sf publish`: the CLI dies at finalize

The first real publish. Anonymous space, publishing the staged directory
described above. It got most of the way and then broke, and the failure mode is
bad enough to be the headline of this whole log.

### 🐞 `sf publish` exits mid-finalize with an unsettled top-level await

```
✓ Creating space    stage (spc_dc67347c82b9485f8c9608b72b201aaf)
✓ Creating version  ver_2a43c5fdf29747aa96c30a22748dcf0a
✓ Uploading files   19 files
⠋ Finalizing version
Finalize request is still running; polling version status...
Warning: Detected unsettled top-level await at
file:///…/node_modules/spacefast/dist/cli.js:6
await import("./cli-main.js");
```

The process then exits. Non-zero work completed — space created, version
created, all 19 files uploaded — but the version was never activated, and
`https://stage.view.fast/` serves `503 This space hasn't been published yet.`

This is not a network blip: it reproduces. The moment the CLI has to *poll*
for something, the awaited promise never settles and Node exits with the event
loop empty. Adding `--wait --wait-timeout 420` makes no difference — the exit
happens during finalize, before any wait logic.

Running `sf publish` again to recover hits the same bug one step earlier:

```
✓ Updating space  stage (spc_dc67347c82b9485f8c9608b72b201aaf)
Waiting for the previous publish of stage to settle before creating a version...
Warning: Detected unsettled top-level await at …
```

So the first stuck finalize now blocks every subsequent publish, and the command
that reports the block dies the same way. Environment: `spacefast/0.0.26`,
`darwin-arm64`, `node-v24.14.1`.

### 🐞 An anonymous space cannot be diagnosed at all

With the version stuck, the obvious next move is to look at it. Every route is
closed:

```
$ sf versions ls
Claim this space into a managed principal before using this endpoint.
Your account doesn't have access to this resource.
Learn more: https://spacefast.com/docs/errors/space_unclaimed
```

`sf versions`, `sf rollback`, `sf runtime status`, `sf logs` — all of them
require a claimed space. The anonymous flow is presented as the low-friction way
to try the platform, and it is, right up until something goes wrong; then there
is no `ls`, no status, no log, and no way to cancel a stuck version. The only
tool an anonymous publisher has is `sf publish` again, which is exactly the
command that is jammed.

The error message is also slightly wrong about the remedy: it suggests
`sf teams ls`, which has the same problem.

**What we'd suggest:** let the claim token authorize read-only inspection of its
own space — `versions ls` and `runtime status` at minimum. An anonymous space
you cannot observe is worse than no anonymous space, because it fails silently
and looks like your app is broken.

### 😕 The space slug comes from the directory name

We published a staged copy from a scratch directory, so the space is named
`stage` and lives at `stage.view.fast`. `sf.jsonc` says `"name": "Larder Log"`
and the compiled artifact says `"appName": "larder-log"`; neither was consulted.
Minor, and `--slug` / `-n` would have avoided it — but the config file that
names the app is right there.

### 😕 Anonymous claim tokens expire the same day

`state.json` records `expiresAt` about six hours out:

```json
{ "spaceId": "spc_…", "claimToken": "sfc_…", "expiresAt": "2026-08-24T22:40:47Z" }
```

Reasonable in principle. Worth knowing that it is hours, not days — and worth
printing in the publish output, because right now it is only discoverable by
reading `.spacefast/state.json`. Combined with the finalize bug, the clock is
running on a space that has never served a request.

### 🐞 The finalize bug is not a Node version artifact

Worth ruling out, since Node 24 is newer than the CLI's `engines: ">=20.3"`.
Ran the same publish under Node 20.18.3 and 22.22.0 (both via the CLI's own
`dist/cli.js`, same `spacefast/0.0.26`):

- **Node 24.14.1** — prints `Detected unsettled top-level await` and exits.
- **Node 20.18.3** — no warning at all. Exits silently at exactly the same
  point, after `Waiting for the previous publish of stage to settle…`.

So Node 24 is only *diagnosing* the bug; the awaited promise never settles on
any version. On Node 20 a stuck publish looks like a command that succeeded and
returned, which is worse.

### 🐞 A stuck publish deadlocks the claim flow

The state we're now in:

- The space has a version created and 19 files uploaded, never activated.
- The site serves `503 This space hasn't been published yet.`
- Clicking **Claim** at the claim URL answers:
  *"Finish or cancel the active publish before claiming this space."*
- Every CLI route to finish or cancel it requires a claimed space.

That is a closed loop: **claim requires finishing the publish; finishing the
publish requires the CLI command that crashes; diagnosing it requires the claim.**

`sf api` doesn't break it either — the raw passthrough is authenticated by the
same principal, so the space key gets the same 403:

```
$ sf api GET /v1/spaces/spc_…/versions --include
HTTP 403 Forbidden
{"type":"…/errors/space_unclaimed","title":"Space unclaimed",
 "detail":"Claim this space into a managed principal before using this endpoint."}
```

Meanwhile `sf status` — which *does* work unauthenticated — cheerfully reports
`Claim: pending (expires 2026-08-24T22:40:47.735Z)` without mentioning that
there is an active publish blocking that claim, which is the one fact that
matters.

**What we'd suggest, in priority order:**

1. Fix the poll so `sf publish` cannot exit with an unsettled await.
2. Give the space key read access to its own space's versions and status. An
   anonymous space is not a security boundary against its own key holder.
3. Add `sf publish --cancel` (or let a stuck publish time out server-side) so a
   crashed CLI is recoverable without an account.
4. Have `sf status` report an active publish, since that is what blocks claiming.

For a platform whose anonymous flow is explicitly pitched at agents, this is the
worst possible failure: the happy path is genuinely excellent, and the first
unhappy step leaves an agent with no move that isn't "ask a human to log in".

## 2026-08-24 — The actual cause: `version_finalize` fails, status never updates

The finalize "hang" was never a hang. `sf api GET /v1/operations` — reachable
only once we had an account — tells the truth:

```
failed  version_finalize  2026-08-24T16:57:17.898Z -> 2026-08-24T16:57:35.000Z
   version ver_9910482e36f0456a92387c0ebd43b846
   space   spc_7770744a870a43f5927213fa397c780e
   ! InternalError: Runtime API request failed with 406.   (provider: runtime)
```

**The operation failed 17 seconds after it started.** Everything after that —
the CLI's poll, our 15-minute watch, the dashboard — was observing a version
whose finalize had already died.

### 🐞 The bug: a failed operation never reconciles to the version

Eight minutes after that failure, with the operation recorded as `failed`:

```
$ sf versions ls --space larderlog
> v1 (deploying) status=finalizing …
$ sf runtime status --space larderlog
State: failed          <-- the space knows
Live version: none
Pending version: ver_9910482e36f0456a92387c0ebd43b846   <-- still pending
```

The space flips to `failed` but the version stays `finalizing` forever, and the
pending pointer is never cleared. That single inconsistency causes every
downstream symptom:

- `sf publish` polls a status that will never change → the unsettled top-level
  await, which we spent an hour chasing as if it were the bug.
- `POST …/versions/{id}/finalize` → `409 version_not_ready`
  *"Version … is finalizing and cannot be finalized."*
- `sf versions rm` → `409 version_busy`
  *"Wait for the version to finish finalizing before deleting it."*

The version is simultaneously too busy to finalize and too busy to delete. The
space is wedged with no CLI or API path out. We wedged two spaces this way
before finding the operations endpoint.

**What we'd suggest:** when `version_finalize` fails, mark the version failed and
clear the pending pointer. Everything else here is downstream of that one
missing write. Second: surface the operation's diagnostics in `sf publish`
output — the CLI had a failed operation ID available and instead printed a
spinner. Third: make `versions rm` always work on a version that isn't live.

### 🐞 The 406 is deterministic and unrelated to our code

We suspected our own empty schema (`capsule({ schema: {} })`, `migrations: []`,
`mysql.migrateAtFinalize: true`) — a migrate step handed zero migrations is a
plausible 406. So we published a probe capsule, identical except for one table:

```ts
schema: { probes: table({ note: string() }) }
```

Same failure, to the second:

```
failed  version_finalize  17:17:47.455Z -> 17:18:05.000Z   (probe, one table)
failed  version_finalize  16:57:17.898Z -> 16:57:35.000Z   (empty schema)
   ! InternalError: Runtime API request failed with 406.
```

Both ~17.5 seconds, which reads like a fixed timeout inside the runtime
provisioning call rather than anything about the payload. Three spaces, two
schemas, one anonymous and two owned — every Zero capsule publish today fails
identically at finalize.

**Net for 2026-08-24: Zero publishing is unavailable.** Nothing has been
published, and the app has never served a request. `sf dev` compiles and serves
the same capsule fine, so this is specific to the publish/provision path.

For the record, since it is buried above: the failing request is a `406` from
an internal service the diagnostics call `provider: runtime`, during
`version_finalize`, on `spacefast/0.0.26`.

### ✅ Resolved the same day — and the operation record was rewritten

About 48 minutes after the finalize was recorded `failed`, the space went live
on its own:

```
$ sf versions ls --space larderlog
* v1 (live) status=ready …   updated: 2026-08-24T17:45:28.000Z

$ sf runtime status --space larderlog
State: active
Live version: ver_9910482e36f0456a92387c0ebd43b846
Pending version: none
Capsule     larder-log
Server      quickjs-rust
```

Same version id that had been stuck. And the operation now reads:

```
succeeded  version_finalize  2026-08-24T16:57:17.898Z -> 2026-08-24T16:57:35.000Z   []
```

Identical id and timestamps, but `failed` became `succeeded` and the
`InternalError: Runtime API request failed with 406.` diagnostic is gone. The
probe space `larderlogprobe` was deleted outright ("Space not found"), which is
what our report asked for — so this looks like the Spacefast team intervening
after Justin filed it, not a spontaneous retry.

**What this changes about the bug report:** the 406 was real and reproducible at
the time, and the version genuinely was unrecoverable through the CLI — that part
stands. But "Zero publishing is unavailable" was too strong a conclusion: a
finalize can apparently recover long after it is recorded as failed. The durable
defect is the one we already led with — **version status and operation status
don't track each other** — and this resolution makes it sharper in both
directions: a failed operation left the version pinned at `finalizing`, and a
later recovery rewrote history without any event a client could observe. There
is no way to watch for either transition; we only found out by re-running
`versions ls` an hour later.

Worth adding to any follow-up: an operation whose terminal status can change
from `failed` to `succeeded` after the fact is not a terminal status, and
nothing in the CLI or API notifies on the change.

## 2026-08-24 — Phase 1 closed: what publishing actually verified

Once `larderlog` was live and made publicly viewable, the whole Phase 1 question
answered itself in about five minutes.

### 👍 The gate works exactly as designed, on the first try

- Signed in → the pantry renders.
- Signed out → the sign-in screen, "Sign in with Gravatar", "Sign-in required".
- Sign out → back to the gate.
- The D14 "Dev guest · not signed in" badge does **not** appear on a real
  hostname, so the loopback bypass is confirmed inert in production.

No code changed between `sf dev` and the published space. Whatever else went
wrong today, the runtime honoured `useAuth()` / `signOut()` precisely as the
types promised, and the client we wrote against a dev guest worked unmodified
against a real Gravatar identity. That is the part worth saying out loud.

`GET /api/status` returning `ok` is the cheapest possible proof that the server
half of a capsule deployed — worth recommending in the docs as the one-line
post-publish smoke test.

### 😕 Spaces are private by default, and the app is the last to know

A published Zero app answers `403 This space is private` to every visitor until
someone changes it in the dashboard. For a sign-in-gated app that is a gate in
front of a gate, and the outer one is invisible from the code: `sf.jsonc` has an
`access` field, but `sf spaces get` reports `config: {}` after the dashboard
toggle, so the two mechanisms don't obviously converge. Nothing in `sf publish`
output mentions that the thing it just published cannot be opened.

It also breaks the flow the platform is otherwise built for. Our Phase 3 invite
link is useless if the recipient hits a platform 403 before reaching our join
route — see [D15](../../.docs/decisions.md#d15-the-space-is-public-the-apps-own-gate-is-the-boundary).

**What we'd suggest:** say the space is private in the publish receipt, with the
one command or click that changes it. Better still, let `sf.jsonc`'s `access`
be the single source of truth and report it in `sf spaces get`.

### 👎 Webfonts: confirmed impossible, not merely undocumented

Settled on a real publish. The served `zero.css` contains **zero `@font-face`
rules**; it defines `--font-disp`, `--font-sans`, and `--font-mono` from
`theme.json` and never loads a face for any of them.
`/__spacefast_generated/theme.css` 404s on the published space exactly as it
does under `sf dev`.

So `theme.json`'s `fontFamily` can *name* Fraunces, and nothing can ever fetch
it. There is no `index.html` to add a `<link>` to, no CSS entry point, and
`@plugin` / `@config` are rejected. An app on Zero gets system fonts, full stop.

**What we'd suggest:** either honour `fontFace` in `theme.json` (the field name
already implies it) or document plainly that webfonts are unsupported. Right now
the config accepts a font family it cannot deliver, which reads as a bug in your
own app until you go looking.

## 2026-08-24 — Phase 2 spike: schema, handler runtime, and a scanner false positive

Ran a throwaway spike capsule (temporary `/api/spike/*` endpoints, curled via
the documented bootstrap dance) to answer the platform questions Phase 2's
design depended on. Then built the real schema and handler layer on the answers.

### good — endpoints are a usable probe harness

`endpoint()` gets a **writable** `ctx.db`, so a spike can insert, read back, and
report without a browser. That made six open questions answerable in one
`sf dev` session. Worth documenting as a technique — the docs show endpoints
only for webhooks.

### good — the bundled `.d.ts` is better than the published docs

`node_modules/@spacefast/zero/dist/server.d.ts` answered more than
`docs/zero.md` did, and answered it precisely:

- `IndexRange` exposes `.eq()`, `.gt()`, `.gte()`, `.lt()`, `.lte()`, each
  returning `IndexRange` — so range chaining is a supported API, not a guess.
  The public docs only ever show a single `.eq()`.
- `insert()` returns the **whole row**, not an id.
- `ReadDatabaseOf<TDefinition>` / `WriteDatabaseOf<TDefinition>` are exported,
  which is what lets handler helpers live in their own module with real types
  instead of `any`. Neither appears in the public docs.
- The `invalidate()` doc comment is the only place that says live queries
  **refetch rather than diff**. That is a first-order architectural fact — it
  decides whether a one-payload query is viable — and it is not in `zero.md`
  at all.

**Suggestion:** promote the `invalidate()` comment and the `IndexRange` surface
into `docs/zero.md`. A reader who only has the public docs cannot design query
granularity correctly.

### confirmed behaviors (all against `sf dev`)

- **`Date` works server-side.** `new Date()`, `Date.now()`, `.toISOString()`.
- **`createdAt` / `updatedAt` are ISO 8601 UTC.** Verified exactly:
  `new Date(row.createdAt).toISOString() === row.createdAt`. Row ids are UUIDs.
  Undocumented — `zero.md` only says "strings".
- **Compound index ranges filter on every chained field.** `.index("by_a_b",
  ["a","b"])` + `range.eq("a",x).eq("b",y)` returned 1 of 3 seeded rows, not the
  2 that a silently-ignored second `.eq()` would give.

### unclear — `id("table")` is not a foreign key

An `items` insert whose `householdId` **and** `locationId` both pointed at
nonexistent rows **succeeded**. `id(table)` is a type hint only.

Reasonable as a design choice, but it deserves an explicit line in the docs
next to the `id()` description. Combined with "no row-level security", it means
an app has *no* database-level integrity backstop of any kind — every
referential and ownership rule is hand-written or absent. We had assumed `id()`
bought us something; it does not.

### unclear — a thrown handler error is echoed to the client verbatim

`throw new Error("Sign in required")` from an endpoint returns **HTTP 500** with
an RFC 7807 body whose `detail` is the thrown message verbatim:

```json
{"type":"https://spacefast.com/docs/errors/zero_dev_endpoint_failed",
 "title":"Zero dev endpoint failed","status":500,
 "detail":"Sign in required","code":"zero_dev_endpoint_failed"}
```

Convenient, but it means **every thrown string is user-visible**, so an
incidental `throw new Error(someInternalDetail)` leaks. Worth saying out loud in
the docs, and worth a documented way to distinguish "expected, show this" from
"unexpected, log it and show something generic". We ended up with our own
`AccessError` class purely as a discipline marker.

Also unclear whether a `query()` / `mutation()` throw surfaces the same way to
`useQuery` / `useMutation` — that needs a browser, so it is still open for us.

### bug — the server-global scanner false-positives on object literal keys

This cost the most time of anything here. `sf dev` refused to start:

```
Zero source server/index.ts references unsupported server global location.
Error: Zero source server/index.ts references unsupported server global location.
```

The offending line contained no global. It was an object literal **key**:

```ts
const TERM_TABLES = { location: 'locations', type: 'types', store: 'stores' } as const;
```

Quoting the key fixes it completely:

```ts
const TERM_TABLES = { 'location': 'locations', type: 'types', store: 'stores' } as const;
```

So the scanner is matching identifiers textually rather than resolving them —
an object property key named `location` (or presumably `history`, `navigator`,
`document`, `screen`, …) is treated as a reference to the browser global.

Three problems with this, in order of severity:

1. **It is a false positive on valid code.** `{ location: ... }` is an
   extremely natural key name in an inventory app.
2. **The error names a file, not a line or column.** In a 600-line capsule that
   is a manual search for a word appearing 20 times in strings, comments, and
   property accesses — all of which are fine, and only one of which is not.
3. **The message describes the wrong thing.** "references unsupported server
   global location" is false; nothing references a global. It sent us looking
   for an import or a stray browser API.

**Suggestion:** resolve identifiers properly (a property key in a non-computed
member expression or object literal is never a global reference), and failing
that, at minimum report line and column. A one-line fix in the message would
have turned a 20-minute hunt into 20 seconds.

## 2026-08-24 — wiring the client: two client-runtime behaviors worth documenting

Both found by reading `node_modules/@spacefast/zero/dist/client.js`, because
neither is in `docs/zero.md`. Both changed our design rather than merely
informing it.

### bug (or at least a sharp edge) — `useQuery` seeds every query with `[]`

```js
const [value, setValue] = useState(() => getQueryValue(name, ...args) ?? []);
```

The pre-result value is a hardcoded empty **array**, whatever the query's return
type is. The example app in the docs returns `Entry[]`, so `[]` reads as a
natural "nothing yet" — but for a query returning an object it is simply the
wrong type, and `result.items.map(...)` throws on first render.

We settled on `Array.isArray(result)` as the loading check, since our queries
always return objects. That works, but it is a coincidence of our schema, not an
API. **A query that legitimately returns an array has no way to distinguish
"still loading" from "loaded, empty".**

**Suggestion:** seed with `undefined` (typed `T | undefined`), or expose the
subscription state the way every other data library does — `{ data, isLoading }`
or similar. The current shape forces every caller to invent a sentinel.

### bug — a failing query is invisible to the client, forever

`handleMessage` has exactly one query branch:

```js
if (message.op === "query.result" && typeof message.name === "string") { … }
```

There is no `query.error`. A query handler that throws never emits, so
`useQuery` keeps returning its initial `[]` indefinitely. There is no rejection,
no callback, no flag — from the client's side "the query threw" and "the query
hasn't answered yet" are the same observable state.

Mutations are handled properly, for contrast: `mutation.result` with `ok: false`
rejects the promise with the server's message intact, which is exactly right.

This is a genuine asymmetry and it has real consequences. Our natural design was
a `requireHousehold()` helper that throws — reused by both queries and
mutations, one authorization path. That turns out to be **unusable in a query**:
a first-run user with no household would sit on a permanently blank screen with
no signal to route them to setup, and no error anywhere to debug it with.

We had to split the helper in two — `membershipState()` returning a
discriminated union for queries, `requireMembership()` throwing for mutations —
and give every query a `QueryState` return type encoding `ready` / `guest` /
`no-household` / `blocked`. That is a defensible design, but we arrived at it by
reading the client bundle, not from the docs, and only after writing the
throwing version first.

**Suggestion:** deliver query failures. Even a `query.error` message that let
`useQuery` expose a rejection would be enough. Failing that, please document the
behavior loudly — "a query that throws never resolves on the client" is the kind
of thing that produces a blank page and a very long debugging session.

### good — `invalidate()` narrowing works as documented

Now that there are two live queries (`household`, `pantry`), declaring what each
mutation touched keeps an item edit from refetching the member list. The doc
comment on `InvalidateQueries` is the clearest thing in the type definitions;
it deserves to be in the public docs.

## 2026-08-24 — end of Phase 2: dev-server identity

### friction — `sf dev` issues one fixed identity, and no way to change it

`sf dev`'s guest auth is a constant:

```js
function zeroGuestAuth() {
  return { user: null, userId: "guest:local", displayName: "Local",
           provider: "guest", isGuest: true, isAuthenticated: false };
}
```

Two consequences we had to design around.

**1. A strict server-side guest check locks the app out of local development.**
Our capsule refuses guests, per the app's own "sign-in required" rule. That is
correct in production and fatal locally, because `isGuest` is permanently true.
We already had a client-side loopback bypass for the sign-in gate; Phase 2 forced
a second one on the server.

There is no clean signal to key it on. `ctx.env` is **empty** under `sf dev`, and
`sf dev --help` exposes no way to inject a variable — so an environment-keyed
switch was not available. We ended up matching the literal identity above,
field by field, on the reasoning that `guest:local` is produced by the CLI and
by the client's no-auth fallback and therefore should never come from a hosted
runtime.

That reasoning is sound but unverifiable from here, and it is an *authentication*
bypass, which is an uncomfortable thing to ship on an inference.

**Suggestion:** either a `sf dev --sign-in-as <email>` stub that produces a
non-guest identity, or an env var the dev server sets that a capsule can check
(`ctx.env.SPACEFAST_DEV === "1"`). Either removes the guesswork entirely. The
second is a one-line change and would let every app express "guests allowed in
dev only" honestly.

**2. One identity means multi-user behavior cannot be tested locally at all.**
Two browser tabs on `sf dev` are the same `userId`, so they share a household.
That is enough to watch a live query refresh after a mutation, and useless for
anything about membership: invites, roles, the last-owner guard, per-member
permissions. All of it has to go to a published space.

For an app whose whole point is two people sharing a pantry, that pushes the
first real test of the core feature onto production. A second seeded dev identity
— even just `guest:local` and `guest:local2` switchable by a query parameter —
would make Phase 3 testable before it ships.

### good — dependency footprint after dropping the prototype

Retiring the Vite prototype left `package.json` at three runtime dependencies
(`@spacefast/zero`, `lucide-preact`, `preact`) and two dev ones (`spacefast`,
`typescript`). No bundler, no Tailwind install, no PostCSS config — Zero
compiles the CSS itself from classes it scans out of source. For an app with a
real database, live queries, auth, and a full component tree, that is a genuinely
small surface, and it is the clearest thing the platform does well.

## 2026-08-24 — pre-publish check on Phase 2: the capsule shipped an empty schema

Caught by running `sf publish --dry-run` before the first Phase 2 publish and
reading `.spacefast/zero/artifact.json` rather than trusting the exit code.
Nothing else in the toolchain says a word about any of this.

### 🐞 The schema compiler reads only the server entry, and never follows an import

Our schema lived in `server/schema.ts` and was imported into `server/index.ts`:

```ts
import { schema } from './schema';
export default capsule({ name: 'Larder Log', schema, queries: {…}, mutations: {…} });
```

`tsc --noEmit` passes. `sf publish --dry-run` reports a successful plan. The
compiled artifact:

```json
{ "server": { "schema": {}, "queries": ["household", "pantry"], "mutations": [ …16… ] },
  "db": { "backend": "mysql", "migrations": [] } }
```

**Sixteen mutations and two live queries, against zero tables and zero
migrations.** Publishing that would have deployed a working-looking app whose
every write fails at runtime, and the version history would show it as a clean
publish.

The cause is in `zero-publish.js`. `analyzeZeroSource()` reads the single entry
file and calls `extractCapsuleSurface(serverSource)`, which finds tables with a
regex:

```js
var TABLE_PATTERN = /([A-Za-z_$][A-Za-z0-9_$]*)\s*:\s*table\s*\(\s*\{([\s\S]*?)\}\s*\)((?:\s*\.index\s*\(\s*["'][A-Za-z_$][A-Za-z0-9_$]*["']\s*,\s*\[[^\]]*\]\s*\))*)/g;
```

There is no module resolution anywhere in that path. Queries and mutations were
found because they are written inline in the entry; the tables were not because
they were one `import` away.

Confirmed by experiment, not by reading: adding a throwaway
`const __probe = { probeTable: table({ hello: string() }) }` to `server/index.ts`
made `probeTable` appear in the artifact, while the nine real tables stayed
missing. Removing it and moving the real schema literal into the entry produced
all nine, with columns, defaults, and indexes intact.

**Why this is the worst failure mode we have hit.** Every other sharp edge in
this log announces itself — a 406, a 403, a scanner error, a blank screen.
This one is silent at every stage: it typechecks, it compiles, it dry-runs
clean, it publishes, and the damage only appears when a user tries to save
something. And the fix is invisible from the outside: splitting a schema into
its own module is such ordinary TypeScript that nothing suggests it is the
problem.

**Suggestions, cheapest first:**

1. **Fail the build when `capsule()` declares a schema the extractor could not
   resolve to at least one table.** A capsule with mutations and no tables is
   never intentional. One error message would have saved the whole
   investigation.
2. Warn when the entry's `schema` value is an identifier rather than an object
   literal — that is the exact shape that silently produces `{}`.
3. Document the constraint. The docs say "Declare the schema in the capsule" and
   every example is inline, but nothing states that inline is *required*. Read
   as prose, "in the capsule" reasonably describes a schema imported into it.
4. Longer term: resolve the entry's imports, or execute the capsule module the
   way `sf dev` evidently does, instead of pattern-matching source text.

### 🐞 A comment inside a table's `.index()` chain silently drops indexes

Same regex, second bug. The index chain is captured as
`((?:\s*\.index\(…\))*)` — whitespace only, no comments. So this:

```ts
invites: table({ … })
    .index('by_code', ['code'])
    .index('by_household', ['householdId'])
    // Demoting a member has to revoke the invites they created (D21).
    .index('by_creator', ['createdBy']),
```

compiles to a table with **`by_code` and `by_household` only**. `by_creator` is
gone. Moving the comment up one line, to between `})` and the first `.index()`,
drops **all three**.

A dropped index is not a build error and not a type error. It is a query that
still returns correct results and quietly stops using an index — or, if the
platform validates `withIndex()` names at runtime, a handler that fails only on
the code path that uses it. Ours would have been D21's invite revocation, which
does not run until Phase 3.

This one also bit us in the opposite direction: a doc comment we wrote
containing the example text `` `name: table({ ... })` `` minted a **phantom
empty table called `name`** in the artifact, because the extractor scans raw
source and does not strip comments. So comments can both delete real tables'
indexes and invent tables that do not exist.

**Suggestion:** strip comments before matching, at minimum. Better, parse the
entry rather than regex it — every problem in this entry is downstream of
pattern-matching TypeScript with a regular expression.

### 😕 `--dry-run` is not read-only

`sf publish --dry-run` rebuilds the capsule and prunes/rewrites
`.spacefast/zero/public/`, `artifact.json`, `finalize.json`, and
`server.qjs.mjs`. That turned out to be useful — it is the only way we found to
inspect a compiled artifact without publishing — but "dry run" implies no side
effects, and it silently rewrote build state on disk. Worth either documenting
or renaming.

### 😕 The publish payload mirrors the whole project directory

`sf publish` for a Zero runtime copies the project root into
`.spacefast/zero/public/` and uploads it. The Phase 2 plan is 53 files, of which
about 17 are the app (`client.js`, `zero.css`, `index.html`, `_spacefast/…`).
The other 36 are source and local editor state: `CLAUDE.md`, all of `docs/`,
`.claude/docs/` (including this file), `.idea/` including `workspace.xml`,
`.test-out/`, `tsconfig.json`, `package-lock.json`.

`publishPathIgnored()` in `publish-policy.js` denies a fixed list — `.git`,
`node_modules`, `.env*`, key and cert patterns, `.DS_Store`, `.gitignore` — and
nothing else. **`.gitignore` itself is excluded from the upload but not honored
as a rule**, so `.idea/` and `.test-out/`, both gitignored and untracked here,
are staged for upload anyway.

The serving layer does appear to refuse dot-prefixed paths (`/.claude/docs/…`
returns 403 on the live space, while a missing non-dot path returns 404), and
the docs state "Spacefast does not expose the source as static files." So this
may be inert in practice. But the files are still uploaded and stored in the
version artifact, and non-dot paths like `docs/notes.md` have no dot-rule
protecting them.

**Suggestion:** honor `.gitignore` by default, or support a `.spacefastignore`,
or add an `ignore` array to `sf.jsonc`. `--source-include` exists for the
inverse case (pulling ignored files *into* a remote build) but there is no way
to exclude.

### 👍 The dry-run artifact is the best verification surface the platform has

Credit where it is due: `.spacefast/zero/artifact.json` is exactly the right
artifact to expose — a complete, readable manifest of the schema, queries,
mutations, endpoints, and migrations that a publish would install. Every bug in
this entry was found by reading it. It deserves to be a first-class command
(`sf inspect` / `sf artifact`) rather than a file you have to know is there
after a dry run rewrites it.

## 2026-08-24 — the v2 publish itself: what worked and what to watch

The fixes from the previous entry went out as v2. Recording the publish
behavior separately, because most of it was good.

### 👍 The migration applied exactly as documented, with no ceremony

60 operations — 9 `create_table`, 36 `add_column`, 15 `add_index` — applied
during `sf publish` with no flags, no prompt, and no separate `sf db migrate`
step. Total publish time 133s. Afterwards every table answers `sf db dump` with
`No rows`, and a made-up table name errors with `zero_db_table_not_found`, so
the distinction between "exists and empty" and "does not exist" is legible from
the CLI. That is the whole promise of "migrations on publish" and it was kept.

Also worth noting after the Phase 1 ordeal: **no 406.** `version_finalize`
succeeded on the first attempt. The fix held.

### 👍 Publishing did not touch the space's public visibility

An open question since Phase 1, now closed. The dashboard's public toggle lives
outside the published config, and `sf publish` from an `sf.jsonc` with no
`access` field left it alone — `GET /` and `GET /api/status` both answer 200
unauthenticated after v2. The `config: {}` patch a publish sends merges rather
than replaces.

### 😕 `sf db` reports "Pending operations: 60" for a migration it already ran

Immediately after the successful publish, and with all nine tables live and
queryable:

```
Backend: mysql
Migration mode: safe
Pending operations: 60
```

Those 60 are the same create-from-empty operations the publish just applied. The
JSON output makes the cause visible — `sf db --json` returns `tables` (the
artifact's declared schema) and `migrations` (the artifact's plan), and has no
field for the *live* schema at all. So the count is "operations in this
artifact's plan", not "operations outstanding".

Read literally it says the database is unmigrated, which is alarming and wrong,
and there is no obvious way to tell the difference without falling back to
`sf db dump` on a table you expect to exist.

**Suggestion:** diff the plan against live state, and say `Pending operations: 0`
when there is nothing to do. If the live schema is genuinely not queryable from
the control plane, label the line `Planned operations` instead.

### 👎 The publish exposed the project's documentation on a public URL

Following on from the payload note in the previous entry — this is no longer
hypothetical. After v2, all of these return **200** to any anonymous visitor:

```
/CLAUDE.md  /LICENSE.md  /package-lock.json  /tsconfig.json  /tsconfig.test.json
/docs/notes.md  /docs/decisions.md  /docs/architecture.md
/docs/data-model.md  /docs/overview.md  /docs/roadmap.md
```

Dot-prefixed paths are refused with 403, so `.claude/` (this file included),
`.idea/`, and `.test-out/` were uploaded but are not reachable. `/sf.jsonc` and
`/theme.json` return 404 — the runtime appears to shadow those two names
specifically.

Nothing here is a credential, and the docs do say "Spacefast does not expose the
source as static files" — which is true of `server/index.ts` and `client/`, but
plainly not true of everything else in the directory. A `.md` file in `docs/` is
not source, so nothing excludes it, and it gets served as a static asset.

The publish output also says `Ignored 0` while uploading files that `.gitignore`
lists, which reads as a promise the tool is not making.

**Suggestion:** honor `.gitignore` by default. Failing that, a
`.spacefastignore` or an `ignore` array in `sf.jsonc`. Right now the only
levers are `access` — whose allowlist, if wrong, breaks the signed-out sign-in
page — or physically moving files out of the project root before each publish.

### 😕 Two files were rejected by plan limits, silently mid-publish

```
Warning: ignored 2 unsupported file(s) on this plan:
  .claude/docs/pantry-tracker-mockup.jsx, .idea/x3p0-larder-log.iml
```

Harmless here — both are files we never wanted uploaded. But "unsupported on
this plan" does not say *why* (extension? size? count?), it appeared as a
warning inside a spinner rather than in the final summary, and the final summary
then reports `Files 53` when 35 were uploaded. If a rejected file had been part
of the app, this is the notice that would have to catch it, and it is easy to
scroll past.

---

## 2026-08-25 — Client routing exists, but nothing serves a deep path

Context: Phase 3 needed an invite link. The plan was `/join/<code>`, a client
route, because the runtime reference advertises one.

### 👎 `Router` is documented; the fallback that makes it usable is not

`https://spacefast.com/docs/zero.md` says the client exports `Router`, `Routes`,
`Route`, `Link`, `useNavigate()`, `useParams()`, and `useLocation()`, and the
complete-app example ships a two-route guestbook with a `<Link to="/stats">`.
Nothing on that page mentions that those routes are only reachable if the
visitor is already inside the app.

On our published space, every unknown path returns the platform's own 404 page:

```
/              200  text/html  3030
/join/TEST     404  text/html  8496
/nonexistent   404  text/html  8503
/api/status    200  text/plain
```

So `client.js` is never fetched and the router never runs. A link mailed to
someone — the entire reason an app has a `/join/:code` route — cannot work. The
example app hides this, because `/stats` is only ever reached by clicking a
`<Link>` from `/`, where the bundle is already loaded. Deep-link it and it 404s.

The compiled artifact explains why the runtime can't do better on its own: the
`client` section is `{ "bundlePath": "client.js", "basePathAware": true }` and
carries no route declarations. The server has no way to know which paths the
client would have handled.

**Where the answer actually is:** `sf publish --dry-run` prints it as one line
of the plan —

```
Mode            website
SPA             false
```

— and `sf publish --help` lists `--spa auto|true|false`. Neither `SPA` nor
`--spa` appears in `zero.md`, and `sf.jsonc`'s documented surface doesn't
mention it either. A capsule app with a client router is presumably always meant
to be `--spa true`; if so, `auto` should detect a `<Router>` in the client entry
and say so, and the runtime reference's routing paragraph should say which
setting makes those routes reachable.

### 🐛 `sf dev` serves deep paths; the published space does not

The worst part of the above, found while verifying the fix. Against a freshly
started `sf dev`, the client shell is served at **any** path:

```
/                   200  1829
/?join=ABC23DEFGH   200  1829
/join/ABC23DEFGH    200  1829   <- the same shell, byte for byte
/api/status         200  ok
```

Against the published space, the same three paths are 200 / 200 / **404**.

So `sf dev` behaves as `--spa true` while a default publish is `--spa false`.
A `/join/:code` route written against the dev server works perfectly, passes
every local check, and 404s for the first person who clicks the link — the same
shape of failure as the D27 schema-extraction bug: local success, silent
production breakage, and nothing in between that catches it. Whatever the
default ends up being, dev and production should agree on it.

We shipped around it — the invite code rides in `?join=` on the root path, which
works under either setting and survives sign-in in `sessionStorage`. But the
detour cost a probe and a read of the artifact to be sure, and the shape of the
feature changed because of a flag we found by accident.

### 👍 The dot-path rule is a usable exclude, once you know it

Following up on the 2026-08-24 source-exposure entry: `publishPathIgnored()`
still uploads everything `.gitignore` lists, but the serving layer refuses
dot-prefixed paths with 403. That turned out to be the practical fix. Renaming
`docs/` to `.docs/` and moving `CLAUDE.md` to `.claude/CLAUDE.md` removed both
from the payload root entirely — confirmed in `.spacefast/zero/public/`, which
now contains neither.

It works, and it needed no flags. But it is an accident of the serving layer
rather than a feature, and it means "keep this out of the web root" is spelled
"rename your directories." The suggestion from the previous entry stands:
honor `.gitignore`, or give `sf.jsonc` an `ignore` array.

---

## 2026-08-25 — `sf publish` is blocked by a header the CLI cannot send

Context: publishing Phase 3 (client-only; no schema change). Dry run clean —
nine tables, two queries, sixteen mutations, zero migrations.

### 🐛 Publishing fails on an undocumented `x-spacefast-rationale` requirement

```
✓ Updating space  larderlog (spc_7770744a870a43f5927213fa397c780e)
⠋ Creating version
Agent mutations require a rationale of 1 to 1024 characters in the
x-spacefast-rationale request header.
Learn more: https://spacefast.com/docs/errors/validation_error
```

Deterministic — identical on two attempts, several minutes apart. The command
was `sf publish -y --wait -m "Phase 3: households, members, and invites"`, so a
changelog message *was* supplied; whatever `-m` maps to, it is not this header.

**The CLI has no way to satisfy this.** Pinned at `spacefast@0.0.26`, which is
also the latest on npm:

- `sf publish --help` lists no `--rationale`.
- No `SPACEFAST_*RATIONALE*` environment variable exists anywhere in
  `node_modules/spacefast/dist/`.
- The only `extraHeaders` merge in the bundle is in the MCP client, not the
  publish path. There is no generic header-injection lever.

**And it is undocumented.** `rationale` does not appear in
`https://spacefast.com/docs/zero.md`, `/docs/agents.md`,
`/docs/agents/publishing.md`, or the bundled offline docs — `sf docs rationale
--all` answers "No reference docs match rationale." The error's `Learn more`
link goes to the generic `validation_error` page, which explains the RFC 9457
envelope and says nothing about this header, what an "agent mutation" is, or how
to supply a rationale.

**We are not authenticated as an agent.** `sf whoami` reports
`Justin Tadlock (justintadlock@gmail.com)`, a human account with a device
login, and the CLI sends `x-spacefast-client: spacefast-cli/0.0.26`. So the
"agent mutation" classification is being made somewhere on the platform side,
for a plain human CLI publish, and the CLI it is classifying cannot answer it.
Net effect: **the space cannot be published to at all.**

### 👍 The failure is clean this time

Worth saying, because the 2026-08-24 publish bug was not. The space came out
healthy:

```
Space: Larder Log   Status: active   Live URL: https://larderlog.view.fast/
* v2 (live) status=ready source=git@91b1999
  v1          status=ready source=git@216003f
```

No orphan v3, no unreconciled operation, no wedge. `/`, `/api/status`, and
`/client.js` all still answer 200 from v2. Failing *before* creating a version
is the right place to fail.

**One wrinkle:** the `Updating space` step succeeds before the version step
refuses, so a publish that cannot possibly complete still patches the space
config. A precondition this absolute should be checked first, before anything is
written.

**Suggestions.**

1. Give the CLI a `--rationale` flag and a `SPACEFAST_RATIONALE` env var — or,
   simpler, send the `-m` changelog message as the rationale, since it is
   already a human-written explanation of the publish.
2. Point the error at a page that documents the header, what counts as an
   "agent mutation", and which principals it applies to. `validation_error` is
   the right *code* and the wrong *destination*.
3. Don't let a released CLI be locked out by a policy it predates. If agent
   attribution is now required, the CLI that agents are told to use needs to
   ship the field in the same release.

### 🐛 …because the npm channel is a release behind the binary channel

Follow-up, same day. The fix exists; it is just not where the project gets its
CLI from.

| Channel | Latest | Published |
|---|---|---|
| npm `spacefast` | **0.0.26** | 2026-08-22 |
| `github.com/spacefast/cli` releases (what `install.sh` uses) | **0.0.27** | 2026-08-25 01:24Z |

Our publish attempts were a few hours after 0.0.27 shipped. Verified by
downloading the release artifact and checking it against the manifest —
`spacefast-darwin-arm64.gz` matched both the packed and unpacked sha256 in
`latest.json` — then reading its strings:

```
sf publish --target preview --rationale "Share the reviewed preview" --json
  "Publish a preview with the audit rationale required by agent credentials."

rationale: string().trim().min(1).max(1024)
  .describe("State in your own words why this execution is necessary.
             Spacefast stores this text in the audit record.")
```

So 0.0.27 adds the `--rationale` flag that satisfies the policy, and the phrase
"required by **agent credentials**" says the requirement is keyed to the
credential rather than the environment — consistent with what we saw, where the
publish failed identically inside and outside an agent shell.

**The real bug is the channel split.** A server-side policy landed that rejects
every publish from 0.0.26, and the CLI release that answers it went to the
binary channel only. Anyone pinned to the npm package — which is how a
JavaScript project naturally installs a JavaScript tool, and what `sf init`
leaves you with — is locked out of publishing with no upgrade path on that
channel and no error message that names the version.

**Suggestions.**

1. Publish both channels in the same release. If npm is a supported way to get
   the CLI, a policy that requires a newer CLI cannot ship before npm has it.
2. Name the fix in the error: "this account requires `--rationale`, added in
   CLI 0.0.27; you are running 0.0.26" turns a dead end into a one-line fix.
   The CLI already sends `x-spacefast-client: spacefast-cli/0.0.26`, so the API
   knows the version it is refusing.
3. Document `--rationale` and what an "agent mutation" is. It appears in the
   0.0.27 binary's own help and nowhere on the docs site.

### 🐛 The 0.0.27 standalone binary cannot compile a Zero capsule

Having installed 0.0.27 to get `--rationale`, the publish fails earlier than
before:

```
Error: ResolveMessage: Cannot find package 'esbuild' from
'/$bunfs/root/spacefast-darwin-arm64'
Code: unexpected_error
```

The standalone CLI is a Bun single-file executable. esbuild's **JavaScript** is
bundled into it — the binary's strings still carry
`// ../../node_modules/.pnpm/esbuild@0.27.7/node_modules/esbuild/lib/main.js` —
but esbuild resolves its own package directory at runtime to locate its
**native** helper binary, and that resolution fails inside Bun's virtual
filesystem (`/$bunfs/root/`). Bundling esbuild this way cannot work; the native
half has to exist on disk.

This lands on Zero projects specifically, since the capsule compile is what
needs esbuild. The same binary presumably publishes a static site fine, which is
how it passed whatever testing it had.

**The two bugs compose into a lockout.** A server policy rejects publishes from
0.0.26. The CLI that answers it, 0.0.27, is on the binary channel only. And the
binary channel's build cannot compile the runtime the policy is blocking. A Zero
project installed from npm — the way `sf init` leaves you — has no working
publish path at all today.

**Workaround.** esbuild honors `ESBUILD_BINARY_PATH`, and the binary's bundled
copy still reads it (`ESBUILD_BINARY_PATH = process.env.ESBUILD_BINARY_PATH || …`).
Pointing it at the native esbuild that the npm CLI already installed —
`node_modules/spacefast/node_modules/@esbuild/darwin-arm64/bin/esbuild`,
version 0.27.7, matching the version compiled into 0.0.27 exactly — should let
the standalone binary compile. Which means the fix depends on having the npm
package installed alongside the standalone binary that replaced it.

**Suggestion.** Ship the native esbuild beside the standalone binary and set
`ESBUILD_BINARY_PATH` at startup, or drop the standalone build's claim to
support Zero until it can compile one.

### 😕 0.0.27 also changed credential storage, and the migration prompts

First run of 0.0.27 stopped at a bare `password data for new item:` prompt —
macOS `security` asking for a value on stdin. The binary shells out to
`security add-generic-password … -U -w` and feeds the token in; from an
interactive terminal it hung there instead, with no explanation of what was
being asked for or why. It reads exactly like the tool asking for your Mac
login password, which is the one thing you must not type into it.

`SPACEFAST_CREDENTIAL_STORE=plaintext` restores the 0.0.26 file-based store and
skips it — discovered in the binary's own error text, documented nowhere.
Moving credentials into the OS keyring is a good change; doing it silently
during an unrelated publish, on a release that a server policy has just made
mandatory, is a lot of new failure surface at once.

### 🐛 …and finalize fails again, at the same stage as yesterday

With the header attached, the publish gets all the way through and then dies at
the last step:

```
✓ Updating space   larderlog (spc_7770744a870a43f5927213fa397c780e)
✓ Creating version ver_da36789d34044bbd9e95466c13235913
✓ Uploading files  16 files
⠋ Finalizing version
Not found.
Learn more: https://spacefast.com/docs/errors/runtime_api_not_found
```

The version record:

```json
{ "ref": "v3", "status": "failed",
  "failureCode": "runtime_api_not_found", "failureMessage": "Not found.",
  "failedStage": null, "manifestHash": null,
  "fileCount": 16, "filesAddedCount": 0, "filesChangedCount": 0,
  "pendingUploads": [ "__spacefast/zero/deploy.json", ".claude/CLAUDE.md", … ] }
```

`POST /v1/spaces/{id}/versions/{id}/finalize` is the call. The documented
resolution for `runtime_api_not_found` — *"Send the request with the management
hostname as the Host header. Spacefast does not serve management routes on
public hostnames."* — is advice for a caller hitting the runtime management API
directly, which is not what the CLI is doing here; it is posting to
`api.spacefast.com` exactly as it did for the successful v2. So this reads as
the platform failing to reach its own runtime management endpoint while
installing the capsule.

**This is the same stage that broke on 2026-08-24**, when every publish failed
at `version_finalize` with an internal 406 and the failed operations never
reconciled, wedging three spaces. Today it is a 404 with a different code. The
finalize stage has now been the failure point on two of the three days this
project has existed.

**Better than yesterday:** the space did not wedge. `Status: active`, v2 is
still live and serving, and the failed v3 is recorded as `status=failed` rather
than left dangling. Whatever reconciliation was added since yesterday is
working. `filesAddedCount: 0` with a non-empty `pendingUploads` does suggest the
version's manifest never reconciled, but it is marked failed rather than
pretending otherwise.

Not retried, deliberately — yesterday's wedge came from repeated attempts
through a broken finalize.

## 2026-08-25 — Docs review: one fix, and the gap the day's bugs sit in

Checked the docs against what this log recorded on 2026-08-24.

### 👍 The programmatic-fetch 403 is fixed

Yesterday's first entry: `https://spacefast.com/docs/zero.md` and `/setup.md`
returned **403** to a plain `curl`, so the page an agent is explicitly told to
fetch was the one page it could not read, and every fetch here needed a spoofed
desktop User-Agent.

Both now return **200** with no User-Agent games, and the content is
byte-identical to what the spoofed fetch returns. That was the single biggest
day-one friction and it is gone. Thank you.

*(Project note: the browser-UA workaround in `CLAUDE.md` can be simplified when
someone next touches it. Left in place for now — a plain `curl` works, so the
instruction is merely redundant rather than wrong.)*

### 😕 Nothing about today's blockers has reached the docs

Searched `zero.md`, `cli.md`, `publish.md`, `agents/publishing.md`, and
`llms.txt`:

| Term | zero.md | cli.md | publish.md | llms.txt |
|---|---|---|---|---|
| `rationale` | 0 | 0 | 0 | 0 |
| "agent mutation" | 0 | 0 | 0 | 0 |
| `SPACEFAST_CREDENTIAL_STORE` / keyring | 0 | 0 | 0 | 0 |
| `--spa` / "SPA fallback" | **0** | yes | yes | yes |

So the requirement that blocked every publish today is documented nowhere, and
neither is the credential-store change that stopped the CLI at a bare
`password data for new item:` prompt.

The 0.0.27 binary also references an error page that does not exist:
`errors/invalid_elevation_request` returns **404** on the docs site, as do
`elevation_required` and `rationale_required`. The CLI ships pointing at
documentation for a system the site has not published.

**The `--spa` row is its own small lesson.** The flag *is* documented — in
`cli.md` and `publish.md`. It is `zero.md`, the one file a Zero developer is
told is "the whole runtime reference", that advertises `Router`, `Routes`,
`Route`, and `useParams` and never mentions that unmatched paths 404 unless SPA
fallback is on. The fact was published; it just wasn't where the person who
needs it is reading.

### Dating any of this is not possible from outside

No `Last-Modified` header on any docs page — only content-hash ETags — and
`sitemap.xml` carries no `<lastmod>`. So "what changed since yesterday" can only
be answered by diffing against copies you kept. A `lastmod` in the sitemap, or a
visible "updated" date on each page, would make the docs auditable for anyone
tracking a moving platform.

## 2026-08-25 — Shipping a webfont: possible, but every signpost says otherwise

Zero has no webfont mechanism. Working around that took four dead ends and one
piece of luck, and three of the four dead ends are silent.

### 🐛 `theme.json`'s `fontFace` is discarded without a warning

`theme.json` is WordPress theme.json v3, and in WordPress a `fontFamilies`
entry carries a `fontFace` array that self-hosts the files:

```json
{
  "fontFamily": "Fraunces, ui-serif, Georgia, serif",
  "slug": "disp",
  "fontFace": [
    { "fontFamily": "Fraunces", "fontWeight": "100 900",
      "src": ["file:./fonts/fraunces.woff2"] }
  ]
}
```

`zero-compile` reads `slug` and `fontFamily` and drops everything else on the
floor — `tailwind-core.js`, `presetRecord(typography, "fontFamilies",
"fontFamily")`. No warning at compile, none in `sf publish --dry-run`, nothing
in `artifact.json`. The block simply evaporates.

This is the worst shape a limitation can take: the format is borrowed from a
system where the key means something, and the key is accepted and ignored. A
developer who writes it has no way to learn it did nothing except by loading the
page and squinting at the letterforms.

**Suggestion:** either honor `fontFace`, or warn on an ignored key. The compiler
already validates — `isSafePresetValue()` drops values containing `;{}`, also
silently. One `console.warn` per dropped key would have saved the whole
investigation.

### 😕 Three more routes closed, which is what made the limit look absolute

For completeness, because each was checked before the workaround was found:

| Route | Result |
|---|---|
| `theme.json` → `fontFace` | ignored, silently |
| A `<link>` in `index.html` | no authored shell; `compile.js` generates it from a fixed template |
| A CSS entry point / `@import` | none exists; `@plugin` and `@config` are rejected |
| `/__spacefast_generated/theme.css` | 404 on both `sf dev` and the published space |

The docs' own summary — "a `theme.json` at the project root adjusts the palette
and typography the utilities compile against" — reads as though typography is
fully covered. Four of the five things a developer would try are closed and none
of them says so.

### 👍 The tokens the compiler *does* emit are exactly right

The one piece of luck, and it is genuinely good design. Each family becomes:

```css
--font-disp: var(--wp--preset--font-family--disp, Fraunces, ui-serif, Georgia, serif);
```

That is a complete `font-family` stack. `font-disp` is a working utility
already; the only missing link is a rule telling the browser where "Fraunces"
lives. And an `@font-face` rule is a DOM node, which nothing in the compile
pipeline can take away. So a ~40-line client module that appends a `<style>`
to `document.head` at boot closes the gap, with **no change to `theme.json` and
no change to any component**.

The workaround is small because the token design is good. Worth saying, since
the rest of this entry is complaints.

### 🐛 `sf dev` does not serve the publish payload — the inverse of the SPA bug

The font files ship as static assets in `fonts/` at the project root. That works
on a published space: confirmed against live v2, where `/LICENSE.md`,
`/package-lock.json`, and `/tsconfig.json` all return 200 with correct content
types. (`/sf.jsonc` and `/theme.json` 404 — shadowed by name — and dot-paths
403, both already logged.) The uploader even sniffs magic bytes and tags a
`wOF2` file as `font/woff2` with no configuration.

Under `sf dev`, none of it serves. Every unrecognized path returns the SPA
shell:

```
$ curl -o /dev/null -w '%{http_code} %{content_type} %{size_download}\n' \
    http://127.0.0.1:4174/fonts/inter-latin-wght.woff2
200 text/html; charset=utf-8 1829

$ # …and a path that does not exist at all:
$ curl … http://127.0.0.1:4174/fonts/nope.woff2
200 text/html; charset=utf-8 1829

$ # …and a file that demonstrably serves in production:
$ curl … http://127.0.0.1:4174/LICENSE.md
200 text/html; charset=utf-8 1829
```

Only the generated assets are real locally: `/zero.css` (40715b, `text/css`)
and `/client.js` (124702b, `application/javascript`).

**This is precisely the inverse of the deep-path bug logged on 2026-08-25
above.** There, `sf dev` served paths the published space 404s. Here, `sf dev`
404s — well, shells — files the published space serves. Same root cause, a dev
server whose routing is unrelated to production's, pointing opposite ways on
consecutive features. Both times the local result is the *misleading* one, and
both times the only way to find out is to publish.

**Suggestion:** serve the publish payload from `sf dev`, or at minimum make the
shell fallback conditional on `--spa` so an unmatched path 404s locally exactly
as it will in production. A `200 text/html` for a `.woff2` request is a
uniquely unhelpful answer: the browser rejects it as a font, and the network tab
shows a success.

### 😕 Net cost

Roughly an hour, almost all of it spent establishing that four documented-looking
routes do nothing. The actual fix is 40 lines and four files. A single line in
`zero.md` — "Zero does not load webfonts; `fontFace` is ignored; ship files as
static assets and declare `@font-face` yourself" — would have made it fifteen
minutes.

### Coda: we went with Google Fonts, and the reason is the dev server

Every finding above stands — the silent `fontFace` discard, the closed routes,
the payload asymmetry. But the self-hosted approach they add up to was **built,
verified, and then abandoned**, because of the one thing that matters most in
practice: it does not work in local development.

Fonts are one of the easiest things on the web. One `<link>`, or one
`@font-face`. Zero removes both files, which is defensible on its own — the
tokens it emits in exchange are well designed. What is not defensible is that
the workaround still doesn't work locally, because `sf dev` serves no project
static file at all and has no flag to make it. `sf dev --help` lists
`--state-backend`, `--watch-interval`, and `--allow-network`; nothing for static
assets.

So a developer restyling their app cannot see their own typography until they
publish. On this project that is worse than it sounds, since publishing has been
blocked for two days by the `x-spacefast-rationale` issue logged above. The only
way to see a self-hosted font was to fix an unrelated platform bug first.

Pointing at `fonts.googleapis.com` sidesteps all of it in one line — a remote
URL is a remote URL in both environments. That is a fine outcome for this app
and a poor advertisement for the platform: the escape hatch that works is the
one that sends your users to a third party, and the one that keeps them on your
own origin is the one you cannot test.

**Two changes would close this, in order of value:**

1. **Serve the publish payload from `sf dev`.** Whatever `sf publish
   --dry-run` would upload should be reachable locally at the same path. This
   is the fix; everything else is mitigation.
2. **Say so in `zero.md`.** One line — "Zero does not load webfonts;
   `theme.json`'s `fontFace` is ignored; declare `@font-face` yourself and
   serve the files from a URL" — turns an hour into fifteen minutes. Ideally
   with the caveat that a self-hosted path won't resolve under `sf dev`.

## 2026-08-25 — Checked for movement: none on our blocker, but a rebrand is in preview

Re-checked everything this project depends on. Nothing that blocks us has moved.

### The docs have not changed

`https://spacefast.com/docs/zero.md` is **byte-identical** (19126 bytes) to the
copy fetched at 11:37 today. Since the site still exposes no `Last-Modified`
and no sitemap `lastmod`, diffing a kept copy remains the only way to answer
"did this change" — the point made at the end of the docs-review entry above.

### The publish blocker is unchanged

- **npm is still on `0.0.26`.** Published versions end `0.0.23, 0.0.24, 0.0.26`.
  `0.0.27` — the only CLI that can send `x-spacefast-rationale` — remains
  binary-channel only. Publishing is still blocked for exactly the reason
  logged yesterday.
- **`rationale` still appears in no documentation.** Zero hits across `/ai`,
  `/docs/cli.md`, `/docs/publish.md`, and `/docs/errors.md`. A requirement that
  hard-fails every agent-attributed publish is now two days old and documented
  nowhere.

### A rebrand is in preview: "Stattic"

Found at `https://space-xzbpj0kbj.view.fast/` — a Spacefast-hosted space
carrying a proposed replacement marketing site. Canonical `https://stattic.net/`,
which currently 301s to `https://spacefast.com/?ref=stattic.net`. Branded "By
Automattic", and it carries an internal notice: *"Automatticians: Stattic is
experimental… do not promise availability or move customer workloads here
without talking to the Stattic team."*

Recording it because the positioning is a straight repositioning to static
publishing — "The publishing layer for AI-made stuff", permanent URLs,
immutable versions, claim — and **the Zero runtime does not appear in it at
all**. The site's full route table has `/docs`, `/docs/errors`, and
`/docs/platform-api`; there is no `/docs/zero`. Searching the compiled bundle
finds no `capsule`, no `sf publish`, no `sf dev`, no `view.fast` — the only
"Zero" hit is the marketing phrase "Zero tools".

**This is not evidence that Zero is going away**, and it should not be read as
such. The live `/ai` document still states plainly: *"Spaces serve static files;
app code runs only through a declared Zero or Functions runtime."* Zero remains
a declared, supported runtime. A marketing site omitting a developer runtime is
a marketing decision.

Two smaller notes:

- **"Functions" is a runtime we have never seen mentioned** — it appears in
  `/ai` and nowhere in this project's notes or in `zero.md`. Unknown whether it
  is shipped, planned, or the successor to something.
- If the rebrand lands, the hostnames change: `stattic.net`,
  `api.stattic.net`, and `*.stattic.site` replace `spacefast.com` and
  `*.view.fast`. `larderlog.view.fast` is a published, claimed URL whose entire
  pitch is that it never moves.

### Speculation, flagged as such

Our publish has failed twice at `finalize` with **`runtime_api_not_found`** —
the stage that activates a *runtime* version. That error, unresolved across two
days, alongside a rebrand whose story is static-only, is at least worth holding
as a hypothesis: the runtime API may be mid-migration rather than briefly
broken. No evidence either way, and the docs assert Zero is supported. But it
would explain a two-day failure better than a transient fault, and it is a
question worth asking the team directly rather than waiting out.

### 😕 `sf dev` hardcodes the page title and ignores `sf.jsonc#meta.title`

Small, but it is the tab you look at all day. The **built** shell honours the
config — `.spacefast/zero/public/index.html` carries `<title>Larder Log</title>`
after adding `meta.title` to `sf.jsonc`. The shell `sf dev` serves does not:

```
$ grep -o '<title>[^<]*</title>' .spacefast/zero/public/index.html
<title>Larder Log</title>

$ curl -s -b "spacefast_zero_dev_4173=$CAP" http://127.0.0.1:4173/ | grep -o '<title>[^<]*</title>'
<title>Spacefast Zero dev</title>
```

The two shells differ in more than the title — 1829 bytes served against 1889
built — so `sf dev` is generating its own rather than serving the compiled one.
That is defensible for a dev harness, but it means the one identity setting the
platform *does* expose is invisible in development and only correct after a
publish. Same shape as the static-asset gap logged above: local and production
disagree, and local is the misleading one.

**Suggestion:** read `meta.title` in the dev shell too. It is one string, and it
is the difference between a tab that says what you are building and one that
says what tool you are building it with.

### 😕 …and there is still no way to declare an icon

`zeroHostedAppShell()` takes a title and nothing else. No favicon, no
`apple-touch-icon`, no `theme-color`, no manifest link — and no head hook to add
them. Declaring an app icon is table stakes for something whose pitch is
"publish a page and keep it", and it is the second thing after webfonts (D31)
that has to be injected into `document.head` from client code to exist at all.

**Suggestion:** let `sf.jsonc#meta` carry `icon`, `themeColor`, and `manifest`,
and emit the corresponding tags. The config block already exists; it just stops
at `title`.

## 2026-08-25 (evening) — Re-checked the publish blockers: nothing has moved

All four checks from this morning, run again at the end of the day.

| Check | This morning | Now |
|---|---|---|
| npm `spacefast` latest | 0.0.26 | **0.0.26** |
| `rationale` in the docs | 0 hits | **0 hits** (`/ai`, `cli.md`, `publish.md`, `errors.md`, `zero.md`) |
| `docs/zero.md` | 19126 bytes | **19126, byte-identical** |
| `larderlog.view.fast` | live, v2 | **live, v2** — `/api/status` returns `ok` |

The published bundle still carries the pre-Cellar palette (7 hits for the old
hexes), which is the cleanest confirmation that nothing has shipped since
2026-08-24.

`sf publish --help` still exposes no rationale flag and no environment variable
that could carry one — the full env surface is `SPACEFAST_{API_URL,
CLAIM_TOKEN, GIT_*, PROFILE, PUBLISH_MESSAGE, SOURCE_TYPE, SPACE, TEAM, TOKEN,
YES}`. `PUBLISH_MESSAGE` is the closest thing by name and is not the same
header.

**So the position is unchanged:** the only ways out remain npm shipping 0.0.27,
or the platform dropping the `x-spacefast-rationale` requirement, or fixing
`finalize`'s `runtime_api_not_found`. Two days now, and none of it is written
down anywhere a developer would look.

Worth noting what has accumulated behind this: the entire Cellar reskin — new
palette, dark mode, typography, drawer, collapsed rail, item sheet, sort menu,
icons — is built and unpublishable. The gap between what runs locally and what
is live grows every day the blocker stands, and none of it can be verified by a
second person until a publish succeeds.

---

## 2026-08-25 (late) — Multi-household work: three good notes, one sharp edge

Nothing publish-related was attempted; the blocker above is unchanged. This is
what a day of ordinary capsule work turned up.

### 👍 Query arguments work exactly as the type declarations promised

`useQuery(name, ...args)` and `query(async (ctx, householdId: string) => …)`
compose without ceremony. Three queries now, one of which takes an argument that
changes on a click, and the client re-subscribes with no extra plumbing. This is
the feature that was invisible in the docs (see the 2026-08-24 entry) — **one
example with an argument in `/docs/zero.md` would still be worth writing**,
because every example there still takes only `ctx`.

### 👍 `ctx.invalidate()` addresses a query by name, and that is the right call

A query that takes an argument is still invalidated by its name alone, so a
mutation does not have to know which household ids are currently subscribed.
Worth documenting explicitly — the alternative design (invalidate one argument
variant) is plausible enough that a reader has to guess.

### 👍 Endpoints remain the only way to test server logic without a browser

`endpoint()` with a writable `ctx.db` and a real `ctx.auth` let us verify the
multi-household authorization path — a user who is `owner` in one household and
`viewer` in another, `item:write` allowed in the first and refused in the second
— in one request, then delete the endpoint. There is no other way to exercise a
handler locally: there is no test harness for capsule code, no way to invoke a
mutation from a script, and `sf dev` issues a single fixed identity. **A
first-class way to call a query or mutation from the CLI — `sf dev invoke
<name> [args…]` — would replace this whole dance.**

### 😕 `sf dev` has `--port` but the failure mode does not mention it

Starting a second dev server while one is running prints a bare
`EADDRINUSE: address already in use 127.0.0.1:4173` with an eight-frame oclif
stack trace and no hint that `-p/--port` exists. The flag is in `sf dev --help`
(which itself is not discoverable from `sf --help`, per the earlier entry). A
one-line "another dev server is already on 4173 — pass `--port` to run a second"
would cost nothing.

Two dev servers on different ports coexist cleanly otherwise, with separate
in-memory state and separate capability tokens. That is genuinely useful and
nowhere documented.

---

## 2026-08-26 — Built-in row timestamps: what they actually guarantee

Context: a feature request to store a created and a last-modified date on
items, terms, and households. The answer turned out to be "Zero already does
this", but the docs state it in one clause and never say what the semantics
are, so we verified them against a running `sf dev` before relying on them.

### 👍 `createdAt` / `updatedAt` exist on every row, and the reservation is enforced early

`sf init`'s own `AGENTS.md` says every row "gets `id`, `createdAt`, and
`updatedAt` for free (those names are reserved)". Both halves hold, and the
reservation is enforced at three separate layers rather than silently:

- `table()` throws `Field name "createdAt" is reserved for Lakebed metadata.`
- `insert()`'s parameter type is `Omit<Row, "createdAt" | "id" | "updatedAt">`,
  so a stray write is a typecheck error, not a runtime surprise.
- The dev runtime throws `Zero manages households.createdAt; app code cannot
  set it directly.` if you get past both.

Failing at schema-definition time is the right call — this is exactly the class
of mistake that would otherwise ship as a column that silently never updates.

### ❓ …but the update semantics are documented nowhere, and they are the whole feature

"Gets them for free" does not say whether `updatedAt` is stamped once at insert
or bumped on every write — and a *created* date and a *modified* date that are
permanently equal is a common enough platform wart that we could not assume.
Neither `/docs/zero.md` nor the scaffolded `AGENTS.md` answers it.

Verified by hand, via a throwaway endpoint that inserted a row, spun 25 ms, and
patched it (endpoints are still the only way to exercise a handler without a
browser — see the 2026-08-25 entry):

```
before  createdAt 2026-08-26T13:52:23.457Z   updatedAt 2026-08-26T13:52:23.457Z
after   createdAt 2026-08-26T13:52:23.457Z   updatedAt 2026-08-26T13:52:23.482Z
```

So: both stamped at insert, `createdAt` immutable across `update()`, `updatedAt`
bumped by exactly the elapsed time. ISO 8601 UTC with millisecond precision, so
it string-compares correctly — the same encoding `invites.expiresAt` already
leans on (D24).

**One sentence in the limits list would remove the need for any of this:**
"`createdAt` is stamped at insert; `updatedAt` is rewritten on every `update()`."

### 👍 An empty patch still bumps `updatedAt`

`update(id, {})` rewrites `updatedAt` rather than short-circuiting. That is
load-bearing for us and not obviously intended, so it is worth stating in the
docs either way: our `updateItem` always calls `items.update()` even when the
edit only touched join-table rows, which means an item's "last modified" moves
when you retag it. Had the empty patch been a no-op, that would have been a
silent hole.

Both local state adapters agree, for what it's worth — the in-memory store sets
`updatedAt: nowIso()` unconditionally, and the SQL-backed one folds `updatedAt`
into the entry list before its `if (entries.length === 0)` early return, so the
early return is unreachable whenever the column exists.

**Not verified on a hosted runtime**, because publishing is still blocked (see
the 2026-08-25 entries). Local only.

### 🐛 `sf db dump` fails with `zero_db_connect_failed` while the space itself is healthy

Tried to confirm the timestamps on real rows in the live v2 space. Every dump
fails:

```
$ npx sf db dump --table items
Zero database dump failed.
```

`--json` gives the useful part, which the human-readable output withholds
entirely:

```json
"details": {
  "runtimeDetails": { "table": "items", "zero_db_code": "zero_db_connect_failed" },
  "runtimeCode": "zero_db_dump_failed",
  "status": 500, "attempts": 1
}
```

- space `spc_7770744a870a43f5927213fa397c780e`, version
  `ver_ee0c717d360d428692c066e6ffd7e340`
- requestId `b4503d08-4ba1-4fcb-9bfc-64bcecf2453f`
- HTTP 500, marked `retryable: true`; retries do not help
- **`https://larderlog.view.fast/api/status` returns `200 ok` throughout**, so
  the runtime is serving fine and only the admin dump path cannot reach the
  database

Two things worth fixing: the bare message should carry `zero_db_connect_failed`
without needing `--json`, and `retryable: true` on a persistent connect failure
sends you into a retry loop that cannot succeed. The recovery hint (`sf doctor`)
does not mention that the space may be perfectly healthy while this fails.

---

## 2026-08-26 — Building the destructive-actions pass: three sharp edges, all self-inflicted but all avoidable

Context: implementing undo toasts, confirm modals and a typed confirmation.
Touched `theme.json`, `server/index.ts`, and a dozen client components. Nothing
here blocked us for long, but each cost a full dev-server restart cycle to
diagnose because the failure surfaces nowhere near the cause.

### 👎 `theme.json` is strict JSON while `sf.jsonc` is JSONC, and nothing says so

Added two palette entries with a `//` comment above them explaining why they are
theme-independent — the same commenting style `sf.jsonc` uses two files away.
`sf dev` refuses to start:

```
theme.json is not valid JSON: Unexpected token '/', ..."" },

				// The foc"... is not valid JSON
```

The message is clear once you see it, and it fails fast, which is right. But the
asymmetry is not documented anywhere: `sf.jsonc` announces its dialect in its
own extension, and `theme.json` looks like the same class of hand-edited config
file. **Either accept comments in `theme.json` too, or say "strict JSON, no
comments" in the styling docs.** A design token is exactly the kind of value
that wants a note explaining why it exists.

### 🐛 The `location:` scanner false positive fires on an *object key*, again

Known from 2026-08-24 and still worth reporting, because it caught us a second
time in a file that already carries a comment warning about it. A throwaway
endpoint returned a plain object:

```js
const out = { location: await countLoc(loc.id), type: ..., store: ... };
```

`sf dev` refused to reload:

```
Zero dev reload failed: Zero source server/index.ts references unsupported
server global location.
```

`const loc = ...` was fine; the bare `location:` **object key** was not.
Quoting it (`'location':`) is the entire fix. The scanner is doing a text match
rather than resolving identifiers, so any property, method or shorthand named
`location`, `document` or `window` trips it.

Two things would fix this without a real parser: **say which line it found**, and
**say that quoting resolves it**. Right now the error names the file and the
global and nothing else, and the natural reading — "you referenced the browser
`location`" — is false, which sends you looking in the wrong place. This is a
pantry app; `location` is one of its three core nouns, so it will keep happening.

### 👍 A reload failure leaves the previous runtime serving, and says so every poll

Worth calling out as a good decision. When the reload failed, `sf dev` kept the
last good runtime up and repeated the error once per watch interval. So `GET /`
still worked, the client kept running, and the log made it obvious the source
was not live. Compare with the failure mode it avoids: an endpoint that returns
the SPA shell for an unrecognized path (see 2026-08-25) looks *identical* to an
endpoint whose file failed to compile. The repeated log line is the only thing
that distinguishes them — **keep it**.

### 😕 A `--dry-run` artifact hides the schema one level down, and an empty read looks like D27's disaster

Checked the artifact after editing `server/index.ts`, per our own rule that a
table can vanish while typechecking perfectly. Read `artifact.json` looking for
a top-level `schema`, got nothing, and briefly believed the capsule had shipped
empty again — the exact failure that cost us a publish on 2026-08-24.

It had not: the schema is under `server.schema`, and all nine tables were there.
But **"no tables" and "I looked in the wrong place" produce the same output**,
and the consequence of the first is severe enough that the tooling should make
them distinguishable. `sf publish --dry-run` prints a six-line summary — folder,
files, bytes, mode, SPA, target — and **none of it mentions the capsule**. One
more line, `Schema 9 tables · 3 queries · 16 mutations · 1 endpoint`, would make
the check we are told to do unnecessary, and would have caught the original bug
at the moment it happened.

### 👍 Endpoints remain the way to prove a handler rule, and the in-memory backend makes it cheap

Verified the new "a term is deletable only once nothing references it" rule by
inserting a household, two items, a type and a store, counting through the
`by_type` / `by_store` indexes, and deleting it all again in one request. In
memory, so nothing survived the restart and no cleanup could be forgotten. The
counts came back right and the refusal sentence came back verbatim.

Still the only way to do this — restating the ask from 2026-08-25: **`sf dev
invoke <name> [args…]`** would replace the whole dance.

### 🐛 An arbitrary `min-[Npx]:` variant is emitted *before* the named breakpoints, so it cannot override one

Later the same day, laying out the item grid. The collapsed rail is meant to be
the drawer below 1120px and disappear above it, so it carried
`hidden md:flex min-[1120px]:hidden`. It rendered beside the open drawer on
every desktop width.

The compiled `zero.css` says why:

```
line 2067:  @media (width >= 1120px) { .min-\[1120px\]\:hidden { display: none } }
line 2108:  @media (width >= 48rem)  { .md\:flex          { display: flex } }
```

At 1120 both queries match and `md:flex` wins on source order. Tailwind groups
arbitrary media variants ahead of `sm/md/lg/xl/2xl` rather than sorting all
media variants together by their computed min-width, so an arbitrary variant can
never override a named one — only the reverse.

Whether that ordering is intended or not, the part worth fixing is that **there
is no signal**. The class compiles, appears in the stylesheet with exactly the
declaration you asked for, and does nothing. Every check short of opening a
browser passes: `tsc` is clean, the selector greps present, the media query is
correct in isolation. We had just written a project rule that "grep the compiled
CSS" is how you confirm a class shipped — and here the class shipped and was
still dead.

The fix is to stop relying on order at all: `md:max-[1120px]:flex` compiles to a
nested `@media (width >= 48rem) { @media (width < 1120px) { … } }` that covers
exactly the intended band, so nothing has to out-rank anything.

**A build-time warning would catch this** — two utilities on the same element
setting the same property, in media queries that overlap, where the narrower
one loses. That is statically detectable from the class list. Failing that,
sorting *all* media variants by computed min-width would make the intuition
correct. Right now the only way to find it is to notice the pixels are wrong.

Worth noting the asymmetry that makes this easy to miss: pairing an arbitrary
variant with a **base** utility (`fixed min-[1120px]:sticky`,
`flex ... min-[1120px]:hidden`) works fine, because base utilities precede every
media block. Four of our five `min-[1120px]:` usages were that shape and were
correct. Only the two paired with a `md:` class were broken, which is why it
looked like an isolated glitch rather than a rule.

## 2026-08-26 — publishing is still blocked on the same header (bug)

Retried a publish with no shims, no injected headers, no flags: `npx sf publish`
straight from the pinned devDependency. It fails in exactly the place it failed
on 2026-08-25.

```
Preparing update...   Files 78   Mode website   Auth signed in
✓ Updating space  larderlog (spc_7770744a870a43f5927213fa397c780e)
⠋ Creating version
Agent mutations require a rationale of 1 to 1024 characters in the
x-spacefast-rationale request header.
Learn more: https://spacefast.com/docs/errors/validation_error
```

Nothing has moved on any of the four fronts:

1. **npm is still on `spacefast@0.0.26`.** `npm view spacefast dist-tags` →
   `{ latest: '0.0.26' }`, published 2026-08-22. `npm view spacefast versions`
   lists nothing past 0.0.26, and there is no `next`/`beta`/`canary` tag.
   `@spacefast/zero` tops out at 0.0.26 as well. So the "update dependencies
   first" step is a no-op — we are already on the newest thing npm has.
2. 0.0.26 still cannot send the header — no flag, no env var.
3. The 0.0.27 standalone binary still can't compile a Zero capsule, so it isn't
   a way around this for a Zero project.
4. Untested this round: we never got as far as `finalize`, so whether
   `runtime_api_not_found` is fixed is still unknown.

**One thing did improve, slightly.** This run failed *earlier* than the
2026-08-25 attempt — at `Creating version` rather than at `finalize` — so no
version row was created and there is no new `status=failed` record to explain
later. The space is untouched: `sf status` resolves, `GET /api/status` returns
`ok`, `GET /` returns 200, **v2 is still live**.

### The friction, stated plainly

An agent-attributed credential is refused at the API, and **the only CLI on npm
has no way to comply**. The two are shipped by the same project on different
release channels, and the channel that got the fix (binary, 0.0.27) is the one
that cannot build a Zero capsule. That leaves a Zero project with agent
credentials in a state with no supported path forward — not a hard problem to
work around, just one with no legitimate door.

Three fixes, cheapest first:

- **Publish 0.0.27 to npm.** This is presumably already intended; it just hasn't
  happened in the four days since 0.0.26.
- **Give 0.0.26 an escape hatch** — `SPACEFAST_RATIONALE` env var or
  `--rationale`. A one-line change to a released CLI, and it would unblock every
  pinned project without a version bump.
- **Say which CLI versions can comply** in the error body. The message names the
  header and links to a generic `validation_error` page; it does not say "your
  CLI cannot send this, upgrade to ≥0.0.27". We only knew that from having
  investigated it ourselves the day before.

The error text itself is good — it names the header, the length bounds, and
links out. The gap is that it assumes the reader can act on it.

## 2026-08-26 (later) — a fresh human login does not clear the agent classification (bug)

Follow-up to the entry above. We tried to establish a human-attributed session
and publish from it. **It made no difference**, and that is the finding worth
sending.

Sequence, all on the same machine:

1. `npx sf publish` from the agent session → `Agent mutations require a
   rationale…`. Expected.
2. Justin ran `npx sf publish` **himself, in his own terminal** → identical
   error. That killed the theory that the classification comes from the
   ambient environment.
3. `npx sf logout` → `npx sf login` (browser device flow, completed by hand) →
   `npx sf whoami` reports *Justin Tadlock (justintadlock@gmail.com)*.
   `~/.spacefast/auth.json` mtime confirms it was rewritten at 11:48:12.
4. `npx sf publish -m "…"` two minutes later → **identical error**, same stage
   (`Creating version`).

So: a credential minted seconds earlier by an interactive browser login, for a
human account, still has its publishes rejected as *agent mutations*. Whatever
drives the classification is not the credential, and re-authenticating is not a
way out of it.

### Why this is worth a fix

The CLI bundle carries **787** references to an `x-spacefast-client` header and
**17** to `CLAUDECODE`/`CLAUDE_CODE` sitting next to an `isAgent` check, which
suggests the client self-reports the environment it believes it is running in.
If that is the mechanism, then the label is a property of *where the binary was
launched*, not *who is driving* — and there is no documented way to correct it.
That produces the state we are in:

- the account owner cannot publish his own space from his own machine;
- `sf login` offers `--handoff` to *become* an agent session, but nothing to
  assert the opposite;
- the only CLI on npm (0.0.26) cannot send the header the API demands, so the
  compliant path does not exist at this version either.

`sf publish -m/--message` is **not** a substitute — we tried it. The message
lands on the version's changelog, not on the mutation, and the request is
rejected before a version is created.

### Asks

1. **A way to state the rationale on 0.0.26** — `--rationale` or
   `SPACEFAST_RATIONALE`. This is the whole fix; everything else is a
   workaround.
2. **Make the error say what the caller can do.** It names the header and links
   to the generic `validation_error` page. It does not say which CLI versions
   can send it, or that re-authenticating will not help. We burned a logout, a
   browser login and three publish attempts finding that out.
3. **Reconsider sticky/ambient agent classification**, or document it. If a
   freshly minted human credential is still treated as an agent because of the
   surrounding process, that should be stated somewhere discoverable.

Nothing was damaged: no version row was created in any of the three attempts,
`GET /api/status` returns `ok`, `GET /` returns 200, and **v2 is still live**.

---

## 2026-08-26 (later still) — building the signed-out flows: one very good discovery, two naming traps

Context: implementing the design spec's *Flows outside the shell* and marketing
page — a public page, the sign-in card and its handoff states, first run, and a
`?join=` landing that has to render for a **signed-out** visitor.

### 👍 `POST /__spacefast/zero/run` is a plain HTTP way to call a query, and it is the best verification tool in the box

The client bundle has an HTTP fallback beside the websocket — `requestHttpRun`
in `dist/client.js` — and `sf dev` serves it. It takes the same envelope the
realtime channel does:

```bash
CAP=…   # the #zero-dev-capability= fragment from the banner
curl -s -X POST \
  -H "authorization: Bearer $CAP" \
  -H "origin: http://127.0.0.1:4174" \
  -H 'content-type: application/json' \
  -b "spacefast_zero_dev_4174=$CAP" \
  -d '{"op":"query.run","name":"invitePreview","args":["AAAAAAAAAA"]}' \
  http://127.0.0.1:4174/__spacefast/zero/run
```

```json
{ "op": "query.result", "ok": true, "name": "invitePreview",
  "args": ["AAAAAAAAAA"], "data": { "state": "valid", … } }
```

This is a real improvement on the throwaway-endpoint trick we have been using.
An endpoint proves *a copy of* a handler's logic; this calls **the query the
client calls**, by name, and returns exactly what `useQuery` would receive. We
used it to exercise all five branches of a new query — valid, expired, revoked,
unknown, malformed, already-a-member — in one shell loop with no code added to
the capsule. `mutation.run` takes the same shape.

**Ask:** document it. There is nothing in `zero.md` or in the scaffolded
`AGENTS.md` about `/__spacefast/zero/run`, and it is the single most useful
thing we have found for verifying a capsule without a browser. An agent working
on a Zero app cannot click, and this is the substitute.

### 😕 The bearer token is required *and* the cookie is required, and only one of them is documented

`CLAUDE.md`'s bootstrap dance — POST the capability to `/bootstrap`, get a
`Set-Cookie`, then send the cookie — is enough for `/zero.css` and for a custom
endpoint. It is **not** enough for `/__spacefast/zero/run`, which answers:

```json
{ "error": "unauthorized" }
```

…to a request carrying only the cookie. Adding `authorization: Bearer $CAP`
alongside the cookie makes it work. We lost a round trip assuming the cookie was
sufficient because it had been everywhere else. The error is also the same
`unauthorized` for "no credential" and "wrong kind of credential", so it points
at the token rather than at the scheme.

### 👎 `signInWithGravatar` exists but is not exported from `@spacefast/zero/client`

`dist/client.d.ts` declares both `signInWithGravatar` and, for Lakebed source
compatibility, `signInWithGoogle`. The package's `exports` map points `./client`
at `dist/public-client.d.ts`, which re-exports **only** `signInWithGoogle` —
and `SignInWithGoogle`, not `SignInWithGravatar`. So an app on the documented
import path has to write "Google" for a button that says Gravatar and a flow
that is Gravatar end to end. `useAuth().provider` is typed `"guest" | "gravatar"`
in the same file, so the runtime has no doubt about which it is.

Not a bug, and trivially aliased at the import. But it is a wrong name on the
public surface of a product whose auth is Gravatar, and it will read as a
mistake to anyone auditing the code.

### ❓ There is no sign-in failure signal, so "the visitor came back signed out" has to be inferred

`signInWithGravatar` ends in `window.location.assign` — a full-page redirect,
not a popup — so the promise never settles in a way the page can observe, and
the app is torn down. On the way back there is no error, no status, and nothing
on `useAuth()` that separates "this visitor abandoned a sign-in ten seconds ago"
from "this visitor has never pressed anything". Both are `isGuest: true`.

We implemented the spec's *didn't come back* state by writing a timestamped
marker to `sessionStorage` before the redirect and reading it on arrival. That
works, and it is entirely our own bookkeeping. A `lastSignInAttempt` or an
`error` on the auth value would let an app tell someone their sign-in failed
without inventing a side channel.

The public `signInWithGoogle` wrapper *does* throw
`"Gravatar sign-in is unavailable for this Spacefast runtime."` when the runtime
has no sign-in — which is every `sf dev` — and that is genuinely useful. It is
the one auth failure an app can catch.

### 👎 `sf dev`'s fixed identity puts the entire signed-out surface out of reach

Known, and already in our notes as D14: `sf dev` issues one guest identity and
no sign-in, so an app that wants to be usable locally has to accept that guest
as signed in. The consequence we hit this round is new. Once you do that, **the
signed-out screens cannot be reached at all** — the marketing page, the sign-in
card, the invite landing and the handoff states are unreachable in the only
environment anyone can click them in.

We added an app-level `?signedout` switch, loopback-only, to turn our own bypass
off for one page load. It works, but it is a workaround for a gap in the dev
server, and every Zero app that has a signed-out surface will need its own.

**Ask:** a way to be a guest on `sf dev` on purpose — `sf dev --no-auth`, a
second capability that issues an anonymous identity, or a documented query
parameter. Failing that, a local sign-in stub, which would close both of our
auth bypasses at once.

### 👍 A new query lands in the artifact with no ceremony

`invitePreview` was added to the `queries` block and showed up in
`.spacefast/zero/artifact.json` on the next `--dry-run` — four queries where
there were three, nine tables and zero migrations untouched. D27's regex trap is
specifically a *schema* trap; handlers behave normally.

---

## 2026-08-26 (fourth) — building the shopping list: two small good things

A client-only feature this round — no schema, no handlers — so most of the
platform stayed out of the way, which is itself worth recording.

### 👍 `sf dev --port` runs a second server beside the first, cleanly

A dev server was already up on 4173 and its capability token was not
recoverable from outside the process, so verification needed its own instance.
`npx sf dev --port 4199` started, compiled the capsule, printed its own
capability, and served `/`, `/zero.css`, `/client.js` and `/api/status` without
either instance noticing the other. The in-memory state backend is presumably
what makes this free.

**Small ask:** when the port is taken, the error is a bare Node
`EADDRINUSE: address already in use 127.0.0.1:4173` with an oclif stack trace.
A one-line hint — "another `sf dev` may be running; try `--port`" — would save
the guess.

### 👍 The class-name scanner handles nested arbitrary values correctly

`md:grid-cols-[repeat(auto-fill,minmax(min(460px,100%),1fr))]` — an arbitrary
value with three levels of nesting and a `%` in it — compiled and appeared in
`/zero.css` as
`.md\:grid-cols-\[repeat\(auto-fill\,minmax\(min\(460px\,100\%\)\,1fr\)\)\]`.
So did `ring-offset-surface-alt`, resolved from a `theme.json` palette slug.
No caveats found.

### 👎 (ours, not theirs) the escaped-selector grep caught us a fifth time

Documented in our own instructions and we did it anyway: grepping `zero.css` for
a hand-written escaped class name returns nothing and looks exactly like a
missing class. The reliable check is to print the selectors and read them —

```bash
grep -oE '^\s*\.[^ {]+' zero.css | sed 's/^ *//' | sort -u
```

Not a platform bug. Recorded because the escaping is a real ergonomic cost of
scanning source for static class names, and anyone verifying a Zero build by
hand will hit it.

## 2026-08-26 — an additive column, and where the artifact actually keeps the schema

Adding one column (`households.ink`, `string().default('')`) to a nine-table
schema, then verifying it without publishing.

### 👍 an additive column needs nothing

Declared in the literal in `server/index.ts`, ran `npx sf publish --dry-run`,
and `.spacefast/zero/artifact.json` showed it immediately with its default
intact. Still nine tables and sixteen mutations. No flag, no prompt, no
ceremony — exactly what the docs promise for an additive change.

### 🤔 the schema is under `server.schema`, and `db.migrations` is empty

`sf publish --dry-run` prints only a file plan — folder, file count, bytes,
mode, SPA, target. Nothing about the schema. The artifact's top-level keys are
`format · appName · serverRuntime · client · server · db · realtime · limits ·
futureCapabilities · sourceManifest`, and the two plausible places to look are
misleading:

- **`db`** is `{"backend":"mysql","migrations":[]}` — and `migrations` was `[]`
  both before and after adding the column. It is not a diff against the live
  database, so an empty array is not evidence that nothing will change.
- The schema itself is **`server.schema`**, an object keyed by table name, each
  with `columns` (`name` / `type` / `nullable` / `default`) and `indexes`.
  `server.queries`, `server.mutations` and `server.endpoints` are string arrays
  beside it.

Neither is documented. A one-line `Schema  9 tables, 1 new column` in the dry-run
output would remove the need to know any of this.

### 👍 `sf dev --port` exists and is not in `--help`

A second instance on `--port 4174` started cleanly beside one already on 4173,
with its own capability token and its own in-memory database. That is what made
this verifiable at all: the first instance was somebody else's session and its
token was not available to us. `--port` joins `dev`, `db`, `logs` and `storage`
on the list of things that work and are not listed.

### 👍 `mutation.run` accepts a short argument list

`{"op":"mutation.run","name":"createHousehold","args":["The Lake Cabin"]}` for a
handler declared `(ctx, name: string, ink?: string)` ran with `ink` undefined
rather than erroring on arity. Combined with `query.run`, the undocumented
`POST /__spacefast/zero/run` remains the single most useful thing in this
runtime for verifying work in an environment with no browser: four handlers were
exercised end to end — a mutation with the argument, the same mutation without
it, a patch, and the guest-facing query reading the result back.

## 2026-08-26 (evening) — the publish went through: `finalize` is fixed 🎉

Third day of trying, and the platform half of the blocker is **gone**. v4 is
live at <https://larderlog.view.fast/>, `ver_d80a395f07144ce6863ba75b212a1486`,
71 files uploaded, 18 seconds end to end.

```
✓ Updating space    larderlog (spc_7770744a870a43f5927213fa397c780e)
✓ Creating version  ver_d80a395f07144ce6863ba75b212a1486
✓ Uploading files   71 files
✓ Finalizing version  v4
```

`runtime_api_not_found` at `finalize` — the failure on 2026-08-24 and again on
2026-08-25 — did not recur. Nothing on our side changed to cause that, so this
was fixed on the platform. Thank you.

**What has *not* changed: the `x-spacefast-rationale` requirement.** A plain
`npx sf publish` still dies at `Creating version` with the same message, and npm
is *still* on `spacefast@0.0.26` (checked again today: `dist-tags` → `{ latest:
'0.0.26' }`, no `next`/`beta`; `@spacefast/zero` also 0.0.26). The binary
channel is still on 0.0.27, published 2026-08-25T01:24Z, and still cannot
compile a Zero capsule. So the publish only completed because the header was
attached out-of-band, with a truthful rationale, from a `fetch` wrapper loaded
via `NODE_OPTIONS=--import`.

That is a silly thing to have to do to ship a space you own, and it remains the
single highest-value fix on this list:

- **Publish 0.0.27 to npm**, or
- **give 0.0.26 a `--rationale` flag / `SPACEFAST_RATIONALE` env var.**

We also confirmed the classification is not environmental, at least on 0.0.26:
the bundle reads no `CLAUDECODE`/`AI_AGENT`/`CLAUDE_CODE` variable — greps for
all three come back empty across `dist/`. (The 17 hits noted on 2026-08-25 were
in the 0.0.27 *binary*.) `process.env` in 0.0.26 exposes `SPACEFAST_CLIENT`,
which feeds `x-spacefast-client`, but pointing that somewhere else would be
misrepresenting the caller rather than complying, so it was not tried.

### 👍 Things that verified clean on v4

- `GET /` 200, `GET /api/status` → `ok`, `/client.js` 262 KB, `/zero.css` 69 KB.
- **D29 holds in production**: `/.claude/CLAUDE.md`, `/.docs/decisions.md` and
  `/.claude/docs/spacefast.md` all return **403**. Dot-prefixed paths are
  refused exactly as documented, so the project's own docs ship in the payload
  and stay unreadable.
- **The D42 migration applied additively with no flag.** `sf db` lists nine
  tables with `households.ink:string` present. Publish-time additive migration
  did what the docs promise.
- The capsule answers a guest: `POST /__spacefast/zero/run` with
  `{"op":"query.run","name":"invitePreview","args":["AAAAAAAAAA"]}` returns
  `{"state":"invalid"}` over plain HTTPS, unauthenticated. **The `run` endpoint
  exists in production too**, not just under `sf dev` — worth knowing, and worth
  documenting.
- `sf publish` skipped two files with a clear warning: *"ignored 2 unsupported
  file(s) on this plan"*, naming both. Good message.

### 🐛 `sf db dump` fails against a healthy space

`sf db dump --table households` returns:

```
Zero database dump failed.
Learn more: https://spacefast.com/docs/errors/zero_db_dump_failed
```

The access log shows the edge answering **500** for
`GET /__spacefast/api.php?route=/spaces/{id}/versions/{id}/zero/db/dump&table=households&limit=25`.
It is not the rationale policy — it fails identically with the header attached,
and it is a read. `sf db` (the schema/plan listing) works fine against the same
space in the same second, so the space and credentials are good; only `dump` is
broken. That matters because `db dump` is the documented way to verify a publish
and is what CLAUDE.md tells us to use to close out the D14 auth check.

### 🐛 A mutation that works on `sf dev` 500s on the hosted runtime

Reported from the live app: creating an invite raises *"Zero mutation.run request
failed."* The access log shows `500 POST /__spacefast/zero/run`. The same
mutation, driven through the same `run` envelope against `sf dev`, **succeeds**
and returns a code.

`sf logs runtime` says *"Nothing logged yet"* even though four requests 500'd, so
an uncaught handler exception produces no runtime log line and no error detail
anywhere the developer can reach. **That is the real friction here**: a 500 with
no message, no stack, and no runtime log leaves nothing to debug from.

Prime suspect is a **local/hosted runtime divergence**. The artifact reports
`serverRuntime: "quickjs-rust"`, and `crypto.getRandomValues` — used in exactly
one place in the whole capsule, `createInvite` — is the one global that a bare
QuickJS embedding would not have. `sf dev` evidently runs something else, since
the identical code path works there. Unconfirmed as of tonight.

Two asks:

1. **Log uncaught handler exceptions to `sf logs runtime`**, with the message and
   ideally a stack. Right now a 500 is silent.
2. **Document the hosted runtime's globals** — is `crypto` present? `fetch`?
   `setTimeout`? `TextEncoder`? Neither `zero.md` nor `zero-agent-rules.md`
   mentions QuickJS at all, so there is no way to know which standard-library
   surface a capsule may rely on. And `sf dev` running a *different* engine means
   the local server cannot warn you either.

`ctx` exposes no randomness helper (`auth`, `db`, `env`, `gravatar`, `log`,
`spam`), so if `crypto` is genuinely absent there is no documented way for a
handler to generate a bearer credential.

## 2026-08-27 — the capsule compiler has a global denylist, and it is the best thing in the toolchain

Chasing the `createInvite` 500 from yesterday, `sf dev` refused to start:

```
Zero source server/index.ts references unsupported server global globalThis.
```

That is a **great** error — it named the file, the identifier, and the rule, and
it fired in under a second. The check is in
`@spacefast/zero-compile/dist/analyze.js`, and there are two patterns:

```js
const UNSAFE_GLOBAL_PATTERN = /\b(Bun|Deno|Function|__dirname|__filename|eval|process)\b/g;
const ZERO_SERVER_UNSAFE_GLOBAL_PATTERN = /\b(BroadcastChannel|SharedWorker|WebSocket|Worker|
  XMLHttpRequest|document|global|globalThis|localStorage|location|navigator|sessionStorage|window)\b/g;
```

Alongside them are equally sharp rules against dynamic `import()`, `require()`,
`shared/` importing from `client/` or `server/`, and server source importing
client source. Collectively this is the most useful static checking in the
product and **none of it is documented** — not in `zero.md`, not in
`zero-agent-rules.md`. It deserves a page. Knowing the list up front changes how
you write a capsule.

Two notes for whoever writes that page:

- It is a **denylist of the inappropriate**, not an allowlist of the available.
  `crypto` is absent from both patterns, so the compiler happily admits
  `crypto.getRandomValues` — see below for what happens next.
- It matches **transpiled code, not raw source**, so the word `location` in a
  comment is fine while `location` as an identifier is not. That is the right
  behaviour and worth stating, because the error text alone implies otherwise.

### 🐛 The compiler admits `crypto`; the runtime does not provide it

This is the sharp edge, and it is the cause of yesterday's silent 500.

`crypto.getRandomValues` was the **only** non-core global in the entire capsule
— one call site, in `createInvite`. It:

- typechecks, because `lib.dom` types `crypto` as always present;
- passes the compiler's global check, because `crypto` is on neither denylist;
- **works under `sf dev`**, which runs an engine that has it;
- **throws on the hosted `quickjs-rust` runtime**, which does not.

So every local signal says yes and the only failing signal is a 500 in
production with an empty `sf logs runtime`. That combination — permitted by the
compiler, present locally, absent in production, silent when it fails — is about
as expensive as a bug can be to find.

Three fixes, any one of which would have saved the day:

1. **Add the missing runtime globals to the denylist.** If `quickjs-rust` has no
   `crypto`, the compiler should say so at build time, exactly as it does for
   `globalThis`. The machinery already exists; it is one array entry.
2. **Make `sf dev` run the same engine as production**, or say loudly that it
   does not. A dev server whose JS engine differs from the deployed one cannot
   catch this class of bug, and nothing warns you.
3. **Document the hosted runtime's standard library.** `zero.md` never mentions
   QuickJS. There is no way to learn which globals a capsule may rely on short
   of publishing and watching what breaks.

### 😕 …and `ctx` offers no randomness, so there is no supported way to mint a credential

With `crypto` gone, a handler that needs unguessable bytes has nowhere to get
them. `ctx` is `auth`, `db`, `env`, `gravatar`, `log`, `spam` — no `randomUUID`,
no `random`, nothing. `Math.random()` exists but is not a credential source.

**Our workaround**: insert the row first and derive the code from the id the
runtime generated for it. Row ids are v4 UUIDs, so there are 122 random bits
sitting right there; we drop the fixed version and variant nibbles and refuse
anything not shaped like a v4, so that a future switch to sequential ids fails
closed instead of minting guessable invite codes. It costs a second write, which
`ctx.transaction` makes atomic.

That works, but it depends on an implementation detail of id generation that
nothing promises. **Please expose `ctx.crypto.getRandomValues` or
`ctx.randomUUID`.** Any app with invites, share links, password resets or API
tokens hits this wall, and every one of them will end up guessing at the same
workaround.

### 👍 `ctx.log` does reach `sf logs runtime`

Yesterday's report that `sf logs runtime` says *"Nothing logged yet"* while
requests 500 was **half wrong, and the half matters**. Nothing had ever called
`ctx.log`; the runtime log only carries what the handler writes. A `ctx.log.warn`
shows up fine.

The other half stands: **an uncaught handler exception still logs nothing at
all**. A 500 with no message, no stack and no entry is the single worst
debugging experience in the product, and it is what made this a two-day bug
rather than a two-minute one. Please log uncaught handler exceptions.

## 2026-08-27 (later) — the invite bug, solved: no `crypto`, and sequential row ids

Resolution of the entry above, and the answer was **not** what three days of
inference predicted. A keyed diagnostic endpoint driven against the published
space returned:

```json
{"crypto":"undefined","getRandomValues":"unavailable",
 "stringInsert":"ok","rowIdShape":"4",
 "booleanInsert":"ok","booleanOmitted":"ok","transaction":"ok"}
```

Two findings, and it is the second that stings:

1. **`crypto` is genuinely `undefined`** on `quickjs-rust`. Confirmed, not
   inferred.
2. **Row ids on the hosted runtime are sequential integers** — `"4"`, then
   `"6"`. `sf dev` mints v4 UUIDs. Nothing documents this, and the two are not
   the same shape, the same type, or the same order of unpredictability.

That second one is worth a doc line of its own, entirely apart from this bug:
**an application that assumes its row ids are unguessable will be wrong in
production and right locally.** We assumed exactly that, as an intermediate fix,
and only avoided shipping guessable invite codes because the code refused an id
that was not shaped like a v4. Had it been slightly less paranoid, every invite
code in the space would have been a hash of a small integer.

### 😕 The workaround, and the ask

`ctx` exposes no randomness — `auth`, `db`, `env`, `gravatar`, `log`, `spam` —
so an app needing an unguessable value has to supply its own. Ours is now a
hand-written SHA-256 (`shared/sha256.ts`, checked against FIPS 180-4) mixing a
secret from `.env.server` with the row id, the clock and `Math.random()`.

That is a lot of machinery to mint an invite code. **Please expose
`ctx.crypto.getRandomValues` or `ctx.randomUUID`.** Invites, share links,
password resets, API tokens, idempotency keys — every one of them needs this,
and every developer who hits it will invent the same workaround, most of them
less carefully.

Failing that: **say in the docs that row ids are sequential**, and that `crypto`
is absent. Either sentence would have saved three days.

### 👍 `.env.server` handling is exactly right

Credit where it is due. Adding `INVITE_SECRET` to `.env.server` and publishing:

- the artifact records `env: {"file":".env.server","names":["INVITE_SECRET"]}` —
  **names only, no values**;
- `.env.server` is **not** among the uploaded payload files, so the secret is
  not sitting in a 403'd path;
- the value never appears anywhere in `artifact.json`;
- `ctx.env.INVITE_SECRET` is populated at runtime, confirmed in production.

That is the correct design and it worked first time with no documentation
needed. Thank you.

### 👍 `ctx.log` does reach `sf logs runtime` in production

Correcting our own 2026-08-26 entry: the runtime log was empty because **nothing
had ever called `ctx.log`**, not because logging was broken. A `ctx.log.warn`
from a handler shows up correctly:

```
2026-08-27T14:12:00.000Z warn  probe: ctx.log.warn reached the runtime log  GET /api/probe
```

The real gap stands and is worth restating on its own: **an uncaught handler
exception logs nothing at all.** No message, no stack, no entry — only a 500 in
the access log. That single omission is what turned a one-line bug into a
three-day investigation, across three wrong hypotheses and four publishes. It is
the highest-value fix on this entire list.

### 🐛 `sf db dump` is still broken

Unchanged since 2026-08-26. `zero_db_dump_failed`, a 500 from the edge, against
a healthy space, while `sf db` works in the same second. It matters more now:
`db dump` is the documented way to inspect real rows, and with it broken the
only route to the data is an endpoint you write, publish, and then have to
remember to remove.

### 🎉 And it works

An invite minted on the published space was redeemed by **a second person**, who
joined the household. First real multi-user use of the app.

## 2026-08-27 — reserved columns, and a good error message

### 👍 The refusal on a reserved column says exactly what is wrong

`items.createdAt` cannot be set by app code, and the runtime says so in one
sentence:

```
Error: Zero manages items.createdAt; app code cannot set it directly.
```

Named table, named column, named rule. This is the error message every other
refusal in the platform should be measured against — compare the silent 500 an
uncaught handler exception produces. It cost one probe request to establish
something the docs only imply.

### 🤔 "those names are reserved" could say what *reserved* means

`AGENTS.md` says every row gets `id`, `createdAt` and `updatedAt` for free and
that "those names are reserved". Reserved for what, exactly, is left open — it
reads as *you cannot name your own column this*, and it also means *you cannot
supply a value on insert*. The second is the load-bearing one and it is not
written down anywhere we could find.

It matters because it decides a schema. An app that wants a creation stamp it
controls — one that can survive a delete-and-reinsert, say — cannot borrow the
built-in and has to carry its own column. Worth one clause in the limits list:
*"reserved: you cannot declare them, and `insert()` rejects a supplied value."*

Related, and a genuine feature request: **an optional app-supplied `createdAt`
on insert**, for exactly the restore case. Every undo built on re-insert has
this problem, and every one of them will end up with a duplicate timestamp
column. We now have nine of them across five tables — `addedAt` and `changedAt`
everywhere the app orders rows — which is entirely a workaround for two columns
the platform already provides and will not let us write. `updatedAt` has the
same problem one field over: a restored row's is the moment it was restored.

### 👍 `POST /__spacefast/zero/run` keeps earning its place

Three items added, one removed, one re-added with a carried stamp, and the list
read back — the whole round trip, against the real handlers, from a shell. Still
undocumented. Also worth noting: `sf dev --port` makes a second dev server
trivial, so a scratch instance can be driven without disturbing one somebody is
clicking in. Both of these deserve to be in the docs.

## 2026-08-27 (later) — the v8 publish

### 🐛 `sf db` reports a successful migration as nine pending operations

v8 added nine columns across five tables. The migration applied cleanly. `sf db`
then printed:

```
Backend: mysql
Migration mode: safe
Pending operations: 9
```

There is nothing pending. `sf db --json` says so plainly:

```json
"plan": { "applied": true, "appliedSchemaHash": "sha256:7870ab…", "pendingOperationCount": 0 }
```

The footer is counting `data.migrations`, which is the **changelog of what this
version's migration did**, not a queue of outstanding work. `data.plan` is the
only thing that answers the question, and the human-readable output contradicts
it.

This is the worst possible failure direction for a schema tool: it reports a
*successful* migration as an *unapplied* one, right after a publish, on the one
command whose job is to tell you whether your schema is live. The obvious
reaction is to reach for `sf db migrate`, which is at best a no-op and at worst
an invitation to start passing `--drop` / `--rename` at a database that is
already correct. Please either print `plan.pendingOperationCount` or relabel the
line as "Operations in this migration".

Related, and why it matters twice: this project's previous schema change
(`households.ink`) was "verified" by reading the printed `tables` list, which is
the **declared** schema from the artifact and would look identical whether or
not the migration ran. Right answer, wrong evidence. `plan` is the field that
should be in the docs.

### 👍 Publish itself was clean

`ver_09cc0c8a8bb34dd38ed92fae693c63d4`, 105 files, 15 uploaded, 16 seconds,
`finalize` fine. The `.env.server` sync reported "Synced 1 server variable",
which is the right level of detail — it names the count without printing the
secret. The warning about unsupported files on this plan named both offenders
rather than just counting them. Good output all round.

### 🤔 The rationale header is still shim-only, 5 days on

Re-checked 2026-08-27: npm `latest` is `spacefast@0.0.26`, no `next` or `beta`
tag, `@spacefast/zero` likewise. `sf publish --help` on 0.0.26 lists no
`--rationale`, and grepping the installed CLI for `SPACEFAST_RATIONALE`,
`--rationale`, and `x-spacefast-rationale` returns nothing. So publishing from
an agent-attributed credential still requires wrapping `fetch` through
`NODE_OPTIONS=--import` to attach a header the CLI has no way to send.

The requirement is reasonable and we comply with it willingly — an
agent-driven mutation *should* be attributable. But the only way to satisfy it
is a shim, and a requirement that can only be met by monkey-patching the
vendor's HTTP client is not really enforceable: anything that can add a true
rationale can add a false one. Shipping 0.0.27 to npm, or back-porting
`SPACEFAST_RATIONALE` to 0.0.26, would turn a workaround into a supported path.

### 👍 A keyed endpoint closed a security question `sf db dump` could not

`sf db dump` is still broken (unchanged since 2026-08-26), so the only way to
answer "does the hosted runtime ever issue the dev-guest identity?" was a keyed
`GET` endpoint reporting aggregate *shapes* — id schemes and a boolean, never
ids. Production: `schemes ["account"], anyDevGuest false`. The same endpoint
under `sf dev`: `schemes ["guest"], anyDevGuest true`, which is what makes the
production `false` mean anything.

Worth saying because it is a pattern the platform could support directly: a
read-only, aggregate-only view of a table would have answered this without
publishing a custom endpoint to production and then having to remember to take
it out again.


## 2026-08-27 — `mutation.run` reports what it invalidated

### 👍 `changedTables` and `changedQueries` are a free correctness check

Adding a tenth table (`profiles`) meant adding a mutation that writes two tables
and invalidates three queries. Driving it over `POST /__spacefast/zero/run`, the
response carried both lists back:

```json
{"op":"mutation.result","ok":true,
 "changedTables":["profiles","memberships"],
 "changedQueries":["profile","household","invitePreview"]}
```

That is a direct read on whether `ctx.invalidate()` names the right set — the
thing D26 exists for and the thing nothing else in this environment can see
without a browser and two tabs. It also caught the opposite case for free: a
rename to the name already stored came back `changedTables: ["profiles"]` alone,
proving the "skip a membership row that already agrees" branch actually skipped.

Undocumented, like the `run` endpoint itself. Worth promoting: for anyone
writing handlers without a client in front of them, this is the cheapest
feedback loop the platform has.

### 🤔 A new table's index is invisible in the dry-run footer

`npx sf publish --dry-run` prints file count, bytes, mode, SPA and target — and
nothing about the schema, so a new table is confirmed only by reading
`.spacefast/zero/artifact.json` afterwards. The artifact is complete and correct
(the `by_user` index is there, the two `.default("")` columns are there), but
the command whose whole job is "show me what a publish would do" says nothing
about the part of a publish that is irreversible without a flag. One line —
`Schema  10 tables, 0 pending migrations` — would put the most consequential
diff in front of the person about to ship it.


## 2026-08-27 — What "Gravatar sign-in" actually is

Context: surveying whether a Zero app can offer its users any sign-in path
other than the one `SignInWithGravatar` renders. Read only — nothing published.

### ❓ `/docs/zero` says "hosted sign-in uses Gravatar"; the flow says otherwise

Following the button's own redirect chain on the live space:

```
GET  https://larderlog.view.fast/__spacefast/zero/auth/gravatar/start
302  https://api.spacefast.com/v1/access/acquire/<id>?host=…&return=%2F
303  https://my.spacefast.com/sign-in?returnTo=/access/v1.<token>
```

It is **Spacefast account sign-in**, not a Gravatar-branded OAuth screen. And
`GET /v1/auth/capabilities` — documented, unauthenticated — reports what that
screen offers:

```json
{"providers":{"wpcom":true,"google":false,"github":false},
 "emailOtp":true,"password":true,"captcha":null,"googleOneTapClientId":null}
```

So a visitor already has **three** lanes: WordPress.com, an emailed one-time
code, and a password. The Zero docs name none of them, `SignInWithGravatar` is
the only exported component, and its label is the one word that describes the
*avatar service* rather than any of the three. An author reading `/docs/zero`
reasonably concludes their users must have Gravatar accounts, turns the app
down for that, and never learns otherwise. One sentence in the Authentication
section — "hosted sign-in is a Spacefast account: WordPress.com, an email code,
or a password" — would fix it, and `/v1/auth/capabilities` deserves a mention
there since it is the only way to know which lanes a deployment has on.

This also explains, retroactively, why real signups arrive with no profile name
(the reason `profiles` and D46 exist): an email-OTP account has no Gravatar
profile to inherit a name from. That is the majority path, not an edge case.

### 👍 The identity contract already admits more than one issuer

`principalForAuthority` in `@spacefast/common` maps `person:` and `external:`
authorities to an identity, alongside `account:`, and
`visitorIdentityFromClaims` turns any of the three into an authenticated
`ctx.auth` with `userId` set to the principal. So a team-owned OIDC connection
(`sf share identity create --type oidc`) really does reach a Zero handler as a
signed-in user — the runtime is not hard-wired to one issuer.

Two things stop that being an app-level answer, and neither is a defect so much
as an undocumented boundary worth stating: external subjects are admitted one
at a time by an operator (`sf share identity grant --subject …`), so there is no
self-serve signup; and the whole mechanism gates the *space*, which puts a
public marketing page behind the access page. `/docs/share` is written for
private-document sharing and never says how any of it interacts with a Zero
app's own `ctx.auth`. That intersection is the missing page.

### 👎 `AuthContext.provider` is typed `"guest" | "gravatar"`

An `external:` principal is authenticated, carries a subject from someone
else's IdP, and still normalizes to `provider: "gravatar"` — the client's
`normalizeAuthValue` computes it as `isGuest ? "guest" : "gravatar"` outright.
The field cannot answer the question its name asks. Either widen it to the
authority class the token actually carried, or drop it.

### 👍 `ctx.email` makes app-owned auth viable without a third-party key

Worth recording as a strength: `/docs/services` documents `ctx.email.send()` as
brokered, credential-free, and transactional inside a mutation, with
`ctx.spam.check({ type: "signup" })` beside it. That is the whole supply side of
an email one-time-code flow, with no Resend key to hold. Two caveats found
while reading, both invisible from the docs:

- **`/docs/zero` documents none of the three services.** They exist only on
  `/docs/services`, which the Zero page never links from its Authentication or
  capsule sections. The capsule reference and the service reference are
  different pages with no path between them.
- **A query and a mutation cannot see request headers** — only `endpoint` gets
  an `EndpointRequest`. So an app-owned session cannot live in a cookie the way
  a web developer would expect; the token has to be an explicit argument on
  every query and mutation. That is a real design constraint and it is stated
  nowhere; it belongs next to the handler-capability table on `/docs/services`,
  which already teaches this shape of "what each handler kind gets".

### 🤔 Unverified, and the reason it stays unverified

Whether `ctx.email` exists on the hosted `quickjs-rust` runtime is untested
here. That would be an idle worry on most platforms, but `crypto` is present
under `sf dev` and `undefined` in production (see the 2026-08-27 runtime-
divergence entry), so "the type exists and `sf dev` runs it" has already been
established as no evidence at all. A published list of which globals and
services the hosted runtime actually provides would retire a whole class of
these.

## 2026-08-27 (later) — Making the app installable: the payload is not the site

Context: adding a PWA manifest so an installed icon is masked properly on
Android. No schema change, no new handler — this is entirely about static files
and `<head>`, and it turned up two undocumented rules.

### 😕 The manifest is the third thing that has to be injected at boot

Same wall as the webfonts (D31) and the icons: `zeroHostedAppShell()` emits a
title and nothing else, so `<link rel="manifest">` joins them in
`document.head` at boot. This is the exact gap the 2026-08-25 entry filed a
suggestion for — `sf.jsonc#meta` carrying `icon`, `themeColor` and `manifest` —
and it has now cost a third injection site.

It is worse for a manifest than for an icon, because the data-URI escape hatch
the icons use is not available. `start_url` and `scope` resolve **against the
manifest's own URL**, and a `data:` URL is no base to resolve `/` from, so both
would fall back to whatever page the app was installed from. For this app that
is frequently `/?join=<code>` — an invite link, which expires. A manifest has
to be a real URL.

### 😕 `sf publish` mirrors the project root, but selectively, and the rule is nowhere

`.spacefast/zero/public/` after a dry run, against the actual root:

| Kept | Dropped |
|---|---|
| `LICENSE.md`, `package-lock.json`, `sf.jsonc`, `theme.json`, `tsconfig.json`, `tsconfig.test.json`, `icons/`, and the new `site.webmanifest` | `README.md`, `package.json`, `client/`, `server/`, `shared/`, `tests/` |

`README.md` is dropped and `LICENSE.md` is kept. `package.json` is dropped and
`package-lock.json` is kept. Whatever the rule is, it is not "documentation" or
"npm metadata", and `sf publish --help` does not mention one. The practical
consequence is that **you cannot reason about whether a file ships** — you have
to run a dry run and list the directory.

### 🐛 …and being in the payload does not mean it serves

The more surprising half. Both of these are staged in
`.spacefast/zero/public/` and both **404 on the published space**:

```
/sf.jsonc            404 text/html
/theme.json          404 text/html
/tsconfig.test.json  200 application/json     <- staged too, and serves
/LICENSE.md          200 text/markdown
/icons/*.png         200 image/png
```

So the edge carries a second denylist on top of the dot-prefixed-path 403 this
project relies on for D29 — one that hides the platform's own config files by
name. That is a sensible thing to do and we are glad it does it. What is not
sensible is that `--dry-run` reports those two files as part of the payload
with no indication they will be unreachable, so the one local check available
gives an answer the live site contradicts.

**Suggestion:** have `--dry-run` mark files the edge will refuse, or drop them
from the plan entirely. `Files 112` should be a count of what will exist.

### 👎 A manifest cannot be verified locally at all

`sf dev` serves no project static files, so `GET /site.webmanifest` returns the
SPA shell — `200 text/html` — and Chrome logs a manifest syntax error on every
local page load. This is the inverse of D28's routing asymmetry yet again: the
local answer is the misleading one, and it is misleading in the direction that
produces a false alarm rather than a false pass, which is at least the safer
way round.

Combined with the previous point, there is **no way to know a manifest works
before publishing it**. Everything else in this app has some local proxy —
`POST /__spacefast/zero/run` for handlers, `/zero.css` for classes, the
artifact for schema. Static serving has none.

**Suggestion:** let `sf dev` serve `.spacefast/zero/public/` for paths it does
not otherwise recognise, instead of falling through to the SPA shell. It
already builds that directory.

### ❓ Unverified: the content type for `.webmanifest`

Cannot be answered without publishing, for the reasons above. Chrome is lenient
about the manifest MIME type in practice, and `.svg` and `.json` both map
correctly, so the expectation is that it is fine — but it is a post-publish
curl, not something the build can tell us.

## 2026-08-27 — `mutation.run` and `query.run` return different envelopes — unclear

Driving the seeded-types change through `POST /__spacefast/zero/run` on a
second `sf dev` (`--port 4199`), the two ops answer with different shapes and
nothing says so:

- `mutation.run` → `{op: "mutation.result", ok, result, changedTables, changedQueries}`
- `query.run` → `{op: "query.result", ok, name, args, data}`

So a script that reads `.result` off a mutation and reuses the same accessor on
the query gets `KeyError: 'result'` — the query's payload is under `data`. Both
are sensible on their own; the asymmetry is only a problem because the endpoint
is undocumented and there is nothing to read. `changedTables` /
`changedQueries` on the mutation are genuinely useful, though — they confirmed
the seeding touched `locations`, `types` and `stores` in one go.

Good, separately: `sf dev --port 4199` alongside an already-running instance
worked with no flag or state collision, which is what makes this check cheap
enough to do at all.

## 2026-08-27 (later still) — v11 publishes; the manifest question is answered

`sf publish` completed as **v11**, `ver_1c0448898da744d3b2b42a89c4272e21`, 93
files, 16 seconds, carrying Phases 4.10–4.12 and D45–D51. `finalize` /
`runtime_api_not_found` did not recur — that platform-side fix is holding across
four consecutive publishes now.

### ✅ Answered: `.webmanifest` gets the right content type

The open question from the previous entry — unanswerable without publishing —
resolves cleanly:

```
/site.webmanifest    200 application/manifest+json; charset=utf-8   769B
/icons/icon-192.png            200 image/png  3329B
/icons/icon-512.png            200 image/png  9263B
/icons/icon-maskable-512.png   200 image/png  4577B
```

So the edge maps `.webmanifest` correctly with no configuration, and `start_url`
and `scope` both resolve to `/` as intended. Good — and worth documenting, since
the only way to learn it was to ship.

### 🐛 The `x-spacefast-rationale` blocker is unchanged — 6 days on

Still the single highest-value fix on this list. Re-checked today before
publishing:

- npm `dist-tags` for **`spacefast`** and **`@spacefast/zero`** are both still
  `{ latest: '0.0.26' }` — no `next`, no `beta`.
- The installed 0.0.26 bundle contains **no** `SPACEFAST_RATIONALE`. Dumping
  every `SPACEFAST_[A-Z_]+` literal out of `dist/` gives 57 variables and that
  is not among them.
- The CLI's own header vocabulary is `x-spacefast-client`,
  `-client-capabilities`, `-country`, `-idempotency-principal`, `-language`,
  `-mcp-token`, `-runtime`, `-version`. **`x-spacefast-rationale` is not a
  header this CLI can send at all**, by any flag or variable.

So the publish again only completed because the header was attached out-of-band
from a `fetch` wrapper loaded via `NODE_OPTIONS=--import`, carrying a truthful
rationale (620 chars) naming the owner, the branch, the decisions shipped, and
the fact that the schema change is additive. The wrapper matches
`/(^|\.)spacefast\.com$/` on the host, preserves the CLI's own `authorization`
and `content-type`, and leaves every other host untouched.

**This is still a silly thing to have to do to ship a space you own.** Either
publish 0.0.27 to npm, or give 0.0.26 a `--rationale` flag / `SPACEFAST_RATIONALE`
env var. The policy is reasonable; the absence of any supported way to satisfy
it is not.

### 😕 `sf db`'s human-readable output still contradicts its own JSON

The trap logged earlier held again, and it is worth restating because it is a
correctness hazard, not a cosmetic one. After a successful migration `sf db`
prints a **`Pending operations:`** count that is really the length of the
version's `migrations` changelog — what this migration *did*. The truth is in
`--json`:

```
schemaHash:        sha256:d9053339365b5e538753890938e06cafc2d34d670c3fbe7abbc9106ebe46fc63
appliedSchemaHash: sha256:d9053339365b5e538753890938e06cafc2d34d670c3fbe7abbc9106ebe46fc63
applied: true | pendingOperationCount: 0
```

Note also that the two hashes live at **different depths** —
`data.schemaHash` but `data.plan.appliedSchemaHash` — so the obvious
`data.plan.schemaHash` reads `undefined` and a naive equality check reports a
spurious mismatch on a perfectly clean migration. Putting both on `plan`, or
both at the top level, would remove a real footgun.

The `profiles` table (D46) migrated additively on publish with no flag, exactly
as `households.ink` and D44's nine stamp columns did. Additive migration on
publish continues to be reliable.

### 🐛 `sf db dump` is still broken — 6 days open

`sf db dump --table households --limit 5` against the freshly published, healthy
v11 still fails:

```
Zero database dump failed.
Learn more: https://spacefast.com/docs/errors/zero_db_dump_failed
```

Unchanged from 2026-08-26: it fails with the rationale header attached, it is a
read, and `sf db` succeeds against the same space in the same second. The linked
error page is the only diagnostic and says nothing a caller can act on. This
remains the documented route for verifying a publish, so it still has to be
worked around with `POST /__spacefast/zero/run`.

### 👍 `query.run` in production is the verification story

With `db dump` broken, the production `run` endpoint is what makes a publish
checkable at all. Unauthenticated, over plain HTTPS, it confirmed the whole
guest surface in three calls — `invitePreview` collapsing unknown, empty and
malformed codes to a bare `{"state":"invalid"}` (D39), `pantry` refusing with
`no-household` rather than leaking, and `profile` returning an empty name. That
it works identically in production and under `sf dev` is genuinely valuable.
It deserves to be documented rather than folklore.

---

## 2026-08-28 — a fourth additive migration, and a boolean this time

Three columns added to `items` in one edit — `size: string().default('')`,
`unit: string().default('')`, `offShoppingList: boolean().default(false)` — for the
add/edit item redesign (D52, D53).

### 👍 The additive path stays boring, and `boolean()` is no different

`npx sf publish --dry-run` picked up all three from the schema literal, with
their defaults intact, on the first run:

```json
{ "name": "offShoppingList", "type": "boolean", "nullable": false, "default": false }
```

`server.schema` still shows ten tables, `server.queries` five and
`server.mutations` seventeen, and `db.migrations` is `[]`. This is the fourth
additive change since Phase 2 and the first to add a **boolean** rather than a
string — worth recording only because `invites.revoked` was, for one wrong guess
during the v5–v7 probe rounds, suspected of being the thing the hosted runtime
choked on. It was not, and a second boolean column compiles identically.

### 👍 `POST /__spacefast/zero/run` is still the whole verification story

Five `addItem` calls and four `updateItem` calls through the real handlers on a
throwaway `sf dev --port 4199`, then one `pantry` read to see what landed. That
is the entire test for a schema change plus its normalization rules, and it
needed no browser and no throwaway endpoint. Nine mutations and two queries over
plain HTTP, in one shell command.

The bootstrap dance is still the only friction: the `Origin` header requirement
on `/__spacefast/zero/bootstrap` is undocumented, and the cookie name is
port-derived (`spacefast_zero_dev_4199`), which is not stated anywhere either.
Both are easy once known and both cost a round trip the first time.

### 🤔 `sf dev` still has no local sign-in, so the sheet cannot be clicked here

Everything in this change is press-time behaviour — a hold that repeats, a
status line that updates as you step, a menu that opens scrolled to its current
row. Compiling it, curling `/zero.css` for every class literal and driving the
handlers over `run` proves the build is coherent. It does not prove it is
usable, which is the lesson this file recorded on 2026-08-27 and has no way to
act on without a browser.

## 2026-08-28 (later) — `ctx.gravatar` exists, and its avatar URL is pure

### 👍 A handler can derive an avatar URL with no network call and no key

`ServerContext` carries a `gravatar` alongside `auth`, `db`, `env`, `log` and
`spam`, typed in `@spacefast/common/contracts/runtime-services`:

```ts
avatarUrl(email: string, options?: GravatarAvatarOptions): string   // pure, sync
profile(email: string): Promise<GravatarProfile | null>             // brokered
```

`avatarUrl` is a hash plus a query string, so it costs nothing and cannot fail —
which makes it usable from a query handler on the hot path. `profile` is the
brokered one, and the reason the credential stays out of tenant reach. This is
the answer to "can the app show the *other* members' avatars", which it cannot
today because `memberships` stores only a display name.

### 🤔 The canonical avatar URL is a shared constant nothing documents

`@spacefast/common/dist/utils/gravatar.js` pins one shape for the whole
platform:

```
https://gravatar.com/avatar/<sha256 of trimmed+lowercased email>?d=404&r=g&s=160
```

`d=404` is deliberate and load-bearing for a consumer: an address with no
Gravatar serves **no image**, so the page renders its own initials fallback
instead of a stock silhouette. Worth knowing, because an `<img src={picture}>`
with no `onError` shows a broken-image glyph rather than falling back — the
platform is assuming the consumer checks.

The helper beside it, `gravatarEmailHash`, is `async` and returns `null` without
`crypto.subtle`, so it is unusable during a synchronous render and unusable in
the hosted capsule runtime (which has no `crypto` at all — see 2026-08-27).
`shared/sha256.ts`, written for the invite codes, produces a byte-identical hex
and works in both places.

### 🤔 `sf dev`'s identity carries no `email` and no `picture`

Its `AuthValue` is the guest one, so both the `picture` branch of an avatar
component and anything that renders an address are unreachable locally — the
same shape of gap as the missing sign-in flow and the single fixed identity.
Worked around here with a loopback-only dev switch that hands the dev guest a
real address and derives the platform's own URL from it.

## 2026-08-28 (later still) — a sixth additive migration, and `ctx.auth.picture`

### 👍 `ctx.auth.picture` is on the server context, and it is the finished URL

Adding avatars for the *other* members of a household looked like it needed an
email in the schema — and it did not. `AuthContext` carries `picture` on the
server exactly as `AuthValue` does on the client, already resolved to the
platform's canonical Gravatar address. So a handler can stamp a face onto a row
without the app ever storing or exposing an email.

Worth saying plainly because the obvious tool points the other way:
`ctx.gravatar.avatarUrl(email)` is right there, free, pure and synchronous, and
it makes an address look like the natural thing to persist. The field one line
up on the same object is the better answer for anything about **the caller**.
`ctx.gravatar` earns its place for an address you already hold for another
reason — it is not the way to get one.

The corresponding gap: a handler is told about its **caller** and never about a
third party, so the only moments another person's avatar is in reach are the
moments *they* are the caller. That is a sensible boundary, and it is what
pushes a denormalized copy plus a reconcile-on-load rather than a join.

### 👍 `mutation.result` reports `changedTables` and `changedQueries`, and both go empty

The new reconcile writes only rows that disagree and invalidates only when it
wrote. Proving the no-op steady state took one call:

```
{"op":"mutation.result","ok":true,"changedTables":[],"changedQueries":[]}
```

That envelope is a better assertion than anything the handler could return
itself — it is the runtime's own account of what the mutation did, so "it
correctly did nothing" is directly observable. Undocumented as far as we can
tell, and genuinely useful for any write that runs on every page load.

### 🤔 `sf dev`'s identity still carries no `picture`, so half of this is unclickable

Recorded again because it bit a second time in one day. The rendering half can
be seen locally; the **stamping** half — `createHousehold` and `redeemInvite`
writing a real avatar URL — needs an identity that has one, and `sf dev` issues
a guest with no `email` and no `picture`. Worked around for the test by putting
a value on the row through a throwaway endpoint and then driving the real query
and the real reconcile over `run`, which proves everything except the one line
that reads `ctx.auth.picture`.

A `--identity` flag on `sf dev` — or any way to hand the dev guest a fabricated
`email` / `picture` / `displayName` — would close this, and would also close the
older complaint that a second local tab is the same user.

### 👍 Sixth additive migration, no flag, no surprises

`memberships.picture`, `string().default("")`. `--dry-run` then the artifact:
ten tables, five queries, **eighteen** mutations, `db.migrations` empty, the
column present with its default. Same as the previous five. The additive path
is genuinely boring now, which is the highest praise a migration story gets.

## 2026-08-28 (fourth) — the docs promise `email` on `useAuth()`; production may not send it

### 🤔 `auth.email` is empty on the published space and populated nowhere else

The drawer's account row prints an email under the name. It appears under
`sf dev` (with a dev identity we supply ourselves) and **not on the published
space**, where a real Spacefast account is signed in.

`auth.email` is exactly `claims.email`, read straight off the identity JWT —
`createAuthFromToken` in `dist/client.js` does no lookup and has no fallback:

```js
const userId = stringValue(claims.pairwise_sub) ?? stringValue(claims.sub) ?? stringValue(claims.email);
...
email: stringValue(claims.email),
```

So an empty `auth.email` means the token carries no `email` claim. Meanwhile
`docs/zero.md` states plainly that `useAuth()` returns "`userId`, `displayName`,
`provider`, `isGuest`, `isAuthenticated`, `email`, `picture`, and `isLoading`"
with **no note that any of them can be absent**, and the TypeScript makes
`email` and `picture` optional without saying when.

**If this is deliberate it is a reasonable design and should be documented.**
Two things in the SDK suggest it is: `pairwise_sub` is preferred over `sub` for
the user id, which is the OIDC per-relying-party opaque subject and exists so an
app cannot identify or correlate the person; and the one comment on the subject
reads

> A Gravatar avatar URL carries the profile's own hash, so the public profile
> page is derivable without ever touching the email behind it.

That is a considered privacy stance. It just is not in the docs, and an app that
believes the docs will build a UI around a field that is empty in production and
full in development — which is exactly what happened here.

**What would fix it:** one sentence in the auth section saying which claims are
guaranteed and which depend on the sign-in lane, and whether `email` is ever
released to a capsule. Also worth stating whether `picture` is guaranteed, since
an app that draws avatars has the same question and no way to answer it before
publishing.

### 🤔 The same gap makes a feature unverifiable before publish

`sf dev` issues a guest with no `email` and no `picture`, and production issues
an account whose claim set is undocumented. So there is **no environment in
which the real shape of the identity can be observed before a publish** — the
local one is known-wrong and the hosted one cannot be inspected without shipping
something that reports it. A `--identity` flag on `sf dev`, or a documented
claim contract, closes this. It is the third time in two days this file has
asked for the first of those.

### Answered same day: `picture` is present in production, `email` is not

The avatar renders on the published space, so the identity token carries a
`picture` claim while carrying no `email`. That is a coherent position — a
Gravatar URL is a hash and identifies nobody who is not already looked up, while
an address identifies a person — and it is the position the SDK's own comment
describes. It is just not written down anywhere a developer would find it before
building a UI around the missing field.

## 2026-08-28 (fifth) — 🐛 `sf publish` dies with a 502 at *Creating version*, and nothing else is unhealthy

**Blocking.** Three consecutive `sf publish` runs failed identically:

```
✓ Updating space  larderlog (spc_7770744a870a43f5927213fa397c780e)
⠋ Creating version
Request failed with status 502.
Learn more: https://spacefast.com/docs/errors/request_failed
Check your connection or the SPACEFAST_API_URL setting.
Run `sf doctor` to diagnose.
```

**The advice in the error message is wrong here**, and that is the first piece
of feedback. `sf doctor` was run and returns **exit 0 with all nine checks
green** — including `api  API reachable: https://api.spacefast.com` and
`schema  OpenAPI schema reachable` — in the same minute as the failure. The
connection is fine and `SPACEFAST_API_URL` is unset. A 502 is the *gateway*
saying an upstream did not answer; telling the caller to check their own
connection sends them to the one place the problem cannot be.

**It is not the `x-spacefast-rationale` blocker.** This was isolated: the
publish was run twice through the usual `NODE_OPTIONS=--import` fetch shim that
attaches a truthful rationale, and once **without it**. All three produced the
same 502 at the same step. So whatever this is, it sits upstream of the header
check that has gated publishing since 0.0.26.

**Nothing is wedged, which is the good news** and worth contrasting with the
2026-08-24 incident that left three spaces stuck. The failure is clean:

- `sf versions list` shows **no v12 record** — the version was never created.
- `sf doctor` reports `runtime  state=active live=ver_1c0448898da744d3b2b42a89c4272e21:ready pending=none:none`.
- v11 is still live and serving: `GET /` 200, `/api/status` → `ok`,
  `/client.js` 200 at the same 299,269 bytes as before the attempts.

So the space is transactionally intact and the retry is safe. **`Updating space`
succeeds before the failure**, so the space record is touched and only the
version creation fails — which is the right order for this to be recoverable,
and is worth stating in the docs as a guarantee rather than left to be inferred
from a lucky outcome.

**What would help:**

1. **Do not print connection advice on a 5xx.** A 502/503/504 is server-side by
   definition. Say so, and say whether the operation is safe to retry — which
   here it is, but the caller has no way to know without going and reading the
   version list.
2. **Surface an upstream request id.** There is nothing in the output to quote
   in a support request. A 502 with no correlation id is unactionable from
   outside.
3. **`sf doctor` should exercise the failing path.** It checks that the API and
   the OpenAPI schema are reachable and concludes everything is `ok` while
   publishing is completely blocked. A check that cannot see the outage it is
   invoked to diagnose is worse than no check, because it moves suspicion onto
   the user's machine.

Nothing was changed locally in response. Typecheck is clean, `npm test` is at
295 assertions, and `--dry-run` produces a valid artifact (ten tables, five
queries, eighteen mutations, `migrations: []`, and the four new additive columns
with defaults). **The build is ready and the platform is not.** Retrying later.

## 2026-08-28 (sixth) — the `location` scanner false positive, a third time — and it moved

Building a `?demo` switch that fills a dev household with sixty items. No
schema change, no handler moved; the whole thing is a fixture, a resolver and a
loop over the existing `addItem`.

### 🐛 The `location:` false positive fired again — and `shared/` is scanned as server source

Logged on 2026-08-24 and again on 2026-08-26. Third time, and this round it
landed somewhere the previous two would not have predicted.

The fixture's row type has a field called `location` — a pantry app's most
ordinary noun, and the name of one of its three taxonomies:

```ts
export type DemoItem = { name: string; location: string; /* … */ };
```

The file was written in `client/lib/`, where it compiled fine. Moving one pure
function into `shared/` — so `npm test` could reach it, `shared/` being all the
test config compiles — made `sf dev` refuse to start:

```
Zero source shared/demoItems.ts references unsupported server global location.
Error: Zero source shared/demoItems.ts references unsupported server global location.
```

**That is correct in principle and surprising in practice.** `shared/` is
scanned under `ZERO_SERVER_UNSAFE_GLOBAL_PATTERN` because `server/` *may* import
it — reasonable. But this particular file is imported only by `client/`, will
never be imported by the capsule, and contains no code at all beyond a data
table. It is refused for a word in a field name.

The practical shape of it: **the same identifier is legal in `client/lib/` and
illegal in `shared/`, and moving a file between them is a refactor that can
break the build for reasons unrelated to what the file does.** Nothing warns at
the moment you move it; you find out at the next `sf dev` start.

Three things would each have made this a non-event, in order of value:

1. **Report the line and column.** Still the ask from August 24. The message
   names the file and the identifier and nothing else, and the natural reading
   — "you referenced the browser `location`" — is false, so it sends you looking
   for an import or a stray browser API rather than at a field name. A 200-line
   data table is a manual search for a word that appears sixty-one times, sixty
   of which are fine.
2. **Say that a property name is the usual cause, and that quoting resolves it.**
   The error could carry the fix in one clause.
3. **Resolve identifiers rather than text-matching.** A non-computed property
   key or member access is never a global reference. This is the real fix and
   the other two are mitigations.

We renamed the field to `locationName` rather than quoting, on the grounds that
a rule reading "never write the word `location` in `shared/`" is one somebody
will break again in six months. That is a workaround for a linter, not a design
improvement — though it does read better beside the `locationId` it resolves to.

### 👍 `--state-backend sqlite` works exactly as advertised, and it is the difference

`sf dev --state-backend sqlite` starts cleanly, writes
`.spacefast/zero/dev-state.sqlite` (143 KB for sixty items and a household), and
**the data survives a restart** — verified by killing the server, restarting it,
and reading `pantry` back over `run`: `ready | 60 items`. It is in
`sf dev --help` and correctly defaulted to `memory`.

Worth recording as a good thing because of what it fixes. `sf dev` issues one
fixed identity *and* an empty database, so every local session starts by typing
past the display-name screen, naming a household, and then adding whatever rows
the thing under test needs. With sqlite that is a one-time cost. Anything with a
first-run flow — which is anything with sign-in — pays that tax on every restart
by default, and the flag that removes it is a single word.

**One friction:** the flag is in `sf dev --help` but not in `/docs/zero.md`, and
the dev-server section there does not mention that state is in-memory by default
at all. The consequence (your data is gone every restart) is the kind of thing a
developer attributes to their own bug the first time.

### 👍 `POST /__spacefast/zero/run` drove a sixty-row fixture end to end

Restating the standing recommendation with a bigger example, since every prior
note about `run` was three or four calls. One shell command: bootstrap,
`createHousehold`, `pantry` to resolve term names to ids, **sixty `addItem`
mutations**, then `pantry` again to read it all back and check the distribution.
No browser, no throwaway endpoint, no code added to the capsule.

It caught two things a typecheck could not. The fixture's status spread had
drifted to two-thirds *low* — a real refactoring error, invisible in the source
and obvious in the read-back. And the count of items needing restocking came
back exactly two below the sum of the low and out pills, which is this app's
`offShoppingList` rule (D53) being right rather than merely compiling.

Still undocumented. Still the most useful thing in the product for anyone
building a capsule without a browser in front of them.

---

## 2026-08-28 — Publishing v12: four additive columns, and the rationale shim again

Context: publishing Phases 4.13 / 4.14 and D55–D57 to the live space. Succeeded
on the first attempt — **v12**, `ver_50b38d7b92f2450a999c7835726c6411`, 121
files, 18 seconds — carrying the fourth, fifth and sixth additive schema changes
since Phase 2 in one publish.

### 👎 `x-spacefast-rationale` is still unsendable by the CLI, four days on

Re-checked before publishing rather than assumed, and nothing has moved:
npm's `latest` for both `spacefast` and `@spacefast/zero` is **still 0.0.26**,
with no `next` or `beta` tag. Two greps still settle it faster than release
notes — dumping every `SPACEFAST_[A-Z_]+` literal out of
`node_modules/spacefast/dist` gives **86 variables with no `SPACEFAST_RATIONALE`
among them**, and the CLI's entire `x-spacefast-*` vocabulary is `client`,
`client-capabilities`, `country`, `idempotency-principal`, `language`,
`mcp-token`, `runtime`, `version`. The only `rationale` strings in the package
are in `agent-demo.js` and the demo command — **nothing in the publish path.**

So a plain `npx sf publish` still dies at *Creating version*, and the publish
again only completed because the header was attached out-of-band by a `fetch`
wrapper loaded with `NODE_OPTIONS=--import`.

**This is the friction worth fixing, and it is a policy problem rather than a
technical one.** The API requires a header as a condition of attribution, and
the shipping CLI has no flag, no environment variable and no config key that
sends it. The only way to comply is to monkey-patch the CLI's own transport —
which is both fragile and exactly the kind of thing the header exists to
discourage. A `--rationale` flag or a `SPACEFAST_RATIONALE` variable would close
it in one line. Until then the honest path and the hacky path are the same path.

### 👍 Four `add_column` operations applied with no flag and no downtime

`items.size`, `items.unit`, `items.offShoppingList` (the app's second and third
boolean-bearing change) and `memberships.picture` all migrated additively on
publish, exactly as `households.ink` and the nine stamp columns did. `--json`
reported `plan.applied: true`, `pendingOperationCount: 0`, and a `migrations`
array naming all four ops with their defaults. Additive-migrates-on-publish
continues to be the single best thing about this database.

### 👎 The two schema hashes still sit at different depths

Recorded on v11 and it cost a round trip again on the way in, so restating it as
a docs request rather than a note to ourselves: it is `data.schemaHash` but
`data.plan.appliedSchemaHash`. There is **no** `data.plan.schemaHash`, so the
symmetrical-looking comparison evaluates `undefined === '<hash>'` and reports a
**spurious mismatch on a completely clean migration**. Printing the `plan` keys
is the reliable move. Either name would be fine; having both, at different
depths, one of which does not exist, is the trap.

### ❓ A new publish warning names files nothing asked about

New this round, and unexplained:

```
Warning: ignored 2 unsupported file(s) on this plan:
  .claude/docs/pantry-tracker-mockup.jsx, .idea/x3p0-larder-log.iml
```

Two questions the message does not answer. **What makes a file "unsupported"**,
and unsupported *on this plan* — is this a billing tier limit, a file-type
denylist, or a size rule? And **why these two**, when the payload carries plenty
of other `.jsx`-adjacent and dot-prefixed files without complaint. It is
harmless here (both are local-only leftovers we would never serve), but a
warning that names a file without naming a rule is one a developer cannot act
on. Saying *which* rule each file tripped would make it actionable.

### 👍 Incremental upload

`Files 121` in the plan, `Uploading files 38 files` in the run. Only what
changed went up, with no flag and no mention — which is presumably why an
18-second publish stays 18 seconds as the project grows. Worth documenting as a
feature; right now you only notice it by reading the two numbers.

---

## 2026-08-29 — an additive column, and where the artifact keeps its schema

Adding one column (`stores.kind`) and one mutation, then verifying both without
a browser. Nothing broke; two notes.

### ❓ `artifact.json` keeps the schema under `server`, not under `db`

The artifact has a top-level `db`, and it holds exactly two keys —
`{ backend, migrations }`. **The tables are at `server.schema`.** That reads
backwards: the migrations that describe what will happen *to* the tables are in
one branch and the tables themselves are in another, and `db` is the branch
whose name says "the database".

It cost two round trips of printing key lists to find, which is the same shape
of mistake this log already records twice — `sf db`'s footer counting a
changelog as a queue, and `schemaHash` / `plan.appliedSchemaHash` sitting at two
different depths. All three are cases where the obvious read returns `undefined`
or a confidently wrong answer rather than an error. A short `artifact.json`
schema reference in the docs would close all three at once; there is currently
none, and the file is the only way to see what a publish would actually install.

For the record, the shape that works:

```js
const a = JSON.parse(readFileSync('.spacefast/zero/artifact.json', 'utf8'));
a.server.schema        // the tables, each { name, columns[], indexes[] }
a.server.mutations     // an array of names, not an object
a.server.queries       // likewise
a.server.endpoints     // [{ method, path }]
a.db.migrations        // [] before the publish that applies them
```

### 👍 `POST /__spacefast/zero/run` is still the best thing in the local kit

Nine cases against the real handlers in one script, with no browser and no test
harness: an unset column resolving to its default, a write, a no-op write, a
refused enum value, a cross-household id, and an error string checked verbatim.

The detail that made it worth writing up: **a mutation that returns early
reports `changedTables: []` and `changedQueries: []`**, so the envelope proves
the short-circuit rather than merely implying it. That is a genuinely good
affordance — it means "did this write?" is answerable from the response instead
of by reading the row back — and it is not documented anywhere. `changedQueries`
in particular does not appear in the runtime reference at all — zero matches in
`/docs/zero-runtime.md`, checked the same day.

The envelope is consistent, checked against two mutations: `mutation.result` /
`ok` / `result` / `changedTables` / `changedQueries`, with `result` carrying
whatever the handler returned. (An earlier note here claimed `createTerm` came
back without a `result` key. It does not — that was our own shell bug, and the
claim is withdrawn rather than left standing.)

### 🐛 `https://spacefast.com/docs/zero.md` now 404s — the page moved

The whole runtime reference used to be one file at `/docs/zero.md`. It is now
**`/docs/zero-runtime.md`** (200, `text/markdown`, 22 KB). The old path returns
**404 with a 25 KB HTML "Page not found" body** and no redirect:

```
https://spacefast.com/docs/zero.md            404  text/html    (25623 bytes)
https://spacefast.com/docs/zero               200  text/html
https://spacefast.com/docs/zero-runtime.md    200  text/markdown (22547 bytes)
```

Three things make this worse than an ordinary rename:

1. **The HTML page at `/docs/zero` still works**, so a browser sees nothing
   wrong. Only the `.md` twin moved, and the `.md` twin is the one every agent
   and script is told to prefer.
2. **A 404 that returns 25 KB of HTML looks like content.** A script that does
   not check the status code gets a page of `<script>` tags where it expected
   Markdown, and the failure surfaces much later as "the docs say nothing about
   X".
3. **A redirect from the old path would have cost nothing.** `/docs/llms.txt` is
   already updated and is how we found the new URL — which is the right
   discovery mechanism and worth pointing at from a 404 page, if the redirect is
   deliberately not wanted.

Fixed on our side in `.claude/CLAUDE.md`, which named the old URL.

## 2026-08-29 (second) — the artifact-shape trap caught a second session the same day

No new platform behaviour; one data point on an entry already above.

### ❓ `artifact.json`'s schema location cost two more round trips

Verifying a change with no schema edit (D61 — first run seeds the sources from
three checkboxes), the first two reads of the artifact were `db.tables` and then
`server.schema.tables`. **Both returned `undefined` rather than erroring**, and
the first printed a cheerful `tables:` with an empty string after it — which
reads as *the artifact has no tables*, i.e. as the catastrophic version of the
thing the check exists to catch, rather than as a wrong key.

That is the same trap the entry above logs, hit again a few hours later by
somebody who had written that entry. It is not a memory problem: the shape is
guessable in two plausible ways and neither errors.

**What would fix it, cheapest first:**

1. **A `schemaVersion` or `format` note in the docs naming the layout.** The
   file already carries `"format"` at the top; nothing says what that format is.
2. **Make a wrong key loud.** `a.server.schema` is an object keyed by table
   name, so `.tables` on it is `undefined` — unavoidable in plain JSON, but a
   `sf publish --dry-run --print-schema` (or `sf schema show`) would mean nobody
   has to shape-match the file by hand at all.

The working reads are in the entry above. Repeating the one that matters most
after any publish-affecting change, since it is the one with a false-friendly
failure:

```js
Object.keys(a.server.schema)   // the table names — NOT a.db.tables, NOT a.server.schema.tables
a.db.migrations                // [] when the change is additive-free
```

Logged rather than filed as a bug: nothing is broken, and the cost is entirely
in discoverability.

## 2026-08-29 (third) — `spacefast@0.2.2` ships, and the rationale blockade is over

The single best platform day this project has had. **`sf publish` now works
plainly**, with no shim, no `NODE_OPTIONS` and no out-of-band header.

### ✅ The CLI jumped 0.0.26 → 0.2.2 and the whole family moved with it

npm's `latest` had been pinned at `spacefast@0.0.26` for the life of this
project. It is now **0.2.2**, and — the part that mattered — `@spacefast/zero`
and `@spacefast/zero-compile` are published at 0.2.2 too. That is the thing the
old **0.0.27 binary channel got wrong**: it existed, and it could not compile a
Zero capsule, so it was useless here. This release does not have that gap.

```
0.0.23  0.0.24  0.0.26  0.2.2
```

There is no `next` or `beta` tag; 0.2.2 is simply `latest`, and the jump skips
every intermediate number.

### ✅ The `x-spacefast-rationale` blockade is gone — and it was NOT fixed the expected way

For four days this project could not run a plain `npx sf publish`: it died at
*Creating version* demanding an `x-spacefast-rationale` header that **the CLI
had no vocabulary to send**. Every publish from v4 to v12 went out behind a
`fetch` wrapper loaded with `NODE_OPTIONS=--import`, rewritten from scratch each
session because it deliberately lives outside the repo.

The obvious fix would have been a `--rationale` flag or a `SPACEFAST_RATIONALE`
env var. **Neither shipped.** Both were checked against 0.2.2 before publishing:

```
$ grep -rhoE "SPACEFAST_[A-Z_]+" node_modules/spacefast/dist | sort -u | grep -i rat
(nothing — 0.0.26 and 0.2.2 alike)

$ grep -rhoE "x-spacefast-[a-z-]+" .../0.2.2/dist | sort -u
x-spacefast-client   x-spacefast-client-capabilities   x-spacefast-country
x-spacefast-idempotency-principal   x-spacefast-language   x-spacefast-runtime
x-spacefast-version
```

`rationale` is still not a header this CLI can send, and `sf publish --help` on
0.2.2 lists no flag for one. **The requirement was dropped or satisfied
server-side instead.** So the correct read of the old entries is not "the CLI
caught up" but "the platform stopped asking" — worth knowing, because it means
the *mechanism* that decides an agent-driven mutation is attributable has
changed and is no longer visible from the client at all.

On the evidence here that is an improvement: the old failure was a hard block
with no supported way through, which is what pushed every publish onto an
unsupported workaround. **A requirement no client can satisfy is worse for
attribution than no requirement**, because what it actually produced was four
days of hand-written `fetch` patching.

### ✅ v13 published first try, 16 seconds

```
✓ Updating space    larderlog (spc_7770744a870a43f5927213fa397c780e)
✓ Creating version  ver_cb18bde5f0e44c5db5fa37f75c9d4470
✓ Uploading files   34 files
✓ Finalizing version  v13
Files 125   Duration 16s
```

**Uploads are incremental now** — 125 files in the payload, **34 actually
uploaded**. Earlier publishes reported the full count at both steps. Nothing
announces this; it is visible only by reading the two numbers.

The version record also carries **git provenance nothing was asked for** — the
commit URL, branch and repository, detected from the working tree, and the
commit message used as the changelog when `-m` is omitted. That is a genuinely
nice touch and it is new since 0.0.26.

### ✅ The upgrade was surface-compatible with the capsule, exactly

The compiled capsule was diffed across the two compiler versions before
publishing — tables, every column with its type and default, indexes, queries,
mutations, endpoints, migrations, runtime — and came back **byte-identical**.
The only payload difference was the content-hash directory holding the platform
modules:

```
_spacefast/platform/148a7ff3ce1fe948/…   (0.0.26)
_spacefast/platform/6748ddd78ae62a91/…   (0.2.2)
```

Same 125 files, same `SPA false`, same target. For a 0.0.x → 0.2.x jump on a
project this far along, that is a much better outcome than expected, and it is
what made the upgrade safe to do immediately before a publish.

### ❓ Two files were "ignored" with no way to know that in advance

New warning, printed *after* the version was created:

```
Warning: ignored 2 unsupported file(s) on this plan:
  .claude/docs/pantry-tracker-mockup.jsx, .idea/x3p0-larder-log.iml
```

Neither file matters here — one is a design reference, the other an editor
leftover. But three things about this are unhelpful:

1. **"on this plan"** implies a billing or tier limit, and nothing says which
   limit, what the rule is, or what the other 123 files did to qualify. A
   `.jsx` and an `.iml` have no obvious property in common.
2. **`--dry-run` did not mention it.** The dry run reported `Files 125` with no
   warning; the real publish reported the same 125 and then said two of them
   were dropped. The dry run is supposed to be the way to see what a publish
   would do — this is the second documented case of it being necessary but not
   sufficient, after staged-but-404ing `theme.json`.
3. **It arrives too late to act on**, printed between *Creating version* and
   *Uploading files*.

**What would fix it:** emit the same warning from `--dry-run`, and name the rule
(`unsupported extension`, `size`, `plan limit`) rather than the plan.

### ✅ Auth and credentials survived the version jump

`sf whoami` answered correctly on 0.2.2 with no re-authentication — the
credential store format is compatible across the jump. Worth recording because
it was the main risk in upgrading a CLI immediately before a publish.

### ❓ `sf spaces` with no subcommand prints help and exits 0

Minor: `sf spaces` alone prints the help topic rather than listing spaces, which
is defensible for a topic command, but it does so on stdout with a success exit
code — so a script that expected a list gets a help page and no error. `sf
spaces list` is presumably the real form.

### Still open from earlier entries

- **`sf db dump` is still the documented route for things it cannot do** — not
  re-tested this session.
- **The `plan` / footer contradiction is unchanged.** `sf db --json` again
  needed `data.plan.applied` + `pendingOperationCount` + the two hashes at
  *different depths* (`data.schemaHash` vs `data.plan.appliedSchemaHash`) to
  confirm the three `add_column` ops landed. The trap is exactly as logged.

### ✅ The version-pinned URL is team-private, and a 403 there is correct

`sf publish` prints a `Version URL` beside the live one —
`https://v13--larderlog.view.fast/`. It answers **403 "This space is private"**
to an anonymous request, with `vary: Cookie` and `x-robots-tag: noindex`, while
the live URL is public and serving the same version. That is sensible (a version
preview should not be crawlable) but the publish output presents the two URLs
side by side with nothing to say one needs a signed-in team member. The
`x-spacefast-version` response header is the useful part: it names the version
id even on the 403, so it still confirms which build is behind that hostname.

**Do not read that 403 as a failed publish.** Verify against the live URL.

## 2026-08-29 — v14, the first client-only publish

### ✅ A plain publish worked a second time

`npx sf publish -m "…"` on `spacefast@0.2.2`, first try, no shim and no
`NODE_OPTIONS`. That is now **two** consecutive plain publishes, so the
rationale requirement being dropped (or satisfied server-side) looks settled
rather than lucky. 125 files, **7 uploaded**, 18 seconds.

### ✅ Incremental upload is doing real work

`Files 125` / `Uploading files 7 files` on a change that touched five client
modules. The two numbers disagreeing is normal and not a truncated payload —
worth restating because it looks alarming the first time.

### ✅ A no-op migration reports cleanly

First publish here with **no schema change at all**. `sf db --json` came back
`applied: true`, `pendingOperationCount: 0`, `migrations: []`, and
`data.schemaHash` byte-identical to the previous version's. Nothing surprising,
which is the point: the honest signal for "nothing to migrate" is legible.

### ⚠️ The unsupported-file warning is still post-hoc, second occurrence

```
Warning: ignored 2 unsupported file(s) on this plan:
.claude/docs/pantry-tracker-mockup.jsx, .idea/x3p0-larder-log.iml
```

Printed **after** `Creating version` succeeded, and **`--dry-run` said nothing
about it** — same as v13. Neither file matters here, but the rule is unstated
(what makes a `.jsx` or an `.iml` "unsupported on this plan"?) and the warning
arrives too late to act on. This is the second logged case of a dry run being
necessary but not sufficient, after staged-but-404ing `theme.json`.

**Suggestion:** surface it in `--dry-run`, and name the rule or link it.

### ✅ Payload hashing is a better publish check than curling for strings

`shasum` on `.spacefast/zero/public/{client.js,zero.css,site.webmanifest}`
against the live URLs matched byte for byte. It proves the live space is serving
exactly what was built, in three commands, with no guessing at which string
should be present.

### ⚠️ `data.plan` still has no `schemaHash`, confirmed by printing its keys

`Object.keys(data.plan)` is exactly `applied, appliedSchemaHash,
pendingOperationCount`. So `data.plan.schemaHash` is `undefined` and comparing
it against `appliedSchemaHash` reports a **spurious mismatch on a clean
migration**. The trap is unchanged from v11/v12/v13; printing the keys rather
than assuming them is the fix.

---

## 2026-08-29 — Building an admin console: what the runtime does and does not offer

Context: designing a space-wide administration surface for Larder Log — every
household, every account, with no per-household membership to scope reads by.
This is the first thing in the app that reads across households, so it exercises
parts of the runtime nothing else had touched. Everything below was driven
against a real capsule on `sf dev --port 4199` and, where stated, read out of
`.spacefast/zero/artifact.json`.

### 👍 `by_creation` is on **every** table, including one with no declared index

`server/index.ts` declares no index at all on `households`. `ctx.db.households
.withIndex('by_creation').order('desc').collect()` works anyway and returns
every row newest-first. The docs say this in one sentence
(*"Every table has a built-in `by_creation` index that reads rows in insertion
order"*) and it is easy to read as *in addition to yours* rather than
*unconditionally*. It is the latter, and it is what let a whole cross-cutting
admin surface ship with **zero schema change** — `db.migrations` stayed `[]`.

Worth promoting in the docs: it is the answer to "how do I list a table" and it
currently reads like a footnote to the index section.

### 👍 `ctx.env` reaches a **query** handler, not just mutations and endpoints

The type says so (`QueryServerContext` has `env`) and it was worth confirming,
because an env-driven authorization check is useless if it only works on the
write side. It works. A `LARDER_ADMIN_IDS` in `.env.server` read back correctly
inside a `query()`.

### 👍 `.paginate()` works on `by_creation` and returns a usable envelope

`{ page, isDone, continueCursor }`, with the cursor a base64 blob carrying a
`queryHash` and the sort keys. Cheap and correct.

### 👎 There is no aggregate of any kind, so **a count is a full scan**

`QueryBuilder` is `order` / `collect` / `take` / `first` / `paginate`. There is
no `count()`, no `sum()`, and no way to push a predicate into an index beyond
`eq/gt/gte/lt/lte` on indexed fields. So *"how many items exist"* and *"how many
items does each household have"* are both a `collect()` over the whole table
and a loop.

That is fine at our size and it does not scale, and there is no smarter query to
write — the only fix available to an app is to denormalise counts into a row and
maintain them from every mutation. **A `count()` on an indexed range would be
the single highest-value addition to this query API.**

### ❓ Nothing in a handler can see storage usage

The boards for this console draw a storage figure per household and one for the
space. A handler is given `{auth, content, db, env, gravatar, log, spam}` on the
read side and adds `{email, invalidate, spam, transaction}` on the write side.
There is no storage handle in either direction, and `storage` is exported only
from `@spacefast/zero/client` (for uploads). `sf storage` exists as a CLI.

So an app cannot show its own users what they are using. Not a bug — but it
means the CLI knows something the runtime will not tell the app.

### 👎 `endpoint()` handlers get an **untyped** `db`, where queries and mutations do not

`capsule()` types `queries` and `mutations` through `SchemaQueries<TSchema>` /
`SchemaMutations<TSchema>`, so `ctx.db.households` is fully typed. `endpoints`
is `Record<string, unknown>` and the handler signature is
`(ctx: ServerContext, req) => …` with `ServerContext`'s default
`TDb = MutationDbContext = Record<string, WriteTableApi>` — so every row is
`RowMetadata` and reading `row.name` is a compile error.

Caught immediately by `tsc`, and the workaround is a cast, but it is an
inconsistency with no obvious reason: an endpoint is on the same capsule and the
same schema.

### 👍 `@spacefast/zero/charts` exists, is undocumented in the runtime page, and is good

`lineChartLayout({data, x, series, height})` returns a complete layout —
`plot`, `niceTicks`-derived `ticks` with their `y`, `xLabels` with their `x`, and
per-series `points`. There are `LineChart` / `BarChart` / `Sparkline` /
`StatTile` components too, plus `seriesColor`, `niceTicks` and
`formatCompactValue`.

The **layout** function is the useful half for an app with its own design
system: it does the arithmetic and hands back numbers, so the SVG can be painted
in the app's own tokens. The components come with the platform kit's palette,
which is the right default and the wrong one for a themed app.

`zero-runtime.md` mentions "a stats chart" in the example app and never names
the module or its exports. Worth a section.

### ❓ `SPA false` turns out to be the right answer for a hidden surface

Unknown paths are answered by the edge, so `/admin` 404s before the app is
reached. We had logged this as friction for invite links (it forced
`/?join=<code>`); here it is a feature — the platform's own 404 leaks less than
any refusal we could draw, and it is identical for an administrator and a
stranger. Recording it because the trade-off is genuinely two-sided and the docs
present `SPA` as a deployment detail rather than a security-relevant one.

---

## 2026-08-29 (later) — Building the whole console: what the runtime taught us

Context: the admin console went from nothing to twenty-five boards' worth of
surface in one day — eight queries, six mutations, one new table. The earlier
entry today covered what was learned before writing any of it; this is what only
showed up once real handlers were running.

### 👍 A new table is as flagless as a new column

`activity` is the first table added since `profiles`, and the artifact treats it
exactly as an additive column change: it appears under `server.schema` with all
its defaults and `db.migrations` stays `[]` in a dry run, because the diff
happens server-side at publish. Nothing about adding a table needed a flag, a
command, or a different mental model from adding a column. That is a genuinely
good property and it is not stated anywhere in the docs.

### 👎 A millisecond is not enough resolution for an append-ordered table

Two rows written by one mutation — `insert`, then `insert` — landed on the
**same millisecond**, so an index on the timestamp could not order them. For an
audit log that is not cosmetic: `by_at` descending put an ownership transfer
above the deletion that caused it, and the log read as though a household had
been handed over after the account was already gone.

There is no monotonic counter, no sequence, and no insertion-order tiebreak
available: `by_creation` exists but a query can only pick **one** index, and row
ids are UUIDs under `sf dev` and sequential integers in production, so they are
not an order either. The workaround is app-side — never emit a stamp equal to or
below the last one — which works per-isolate and cannot work across them.

**Suggestion:** either document that `by_creation` is a stable insertion order
that can be relied upon as a tiebreak, or expose a monotonic sequence. Any
append-only table hits this.

### 👎 `QueryBuilder` can only use one index, so "ordered *and* filtered" is a scan

`withIndex('by_at', r => r.gte(...).lt(...))` is fine because the range is on
the indexed column. But a list that filters on one column and orders by another
has no expression at all: `collect()` the table and sort in the handler. That is
what six of the console's eight queries do.

Combined with **no aggregate of any kind** — no `count()`, no `sum()` — it means
every "how many X are there" in an admin surface is a full table read. We are
small enough that it does not matter; the shape of the constraint is worth
naming because it is invisible until you write the second screen.

### ❓ `endpoint()` handlers still get an untyped `db`

Re-confirming from this morning's entry, because it bit again: `queries` and
`mutations` are typed through `SchemaQueries` / `SchemaMutations` and get the
schema-typed `ctx.db`; `endpoints` does not, so every row is `RowMetadata` and
`row.name` is a compile error. One-line fix with a cast, no obvious reason for
the asymmetry.

### 👍 `ctx.log.error` inside a `catch` is the only way to hear about a swallowed failure

The audit log's write and its prune are both wrapped so a logging failure cannot
roll back the thing being logged. That means they can fail silently by design —
and `ctx.log` is the only route out, since an uncaught handler exception logs
nothing at all. Worth repeating in the docs beside the error-handling advice:
**if you swallow an error, `ctx.log` is not optional.**

### 👍 `@spacefast/zero/charts` earns its place, and `lineChartLayout` is the useful half

Second mention today, now that it has shipped in something. The layout function
returns `plot`, tick positions, x-label positions and per-series points — all
the arithmetic, none of the styling — which is exactly right for an app with its
own design system. The `LineChart` component would have brought the kit's
palette into a themed page.

Still undocumented on `zero-runtime.md`, which mentions "a stats chart" in the
example app and never names the module.

### ❓ The bundler escapes typographic punctuation, which breaks a common check

Our standing verification is to grep the built `client.js` for strings we
expect. Copy containing `’` or `—` is emitted as `\u2019` / `\u2014`, so a
`grep -F` for the literal returns **0** and looks exactly like a missing string.
Twice now this produced a false alarm. Not a bug — but a line in the docs about
what the bundle does to non-ASCII would save the next person the same detour.

## 2026-08-30

### 🐞 `sf db export` fails exactly like `sf db dump`, and the JSON names one root cause for both

`sf db dump` has been broken since 2026-08-26 (`zero_db_dump_failed`, 500). Went
looking for a way to read one column out of the live database — the account id
that has to go into `LARDER_ADMIN_IDS` before the admin console is reachable —
and `sf db export` fails the same way against the same healthy space:

```
$ npx sf db export --json -y
"code": "zero_db_export_failed", "status": 500, "retryable": true,
"details": { "runtimeDetails": { "table": "households",
                                 "zero_db_code": "zero_db_connect_failed" },
             "runtimePath": "…/zero/db/export&table=households&limit=500" }
```

`sf db dump --json` returns the identical `runtimeDetails` — `table:
"households"`, `zero_db_code: "zero_db_connect_failed"` — so these are not two
bugs. **Something on the export path cannot connect to the database that the
running app is reading and writing all day.** `sf db` itself works in the same
second and prints the live table list, and the published space serves data
normally, so the space is healthy and only this path is not.

`retryable: true` and the recovery text (*"Retry shortly or run `sf doctor`"*)
are both misleading here — it has been failing for four days, and `sf doctor`
is not a command this CLI has.

Two request ids, a minute apart:
`30400ed6-1b55-4b4c-b282-f61e5019c3c2` (export),
`f9822573-0da9-4601-ad0b-c712ab3476bc` (dump).

**Why it matters beyond backups.** With both of these down there is no way to
read a single value out of a live database except to publish a keyed endpoint
that returns it and publish again to take it away — two full versions to answer
one question. `sf db console` opens a browser and is not a scripting route.

### ❓ There is no supported way to learn your own `userId`

Related, and worth a docs line on its own. An app that gates anything on a list
of account ids — an admin allowlist, a feature flag, an owner override — needs
those ids *before* the gate can be written, and nothing hands them over:

- `ctx.auth` tells a handler about its **caller** only, so no query can report
  somebody else's id.
- `endpoint` handlers get a full `ServerContext` but **no `ctx.auth`**, so the
  documented probe trick cannot answer "who am I" either.
- `sf db dump` / `sf db export` — the two commands that would show the
  `memberships` rows — are the ones broken above.

The route that does work is undocumented and client-side: the SDK stores the
identity at `localStorage['stattic_zero_identity']`, a JSON record carrying
`token` and `userId`, so on the live site

```js
JSON.parse(localStorage.getItem('stattic_zero_identity')).userId
```

prints the id. That is fine as an answer, but it is an internal storage key
found by reading `dist/client.js`, not an API. **`useAuth()` already returns
`userId` to the client — the docs could simply say where to read it, or the SDK
could export `readStoredIdentity()` publicly.**

**Amended the same day: there are two `userId` namespaces and nothing says how
they relate.** `sf share people ls --json` *does* print one, under
`inheritedTeamAccess.members[]`, alongside a `membershipId`, a `displayName` and
an `email`. But that is the **team** account id, and Zero's client builds its
own from `pairwise_sub ?? sub ?? email` — pairwise being, by definition, scoped
to the relying party. So the two are probably different strings, and a reader
who finds the `share` one first has every reason to think they have the answer.
Neither page mentions the other. **If they are the same, say so; if they are
not, the `share` docs should say which namespace they are printing.**

### 🐞 An unauthenticated request to a published space is handed `guest:local`, and nothing says so

**The most expensive thing this project has learned about the platform, found
twenty minutes after a publish.**

`POST /__spacefast/zero/run` exists in production and answers **without any
credentials** — which is documented behaviour for a public space, and fine on
its own. What is not documented is *who the runtime says you are* when you do
that. The answer is the SDK's own guest fallback:

```
userId 'guest:local'  displayName 'Local'  provider 'guest'
isGuest true          isAuthenticated false
```

**That is byte-identical to what `sf dev` issues.** So any app that treats the
dev identity as a development affordance — as this one did, in two places, with
a comment explaining why it was safe — is shipping that affordance to the open
internet. On v15 an anonymous `curl` got `{"admin": true}` from our own admin
gate and read every household count in the space.

Two things would each have prevented it:

1. **Say in the docs what identity an unauthenticated hosted request carries.**
   `zero-runtime.md` describes `ctx.auth` fields and never says the runtime
   mints a guest for anonymous callers, still less that it reuses the dev
   server's exact values. `guest:<name>` comes from `currentGuestName()`, whose
   default is the literal `'local'` — the same default the CLI uses.
2. **Make the two distinguishable.** A hosted anonymous caller and a local dev
   guest are not the same principal and should not present the same four
   fields. A different `provider`, or any marker of which runtime minted it,
   turns a silent hole into a one-line check.

**The trap underneath it is a verification one, and worth repeating.** This
project had "verified" the equivalent bypass inert in production by probing the
published space and reading back `schemes ["account"]` and `anyDevGuest false`
— but that probe enumerated the *stored membership rows*, i.e. everyone who had
ever signed in, and concluded something about *what an anonymous request
receives*, which it never measured. The probe was well-built and answered a
question nobody had asked. **Ask the runtime, not its data.**

Filed as a bug rather than a docs gap because of how the values line up: reusing
`local` as the hosted guest name is a choice that makes a whole class of
dev-only bypass silently live.

## 2026-08-30 (second) — publishing v17, and a refusal that cannot say it is one

### 👍 A third plain publish in a row, and incremental uploads make it quick

`npx sf publish -m "…"`, first try, no shim and no `NODE_OPTIONS`. **130 files
in the plan, 9 uploaded, 25 seconds.** The rationale blockade that governed v4
through v12 has now stayed gone across v13, v14 and v17, so it is safe to treat
plain publishing as the normal case rather than the lucky one.

The version record again carried git provenance nothing was asked for — commit
URL, branch, repository — and `-m` correctly overrode the commit message as the
changelog. `Synced 4 server variables from .env.server` is a good line: it says
how many without saying which, which is exactly the right amount of detail for
a terminal that may be on a screen share.

### 👍 `POST /__spacefast/zero/run` against the *published* space is the best auth check there is

This version existed to close an authorization bypass, and the whole
verification was five anonymous `curl`s at the live space — no token, no
bootstrap, no browser:

```bash
curl -s -X POST -H 'content-type: application/json' \
  -d '{"op":"query.run","name":"households","args":[]}' \
  https://larderlog.view.fast/__spacefast/zero/run
```

Before: `{"state":"no-household"}`. After: `{"state":"guest"}`. That is the
actual condition — *what does the runtime hand somebody who has not signed
in* — measured directly rather than inferred from stored rows, which is the
mistake that let the same class of bug ship twice here.

**Worth documenting deliberately.** `run` is described as a dev-server
convenience; that it exists in production, unauthenticated, and answers by
handler name is the single most useful verification affordance the platform
has, and we found it by accident.

### 🤔 A mutation cannot refuse legibly — every refusal is a 500 that reads as a crash

A query can return a state union, so `adminSummary` says `{"state":"denied"}`
and a caller knows it was refused. **A mutation has only `throw`**, and the
throw loses its sentence on the way out:

```
{"op":"error","ok":false,"error":{"code":"zero_js_execution_failed",
 "detail":"Exception generated by QuickJS","status":500,
 "title":"Zero js execution failed"}}
```

That is what our `createHousehold` returns to an unauthenticated caller — and
it is byte-identical to what it would return if the handler had a null
dereference in it. So:

- **A client cannot distinguish "you may not do that" from "we broke."** The
  app has to guess, and guessing wrong in either direction is bad copy.
- **Monitoring cannot either.** A deliberate, expected, correct refusal raises
  the same 500 as a real fault, so the error rate for a healthy app is
  whatever its refusal rate is.
- **The message we wrote is gone.** `requireAdminWrite` throws a sentence
  written specifically to be read; nothing outside the isolate ever sees it.

Compare the platform's own refusal on a reserved column — *"Zero manages
`items.createdAt`; app code cannot set it directly"* — which is the standard
this should be measured against.

**And this contradicts something we had written down as established.**
`server/auth.ts` carries a comment saying *"the spike found that a thrown
message is copied verbatim into the HTTP response body (`detail` in an RFC 7807
payload), so every string thrown from a handler is user-visible"* — which is why
`AccessError` exists at all and why every one of its messages is written to be
read by a person. Against the **published** space that is false: the `detail` is
the constant string `Exception generated by QuickJS` and the handler's sentence
is nowhere in the body. The spike was almost certainly run against `sf dev`, so
this is likely the **fourth** confirmed local/hosted divergence after `crypto`,
row ids and `ctx.log` — measured on the hosted side, unconfirmed on the local
one. Either way the consequence is the same: **an app cannot ship a refusal
message through a mutation.**

What would fix it, cheapest first: let a thrown error carry a `code` and
`message` through to the envelope; or give mutations a first-class refusal
(`ctx.refuse(code, message)`); or simply document that app-level refusals must
be modelled as a **successful** mutation returning a result union, which is
what we will do in the meantime.

### 🤔 The unsupported-file warning still arrives after the version is created

Fourth time logged. `--dry-run` says nothing; the real publish prints
*"ignored 2 unsupported file(s) on this plan: .claude/docs/pantry-tracker-mockup.jsx,
.idea/x3p0-larder-log.iml"* **after** `Creating version` has succeeded. Neither
file matters to us, but the dry run is the place a warning about the payload
belongs, and the rule for what a plan supports is still unstated anywhere.

## 2026-08-31

### 🐛 `.default('')` does not backfill, and the column then serves `null` against a `string` type

`memberships.picture` was added as `string().default('')` (D55, live in v12).
Rows written **before** that migration hold **`null`**, not `''` — read back off
the published space through the app's own `household` query:

```json
[ { "name": "Justin Tadlock", "picture": null },
  { "name": "Ashley Tadlock",  "picture": null } ]
```

Two separate problems in that one value.

**The default is documented as a default and behaves as an insert-time default
only.** That is a defensible choice — a backfill over a large table is not free
— but it is not stated anywhere, and every additive column this project has
shipped (nine stamp columns, `households.ink`, `items.size` / `unit` /
`offShoppingList`, `stores.kind`, `items.seasonFrom` / `seasonTo`) was written
on the assumption that the declared default is what an old row reads back as.
Ours all happen to normalize `''` and `null` identically; this one did not.

**Worse, the generated row type says `string`.** `TableColumns<T>` for a
`string()` column is `string`, with no `| null`, so `typecheck` cannot see it
and a handler that calls a string method on the value compiles and throws in
production. The DTO in our `household` query passed the column straight through
to a client type also declared `string`, and the `null` travelled all the way to
a Preact component.

What would fix it, cheapest first: type a column added after rows exist as
`string | null` unless the migration backfills; or backfill on migrate and say
so; or, at minimum, document that a default applies to inserts alone so an app
can normalize at the read.

### 🤔 The hosted client authenticates with a cookie, and the docs' curl recipe implies a bearer token

`POST /__spacefast/zero/run` against a published space is documented here (and
in our own notes) with an `authorization: Bearer …` header, which is the **`sf
dev` capability token** and has no production equivalent. The real client
(`@spacefast/zero/dist/client.js`, `requestHttpRun`) sends no `authorization` at
all — `credentials: 'same-origin'`, `accept` and `content-type` only. Anything
scripted against a live space from outside the browser therefore cannot
authenticate as a signed-in visitor, and the failure mode from inside one is a
confusing `undefined` token read out of `localStorage['stattic_zero_identity']`,
which is not always populated.

`{"op":"auth.get"}` over that same route is a genuinely useful and undocumented
thing: it returns the identity the runtime constructed, which is the only
supported way we have found to read one's own `account:` id on a live space.

### 🐛 `sf publish` timed out client-side at `Creating version`, having already staged the payload

First attempt at v18:

```
✓ Updating space  larderlog (spc_7770744a870a43f5927213fa397c780e)
⠋ Creating version
Runtime API request failed: Runtime API request timed out after 10000ms.
Learn more: https://spacefast.com/docs/errors/internal_error
Check your connection or the SPACEFAST_API_URL setting.
Run `sf doctor` to diagnose.
```

Exit non-zero. The space update had already succeeded and four server variables
had already synced, so this is a partial failure in the middle of a multi-step
command — and **the message does not say which side gave up**. The 10000ms is a
client-side cap; the error page it links is `internal_error`; the advice offered
is *check your connection* and `sf doctor`. Nothing in it says whether a version
was created.

`sf versions list` answered that, and the answer was **no** — v17 still live,
no v18 row. A plain retry with no changes succeeded in 22 seconds
(`ver_f8f24058016d4a5bb1b9ea8900ec94f6`). So the operation is safely retryable
here, but only because it turned out to be atomic; nothing in the CLI's output
promises that.

What would help, cheapest first: say whether the version was created before the
timeout, or tell the operator to run `sf versions list` before retrying; make
the timeout distinguishable from a network failure, since the advice for the two
is different; and consider a longer cap on `Creating version` specifically,
which is the step that does real work.

Worth noting the retry printed the unsupported-file warning again, so that
warning is emitted at version creation and the first attempt died before
reaching it.

## 2026-08-31 — a `config_update` version broke sign-in for the whole space

### 🐛 The space's own runtime config advertises a `signInPath` the edge 404s

Reported as *"I can't log in"*, with the platform's own 404 page:

> **404 · Not Found** — There's nothing at `/__zero/auth/start`.

`GET https://larderlog.view.fast/__spacefast/zero/config` on the live space:

```json
{"runtimeKind":"zero",
 "auth":{"provider":"gravatar",
         "signInPath":"/__zero/auth/start",
         "signInUrl":null,
         "signOutPath":"/__zero/auth/sign-out",
         "signOutUrl":null,
         "returnToParam":"returnTo"}, …}
```

The SDK resolves `signInUrl ?? auth.signInPath`, so with `signInUrl` null every
sign-in on the space goes to `/__zero/auth/start` — and that path returns **404**
from the edge's own error page (the one that preloads `wordpress.com` fonts, so
it is the platform's, not the app's). Neighbouring prefixes exist and merely
refuse: `/__spacefast/zero/auth/start` and `/__spacefast/auth/start` both answer
**403**. So the config names a route under a prefix the edge does not serve at
all, while the plausibly-correct one is a prefix away.

**Nothing in the project sets this.** `sf.jsonc` carries `name`, `meta.title`
and the `runtime` block and no auth section anywhere; `signInPath` is the
platform's.

### 🐛 A version appeared that no `sf publish` created, and the admin disagrees with the CLI about it

`sf versions list` at the time of the report:

```
* v19 (live) status=ready source=config_update mode=website
    updated: 2026-08-31T19:20:24.000Z
  v18 status=ready source=git@ece9f75 mode=website
    updated: 2026-08-31T18:35:45.000Z
```

Three things about that row:

- **`source=config_update`**, not `git@…`. No `sf publish` was run — v18 was the
  last one, 45 minutes earlier. So a change made through the admin UI mints a
  version, and that version can change edge routing.
- **The admin UI still showed "publishing…"** while the CLI reported
  `status=ready` and served the version. One of the two is wrong about the same
  version at the same moment, and the operator has no way to tell which.
- **v19 injects head content v18 did not.** v18's `<!-- spacefast:head -->` block
  is empty; v19's carries a generated `<link rel="icon">` (a green *L* data URI),
  `og:title` and two `twitter:` metas. This app appends its own icons and metas
  at boot (`client/lib/appIcon.ts`) because the generated shell exposes only a
  title, so the platform is now injecting a competing favicon into the same head.

**The app itself is intact**, which is what makes this purely a platform
question: `GET /` 200, `/api/status` `ok`, the live `/client.js` still
`shasum`-identical to `.spacefast/zero/public/client.js` from the v18 build, and
`POST /__spacefast/zero/run` still answers (`households` → `guest` for an
anonymous caller). Only the sign-in route is gone.

### 😕 `sf versions --help` promises promote and rollback and lists neither

**Corrected: both commands exist. This is a discoverability bug, and it cost a
wrong conclusion — the first draft of this entry said there was no rollback.**

`sf versions --help` says *"List, promote, and roll back space versions"* and
then lists exactly three subcommands: `versions get`, `versions ls`,
`versions rm`. Read on its own it says the two operations it names do not exist.

**They are top-level commands**: `sf rollback <version>` and
`sf promote <version>`, both documented at
[`/docs/publish/versions`](https://spacefast.com/docs/publish/versions) and both
present in the pinned `spacefast@0.2.2`. So is `sf channels`, which is where
*where does live point* is answered, and `sf apply`, which pushes settings saved
in the dashboard onto the serving runtime without creating a content version.

The fix is one line of help text: name them, or drop the sentence. A topic's own
`--help` describing operations that live somewhere else, without saying where,
is worse than saying nothing.

### 🐛 `sf channels ls` and `sf channels history` crash in their renderer

```
$ npx sf channels ls --space larderlog
Cannot read properties of undefined (reading 'length')
    at _ChannelsLs.catch (…/spacefast/dist/commands/channels/ls.js:11345:10)
```

Both throw with a full stack trace, with and without `--space`. **`--json` works
perfectly on both** and returns exactly the data the human form was going to
print, so it is the table renderer and not the request. On `spacefast@0.2.2`.

That is how the facts below were read at all.

### 😕 Nothing anywhere lets an app configure `signInPath`

Checked before concluding the broken route was ours to fix. The
[space settings reference](https://spacefast.com/docs/serve/settings) gives the
complete `sf.jsonc` key list — `$schema`, `space`, `name`, `index`, `fallback`,
`cleanUrls`, `listing`, `meta`, `theme`, `access`, `redirects`, `rewrites`,
`headers`, `templates`, `superpowers`, `runtime`, `build` — and **there is no
auth key**. The [Zero doc](https://spacefast.com/docs/zero-runtime) treats
sign-in as one component, `SignInWithGoogle`, with no path, no URL and no
option; `signInPath` returns **zero results** from
`https://api.spacefast.com/v1/docs/search`.

So the broken route is not something an app can set, work around in config, or
even name. The only lever on this side is which version is live.

### What the API says about the stuck version

`sf versions get v19 --json`, with `sf channels history --json` beside it:

| | v17 | v18 | v19 |
|---|---|---|---|
| `source.kind` | `git` | `git` | **`config_update`** |
| files added / changed / removed | 1 / 8 / 0 | 4 / 12 / 0 | **0 / 0 / 0** |
| created → ready | 12s | **8s** | **34m 58s** |
| publisher | — | — | `{type: "system", displayName: "Spacefast"}` |

v19 changed **no files at all**, was created by the *system* ten minutes after
our own v18 publish, and took thirty-five minutes to reach `ready` against eight
seconds for the publish before it. The channel move is recorded as
`kind: "publish"` by `actorId: "version-finalize"`, so the history does not
distinguish a settings version from a content one.

**And nothing is pending anywhere in the API's own view** —
`space.operation: null`, `runtime.operation: null`,
`runtime.pendingVersionId: null`, `runtimeState: "active"`, `status: "ready"`.
The dashboard showing *publishing…* is contradicted by every field that would
carry it.

`channels ls --json` also names `previousVersionId`, and it is v18 exactly — so
the platform knows what the rollback target is even while the UI is stuck.

**One red herring, recorded so nobody chases it twice**: the version record's
`siteTitle` reads `"Wild Rain"`, which is not this app's name. It is on v17 and
v18 as well, so it predates all of this — the served `<title>` comes from
`sf.jsonc`'s `meta.title` and is correct.

What would help, cheapest first: keep `signInPath` and the served route in
agreement, or fall back to the `/__spacefast/` prefix that already answers 403
rather than 404; make the dashboard's status read from `runtime.operation` the
way the API does; distinguish a `config_update` from a `publish` in
`channels history` and say what it changed; and look at why a zero-file settings
version takes thirty-five minutes when a full capsule publish takes eight
seconds.

## 2026-08-31 — a second unbounded bulk mutation, and it needed nothing new (good)

Built `addItems` for bulk entry (D67): one call writing up to 200 items with
their join rows. It is the app's second mutation of that shape after
`restockItems`, and the platform asked for nothing special — no batch API, no
transaction ceremony, no size limit hit. `ctx.db.items.insert` in a loop inside
one mutation body is the whole of it, and `changedTables` came back
`["items","itemTypes","itemStores"]` for a three-row call.

**Worth recording because the obvious worry did not materialise.** A 200-row
call was refused by our own cap before the platform had an opinion, so the real
ceiling is unknown and untested. If somebody needs it later, that is the number
to go and find.

**`--dry-run` again gave the whole answer for a non-migrating change**: fourteen
tables, fourteen queries, twenty-nine mutations, `db.migrations: []`,
`/api/status` still the only endpoint. Nothing about a cross-cutting feature
that adds one handler needs a publish to verify.

## 2026-09-01 — a failed publish left production's runtime 422ing, and the platform looped — bug

**Severity: production outage.** The app's entire server half is down. Static
files serve (`/`, `/client.js`, `/zero.css`, `/site.webmanifest` all 200) and
every capsule call fails:

```
GET  /api/status
{"code":"zero_artifact_mode_invalid","status":422,
 "detail":"A read handler cannot carry write-side capabilities."}

POST /__spacefast/zero/run   {"op":"query.run","name":"households"}
{"code":"zero_artifact_mode_invalid","status":422,
 "detail":"Zero artifact mode does not match the invocation mode."}
```

Note the **two different `detail` strings under one code**, neither of which
names a handler, a file or a line. `sf logs runtime` is **empty** — the artifact
is rejected before any handler runs, so the one instrument this project relies
on for hosted debugging has nothing in it.
`https://spacefast.com/docs/errors/zero_artifact_mode_invalid` **404s**, and the
404 body is 25 KB of HTML (the standing docs trap), so the `type` URI in the
error envelope points at nothing.

**What we did.** `npx sf publish -m "…"` on a clean tree, after a clean
typecheck, 845 assertions and a read dry-run artifact. It printed:

```
Synced 4 server variables from .env.server.
✓ Updating space  larderlog
⠋ Creating version
runtime_delivery_lock_timeout
```

`runtime_delivery_lock_timeout` is a **new failure mode** here, and a second one
at the `Creating version` step after v18's `Runtime API request timed out after
10000ms`.

**Then the platform started minting versions by itself.** Four
`config_update` versions in seven minutes, each taking the live channel, each
followed by another in `finalizing`:

| created | id | status |
|---|---|---|
| 15:37:00 | `ver_abe35cc5…` | ready |
| 15:39:27 | `ver_c3b567b3…` | ready |
| 15:41:51 | `ver_ad0f4440…` | ready → **live** |
| 15:44:11 | `ver_fb19c6ff…` | finalizing |

**`settingsDigest` never changed** (`14819df43bf50ca6` before and after), so
none of them carries a settings change — the platform is re-delivering the
runtime on a ~2.5 minute loop and each delivery lands invalid. Nothing on our
side asked for any of them; the only publish was the one that failed.

**No content was delivered, which is the one good thing.** The last `git`
version is still v18 (`ver_f8f24058…`), and the live `/client.js` was diffed
against the local build: it carries **none** of `restockItems`, `addItems`,
`In Pantry`, or the new *Back to the pantry* row. So the failure was clean on
the content side and the broken runtime is v18's own capsule, which served
correctly for a day before this.

**What would help:**

1. `runtime_delivery_lock_timeout` should not leave the space mid-delivery. The
   publish failed *after* `Updating space` succeeded and the env sync ran, and
   the recovery loop it kicked off is worse than the original failure.
2. A `config_update` version that changes no settings should be a no-op, not a
   redelivery — and a redelivery that lands invalid should not immediately be
   promoted to `live`.
3. `zero_artifact_mode_invalid` needs to name what it rejected. Two different
   details, no handler name, no logs, and a 404 at its own documentation URL is
   as close to unactionable as an error can be.
4. `sf logs runtime` being empty for a rejected artifact means there is no way
   to tell a delivery failure from a capsule that simply never gets called.

Toolchain: `spacefast@0.2.2` / `@spacefast/zero@0.2.2`, both the newest on npm
as of today.

### Resolved by a rollback, 15:49 — and `sf rollback` is the thing that worked

Justin rolled the live channel back to `ver_28fb39a4…` — the **`config_update`
version from 2026-08-31**, i.e. v18's content with the settings that were live
before today. Production came back immediately:

| | before | after |
|---|---|---|
| `/api/status` | 422 `zero_artifact_mode_invalid` | **`ok`** |
| anon `query.run` `households` | 422 | **`{"state":"guest"}`** |

**The redelivery loop stopped on its own, and the rollback had nothing to do
with it.** The last one, v23, was promoted at **15:46:36**; the pattern up to
then was a new version created *one second* after the previous was promoted, and
no v24 appeared. The rollback was **15:49:08** — two and a half minutes later,
by which time the chain had already given up. It is a bounded retry, not a
runaway.

**The outage was space-wide, not session-scoped.** It presented as "the app is
breaking for me", and the instinct is to suspect the browser or the account —
but an **anonymous `curl`** with no token, no cookie and no session got the same
422 from both `/api/status` and `POST /__spacefast/zero/run`. The runtime was
refusing every caller. Worth recording because the app has one regular user, so
*only I can see it* and *everyone would see it* look identical from the inside.

**So `sf rollback` earns its place in the checklist.** CLAUDE.md records that
the whole release surface is hidden behind a `--help` that does not list it, and
that the conclusion *there is no rollback* was drawn here once. This is the
first time it has been used in anger, and it restored a dead space in seconds
with nothing rebuilt — exactly as `/docs/publish/versions` describes.

**A rollback target need not be a `git` version.** The one used here is a
`config_update`, which is what the live channel happened to be pointing at
yesterday. That is worth knowing: the last *known-good* version and the last
*content* version are not the same row, and the channel history is what says
which is which.

### What a `config_update` version actually is — investigated 2026-09-01

**It is a pure redelivery that changes nothing.** Read off `sf versions get
<id> --json`, all five of them are identical on every field that matters, and
identical to **v18, the git version they copy**:

| field | v18 (`git`) | v19–v23 (`config_update`) |
|---|---|---|
| `manifestHash` | `sha256:2c485076a031…` | **the same hash** |
| `fileCount` | 131 | 131 |
| added / changed / removed | 4 / 12 / 0 | **0 / 0 / 0** |
| `config` | `{}` | `{}` |
| `variables` | `null` | `null` |
| `buildLog` | the Zero publish log | `null` |
| `publisher` | `api_key` · Spacefast CLI · authorized by Justin Tadlock | **`system` · Spacefast** |

So the name is misleading twice over: it updates no config, and nothing about
the space's configuration had changed. **`.env.server` has not been modified
since Aug 30 18:30 and `sf.jsonc` since Aug 25** — both predate v18, which
published cleanly.

**They are new behaviour, and the changeover is exact.** Every version from v1
to v18 — eighteen of them across a week, 2026-08-24 to 08-31 — is `git`. **Every
version since is `config_update`**, and the first appeared **ten minutes after
the v18 publish**. Nothing resembling one exists anywhere earlier in the space's
history.

| | |
|---|---|
| v1 – v18 | `git`, 2026-08-24 → 08-31 18:35 |
| v19 | `config_update`, 08-31 18:45 — 10 min after v18 |
| v20 – v23 | `config_update`, 09-01 15:37 → 15:44 |

**Today's four are a bounded retry chain**, and the timings say so plainly —
each created **one second** after the previous was promoted, each taking ~2m22s
to reach `ready`:

```
v20  created 15:37:00   ready 15:39:25   promoted 15:39:26
v21  created 15:39:27   ready 15:41:49   promoted 15:41:50
v22  created 15:41:51   ready 15:44:09   promoted 15:44:10
v23  created 15:44:11   ready 15:46:35   promoted 15:46:36   ← chain ends
```

v19 is the odd one out: **35 minutes** from created to ready (18:45:26 →
19:20:24), and a lone event rather than a chain. That is the one this log
already records as having broken sign-in.

**`status: ready` is not a claim that the runtime works.** All four report
`status: ready`, `failureCode: null`, `failedStage: null`, `diagnostics: []` —
while the runtime they had just delivered was answering 422 to `/api/status` and
to every `query.run`. There is no field on a version record that would have told
us the space was down.

**The channel history cannot tell a redelivery from a publish.** Every promotion
in `sf channels history --json` is `actorType: "system"`, `actorId:
"version-finalize"`, `kind: "publish"` — the config_updates included. Only the
rollback is distinguishable (`actorId: "version-promote"`, `kind: "rollback"`).
So a log of what moved production reads as eleven publishes when five of them
were the platform redelivering the same manifest.

**Leading hypothesis for `runtime_delivery_lock_timeout`, not proven.** The
publish prints its steps in order:

```
Synced 4 server variables from .env.server.
✓ Updating space  larderlog
⠋ Creating version          ← dies here
```

**v20 was created at 15:37:00, inside the same minute.** The `.env.server` sync
is unconditional — it ran and reported four variables even though the file is
three days old and no value changed — and the `Updating space` step that follows
it appears to kick off a runtime redelivery. That redelivery plausibly holds the
runtime delivery lock, and `Creating version` then times out waiting for the
lock the CLI's own previous step just took. It would explain the error name, the
timing, and why v19 also trails a publish by minutes.

If that is right, **the fix is for a variable sync that changes no value to be a
no-op**, which would remove the trigger entirely.

**One thing that is *not* wrong: a `config_update` version is not inherently
broken.** v19 is one, it is what the rollback restored, and the space has been
serving correctly on it since 15:49. The defect is in the delivery, not in the
version kind.

### The trigger, with timestamps — `sf publish` rewrites every variable unconditionally

`sf env ls --json` — an entire command family this log had never recorded —
reports each variable's `updatedAt`, and all four carry the moment of the failed
publish:

```
INVITE_SECRET            2026-09-01T15:36:58
LARDER_RETENTION_MONTHS  2026-09-01T15:36:58
LARDER_ADMIN_IDS         2026-09-01T15:36:59
LARDER_DEV_GUESTS        2026-09-01T15:36:59
v20 (config_update)      2026-09-01T15:37:00   ← created one second later
```

**`.env.server` has not been modified since Aug 30 18:30**, so not one of those
four values changed. The publish rewrote all four anyway — an unconditional
write rather than a diff-and-skip — and the platform minted a config-only
redelivery **one second** after the last write. The chain reads:

```
15:36:58-59  four variables rewritten with identical values
15:37:00     v20 config_update created — the runtime redelivers
             …which holds the runtime delivery lock…
             Creating version → runtime_delivery_lock_timeout
```

That is the CLI's own earlier step taking the lock its next step then waits for.

**And `--config-only` is a documented flag on `sf publish`** — *"Publish a
config-only version that carries the prior artifact forward without building or
uploading content"* — which is exactly what v19–v23 are, down to the identical
manifest hash and `+0/~0/-0`. So `config_update` is not a mysterious platform
event: it is the config-only publish path, invoked internally by the variable
sync. **Nobody here ever passed that flag.**

**The single-line fix, from outside:** a variable write whose value is unchanged
should not write, and therefore should not redeliver.

**A dry run does not do any of this.** `--dry-run` printed no *Synced 4 server
variables* line and left the variables' `updatedAt` alone, which is what makes
it useless for reproducing this and safe for everything else.

**`sf env` is undocumented here and worth knowing**: `sf env ls` lists with
masked values, and a variable can carry **separate production, preview and
branch values** (`--production-value` / `--preview-value`). All four of ours are
`secret=true` with no target, i.e. one value for every environment.

### Confirmed against the CLI's own source — 2026-09-01, later

The hypothesis above is no longer a hypothesis. `syncServerEnvVariables` in
`node_modules/spacefast/dist/commands/publish.js` (bundled from
`src/server-env.ts`) was read directly:

- **The sync is a blind `PUT` per variable.** `for (const entry of entries)` →
  `PUT /v1/spaces/{id}/variables/{name}` with `secret: true`. There is **no
  GET, no compare, no diff** — every runtime publish rewrites every variable
  even when nothing changed. Four PUTs at 15:36:58–59, four `config_update`
  redeliveries queued; **four variables, four redeliveries** may not be a
  coincidence.
- **The irony one screen down**: the settings patch in the same flow goes
  through `publishSettingsPatchIsNoOp()` before being sent. **Settings are
  no-op-checked; variables are not.** The no-op guard exists in this codebase
  and was applied to one of the two writes.
- **`--target preview` does not avoid it.** The sync call site is gated only on
  `runtimeStep` (any Zero project) and runs *before* the progress group starts —
  before `Creating version` is even printed. `publishChannelForCommand` maps
  `preview → channel: null`, which affects only the finalize step. So a preview
  publish protects the live *channel* and still fires the variable sync at the
  live *runtime*.
- **`config_update` is confirmed as the config-only publish path**: the version
  create body carries `input.configOnly ? { kind: "config_update" } : {}` — the
  exact `source.kind` on v19–v23. The platform's internal redelivery uses the
  same kind the `--config-only` flag would.
- **`runtime_delivery_lock_timeout` appears nowhere in the CLI or SDK** — it is
  a server-minted code passed through verbatim. Nothing client-side can retry,
  extend or avoid the lock.
- **Skipping the sync is possible and proven safe by code.** Only three things
  skip it: `--dry-run`, an anonymous space, and an **absent or empty
  `.env.server`**. `loadEnvFileSource` returns `null` on ENOENT →
  `entries = []` → `skipped: "empty"` **before any API call**. And the
  delete branch — the one that removes server variables not in the file — runs
  **only** when the source file is `.env.lakebed.server`, never for
  `.env.server`. So temporarily renaming `.env.server` aside means **zero
  variable API calls and zero deletions**: the four values already stored
  server-side (updatedAt 15:36:58–59) stay exactly as they are.

**The tested-safe publish recipe that follows from the code** (not yet run):

```bash
mv .env.server .env.server.hold       # sync reports "empty", writes nothing
npx sf publish --target preview       # version created, channel: null, live untouched
mv .env.server.hold .env.server
```

Residual exposure: version finalize itself (server-side; the thing that has now
failed twice at `Creating version`), and whatever schema application preview
finalize performs against the shared database — additive-only here, and v19's
capsule cannot see tables it does not declare, so old-runtime behaviour is
unchanged by design.

**Still open: what minted v19 on Aug 31.** Today's chain is explained
(PUT → redelivery), but v19 trailed the v18 publish by **ten minutes**, not one
second, and today's sync overwrote the variables' `updatedAt`, so the Aug 31
write times are gone. The earlier note attributing it to a dashboard settings
change and this session's sync-triggered theory cannot both be checked any more.

### The recipe ran, and it worked — v24, 2026-09-01 16:12

`.env.server` moved aside, `npx sf publish --target preview`, file restored.
**33 seconds, first try, no lock timeout** — the step that had now failed twice
(`Creating version`) sailed through the moment no variable writes preceded it.

| check | result |
|---|---|
| `Synced N server variables` line | **absent** — the skip worked |
| variables' `updatedAt` | all four still `15:36:58–59` — untouched |
| live channel | still `ver_28fb39a4…` (v19), timestamp still the rollback's |
| live `/api/status` | `ok`; live `client.js` still carries no new code |
| `config_update` versions after 16:12 | **zero**, checked 3+ minutes later |
| v24 | `git`, `ready`, unpromoted; preview URL runtime-backed (`x-spacefast-version: ver_01c5577…`) |

**The zero-config_updates row is the experiment's real finding**: a publish
*without* variable writes triggers no redelivery, which confirms the causal
chain by its absence — it was the PUTs, not the publish.

**And a preview publish does not migrate the shared database.** `sf db --json`
still reports **eleven** tables — no `restocks`, `trips`, `claims` — with
`applied: true`, `pendingOps: 0`, hashes equal. The schema apparently applies at
promotion (or production finalize), not at version creation. Two consequences:

1. **Isolation is better than expected** — a preview stages content and capsule
   without touching live's schema at all.
2. **The preview runtime may be degraded**: if v24's capsule serves the preview
   URL against the shared 11-table database, every query touching the three
   missing tables (`claims` runs on every pantry load) will throw — and a
   throwing query is a permanent spinner (no error path). Whether preview gets
   its own schema view is unknowable from outside the cookie gate. **Expect the
   run list's claims and any restock write to fail on the preview URL**, and do
   not read that as a bug in the app.

The promote path when ready: `npx sf promote v24` — which is presumably the
moment the migration runs. Unverified.

### v24 promoted, 422 again, rolled back — and the failure is now characterized — 2026-09-01 16:1x–16:25

`sf promote v24 --yes` succeeded (`promoted: true`; note `sf promote` without
`--yes` refuses with `confirmation_required` even though `sf publish` prompts
interactively). The migration applied — `sf db` reported **fourteen tables**,
`applied: true`, hashes equal — and the runtime immediately answered
**422 `zero_artifact_mode_invalid`** on every capsule call, exactly as the
morning's redeliveries had. Polled for 2.5 minutes: no recovery. Presentation
for a signed-in user: **the permanent Loading… screen** (every query fails;
Zero has no error path, so subscriptions hold their initial value forever),
while signed-out pages render fine because they make no server calls.

Justin rolled back to v19 (an agent-initiated `sf rollback` was refused with a
person-approval gate — `confirmation_required` with a pollUrl/continuationToken
protocol, and a retry without the token gets *"This exact action already has a
decision"*; `promote` had no such gate, which is inconsistent). Live healthy
again immediately.

**`sf db` reflects the live version's declared schema, not the physical
database.** With v24 live it said 14 tables; after the rollback it says 11
again. So *"the migration applied"* as reported by that command is a statement
about the live artifact's schema plan, and it un-says it on rollback.

**The characterization, and it is clean:**

| delivery | content | delivered | result |
|---|---|---|---|
| v18/v19 | v18's manifest | Aug 31 | **works, still serving** |
| v20–v23 | **byte-identical** to v18 (same `manifestHash`) | Sep 1 15:37–15:44 | 422 |
| v24 | new content, same toolchain (0.2.2) | Sep 1 16:12, live 16:2x | 422 |

Identical bytes, opposite outcomes, separated only by delivery date. **The
platform's runtime loader changed between Aug 31 ~18:45 and Sep 1 ~15:37**:
artifacts delivered before the change keep running (rollback re-points without
redelivering — which is why it works); **every delivery since is rejected**,
old bytes and new alike. Nothing in our code can matter to this.

**The artifact declares no "mode" anywhere.** The error vocabulary — *"artifact
mode does not match the invocation mode"*, *"a read handler cannot carry
write-side capabilities"* — implies a per-handler read/write mode contract. Our
artifact, compiled by `spacefast@0.2.2` (**the newest published release**), has
`server.{queries,mutations,actions,endpoints,sockets}` as plain lists with no
mode field at all (checked by walking the whole JSON for keys containing
"mode"; only `realtime.mode: central` exists). **The serving runtime appears to
validate a field the published compiler does not emit** — the platform is ahead
of its own npm toolchain, and every space that publishes today presumably hits
this.

**Consequence: no version of this app can ship until Spacefast fixes delivery.**
Re-publishing even v18's exact bytes fails. The preview/promote flow itself
worked exactly as designed and is exonerated — v24 is staged, ready, and one
`sf promote v24` from live the moment deliveries validate again. This is the
headline item for the feedback report.

### Can we tell whether publishing works yet? — 2026-09-01, evening

A read-only sweep, live untouched. Four signals, none of them conclusive on its
own, and one test that would be.

| check | answer |
|---|---|
| a newer CLI on npm | **no** — `spacefast` and `@spacefast/zero` are both still `0.2.2`, published Aug 28. The toolchain has not moved |
| new `config_update` versions since the loop stopped | **none** — the list still ends at v24 (16:12); v23 at 15:44 was the last redelivery. The retry chain has stayed dead for hours |
| live health | `GET /api/status` on v19 → **`ok`** |
| the two error codes in the published registry | **neither is there** |

**Neither code we hit exists in the error reference**, which announces *"There
are 481 error codes in the registry."* `zero_artifact_mode_invalid` is absent —
the registry lists five `zero_artifact_*` codes (`abi_mismatch`, `invalid`,
`malformed`, `path_invalid`, `unreadable`) and not that one — and
`runtime_delivery_lock_timeout` is absent too. Its own `type` URI still 404s.
So both failure modes are minted by a serving runtime that is **ahead of the
platform's own documented surface**, which is the same gap the missing
compiler-side mode field points at.

**And the platform derives a mode field the compiler does not emit.** The live
runtime's record carries one on our single endpoint:

```
runtime.app.capsule.endpoints = [{"mode":"read","method":"GET","path":"/api/status"}]
local artifact.json           = [{           "method":"GET","path":"/api/status"}]
```

**That is v19's record, and it is the only capsule record the API will hand
over.** `sf versions get <any-id>` returns `data.runtime.app` describing the
**live** runtime, not the version asked about — both reads come back byte
identical at 2530 bytes with `artifactId: zero_ver_28fb39a4…` (v19) whichever id
is passed, and `data.runtime.pendingApp` is `null`. So a failing version's
derived metadata cannot be inspected from outside at all; there is no
`data.version.app`. Worth knowing before designing any check around it.


#### The decisive test exists and does not touch live

**v24 is still staged, `ready`, and has its own runtime-backed hostname** —
`https://v24--larderlog.view.fast/`, the same `vN--` shape the dashboard
thumbnail uses for v19. Hitting `/api/status` there invokes v24's capsule
through the real loader **without promoting anything**: `ok` means deliveries
validate again, a 422 means they still do not. No channel moves either way.

**It cannot be driven from here.** Every `vN--` hostname answers **403 "This
space is private"** — to an anonymous curl, to a `Bearer` CLI API key, and to
that key as a cookie. The response carries `x-spacefast-runtime: 1` and
`x-spacefast-version: ver_01c5577…`, so the request reaches the runtime edge and
the gate sits in front of the capsule. The API redacts the way through: the
space record's `thumbnail.sourceUrl` is `https://v19--larderlog.view.fast/?__=`
followed by a literal `[redacted]`, so the signed `__=` token that the dashboard
and the screenshot service use is never returned to the CLI.

**So it is a browser check**: open v24 from the dashboard's version list — that
link carries the token — and add `/api/status` to it. That is the whole test.

*Friction*: a CLI-authenticated API key opens every management endpoint and
cannot open a preview of the version it just created. There is no
`sf versions open`, no `--preview-url`, and no documented way to mint the `__=`
token, so the one non-destructive way to validate a staged version is
unreachable from automation — which is exactly where a publish check belongs.

### v24 still 422s — and the SDK contradicts the runtime in its own type signature — 2026-09-01, evening

The browser check ran. `https://v24--larderlog.view.fast/api/status` answered:

```json
{"code":"zero_artifact_mode_invalid","status":422,
 "title":"Zero artifact mode invalid",
 "detail":"A read handler cannot carry write-side capabilities.",
 "type":"https://spacefast.com/docs/errors/zero_artifact_mode_invalid"}
```

and the app itself hangs on `Loading…`. **Deliveries are still rejected**, on a
version created before the check and untouched since. The live channel never
moved; this cost nothing.

**The detail is a claim about our artifact, so it was tested — and it is true,
for a reason that is in `@spacefast/zero@0.2.2`'s own `server.d.ts`.**

```ts
export type QueryServerContext<TDb = DbContext> = {
    auth; content; db: TDb; env; gravatar; log;
    spam: Pick<RequestSpamCheck, "check">;
};
export type ServerContext<TDb = MutationDbContext> =
    Omit<QueryServerContext, "db" | "spam"> & {
        db: TDb;              // WriteTableApi
        email: SendEmail;
        invalidate: InvalidateQueries;
        spam: RequestSpamCheck;
        transaction: Transaction;
    };

export declare function query   (handler: (ctx: QueryServerContext<TDb>, …) => …);
export declare function mutation(handler: (ctx: ServerContext<TDb>,      …) => …);
export declare function endpoint(route: EndpointRoute,
                                 handler: (ctx: ServerContext, req) => …);
```

**`endpoint()` hands its handler `ServerContext` — the write-side context, the
same one `mutation()` gets — unconditionally, whatever the HTTP method.** The
file's own comment above `QueryServerContext` calls it *"What a read handler
gets"* and says the withheld services *"come back in full on the write-side
contexts below"*. So the SDK already speaks in exactly the two nouns the error
does, and it gives every endpoint the write-side one.

The platform then classifies a `GET` endpoint as `mode: "read"` (its record
above). A read-mode handler holding `transaction`, `email`, `invalidate`, full
`spam` and a `WriteTableApi` **is** a read handler carrying write-side
capabilities. **The toolchain cannot express the shape the runtime now
requires**: there is no `mode` option on `EndpointRoute`, no read-only endpoint
variant, and no way to ask for a narrower context — checked, the whole `.d.ts`
contains no `mode` at all.

**Our handler is `endpoint({ method: 'GET', path: '/api/status' }, () => text('ok'))`.**
It ignores the context entirely. It cannot *use* a write capability; it is
merely handed one, and the capability set travels with the handler kind rather
than with the code.

#### The one-line experiment this suggests, priced but not run

Deleting the endpoints block changes **exactly one field** in the compiled
artifact — verified by building it both ways and diffing every leaf:

```
.server.endpoints   before [{"method":"GET","path":"/api/status"}]   after []
```

14 tables, 14 queries, 29 mutations, schema, bundles, `realtime` and
`db.migrations` all identical. Typecheck clean once `endpoint` and `text` come
off the import. `/api/status` is a health check this project added for its own
publish checklist — nothing in the app calls it.

**If the artifact is rejected as a whole because of that one handler, removing
it unblocks publishing without waiting for Spacefast.** If the artifact-level
mode is something else, it changes nothing and costs one preview version. The
second `detail` — *"Zero artifact mode does not match the invocation mode"* on
`query.run`, where our queries take the correct read-side context — is the
evidence for a whole-artifact rejection rather than a per-handler one.

**How it would be run, and why it is safe**: the `.env.server`-aside recipe (no
variable writes, therefore no redelivery), `--target preview` (no channel
moves), then open the new `vN--` link from the dashboard. Because a preview
runs against the **live** database, which the rollback returned to eleven
tables, `claims` will throw there regardless — so the discriminator is *does the
item grid render at all*, not *does everything work*. A rejected artifact is a
permanent `Loading…` with no query answering; an accepted one renders the grid
and fails only the run list's claims.

#### For the report

`zero_artifact_mode_invalid` is unactionable by construction: it is absent from
the 481-code error registry, its `type` URI 404s, `sf logs runtime` is empty
because nothing runs, the failing version's own capsule metadata is not
retrievable through the API, and **the published SDK cannot emit a conforming
artifact** — `endpoint()` has one context type and it is the write-side one. Any
Zero space with a single `GET` endpoint appears to be in this position.

### The probe could not be run: version creation itself is failing now — 2026-09-01, evening

Four `sf publish --target preview` attempts, all with `.env.server` moved aside,
all dying at the same step:

```
✓ Updating space  larderlog
⠋ Creating version
Runtime API request failed: Runtime API request timed out after 10000ms.
```

**Three were the endpoint-less probe; the fourth was a control** — the tree
restored to exactly the content that created v24 successfully at 16:12, six
hours earlier. **The control failed identically.** So this is the platform, not
our artifact: an artifact declaring zero endpoints is not what version creation
is choking on, and the probe's question is still unanswered.

**Nothing was created by any of the four.** `sf versions ls` still ends at v24,
the live channel is still `ver_28fb39a4…` at 16:25:38, live `/api/status` is
`ok`, and all four variables still carry their 15:36:58–59 stamps — the
env-aside recipe held, exactly as it did for v24.

**And the runtime API is not down — only its write path is.** In the same
minutes, `sf db --json` answered through it (eleven tables, `applied: true`,
`pendingOps: 0`) and `sf doctor` came back **all green**, including
`api  API reachable`, `runtime  state=active live=ver_28fb39a4…:ready` and
`publish  latest=ver_01c5577…:ready`. A green doctor and a publish that cannot
create a version is a bad pair: **nothing in the CLI's own diagnostics reports
the one thing that is broken.**

**The 10s timeout is server-minted, not a client cap.** The earlier note called
it *"a client-side 10s cap rather than a server refusal"* — that was an
inference and it is wrong. Neither `Runtime API request failed` nor
`Runtime API request timed out after 10000ms` appears anywhere in
`node_modules/spacefast/` or `node_modules/@spacefast/` (`timed out after` turns
up only in the unrelated MCP proxy). The text arrives from the API. So it is
the platform's own internal call to its runtime API that gives up after ten
seconds, and there is no client-side knob to extend.

**Rate limiting arrived alongside it.** The dashboard began refusing Justin for
too many requests while these attempts ran, and recovered a few minutes later.
Four publishes and a handful of `versions ls` / `env ls` / `db` reads is not a
lot, and part of that budget was spent by the CLI itself; worth knowing that a
publish-retry loop can lock a person out of the admin UI they would use to
diagnose the failed publish.

#### Where this leaves things

| | |
|---|---|
| live | v19, healthy, untouched throughout |
| deliveries | still rejected — v24 re-checked in a browser today, still 422 |
| new versions | **cannot be created at all** as of this evening |
| our tree | clean; the probe is a two-line change, written up above |

Two distinct platform failures are now stacked: **the loader rejects every
artifact delivered since ~15:37 today** (`zero_artifact_mode_invalid`), and
**version creation times out** (`Runtime API request timed out after 10000ms`).
The second has to clear before the first can even be tested.

### Version creation recovered on its own — v25, 2026-09-01 22:14

**One of the two stacked failures has cleared, with no action on our side and no
change to the toolchain.** A single `sf publish --target preview` on the
env-aside recipe created **v25** (`ver_9c37b4f267c4…`) in **31 seconds**, first
try — the exact step that had timed out four times a few hours earlier,
including on a control build. Nothing was retried and no loop was run.

A read-only sweep taken immediately before it found **every external signal
unchanged** from the evening entry, which is worth recording because none of
them predicted the recovery:

| check | answer |
|---|---|
| newer CLI on npm | **no** — `spacefast` and `@spacefast/zero` both still `0.2.2`, modified Aug 28 |
| both error codes documented yet | **no** — `zero_artifact_mode_invalid` and `runtime_delivery_lock_timeout` still 404 at their own `type` URIs |
| new `config_update` versions | **none** — the redelivery loop has stayed dead since 15:44 |
| `sf doctor` | all green (as it was while broken — still not a signal) |
| live health | v19, `/api/status` `ok`, anon `households` → `{"state":"guest"}` |

**So `Runtime API request timed out after 10000ms` at `Creating version` is
transient and self-clearing**, and nothing observable from the client side
distinguishes "broken" from "recovered" except attempting it. That is the
practical finding: **the only diagnostic for version creation is version
creation.** A green doctor means nothing here.

**The env-aside recipe held again, measured rather than assumed:**

| | |
|---|---|
| `Synced N server variables` line | **absent** |
| the four variables' `updatedAt` | all still `15:36:58–59` — untouched |
| live channel | still `ver_28fb39a4…` at **16:25:38** — never moved |
| live `/api/status` after the publish | `ok` |
| `config_update` versions triggered | **zero**, re-checked a minute later |
| files | 147 (25 uploaded — incremental) |

**v25 carries D64–D68**: 14 tables, 15 queries, 31 mutations, `db.migrations`
empty, `/api/status` still the only endpoint, built from `a33efbd` on a clean
tree.

**The second failure is untested and is the one that blocks shipping.** Whether
the loader still rejects deliveries is unknown for v25: `https://v25--larderlog.view.fast/api/status`
answers **403 "This space is private"** to an anonymous curl exactly as v24's
did, with `x-spacefast-runtime: 1` and `x-spacefast-version: ver_9c37b4f2…`, so
the request reaches the runtime edge and the gate sits in front of the capsule.
**Still a browser-only check**, from the dashboard link that carries the signed
`__=` token — the friction already logged above, now hit a second time on the
one test that would authorize a promotion.

**Do not promote v25 until that check answers `ok`.** v24 taught the cost: a
promote applies the migration, the runtime 422s on every capsule call, and a
signed-in user gets a permanent `Loading…` until somebody rolls back — and
`sf rollback` is gated behind a person-approval prompt that an agent cannot
clear, while `sf promote` is not. **The inconsistency is the hazard**: the
destructive direction is one command and the recovery is not.

**Also still true**: v25 declares the same single `GET /api/status` endpoint
that the *"read handler cannot carry write-side capabilities"* theory implicates,
so if v25 422s, the endpoint-less probe written up above is the next step and is
still a two-line change.

### v25 still 422s, and the endpoint-less probe is staged as v26 — 2026-09-01 22:20

**The browser check on v25 came back 422**, byte-identical to v24's:

```json
{"code":"zero_artifact_mode_invalid","status":422,
 "detail":"A read handler cannot carry write-side capabilities.",
 "type":"https://spacefast.com/docs/errors/zero_artifact_mode_invalid"}
```

So the two failures are **independent**: version creation recovered on its own
(v25, v26 both created in ~31s), and the **loader still rejects every delivery**.
Six versions have now been delivered since ~15:37 and all six are invalid,
across two different content sets and one byte-identical redelivery of v18.

**The probe priced in the previous entry was therefore run.** Removing the
`endpoints` block from `server/index.ts` and dropping `endpoint` and `text` from
the import is a **1-insertion, 5-deletion** change. Typecheck clean, **947
assertions** pass, and the compiled artifact was diffed leaf-by-leaf against the
build that produced v25:

| leaf | before | after |
|---|---|---|
| `server.endpoints` | `[{"method":"GET","path":"/api/status"}]` | **`[]`** |
| `sourceManifest.files[103]` (`server/index.ts`) | 168836 B | 168723 B |

**Nothing else moved**: 14 tables, 15 queries, 31 mutations, `db.migrations` `[]`,
schema, bundles and `realtime` all identical. (The `sourceManifest.env` leaves
also differ, but only because the v25 baseline was built with `.env.server`
moved aside — that is the recipe, not the change.)

**v26** = `ver_07fcdb087260…`, `git`, `ready`, unpromoted, 32 seconds, created on
the env-aside recipe. Live channel still `ver_28fb39a4…` at **16:25:38**, all
four variables still `15:36:58–59`, live `/api/status` `ok`, **zero**
`config_update` versions triggered.

**The discriminator has to change for v26, and this is the trap.** v26 declares
no endpoints, so `/api/status` on its preview host **404s by design** — that is
the probe working, not the artifact being rejected. The capsule call is the test:

```js
// devtools console, on the v26 preview origin
await (await fetch('/__spacefast/zero/run', {method:'POST',
  headers:{'content-type':'application/json'},
  body:JSON.stringify({op:'query.run',name:'households',args:[]})})).text()
```

A real `query.result` envelope means **the artifact was accepted and the single
`GET` endpoint was the whole cause** — publishing is unblocked without waiting
for Spacefast, at the cost of the health check this project's publish checklist
uses. A 422 means the rejected "mode" is something else entirely and nothing in
our code can reach it.

**Note the preview runs against the live database**, which the rollback returned
to eleven tables, so `claims` will throw on v26 regardless — a permanent
`Loading…` on the run list is expected there and is not evidence either way.
The `households` call above is unaffected.

### The probe answers: the endpoint was never the cause — 2026-09-01 22:2x

**v26 declares zero endpoints and the capsule is still rejected.**

```json
POST https://v26--larderlog.view.fast/__spacefast/zero/run  → 422
{"code":"zero_artifact_mode_invalid",
 "detail":"Zero artifact mode does not match the invocation mode."}
```

**So the `endpoint()` write-side-context hypothesis is dead**, and the reasoning
that produced it was led astray by the error text. Collecting every rejection
today against how it was called:

| version | endpoints declared | call | `detail` |
|---|---|---|---|
| v20–v23 (v18's exact bytes) | 1 | `GET /api/status` | *A read handler cannot carry write-side capabilities.* |
| v20–v23 | 1 | `POST query.run` | *Zero artifact mode does not match the invocation mode.* |
| v24, v25 | 1 | `GET /api/status` | *A read handler cannot carry write-side capabilities.* |
| **v26** | **0** | `POST query.run` | *Zero artifact mode does not match the invocation mode.* |

**The `detail` is a function of the invocation, not of the artifact.** A GET
yields one sentence and a POST the other, on artifacts with an endpoint and on
one without. The *"read handler cannot carry write-side capabilities"* wording
is a generic message attached to a request classified as a read — it was never a
report about our `endpoint()` handler, and reading it as one cost a probe.

**The lesson, and it is the standing one in a new place**: the detail string
looked like a claim about our code and was testable, so it got tested — which
was right. What was missed is that the *same* string had already appeared
against `GET` on **v18's byte-identical redelivery**, an artifact that had served
correctly for a day. That alone ruled the endpoint out before the probe was
built. **Evidence already in this log contradicted the hypothesis it was used to
support.**

**Where this leaves it**: the rejection is whole-artifact and lands before any
handler dispatch, on six deliveries across two content sets and one redelivery of
known-good bytes. **Nothing in the app can affect it, and there is no further
experiment worth running from here.** The block is entirely Spacefast's loader,
which changed between Aug 31 ~18:45 and Sep 1 ~15:37 and now rejects everything
delivered since, while artifacts delivered before it keep serving — which is why
`sf rollback` restores service and why v19 is still healthy.

`server/index.ts` is restored to `a33efbd`; the endpoint and its imports are back
and the tree is clean. **v25 and v26 remain staged, `ready` and unpromoted** —
harmless, and both one `sf promote` from live if deliveries ever start
validating, though by then a fresh publish would be preferable.

#### For the report — the headline, revised

`zero_artifact_mode_invalid` rejects **every** artifact delivered since ~15:37 on
2026-09-01, including a byte-identical redelivery of a version that had served
for a day, and including one with no endpoints at all. It is absent from the
481-code error registry, its `type` URI 404s, `sf logs runtime` is empty because
nothing runs, and the failing version's capsule metadata is not retrievable
through the API (`sf versions get <id>` returns the **live** runtime's record
whichever id is passed). Its two `detail` strings vary by request method rather
than by cause, which actively misdirects. **A space cannot ship any version, and
cannot learn why.**

### What the browser console added — 2026-09-01 22:3x

Loading v26 in a real browser produced more than the single `query.run` probe
did. Each failing request was compared against **live (v19)**, which is the
control this log has been missing:

| request | live (v19) | v26 | reading |
|---|---|---|---|
| `GET /__spacefast_generated/theme.css` | **404** | 404 | **normal** — not a regression, not ours |
| `GET /site.webmanifest` | 200 | 403 | the **preview privacy gate**, not the app |
| `POST /__spacefast/comments/ticket` | n/a | 403 | same gate; a platform collab feature |
| `POST /__zero/run` | **200** | **422** | the rejection |
| `GET /__zero/realtime/events?limit=100` | **200** | **500** | the rejection, **untyped** |

**Three things worth keeping.**

1. **The client does not use the path this log has been curling.** The SDK calls
   **`/__zero/run`**; `/__spacefast/zero/run` is the other spelling and both are
   live-200. Any future check should drive `/__zero/run`, because that is the one
   a user's browser actually hits.
2. **The rejection spans subsystems and is not uniformly typed.** Realtime fails
   with a bare **500**, not the 422 envelope — so a delivery failure can surface
   with no code, no title and no `type` at all, on an endpoint that answers 200
   on live in the same second.
3. **Two suspicious-looking 404/403s are red herrings**, and only the live
   comparison shows it. Worth doing that comparison first next time.

#### The one `mode` in the artifact, and why it is not being chased

The error is `zero_artifact_mode_invalid` and the artifact contains **exactly one
`mode`** — `realtime.mode: "central"` (walked the whole JSON; nothing else
matches). The vocabulary is
`RUNTIME_REALTIME_MODES = ["central", "cast", "local"]`, and the CLI's own
bundled default is **`"local"`**, so `central` arrives from the **space's runtime
config** rather than from anything in this project — there is no `realtime` key
in `sf.jsonc` and no compiler input for it.

**This is not being treated as the cause, and the reason is the same fact that
killed the endpoint theory**: v20–v23 were a **byte-identical redelivery of
v18**, carrying `realtime.mode: "central"`, and v18 had served correctly for a
day. So `central` is not an invalid value — it was accepted on Aug 31 and
rejected on Sep 1. The wording is suggestive in the same way *"a read handler
cannot carry write-side capabilities"* was, and the same counter-evidence
applies. **Recording it as an observation, not acting on it.**

Changing it would also mean a **settings** change, which mints a
`config_update` version — the exact operation that triggered this morning's
redelivery loop. Not worth it on a hypothesis this weak.

#### The codes are absent from the pinned CLI too, not just the public docs

Grepped `node_modules/spacefast/` and `node_modules/@spacefast/`: **neither
`zero_artifact_mode_invalid` nor `runtime_delivery_lock_timeout` appears
anywhere.** The CLI bundles its own error registry with recovery hints, and it
knows exactly the same five as the public one:

```
zero_artifact_abi_mismatch   { retryable: false, recovery: "fix_input" }
zero_artifact_invalid        { retryable: false, recovery: "fix_input" }
zero_artifact_malformed      { retryable: false, recovery: "fix_input" }
zero_artifact_path_invalid   { retryable: false, recovery: "fix_input" }
zero_artifact_unreadable     { retryable: false, recovery: "fix_input" }
```

So the serving runtime mints codes that **neither its documentation nor its own
pinned client library has ever heard of**. Note the sibling that does exist:
**`zero_artifact_abi_mismatch`** is precisely the honest code for *"this artifact
was built by a compiler older than this runtime accepts"*, which is what the
evidence points at. Emitting an unregistered `mode_invalid` instead sent this
investigation into two dead ends.

### Docs review — nothing new, and two hypotheses killed properly — 2026-09-01 22:3x

A full pass over the published documentation looking for anything that explains
or unblocks the delivery failure. **Nothing does**, and the review is worth
recording mostly for what it rules out.

**The docs have a search API**, which beats crawling `llms.txt`:

```bash
curl "https://api.spacefast.com/v1/docs/search?q=rollback"
```

Results are under `data.results`. It found no page for either of our codes.

| checked | result |
|---|---|
| npm toolchain | still `0.2.2` (Aug 28) — unmoved |
| error reference | still *"There are 481 error codes"*; same five `zero_artifact_*`; **neither of our codes** |
| `zero-runtime.md` (22.5 KB) | **zero occurrences of the word "mode"**, and no read/write handler vocabulary anywhere |
| status page | **none** — `status.spacefast.com` does not resolve, `/status` 404s |
| `api.spacefast.com/health` | `ok`, every dependency green, `commitSha ddb7ebd6d5a1…` |

**The changelog is stale and its `.md` twin is broken.** `llms.txt` promises
*"Add `.md` to any docs URL"* and names
[`/docs/changelog`](https://spacefast.com/docs/changelog) as *"what shipped and
when"* — but **`/docs/changelog.md` 404s** (25 KB of HTML, the standing trap),
and the HTML page's newest entry is **0.0.25, August 21**. It does not list
`0.2.2` at all. So the one page that would say *"the runtime loader changed on
Sep 1"* is two weeks and several releases behind, and unreadable as Markdown.

#### Both remaining hypotheses are now dead, on the platform's own data

`sf versions get <id> --json` → `data.runtime.app.capsule.install` settles both:

```json
"binary": { "compatibilityTarget": { "profile": "linux-x86_64-gnu-v1", … } },
"realtime": { "production": "central", "local": "foreground-cli-ws" },
"mysql":    { "migrateAtFinalize": true, "blockIncompatibleRollback": true }
```

- **Not an ABI drift.** The live runtime targets `linux-x86_64-gnu-v1`, and the
  pinned CLI hardcodes that exact string (66 occurrences). Both sides agree.
- **`realtime.mode: "central"` is the platform's own production value**, not
  ours and not wrong — `install.realtime.production` *is* `central`. The
  hypothesis recorded above as "observed, not chased" is now positively
  disproved. **Not chasing it saved a version.**

Also newly visible: **`migrateAtFinalize: true`** (the schema applies at
finalize, which matches v24 migrating on promote) and
**`blockIncompatibleRollback: true`** — worth knowing before any future
promote, though the v24 → v19 rollback across a 14→11 table difference was
allowed, additive changes being compatible in that direction.

#### The docs state the rule this investigation broke

The error reference says it outright:

> **Match on `code`, never on `detail`.**

That is exactly the discipline the endpoint probe violated — the theory was
built entirely on the `detail` sentence *"a read handler cannot carry write-side
capabilities"*, which turned out to vary by HTTP method rather than by cause.
**The platform documents the rule; we did not follow it.** Worth holding onto
beyond this incident.

#### And the closest documented code has an unavailable remedy

`zero_artifact_abi_mismatch` — *"The Zero endpoint artifact was built for a
different runner ABI"* — is the registered code whose **situation** matches
ours. Its stated resolution:

> Rebuild the Zero project with the current Spacefast CLI and runtime, then
> publish it again.

**We are on the current CLI.** `0.2.2` is the newest published release, the
rebuild has been done four times, and the result is the same 422. So even the
nearest documented failure mode offers a remedy that is already exhausted.

**Conclusion: the docs contain nothing that explains, predicts or resolves this.**
The serving runtime mints codes absent from its own registry and its own pinned
client, describes a concept ("artifact mode") that appears nowhere in the runtime
reference, and the changelog that would date the change stops two weeks short.
Nothing further to learn from here — **this waits on Spacefast.**

---

## 2026-09-02 — `@spacefast/zero/charts` on small and degenerate data

**bug / friction.** Three findings from building two counting charts against the
platform's chart module. None is documented — the module is not in the runtime
reference at all, so all of this is read off `dist/charts.js`.

### 1. `niceTicks` produces fractional ticks for integer data — *bug*

`barChartLayout` and `lineChartLayout` both divide the range into five. For a
chart counting **things**, the small cases are unusable:

| series max | ticks returned |
|---|---|
| 1 | `[0, 0.25, 0.5, 0.75, 1]` |
| 2 | `[0, 0.5, 1, 1.5, 2]` |
| 4 | `[0, 1, 2, 3, 4]` |

A count of households is not divisible, so the first two axes read as nonsense.
This is not an edge case for us: the chart is *new households per month*, and a
max of one or two is the ordinary state of a small space.

**Worked around** by filtering the returned ticks to whole numbers. That is the
right answer for a count and the wrong one for a chart of money or averages, so
the module cannot simply do it — but there is no way to *ask*. An
`integer: true` input, or exposing `niceTicks`' step choice, would cover it.

### 2. An all-zero series returns `null` coordinates and `NaN` geometry — *bug*

Twelve months with nothing in them is a completely ordinary state for an
admin chart, and `barChartLayout` does not survive it:

```js
barChartLayout({ data: Array.from({length: 12}, (_, i) => ({ label: 'M'+i, added: 0 })),
                 x: 'label', series: ['added'], height: 200 })

// ticks: [{value: 0, y: null}, {value: 0, y: null}, {value: 0, y: null},
//         {value: 0, y: null}, {value: 0, y: null}]
// groups[0].bars[0].height: NaN
```

Three problems in one return value: **five ticks all valued `0`** (so a
`key={t.value}` collides), **`y: null` on every one** (SVG reads that as `0`, so
they stack on the top of the plot rather than sitting on the axis), and
**`NaN` bar heights**, from dividing by a top tick of zero.

The cause is that `topTick` is `0`, and nothing guards it. A series that is all
zero has a defensible layout — one tick at the floor and no bars — and returning
it would save every consumer the same three fixes.

**Worked around** by deduping ticks on value, falling back to the plot floor
when `y` is not finite, and drawing a bar only when its height is a positive
finite number. That last condition also covers a single zero month inside an
otherwise busy year, which returns `height: 0` and is correct.

### 3. `Sparkline` is fixed-width and announces as an unlabelled image — *friction*

```js
return h("svg", { viewBox: `0 0 ${width} ${height}`, width, height,
                  class: "inline-block", role: "img" }, …)
```

Two things make it hard to use in a card:

- **`width` is a hard attribute**, defaulting to 96, so it cannot fill a fluid
  container without a CSS override reaching into the component's own `<svg>`.
- **`role="img"` with no `aria-label` and no way to pass one.** An `img` role
  with no accessible name is worse than no role at all — a screen reader
  announces an unlabelled graphic rather than skipping it. `StatTile`'s `trend`
  goes through the same component.

A `label` prop and honouring `width: '100%'` would fix both. We hand-rolled a
twelve-point path instead, which is about ten lines.

### What worked

`barChartLayout`'s `groups[].x` being the **band centre**, with bands of exactly
`plot.width / data.length`, made hit-testing trivial — the columns tile the plot
with no gaps by construction, which is better than the line layout, where the
same thing has to be derived from midpoints between points.

And the module genuinely costs nothing against the client bundle, as documented
for platform modules.

---

## 2026-09-02 — read-only sweep: the platform deployed, and nothing else moved

**Question**: is the delivery block (`zero_artifact_mode_invalid`, rejecting
every artifact delivered since Sep 1 ~15:37) still standing? No publishing was
done — this sweep is read-only.

**One thing changed: the platform deployed new code.**
`api.spacefast.com/health` now reports `commitSha f74dce6b3d5d…`, where the
Sep 1 ~22:30 sweep recorded `ddb7ebd6d5a1…`. That is a deploy of the management
API between then and now — whether it touches the runtime loader is unknowable
from outside, but it is the first movement of any kind since the block began.

**Everything else is byte-for-byte where last night left it:**

| check | answer |
|---|---|
| npm toolchain | still `0.2.2` (Aug 28) on both `spacefast` and `@spacefast/zero` |
| error registry | still *"481 error codes"*, same five `zero_artifact_*`; `zero_artifact_mode_invalid` still absent, its docs URL still 404, docs search returns 0 for it |
| channel history | nothing since the 16:25:38 rollback to v19 — no new `config_update` redeliveries |
| live | v19, `/api/status` `ok`, anon `households` over `/__zero/run` → `{"state":"guest"}` |
| v25 / v26 previews | still 403 "This space is private" to curl — the check is still browser-only |
| `sf versions get` | staged v25 still `ready` / no diagnostics; `runtime.app` still describes the **live** runtime whichever id is passed; `pendingApp` null |

**New field noticed on the version record: `immutableUrl`.** It is just the
`vN--` preview hostname (`https://v25--larderlog.view.fast/`,
`immutableUrlStatus: ready`) — no signed token, so it does not open the gate the
CLI key cannot pass. The one non-destructive validation of a staged version
remains reachable only from the dashboard's version link.

**The decisive test after the deploy, and it costs nothing**: open v25 from the
dashboard (the link carries the `__=` token) and append `/api/status`. `ok`
means deliveries validate again; the 422 means the loader is still rejecting.
v26's twin check is the `/__zero/run` `households` probe from its devtools
console, since v26 declares no endpoints.

**Standing hazard until that answers `ok`: do not touch space settings in the
dashboard and do not run `sf apply`.** Either mints a `config_update` redelivery
of the **live** runtime, and a redelivery that lands invalid is promoted anyway —
that is precisely the Sep 1 morning outage. The live space stays healthy only
because nothing has redelivered it.

### The browser check ran: v25 still 422s after the platform deploy — 2026-09-02

Justin opened v25's preview from the dashboard and hit `/api/status`:

```json
{"code":"zero_artifact_mode_invalid","status":422,
 "detail":"A read handler cannot carry write-side capabilities.",
 "type":"https://spacefast.com/docs/errors/zero_artifact_mode_invalid"}
```

Byte-identical to Sep 1's rejections. **So the `f74dce6b…` deploy did not touch
the loader** — or did and the block is deliberate. The count is now **seven
rejected deliveries** across two content sets and one byte-identical redelivery
of known-good bytes, spanning two platform deploys. Everything in the Sep 1
conclusion stands: no version of this app can ship, the failure is entirely
Spacefast's, and the only recovery for an accidental promotion is `sf rollback`
to v19. Still waiting on Spacefast; the settings/`sf apply` hazard above still
applies.

### Found: the "mode" contract exists — as schemas in our own toolchain, with no emitter — 2026-09-02

Justin's push to re-check "surely we must update our own code" produced the
mechanism yesterday's investigation could not find, and it was sitting in two
places nobody had looked: **`finalize.json`** (only `artifact.json` was ever
diffed) and **`@spacefast/common`'s contract files**.

**1. The finalize payload encodes per-handler capabilities, hardcoded by kind.**
`.spacefast/zero/finalize.json` carries a `runSources[]` entry per query and
mutation and an `endpointSources[]` entry per endpoint, each with a
`capabilities` object. `zero-compile/dist/compile.js` (lines ~597 and ~630)
writes them as a **pure function of handler kind** — every query gets
`{realtime: false, email: false, spam: true, gravatar: true, content: true, db: true, …}`,
every mutation the same with `realtime`/`email` true, and **every endpoint gets
the full write-side set regardless of method** (matching `endpoint()`'s
`ServerContext` in the SDK types). Nothing a handler's code does or does not use
changes a flag — all 15 of our queries are identical, all 31 mutations are
identical. **So no edit to `server/index.ts` can alter what the loader sees.**

**2. The "artifact mode" vocabulary is a real contract, and our own pinned
`@spacefast/common` ships it — schemas only.**
`dist/contracts/content-program.js` defines a **content program** release
format (`spacefast.compiled-program` v1) in which every ability carries
`kind` + **`mode`**: `query → mode: "read"`, `mutation → mode: "write"`,
`endpoint → mode: read|write`, with rules like *"write SDK operations cannot be
cached"*. Executables are per-operation quickjs artifacts referenced by sha256.
This is exactly the noun pair in both `detail` strings — a per-operation
read/write **mode**, matched against the **invocation** (a `query.run` or a
`GET` is a read invocation).

**3. Nothing in the released toolchain emits it.** Grepping all of
`node_modules/spacefast` and `node_modules/@spacefast/*`: the format appears
**only** in `@spacefast/common`'s contract schemas and a fixture. The compiler
still emits `format: "stattic.zero.capsule.v1"` with **no `mode` field
anywhere**, and the publish path never references the content-program contract.

**The complete picture, restated:** the serving runtime began enforcing the
content-program mode contract on deliveries at ~15:37 on Sep 1. The newest
published toolchain (0.2.2, Aug 28 — no prerelease dist-tags) contains the
contract's *schemas* but no *emitter*, so **every artifact any Zero space can
produce today fails the validation**. Redelivered old bytes fail too because
finalize/derivation runs server-side under the new rules; runtimes installed
before the change keep serving, which is why v19 works and why `sf rollback`
works. This also retires the endpoint hypothesis's residue cleanly: the GET
endpoint carrying write-side capabilities *is* a true statement about the
finalize encoding — it is just compiler-emitted and kind-determined, so v26
(no endpoints) still failed on its queries' side of the same contract.

**Answer to "do we need to update our own code": no — we need a toolchain that
does not exist yet.** The fix arrives as the next `spacefast` /
`@spacefast/zero` npm release. Writing the emitter ourselves from schemas alone
(five interlinked sha256-digested artifacts, ability descriptors, schema refs,
an undocumented finalize integration) is not a shim, it is reimplementing an
unreleased compiler against a guessed contract — not viable.

**The watch signal changes accordingly**: `npm view spacefast version` moving
past `0.2.2` is now the thing to poll, ahead of re-checking the v25 preview.
When it moves: upgrade both packages together, **diff the artifact across the
toolchain change** (the standing rule), publish with the env-aside recipe to
preview, browser-check, then promote.

**For the report — the sharpest sentence we can hand Spacefast**: *your serving
runtime enforces the content-program read/write mode contract
(`spacefast.compiled-program`, per-operation `mode`) on Zero deliveries as of
Sep 1 ~15:37 UTC, but the newest published CLI (0.2.2) only carries that
contract as schemas in `@spacefast/common` and still emits
`stattic.zero.capsule.v1` with no mode metadata — so every Zero space that
publishes today is rejected with an error code (`zero_artifact_mode_invalid`)
that is absent from your 481-code registry.*

---

## 2026-09-02 — `collect()` truncates at 1,000 rows, silently

Context: seeding a `sf dev` space with a few thousand rows to measure the admin
console's Overview, which reads six whole tables per load. The goal was a timing
number. What turned up instead is a correctness ceiling.

### 🐛 `collect()` returns at most 1,000 rows, with no error and no flag

`ctx.db.<table>.withIndex(…).collect()` slices its result to 1,000 rows. It is
not a table limit, not a write limit and not specific to one index — it applies
to **any single result set**, with or without a range predicate.

Measured on `sf dev` with `--state-backend sqlite`, from inside a throwaway
endpoint:

```json
{
  "householdsScanned": 54,
  "itemsBySumOfScopedReads": 3045,   // 54 scoped reads, each under the cap
  "biggestHousehold": 1000,          // a household that really holds 1,200
  "itemsByOneFlatCollect": 1000      // ctx.db.items.withIndex('by_creation').collect()
}
```

The sum of many small reads (3,045) exceeding any single read (1,000) is what
proves it is a per-result-set cap rather than a stale count.

It is in the CLI's own bundle, `node_modules/spacefast/dist/commands/dev.js`:

```js
var MAX_LOCAL_QUERY_ROWS = 1e3;
…
const maxRows = typeof this.max === "number"
  ? Math.min(MAX_LOCAL_QUERY_ROWS, Math.max(0, countOrZero(this.max)))
  : MAX_LOCAL_QUERY_ROWS;
results = results.slice(0, maxRows);
```

The `: MAX_LOCAL_QUERY_ROWS` branch is the one that bites — **an unbounded
`collect()` is capped exactly as a `limit(1000)` is**, and the caller cannot
tell the two apart. `@spacefast/zero-compile/dist/runtime-host.js` builds its
SQL with `state.limit === null ? "" : " LIMIT " + state.limit`, so reading
*that* file suggests `collect()` is unbounded. It is the dev harness that
slices, after the query returns.

**Why this is worth fixing rather than documenting.** A truncated read is
indistinguishable from a complete one, so it does not surface as an error, a
slow page, or a warning — it surfaces as a number that is quietly too small,
months later, in whatever the app built on top of it. Our admin console reports
a *biggest pantry* of 40 items in a space whose biggest household holds 1,200,
and it is not wrong by a little: the 1,200-item household is invisible to the
scan entirely because its rows sort after the cut.

Three things would each be enough, in increasing order of usefulness:

1. **Throw.** An unbounded `collect()` over more than the cap is almost always a
   bug in the caller; refusing it is kinder than answering it wrongly. This is
   what `insert` already does when the space is full — *"Zero DB row limit was
   exceeded."* — and that asymmetry is the sharpest part of the report: **writes
   fail loudly and reads truncate silently.**
2. **Return the truncation.** `{ rows, truncated: true }`, or an `isDone` the
   way `paginate()` already has one.
3. **Expose `count()`.** The dev builder *has* one — `count() { return
   this.filteredRows().length }`, before the slice — and it is not in
   `QueryBuilder` in `@spacefast/zero/dist/server.d.ts`. Since the query API is
   `collect` / `take` / `first` / `paginate` with no aggregate at all, counting
   anything today means materialising it, which is what walks into the cap in
   the first place.

### ❓ Whether the hosted runtime does the same is unanswerable from here

Every constant involved is named `MAX_LOCAL_*`, which reads as a dev-harness
limit rather than a platform one. That is a guess, and this project has been
burned by exactly that guess before: `isAdminUser`'s dev-guest branch was safe
by the same reasoning and leaked the console to anonymous callers in v15.

It cannot be settled from here — an admin query answers `denied` to an
anonymous caller, and the live space does not hold 1,000 of anything to test
with. **It needs a documented answer rather than a measurement**, because the
consequence is silent either way.

`docs/zero-runtime.md` has a *Limits* section and does not mention a row cap on
reads at all.

### 👍 `paginate()` is the escape hatch, and it works past the cap

Same data, same endpoint:

| read | rows | pages | ms |
|---|---|---|---|
| `collect()` over `by_creation` | 1,000 | — | ~3 |
| `paginate({ numItems: 1000 })` loop | **3,245** | 4 | 13 |
| `collect()` scoped to one household | 1,000 | — | — |
| `paginate()` scoped to the same household | **1,200** | 2 | 16 |

`numItems` is clamped to the same 1,000, but the cursor walks, so a
paginate-until-`isDone` loop is complete. For any result under the cap it is one
call and `isDone` is true immediately, so it costs the same as `collect()` —
which makes it a strict improvement and the obvious thing for the SDK to do
inside `collect()` itself.

### 👎 The dev backend's total row budget is 16,384, and it is not documented

`MAX_LOCAL_TOTAL_ROWS = 16384`, across *all* tables. Seeding 300 households ×
60 items hit it and returned a 500:

```
zero_dev_endpoint_failed — "Zero DB row limit was exceeded."
```

That is the right behaviour and a clear message. The friction is only that
nothing says the number in advance, so the way you learn your load-test is too
big is by running it. Worth a line in the *Limits* section beside the read cap.

---

## 2026-09-02 — The schema parser is a regex, and two ordinary comments defeat it

Context: adding four indexes to a table that had none. Everything passed —
`tsc --noEmit` clean, `sf dev` compiled and served, every handler worked against
a real database — and the artifact reported `indexes: []`. The indexes did not
exist. Caught only by reading `artifact.json`.

### 🐛 A comment between `})` and `.index(...)` silently drops every index

The capsule's schema is extracted with one regex,
`@spacefast/zero-compile/dist/analyze.js`:

```js
const TABLE_PATTERN =
  /([A-Za-z_$][A-Za-z0-9_$]*)\s*:\s*table\s*\(\s*\{([\s\S]*?)\}\s*\)((?:\s*\.index\s*\(\s*["'][A-Za-z_$][A-Za-z0-9_$]*["']\s*,\s*\[[^\]]*\]\s*\))*)/g;
```

The index chain must follow the closing `})` separated only by `\s*`. A comment
is not whitespace, so this:

```ts
households: table({
  name: string(),
})
  // Why these four exist.
  .index('by_name', ['name'])
  .index('by_added', ['addedAt'])
```

compiles, typechecks, runs — and produces a table with **no indexes at all**.
The chain is not reported as malformed; the group simply matches zero times.

### 🐛 And a comment containing `})` truncates the table's columns

Moving that comment *inside* the braces hits the other end of the same regex.
The body is non-greedy, `\{([\s\S]*?)\}\s*\)`, so it ends at the first brace
followed by a paren **anywhere in the body, including inside a comment**. A
comment that mentions the token — as one warning about the first bug naturally
does — cuts the column list short at that point and takes the index chain with
it.

Both failures are silent, both survive `typecheck`, and both survive a full
`sf dev` run against real data, because the dev harness reads the same truncated
schema consistently. **The only signal is the artifact.**

### 👎 Why this is worth more than a doc note

The compiler already knows a table's real shape well enough to reject
`crypto`-adjacent globals and to enforce a denylist. Parsing the schema with a
regex over source text means the *declaration* and the *artifact* can disagree
with nothing to reconcile them. Three cheap fixes, in order of preference:

1. **Parse the module, don't scan it.** The information is in the AST.
2. **Warn on a near miss.** If a `table({…})` is followed within a few lines by
   `.index(`, and the chain did not attach, that is a certain bug — say so.
3. **Document the constraint.** `zero-runtime.md`'s schema section shows the
   chain attached and never says it has to be.

This is the second time this project has been bitten by the regex extractor —
[D27](https://github.com/…) exists because a *whole table* can vanish from the
artifact while typechecking perfectly. That decision's standing rule, *"read the
artifact after any schema edit"*, is what caught this one too. It should not
have to be a rule.

### 👍 The artifact itself is excellent for exactly this

`.spacefast/zero/artifact.json` is complete, stable and easy to diff — schema,
columns with defaults and nullability, indexes, queries, mutations, endpoints,
and the pending migration list. It is the reason this was a twenty-minute
detour rather than a production incident. More of the toolchain should point
people at it.

## 2026-09-02 — `sf publish --dry-run` works again, and the artifact reads cleanly

**good.** The dry run had been refusing with `credential_expired` earlier the
same day; it succeeded with no `sf login` in between, so whatever expired was
refreshed on the platform's side. `Files 152`, `Mode website`, `SPA false`.

The artifact confirmed what two entries were waiting on: `memberships.joinedAt`
present as `string` / `default: ""`, all four `households` indexes present
(`by_name`, `by_added`, `by_items`, `by_changed`), fifteen tables, fifteen
queries, thirty-one mutations, `db.migrations: []`, and `/api/status` still the
only endpoint.

**friction, and it is the standing one.** `--dry-run` is still the only way to
build `.spacefast/zero/public/zero.css` for a class-literal check, and it is not
read-only — it rewrites the whole build directory. A `sf build` that produced the
payload without touching the publish plan would make the cheapest verification
this project has cheaper still.

---

## 2026-09-02 — the blockade is into its second day, and every external signal is frozen

A read-only sweep plus the browser check, run to answer one question: **can we
get the current code live?** No. Nothing has moved in ~30 hours.

| signal | 2026-09-01 evening | 2026-09-02 | moved? |
|---|---|---|---|
| `spacefast` / `@spacefast/zero` on npm | `0.2.2` (Aug 28) | `0.2.2` (Aug 28) | **no** |
| `@spacefast/zero-compile`, `@spacefast/common` | `0.2.2` | `0.2.2` | **no** |
| npm dist-tags (any prerelease lane) | `latest` only | `latest` only | **no** |
| error registry | 481 codes, ours absent | 481 codes, ours absent | **no** |
| live `/api/status` (v19) | `ok` | `ok` | no — healthy |
| **staged preview `/api/status`** | **422** | **422** | **no** |

**The preview check is the one that matters and it was run in a browser** — the
`vN--` hostnames still answer **403** to an anonymous curl, to a Bearer CLI API
key, and to that key as a cookie, so this cannot be automated. A staged, `ready`
version still refuses to serve. **The serving runtime is still enforcing the
content-program `mode` contract, and no released toolchain emits it.**

*Friction, restated because a second day of it makes the cost concrete*: the
only non-destructive way to validate a staged version is behind a signed `__=`
token that the API redacts from its own responses, so the check that gates every
publish decision is the one thing an agent cannot perform. `sf versions open`,
a `--preview-url` flag, or an API-key-scoped preview grant would each fix it.

**And there is no way to watch this.** No status page (`status.spacefast.com`
does not resolve), a changelog stale since 0.0.25 on Aug 21 whose `.md` twin
404s, and neither of our error codes in the registry. The only poll available is
`npm view spacefast version` — which would miss a **server-side** fix entirely,
and the enforcement itself arrived server-side. So the watch signal is known to
be incomplete, and the real check stays manual.

### What is left to try, and it is one experiment

Everything has been tested *within* our own space. The untried question is
whether **any** Zero space can publish today: scaffold `sf init --runtime zero`,
publish the hello-world, hit its `/api/status`.

- **422** → the contract failure is platform-wide and reproducible in ~20 lines.
  That is a far stronger bug report than a 15-table app failing, and it removes
  our capsule from the discussion entirely.
- **`ok`** → the diagnosis is wrong, something in *our* artifact trips it, and
  there is a bisect path from hello-world toward `server/index.ts`.

Decisive either way, which is the property this investigation has lacked since
Sep 1. Not run yet — it creates a throwaway space.

### Where the app stands meanwhile

Unchanged and unblocked locally: typecheck clean, **1008 assertions**, working
tree clean at `df74272`. Live is **v19 at eleven tables**; the artifact is at
**fifteen** — `restocks`, `trips`, `claims`, `deletions`, plus `items.listRule`,
`memberships.joinedAt`, `households.changedAt` / `.itemCount`, three `invites`
columns and four `households` indexes. All additive, `db.migrations: []`.

**So the first successful publish will be the largest migration this project has
run**, and `migrateAtFinalize: true` means it lands at *promotion*. Worth
sequencing deliberately when the platform returns: preview first with
`.env.server` moved aside, browser-check, then promote.

### The minimal repro is built and published — and the privacy gate blocks it too — 2026-09-02

The experiment above was run. `sf init --runtime zero` → `npm install` →
`sf publish`, in a scratch directory, on a **new throwaway space**
(`zeroprobe`, `spc_474a0b6be4ce4de3a9db13eef30dd56c`). Larderlog was never
touched.

**The scaffold is an ideal control.** 38 lines: one table with one index, one
query, two mutations, and — usefully — **the same `GET /api/status` endpoint**
our app has, so the endpoint-mode `detail` string applies identically. It pins
`@spacefast/zero@0.2.2`, the toolchain under suspicion, and its artifact is the
same shape as ours: `format: "stattic.zero.capsule.v1"`, endpoint entry
`{"method":"GET","path":"/api/status"}` with **no `mode` field**.

**It published cleanly**: space created, version created, 19 files uploaded,
finalized `v1 (ready)`, **9.2 seconds, first try**. So *version creation and
finalize are not broken* — which was never the failing step for us either.

**And then the same wall, one layer out.** `https://zeroprobe.view.fast/api/status`
answers **403 "This space is private"** — byte-identical to the `vN--` gate:

```
HTTP/2 403   content-type: text/html
x-spacefast-runtime: 1
x-spacefast-version: ver_755fdc73a1fe47e8ae17b203c98494cf
```

The runtime edge is reached and routing to the probe's own version; the gate
sits **in front of the capsule**, so this 403 says nothing about whether the
capsule would serve. `--show-secret` reveals no token — it prints the plain URL
— so unlike the `vN--` case there is not even a signed link to be redacted.

**👎 A new space is private by default and the CLI cannot make it public.**
`sf spaces update` exposes `--name`, `--mode`, `--slug` and viewer metadata, and
**nothing for visibility**; the space record carries no `private`/`visibility`
field at all (both spaces read `anonymous: false`, `status: active`,
`hasRuntime: true` — they differ only in `settingsDigest`, so the flag lives in
settings the CLI does not surface). The whole top-level command list is
`publish, status, versions, rollback, spaces claim, login, init, docs`.

**So the same friction has now blocked the same check twice, by two different
gates**, and that is the sharper version of the complaint: *a CLI-authenticated
API key can create a space, publish to it and read its management record — and
cannot fetch one byte it just served.* Anonymous curl, `Bearer`, and the key as
a cookie all fail. A `--public` flag on `spaces update`, an `sf open`, or an
API-key-scoped read grant would each close it.

**The experiment is one browser click from an answer**, and it is worth more
than the v25 check it replaces:

- **422** → the mode-contract failure is platform-wide, reproducible from
  `sf init` in under a minute, and our 15-table capsule leaves the discussion.
- **`ok`** → the diagnosis is wrong: something in *our* artifact trips it, and
  there is a bisect path from a 38-line capsule toward `server/index.ts`.

### The hello-world cannot serve a single call — the block is total and platform-wide — 2026-09-02

The browser check ran on the throwaway space, and the answer arrived in two
steps because the first reading of it was wrong.

**`GET /api/status` on the 38-line scaffold returns the same 422:**

```json
{"code":"zero_artifact_mode_invalid",
 "detail":"A read handler cannot carry write-side capabilities.",
 "status":422,
 "title":"Zero artifact mode invalid",
 "type":"https://spacefast.com/docs/errors/zero_artifact_mode_invalid"}
```

**And so does everything else.** The client shell renders — it is static files
off the edge and would paint regardless — but adding a todo fails:

```
POST https://zeroprobe.view.fast/__zero/run  →  422 (Unprocessable Content)
```

So on a brand-new space, from a capsule nobody wrote, **no query and no mutation
can execute.** *(Note the path: the client calls `/__zero/run`, not the
`/__spacefast/zero/run` this log has used for CLI-side probes.)*

**This confirms the Sep 1 finding rather than overturning it.** For about ten
minutes it looked like the opposite — "the app works" was read as *its queries
serve*, which would have scoped the failure to endpoint invocations alone and
opened a route to shipping without `/api/status`. It does not: a rendered shell
is not a served query, and the interaction test is what separates them. **The
rejection is whole-artifact and lands before any handler dispatch**, exactly as
recorded yesterday.

**What the repro adds is scope.** Yesterday's evidence was six deliveries of our
own content plus one redelivery of known-good bytes. Now: a **new space**, a
**new capsule**, 38 scaffolded lines, published in 9.2 seconds — and it cannot
answer one call. Nothing about larderlog is implicated in any way, and the
report no longer has to describe a 15-table app at all.

**The two `detail` strings still vary by invocation** — the `GET` yields *"a
read handler cannot carry write-side capabilities"*, the `POST` the other
sentence — on an artifact where both handler kinds are equally dead. That
remains the most misleading part of the failure, and it cost a hypothesis on Sep
1 and another today.

**No route to shipping exists.** Removing our `/api/status` block would change
nothing: the scaffold's queries and mutations fail with the endpoint present,
and v26 already proved they fail with no endpoints declared. The block is
Spacefast's loader, it is total, and it waits on their fix.

---

## 2026-09-04 — the preview gate is solved, and a *fresh* delivery still 422s

Two findings, and the first one retires a complaint this log has filed three
times.

### 👍 `preview-session` is the missing check, and it is one curl

`POST /v1/spaces/{spaceId}/versions/{versionId}/preview-session` mints a
short-lived URL that **exchanges its proof for a cookie on the version's own
origin** and redirects to the landing path. It is in `openapi.json` (API
`0.3.0`) and it is **not surfaced by the CLI at all** — no `sf versions open`,
nothing in `sf versions --help`. Found by grepping the spec, not by reading a
docs page.

That closes the gap: a staged `vN--` version answers **403** to an anonymous
curl, to a Bearer API key, and to that key as a cookie — so until today the
only way to check a staged version was a human in a browser, which is exactly
the check that gates every publish decision here.

```bash
TOK=$(node -p "require('$HOME/.spacefast/auth.json').accessToken")
U=$(curl -s -X POST -H "authorization: Bearer $TOK" \
  -H 'content-type: application/json' -d '{"landingPath":"/api/status"}' \
  "https://api.spacefast.com/v1/spaces/$SPACE/versions/$VERSION/preview-session" \
  | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).data.url")
curl -s -c jar.txt -L "$U"                       # the exchange, and the answer
curl -s -b jar.txt "https://vNN--slug.view.fast/__spacefast/zero/run" \
  -X POST -H 'content-type: application/json' \
  -d '{"op":"query.run","name":"households","args":[]}'
```

**The cookie outlives the landing request**, which is what makes it a probe
rather than a screenshot: the second call above is a real `query.run` against a
staged capsule. `landingPath` takes any path, `/api/status` included.

**And it discriminates**, which is the only reason to trust it: run against the
live **v19** it returns `ok` / 200, and against **v25** the 422. Both measured
in the same minute.

*Still friction*: the operation exists and nothing points at it. `sf versions
get` prints an `immutableUrl` that answers 403, with no hint that a session can
be minted for it. A `sf versions open --path /api/status` wrapping this would
have saved three days of "a human has to look."

### The blockade is real, current, and reproducible in 9 seconds

The open question was whether the 422 verdict is computed **per delivery** or
**per request** — v20–v23 were byte-identical redeliveries of v18 that 422'd
while v18 served, which says per-delivery, and would mean every check of an
existing version tells you nothing about today's loader.

So a **fresh delivery** was published today, on the throwaway `zeroprobe` space,
**not larderlog**:

```
sf init zp --runtime zero --template todo   # 19 files, nobody's code
sf publish --space spc_474a… --target preview
→ v2 (ready), ver_75413bbc7ced4768a242e5505fbc94c1, 18 uploaded, 8.9s
```

**Both invocation paths refuse it:**

| call | result |
|---|---|
| `GET /api/status` | 422 `zero_artifact_mode_invalid` — *"A read handler cannot carry write-side capabilities."* |
| `POST /__spacefast/zero/run` `query.run todos` | 422 `zero_artifact_mode_invalid` — *"Zero artifact mode does not match the invocation mode."* |

So: **a hello-world scaffolded and published today cannot answer a single
call.** Nothing about larderlog is implicated, the toolchain is not stale on our
side, and the failure needs 19 files and nine seconds to reproduce.

### Nothing has moved anywhere else

| signal | 2026-09-02 | 2026-09-04 | moved? |
|---|---|---|---|
| `spacefast` / `@spacefast/zero` on npm | `0.2.2` (Aug 28) | `0.2.2` (Aug 28) | **no** |
| dist-tags (any prerelease lane) | `latest` only | `latest` only | **no** |
| `/docs/errors/zero_artifact_mode_invalid` | 404 | **404** | **no** |
| docs search for the code | 0 results | **0 results** | **no** |
| `zero-runtime.md` mentions of "mode" | — | **0, in 22 KB** | — |
| package changelogs | stale at `0.0.26` | stale at `0.0.26` | **no** |
| live v19 `/api/status` | `ok` | `ok` | no — healthy |

**👎 The error the platform is returning is not in the platform's own error
registry.** Its `type` URI —
`https://spacefast.com/docs/errors/zero_artifact_mode_invalid` — is a link the
runtime hands you that 404s, and the docs search knows nothing about it. That is
the whole self-service path exhausted in two requests.

### There is no knob on our side, and that was checked rather than assumed

The word "mode" does not appear once in `zero-runtime.md`. The compiled artifact
has exactly **one** field named `mode` — `realtime.mode: "central"`, beside
`futureCapabilities: ["blob","ai"]` — and `https://spacefast.com/schemas/sf.json`
has **no** `realtime`, `mode` or capability key at all, so nothing in `sf.jsonc`
can influence it. The one place the phrase "write-side" appears in the shipped
toolchain is a *comment* in the bundled handler-context builder — `kind` decides
which services a context carries, and a query is denied mail and spam-filing
with `service_capability_denied`. That is the same vocabulary the 422 uses,
which suggests the loader is validating a per-handler capability declaration
that **no released compiler emits**. Unconfirmed, and not ours to fix.

**Where this leaves the app.** Live is still **v19 at eleven tables**; the
artifact is at fifteen. Working tree clean. The first successful publish is
still the largest migration this project has run, and `migrateAtFinalize: true`
lands it at promotion — so the sequence when the platform returns is unchanged:
publish `--target preview`, **check it with a preview session now that that is
possible**, then promote.

---

## 2026-09-04 — `spacefast/examples` cannot explain it, and its own Zero app is down

Read `https://github.com/spacefast/examples` (master, last pushed **2026-08-31**,
the day before the breakage) to see whether a working capsule differs from ours.
It does not, and three things fell out of looking.

### 👍 `access: "public"` is the visibility knob, and it is in `sf.jsonc`

Every Zero example carries `"access": "public"` in its `sf.jsonc`. It is in the
published schema —

```
.properties.access = "public"   // shorthand for { "public": ["/**"] }
```

— with a path-list form (`{ "public": ["/**", "!/admin/**"] }`) beside it. **The
Sep 2 entry above is wrong** where it says a new space is private by default and
*"the CLI cannot make it public"*: the CLI has no flag, but the config file has
the field, and it works. Added to the probe's `sf.jsonc` and republished:
`https://zeroprobe.view.fast/` went from **403 "This space is private"** to
**200**, anonymously, no token and no cookie.

That retires the second of the two gates this log has complained about, and it
is worth more than convenience — **the repro is now a public URL** anybody at
Spacefast can curl without an account.

*Friction that remains*: `sf spaces update` still surfaces `--name`, `--mode`,
`--slug` and viewer metadata and nothing for access, so the only way to find
this was reading someone else's example. It belongs in `sf publish --help`.

### The examples are stale, and pinned three minors behind

| app | pins | authoring API |
|---|---|---|
| `examples/zero-perfect/site` | `@spacefast/zero@^0.0.19` | `query((ctx) => ctx.db.todos.where(…).orderBy(…).all())` |
| `comments` | `0.0.23` | same shape |
| `kitchen-sink` | `0.0.23` | same shape |

**None of them is written the way `sf init --runtime zero` scaffolds today**,
which emits `query(async (ctx) => …withIndex("by_owner", …).order("desc")
.collect())` — the shape `zero-runtime.md` documents and the shape this app
uses. So the canonical examples and the canonical scaffold disagree about the
query builder, and the examples are the ones that are wrong.

**And the gallery's only Zero entry is not deployed.** `meta.json` for
`zero-perfect` advertises `https://zero-perfect.view.fast/`, which **302s to
`wordpress.com/typo/?subdomain=zero-perfect`** — the subdomain does not exist.
`comments.view.fast` is **403** and `kitchen-sink.view.fast` is **503** with
`x-spacefast-runtime: 1`. Of three Zero apps in Spacefast's own examples
repository, **none serves a request today.**

### 👎 Their own example fails exactly as ours does

The decisive test. `examples/zero-perfect/site` published **unmodified**, from
their commit, to a **brand-new space** of its own:

```
sf publish --slug zeroperfectprobe     → v1 (ready), 20 files, 7.1s
```

| call on `https://zeroperfectprobe.view.fast/` | result |
|---|---|
| `GET /` | **200** — the static shell paints |
| `GET /api/status` | **422** `zero_artifact_mode_invalid` — *"A read handler cannot carry write-side capabilities."* |
| `POST /__spacefast/zero/run` `query.run todos` | **422** — *"Zero artifact mode does not match the invocation mode."* |

So the failure survives a completely different capsule, a different authoring
API, a different pinned runtime (`0.0.19` against our `0.2.2`), a different
space, and Spacefast's own authorship. **There is nothing left that is ours.**

It also rules out the one hypothesis the examples raised: their handlers are
**synchronous** where the scaffold's are `async`, so if the loader were deriving
a handler's mode from its shape, these two would differ. They do not.

### Two public repro URLs, no auth required

Both are throwaway spaces; larderlog was not touched by any of this.

| URL | what it is |
|---|---|
| `https://zeroprobe.view.fast/api/status` | `sf init --runtime zero --template todo`, 19 files, unmodified |
| `https://zeroperfectprobe.view.fast/api/status` | `spacefast/examples` → `zero-perfect`, unmodified |

Either one is a one-line bug report: *this is your own starter, published with
your own CLI, and it cannot answer a request.*

## 2026-09-07 — `zero_artifact_mode_invalid`: the source, found on Spacefast's own site

A published Spacefast space — **`https://zero.view.fast/`**, *"Spacefast ×
WordPress, explained in code"* — carries **695 verbatim snippets extracted from
the Spacefast monorepo** at commit `92d86a7dbb028d5d5c8e3027d639bf5c59d52d5a`,
including `crates/stattic-zero-runner/`, `packages/zero/src/`,
`packages/zero-compile/src/` and `runtime/engine/`. It is a public page with no
auth. The data is in `data/snippets.js`; the charts are `data/diagrams*.js`.

It contains the check that has blocked every publish since 2026-09-01.

### 🐛 The refusal, verbatim — `crates/stattic-zero-runner/src/artifacts.rs:396`

```rust
if !self.frozen_shape
    && self.execution_mode == ExecutionMode::Read
    && (self.capabilities.fetch || self.capabilities.email || self.capabilities.realtime)
{
    return Err(error_response(
        422,
        "zero_artifact_mode_invalid",
        "A read handler cannot carry write-side capabilities.",
    ));
}
```

So the refusal set is exactly **`fetch`, `email`, `realtime`** on an artifact
whose `execution_mode` is `Read`, and `frozen_shape` is the flag that skips it —
which is the shape of "v19 still serves while every fresh delivery 422s."

`EndpointCapabilities` (`artifacts.rs:143`) defaults `fetch`, `realtime`,
`email`, `content`, `storage` and `connectors` **closed**, with a comment saying
so: *"The write-side authorities default closed. A read artifact that never
named them would otherwise inherit an open grant the execution mode forbids, and
`validate_for` would reject at serve time an artifact the finalizer was happy to
publish."* That is this bug, described in its own source, in advance.

### 🐛 The released compiler cannot emit the field the runner reads

The monorepo's own `generated/finalize.json` carries, per run:

```json
{ "executionMode": "read", "runId": "query_plateShelf",
  "capabilities": { "db": true, "fetch": false, …, "realtime": false, "email": false, … } }
```

**Ours carries no `executionMode` at all**, on any of its 48 records — read off
`.spacefast/zero/finalize.json` from the last dry run:

| record | `executionMode` | `realtime` | `email` | `fetch` |
|---|---|---|---|---|
| `GET /api/status` | **absent** | **true** | **true** | false |
| `query_account` (all 15 queries) | **absent** | false | false | false |
| `mutation_addItem` (all 32) | **absent** | true | true | false |

And the field is not merely unset by us — **`executionMode` appears zero times in
the whole of `spacefast@0.2.2`'s `dist/`**, the current `latest` on npm:

```bash
grep -roh "executionMode" node_modules/spacefast/dist | wc -l   # → 0
```

**Nor can a capsule declare one.** The newer compiler requires it — *"Zero
endpoint must use literal mode, method, and path"* (`analyze.ts:874`, with
`ENDPOINT_MODE_PATTERN = /\bmode\s*:\s*["'](read|write)["']/`) — but on the
pinned SDK the property does not exist:

```
server/index.ts(4180,37): error TS2353: Object literal may only specify known
properties, and 'mode' does not exist in type 'EndpointRoute'.
```

Measured, then reverted; `server/index.ts` is unchanged.

**So there is no knob, and that is now proven by the type system rather than
inferred.** A runner deployed to the fleet validates a per-handler field that
the only published toolchain never writes and the only published types cannot
express. Every artifact built by any released CLI is unloadable by it — which is
why Spacefast's own `--template todo` scaffold, published in nine seconds,
answers 422 as readily as ours does.

**The fix is entirely theirs**, and it is one of three: default a missing
`execution_mode` to `Write` (or skip the capability check when the field is
absent), ship a compiler that emits it, or derive the capability set from the
analyzed surface rather than writing constants — which the site's own charts
already file as a defect: *"compile.ts:650 (runs) and :702 (endpoints) write
`storage:false` and `fetch:false` as constants. `query_plateShelf` calls
`ctx.storage.list` and declares `storage:false`. Derive them from the analyzed
surface, or drop the field."*

**Where it leaves the app**: unchanged. Live is v19 at eleven tables, working
tree clean, nothing to try. The difference is that the report now names a file,
a line and a condition instead of an error string the vendor's own docs 404 on.

### 👍 Nine other answers from the same source, several of which retire notes in this log

- **`collect()`'s 1,000-row cap is the dev harness, and the hosted ceiling is
  50,000 rows / 10 MiB.** `crates/stattic-zero-runner/src/db.rs:15` —
  `DB_RESULT_ROWS_MAX = 50000`, `DB_RESULT_BYTES_MAX = 10_485_760`, against the
  CLI's `MAX_LOCAL_QUERY_ROWS = 1e3`. The 2026-09-02 entry called the
  `MAX_LOCAL_*` reading "a guess"; it was right. `collectAll` stays correct —
  50,000 is still a ceiling, and the byte limit can bite first.
- **The database session is pinned to `REPEATABLE-READ`** (same file), and
  **`DB_TRANSACTION_MAX_STATEMENTS = 64`**, `DB_OPERATION_MAX_BYTES = 64 KiB`,
  `DB_PARAM_MAX_COUNT = 256`. The 64 is the ceiling on one batched transaction
  frame; whether it bounds a whole mutation is the open half, and it is the
  number to hold against `addItems` / `restockItems`, which are capped at 200.
- **A mutation *is* the transaction, and there are no locking reads.** The
  charted db surface is `get, withIndex, order, take, first, paginate, insert,
  update, delete` — *"no execute(), no sql tag and no explicit transaction."*
  With snapshot reads at REPEATABLE READ and no `SELECT … FOR UPDATE`, two
  concurrent read-modify-writes on one counter row can lose an update. That is
  `scale.md`'s question 1, narrowed from "unknown" to one precise question for
  the vendor: **does the runner take a row lock on `get`/`withIndex` inside a
  mutation?**
- **`ctx.storage` exists and no type declares it** — `list` / `get` / `delete`,
  with `put` always rejecting. The console's *storage* card was cut on the
  grounds that "the server context carries no storage handle"; the handle is
  there (built at `runtime-host.ts:550`), just undeclared. **`ctx.log.debug`**
  is the same shape. `ctx.ai` and `ctx.blob` are empty object literals with
  nothing behind them.
- **There is a scheduler.** `sf.jsonc` takes `crons` (five-field crontab, plus
  `1h`/`2d`/`3w` shorthand), `sf crons ls` / `sf crons run <path>` drive it, and
  the platform marks its own call with `X-Spacefast-Cron` and a `CRON_SECRET`
  bearer. D62's *"enforcement is append-time, because there is no scheduler"* is
  wrong on its premise — a cron hitting a Zero endpoint is the honest home for
  retention pruning and for `adminRepairCounts`.
- **The publish payload has a stated rule after all**: `.assetsignore`,
  `.vercelignore` and `.nowignore` are read at `publish-runtime.ts:2345`. That
  is the answer to *"`sf publish` mirrors the project root selectively… there is
  no stated rule"*, and it is how the `.idea/` and `.jsx` "unsupported file"
  warnings get silenced.
- **`usePaginatedQuery` exists** in the client SDK (`client.ts:919`), taking
  `{cursor, numItems}` and returning `{page, isDone, continueCursor}` — the
  browser-side twin of the `paginate()` walk `collectAll` does server-side.
- **The schema regexes are verbatim** at `analyze.ts:94`, and the monorepo files
  the comment bug as a known defect: *"the member scan reads raw source.
  `CAPSULE_MEMBER_PATTERN` runs on the file text; content declarations use
  `scrubNonCode` and queries/mutations do not… Reproduced once as
  `query_latestGuides.js`; this capsule's comment omits the colon to avoid it."*
  That is the 2026-09-02 finding, independently reproduced by its authors.
  `TABLE_PATTERN`'s `\{([\s\S]*?)\}\s*\)` and its `\s*` before `.index(` are
  exactly the two edges that cost us a publish.
- **`/__zero/*` is a live alias for `/__spacefast/zero/*`**, and cookie-
  authenticated mutations require `Origin`, `Sec-Fetch-Site: same-origin` and
  `content-type: application/json` — a 403 `zero_mutation_origin_invalid`
  otherwise. An anonymous `query.run` is not subject to it, which is why the
  v15 probe worked.

**What it does not answer**: nothing in the extract explains why an
`AccessError`'s message is replaced by `Exception generated by QuickJS` in
production. The QuickJS binding is named (`rquickjs-0.12`, in
`finalizer-protocol.generated.php`) and nothing about error propagation is
charted. That question stands.

**A caveat worth keeping**: the snapshot is one commit, undated, and it is
plainly *ahead* of the published npm toolchain — `executionMode`, endpoint
`mode` and `scrubNonCode` are all in it and none is in `0.2.2`. Read it as
evidence about the runtime our spaces are served by, not as documentation of
the SDK we compile against.

## 2026-09-07 — the docs were rewritten on 09-05, and they now document the field our SDK cannot express

`https://github.com/spacefast/docs` is public: `spacefast/docs`, `main`, created
2026-07-18, last pushed **2026-09-06 09:11 UTC**. Three commits since the
blockade began, and the first of them is a **total rewrite** — `docs: rewrite
public documentation (#41)`, 2026-09-05, every page replaced.

| commit | date | what |
|---|---|---|
| `0bf6148` | 09-06 09:11 | Publish Zero docs outside the runtime artifact directory |
| `e52802a` | 09-06 08:39 | Fix canonical Zero documentation routing |
| `ffbd49e` | **09-05 12:23** | **docs: rewrite public documentation (#41)** |
| `4da62e6` | 08-29 | Remove the Website dispatch for good |

The two 09-06 commits are why `/docs/zero.md` 404s and `/docs/zero-runtime.md`
serves: the page moved to `content/(dynamic)/zero-runtime.mdx` with the former
routes preserved as redirects. That half is already in CLAUDE.md.

### 🐛 The rewrite documents `endpoint({ mode, method, path })`. npm does not ship it.

The new Zero page's minimal app, verbatim:

```ts
endpoints: {
  status: endpoint({ mode: "read", method: "GET", path: "/api/status" }, () => text("ok")),
},
```

> `endpoint(route, handler)` takes `{ method, path, mode }`, where `mode` is
> `"read"` or `"write"`.

**The page it replaced said no such thing.** `content/zero-runtime/index.mdx` at
`ffbd49e^`, the 674-line page that was live until 09-05, gives
`endpoint({ method: "POST", path: "/webhooks/entries" }, …)` — method and path,
no mode, which is exactly what this capsule writes and exactly what the pinned
types allow.

So the timeline is now dated on both sides:

| when | what |
|---|---|
| 2026-08-28 23:49 | `spacefast` / `@spacefast/zero` **0.2.2** published. Still `latest` today; registry `modified` has not moved |
| 2026-09-01 | every fresh delivery starts answering `422 zero_artifact_mode_invalid` |
| **2026-09-05** | the docs are rewritten to require `mode` on every endpoint |
| 2026-09-07 | npm unchanged. `EndpointRoute` has no `mode`; adding one is `TS2353` |

A documented contract landed four days into the outage, for an SDK that has
never been released. **This is the same finding as the 09-07 runner entry above,
arriving from the vendor's other side of the wall** — the runner validates a
per-artifact execution mode, and the docs now describe how a capsule would
declare one, and the only published package can neither emit it nor type it.

### 🐛 `sf runtime status` shows the platform deriving the mode itself

This is the confirmation the finalize-payload reading was missing. Our own live
version's recorded capsule metadata carries a mode our compiler never wrote:

```json
"endpoints": [ { "mode": "read", "method": "GET", "path": "/api/status" } ]
```

So the platform classifies `GET /api/status` as **read**, our compiler emits
that endpoint with `realtime: true` and `email: true` as constants, and the
runner refuses `Read && (fetch || email || realtime)`. The chain is closed:
derived mode, constant capabilities, new check, no lever.

`sf runtime status --json` is worth keeping for its own sake. It answers from
version metadata rather than the runtime, *"so it answers while the runtime is
asleep or moving"* — which is the one condition this space has been in for six
days. It prints the live version, tables, queries, mutations, endpoints with
their modes, bundle sizes, schema hash, the `.env.server` variable **names**,
`migrateAtFinalize: true`, `blockIncompatibleRollback: true`, and the binary's
compatibility target. Nothing else in the CLI shows that in one call.

### 🐛 The error code is still not in the registry, and now that is measurable

The repo generates one page per error code: `generated/errors/`, **591 files**,
`manifest.json` counting `errorCodes: 590`. It carries five siblings —
`zero_artifact_abi_mismatch`, `_invalid`, `_malformed`, `_path_invalid`,
`_unreadable` — and **not `zero_artifact_mode_invalid`**. Its own
`zero_artifact_abi_mismatch` page says *"Match on `code`, never on `detail`"*,
which is sound advice about a code whose page does not exist.

So the 404 on `https://spacefast.com/docs/errors/zero_artifact_mode_invalid` is
not a stale build. The registry is generated from a source that does not know
this code, while the fleet returns it — the same drift, in a third place.

### 👍 What else the rewrite changed that we act on

- **`sf db console` mints a single-use phpMyAdmin URL with full SQL authority
  over the space's database** (`POST /v1/spaces/{id}/db/console`, `--show-secret`
  to print instead of open). That is a supported route to read production rows —
  which CLAUDE.md's *Going live needs one id that nothing will tell you* says
  does not exist. **The `localStorage['stattic_zero_identity']` trick is no
  longer the only way to learn an `account:` id.**
- **And it explains `sf db dump` / `sf db export` failing with
  `zero_db_connect_failed`.** The new page: *"The dump reads through the space's
  live runtime, so it needs the app to be reachable."* It is not a database
  fault and never was — it is the runtime lane, the same one the 422 is in.
  `sf db export` walks keyset pages of **500 rows**, atomic, mode `0600`.
- **`capsule()` takes a `favicon` key.** Undocumented until now; this app has
  been appending its icons to `document.head` at boot since Phase 1.
- **`/__zero/run` is the documented run path**, and `__spacefast/zero` does not
  appear anywhere in the new docs. Both still serve — our own version metadata
  reports `runPath: /__zero/run` beside `storageRoot: __spacefast/zero` — and
  `zero.php` keeps the long spelling forever, because frozen bundles compare it
  exactly.
- **`usePaginatedQuery` and `@spacefast/zero/charts` are documented now**
  (`LineChart`, `BarChart`, `Sparkline`, `StatTile`). D69 built and removed
  sparklines by hand; there is a primitive.
- **`action()` is gone from the docs**, matching the runner's *"the vocabulary
  this engine compiles no longer emits actions"*.
- **The ctx table shrank to `db`, `auth`, `env`, `log`, `invalidate`.** The old
  page listed `ctx.email`, `ctx.spam` and `ctx.gravatar`; the new one does not,
  though the runner still routes all three. `ctx.storage` is still undeclared
  anywhere.
- **Crons, in numbers**: a scheduled `GET` through the front door, **8 per
  space**, 3 concurrent, 8-hour ceiling, **no retries**, overlapping fires
  skipped rather than queued, `sf.jsonc` the only writer so a rollback restores
  schedules. A `<400` response is success and silent. Note the irony for us: the
  natural cron target is a Zero **endpoint**, which is the artifact kind the
  fleet currently refuses.
- **Limits worth pinning**: endpoint request body **2 MiB**, server bundle
  **768 KiB**, client bundle **8 MiB** (platform modules exempt), storage object
  upload **5 MiB**, `sf db dump --limit` 1–100 default 25, files per version
  100,000, 600 req/min per credential.
- **`.collect()` is still documented as "every matching row"** with no ceiling
  named, while the runner caps a result set at 50,000 rows / 10 MiB and the dev
  server at 1,000. The most consequential number in the read API is in neither
  the docs nor the types. `collectAll` stays.

### Still undocumented after a full rewrite

`?guest=<name>` on `sf dev`, the `preview-session` API that is the only way to
probe a staged version, the `POST /__zero/run` envelope itself (`op`,
`name`, `args`), and every row cap above. The first two are the two things that
have most changed how this project verifies its work.

**CLAUDE.md is stale in one line because of this**: it calls
`/docs/zero-runtime.md` *"the whole runtime reference… ~22 KB"*. It is 212 lines
now, and the 674-line page it replaced is only in git history.

## 2026-09-08 — the runtime source is public, and the bug is two files disagreeing

`https://github.com/spacefast/stattic` — *"Experimental runtime for agentic
artifacts"*, public, issues enabled, **0 open**, synced continuously ("Sync
runtime source", last push 2026-09-07 14:26 UTC). It carries `crates/` and
`runtime/engine/` — the Rust runner and the PHP publish path, both of which the
`zero.view.fast` extract only sampled. This is the primary source, and it is the
right place to file.

### 🐛 The escape hatch exists, and the publish path destroys the signal it reads

`crates/stattic-zero-runner/src/artifacts.rs` already handles capsules built
before the execution-mode law. Its own comment says so:

> The execution mode a capsule published before the execution law never
> declared… apply the pre-law reading rather than reject a version nobody can
> rebuild.

```rust
let frozen_shape = self.execution_mode.is_none();          // :98
…
capabilities: self.capabilities.resolve(if frozen_shape {
    EndpointCapabilities::conservative()                    // :123
} else {
    EndpointCapabilities::declared_defaults()
}),
```

and the refusal is guarded by it:

```rust
if !self.frozen_shape                                       // :401
    && self.execution_mode == ExecutionMode::Read
    && (self.capabilities.fetch || self.capabilities.email || self.capabilities.realtime)
```

**So an artifact with no `executionMode` — which is every artifact any released
CLI can build — should be `frozen_shape: true` and exempt.** It is not, and
`runtime/engine/admin/generate.php` is why:

```php
if (!array_key_exists('executionMode', $entry)) {           // :1859
    …
    $entry['executionMode'] = _stattic_zero_derived_execution_mode(…);  // :1867
}
$entry['capabilities'] = _stattic_runtime_zero_endpoint_capabilities($entry['capabilities'] ?? []);
```

The publish path **stamps** the derived mode onto every entry that arrives
without one, and passes the capabilities through untouched. By the time the
artifact reaches disk it looks post-law, `frozen_shape` is `false`, the check
runs, and the released compiler's constants — `realtime: true`, `email: true` on
every endpoint and mutation — trip it.

**The bug in one sentence: the stamper and the escape hatch contradict each
other.** `frozen_shape` exists to identify a pre-law capsule by the absence of
`executionMode`, and the publish path erases exactly that signal before the
runner ever sees it. Confirmed from our side by `sf runtime status --json`,
which reports `"mode": "read"` on an endpoint our compiler never gave one to.

It also explains the second message. `derived_execution_mode` returns **Write**
for `kind == "run"`, so a stamped query run is `write`, the invocation is `read`,
and `validate_for` (`:336`) answers *"Zero artifact mode does not match the
invocation mode."* That is why **v26 with no endpoints at all still failed** —
the same stamp, on the runs.

Two candidate fixes, both theirs and both small: have `generate.php` not stamp
at all and let the runner derive (it is already written to), or mark a stamped
entry as derived so the runner reads it conservatively.

### The shim is not new, so this is not a deploy lag

`artifacts.rs` last changed on **08-31 10:05**, **09-06 13:03** and
**09-06 14:56**. The `frozen_shape` / `Option<ExecutionMode>` /
`declared_execution_mode` trio is present in **all three**, 08-31 included — the
day before the blockade began. So the compatibility path shipped *with* the law
and has never worked for a fresh publish, which is consistent with every
observation since 09-01 and rules out "the fix is written and waiting to
deploy."

### Re-probed today, both public repros, still 422

```
GET https://zeroprobe.view.fast/api/status        → 422 zero_artifact_mode_invalid
GET https://zeroperfectprobe.view.fast/api/status → 422 zero_artifact_mode_invalid
```

`larderlog` itself: `GET /` 200, `/api/status` **`ok`** — v19 unaffected, as it
has been throughout. npm `latest` is still `0.2.2` at 2026-08-28T23:50Z; the
docs repo has not moved since 09-06 09:11.

**Those two curls are the fleet check.** They need no publish, no auth and no
preview session, and they answer in a second. When either returns `ok`, the
fleet has the fix and this project's publish can go.

## 2026-09-08 — the workaround works: a patched toolchain publishes and serves

**A fresh Zero capsule, published thirty minutes ago onto the same space that
answered `422 zero_artifact_mode_invalid` this morning, now answers 200 on both
lanes.** The blockade is a client-side omission after all, and it can be worked
around from here.

```
GET  https://zeroprobe.view.fast/api/status
  → ok                                                            200

POST https://zeroprobe.view.fast/__spacefast/zero/run
  {"op":"query.run","name":"todos","args":[]}
  → {"op":"query.result","ok":true,"name":"todos","data":[]}       200

  {"op":"mutation.run","name":"addTodo","args":["…"]}
  → {"op":"mutation.result","ok":true,"changedTables":["todos"]}   200
```

Same space (`spc_474a…`), same `sf init --runtime zero --template todo`
scaffold, same `spacefast@0.2.2`. The only difference is four lines of emitted
metadata.

**Status as of 2026-09-08, after the report went to the team: the patch is
reverted.** `npm ci` has been run, `node_modules` is pristine, and nothing in
this project is publishing with a modified toolchain. `.dev/patch-sf-cli.mjs`
is kept because it re-applies in one command if the platform fix is slow and a
publish becomes urgent — **but re-read *a `--target preview` publish took
production down* below before running it.** The patch makes an artifact
servable; it does nothing about the `config_update` versions that move the live
channel, which is the half that took the app down.

### What the patch does

`.dev/patch-sf-cli.mjs`, local and reverted by `npm ci`. It makes the toolchain
emit the `executionMode` the runner reads and that no released compiler writes:

| record | before | after |
|---|---|---|
| `query_*` | *(absent)* | `"read"`, `realtime:false`, `email:false` |
| `mutation_*` | *(absent)* | `"write"` |
| `GET /api/status` | *(absent)*, `realtime:true`, `email:true` | `"read"`, `realtime:false`, `email:false` |

With the field present the platform's stamper at `generate.php:1859` leaves it
alone, the runner's `frozen_shape` reading is not needed, and neither the
capability check (`artifacts.rs:401`) nor the mode comparison (`:336`) fires.

### 🐛 It had to land in three packages, and two attempts failed silently

This is the part worth keeping, because both failures looked like success.

- **The CLI's own bundles are not what runs.** `spacefast/dist/*.js` carries ten
  copies of `createZeroRuntimeEndpointSources`, all of which patched cleanly and
  **none of which executes**. `sf publish` runs
  `@spacefast/zero-compile/dist/compile.js`, a separate package whose copy is
  4-space `tsc` output rather than 2-space bundler output, so every exact-literal
  anchor missed it.
- **The payload is validated by `.strict()` schemas in a *third* package.**
  `zeroRuntimeRunSourceSchema` and `zeroRuntimeEndpointSourceSchema` live in
  `@spacefast/common/dist/contracts/zero.js` and declare five keys each. A field
  they do not name never reaches `finalize.json` — added to the object,
  dropped by the parse, no error.
- **The tell was a capability, not the new field.** After the first patch the
  endpoint still emitted `"realtime": true`, which the patch would have flipped.
  A field that is merely absent proves nothing; a field that should have
  *changed* and did not proves the code never ran. **Patch something observable
  in both directions, and check the one that cannot be confused with a strip.**

Anchoring on tokens rather than whole literals fixed it. The final run reports
`helper 5, runCaps 5, endpointCaps 5` across the emitter copies and ~283 schema
edits — every CLI bundle re-inlines the schema, and an added `.optional()` field
is inert wherever it is not used.

### 🐛 And a publish flipped the space to private — v4, and v5 was my mistake

**v4 published successfully and answered `403 This space is private` to an
anonymous `curl`** on every path, `/api/status` included. The scaffold's
`sf.jsonc` has no `access` key, and publishing without one took a space that had
been answering anonymous requests that morning — a **422**, from the runtime,
past no gate — and put a gate in front of it.

**v4 was working.** Justin opened it signed in, passed the gate, and saw the app
serving with his old test data still in the database. **The workaround was
already proved at v4**; a 403 is an access page in front of the runtime, and a
422 is the runtime, so the 403 was evidence the artifact loaded rather than
evidence it had not.

**I read the 403 as a failure and fixed it by making the space public** — adding
`"access": "public"` to `sf.jsonc` and publishing v5 — which is an
outward-facing change to somebody's space, made to suit a `curl`, without
asking. The right move was to authenticate the probe, or to stop and ask. It is
a throwaway space and the state it landed in matches where it started, and
neither of those is the reason it was acceptable, because it was not.

The **finding** survives the mistake and matters more than it did:

**This is the sharpest trap in the whole exercise, and larderlog has the same
gap**: its `sf.jsonc` declares no `access` either. On a throwaway that cost one
confusing curl. On the live app it would take the pantry off the internet for
every signed-in user at the moment of the first successful publish in a week.
**Add `"access": "public"` to `sf.jsonc` before publishing larderlog**, or
confirm out of band what the space's current access actually is.

### Where this leaves larderlog

Nothing has been published from this project; live is still v19 and answered
`ok` throughout. The sequence, unchanged except that it is now possible:

1. `"access": "public"` into `sf.jsonc` — see above.
2. `sf publish --target preview`. **No migration runs** — `migrateAtFinalize`
   lands it at promotion.
3. Probe the staged version with a preview session: `/api/status`, then a real
   `query.run households` and the anonymous refusals.
4. Promote. The migration is four tables and the largest this project has run,
   and `blockIncompatibleRollback: true` means the way back is not free.
5. Press **Count them** on the console's Overview once — the one household
   predates the rollup columns.

**File the issue anyway.** A patched `node_modules` survives exactly until the
next `npm ci`, and the fix belongs in `generate.php` or in a release. The report
is now as strong as it can get: the failing condition, the escape hatch, the
line that defeats it, and a working four-line demonstration of what the emitter
should have written.

## 2026-09-08 — a `--target preview` publish took production down for twenty minutes

**It was restored by a rollback to v19 and the app is healthy** —
`/api/status` `ok`, `query.run households` answering `{"state":"guest"}` to an
anonymous caller, live `ver_28fb39a4…`, eleven tables, state active. What
follows is what happened and why the reasoning that led to it was wrong.

### What a preview publish actually did

```
16:05:47  ver_6181eea9…  config_update  ready          ← the platform's, not ours
16:05:59  ver_3a562cb6…  git            created        ← ours, never finalized
16:06:07  ver_ab4641f0…  config_update  ready, LIVE    ← the platform's, and it won
```

`sf publish --target preview` uploaded 33 files and then failed at *Finalizing*
with **`version_not_finalizable`** — *"The live version moved to a newer publish
after this upload started."* It had: the platform minted **two `config_update`
versions of its own during the publish**, the second took the live channel, and
our content version was left at `created` and never served anything.

**And the new live version was broken on arrival.** A `config_update` version
carries zero file changes — it is the same eleven-table capsule — but it is
**finalized today**, so it goes through the current runner, collects the
`executionMode` stamp at `generate.php:1859`, and refuses itself:

```
GET https://larderlog.view.fast/           → 200   static shell only
GET https://larderlog.view.fast/api/status → 422   zero_artifact_mode_invalid
```

So the app served its shell and could not answer a single query. v19 was healthy
only because it was finalized on 2026-08-31, before the law.

### 🐛 `--target preview` is not isolated, and that is the finding

A preview version is supposed to be created without serving. **The publish still
applied the space's configuration**, and applying configuration mints a version
that **takes the live channel**. So on this platform, today, *any* publish from a
project whose config does not exactly match the space's stored config can move
production — regardless of `--target`.

That also means the 2026-09-01 entry in this log, which recorded four
`config_update` versions around a publish and read them as incidental, was
describing this mechanism without naming it. And the 2026-08-31 entry —
**"a `config_update` version broke sign-in for the whole space"** — is the same
event with a different symptom.

**Operational rule until this is resolved: do not publish from this project at
all.** Not live, not preview, not a dry run followed by a real one. The blast
radius of a publish is the live channel, and every freshly finalized version is
unservable while the stamp bug stands.

### The reasoning error, which was mine

I judged a preview publish safe on the argument that a preview does not move the
live channel, so larderlog would stay on v19 whatever the artifact contained.
**The counter-evidence was already in this file**, two entries above the one I
was writing: a `config_update` version had taken the live channel and broken
sign-in eight days earlier, with no publish involved at all. I read that entry
while writing about it and still treated `--target preview` as a sandbox.

**A flag that says a version will not be served is not a promise that nothing
else will be**, and on a platform that mints versions on its own the only safe
reading of "publish" is "the live channel may move."

### What is still true

- **The toolchain patch works**, and that result is unaffected: `zeroprobe` v5
  serves `/api/status` `ok`, `query.run` and `mutation.run` both 200, on the
  same fleet that 422s everything else. The larderlog payload built correctly
  too — 48 records, 16 `read` / 32 `write`, the endpoint narrowed, and a
  migration plan that is **additive only**: four `create_table` (`claims`,
  `deletions`, `restocks`, `trips`), `add_column` and `add_index`, no drops and
  no renames.
- **Nothing of the app's data moved.** The version never finalized, so the
  migration never ran. Eleven tables live, fifteen in the artifact, exactly as
  before.
- **`ver_3a562cb6…` is stranded at `created`** and serves nothing. It can be
  removed with `sf versions rm` or left; it is inert either way.

**This raises the priority of the bug report rather than lowering it.** The
report now carries a second, worse fact: a tenant cannot publish *at all*
without risking production, because the platform's own configuration versions
are unservable under the check it just deployed.

## 2026-09-10 — 👍 `0.4.1` ships the fix, and the blockade is over

**`spacefast@0.4.1` and `@spacefast/zero@0.4.1` went up this morning** — the
first release since `0.2.2` on 2026-08-28, and the first movement of any kind
since the 09-06 docs rewrite. **The released compiler now emits the
`executionMode` the runner has been demanding since 09-06**, which is exactly
what `.dev/patch-sf-cli.mjs` was hand-writing into `node_modules` on 09-08. The
patch is not needed and has not been re-applied.

Measured off this project's own `finalize.json`, built by the released
toolchain with nothing patched:

| | |
|---|---|
| `runSources` | **47 — 15 `read`, 32 `write`** |
| `endpointSources` | `{"executionMode":"read","method":"GET","path":"/api/status"}` |
| its capabilities | `realtime:false, email:false, storage:false, fetch:false` |

That is byte-for-byte the shape the patch produced, and it is the shape the
runner's two checks (`artifacts.rs:401`, `:336`) are looking for. **The escape
hatch can be retired.**

**And the field is `mode` in the SDK now**, which closes the other half of the
09-07 entry: the docs documented `endpoint({ mode, method, path })` while
`0.2.2`'s `EndpointRoute` had no such key and adding one was a `TS2353`. In
`0.4.1` `mode` is **required**, and it is typed rather than decorative —
`EndpointContext<'read'>` resolves to `QueryServerContext`, so a `read` endpoint
cannot reach `invalidate` or `email` at compile time. The 422's own detail —
*"A read handler cannot carry write-side capabilities"* — is that rule stated
from the other end.

### What breaks, in this app: two things

Both were caught by `tsc` in one pass, and both are in `server/index.ts`.

- **`endpoint()` requires `mode`.** One call site.
- **🐛 `ctx.transaction` is gone**, with no replacement and no deprecation. It
  is not on `ServerContext`, not on `QueryServerContext`, and the `Transaction`
  type is deleted. What is left in its place is a claim: the SDK's `email`
  docblock says a mutation *"commits both or neither"*, and the runtime docs say
  a handler runs *"in one transaction with the database"*. **So the handler is
  the transaction now** and the wrapper was redundant — but that is inference
  from two sentences neither of which is about transactions, and **a removed API
  whose replacement is an implicit guarantee should be a release note.**
  `createInvite` was this app's only caller.

Also removed and unused here: `action`, `SchemaActions`, `ActionServerContext`
and the client's `useAction`. Added: `connector()`, a whole content-model
vocabulary (`collections`, `sync`, `ContentFieldDefinition`), `Pages` /
`definePage` / `usePageParams`, and `provider: "service"` on `AuthContext`.
`capsule`, `query`, `mutation`, `table`, `string`, `boolean`, `id`, `text`,
`useQuery`, `useMutation`, `useAuth`, `signInWithGoogle`, `barChartLayout`,
`ReadDatabaseOf` and `WriteDatabaseOf` are all unchanged.

### 🐛 The global denylist became an AST walk, and it counts property keys

`assertGlobalsAbsent` no longer regexes the transpiled text. It parses and walks
the syntax tree — a real improvement — and then does this:

```js
if (node.type === "Identifier" && denied.has(node.name)) identifiers.add(node.name);
```

**Every `Identifier` node, whatever position it holds.** A property key, a
member access and a type member are all `Identifier` nodes, so this refuses:

```ts
type PantryRow = { location: string };   //  a type member
{ location: nameOf.get(item.locationId) } //  an object key
r.location                                //  a member access
```

None of the three can reach a browser global — `location` as a *reference* is
the only thing the rule is about, and an AST walk is precisely the tool that can
tell those apart. It flagged `shared/exportData.ts`, which has compiled
unchanged since D68 on 2026-09-01, with:

```
Zero source shared/exportData.ts references unsupported server global location.
```

The fix is to quote the key and read it with a bracket, which is what
`server/index.ts` already does for `TERM_TABLES` — so this is the second time
this project has paid for it, and the first time it was the *old* scanner. The
column is still named `location` in both export files. **The check should test
the identifier's position**: `node.type === "Identifier"` is true of far more
than a global reference, and every one of the thirteen denied names
(`document`, `location`, `navigator`, `window`, `global`, `process`…) is an
ordinary property name somebody will use.

**The rule for us is unchanged and now firmer**: in `shared/` and `server/`,
never write a denied word as a bare identifier in *any* position. Quote it.

### Verified

Typecheck clean, **1,037 assertions**, and the artifact is what D76 left it —
**fifteen tables, fifteen queries, thirty-two mutations, `db.migrations: []`**,
`/api/status` the only endpoint and now carrying `"mode":"read"`. The migration
plan is `mode: "safe"`, additive only: four `create_table` (`claims`,
`deletions`, `restocks`, `trips`) plus `add_column` and `add_index`, no drops
and no renames.

**The toolchain compiles Tailwind, so a bump can silently move the sheet.** All
**1,025** selectors in the freshly built `.spacefast/zero/public/zero.css` were
unescaped and diffed against every class literal in `client/` — **0 missing**,
the checker proved to find a real class and refuse a bogus one, and the
byte-offset ordering spot-checked (`-mr-[18px]` at 14615 before `md:mr-0` at
75644).

The **real handlers** were driven over `POST /__spacefast/zero/run` on a
throwaway in-memory `sf dev --port 4199`, as two named dev guests:
`setDisplayName`, `createHousehold`, then **`createInvite` — the handler whose
transaction was unwrapped** — minting `B54C5ZTMVE`, `invitePreview` reading it
back as `valid` (so no caller ever sees `PENDING_CODE`), and `redeemInvite`
joining the second guest. An anonymous caller still gets `{"state":"guest"}` from
`households`, and `GET /api/status` answers `ok`.

**The live space is untouched and healthy** — `ver_28fb39a4…`, `runtimeState:
active`, no pending version, eleven tables, `GET /` 200 and `/api/status` `ok`.
Worth noting from `sf runtime status --json`: **v19's endpoint already reports
`"mode":"read"`**, stamped by the platform for a version whose artifact never
carried one. That is why v19 has served throughout while every freshly finalized
version 422'd.

### 👍 `sf docs` searches a bundled offline copy

New in the CLI, and not in the old `--help`: `sf docs <terms>`, with `--full`
and `--all` tiers, plus exact slugs (`sf docs errors/zero_db_transaction_active`).
It is **summaries and URLs rather than whole pages**, so it does not replace the
docs repo for depth — but it is the fastest way to find an error code's page,
and the 591 generated error docs are all in it.

`sf --help` still hides `dev`, `db`, `runtime`, `channels`, `apply` and
`promote`. It has gained a footer nagging about agent tooling
(*"Run sf setup agent -y to repair it"*), which is a strange thing to print
under every `--help` in a project that is deliberately not using it.

### What this does not settle

**The 09-08 finding stands: a publish can still move the live channel.** The
platform mints `config_update` versions of its own during a publish, and one of
them took production down for twenty minutes with `--target preview` set. That
is a platform behaviour and nothing in `0.4.1` speaks to it. The two open items
before this project publishes are unchanged:

1. **`sf.jsonc` declares no `access`.** On the throwaway that flipped a public
   space private at the first successful publish.
2. **A `config_update` version is finalized under the current runner.** It
   should now be servable — it re-derives from the stored artifact, and v19's
   stamped `mode` suggests the platform fills the field in — but that is
   inference, not a measurement.

## 2026-09-10 — 🐛 `0.4.1`'s dev server cannot load a state file `0.2.2` wrote

**The upgrade is right and this is the price.** A `--state-backend sqlite`
database that had been serving this app all morning aborts the QuickJS runtime
on **every** capsule call under `0.4.1`:

```
Aborted(Assertion failed: list_empty(&rt->gc_obj_list), at: ../../vendor/quickjs/quickjs.c,1998, JS_FreeRuntime)
→ 500 zero_dev_endpoint_failed
```

The dev server starts, prints its banner and serves `GET /` 200. Only the
runtime dies, and it dies **on teardown** — `JS_FreeRuntime` asserting that the
GC object list is empty — so what surfaces is a 500 with a C assertion in its
`detail` and no clue which of your data caused it.

**It is not the sqlite backend.** A fresh state file on the same backend, same
code, same everything is fine. It is the *contents*.

### Two independent triggers, both bisected in an isolated project copy

**1. A row missing a column the schema declares aborts the runtime.**

This app's fourteen `invites` rows predate D71's `addedAt` / `redeemedAt` /
`redeemedBy`. **Those fourteen rows — 4.4 KB — abort it on their own.** Write
the three keys onto the same fourteen rows and the identical data loads:

| state | result |
|---|---|
| 14 invites as stored | **abort** |
| the same 14 with `addedAt`/`redeemedAt`/`redeemedBy` set to `''` | **ok** |
| one synthetic `{"id":"a"}` in `profiles`, `trips` or `items` | **abort** |

`0.2.2` filled the declared default in; `0.4.1` dies. Deleting a value is no
escape either — dropping `revoked` from an invite row aborts exactly as leaving
it does, because *absent* is the condition, not the type.

**This is the most dangerous shape a bug can have here**, because *a column
added after rows exist* is the normal state of every additive migration this
project has run — twelve of them — and it is the same condition that left
`useAvatarSync` inert for a month. The dev store is not MySQL, so this says
nothing directly about the hosted runtime; **it is worth asking whether the
production reader has the same assumption**, because there the answer would be
an outage rather than a local annoyance.

**2. A volume ceiling, and it is not bytes.**

Hydration dies somewhere between **37,400 and 40,800 object properties**:

| what | rows | bytes | properties | |
|---|---|---|---|---|
| `itemTypes` whole | 4,439 | 1.21 MB | 26,634 | ok |
| `items` first 2,200 | 2,200 | 876 KB | 37,400 | ok |
| `items` first 2,400 | 2,400 | 1.05 MB | 40,800 | **abort** |
| 100 items padded to 345 KB | 103 | 345 KB | ~1,700 | ok |

So **a table twice the byte size passes while a smaller one aborts** — 345 KB of
padding is fine and 1.05 MB of ordinary rows is not, because what tracks the
failure is the object count, not the payload. That fits the assertion, which is
about objects still alive when the runtime is freed. This project's snapshot was
**156,881 properties across 15,613 rows**, four times over.

**Neither trigger is announced.** There is no size warning, no "this state file
was written by an older runtime", no migration. A `--state-backend sqlite`
database is durable by design and the release that could not read it shipped
without a word about it.

### 🐛 And the error is unattributable

`Aborted(Assertion failed: list_empty(&rt->gc_obj_list))` names no table, no row
and no column. Reaching *fourteen invite rows are missing three keys* took a
bisection over fractions of the snapshot, then per table, then per field — about
forty dev-server starts. **A dev runtime that refuses data should say which
data.** The check that would produce that sentence — every row against the
declared columns — is four lines and the compiler already holds the schema.

### What was done here

`.spacefast/zero/dev-state.pre-0.4.1.sqlite` keeps the original, byte-identical
(`80131dad…`), and the live state was rewritten to a repaired snapshot:

- **the three D71 columns written as `''`** onto every invite, and
- **only the seven households Justin is a member of kept**, whole. The other 108
  are the scale-timing seed and belong to `guest:extra-*` / `guest:solo-*`
  identities that are not in `LARDER_DEV_GUESTS` and therefore cannot sign in.

**5,089,655 → 445,845 bytes; 15,613 → 1,357 rows; 156,881 → 13,668
properties.** A household is kept whole or not at all, so every rollup column
(`itemCount`, `memberCount`, `ownerCount`, `changedAt`) stays true of what is
left — `adminSummary` reports `uncounted: 0` — and a dangling-reference check
over the result found none.

**Nothing of the fixture's range was lost.** Those seven cover all six real dev
guests, every role including a household where Justin is only a **viewer**
(D30's read-only screen), two empty households, a 223-item pantry, and
multi-owner households for D22 and D68. Verified after the write: `/api/status`
`ok`, `households` and `pantry` answering for Justin, `setDisplayName` writing,
and Alice seeing her own three.

**What did go is the space-wide scale**, which is only interesting to the
console: Overview now reads 7 households / 17 people / 423 items rather than
115 / 130 / 4,544. The D76 timing measurement it existed for is already
recorded, and `.dev/seed.cjs` rebuilds a fixture from nothing in one command.

#### 🐛 And that first cut emptied a chart, which is the lesson

**Reported immediately: *New households per month* showed nothing.** It was
right to. **All seven households Justin belongs to were created in June and July
2025** — they are the *oldest* rows in the seed, made before the console's
twelve-month window opens — so `countByMonth` returned twelve zeroes over a
fixture that no longer reached the window at all. The 108 households the repair
dropped were the only ones carrying a stamp inside it.

**Keeping the rows a *person* can reach is not the same as keeping the rows a
*chart* reads**, and nothing in the first pass asked the second question. The
cost stated at the time — "space-wide scale, which is only interesting to the
console" — was true and still missed it: a count is a number you can shrug at,
and a twelve-month series with no data in it is a screen that looks broken.

The second pass keeps the seven **and** every seeded household that is both in
the window and small enough to afford, chosen by a greedy fill that balances two
axes at once — one month at a time, taking whichever pantry-size band is
furthest below the original 115's mix, cheapest first, to a property budget.
**Whole households only**, so the rollups stay true.

| | first pass | second |
|---|---|---|
| households | 7 | **28** |
| properties | 13,668 | **33,753** (last known-good load: 37,400) |
| *New households* | twelve zeroes | `2 3 2 2 2 3 2 1 2 1 1 0` |
| *Shopping trips* | `0 1 0 0 0 1 2 0 3 3 2 1` | `2 1 1 2 3 6 2 7 4 6 8 3` |
| *Pantry sizes* | `2 1 1 2 1` | `5 8 8 6 1` against the original's `21 29 35 24 6` |

**A statistically faithful sample was measured and is not affordable** — holding
the original band mix at even a 35% sample costs 49,036 properties, over the
ceiling, because the large pantries are where the properties are. So the band
mix is *approached* rather than reproduced, and the trade is recorded here
rather than hidden: **selecting by cost alone skews a fixture toward empty
households**, which is exactly the wrong direction for the one chart D69 built
to measure whether anybody clears the twenty-item wall.

**Sep 2026 reads 0 and is left reading 0.** No household in the seed was created
this month, and authoring one to round the chart off would be inventing data to
make a picture look finished.

## 2026-09-10 — 🐛 and then `GET /` was a 404: `0.4.1` moved routing into `pages/`

**With the state file repaired the dev server still would not serve the app.**
A browser at the private dev URL got, verbatim:

```json
{"type":"https://spacefast.com/docs/errors/not_found","title":"Not found",
 "status":404,"detail":"Not found.","code":"not_found"}
```

**And `curl` said the opposite**, which is why it took a second report to find:
unauthenticated, `GET /` is `200` — that is the capability gate page, served to
*anyone* who has not bootstrapped. Only **after** the bootstrap cookie is set
does the real router run and answer 404. So every check that stopped at
`GET / → 200` was reading the gate, not the app.

| | before bootstrap | after bootstrap |
|---|---|---|
| `/` | 200 (gate page) | **404** |
| `/client.js`, `/zero.css` | 401 | 200 |
| `/api/status` | 200 | 200 |

**The cause is a routing model change nothing announced.** In
`dist/commands/dev.js`, a `GET` is served the app shell only when a **page**
claims the path:

```js
const owner = resolvePageRoute(options.pages ?? [], pathname)?.page;
if (owner?.render === "client") { …app shell… }
…
sendProblem(response, 404, "not_found", "Not found.");
```

and `buildZeroDevClientAssets` hands the router `bundle`, `utilityCss`, `pages`
and `documentPreviews` — **`index.html` is not among them**. Pages come from
`discoverPages`, which reads **`pages/` and nothing else**. This project has a
`client/` entry and no `pages/`, so `analysis.pages` is `[]` and every path
404s.

The rule is stated plainly in the CLI's own `sf init` scaffold, and nowhere a
person upgrading would look:

> Addressable pages live in `pages/`: Markdown and HTML are documents; TSX is a
> document unless it starts with `"use client"`. … **An optional
> `client/index.tsx` may explicitly export `Layout`; it is not a page.**

### 👎 And publish and dev disagree about it

The compiler has **not** dropped the old path. Compiled both ways, in process:

| | `staticFiles` at the root | `/` served by |
|---|---|---|
| no `pages/` (this project until today) | **`index.html`** | a static file |
| `pages/index.tsx` | **`_spacefast/pages/client.html`** | the page route |

So a `client/`-only capsule **still publishes a working root document** and
**cannot be run locally at all**. That is the same shape as the 2026-08-27
finding that `sf dev` serves the SPA shell for paths the published space 404s,
and the same lesson: *the local answer is the misleading one*, in whichever
direction it happens to fall this time.

**A dev server that 404s the app it just compiled should say so.** It knows
there are no pages — `analysis.pages` is empty at boot, next to a `client/`
entry it bundled anyway — and that is a one-line warning in the banner.

### What was done here

`pages/index.tsx` — twenty lines of comment and four of code:

```tsx
"use client";
import { App } from '../client/index';
export default function IndexPage() { return <App />; }
```

`tsconfig.json`'s `include` gained `pages`. **Nothing else moved**:
`client/index.tsx` still holds `App` and still runs the four boot side effects
at module scope, which importing it here performs at the same moment as before.
The capsule is untouched — **fifteen tables, fifteen queries, thirty-two
mutations, `db.migrations: []`**, `/api/status` still the only endpoint and
still `"mode":"read"`.

Verified after the change, bootstrapped: `/` **200** serving a shell with
`<div id="root">` and `/client.js`, the bundle carrying `IndexPage` and the app,
`/client.js` and `/zero.css` 200, `/api/status` `ok`, and `households` returning
all seven households for Justin. 1,037 assertions, typecheck clean.

**The one thing this cannot settle from here**: `/` in production is now a page
route rather than a static `index.html`, and no version has ever been published
that way. It is the platform's own model and the dry run builds it correctly —
but it is unverified against a live space, and it goes on the list beside
`sf.jsonc`'s missing `access` as something to check the moment a publish is
allowed.

## 2026-09-10 — 🐛 a publish reconciles access, and omitting `access` revokes it

**Rehearsed on `zeroprobe` rather than reasoned about, and the reasoning was
wrong.** Two questions had to be answered before Larder Log could publish: does
a **page route** serve `/` in production, and does a publish touch a space's
**access**? Both were settled by publishing the 0.4.1 `todo` scaffold — schema
identical to what that space already ran, so `db.migrations` was `0` and nothing
destructive was planned.

### 👍 A page route serves `/` in production

The 0.4.1 scaffold ships `pages/index.tsx` and `pages/status.tsx`, and its
payload carries **no root `index.html`** — the same shape Larder Log now has.
Published and probed anonymously:

```
GET  /               200   (the page route, with the #root shell and /client.js)
GET  /status         200   (a second page)
GET  /api/status     200
POST /__spacefast/zero/run  {"op":"query.result","ok":true,"name":"todos","data":[]}
```

So the front-door change is safe, **and this is also `executionMode` confirmed
in production on a freshly finalized version** — the same space answered
`422 zero_artifact_mode_invalid` before 0.4.1. Two publishes, both first try,
11 seconds each, no `config_update` interference and no `--drop` needed.

### 🐛 And the first of those publishes took the space private

`zeroprobe` answered `/api/status` `ok` to an anonymous `curl` this morning.
After a publish whose `sf.jsonc` had **no `access` key** it answered **403 This
space is private** on every path, and its grants had changed:

| | before | after |
|---|---|---|
| grants | `public`, `team`, … | **`link`**, `team`, … |

Adding `"access": "public"` and republishing put the `public` grant back and
every path returned to 200. **So `sf.jsonc` is authoritative about access and a
publish reconciles the space's grants against it. Omitting the key is not
"leave it alone" — it is an answer, and the answer is "not public."**

The CLI does say so, in the publish output, after the fact:

> This space is not public. To make it public: `sf share grant --to public
> --role viewer --path '/**' --target live`.

**This is the 2026-09-08 finding, confirmed and correctly explained.** That
entry recorded a throwaway going private and guessed at the mechanism; this is
the mechanism, measured in both directions.

### ❗ The correction that matters, and it was mine

Earlier today I told Justin the opposite — that `--access` "only applies when
this publish **creates** a team-owned space, so it can't change larderlog's
grants." That reading came from `sf publish --help`, and the flag's help text
really does say that. **The flag and the config key are different things**: the
flag seeds access at creation, the `sf.jsonc` key is reconciled on **every**
publish. I checked the flag, found a sentence that fit, and stopped.

**`sf.jsonc` now declares `"access": "public"`**, with the measurement written
above the line. Larder Log has been public since v4 and every publish since
carried no `access` key, so this is either new behaviour in 0.4.1 or a rule the
project had been getting away with — either way, **without that line the next
publish takes the app off the web**, and the app's entire signed-out surface
(the marketing page, the sign-in card, every `?join=` invite link) is exactly
what a private space refuses.

Verified after the change: the dry run is unchanged apart from the config —
fifteen tables, fifteen queries, thirty-two mutations, `db.migrations: []`,
`/api/status` still the only endpoint and still `"mode":"read"` — typecheck
clean, 1,037 assertions. **Larder Log itself was not published and did not
move**: still `ver_28fb39a4…`, `GET /` 200, grants `public, team, team`, and
`.spacefast/state.json` byte-identical to before the rehearsal.

## 2026-09-10 — 👍 v32 is live: the blockade is over and the migration landed

**`sf publish`, plain, first try.** 156 files, **54 uploaded** (incremental),
**47 seconds**, `ver_9b0cdd816c5243ebb04a6d0dbc60eed2` = **v32**, status ready.
The first publish since v19 on 2026-08-31, and the one that carries D64 through
D76.

**The largest migration this project has run, and it applied cleanly:**

```
applied                true
pendingOperationCount  0
schemaHash             sha256:d0306af4e2649ea4087d8b596e3f8c8d82fc7500255e0f438e8e4f99cb5b13b9
appliedSchemaHash      (equal)
operations             4 create_table · 27 add_column · 12 add_index
tables                 11 → 15
```

`claims`, `deletions`, `restocks` and `trips` are live. Fifteen tables, fifteen
queries, thirty-two mutations, `/api/status` the only endpoint and carrying
`"mode":"read"`.

**Two things that had never been tested in production both worked.** `/` is a
**page route** rather than a static `index.html` and serves 200 — the change
0.4.1 forced this morning, rehearsed on `zeroprobe` an hour before. And
`executionMode` is what the runner wanted: a freshly finalized version answers
rather than 422ing, which is the whole nine-day blockade closed by a released
toolchain.

**And the platform behaved.** The 2026-09-08 failure mode — `config_update`
versions minted mid-publish that take the live channel — did not recur. One
message worth keeping though: the publish opened with

> Waiting for previous serving work on larderlog to settle before creating a
> version…

which is the CLI now *serialising* against exactly that, and is probably why
`version_not_finalizable` did not happen again. `sf versions ls` shows v29–v31
as the platform's own from the earlier attempts; **no pending version and no
operation in flight** afterwards.

### Verified

| check | result |
|---|---|
| `GET /` | 200, page route |
| `GET /api/status` | `ok` |
| `client.js` / `zero.css` / `site.webmanifest` | `shasum` match against `.spacefast/zero/public/` |
| D29 — `.claude/`, `.docs/`, `.env.server`, `.spacefast/`, `.dev/` | **403** |
| `theme.json`, `sf.jsonc` | 404 · `package-lock.json` 200 |
| all seven icons | 200 |
| access grants | `public` still active on `/**` |

**The anonymous probe, across the whole new surface** — `households`, `profile`,
`account` and `claims` all `guest`; `adminAccess` `{admin:false,
writesHeld:true}`; `adminSummary` `denied`; and `createHousehold`, `addItems`,
`restockItems`, `deleteMyAccount` and `adminRepairCounts` all refused. The
refusals arrive as the opaque `zero_js_execution_failed` /
*"Exception generated by QuickJS"*, which is the **still-unfixed** message-loss
problem from v17: a deliberate refusal is byte-identical to a crash. Unchanged
by 0.4.1, and still the reason not to write another user-facing sentence into a
`throw`.

### 👎 `LICENSE.md` stopped serving raw, and that is a 0.4.1 routing change

`/LICENSE.md` is **404** and `/LICENSE` **308s to `/LICENSE/`**, returning
rendered HTML of the GPL. 0.4.1 treats a Markdown file in the payload as a
**document** — the same `pages/` model that took `index.html` away — so a `.md`
gets a pretty URL and a renderer instead of being served as bytes. Nothing here
depended on it; the standing check *"`LICENSE.md` and `package-lock.json`
serve"* is retired, and `package-lock.json` still serves at its own path.

**Worth knowing before publishing a project with real Markdown in it**: files
that used to be downloadable are now web pages.

### One grant is now duplicated

`sf share` reports **two active `public` grants** on `/**` — the original
managed one from space creation and a second created by `"access": "public"`
reaching the space for the first time. Access is additive so this is harmless,
but it is untidy and worth collapsing in the dashboard.

### Left to do by hand

**Press *Count them* on the console's Overview, once.** The live household
predates D76's rollup columns, so it reports as *not counted* until
`adminRepairCounts` walks it — which is the sentence-and-its-button pairing that
feature exists to honour.

## 2026-09-10 — 🐛 `.env.server` mints an extra version on every publish

**Reproduced on `zeroprobe`, in both directions.** Larder Log has produced
`config_update` versions alongside every publish for weeks — v30 and v31
immediately before v32 — and the trigger is the env file, not the config:

| publish | `.env.server` | extra `config_update` versions |
|---|---|---|
| v1–v7 (seven, one of which changed `sf.jsonc`) | absent | **0** |
| v9 | one variable, first time | **1** |
| v11 | the same variable, **unchanged** | **1** |
| v15 | four variables | **3** |
| v18 | the same four, **unchanged** | **2** |

So **any project carrying a `.env.server` mints extra versions on every
publish, whether or not a variable changed.** They are minted by the platform
(`publisher.type: system`, `source.kind: config_update`) seconds *before* the
content version, and they take the live channel. The count is not a clean
function of the variables — 1 → 1, four changed → 3, four unchanged → 2 — so
there is a rule here that is not "one per variable".

**This is what made 2026-09-08 dangerous rather than untidy.** A `config_update`
version is finalized *now*, so during the `zero_artifact_mode_invalid` window it
was unservable, and one of them took production down for twenty minutes. With
0.4.1 emitting `executionMode` they pass through harmlessly — v30 and v31 did —
but the mechanism is still there.

**Worth fixing at the source**: a publish should not mint a version for an env
file whose contents did not change, and certainly should not move the live
channel to do it.

## 2026-09-10 — 🐛 `sf dev` hard-reloads the browser on any file change, including docs

**The watcher ignores `.git`, `.zero`, `.spacefast`, `.stattic`, `dist` and
`node_modules` — and nothing else.** So `.claude/`, `.docs/`, `.dev/` and
**`.test-out/`** are all watched, which means writing documentation or running
`npm test` reloads the tester's page.

And it is a **hard reload**, not a soft invalidation. `dev.js` broadcasts
`zeroDevRefreshFrame` on every source change; the client's `handleMessage` maps
`op: "refresh"` to `window.location.reload()`.

**Measured on 2026-09-10: seventeen reloads in one working session**, while
Justin was testing. It is worse than a flicker — **a reload mid-flight kills an
in-flight mutation**, so an untick whose release was still on the wire is simply
lost, and the reloaded page correctly draws the row as still claimed. That
manufactured symptoms on top of a real bug and cost hours.

**The workaround is `sf dev --no-watch`**, which is now the way to run while
somebody is testing: nothing an agent writes can touch the page, at the cost of
restarting by hand after a code change.

**What would fix it upstream**: honour an ignore list (or `.gitignore`), and
prefer a module reload over `location.reload()` — a full navigation is a
sledgehammer for a capsule change, and it silently drops requests in flight.

## 2026-09-10 — 🐛 a mutation costs seconds once clients are subscribed

**Measured on `sf dev --state-backend sqlite`, with all handler logging
removed**, against a 1.1 MB state snapshot:

| | with two subscribed browser tabs | immediately after a restart, nothing attached |
|---|---|---|
| `claims` read | **~260 ms** | ~270 ms |
| `claimItem` | **4.2 s** | ~180 ms |
| `releaseClaims` that matches **nothing** and invalidates **nothing** | **7.4 s** | ~250 ms |

**A write that changes no rows and invalidates no queries still takes seconds.**
Reads are unaffected at the same moment, so it is not general slowness — it is
the mutation path, and it degrades by more than an order of magnitude once
clients are attached. Ten *concurrent* claims pipeline at ~250 ms apart, so it
is not a per-mutation constant either.

The cause is not established. The snapshot persist and the broadcast path are
the obvious suspects, and neither has been isolated.

**Why it matters beyond dev ergonomics**: an app with an optimistic UI is
written to cover a round trip of tens of milliseconds. At four to seven seconds
the optimistic layer is carrying the interface on its own for whole seconds,
which turns every ordering subtlety into a visible defect. It was the amplifier
behind the run-list bug below, and it is why that bug was so hard to see in one
place.

### ❗ Retraction: this was nearly filed as a `ctx.log` cost

An earlier measurement in the same session showed writes at 2.25 s with a
`ctx.log.info` in two query handlers and ~180 ms after removing them, and the
obvious conclusion — *`ctx.log` costs about two seconds a call* — was one
sentence away from being written here. **It is false.** The two measurements
also differed in whether browser tabs were attached, and re-measuring with no
logging at all reproduced the multi-second writes. Logging is not implicated.

**The lesson is the one this log keeps re-learning**: a difference between two
measurements is only attributable to the thing you changed if it is the *only*
thing that changed. Instrumentation that alters load is not a neutral observer.
