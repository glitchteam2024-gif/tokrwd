// signatures.js
// Static signatures for ad-cloaking + in-app-WebView-breakout detection.
// Each signature has a weight; a page's score is the sum of matched weights.
// Tuned so that ANY single breakout/cloak signature alone crosses the block
// threshold, while ordinary tracking/redirect code stays well below it.
 
export const BLOCK_THRESHOLD = 50;   // >= this => "block / manual review"
export const WARN_THRESHOLD  = 25;   // >= this => "flag"
 
// A signature matches if ANY of its `any` patterns hit. Optional `not`
// patterns suppress a match (used to avoid obvious false positives).
export const SIGNATURES = [
  {
    id: "SCHEME_BREAKOUT",
    weight: 60,
    desc: "Rewrites destination to an OS URL scheme (intent://, x-safari-https://, googlechrome://) to escape the in-app browser.",
    any: [
      /intent:\/\/[^"'`]*#Intent/i,
      /#Intent;[^"'`]*scheme=/i,
      /x-safari-https:\/\//i,
      /\bgooglechrome(s)?:\/\//i,
      /\bfirefox:\/\/open-url/i,
      /replace\(\s*\/\^https?:\\?\/\\?\/\s*\/\s*,\s*['"`]x-safari/i
    ]
  },
  {
    id: "TOP_FRAME_BREAKOUT",
    weight: 55,
    desc: "Forces navigation on the top window to escape a sandboxed/monitored iframe.",
    any: [
      /\(\s*window\.top\s*\|\|\s*window\s*\)\s*\.location/i,
      /window\.top\.location\s*(\.(href|replace|assign)\s*)?=/i,
      /top\.location\.href\s*=/i,
      /parent\.location\.href\s*=/i
    ]
  },
  {
    id: "PARAM_GATED_NOOP",
    weight: 55,
    desc: "Differential rendering: CTA becomes a no-op when an expected URL param is absent (dead page for reviewers, live for real traffic).",
    // Look for a preventDefault-only handler guarded by a missing query param.
    any: [
      /if\s*\(\s*!\s*\w+\s*\)\s*\{[^}]*onclick[^}]*preventDefault\(\)\s*;?\s*\}\s*;?\s*return/i,
      /get\(['"`]dest['"`]\)[\s\S]{0,200}?if\s*\(\s*!\s*\w+\s*\)[\s\S]{0,120}?preventDefault/i
    ]
  },
  {
    id: "PARAM_GATED_CLOAK",
    weight: 55,
    desc: "Page hides/gates its entire render on the presence of a URL param (subID/click-id) — blank for reviewers/direct visitors, live only for tagged ad clicks. This is the cloak gate itself.",
    any: [
      // a regex test against location.search that then hides the page
      /\.test\(\s*(?:window\.)?location\.search\s*\)[\s\S]{0,220}?(?:document\.write|display\s*:\s*none)/i,
      // writing a style that hides the whole document (self-blanking lander)
      /document\.write\(\s*['"`][^'"`]*(?:html|body)\s*\{[^}]*display\s*:\s*none/i,
      // a subID presence test driving a global gate flag
      /(?:s1|sub1|subid|sub_id|click_?id)[^)]{0,20}?\.test\(\s*(?:window\.)?location\.search\s*\)/i
    ]
  },
  {
    id: "DEST_INJECTION",
    weight: 45,
    desc: "Destination URL is read from a query param at runtime (?dest=) rather than hard-coded — page is a redirector/doorway.",
    // `to` is in this list because it is the param OUR OWN /pre reads. The detector
    // is only useful if it scores our pages the way it scores anyone else's — leaving
    // our param out would have made /pre look cleaner than it is.
    any: [
      /get\(\s*['"`]dest['"`]\s*\)/i,
      /(searchParams|params)\.get\(\s*['"`](dest|url|goto|target|redirect|to|r|u)['"`]\s*\)[\s\S]{0,200}?(new\s+URL|location\.(href|replace|assign))/i
    ]
  },
  {
    id: "AUTO_FIRE",
    weight: 40,
    desc: "Redirect fires without a user gesture (setTimeout/onload/immediate navigation).",
    any: [
      /setTimeout\(\s*(doBreakout|go|redirect|breakout|jump|fire)\b/i,
      /setTimeout\(\s*function\s*\(\s*\)\s*\{[^}]*location\.(href|replace|assign)/i,
      /window\.onload\s*=\s*[^;]*location\.(href|replace|assign)/i,
      /(addEventListener\(\s*['"`]load['"`][\s\S]{0,120}?location\.(href|replace|assign))/i
    ]
  },
  {
    id: "GESTURE_RETRY",
    weight: 35,
    desc: "Re-attempts the redirect on the first pointerdown/touchstart/click to defeat gesture-less WebView blocks.",
    any: [
      /\[['"`](pointerdown|touchstart|click)['"`][\s\S]{0,80}?\]\.forEach[\s\S]{0,200}?addEventListener/i,
      /addEventListener\(\s*evt\s*,[\s\S]{0,120}?once\s*:\s*true/i,
      /(pointerdown|touchstart)['"`][\s\S]{0,160}?once\s*:\s*true/i
    ]
  },
  {
    id: "INAPP_UA_SNIFF",
    weight: 30,
    desc: "Sniffs the user-agent for in-app browsers (TikTok/Meta/IG webviews) to decide whether to break out — behaviour that targets exactly the monitored environment.",
    any: [
      /\b(?:musical_ly|bytedance|FB_IAB|FBAN|FBAV)\b/i,
      /\/[^\/\n]{0,40}\b(?:tiktok|instagram|musical_ly|bytedance)\b[^\/\n]{0,40}\/i?\s*\.test\(\s*(?:ua|navigator\.userAgent|navigator\.vendor)/i
    ]
  },
  {
    id: "PARAM_FORWARD",
    weight: 20,
    desc: "Blindly forwards all incoming query params (click IDs / subids) onto an externally-supplied destination.",
    any: [
      /params\.forEach\([\s\S]{0,200}?searchParams\.set\(/i,
      /forEach\(\s*function\s*\(\s*\w+\s*,\s*\w+\s*\)[\s\S]{0,160}?searchParams\.set/i
    ]
  },
  {
    id: "RAW_PARAM_FORWARD",
    weight: 25,
    desc: "Builds an outbound URL by concatenating the raw incoming query string onto an external door — forwards every click-ID untouched (attribution laundering).",
    any: [
      /\+\s*(?:window\.)?location\.search\b/i,
      /\b(\w+)\s*=\s*(?:window\.)?location\.search\b[\s\S]{0,120}?\+\s*\1\b/i
    ]
  },
  {
    id: "REDIRECT_BEACON",
    weight: 15,
    desc: "Fires a tracking beacon immediately before/at the moment of an automatic redirect.",
    any: [
      /sendBeacon\([^)]*\)[\s\S]{0,160}?location\.(href|replace|assign)/i,
      /new\s+Image\(\)\.src\s*=[\s\S]{0,160}?location\.(href|replace|assign)/i,
      /navigator\.sendBeacon\([^)]*p=[^)]*tap/i
    ]
  },
  {
    id: "FAKE_VERIFY_BADGE",
    weight: 15,
    desc: "Impersonates platform endorsement ('Verified by TikTok/Meta/…') — brand-impersonation bait common on incentive-fraud landers.",
    any: [
      /verified\s+by\s+(?:tiktok|meta|facebook|instagram|google|apple|paypal)/i
    ]
  }
];
 
// Patterns that, if present, indicate ordinary/benign behavior. Not scored,
// but exposed so the report can explain low scores.
export const BENIGN_HINTS = [
  { id: "https://montrk3.co.uk/?a=26648&c=55504&s1=", re: /<a[^>]+href\s*=\s*["']https?:\/\/[^"']+["'][^>]*id\s*=\s*["']ctaButton/i,
    desc: "CTA points at a fixed, disclosed https URL." }
];
 
