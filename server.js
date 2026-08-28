/* =====================================================================
   RANGAT — STORE SERVER
   Zero dependencies. Node 18+.  Run:  node server.js
   ===================================================================== */
"use strict";
const http = require("http");
const fs   = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT           = process.env.PORT || 3000;
const ON_RAILWAY     = !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (ON_RAILWAY ? "" : "rangat123");
const SHEET_URL      = process.env.SHEET_URL || "";
const META_PIXEL_ID  = String(process.env.META_PIXEL_ID || "").replace(/\D/g, "");
const ROOT           = process.env.DATA_DIR || __dirname;

if (!ADMIN_PASSWORD) {
  console.error("Set ADMIN_PASSWORD in Railway Variables. Do not commit it to GitHub.");
  process.exit(1);
}
const PUBLIC   = path.join(__dirname, "public");
const UPLOADS  = path.join(ROOT, "uploads");
const DATA     = path.join(ROOT, "data");
const PRODUCTS = path.join(DATA, "products.json");
const ORDERS   = path.join(DATA, "orders.json");

for (const d of [UPLOADS, DATA]) fs.mkdirSync(d, { recursive: true });

/* ---------- tiny json store (atomic writes) ---------- */
function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return fallback; }
}
function writeJSON(file, value) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}
if (!fs.existsSync(PRODUCTS)) writeJSON(PRODUCTS, []);
if (!fs.existsSync(ORDERS))   writeJSON(ORDERS, []);

/* ---------- sessions ---------- */
const sessions = new Set();
function newSession() {
  const t = crypto.randomBytes(24).toString("hex");
  sessions.add(t);
  return t;
}
function cookies(req) {
  const out = {};
  (req.headers.cookie || "").split(";").forEach(c => {
    const i = c.indexOf("=");
    if (i > 0) out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim());
  });
  return out;
}
function isAdmin(req) { return sessions.has(cookies(req).rg_admin || ""); }

