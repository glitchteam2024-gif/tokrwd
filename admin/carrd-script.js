/**
 * ============================================================
 * UNIVERSAL CARRD ROUTING SCRIPT — PRODUCTION
 * Domain: appflowconnect.com
 * ============================================================
 *
 * Paste the HTML block below into your Carrd Pro page's "Embed" widget.
 * This is the EXACT code to paste (everything between the === markers).
 *
 * ------------------------------------------------------------
 * ⚠️ THIS REPLACES THE OLD "CLOAKER" EMBED — REPASTE EVERY PAGE
 * ------------------------------------------------------------
 * The previous version of this script classified the visitor's device from the
 * user-agent and, for anything it did not like — a desktop, a page opened with no
 * campid, or any visitor /r declined — loaded https://…/js/decoy.js and rendered a
 * FABRICATED E-COMMERCE STORE in place of the funnel.
 *
 * That is cloaking, in the plainest sense: an ad reviewer saw a different website
 * from the buyer. It is the single most likely reason a landing page gets flagged —
 * by TikTok ad review, and by Safari and Chrome's deceptive-site protection, which
 * both act on serve-different-content-to-different-clients behaviour. A flag lands on
 * the DOMAIN, so it takes every campaign on it down at once.
 *
 * js/decoy.js has been deleted from the repo. An old embed still pointing at it will
 * now simply fail to load that script and show the Carrd page — no fake store. But
 * the old embed ALSO still runs the desktop gate, so repaste this on every live page.
 *
 * What this version does: POST to /r, go where it says. No user-agent test, no device
 * test, no decoy. Every visitor gets the same answer. If /r cannot route (misconfig or
 * network failure) the visitor simply sees the Carrd page they are already on.
 *
 * ------------------------------------------------------------
 * THE campid MUST BE THE AFFILIATE'S SPARK CODE
 * ------------------------------------------------------------
 * The link you hand an affiliate looks like:
 *
 *     https://veranth6.carrd.co?campid=SPK-A1B2-C3D4
 *
 * That value is the whole attribution chain. It travels campid -> /r -> the
 * lander as s1 -> sprktrax.org/api/link/<slug> as s1, and the door resolves it
 * against spark_codes to find the affiliate, mint a click_id and stamp the
 * outbound subids. A compound campid works too as long as the spark code is in
 * it (ACCT_SPK-A1B2-C3D4_US_001) — /r extracts it.
 *
 * What must NOT be used is an externally minted campaign string that contains no
 * spark code, e.g. TRAE_spark128_US_7659271051523686407_54f8fe_035200. The door
 * does not reject those: it 302s and forwards the string to the network raw, so
 * the link looks healthy while every conversion lands `unmatched`. That is the
 * failure already logged in the sprk-affiliate-conv-debug skill.
 *
 * A page opened with NO campid is no longer treated as suspicious — it routes like
 * any other visit. The click is refused later, at the door, which is where money is
 * actually involved. Content never varies by visitor.
 *
 * ============================================================
 *
 * <link rel="preconnect" href="https://appflowconnect.com">
 * <link rel="dns-prefetch" href="https://appflowconnect.com">
 * <div id="po-ld" style="position:fixed;top:0;left:0;width:100%;height:100%;background:#fff;z-index:999999;display:flex;align-items:center;justify-content:center;">
 * <div style="width:40px;height:40px;border:3px solid #F3F3F3;border-top:3px solid #555;border-radius:50%;animation:r 0.8s linear infinite;"></div>
 * </div>
 * <style>@keyframes r{to{transform:rotate(360deg)}}</style>
 * <script>
 * !function(){try{
 * var w=window,d=document,l=location,
 * ci=(function(){try{var q=new URLSearchParams(l.search);return q.get('campid')||q.get('s1')||q.get('cid')||q.get('c')||'';}catch(e){return '';}})(),
 * redirected=false,rUrl;
 * function hd(){var el=d.getElementById('po-ld');if(el){el.style.opacity='0';setTimeout(function(){el.style.display='none'},200);}}
 * function go(u){
 * redirected=true;
 * rUrl=u;
 * try{sessionStorage.setItem('_rurl_'+ci,u);}catch(e){}
 * try{history.pushState(null,'',l.href);}catch(e){}
 * l.replace(u);
 * }
 * w.addEventListener('pageshow',function(ev){if(ev.persisted&&rUrl)l.replace(rUrl);});
 * w.addEventListener('popstate',function(){if(rUrl)l.replace(rUrl);});
 * try{
 * var cached=sessionStorage.getItem('_rurl_'+ci);
 * if(cached){go(cached);return;}
 * }catch(e){}
 * var enc=encodeURIComponent,
 * body='c='+enc(ci)+'&h='+enc(l.href);
 * function send(retry){
 * var x=new XMLHttpRequest();
 * x.open('POST','https://appflowconnect.com/r',true);
 * x.setRequestHeader('Content-Type','application/x-www-form-urlencoded');
 * x.timeout=1500;
 * x.onload=function(){
 * if(x.status===200){
 * try{var j=JSON.parse(x.responseText);if(j.url)go(j.url);else hd();}
 * catch(e){hd();}
 * }else{if(!retry)send(true);else hd();}
 * };
 * x.onerror=x.ontimeout=function(){if(!retry)send(true);else hd();};
 * x.send(body);
 * }
 * send(false);
 * }catch(e){var el=d.getElementById('po-ld');if(el)el.style.display='none';}}();
 * </script>
 *
 * ============================================================
 *
 * NOTE ON `d=`: the old body sent a client-asserted device class (d=m/t/d) which /r
 * gated on. Both sides are gone. /r ignores the field if an un-repasted page still
 * sends it, so old and new embeds can coexist during rollout — the old one just
 * keeps showing its own desktop gate until you repaste it.
 */
