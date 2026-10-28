# Event contract

Events are stored in compact form inside `AnalyticsEventBatch.events` (JSON). Version: the batch layout below is version 1; aggregation ignores fields it does not know.

## Beacon (browser → `Analytics-Collect`)

`POST /Analytics-Collect`, body `text/plain` JSON, at most 16 384 characters:

```json
{
  "b": "4f1c2e9a0b7d3c5e8f6a1b2c",
  "e": [
    { "n": "view_item_list", "p": "25592581M", "l": "cat:womens-dresses", "o": 3 },
    { "n": "select_item", "p": "25592581M", "l": "cat:womens-dresses", "o": 3 },
    { "n": "view_item", "p": "25592581M" },
    { "n": "search", "t": "floral dress", "r": 12 }
  ]
}
```

| Field | Meaning | Rule |
|---|---|---|
| `b` | Batch ID, random per beacon | `^[a-z0-9]{16,32}$`; an existing batch ID is ignored (replay or retry) |
| `e` | Events | At most `analyticsBatchSize`; the rest is counted as rejected |
| `n` | Event name | Only `view_item_list`, `select_item`, `view_item`, `search` |
| `p` | Product ID as shown | `^[A-Za-z0-9_.-]{1,100}$` |
| `l` | List | `^[A-Za-z0-9_.:-]{1,64}$`: `cat:<categoryId>`, `search`, `home`, `recommendations`, `<page>-other`, or a `data-analytics-list` value |
| `o` | Position in the list | Integer 1–10000 |
| `t` | Search term | Normalized (lowercase, single spaces), at most 50 characters of `a-z 0-9 ' & . -`; refused when it contains `@` or 5+ digits |
| `r` | Search result count | Integer ≥ 0 |

The server never takes timestamps, prices, session IDs or customer data from the browser. It stamps each batch with the receive time, the reporting day (site time zone), the opaque session token and the sample rate.

## Stored events

The server adds markers it decides itself:

| Marker | Meaning |
|---|---|
| `f` | First time today in this session for this product (or this checkout attempt) → unique-session counts |
| `k` | First event of this kind today in this session → site-level unique-session funnel |
| `s` | First tracked event of the session today → tracked sessions |

Server events (`source = SERVER`):

```json
{ "n": "add_to_cart", "p": "701644329402M", "q": 3, "u": 4950, "f": 1, "k": 1 }
{ "n": "begin_checkout", "w": "9f2c1a7e3b5d4c60", "i": 2, "q": 3, "a": 12900, "g": 0, "f": 1, "k": 1 }
{ "n": "add_shipping_info", "w": "9f2c1a7e3b5d4c60", "m": "001", "y": "US", "h": 1, "f": 1 }
{ "n": "add_payment_info", "w": "9f2c1a7e3b5d4c60", "m": "CREDIT_CARD", "a": 12900, "f": 1 }
```

| Field | Meaning |
|---|---|
| `q` / `u` | Quantity added / basket unit price in cents |
| `w` | Checkout attempt: first 16 hex characters of SHA-256 of the basket UUID |
| `i`, `q`, `a`, `g` | Line items, total quantity, basket total in cents, signed-in (1) or guest (0) |
| `m` | Shipping method ID, or payment method IDs joined with `+` |
| `y`, `h` | Shipping country code, number of shipments |

Never stored: names, e-mail addresses, phone numbers, addresses, customer numbers, card numbers, CVV, expiry, payment tokens or responses, billing data, raw session IDs.

## Purchase

There is no purchase event. `Analytics-ReconcileOrders` reads orders and stores what each order contributed:

```json
{ "v": 1, "d": "20261027", "s": "Q", "fd": "20261027",
  "l": [["25592581M", "womens-dresses", 2, 15800, 1580, 14220, 0]],
  "g": 15800, "dc": 1580, "sh": 799, "tx": 1137, "tot": 16156, "rf": 0 }
```

`l` lines: product (master), category, units, gross, discount, net, refund (cents). `s`: `Q` qualifying, `C` cancelled. `fd`: day the linked checkout attempt began.

## Deduplication summary

| Duplicate source | Protection |
|---|---|
| Event bubbling, two links in one tile, double click | One capture listener; the same product within 1 s is one selection |
| Script included twice | `window.pluginAnalyticsLoaded` guard |
| DOM re-render of a tile | One impression per list + product + position per page view |
| Transport retry / replay | Batch key `day_batchId` is unique |
| Refresh of the product page | New page view; not a new unique-session view |
| Repeated `Checkout-Begin` | One attempt per basket per session |
| Repeated order confirmation / reconciliation | Order snapshot difference is zero |
