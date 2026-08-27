# Rangat — store + admin

Node server, **zero dependencies**. No `npm install`, no build step.

```
node server.js
```

Store → http://localhost:3000
Admin → http://localhost:3000/admin  (password: `rangat123`)

**Change that password before you put this online.**

---

## Environment variables

| Variable | Default | What it does |
|---|---|---|
| `ADMIN_PASSWORD` | `rangat123` | Admin login. **Change it.** |
| `SHEET_URL` | *(empty)* | Your Google Apps Script `/exec` URL. Orders are forwarded there as well as saved locally. |
| `PORT` | `3000` | Port to listen on |

```bash
ADMIN_PASSWORD='something-long' \
SHEET_URL='https://script.google.com/macros/s/AKfy.../exec' \
node server.js
```

---

## The admin panel

**Products tab**

- **Drag images onto any product.** They're resized to 900x1200 and
  compressed in your browser before upload, so a 4MB phone photo
  becomes about 150KB. Nothing to install.
- First image is the one shoppers see. Use the arrow to promote another.
- Edit name, cost, price, fabric, description.
- Click a size to mark it out of stock.
- "Live on store" set to No hides a product without deleting it.
- **Reprice all at 65%** recalculates every price from cost.
- Nothing is live until you hit **Save all**.

**Orders tab**

- Today's count, cash and margin at the top.
- Every order with full address and phone.
- Click the status pill to cycle NEW -> CONFIRMED -> CANCELLED.

**Confirm before you dispatch.** Cash-on-delivery fashion runs 30-40%
return-to-origin. One "reply YES to confirm" message typically pulls
that to 15-20%, and on these margins that gap is the business.

---

## Where things live

```
server.js              the whole server
public/                the store
public/admin.html      the admin panel
uploads/               product images   <-- BACK THIS UP
data/products.json     your catalogue   <-- BACK THIS UP
data/orders.json       your orders      <-- BACK THIS UP
```

---

## Putting it online

You need a host that runs Node **and keeps a disk between restarts**.

- **Railway** — connect the repo, add a volume covering `/app/data`
  and `/app/uploads`. Around $5/month.
- **Render** — Web Service with a persistent disk. The free tier has
  no disk, so images and orders vanish on restart. Pay the $7.
- **Any VPS** (Hetzner, DigitalOcean, roughly Rs 400/month) — clone it,
  run behind nginx or Caddy, keep it up with systemd.

Netlify, Vercel and GitHub Pages **cannot run this** — they serve
static files only, with no persistent disk.

Set `ADMIN_PASSWORD` and `SHEET_URL` as env vars on whichever you pick,
and put it behind HTTPS. The admin cookie is HttpOnly and SameSite=Strict,
but the password still travels in the login request — over plain HTTP
anyone on the network can read it.

---

## Safe by design

- **Prices are recomputed server-side** from `data/products.json`.
  A customer editing the page cannot change what they are charged.
- **Your cost and Meesho links never reach the browser** — the public
  API strips them out.
- Quantities clamp to 1-10. Phone and pincode are validated.
- Uploads limited to jpg/png/webp and 8MB. Path traversal blocked on
  both uploads and static files.

---

## Things that will bite you

**Images vanished after a redeploy.** Your host has no persistent disk.
See above.

**Admin logs out when the server restarts.** Sessions live in memory.
Expected — just sign in again.

**Order did not reach the Sheet.** It is still saved in
`data/orders.json` and shows in the Orders tab. Check `SHEET_URL` is
set, and remember Apps Script needs a **redeploy** after every edit.

**Port already in use.** `PORT=3001 node server.js`
