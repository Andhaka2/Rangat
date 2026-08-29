/* Loads the catalogue from the server, then starts the store. */
(function(){
  function applyHash() {
    if (!location.hash) return;
    var el = document.querySelector(location.hash);
    if (el) el.scrollIntoView({ block: "start" });
  }
  var s = document.createElement("script");
  fetch("/api/products")
    .then(function(r){ return r.json(); })
    .then(function(list){
      window.PRODUCTS  = list;
      window.ALL_SIZES = ["XS","S","M","L","XL","XXL"];
      window.SIZE_CM   = {XS:"32",S:"34",M:"36",L:"38",XL:"40",XXL:"42"};
      s.onload = function(){
        requestAnimationFrame(function(){
          requestAnimationFrame(applyHash);
        });
      };
      s.src = "assets/app.js";
      document.body.appendChild(s);
    })
    .catch(function(){
      document.body.insertAdjacentHTML("afterbegin",
        '<p style="padding:20px;font-family:sans-serif">Could not load products. Is the server running?</p>');
    });
})();
