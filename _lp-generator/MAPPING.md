# Offer ↔ door ↔ lander mapping — the authoritative table

This is the wiring contract. One SPRK offer → one door slug → one lander directory. The door does
the geo routing (Part A); the lander never knows the network URL.

## The six sweep landers

| Lander (tokrwd) | Door slug | SPRK offer | Offer code | Geos | Per-geo network links (`c=` / host) |
|---|---|---|---|---|---|
| `SHEIN/index.html` | `shein` | Rewards - Shein $750 | `RWSHEIN` | US GB CA AU | US 56271/montrk2 · GB 56272/monetisetrk8 · CA 56275/monetisetrk4 · AU 56276/monetisetrk8 |
| `SEPH/index.html` | `sephora` | Rewards - Sephora $750 | `RWSEPH` | US GB CA AU | US 56274/montrk4 · GB 56273/montrk3 · CA 56277/montrk · AU 56279/montrk5 |
| `CASH/index.html` | `cash` | Rewards - Cash Prize | `RWCASH` | US GB AU | US 56077/montrk2 · GB 56078/montrk4 · AU 56079/montrk |
| `APAY750/index.html` | `applepay750` | Rewards US - Apple Pay $750 | `AA` | US | 56269/montrk4 |
| `APAY1K/index.html` | `applepay1000` | Rewards US - Apple Pay $1000 | `RWUSAP1K` | US | 56270/montrk3 |
| `UBER/index.html` | `ubereats` | Rewards UK - Uber Eats £50 | `RWUKUBR` | GB | 56110/montrk2 |

Full link form: `https://<host>.co.uk/?a=26648&c=<c>&p=r&s1=` — `&p=r` on all six (they are all
revshare). Affiliate ID `a=26648` throughout.

**Apple Pay is two offers, two doors, two landers.** $750 and $1000 are both US — a prize tier, not
a geo — so per-geo routing cannot distinguish them. They must stay separate all the way down.

**Cash amounts differ by geo** — US $1,000 / GB £750 / AU $750. The lander must not render one
figure globally; `__GEO_AMOUNT__` has to be injected. Do not ship `CASH` geo-blind.

## Non-sweep landers already in tokrwd (for reference, not part of this task)

| Lander | Door slug | Status |
|---|---|---|
| `CR50/CR1/index.html` | `copper` | ✅ correct — this is the pattern the six above copy |
| `Rewards/index.html` | — | ⚠️ **bypasses the door**, hits `monetisetrk8.co.uk/?a=26648&c=55504` direct |
| `ApplePay/index.html` | — | placeholder, 3KB, no offer URL wired |

`Rewards/index.html` (Freecash) has the same defect the old SHEIN page had. Worth fixing in the
same pass: point it at `https://sprktrax.org/api/link/freecash`, which already exists as a slug.

## `landing_pages` rows to create

One per door slug: `shein`, `sephora`, `cash`, `applepay750`, `applepay1000`, `ubereats`.

- `slug` — as above. The door URL is `https://sprktrax.org/api/link/<slug>`.
- **`enforce_assignment` FALSE.** Flipping it before `landing_page_affiliates` is populated 404s
  every resolved owner. Per `sprk-new-offer` step 8, two separate rosters back the two enforcement
  flags — `landing_page_affiliates` gates the click door, `offer_assignments` gates the postback
  hold. Mirror both fully before flipping either.
- The manual `link` field, if set, is screened by the shared `launchLinkProblem` oracle at both
  write and read time — no fragments, no embedded `?s1=`, http(s) only.

## Vercel Edge Middleware

tokrwd is a **Vercel** project (`vercel.json`, `/api/*` routes). The
`/functions/<slug>/_middleware.js` pattern on the old SHEIN page is **Cloudflare Pages syntax and
does not run here.** Use a root `middleware.js`:

```js
// middleware.js  (repo root)
export const config = { matcher: ['/SHEIN/:path*', '/SEPH/:path*', '/CASH/:path*',
                                  '/APAY750/:path*', '/APAY1K/:path*', '/UBER/:path*'] };

const AMOUNTS = {
  SHEIN:   { US: ['$750', 750], GB: ['£750', 750], CA: ['$750', 750], AU: ['$750', 750] },
  SEPH:    { US: ['$750', 750], GB: ['£750', 750], CA: ['$750', 750], AU: ['$750', 750] },
  CASH:    { US: ['$1,000', 1000], GB: ['£750', 750], AU: ['$750', 750] },
  APAY750: { US: ['$750', 750] },
  APAY1K:  { US: ['$1,000', 1000] },
  UBER:    { GB: ['£50', 50] },
};

export default function middleware(req) {
  const dir = new URL(req.url).pathname.split('/')[1];
  const geo = (req.headers.get('x-vercel-ip-country') || '').toUpperCase();
  const table = AMOUNTS[dir]; if (!table) return;
  const pick = table[geo] || table[Object.keys(table)[0]];   // fall back to the primary geo
  // rewrite the #offer-config block's __GEO_AMOUNT__ / __GEO_VALUE__ with pick[0] / pick[1]
}
```

`x-vercel-ip-country` is set at the Vercel edge. **Confirm a client cannot supply it themselves** —
that is the same stop condition as Part A, and it matters here too: a visitor who can pick their geo
can pick their displayed amount.

## Verification per lander

```bash
# HEAD — 302s identically, writes NO clicks/lp_clicks rows
curl -sI 'https://sprktrax.org/api/link/shein?s1=SPK-TEST-0000'
```

- Location must reach the Monetise URL with the subid wire intact.
- Exactly **one** deliberate GET on the test code to confirm the click_id lands in `s5`. That writes
  one ownerless `clicks` row plus one `lp_clicks` row — known residue. **Do not follow it through
  the network funnel** or you manufacture an unmatched conversion in your own audit.
- A bare lander URL with no `s1` must render (preview) while the door 404s.
- With the geo map populated, two different `x-vercel-ip-country` values must produce two different
  Location hosts.

## Already verified locally (headless, all outbound requests blocked)

| Input | Resulting door URL |
|---|---|
| `?s1=SPK-ABCD-1234&utm_campaign=DH_ImgUS&ttclid=E_C_P_xyz` | `…/api/link/shein?utm_campaign=DH_ImgUS&ttclid=E_C_P_xyz&s1=SPK-ABCD-1234` |
| `?mc_attr=e=SPK-WXYZ-9999..c=foo` | `…/api/link/sephora?mc_attr=…&s1=SPK-WXYZ-9999` ← fallback derived s1 |
| `?ttclid=__CLICKID__&s1=SPK-1111-2222` | `…/api/link/cash?s1=SPK-1111-2222` ← unsubstituted macro dropped |
| *(no params)* | `…/api/link/ubereats?s1=` ← door 404s, correct by design |

`s1` rides last in every case. No page contains a network URL — verified: zero `ftblltrck`,
`afftrackr` or `montrk*` references across all six.
