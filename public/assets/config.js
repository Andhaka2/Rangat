/* ============================================================
   RANGAT — CONFIG
   Edit this file only. Everything else can stay as it is.
   ============================================================ */

var CONFIG = {

  /* Your Google Apps Script Web App URL.
     Get it from step 5 of README.md. Looks like:
     https://script.google.com/macros/s/AKfy..../exec
     Leave "" while testing — orders will still show a confirmation
     and be kept in the browser, they just won't reach the Sheet. */
  SHEET_URL: "https://script.google.com/macros/s/AKfycbwPB4B8gKFQ33bcBfh6siRA2MXn7gs3ZwIF3Y63Drq1_6x0UCwC52I9Aj3DUJdD05EJ/exec",

  /* Your WhatsApp number for the "Order on WhatsApp" fallback.
     Country code + number, digits only. Example: 919876543210 */
  WHATSAPP: "",

  /* Your margin over supplier cost. 1.65 = 65% markup. */
  MARKUP: 1.65,

  /* Delivery */
  FREE_SHIPPING_ABOVE: 699,
  SHIPPING_FEE: 49,

  /* Pincode prefixes you do NOT deliver to (high RTO areas).
     Add 4-digit prefixes as you learn which ones cost you money. */
  BLOCKED_PINCODES: [],

  /* Store */
  STORE_NAME: "Rangat",
  ORDER_PREFIX: "RG"
};
