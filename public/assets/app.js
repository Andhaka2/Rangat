/* Rangat storefront — catalogue, bag, COD checkout. */
(function(){
"use strict";

var MARKUP = CONFIG.MARKUP;
function repriceAll(){
  PRODUCTS.forEach(function(p){
    p.price = Math.round((p.cost * MARKUP - 1) / 10) * 10 + 9;
  });
}
window.repriceAll = repriceAll;

var INR = function(n){ return "₹" + n.toLocaleString("en-IN"); };
var $  = function(s,r){ return (r||document).querySelector(s); };
var $$ = function(s,r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); };
function esc(s){ return String(s).replace(/&(?![a-z]+;|#)/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function offPct(p){ return p.mrp ? Math.round((1 - p.price / p.mrp) * 100) : 0; }
function stock(p, size){ return (p.sold || []).indexOf(size) === -1; }
function pixel(ev, data){
  if (typeof fbq !== "function") return;
  try { fbq("track", ev, data || {}); } catch (e) {}
}
function imgs(p){
  if (Array.isArray(p.img)) return p.img.filter(Boolean);
  return p.img ? [p.img] : [];
}
function lookNo(p){
  var i = PRODUCTS.findIndex(function(x){ return x.id === p.id; });
  return pad(i + 1);
}

function weave(hue, seed, label){
  var s = seed % 4;
  var base = "hsl(" + hue + " 22% 86%)", mid = "hsl(" + hue + " 28% 70%)", dark = "hsl(" + hue + " 36% 32%)";
  var motif = [
    '<circle cx="14" cy="14" r="4.5" fill="'+dark+'" opacity=".5"/><circle cx="14" cy="14" r="1.6" fill="'+base+'"/>',
    '<path d="M14 6 22 14 14 22 6 14Z" fill="'+dark+'" opacity=".45"/>',
    '<path d="M14 5c5 4 5 10 0 18-5-8-5-14 0-18Z" fill="'+dark+'" opacity=".45"/>',
    '<rect x="8" y="8" width="12" height="12" fill="none" stroke="'+dark+'" stroke-width="1.2"/>'
  ][s];
  var pid = "w" + hue + "-" + seed;
  return '<svg viewBox="0 0 300 400" preserveAspectRatio="xMidYMid slice" role="img" aria-label="'+esc(label||"Print pending")+'">' +
    '<defs><pattern id="'+pid+'" width="28" height="28" patternUnits="userSpaceOnUse">' +
      '<rect width="28" height="28" fill="'+base+'"/>' + motif +
    '</pattern></defs>' +
    '<rect width="300" height="400" fill="url(#'+pid+')"/>' +
    '</svg>';
}
function shotFor(p, i, idx){
  var list = imgs(p);
  var src = list[idx || 0];
  if (src) return '<img src="'+esc(src)+'" alt="'+esc(p.name)+'" loading="lazy" decoding="async">';
  return weave(p.hue || 12, i, p.name);
}

var state = { cat:"All", q:"", sort:"pop", price:"all", view:"grid" };
var cart = [];
var checkoutStep = 0;
var order = { name:"", phone:"", pin:"", addr:"", city:"", id:"" };
var current = null, currentSize = null, lastFocus = null, galIdx = 0;

try {
  cart = JSON.parse(localStorage.getItem("rangat_bag") || "[]");
  if (!Array.isArray(cart)) cart = [];
} catch (e) { cart = []; }

function saveBag(){
  try { localStorage.setItem("rangat_bag", JSON.stringify(cart)); } catch (e) {}
}

function featured(){
  return PRODUCTS.find(function(p){ return imgs(p).length; }) || PRODUCTS[0];
}

(function hero(){
  var p = featured();
  if (!p) return;
  var i = PRODUCTS.indexOf(p);
  $("#heroArt").innerHTML = shotFor(p, i, 0);
  $("#heroCap").innerHTML = "<span>Look "+lookNo(p)+" · "+esc(p.fabric)+"</span><span>"+INR(p.price)+"</span>";
  $("#heroFrame").addEventListener("click", function(){ openDetail(p.id); });
  $("#lookIndex").innerHTML = PRODUCTS.slice(0, 8).map(function(x, n){
    return "<li><button type='button' data-id='"+esc(x.id)+"'><span class='n'>"+pad(n+1)+"</span><span class='nm'>"+esc(x.name)+"</span><span class='pr'>"+INR(x.price)+"</span></button></li>";
  }).join("");
  $("#lookIndex").addEventListener("click", function(e){
    var b = e.target.closest("[data-id]"); if (!b) return;
    openDetail(b.dataset.id);
  });
})();

function catCounts(){
  var map = {};
  PRODUCTS.forEach(function(p){ map[p.cat] = (map[p.cat] || 0) + 1; });
  return map;
}
var CATS = ["All"].concat(PRODUCTS.map(function(p){ return p.cat; }).filter(function(v,i,a){ return a.indexOf(v)===i; }));
function paintChips(){
  var counts = catCounts();
  $("#cats").innerHTML = CATS.map(function(c){
    var n = c === "All" ? PRODUCTS.length : counts[c];
    var on = state.cat === c;
    return '<button type="button" class="chip" data-cat="'+esc(c)+'" aria-pressed="'+on+'">'+esc(c)+' <span class="n">'+n+'</span></button>';
  }).join("");
}
paintChips();
$("#cats").addEventListener("click", function(e){
  var b = e.target.closest(".chip"); if (!b) return;
  state.cat = b.dataset.cat;
  $$(".chip", $("#cats")).forEach(function(x){ x.setAttribute("aria-pressed", String(x === b)); });
  render();
});

function visible(){
  var q = state.q.trim().toLowerCase();
  var lo = 0, hi = 1e9;
  if (state.price !== "all"){ var pr = state.price.split("-"); lo = +pr[0]; hi = +pr[1]; }
  var list = PRODUCTS.filter(function(p){
    if (state.cat !== "All" && p.cat !== state.cat) return false;
    if (p.price < lo || p.price > hi) return false;
    if (q && (p.name + " " + p.cat + " " + p.fabric + " " + p.desc).toLowerCase().indexOf(q) === -1) return false;
    return true;
  });
  var by = {
    pop: function(a,b){ return (b.pop||0) - (a.pop||0); },
    lo:  function(a,b){ return a.price - b.price; },
    hi:  function(a,b){ return b.price - a.price; },
    off: function(a,b){ return offPct(b) - offPct(a); },
    new: function(a,b){ return (b.isNew?1:0) - (a.isNew?1:0) || (b.pop||0) - (a.pop||0); }
  }[state.sort];
  return list.sort(by);
}

function cardHTML(p, i){
  var off = offPct(p);
  var list = imgs(p);
  var second = list[1] ? '<img class="b" src="'+esc(list[1])+'" alt="" aria-hidden="true">' : "";
  var tag = p.isNew ? '<span class="tag">New</span>' : (off >= 50 ? '<span class="tag">'+off+'% off</span>' : "");
  return '<button type="button" class="card" data-id="'+esc(p.id)+'" aria-label="'+esc(p.name)+', '+INR(p.price)+'">' +
    '<div class="shot">' + shotFor(p, i, 0) + second +
      '<span class="lookn">'+lookNo(p)+'</span>' + tag +
    '</div>' +
    '<div class="body">' +
      '<span class="meta">'+esc(p.cat)+' · '+esc(p.fabric)+'</span>' +
      '<h3><span class="nm">'+esc(p.name)+'</span></h3>' +
      '<div class="priceline"><span class="price">'+INR(p.price)+'</span>' +
        (p.mrp ? '<span class="mrp">'+INR(p.mrp)+'</span><span class="off">'+off+'% off</span>' : "") +
      '</div>' +
    '</div></button>';
}

function render(){
  var list = visible();
  $("#grid").classList.toggle("list", state.view === "list");
  $("#grid").innerHTML = list.length
    ? list.map(cardHTML).join("")
    : '<div class="empty"><h3>Nothing in this cut</h3><p>Clear the filter or try another fabric word.</p></div>';
  $("#count").textContent = list.length + (list.length === 1 ? " look" : " looks");
  $("#gridTitle").textContent = state.cat === "All" ? "The catalogue" : state.cat;
}

$("#sortSel").addEventListener("change", function(e){ state.sort = e.target.value; render(); });
$("#priceSel").addEventListener("change", function(e){ state.price = e.target.value; render(); });
function onSearch(e){
  state.q = e.target.value;
  var o = e.target.id === "q" ? $("#qm") : $("#q");
  if (o) o.value = e.target.value;
  render();
}
$("#q").addEventListener("input", onSearch);
$("#qm").addEventListener("input", onSearch);
$("#grid").addEventListener("click", function(e){
  var c = e.target.closest(".card"); if (!c) return;
  openDetail(c.dataset.id);
});
$("#viewGrid").addEventListener("click", function(){
  state.view = "grid";
  $("#viewGrid").setAttribute("aria-pressed", "true");
  $("#viewList").setAttribute("aria-pressed", "false");
  render();
});
$("#viewList").addEventListener("click", function(){
  state.view = "list";
  $("#viewList").setAttribute("aria-pressed", "true");
  $("#viewGrid").setAttribute("aria-pressed", "false");
  render();
});

document.addEventListener("keydown", function(e){
  if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test((e.target.tagName||""))) {
    e.preventDefault();
    ($("#q").offsetParent ? $("#q") : $("#qm")).focus();
  }
});

function openPanel(el){
  lastFocus = document.activeElement;
  $("#scrim").classList.add("on");
  el.classList.add("on");
  document.body.style.overflow = "hidden";
  var f = el.querySelector("button, input, select, a"); if (f) f.focus();
}
function closePanels(){
  $("#scrim").classList.remove("on");
  $("#detail").classList.remove("on");
  $("#cart").classList.remove("on");
  $("#guide").classList.remove("on");
  document.body.style.overflow = "";
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}
function openGuide(){ closePanels(); openPanel($("#guide")); }
$("#scrim").addEventListener("click", closePanels);
document.addEventListener("click", function(e){ if (e.target.closest("[data-close]")) closePanels(); });
document.addEventListener("keydown", function(e){ if (e.key === "Escape") closePanels(); });
$("#sizeGuideTop").addEventListener("click", openGuide);
$("#sizeGuideFoot").addEventListener("click", openGuide);
$("#howBtn").addEventListener("click", function(){ $("#how").scrollIntoView({ behavior:"smooth", block:"start" }); });

document.querySelector("footer").addEventListener("click", function(e){
  var a = e.target.closest("[data-cat],[data-price],[data-jump]");
  if (!a) return;
  e.preventDefault();
  if (a.dataset.cat){
    state.cat = a.dataset.cat;
    paintChips();
  }
  if (a.dataset.price){
    state.price = a.dataset.price;
    $("#priceSel").value = a.dataset.price;
  }
  if (a.dataset.jump === "new"){
    state.sort = "new";
    $("#sortSel").value = "new";
  }
  render();
  $("#shop").scrollIntoView({ behavior:"smooth" });
});

function openDetail(id){
  var i = PRODUCTS.findIndex(function(p){ return p.id === id; });
  var p = PRODUCTS[i];
  if (!p) return;
  current = p; currentSize = null; galIdx = 0;
  var off = offPct(p);
  var list = imgs(p);
  var sizeBtns = ALL_SIZES.map(function(s){
    var ok = stock(p, s);
    return '<button type="button" class="size" data-size="'+s+'" aria-pressed="false"'+(ok?"":" disabled")+'>'+s+'</button>';
  }).join("");
  var thumbs = list.length > 1
    ? '<div class="gthumbs">' + list.map(function(src, n){
        return '<button type="button" data-g="'+n+'" aria-pressed="'+(n===0)+'"><img src="'+esc(src)+'" alt=""></button>';
      }).join("") + "</div>"
    : "";
  var rows = ALL_SIZES.map(function(s){
    return '<tr><td><b>'+s+'</b></td><td>'+SIZE_CM[s]+'″</td><td>'+(+SIZE_CM[s]+2)+'″</td><td>'+(p.cat==="Anarkali"?"48":p.cat==="Kurta Set"?"44":"42")+'″</td></tr>';
  }).join("");

  $("#detailBody").innerHTML =
    '<div class="dlayout">' +
      '<div class="gallery"><div class="gmain" id="gmain">'+shotFor(p, i, 0)+'</div>'+thumbs+'</div>' +
      '<div class="dbody">' +
        '<p class="kicker">Look '+lookNo(p)+' · '+esc(p.id)+'</p>' +
        '<h2>'+esc(p.name)+'</h2>' +
        '<div class="priceline"><span class="price" style="font-size:22px">'+INR(p.price)+'</span>' +
          (p.mrp ? '<span class="mrp">'+INR(p.mrp)+'</span><span class="off">'+off+'% off</span>' : "") +
        '</div>' +
        '<p style="color:var(--mute);margin:12px 0 0">'+esc(p.desc)+'</p>' +
        '<dl class="spec">' +
          '<dt>Cloth</dt><dd>'+esc(p.fabric)+'</dd>' +
          '<dt>Cut</dt><dd>'+esc(p.cat)+'</dd>' +
          '<dt>Wash</dt><dd>Hand wash cold, dry in shade</dd>' +
          '<dt>Pay</dt><dd>Cash on delivery only</dd>' +
        '</dl>' +
        '<div class="sizerow"><span class="lab">Size</span><button type="button" class="linkbtn" id="chartToggle">Garment chart</button></div>' +
        '<div class="sizes" id="sizes">'+sizeBtns+'</div>' +
        '<p class="sizehint" id="sizehint"></p>' +
        '<details class="acc" id="chartAcc"><summary>Inches on the garment</summary>' +
          '<div class="tblscroll"><table class="chart"><thead><tr><th>Size</th><th>Bust</th><th>Waist</th><th>Length</th></tr></thead><tbody>'+rows+'</tbody></table></div>' +
          '<p>Between sizes: take the larger. These are of the kurti, not the body.</p>' +
        '</details>' +
        '<details class="acc"><summary>Doorstep cash</summary><ul>' +
          '<li>Pay the agent when the parcel is in your hands.</li>' +
          '<li>Out in 1–2 days, with you in 4–7.</li>' +
          '<li>Ship free above '+INR(CONFIG.FREE_SHIPPING_ABOVE)+', else '+INR(CONFIG.SHIPPING_FEE)+'.</li>' +
        '</ul></details>' +
        '<details class="acc"><summary>Send it back</summary><ul>' +
          '<li>7 days for size, damage, or a wrong piece.</li>' +
          '<li>Pickup is free. Tags on.</li>' +
          '<li>Refund on UPI or bank in 5 working days.</li>' +
        '</ul></details>' +
        '<div style="display:flex;gap:10px;margin-top:24px;flex-wrap:wrap">' +
          '<button type="button" class="btn ink" id="addBtn" style="flex:1;min-width:180px">Add · '+INR(p.price)+'</button>' +
          '<button type="button" class="btn line" data-close>Keep looking</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  var thumbsEl = $("#detailBody").querySelector(".gthumbs");
  if (thumbsEl) thumbsEl.addEventListener("click", function(e){
    var b = e.target.closest("[data-g]"); if (!b) return;
    galIdx = +b.dataset.g;
    $("#gmain").innerHTML = shotFor(p, i, galIdx);
    $$("[data-g]", thumbsEl).forEach(function(x){ x.setAttribute("aria-pressed", String(x === b)); });
  });
  $("#sizes").addEventListener("click", function(e){
    var b = e.target.closest(".size"); if (!b || b.disabled) return;
    currentSize = b.dataset.size;
    $$(".size", $("#sizes")).forEach(function(x){ x.setAttribute("aria-pressed", String(x === b)); });
    $("#sizehint").textContent = "";
  });
  $("#chartToggle").addEventListener("click", function(){
    var a = $("#chartAcc"); a.open = true; a.scrollIntoView({ behavior:"smooth", block:"center" });
  });
  $("#addBtn").addEventListener("click", function(){
    if (!currentSize){
      $("#sizehint").textContent = "Pick a size — these are Indian garment measures.";
      return;
    }
    addToCart(p, currentSize);
    closePanels();
    setTimeout(function(){ checkoutStep = 0; openCart(); }, 200);
  });
  openPanel($("#detail"));
  pixel("ViewContent", {
    content_ids: [p.id],
    content_name: p.name,
    content_type: "product",
    value: p.price,
    currency: "INR"
  });
}

function addToCart(p, size){
  var key = p.id + "-" + size;
  var line = cart.find(function(l){ return l.key === key; });
  if (line) line.qty++;
  else cart.push({ key:key, id:p.id, size:size, qty:1 });
  saveBag();
  syncBar();
  pixel("AddToCart", {
    content_ids: [p.id],
    content_name: p.name,
    content_type: "product",
    value: p.price,
    currency: "INR"
  });
}
function cartLines(){
  return cart.map(function(l){
    var i = PRODUCTS.findIndex(function(p){ return p.id === l.id; });
    return { line:l, p:PRODUCTS[i], i:i };
  }).filter(function(x){ return x.p; });
}
function subtotal(){ return cartLines().reduce(function(s,x){ return s + x.p.price * x.line.qty; }, 0); }
function shipFee(){ var s = subtotal(); return s === 0 || s >= CONFIG.FREE_SHIPPING_ABOVE ? 0 : CONFIG.SHIPPING_FEE; }
function grand(){ return subtotal() + shipFee(); }
function itemCount(){ return cart.reduce(function(s,l){ return s + l.qty; }, 0); }

function syncBar(){
  var n = itemCount();
  var dot = $("#cartDot");
  dot.textContent = n; dot.hidden = n === 0;
  $("#mobTotal").textContent = INR(grand());
  $("#mobCount").textContent = n === 0 ? "Bag empty" : n + (n === 1 ? " look · COD" : " looks · COD");
  $("#mobCheckout").textContent = n === 0 ? "Bag" : "Checkout";
}

function openCart(){ renderCart(); openPanel($("#cart")); }
$("#cartBtn").addEventListener("click", function(){ checkoutStep = 0; openCart(); });
$("#mobCheckout").addEventListener("click", function(){ checkoutStep = cart.length ? 1 : 0; openCart(); });

function stepsHTML(){
  var labels = ["Bag","Door","Confirm"];
  return '<div class="ck-steps">' + labels.map(function(t, i){
    var cls = i < checkoutStep ? "go" : i === checkoutStep ? "on" : "";
    return '<div class="st '+cls+'">'+t+'</div>';
  }).join("") + "</div>";
}

function renderCart(){
  var body = $("#cartBody"), foot = $("#cartFoot");
  var n = itemCount();

  if (checkoutStep === 3){
    $("#cartTitle").textContent = "Placed";
    body.innerHTML =
      '<div class="done">' +
        '<p class="kicker">Order '+esc(order.id)+'</p>' +
        '<h2>Keep '+INR(order.total)+' in notes.</h2>' +
        '<p>We will message '+esc(order.phone)+' before it leaves. The agent collects cash — not a UPI, not a link.</p>' +
        '<span class="oid">'+esc(order.id)+'</span>' +
        (CONFIG.WHATSAPP ? '<button type="button" class="btn dye" id="waBtn" style="margin-top:8px">WhatsApp the desk</button>' : "") +
        '<button type="button" class="btn line" id="againBtn" style="margin-top:8px">Back to the catalogue</button>' +
      '</div>';
    foot.hidden = true;
    $("#againBtn").addEventListener("click", function(){ checkoutStep = 0; closePanels(); });
    var wa = $("#waBtn");
    if (wa) wa.addEventListener("click", function(){
      window.open("https://wa.me/" + CONFIG.WHATSAPP + "?text=" + encodeURIComponent(order.wa), "_blank", "noopener");
    });
    return;
  }

  if (n === 0){
    $("#cartTitle").textContent = "Bag";
    body.innerHTML = '<div class="empty" style="margin:24px"><h3>Nothing folded in yet</h3><p>Add a look. Pay when it is in your hands.</p><button type="button" class="btn line" data-close style="margin-top:16px">Catalogue</button></div>';
    foot.hidden = true;
    return;
  }

  if (checkoutStep === 0){
    $("#cartTitle").textContent = "Bag";
    body.innerHTML = stepsHTML() + '<div class="cartlist">' + cartLines().map(function(x){
      return '<div class="citem" data-key="'+esc(x.line.key)+'">' +
        '<div class="th">'+shotFor(x.p, x.i)+'</div>' +
        '<div><h4>'+esc(x.p.name)+'</h4><span class="meta">'+x.line.size+' · '+esc(x.p.fabric)+'</span>' +
          '<div class="qty"><button type="button" data-act="dec" aria-label="Less">−</button><span>'+x.line.qty+'</span><button type="button" data-act="inc" aria-label="More">+</button></div>' +
        '</div>' +
        '<div><span class="price">'+INR(x.p.price * x.line.qty)+'</span><button type="button" class="rm" data-act="rm">Remove</button></div>' +
      '</div>';
    }).join("") + "</div>";
    foot.hidden = false;
    var away = CONFIG.FREE_SHIPPING_ABOVE - subtotal();
    foot.innerHTML =
      '<div class="totals">' +
        '<div><span>Looks</span><span>'+INR(subtotal())+'</span></div>' +
        '<div><span>Ship</span><span class="'+(shipFee()===0?"free":"")+'">'+(shipFee()===0?"None":INR(shipFee()))+'</span></div>' +
        (away > 0 ? '<div style="font-size:12.5px;color:var(--dye)"><span>'+INR(away)+' more and ship is free</span><span></span></div>' : "") +
        '<div class="grand"><span>Cash at the door</span><span>'+INR(grand())+'</span></div>' +
      '</div>' +
      '<button type="button" class="btn ink" id="toDetails">Door details</button>';
    $("#toDetails").addEventListener("click", function(){
      checkoutStep = 1; renderCart(); body.scrollTop = 0;
      pixel("InitiateCheckout", { value: grand(), currency: "INR", num_items: itemCount() });
    });
    body.querySelector(".cartlist").addEventListener("click", function(e){
      var b = e.target.closest("[data-act]"); if (!b) return;
      var key = b.closest(".citem").dataset.key;
      var idx = cart.findIndex(function(l){ return l.key === key; });
      if (idx < 0) return;
      var act = b.dataset.act;
      if (act === "inc") cart[idx].qty++;
      else if (act === "dec"){ cart[idx].qty--; if (cart[idx].qty <= 0) cart.splice(idx,1); }
      else cart.splice(idx,1);
      saveBag(); syncBar(); renderCart();
    });
    return;
  }

  if (checkoutStep === 1){
    $("#cartTitle").textContent = "Door";
    body.innerHTML = stepsHTML() +
      '<div class="form">' +
        '<div class="paybox"><b>Cash on delivery</b><span>Pay '+INR(grand())+' in notes to the agent. No advance.</span></div>' +
        '<div class="field" id="f-name"><label for="i-name">Name</label><input id="i-name" autocomplete="name" value="'+esc(order.name)+'"><span class="err"></span></div>' +
        '<div class="field" id="f-phone"><label for="i-phone">WhatsApp</label><input id="i-phone" type="tel" inputmode="numeric" maxlength="10" autocomplete="tel" placeholder="10 digits" value="'+esc(order.phone)+'"><span class="help">Tracking lands here. We call only if the run stalls.</span><span class="err"></span></div>' +
        '<div class="field" id="f-pin"><label for="i-pin">Pincode</label><input id="i-pin" inputmode="numeric" maxlength="6" autocomplete="postal-code" value="'+esc(order.pin)+'"><div class="pinres" id="pinres"></div><span class="err"></span></div>' +
        '<div class="field" id="f-addr"><label for="i-addr">Address</label><textarea id="i-addr" rows="3" autocomplete="street-address">'+esc(order.addr)+'</textarea><span class="err"></span></div>' +
        '<div class="field" id="f-city"><label for="i-city">City, state</label><input id="i-city" autocomplete="address-level2" value="'+esc(order.city)+'"><span class="err"></span></div>' +
      '</div>';
    foot.hidden = false;
    foot.innerHTML =
      '<div class="totals"><div class="grand"><span>Cash at the door</span><span>'+INR(grand())+'</span></div></div>' +
      '<div style="display:flex;gap:10px"><button type="button" class="btn line" id="backBag">Back</button><button type="button" class="btn ink" id="toReview" style="flex:1">Review</button></div>';
    $("#backBag").addEventListener("click", function(){ checkoutStep = 0; renderCart(); });
    $("#i-pin").addEventListener("input", checkPin);
    if (order.pin) checkPin({ target: $("#i-pin") });
    $("#toReview").addEventListener("click", function(){
      if (!validate()) return;
      checkoutStep = 2; renderCart(); body.scrollTop = 0;
    });
    return;
  }

  if (checkoutStep === 2){
    $("#cartTitle").textContent = "Confirm";
    body.innerHTML = stepsHTML() +
      '<div class="review">' +
        '<div class="revcard"><p class="kicker">Deliver to</p>' +
          '<p><b>'+esc(order.name)+'</b><br>'+esc(order.addr)+'<br>'+esc(order.city)+' — '+esc(order.pin)+'<br>'+esc(order.phone)+'</p>' +
          '<button type="button" class="linkbtn" id="editAddr" style="margin-top:10px">Edit</button>' +
        '</div>' +
        '<div class="revcard"><p class="kicker">'+itemCount()+' look'+(itemCount()>1?"s":"")+'</p><div class="revlines">' +
          cartLines().map(function(x){
            return '<div><span>'+esc(x.p.name)+' · '+x.line.size+' ×'+x.line.qty+'</span><span>'+INR(x.p.price*x.line.qty)+'</span></div>';
          }).join("") +
          '<div><span>Ship</span><span class="'+(shipFee()===0?"free":"")+'">'+(shipFee()===0?"None":INR(shipFee()))+'</span></div>' +
        '</div></div>' +
        '<div class="paybox"><b>Keep '+INR(grand())+' ready</b><span>The agent takes the full amount. Do not pay anyone before the parcel is in your hands.</span></div>' +
      '</div>';
    foot.hidden = false;
    foot.innerHTML =
      '<div class="totals"><div class="grand"><span>Payable</span><span>'+INR(grand())+'</span></div></div>' +
      '<div style="display:flex;gap:10px"><button type="button" class="btn line" id="backDet">Back</button><button type="button" class="btn dye" id="placeBtn" style="flex:1">Place · pay '+INR(grand())+' later</button></div>';
    $("#editAddr").addEventListener("click", function(){ checkoutStep = 1; renderCart(); });
    $("#backDet").addEventListener("click", function(){ checkoutStep = 1; renderCart(); });
    $("#placeBtn").addEventListener("click", placeOrder);
  }
}

var BLOCKED = CONFIG.BLOCKED_PINCODES || [];
function checkPin(e){
  var v = e.target.value.replace(/\D/g,"").slice(0,6);
  e.target.value = v;
  var box = $("#pinres"); if (!box) return;
  box.className = "pinres";
  if (v.length < 6){ box.innerHTML = ""; return; }
  var ok = BLOCKED.indexOf(v.slice(0,4)) === -1;
  if (ok){
    box.className = "pinres ok";
    box.innerHTML = "COD on this pin · 4–7 days.";
  } else {
    box.className = "pinres no";
    box.innerHTML = "We do not run to this pin yet.";
  }
}
function setErr(id, msg){
  var f = $("#f-"+id);
  f.classList.toggle("bad", !!msg);
  f.querySelector(".err").textContent = msg || "";
  return !msg;
}
function validate(){
  var name = $("#i-name").value.trim(), phone = $("#i-phone").value.replace(/\D/g,""),
      pin = $("#i-pin").value.replace(/\D/g,""), addr = $("#i-addr").value.trim(), city = $("#i-city").value.trim();
  var ok = true;
  ok = setErr("name", name.length >= 3 ? "" : "Full name, as the agent will ask.") && ok;
  ok = setErr("phone", /^[6-9]\d{9}$/.test(phone) ? "" : "A 10-digit Indian mobile.") && ok;
  ok = setErr("pin", /^\d{6}$/.test(pin) ? (BLOCKED.indexOf(pin.slice(0,4)) === -1 ? "" : "Not this pin yet.") : "Six-digit pin.") && ok;
  ok = setErr("addr", addr.length >= 12 ? "" : "House, street, a landmark.") && ok;
  ok = setErr("city", city.length >= 3 ? "" : "City and state.") && ok;
  if (ok){ order.name = name; order.phone = phone; order.pin = pin; order.addr = addr; order.city = city; }
  else { var bad = document.querySelector(".field.bad input, .field.bad textarea"); if (bad) bad.focus(); }
  return ok;
}
function orderRows(){
  return cartLines().map(function(x){
    return x.p.name + " | " + x.line.size + " x" + x.line.qty + " | " + INR(x.p.price * x.line.qty);
  }).join("\n");
}
function orderPayload(){
  return {
    orderId: order.id, placedAt: new Date().toISOString(),
    name: order.name, phone: order.phone, pincode: order.pin, city: order.city, address: order.addr,
    items: orderRows(), itemCount: order.count, subtotal: order.sub, shipping: order.ship, total: order.total,
    payment: "Cash on delivery", status: "NEW"
  };
}
function keepLocally(p){
  try{
    var k = "rangat_orders";
    var all = JSON.parse(localStorage.getItem(k) || "[]");
    all.push(p);
    localStorage.setItem(k, JSON.stringify(all.slice(-200)));
  } catch (e) {}
}
function sendToSheet(p){
  return fetch("/api/orders", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      name: p.name, phone: p.phone, pincode: p.pincode,
      city: p.city, address: p.address,
      items: cartLines().map(function(x){
        return { id: x.p.id, size: x.line.size, qty: x.line.qty };
      })
    })
  }).then(function(r){ return r.json(); })
    .then(function(j){ if (j.ok && j.orderId){ order.id = j.orderId; } return j.ok ? "ok" : "failed"; })
    .catch(function(){ return "failed"; });
}
function waMessage(p){
  return "*NEW ORDER - " + CONFIG.STORE_NAME + "*\n" +
    "Order: " + p.orderId + "\n\n" + p.items + "\n\n" +
    "Delivery: " + (p.shipping === 0 ? "FREE" : INR(p.shipping)) + "\n" +
    "*TOTAL (cash on delivery): " + INR(p.total) + "*\n\n" +
    "*Deliver to*\n" + p.name + "\n" + p.address + "\n" +
    p.city + " - " + p.pincode + "\nPhone: " + p.phone;
}
function placeOrder(){
  var btn = $("#placeBtn");
  if (btn){ btn.disabled = true; btn.textContent = "Placing…"; }
  order.sub = subtotal();
  order.ship = shipFee();
  order.total = grand();
  order.count = itemCount();
  order.id = CONFIG.ORDER_PREFIX + String(Date.now()).slice(-7);
  var payload = orderPayload();
  order.wa = waMessage(payload);
  keepLocally(payload);
  sendToSheet(payload).then(function(){
    pixel("Purchase", {
      value: order.total,
      currency: "INR",
      content_ids: cartLines().map(function(x){ return x.p.id; }),
      num_items: order.count
    });
    cart = []; saveBag(); syncBar();
    checkoutStep = 3; renderCart();
    $("#cartBody").scrollTop = 0;
  });
}

render();
syncBar();
})();
