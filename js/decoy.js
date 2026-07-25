(function(){
var d=document;
var R=function(a){return a[Math.floor(Math.random()*a.length)]};
var rn=function(a,b){return Math.floor(Math.random()*(b-a+1))+a};
var rf=function(a,b){return(Math.random()*(b-a)+a).toFixed(2)};

// ── Store Names ──────────────────────────────────────────────────────────
var storeName=R(['NovaMart','PeakGoods','UrbanEdge','VaultStore','PrimeLine','ShelfCo','DriftShop','CoastCart','BloomHaus','SteadySupply','GridMerch','BaseLevel','PureStock','TrueForm','NextShelf']);
var accent=R(['#2563eb','#7c3aed','#dc2626','#16a34a','#ea580c','#0891b2','#be185d','#4f46e5','#b45309','#0f766e','#6d28d9','#0284c7','#c2410c','#15803d']);

// ── Products ─────────────────────────────────────────────────────────────
var cats=[
  {cat:'Audio',items:[
    {n:'Studio Pro Wireless Headphones',img:'\uD83C\uDFA7',desc:'40mm dynamic drivers with active noise cancellation, foldable design, and 30-hour battery life.'},
    {n:'True Wireless Earbuds',img:'\uD83C\uDFB5',desc:'IPX5 water-resistant sport fit with 6+18 hours total playtime via the compact charging case.'},
    {n:'Noise-Cancelling Over-Ear Set',img:'\uD83C\uDFA7',desc:'Adaptive ANC with transparency mode. Memory foam cushions and USB-C fast charge.'},
  ]},
  {cat:'Apparel',items:[
    {n:'Premium Heavyweight Hoodie',img:'\uD83D\uDC55',desc:'400gsm French terry cotton blend. Relaxed fit with kangaroo pocket and ribbed cuffs.'},
    {n:'Classic Stretch Chinos',img:'\uD83D\uDC56',desc:'Tailored fit stretch twill. Machine washable, wrinkle-resistant, and available in versatile colorways.'},
    {n:'Oversized Graphic Tee',img:'\uD83C\uDFBD',desc:'100% ring-spun cotton in a relaxed oversized cut. Pre-shrunk and printed with water-based inks.'},
    {n:'Merino Wool Quarter-Zip',img:'\uD83E\uDDE5',desc:'Lightweight 180gsm merino with moisture-wicking and odor-resistant properties. Four-season layering piece.'},
  ]},
  {cat:'Accessories',items:[
    {n:'Slim Leather Bifold Wallet',img:'\uD83D\uDC5B',desc:'Full-grain vegetable-tanned leather. Holds up to 8 cards with a centre cash slot.'},
    {n:'Waxed Canvas Tote Bag',img:'\uD83C\uDF92',desc:'Heavy-duty 12oz waxed canvas with leather handles and a zip interior pocket. Water-resistant.'},
    {n:'Polarized Bamboo Sunglasses',img:'\uD83D\uDD76\uFE0F',desc:'UV400 polarized lenses in a lightweight bamboo frame. Eco-friendly and scratch-resistant.'},
    {n:'Minimalist Leather Belt',img:'\uD83D\uDC5C',desc:'Italian full-grain leather with a brushed nickel buckle. 35mm width fits all standard loops.'},
  ]},
  {cat:'Home',items:[
    {n:'Pour-Over Coffee Set',img:'\u2615',desc:'Borosilicate glass carafe with hand-turned wooden collar, paired with a gooseneck stainless filter.'},
    {n:'Stonewashed Linen Throw',img:'\uD83D\uDECB\uFE0F',desc:'Belgian linen that gets softer with every wash. Naturally temperature-regulating year-round.'},
    {n:'Ceramic Diffuser Lamp',img:'\uD83D\uDD6F\uFE0F',desc:'Handmade stoneware with ultrasonic mist technology. Warm ambient light and whisper-quiet operation.'},
  ]},
  {cat:'Fitness',items:[
    {n:'Smart Fitness Watch',img:'\u231A',desc:'Continuous heart rate, SpO2, and sleep tracking. 7-day battery and 5ATM water resistance.'},
    {n:'Insulated Shaker Bottle',img:'\uD83C\uDF76',desc:'32oz double-wall vacuum insulated stainless. Keeps drinks cold 24h, hot 12h. Leak-proof lid.'},
    {n:'Resistance Band Kit',img:'\uD83D\uDCAA',desc:'5-band set from 10\u201350lb with padded handles, ankle straps, and a door anchor included.'},
    {n:'Yoga Mat Pro',img:'\uD83E\uDDD8',desc:'6mm natural rubber with alignment markers. Non-slip grip surface and carrying strap included.'},
  ]},
  {cat:'Tech',items:[
    {n:'20,000mAh Power Bank',img:'\uD83D\uDD0B',desc:'USB-C PD 45W fast charging. Powers laptops, phones, and tablets simultaneously.'},
    {n:'Portable Bluetooth Speaker',img:'\uD83D\uDD0A',desc:'360\u00B0 sound with a deep bass radiator. IPX7 waterproof and 24-hour playtime.'},
    {n:'Mechanical Keyboard 75%',img:'\u2328\uFE0F',desc:'Hot-swappable switches with per-key RGB. Aluminum frame, PBT keycaps, and USB-C connection.'},
    {n:'Wireless Charging Pad',img:'\uD83D\uDCF1',desc:'15W Qi-certified fast charge with LED indicator. Compatible with all Qi-enabled devices.'},
  ]},
  {cat:'Outdoor',items:[
    {n:'Titanium Camp Mug',img:'\u2615',desc:'450ml double-wall titanium. Ultralight at 92g with foldable handles and measurement markings.'},
    {n:'Packable Down Jacket',img:'\uD83E\uDDE5',desc:'800-fill goose down with DWR coating. Packs into its own pocket. 180g total weight.'},
    {n:'LED Headlamp Pro',img:'\uD83D\uDD26',desc:'1200 lumens with red-light mode. Rechargeable via USB-C, 40-hour runtime on low.'},
  ]},
];

var catData=R(cats);
var prod=R(catData.items);
var brand=R(['Apex','Kova','Nobu','Zelle','Crest','Rova','Lumio','Dreft','Solv','Nara','Vero','Husk','Onyx','Drift','Peak']);

var price=parseFloat(rf(29,299));
var hasDiscount=rn(0,1);
var discountPct=hasDiscount?rn(10,40):0;
var origPrice=hasDiscount?(price/(1-discountPct/100)).toFixed(2):null;

var rating=(3.5+Math.random()*1.4).toFixed(1);
var reviews=rn(12,4892);

// ── Variants ─────────────────────────────────────────────────────────────
var colorPalettes=[
  ['Black','White','Navy'],['Charcoal','Cream','Forest Green'],
  ['Black','Caramel','Sage'],['Midnight','Sand','Rust'],
  ['Onyx','Pearl','Blush','Slate'],['Mocha','Stone','Mist'],
  ['Graphite','Ivory','Terracotta'],['Obsidian','Fog','Cedar'],
];
var colors=R(colorPalettes);

var hasSizes=rn(0,1);
var sizeSets=[['XS','S','M','L','XL','2XL'],['S','M','L','XL'],['One Size'],['28','30','32','34','36'],['6','7','8','9','10','11']];
var sizes=hasSizes?R(sizeSets):null;

// ── Visuals ──────────────────────────────────────────────────────────────
var gradients=[
  'linear-gradient(135deg,#667eea,#764ba2)','linear-gradient(135deg,#f093fb,#f5576c)',
  'linear-gradient(135deg,#4facfe,#00f2fe)','linear-gradient(135deg,#43e97b,#38f9d7)',
  'linear-gradient(135deg,#fa709a,#fee140)','linear-gradient(135deg,#a18cd1,#fbc2eb)',
  'linear-gradient(135deg,#fccb90,#d57eeb)','linear-gradient(135deg,#a1c4fd,#c2e9fb)',
  'linear-gradient(135deg,#fd7043,#ff8a65)','linear-gradient(135deg,#26c6da,#00acc1)',
  'linear-gradient(135deg,#e8d5b7,#b8860b)','linear-gradient(135deg,#89f7fe,#66a6ff)',
];
var gradient=R(gradients);

var thumbGrads=[
  'linear-gradient(135deg,#e0e7ff,#c7d2fe)','linear-gradient(135deg,#fce7f3,#fbcfe8)',
  'linear-gradient(135deg,#d1fae5,#a7f3d0)','linear-gradient(135deg,#fef3c7,#fde68a)',
];

// ── Shipping / pricing ───────────────────────────────────────────────────
var freeShip=rn(0,1);
var shipping=freeShip?0:parseFloat(rf(4.99,14.99));
var expressPrice=rf(9.99,22.99);
var total=price+shipping;

// ── Person placeholders ──────────────────────────────────────────────────
var fn=R(['Alex','Jordan','Morgan','Taylor','Casey','Riley','Avery','Blake','Quinn','Drew','Sam','Jamie','Logan','Reese','Parker']);
var ln=R(['Smith','Johnson','Williams','Brown','Jones','Davis','Miller','Wilson','Moore','Clark','Anderson','Thomas','White','Harris','Martin']);
var email=fn.toLowerCase()+'.'+ln.toLowerCase()+rn(1,99)+'@'+R(['gmail.com','yahoo.com','outlook.com','icloud.com','hotmail.com']);
var loc=R([
  {city:'New York',state:'NY',zip:'10001'},{city:'Los Angeles',state:'CA',zip:'90001'},
  {city:'Chicago',state:'IL',zip:'60601'},{city:'Houston',state:'TX',zip:'77001'},
  {city:'Phoenix',state:'AZ',zip:'85001'},{city:'Seattle',state:'WA',zip:'98101'},
  {city:'Miami',state:'FL',zip:'33101'},{city:'Denver',state:'CO',zip:'80201'},
  {city:'Austin',state:'TX',zip:'73301'},{city:'Portland',state:'OR',zip:'97201'},
  {city:'Nashville',state:'TN',zip:'37201'},{city:'San Diego',state:'CA',zip:'92101'},
]);
var street=rn(100,9999)+' '+R(['Main St','Oak Ave','Maple Dr','Park Blvd','Cedar Ln','Elm Way','Pine Rd','Birch Ct','Willow Pl','River Dr']);

// ── Stars ────────────────────────────────────────────────────────────────
var fullS=Math.floor(parseFloat(rating));
var starsHtml='';
for(var i=0;i<5;i++){
  starsHtml+='<span style="color:'+(i<fullS?'#f59e0b':'#d1d5db')+'">\u2605</span>';
}

// ── Color swatches HTML ──────────────────────────────────────────────────
var cmap={'Black':'#1a1a1a','White':'#f5f5f0','Navy':'#1e3a5f','Charcoal':'#36454f',
  'Cream':'#fffdd0','Forest Green':'#228b22','Midnight':'#191970','Sand':'#c2b280',
  'Rust':'#b7410e','Caramel':'#c68642','Sage':'#bcbc8e','Onyx':'#353839',
  'Pearl':'#f0ead6','Blush':'#de5d83','Slate':'#708090','Mocha':'#7b4b2a',
  'Stone':'#928e85','Mist':'#b0c4c4','Graphite':'#474747','Ivory':'#fffff0',
  'Terracotta':'#cc5533','Obsidian':'#1c1c1c','Fog':'#c8c8c8','Cedar':'#5c3317'};

var colorSwatches=colors.map(function(c,i){
  return '<button class="clr" onclick="selColor('+i+')" id="clr-'+i+'" title="'+c+'" style="width:28px;height:28px;border-radius:50%;background:'+(cmap[c]||'#888')+';border:2.5px solid '+(i===0?accent:'#d1d5db')+';cursor:pointer;outline:none;transition:border .15s;flex-shrink:0;"></button>';
}).join('');

// ── Size buttons HTML ────────────────────────────────────────────────────
var sizeButtons=sizes?sizes.map(function(s,i){
  return '<button class="sz" onclick="selSize('+i+')" id="sz-'+i+'" style="padding:8px 14px;border:1.5px solid '+(i===0?accent:'#d1d5db')+';border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;background:'+(i===0?accent+'15':'#fff')+';color:'+(i===0?accent:'#374151')+';transition:all .15s;">'+s+'</button>';
}).join(''):'';

// ── Thumbnails HTML ──────────────────────────────────────────────────────
var thumbsHtml=thumbGrads.map(function(g,i){
  return '<div onclick="selThumb(this)" class="thumb" style="width:70px;height:70px;flex-shrink:0;border-radius:8px;background:'+g+';border:2px solid '+(i===0?accent:'#e5e7eb')+';cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:28px;transition:border .15s;">'+prod.img+'</div>';
}).join('');

// ── Inline JS ────────────────────────────────────────────────────────────
var inlineJS=[
  'var qty=1,price='+price+',shipping='+shipping+';',
  'var colors='+JSON.stringify(colors)+';',
  'var sizes='+JSON.stringify(sizes)+';',
  'var accent="'+accent+'";',
  'function updTotals(){',
    'var t=(price*qty+shipping).toFixed(2);',
    'var s=(price*qty).toFixed(2);',
    'document.getElementById("sum-qty").textContent=qty;',
    'document.getElementById("sum-price").textContent="$"+(price*qty).toFixed(2);',
    'document.getElementById("sub-total").textContent="$"+s;',
    'document.getElementById("co-total").textContent="$"+t;',
    'document.getElementById("pay-total").textContent="$"+t;',
  '}',
  'function chgQty(n){qty=Math.max(1,Math.min(10,qty+n));document.getElementById("qty-val").textContent=qty;updTotals();}',
  'function selColor(i){',
    'document.getElementById("clr-name").textContent=colors[i];',
    'document.getElementById("sum-clr").textContent=colors[i];',
    'var bs=document.querySelectorAll(".clr");',
    'for(var j=0;j<bs.length;j++)bs[j].style.borderColor=j===i?accent:"#d1d5db";',
  '}',
  'function selSize(i){',
    'if(sizes&&document.getElementById("sum-sz"))document.getElementById("sum-sz").textContent=sizes[i];',
    'var bs=document.querySelectorAll(".sz");',
    'for(var j=0;j<bs.length;j++){bs[j].style.borderColor=j===i?accent:"#d1d5db";bs[j].style.background=j===i?accent+"15":"#fff";bs[j].style.color=j===i?accent:"#374151";}',
  '}',
  'function selThumb(el){var ts=document.querySelectorAll(".thumb");for(var i=0;i<ts.length;i++)ts[i].style.borderColor="#e5e7eb";el.style.borderColor=accent;}',
  'function openCO(){document.getElementById("drawer").classList.add("open");document.getElementById("ov").classList.add("show");document.body.style.overflow="hidden";}',
  'function closeCO(){document.getElementById("drawer").classList.remove("open");document.getElementById("ov").classList.remove("show");document.body.style.overflow="";}',
  'function addCart(){',
    'var b=document.getElementById("atc");var c=document.getElementById("cc");',
    'b.textContent="\\u2713 Added!";b.style.background=accent;b.style.color="#fff";',
    'if(c){c.style.display="inline";}',
    'setTimeout(function(){b.textContent="Add to Cart";b.style.background="#fff";b.style.color=accent;},2000);',
    'setTimeout(function(){openCO();},600);',
  '}',
].join('');

// ── Build HTML ───────────────────────────────────────────────────────────
var html='<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<title>'+prod.n+' \u2014 '+storeName+'</title>'+
  '<style>'+
    '*{box-sizing:border-box;margin:0;padding:0}'+
    'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f9fafb;color:#111827;min-height:100vh}'+
    'button{font-family:inherit}'+
    'a{text-decoration:none;color:inherit}'+
    'input,select{width:100%;padding:10px 12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:14px;font-family:inherit;outline:none;transition:border .15s,box-shadow .15s;background:#fff;color:#111827}'+
    'input:focus,select:focus{border-color:'+accent+';box-shadow:0 0 0 3px '+accent+'20}'+
    'label{font-size:12px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px;letter-spacing:0.3px}'+
    '.f{margin-bottom:14px}.row{display:flex;gap:12px}'+
    '.drawer{position:fixed;top:0;right:0;height:100%;width:440px;max-width:100vw;background:#fff;z-index:10001;overflow-y:auto;transform:translateX(100%);transition:transform .3s cubic-bezier(.4,0,.2,1);box-shadow:-4px 0 32px rgba(0,0,0,.13)}'+
    '.drawer.open{transform:translateX(0)}'+
    '.ov{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:10000;opacity:0;pointer-events:none;transition:opacity .3s}'+
    '.ov.show{opacity:1;pointer-events:all}'+
    '@media(max-width:760px){.pg{flex-direction:column!important}.img-col{position:static!important;max-width:100%!important}}'+
  '</style></head><body>'+

  // Header
  '<header style="background:#fff;border-bottom:1px solid #e5e7eb;padding:14px 28px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:200;">'+
    '<div style="display:flex;align-items:center;gap:10px;">'+
      '<div style="width:30px;height:30px;background:'+accent+';border-radius:7px;"></div>'+
      '<span style="font-size:18px;font-weight:800;color:#111827;">'+storeName+'</span>'+
    '</div>'+
    '<nav style="display:flex;gap:24px;font-size:13px;font-weight:600;color:#6b7280;">'+
      '<a href="#" onclick="return false">Shop</a>'+
      '<a href="#" onclick="return false">'+catData.cat+'</a>'+
      '<a href="#" onclick="return false">About</a>'+
    '</nav>'+
    '<a href="#" onclick="openCO();return false" style="font-size:20px;position:relative;display:flex;align-items:center;">'+
      '\uD83D\uDED2'+
      '<span id="cc" style="display:none;font-size:11px;font-weight:700;background:'+accent+';color:#fff;border-radius:999px;padding:1px 6px;position:absolute;top:-4px;right:-8px;">1</span>'+
    '</a>'+
  '</header>'+

  // Breadcrumb
  '<div style="max-width:1100px;margin:12px auto;padding:0 28px;font-size:12px;color:#9ca3af;">'+
    '<a href="#" onclick="return false" style="color:#9ca3af;">Home</a> \u203A '+
    '<a href="#" onclick="return false" style="color:#9ca3af;">'+catData.cat+'</a> \u203A '+
    '<span style="color:#374151;font-weight:500;">'+prod.n+'</span>'+
  '</div>'+

  // Product grid
  '<main style="max-width:1100px;margin:0 auto 60px;padding:0 28px;">'+
    '<div class="pg" style="display:flex;gap:44px;align-items:flex-start;">'+

      // Image column
      '<div class="img-col" style="flex:1;max-width:520px;position:sticky;top:72px;">'+
        '<div style="border-radius:16px;overflow:hidden;background:'+gradient+';aspect-ratio:1;display:flex;align-items:center;justify-content:center;font-size:110px;margin-bottom:12px;user-select:none;">'+prod.img+'</div>'+
        '<div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;">'+thumbsHtml+'</div>'+
      '</div>'+

      // Info column
      '<div style="flex:1;padding-top:4px;min-width:0;">'+
        '<div style="font-size:11px;font-weight:700;color:'+accent+';letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px;">'+brand+'</div>'+
        '<h1 style="font-size:26px;font-weight:800;color:#111827;line-height:1.25;margin-bottom:12px;">'+prod.n+'</h1>'+

        // Rating
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:18px;">'+
          '<span style="font-size:16px;letter-spacing:1px;">'+starsHtml+'</span>'+
          '<span style="font-size:14px;font-weight:700;color:#374151;">'+rating+'</span>'+
          '<span style="font-size:13px;color:#9ca3af;">('+reviews.toLocaleString()+' reviews)</span>'+
        '</div>'+

        // Price
        '<div style="display:flex;align-items:baseline;gap:12px;margin-bottom:20px;">'+
          '<span style="font-size:30px;font-weight:800;color:#111827;">$'+price.toFixed(2)+'</span>'+
          (origPrice?'<span style="font-size:18px;color:#9ca3af;text-decoration:line-through;">$'+origPrice+'</span><span style="font-size:13px;font-weight:700;background:#fef2f2;color:#dc2626;padding:3px 9px;border-radius:5px;">SAVE '+discountPct+'%</span>':'')+
        '</div>'+

        // Description
        '<p style="font-size:14px;color:#4b5563;line-height:1.75;margin-bottom:24px;padding-bottom:24px;border-bottom:1px solid #f3f4f6;">'+prod.desc+'</p>'+

        // Color
        '<div style="margin-bottom:20px;">'+
          '<p style="font-size:13px;font-weight:600;color:#374151;margin-bottom:10px;">Color: <span id="clr-name" style="color:'+accent+'">'+colors[0]+'</span></p>'+
          '<div style="display:flex;gap:10px;flex-wrap:wrap;">'+colorSwatches+'</div>'+
        '</div>'+

        // Sizes
        (sizes?'<div style="margin-bottom:22px;"><p style="font-size:13px;font-weight:600;color:#374151;margin-bottom:10px;">Size:</p><div style="display:flex;gap:8px;flex-wrap:wrap;">'+sizeButtons+'</div></div>':'')+

        // Quantity
        '<div style="margin-bottom:24px;">'+
          '<p style="font-size:13px;font-weight:600;color:#374151;margin-bottom:10px;">Quantity:</p>'+
          '<div style="display:flex;align-items:center;border:1.5px solid #d1d5db;border-radius:8px;width:fit-content;overflow:hidden;">'+
            '<button onclick="chgQty(-1)" style="padding:10px 18px;border:none;background:#f9fafb;font-size:18px;cursor:pointer;color:#374151;">\u2212</button>'+
            '<span id="qty-val" style="padding:10px 22px;font-size:15px;font-weight:700;color:#111827;min-width:50px;text-align:center;border-left:1.5px solid #d1d5db;border-right:1.5px solid #d1d5db;">1</span>'+
            '<button onclick="chgQty(1)" style="padding:10px 18px;border:none;background:#f9fafb;font-size:18px;cursor:pointer;color:#374151;">+</button>'+
          '</div>'+
        '</div>'+

        // CTAs
        '<div style="display:flex;flex-direction:column;gap:10px;margin-bottom:24px;">'+
          '<button onclick="openCO()" style="padding:15px;background:'+accent+';color:#fff;border:none;border-radius:10px;font-size:16px;font-weight:700;cursor:pointer;transition:opacity .15s;" onmouseover="this.style.opacity=\'.85\'" onmouseout="this.style.opacity=\'1\'">Buy Now</button>'+
          '<button onclick="addCart()" id="atc" style="padding:15px;background:#fff;color:'+accent+';border:2px solid '+accent+';border-radius:10px;font-size:16px;font-weight:700;cursor:pointer;transition:background .15s,color .15s;">Add to Cart</button>'+
        '</div>'+

        // Trust badges
        '<div style="display:flex;flex-wrap:wrap;gap:14px;font-size:12px;color:#6b7280;padding:14px 16px;background:#f9fafb;border-radius:10px;border:1px solid #f3f4f6;">'+
          '<span>\uD83D\uDE9A '+(freeShip?'Free shipping on this order':'Ships within 1\u20132 business days')+'</span>'+
          '<span>\u21A9 30-day free returns</span>'+
          '<span>\uD83D\uDD12 Secure checkout</span>'+
        '</div>'+
      '</div>'+
    '</div>'+
  '</main>'+

  // Overlay
  '<div class="ov" id="ov" onclick="closeCO()"></div>'+

  // Checkout drawer
  '<div class="drawer" id="drawer">'+

    // Drawer header
    '<div style="padding:18px 22px;border-bottom:1px solid #f3f4f6;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:#fff;z-index:1;">'+
      '<div>'+
        '<div style="font-size:15px;font-weight:800;color:#111827;">Checkout</div>'+
        '<div style="font-size:12px;color:#9ca3af;margin-top:1px;">'+storeName+'</div>'+
      '</div>'+
      '<button onclick="closeCO()" style="width:32px;height:32px;border-radius:50%;border:none;background:#f3f4f6;cursor:pointer;font-size:20px;line-height:32px;color:#6b7280;">\u00D7</button>'+
    '</div>'+

    // Order summary
    '<div style="padding:16px 22px;background:#f9fafb;border-bottom:1px solid #f3f4f6;">'+
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">'+
        '<div style="width:52px;height:52px;border-radius:8px;background:'+gradient+';display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;">'+prod.img+'</div>'+
        '<div style="flex:1;min-width:0;">'+
          '<div style="font-size:13px;font-weight:600;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+prod.n+'</div>'+
          '<div style="font-size:12px;color:#9ca3af;margin-top:3px;">'+
            '<span id="sum-clr">'+colors[0]+'</span>'+
            (sizes?' \u00B7 <span id="sum-sz">'+sizes[0]+'</span>':'')+
            ' \u00B7 Qty <span id="sum-qty">1</span>'+
          '</div>'+
        '</div>'+
        '<div style="font-size:15px;font-weight:800;color:#111827;flex-shrink:0;" id="sum-price">$'+price.toFixed(2)+'</div>'+
      '</div>'+
      '<div style="border-top:1px solid #e5e7eb;padding-top:12px;">'+
        '<div style="display:flex;justify-content:space-between;font-size:13px;color:#6b7280;margin-bottom:6px;"><span>Subtotal</span><span id="sub-total" style="color:#374151;font-weight:600;">$'+price.toFixed(2)+'</span></div>'+
        '<div style="display:flex;justify-content:space-between;font-size:13px;color:#6b7280;margin-bottom:6px;"><span>Shipping</span><span style="color:'+(freeShip?'#16a34a':'#374151')+';font-weight:600;">'+(freeShip?'Free':'$'+shipping.toFixed(2))+'</span></div>'+
        '<div style="border-top:1px solid #e5e7eb;margin:10px 0;"></div>'+
        '<div style="display:flex;justify-content:space-between;font-size:15px;font-weight:800;color:#111827;"><span>Total</span><span id="co-total">$'+total.toFixed(2)+'</span></div>'+
      '</div>'+
    '</div>'+

    // Form
    '<form onsubmit="return false" style="padding:20px 22px;">'+

      '<div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid #f3f4f6;">Contact</div>'+
      '<div class="f"><label>Email address</label><input type="email" placeholder="'+email+'"></div>'+
      '<div class="row">'+
        '<div class="f" style="flex:1"><label>First name</label><input placeholder="'+fn+'"></div>'+
        '<div class="f" style="flex:1"><label>Last name</label><input placeholder="'+ln+'"></div>'+
      '</div>'+
      '<div class="f"><label>Phone (optional)</label><input type="tel" placeholder="+1 (555) '+rn(100,999)+'\u2013'+rn(1000,9999)+'"></div>'+

      '<div style="font-size:13px;font-weight:700;color:#111827;margin:18px 0 14px;padding-bottom:8px;border-bottom:1px solid #f3f4f6;">Shipping Address</div>'+
      '<div class="f"><label>Street address</label><input placeholder="'+street+'"></div>'+
      '<div class="f"><label>Apt, suite, etc. (optional)</label><input placeholder="Apt '+rn(1,99)+'B"></div>'+
      '<div class="row">'+
        '<div class="f" style="flex:2"><label>City</label><input placeholder="'+loc.city+'"></div>'+
        '<div class="f" style="flex:1"><label>State</label><input placeholder="'+loc.state+'"></div>'+
        '<div class="f" style="flex:1"><label>ZIP</label><input placeholder="'+loc.zip+'"></div>'+
      '</div>'+
      '<div class="f"><label>Country</label><select><option>United States</option><option>Canada</option><option>United Kingdom</option><option>Australia</option></select></div>'+

      // Shipping method
      '<div style="font-size:13px;font-weight:700;color:#111827;margin:18px 0 14px;padding-bottom:8px;border-bottom:1px solid #f3f4f6;">Shipping Method</div>'+
      '<label style="display:flex;align-items:center;gap:12px;padding:12px;border:2px solid '+accent+';border-radius:8px;cursor:pointer;margin-bottom:8px;background:'+accent+'0d;">'+
        '<input type="radio" name="ship" checked style="width:auto;accent-color:'+accent+'">'+
        '<span style="flex:1;font-size:13px;font-weight:600;">'+R(['Standard (5\u20137 days)','Economy (7\u201310 days)','Ground (5\u20138 days)'])+'</span>'+
        '<span style="font-size:13px;font-weight:700;color:'+(freeShip?'#16a34a':'#374151')+'">'+(freeShip?'Free':'$'+shipping.toFixed(2))+'</span>'+
      '</label>'+
      '<label style="display:flex;align-items:center;gap:12px;padding:12px;border:1.5px solid #d1d5db;border-radius:8px;cursor:pointer;">'+
        '<input type="radio" name="ship" style="width:auto;accent-color:'+accent+'">'+
        '<span style="flex:1;font-size:13px;font-weight:600;">'+R(['Express (2\u20133 days)','Priority (2\u20134 days)','Expedited (3\u20135 days)'])+'</span>'+
        '<span style="font-size:13px;font-weight:700;">$'+expressPrice+'</span>'+
      '</label>'+

      '<div style="font-size:13px;font-weight:700;color:#111827;margin:18px 0 14px;padding-bottom:8px;border-bottom:1px solid #f3f4f6;">Payment</div>'+
      '<div style="display:flex;gap:8px;margin-bottom:16px;">'+
        '<div style="padding:6px 14px;border:1.5px solid '+accent+';border-radius:6px;font-size:12px;font-weight:700;background:'+accent+'15;color:'+accent+'">Credit Card</div>'+
        '<div style="padding:6px 14px;border:1.5px solid #e5e7eb;border-radius:6px;font-size:12px;font-weight:700;color:#6b7280;">PayPal</div>'+
        '<div style="padding:6px 14px;border:1.5px solid #e5e7eb;border-radius:6px;font-size:12px;font-weight:700;color:#6b7280;">Apple Pay</div>'+
      '</div>'+
      '<div class="f"><label>Card number</label>'+
        '<div style="position:relative;"><input type="text" placeholder="1234  5678  9012  3456" style="padding-right:46px;letter-spacing:0.5px">'+
        '<span style="position:absolute;right:12px;top:50%;transform:translateY(-50%);font-size:16px;">\uD83D\uDCB3</span></div>'+
      '</div>'+
      '<div class="f"><label>Name on card</label><input placeholder="'+fn+' '+ln+'"></div>'+
      '<div class="row">'+
        '<div class="f" style="flex:1"><label>Expiry</label><input placeholder="MM / YY"></div>'+
        '<div class="f" style="flex:1"><label>CVV</label><input placeholder="\u2022\u2022\u2022"></div>'+
      '</div>'+

      // Promo
      '<div style="display:flex;gap:8px;margin:4px 0 18px;">'+
        '<input type="text" placeholder="Promo or gift card code" style="flex:1;font-size:13px;">'+
        '<button onclick="return false" style="padding:10px 14px;background:#f3f4f6;border:1.5px solid #e5e7eb;border-radius:8px;font-size:13px;font-weight:600;color:#374151;cursor:pointer;white-space:nowrap;">Apply</button>'+
      '</div>'+

      '<button onclick="return false" style="width:100%;padding:15px;background:'+accent+';color:#fff;border:none;border-radius:10px;font-size:16px;font-weight:700;cursor:pointer;letter-spacing:0.2px;transition:opacity .15s;" onmouseover="this.style.opacity=\'.85\'" onmouseout="this.style.opacity=\'1\'">'+
        'Pay <span id="pay-total">$'+total.toFixed(2)+'</span>'+
      '</button>'+
      '<p style="text-align:center;margin-top:10px;font-size:12px;color:#9ca3af;">\uD83D\uDD12 256-bit SSL encrypted and secure</p>'+
    '</form>'+
  '</div>'+

  '<script>'+inlineJS+'<\/script>'+
'</body></html>';

d.open();d.write(html);d.close();
})();
