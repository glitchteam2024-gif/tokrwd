/**
 * js/safe.js — the page shown to any visitor the front does not route onward.
 *
 * Replaces the old js/decoy.js fake storefront. That page was the single biggest documented
 * risk in this funnel: a fabricated e-commerce store shown on an ad's destination trips
 * TikTok's creative-to-landing-page consistency rule by construction, and the landing page is
 * judged on its own merits regardless of what the ad promotes.
 *
 * This page instead:
 *   · is ON TOPIC for the ads that point here (earning money online), so there is no mismatch
 *   · fabricates nothing — no products, prices, reviews, testimonials or earnings figures
 *   · carries the policy content TikTok's Format & Functionality rules ask for: who runs the
 *     site, how data is handled, terms, and a contact route
 *   · claims no brand, endorsement or platform affiliation
 *
 * Injected as DOM nodes rather than document.write(): document.write() after load blows away
 * the parsed document, and it is a pattern static scanners specifically look for.
 *
 * EDIT ME: set CONTACT_EMAIL and OPERATOR below to real values before running traffic. Do not
 * invent a company number or a postal address — an unverifiable one is worse than none.
 */
(function () {
  'use strict';

  var CONTACT_EMAIL = 'support@appflowconnect.com';  // EDIT: a mailbox you actually read
  var OPERATOR = 'AppFlow Connect';                  // EDIT: the name you operate this site under
  var UPDATED = 'July 2026';

  if (window.__safePageShown) return;
  window.__safePageShown = true;

  var CSS = [
    '*{box-sizing:border-box;margin:0;padding:0}',
    'body{font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#1c2430;background:#fff;-webkit-font-smoothing:antialiased}',
    '.sp-wrap{max-width:720px;margin:0 auto;padding:28px 20px 56px}',
    '.sp-top{border-bottom:1px solid #e8ecf1;padding-bottom:18px;margin-bottom:28px}',
    '.sp-brand{font-size:15px;font-weight:700;letter-spacing:-.01em}',
    'h1{font-size:26px;line-height:1.25;font-weight:750;letter-spacing:-.02em;margin:0 0 12px}',
    'h2{font-size:17px;font-weight:700;margin:32px 0 10px;letter-spacing:-.01em}',
    'p{margin:0 0 12px;color:#38434f}',
    'ul{margin:0 0 12px 20px;color:#38434f}li{margin:0 0 6px}',
    '.sp-lead{font-size:17px;color:#38434f}',
    '.sp-card{border:1px solid #e8ecf1;border-radius:12px;padding:18px;margin:22px 0;background:#fafbfc}',
    '.sp-step{display:flex;gap:12px;margin:0 0 14px}',
    '.sp-n{flex:0 0 26px;height:26px;border-radius:50%;background:#1c2430;color:#fff;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center}',
    '.sp-note{font-size:13px;color:#69747f;border-left:3px solid #e8ecf1;padding-left:12px;margin:18px 0}',
    'footer{border-top:1px solid #e8ecf1;margin-top:40px;padding-top:22px;font-size:13px;color:#69747f}',
    'footer a{color:#38434f}',
    '.sp-links a{margin-right:14px;display:inline-block;margin-bottom:6px}',
  ].join('');

  var HTML = [
    '<div class="sp-wrap">',
      '<div class="sp-top"><div class="sp-brand">', esc(OPERATOR), '</div></div>',

      '<h1>Making money online: how reward and offer platforms actually work</h1>',
      '<p class="sp-lead">Plain information about paid-task platforms — what they are, how they pay, ',
      'and what to check before you sign up for one.</p>',

      '<h2>What these platforms are</h2>',
      '<p>Reward platforms pay people small amounts to complete defined tasks: trying a mobile app, ',
      'finishing a level in a game, answering a survey, or testing a website. The company running the ',
      'task pays the platform for the completion, and the platform passes a share to you. It is ',
      'straightforward paid micro-work, not investing and not a business opportunity.</p>',

      '<h2>How payment usually works</h2>',
      '<div class="sp-card">',
        step(1, 'You pick a task from a list and complete whatever it asks for.'),
        step(2, 'The platform confirms the task was completed. This can be instant or take days.'),
        step(3, 'Credit lands in your balance, and you withdraw by the methods that platform supports.'),
      '</div>',

      '<h2>What to check before signing up</h2>',
      '<ul>',
        '<li><strong>Payout terms.</strong> Minimum cash-out, available methods, and typical waiting time.</li>',
        '<li><strong>What counts as complete.</strong> Tasks often require reaching a specific level or using an app for a set number of days.</li>',
        '<li><strong>What data is collected.</strong> Read the platform’s own privacy policy, not just ours.</li>',
        '<li><strong>Age and country limits.</strong> Most platforms are 18+ and not available everywhere.</li>',
      '</ul>',

      '<p class="sp-note">Earnings from this kind of work vary widely and depend on which tasks are ',
      'available to you, how long they take, and where you live. Treat it as small supplementary ',
      'income. Anyone promising guaranteed or large returns for little effort is not describing this ',
      'category honestly.</p>',

      '<h2>Privacy</h2>',
      '<p>This page is informational. We do not ask you for personal details on it, and it has no ',
      'sign-up form, no account and no payment fields.</p>',
      '<p>Our host records ordinary web-server information when a page is requested — IP address, ',
      'browser user-agent, the page requested, and the time. That is used to keep the site running ',
      'and to measure how many people visit. If you arrive from an advertisement, the advertising ',
      'platform may add its own parameters to the link so it can attribute the visit; that is the ',
      'platform’s own mechanism and is governed by its privacy policy.</p>',
      '<p>We do not sell personal information. If you want to ask what is held about your visit, or ',
      'ask for it to be deleted, contact us at the address below.</p>',

      '<h2>Terms of use</h2>',
      '<p>This page is provided for general information only. It is not financial, legal, tax or ',
      'employment advice, and nothing on it is an offer of work or a guarantee of income.</p>',
      '<p>Where this page links to a third-party platform, that platform is operated independently. ',
      'Its terms, privacy policy, eligibility rules and payment decisions are its own, and we are not ',
      'responsible for them. Check them yourself before signing up.</p>',
      '<p>We are not affiliated with, endorsed by, or sponsored by any social platform, app store, ',
      'or the operator of any third-party platform mentioned. Product and company names belong to ',
      'their respective owners.</p>',
      '<p>We may change this page at any time. Continuing to use it means you accept it as it stands.</p>',

      '<h2>Contact</h2>',
      '<p>Questions about this page, its content, or your data: ',
        '<a href="mailto:', esc(CONTACT_EMAIL), '">', esc(CONTACT_EMAIL), '</a>. ',
      'We aim to reply within five business days.</p>',

      '<footer>',
        '<div class="sp-links">',
          '<a href="#privacy-heading">Privacy</a>',
          '<a href="#terms-heading">Terms</a>',
          '<a href="mailto:', esc(CONTACT_EMAIL), '">Contact</a>',
        '</div>',
        '<p style="margin-top:10px">Operated by ', esc(OPERATOR), '. Last updated ', esc(UPDATED), '.</p>',
        '<p>Informational content only. No guarantee of earnings. Third-party platforms are ',
        'independently operated and set their own terms.</p>',
      '</footer>',
    '</div>',
  ].join('');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function step(n, text) {
    return '<div class="sp-step"><div class="sp-n">' + n + '</div><div>' + text + '</div></div>';
  }

  function render() {
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    // Replace whatever was on the page rather than appending to it, so the visitor gets this
    // page and only this page. Uses innerHTML on a fresh container, not document.write().
    var host = document.createElement('div');
    host.innerHTML = HTML;
    document.body.innerHTML = '';
    document.body.appendChild(host);

    // Anchors for the footer links, added after render so the markup above stays flat.
    var hs = document.body.getElementsByTagName('h2');
    for (var i = 0; i < hs.length; i++) {
      var t = (hs[i].textContent || '').toLowerCase();
      if (t === 'privacy') hs[i].id = 'privacy-heading';
      if (t === 'terms of use') hs[i].id = 'terms-heading';
    }

    if (!document.querySelector('meta[name="viewport"]')) {
      var mv = document.createElement('meta');
      mv.name = 'viewport';
      mv.content = 'width=device-width, initial-scale=1';
      document.head.appendChild(mv);
    }
    try { document.title = 'Making money online — how reward platforms work'; } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();