/* ---------- helpers ---------- */
function send(res, code, body, headers = {}) {
  res.writeHead(code, Object.assign({ "Cache-Control": "no-store" }, headers));
  res.end(body);
}
function json(res, code, obj, headers = {}) {
  send(res, code, JSON.stringify(obj), Object.assign({ "Content-Type": "application/json" }, headers));
}
function body(req, limit = 12 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on("data", c => {
      size += c.length;
      if (size > limit) { reject(new Error("too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
const MIME = {
  ".html":"text/html; charset=utf-8", ".css":"text/css; charset=utf-8",
  ".js":"application/javascript; charset=utf-8", ".json":"application/json",
  ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".png":"image/png",
  ".webp":"image/webp", ".svg":"image/svg+xml", ".ico":"image/x-icon",
  ".txt":"text/plain; charset=utf-8"
};
function serveFile(res, file, cache) {
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, "Not found", { "Content-Type": "text/plain" });
    send(res, 200, buf, {
      "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": cache || "no-store"
    });
  });
}
function serveStore(res) {
  fs.readFile(path.join(PUBLIC, "index.html"), "utf8", (err, html) => {
    if (err) return send(res, 404, "Not found", { "Content-Type": "text/plain" });
    send(res, 200, html.replace(/__META_PIXEL_ID__/g, META_PIXEL_ID), {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    });
  });
}
/* keep path traversal out */
function safeJoin(base, target) {
  const p = path.normalize(path.join(base, target));
  return p.startsWith(base) ? p : null;
}
function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

/* ---------- forward order to Google Sheet (optional) ---------- */
async function toSheet(order) {
  if (!SHEET_URL) return "no-url";
  try {
    const r = await fetch(SHEET_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(order)
    });
    return r.ok ? "ok" : "http-" + r.status;
  } catch (e) { return "failed"; }
}

/* ---------- routes ---------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://" + (req.headers.host || "localhost"));
  const p = decodeURIComponent(url.pathname);
  const method = req.method;

  try {
    /* ---------- public API ---------- */
    if (p === "/api/products" && method === "GET") {
      const list = readJSON(PRODUCTS, []).filter(x => x.active !== false)
        .map(({ cost, source, active, ...pub }) => pub);   // never leak cost or supplier
      return json(res, 200, list);
    }

    if (p === "/api/orders" && method === "POST") {
      const data = JSON.parse((await body(req, 256 * 1024)).toString("utf8") || "{}");
      const all = readJSON(PRODUCTS, []);
      const lines = Array.isArray(data.items) ? data.items : [];
      if (!lines.length) return json(res, 400, { ok: false, error: "empty order" });

      /* recompute totals server-side — never trust the browser */
      let sub = 0, cost = 0, count = 0;
      const detail = [];
      for (const l of lines) {
        const prod = all.find(x => x.id === l.id);
        if (!prod) return json(res, 400, { ok: false, error: "unknown product " + l.id });
        const qty = Math.max(1, Math.min(10, parseInt(l.qty, 10) || 1));
        sub += prod.price * qty; cost += (prod.cost || 0) * qty; count += qty;
        detail.push(prod.name + " | " + l.size + " x" + qty + " | Rs " + prod.price * qty);
      }
      const cfg = readJSON(path.join(DATA, "settings.json"), {});
      const freeAbove = cfg.freeShippingAbove ?? 699;
      const fee = cfg.shippingFee ?? 49;
      const ship = sub >= freeAbove ? 0 : fee;

      const order = {
        orderId: "RG" + String(Date.now()).slice(-7),
        placedAt: new Date().toISOString(),
        name: String(data.name || "").slice(0, 120),
        phone: String(data.phone || "").replace(/\D/g, "").slice(0, 12),
        pincode: String(data.pincode || "").replace(/\D/g, "").slice(0, 6),
        city: String(data.city || "").slice(0, 120),
        address: String(data.address || "").slice(0, 400),
        items: detail.join("\n"),
        itemCount: count, subtotal: sub, shipping: ship, total: sub + ship,
        payment: "Cash on delivery", status: "NEW",
        cost, margin: sub - cost
      };
      if (!/^[6-9]\d{9}$/.test(order.phone)) return json(res, 400, { ok: false, error: "bad phone" });
      if (!/^\d{6}$/.test(order.pincode))    return json(res, 400, { ok: false, error: "bad pincode" });

      const orders = readJSON(ORDERS, []);
      orders.push(order);
      writeJSON(ORDERS, orders);
      order.sheet = await toSheet(order);
      return json(res, 200, { ok: true, orderId: order.orderId, total: order.total });
    }

    /* ---------- admin auth ---------- */
    if (p === "/api/admin/login" && method === "POST") {
      const { password } = JSON.parse((await body(req, 4096)).toString("utf8") || "{}");
      if (password !== ADMIN_PASSWORD) return json(res, 401, { ok: false });
      const t = newSession();
      return json(res, 200, { ok: true }, {
        "Set-Cookie": `rg_admin=${t}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`
      });
    }
    if (p === "/api/admin/logout" && method === "POST") {
      sessions.delete(cookies(req).rg_admin || "");
      return json(res, 200, { ok: true }, { "Set-Cookie": "rg_admin=; Path=/; Max-Age=0" });
    }
    if (p === "/api/admin/me" && method === "GET") {
      return json(res, isAdmin(req) ? 200 : 401, { ok: isAdmin(req) });
    }

    /* everything below requires admin */
    if (p.startsWith("/api/admin/")) {
      if (!isAdmin(req)) return json(res, 401, { ok: false, error: "not logged in" });

      if (p === "/api/admin/products" && method === "GET")
        return json(res, 200, readJSON(PRODUCTS, []));

      if (p === "/api/admin/products" && method === "PUT") {
        const list = JSON.parse((await body(req, 2 * 1024 * 1024)).toString("utf8"));
        if (!Array.isArray(list)) return json(res, 400, { ok: false });
        writeJSON(PRODUCTS, list);
        return json(res, 200, { ok: true, count: list.length });
      }

      if (p === "/api/admin/settings" && method === "GET")
        return json(res, 200, readJSON(path.join(DATA, "settings.json"), {}));
      if (p === "/api/admin/settings" && method === "PUT") {
        writeJSON(path.join(DATA, "settings.json"),
                  JSON.parse((await body(req, 64 * 1024)).toString("utf8")));
        return json(res, 200, { ok: true });
      }

      if (p === "/api/admin/orders" && method === "GET")
        return json(res, 200, readJSON(ORDERS, []).slice().reverse());

      if (p === "/api/admin/order-status" && method === "POST") {
        const { orderId, status } = JSON.parse((await body(req, 4096)).toString("utf8"));
        const orders = readJSON(ORDERS, []);
        const o = orders.find(x => x.orderId === orderId);
        if (!o) return json(res, 404, { ok: false });
        o.status = String(status).slice(0, 20);
        writeJSON(ORDERS, orders);
        return json(res, 200, { ok: true });
      }

      /* image upload: raw bytes, filename from query. Admin panel resizes first. */
      if (p === "/api/admin/upload" && method === "POST") {
        const id  = slug(url.searchParams.get("id") || "");
        const ext = (url.searchParams.get("ext") || "jpg").replace(/[^a-z]/gi, "").toLowerCase();
        if (!id) return json(res, 400, { ok: false, error: "missing id" });
        if (!["jpg","jpeg","png","webp"].includes(ext))
          return json(res, 400, { ok: false, error: "bad type" });
        const buf = await body(req, 8 * 1024 * 1024);
        if (!buf.length) return json(res, 400, { ok: false, error: "empty" });
        const file = `${id}-${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}.${ext}`;
        fs.writeFileSync(path.join(UPLOADS, file), buf);
        return json(res, 200, { ok: true, url: "/uploads/" + file, bytes: buf.length });
      }

      if (p === "/api/admin/image" && method === "DELETE") {
        const { url: u } = JSON.parse((await body(req, 4096)).toString("utf8"));
        const name = path.basename(String(u || ""));
        const f = safeJoin(UPLOADS, name);
        if (f && fs.existsSync(f)) fs.unlinkSync(f);
        return json(res, 200, { ok: true });
      }

      return json(res, 404, { ok: false, error: "no such endpoint" });
    }

    /* ---------- static ---------- */
    if (p.startsWith("/uploads/")) {
      const f = safeJoin(UPLOADS, p.slice("/uploads/".length));
      if (!f) return send(res, 400, "bad path", { "Content-Type": "text/plain" });
      return serveFile(res, f, "public, max-age=31536000, immutable");
    }
    if (p === "/admin" || p === "/admin/") return serveFile(res, path.join(PUBLIC, "admin.html"));
    if (p === "/" || p === "/index.html") return serveStore(res);

    const rel = p === "/" ? "/index.html" : p;
    const f = safeJoin(PUBLIC, rel);
    if (!f) return send(res, 400, "bad path", { "Content-Type": "text/plain" });
    if (fs.existsSync(f) && fs.statSync(f).isFile())
      return serveFile(res, f, /\.(css|js)$/.test(f) ? "no-cache" : "no-store");

    return send(res, 404, "Not found", { "Content-Type": "text/plain" });

  } catch (err) {
    console.error(method, p, err.message);
    return json(res, 500, { ok: false, error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`\n  Rangat running on :${PORT}`);
  console.log(`  Admin password is set via ADMIN_PASSWORD (not logged).`);
  console.log(`  Pixel: ${META_PIXEL_ID ? "on" : "off (set META_PIXEL_ID)"}\n`);
});
