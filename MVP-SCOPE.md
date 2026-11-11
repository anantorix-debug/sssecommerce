# Furniture Store — MVP Scope and Later Features

Source: Project Blueprint (Claude Docs), MVP section. Updated 2026-10-13 with your changes:
10 features moved into the MVP, images served straight from the VPS (no Cloudflare), API and database on the VPS.

**Build status (2026-10-15): MVP built.** All 37 storefront pages, 43 admin screens and 24 backend modules exist and build.
14 backend acceptance tests pass, plus two browser end-to-end runs (guest COD checkout on the storefront; 2FA sign-in and a full order lifecycle in the admin).
Server setup, PM2, Nginx and backups: see `backend/deploy/README.md`. Section 7 shows which launch checks are proven and which still need keys or the server.

## At a glance

| | MVP | Later | Full build |
| --- | --- | --- | --- |
| Storefront pages | **37** | +7 | ~44 |
| Admin screens | **43** | +12 | ~55 |
| **Total screens** | **80** | **+19** | **~99** |
| Backend API modules | **24** | +8 | ~32 |

Before your changes the MVP was 32 + 35 = 67 screens and 20 modules. It is now 80 screens and 24 modules (about 20% larger).

Notes:
- Counts are **page templates**, not URLs. One "Product" template serves every product.
- Category and sub-category share one template. Checkout is one page with steps.
- Features that add no new page (COD, Google sign-in, GST invoice download, hero video, page transitions, scroll stories) are built into existing pages.

### What you moved into the MVP

| Feature | New storefront pages | New admin screens | New backend module |
| --- | --- | --- | --- |
| Cash on delivery with value limits | — (checkout option) | COD collections | — (inside Payments) |
| Returns: request, pickup, inspection, refund | Return request, Return detail | Returns list, Return inspection, Refunds | Returns |
| Reviews and ratings with photos | Write a review | Review moderation | Reviews |
| Google sign-in | — (button on login) | — | — (inside Auth) |
| GST invoice PDFs | — (download on order detail) | Invoices | Invoices |
| Delivery slot booking and installation scheduling | Schedule delivery | Delivery slots, Installation jobs | Delivery scheduling |
| Hero video on the homepage | — | — | — |
| Smooth page transitions | — | — | — |
| Scroll stories on collection pages | — | — | — |
| Compare up to 3 products | Compare | — | — |
| **Added** | **+5** | **+8** | **+4** |

---

## 1. MVP: Storefront pages (37)

### Browse (11)
| # | Page | URL |
| --- | --- | --- |
| 1 | Home (hero video) | `/` |
| 2 | All rooms | `/rooms` |
| 3 | Room (shop the room) | `/rooms/[room]` |
| 4 | All categories | `/shop` |
| 5 | Category / sub-category | `/shop/[category]/[sub]` |
| 6 | All collections | `/collections` |
| 7 | Collection (scroll story) | `/collections/[slug]` |
| 8 | Look (room scene with hotspots) | `/looks/[slug]` |
| 9 | Product (gallery, variants, 3D view, reviews) | `/products/[slug]` |
| 10 | Compare (up to 3) | `/compare` |
| 11 | Search results | `/search?q=` |

### Buy (4)
| # | Page | URL |
| --- | --- | --- |
| 12 | Wishlist | `/wishlist` |
| 13 | Cart | `/cart` |
| 14 | Checkout (contact, address, delivery, pay online in test mode **or COD**) | `/checkout` |
| 15 | Order confirmation | `/checkout/confirmation/[orderNumber]` |

### Sign in (4)
| # | Page | URL |
| --- | --- | --- |
| 16 | Login (email OTP, password, **Google**) | `/login` |
| 17 | Register | `/register` |
| 18 | Forgot password | `/forgot-password` |
| 19 | Reset password | `/reset-password` |

### Account (10)
| # | Page | URL |
| --- | --- | --- |
| 20 | Account overview | `/account` |
| 21 | Order history | `/account/orders` |
| 22 | Order detail (cancel, GST invoice download) | `/account/orders/[orderNumber]` |
| 23 | Schedule delivery and installation | `/account/orders/[orderNumber]/schedule` |
| 24 | Return request | `/account/orders/[orderNumber]/return` |
| 25 | Return detail and status | `/account/returns/[id]` |
| 26 | Write a review (with photos) | `/account/reviews/new` |
| 27 | Addresses | `/account/addresses` |
| 28 | Profile | `/account/profile` |
| 29 | Track order (guest) | `/track` |

### Content (6)
| # | Page | URL |
| --- | --- | --- |
| 30 | Guides list | `/guides` |
| 31 | Guide article | `/guides/[slug]` |
| 32 | About | `/about` |
| 33 | Contact | `/contact` |
| 34 | FAQ | `/faq` |
| 35 | Policy (shipping, returns, warranty, privacy, terms, cancellation) | `/policies/[slug]` |

### System (2)
| # | Page |
| --- | --- |
| 36 | Not found (404) |
| 37 | Error (500) |

---

## 2. MVP: Admin screens (43)

| Group | Screens | Count |
| --- | --- | --- |
| Access | Login, 2FA check, My account (password, 2FA) | 3 |
| Overview | Dashboard with work queues (new orders, COD to confirm, to ship, returns to inspect, low stock) | 1 |
| Catalogue | Products list, Product editor (details, variants, prices, images, 3D model, SEO), Categories, Rooms list, Room editor, Collections list, Collection editor (with scroll story), Looks list, Look hotspot editor, Options and attributes, Media library (images, video, 3D) | 11 |
| Inventory | Stock overview, Stock movements (stock in, adjust, history), Locations, Pincodes | 4 |
| Orders and delivery | Orders list, Order detail, **Delivery slots and capacity**, **Installation jobs**, **COD collections** | 5 |
| Returns and refunds | **Returns list**, **Return detail and inspection**, **Refunds** (approve, record manual payouts) | 3 |
| Customers | Customers list, Customer detail | 2 |
| Reviews | **Review moderation** | 1 |
| Marketing | Coupons list, Coupon editor | 2 |
| Content | Pages list, Page and homepage block editor (hero video), Navigation menus, Redirects | 4 |
| Finance and reports | Sales report, **Invoices** (GST invoice list and PDFs) | 2 |
| Team and system | Staff list, Staff invite and edit, Roles and permissions, Audit log, Settings | 5 |
| **Total** | | **43** |

---

## 3. MVP: Storefront features

- Mobile-first responsive design, white editorial look, subtle parallax
- **Hero video** on the homepage: poster image loads first, video starts after the page is ready, off for reduced motion and data-saver
- **Smooth page transitions** from product card to product page (View Transitions API, plain navigation as fallback)
- **Scroll stories** on collection pages (CSS scroll-driven animation, static layout for reduced motion)
- Header, mega menu (desktop), slide-out menu (mobile), search suggestions, footer
- Pincode check with delivery fee, delivery estimate and COD availability
- Product cards with second image on hover and finish swatches
- Product page: gallery, zoom, finish and size pickers, price, add to cart, details tabs, **ratings and reviews with photos**
- 3D view: loads only when tapped, finish swatch changes the model's material, hides if the device can't show 3D
- Shop-the-room hotspots on room and look pages
- **Compare up to 3 products** (dimensions, materials, price, warranty side by side)
- Filters, sort, "load more", typo-tolerant search
- Wishlist (guest and logged in), cart with coupon
- Checkout with **Razorpay test payment** or **cash on delivery** (value limits, pincode rules)
- Login: email OTP (Nodemailer), email + password, **Google sign-in**
- **Delivery slot booking and installation scheduling** from the order page
- **Returns:** request with reason and photos, track status
- **GST invoice PDF** download on order detail
- Order history, cancel before shipping, guest tracking
- SEO: titles, meta, structured data (Product with ratings), sitemap, robots.txt, redirects
- Accessibility: keyboard use, focus states, reduced-motion support
- Loading skeletons, empty states, error states, 404 and error pages

## 4. MVP: Backend (NestJS + PostgreSQL) — 24 modules

1. Customer auth: email OTP (Nodemailer), password, **Google sign-in** (linked to an existing account with the same verified email), sessions
2. Staff auth: login, 2FA, roles and permissions
3. Catalogue: products, variants, options, categories, rooms, collections, looks, attributes
4. Media: upload to VPS disk, image checks with sharp, resizing and AVIF/WebP by the Next.js image optimiser, video and 3D model (GLB) checks, private files
5. Search: PostgreSQL full-text with typo tolerance, filters and counts
6. Inventory: stock per variant, stock movement log, 15-minute stock hold, auto-release, restock on accepted returns
7. Pincodes: delivers to every valid Indian pincode on default terms (Settings → Delivery); listed pincodes set their own fee, delivery days and COD, or are blocked when inactive. Place names come from India Post's public service, saved in our database (`PINCODE_LOOKUP=off` disables it)
8. Cart: guest and user carts, merge on login
9. Pricing: GST included, totals calculated on the server only
10. Coupons
11. Checkout and orders: place order safely (no double orders), statuses, cancel, history
12. Payments: Razorpay **test mode** (order, signature check, webhooks, retry, test refunds) and **cash on delivery** (value limit, COD confirmation before dispatch, cash collected recorded)
13. Notifications: email only (placed, confirmed, slot reminder, shipped, delivered, cancelled, return updates, review request)
14. Wishlist and account: profile, addresses
15. Content: homepage blocks (incl. hero video), pages, menus, redirects, refresh storefront on publish
16. Reports: sales report
17. Audit log: every admin change recorded
18. Settings
19. Background jobs (scheduled jobs + an email outbox table in PostgreSQL, no Redis): emails, stock expiry, invoice PDFs, reconciliation
20. Rate limiting: limits per IP, email, account, session and staff user, counters stored in PostgreSQL
21. **Returns:** request, approve or reject, pickup (manual), inspection, restock, refund or replacement
22. **Reviews:** only buyers with a delivered item can review; photos; moderation; average rating per product
23. **Invoices:** GST invoice per order, sequential number per financial year, CGST/SGST or IGST split, PDF stored privately
24. **Delivery scheduling:** slot capacity per pincode area and day, customer booking, installation jobs, reminders

## 4a. MVP: Backend rate limits

Two layers:
- **Nginx (first layer, now the edge server):** 20 requests/second per IP to the API (burst 40), 50/second per IP to images and video (burst 100), connection limits per IP.
- **API (second layer):** counters in a PostgreSQL `RateLimit` table (one atomic upsert per check), shared across all API processes and kept across restarts. All limits are in `backend/src/common/rate-limit.ts`.

| What | Limit | Counted per |
| --- | --- | --- |
| Email OTP request | 3 per 10 min, and 10 per hour per IP | email + IP |
| OTP verify | 5 wrong tries, then the code is locked | OTP code |
| Customer login (password or Google) | 5 failed per 15 min per account; 20 per 15 min per IP | account + IP |
| Register | 5 per hour | IP |
| Forgot password | 3 per hour | email |
| Staff login | 5 failed per 15 min, then 15-min lock + email alert | staff account + IP |
| Place order (online or COD) | 10 per minute | session |
| COD orders | 3 open COD orders at a time | customer + phone |
| Payment verify | 10 per minute | session |
| Cart changes | 60 per minute | cart |
| Coupon apply | 10 per 10 min (stops code guessing) | cart |
| Search and suggestions | 60 per minute | IP |
| Pincode check | 30 per minute | IP |
| Guest order tracking | 10 per 10 min (stops order-number guessing) | IP |
| Contact form | 5 per hour | IP |
| Review submit | 5 per day | customer |
| Return request | 5 per day | customer |
| Slot booking changes | 10 per hour | order |
| Public catalogue reads | 300 per minute | IP |
| Admin API | 600 per minute | staff user |
| Admin media upload | 60 per hour | staff user |
| Admin exports | 5 per hour | staff user |
| Razorpay webhooks | **Not rate-limited** (signature checked instead) | — |

Rules:
- Over the limit → HTTP `429` with `Retry-After` and error code `RATE_LIMITED`; the storefront shows "Too many tries. Please try again in X minutes."
- Real client IP: with no Cloudflare, Nginx is the edge, so the API trusts only Nginx's `X-Real-IP` and ignores any IP header sent by the visitor.
- Firewall: only ports 80, 443 and SSH open; SSH by key only; fail2ban on SSH and on repeated `429`s.
- Login and OTP failures are logged; a spike of `429`s triggers an alert.
- All limits live in one config file.

## 5. MVP: Server (your VPS, 100 GB, everything on one server)

- **No Docker.** Everything is installed directly on the VPS (Ubuntu):
  - PostgreSQL (apt package, systemd service)
  - Node.js 22 apps run by **PM2**: API, background jobs, storefront (Next.js), admin (Next.js)
  - Nginx as the front door: HTTPS (Let's Encrypt), routing, serving `/media` files from disk
- **No Redis and no imgproxy** (both were only needed with Docker): jobs and rate-limit counters live in PostgreSQL; the Next.js image optimiser resizes images and keeps a disk cache, cleaned weekly to stay under 15 GB
- Images and video served **straight from the VPS** (no Cloudflare): HTTP/2, long cache headers
- Pick a VPS location in India (Mumbai, Bengaluru or Chennai) so images load fast for customers
- Recommended size with everything on one server: **8 vCPU, 16 GB RAM** (4 vCPU / 8 GB is the minimum)
- Check the plan's monthly bandwidth: with no CDN, every image and video byte comes from the VPS (example: 1,000 visitors a day × 5 MB ≈ 150 GB a month)
- Backups: database dump **every 6 hours** (all orders live here), kept 14 days; media trash 30 days
- Copy pulled to your own computer or drive, nightly at minimum
- Disk alerts at 70% and 85% (emailed to Owners by the jobs process), uptime check on `/api/health`, firewall and fail2ban
- Staging environment and CI/CD

**Ready-made server files** in `backend/deploy/` (step-by-step in its `README.md`):

| File | Purpose |
| --- | --- |
| `release.sh` | Builds and starts or updates everything in the right order, with a database backup first |
| `ecosystem.config.cjs` | PM2: `shop-api` :4100, `shop-jobs`, `shop-storefront` :3100, `shop-admin` :3101, all on 127.0.0.1 (the CRM keeps 3000/4000) |
| `nginx/sss-shop.conf` | `shop.` and `shopadmin.sssfurniture.co.in`: `/api` → API, `/media` from disk, `/_private` internal only, rate limits, webhooks unlimited |
| `env/*.env` | Production settings templates for the three apps |
| `backup.sh` | `pg_dump` every 6 hours, checked, kept 14 days |
| `pull-backup.sh` | Runs on your computer: pulls dumps and all media with rsync (no cloud storage) |
| `maintenance.sh` | Weekly: keeps the resized-image cache under 15 GB |

First admin on the real server: `npm run setup:owner -- you@yourdomain.in "Your Name"` (prints a one-time password; never run the demo seed in production).

### Storage budget for 100 GB, year one

| Use | Estimate |
| --- | --- |
| Product images (originals) | 22 GB |
| Room scenes, CMS and guide images | 4 GB |
| Video (hero and collections) | 3 GB |
| 3D models | 1 GB |
| Private files (invoices, review and return photos, exports) | 8 GB |
| Resized image cache (capped) | 15 GB |
| Media trash (30 days) | 2 GB |
| PostgreSQL data and dumps | 8 GB |
| OS, app builds, node_modules, logs | 20 GB |
| **Free headroom** | **17 GB** |

Still fits, but headroom drops from 25 GB to 17 GB. Watch video and review photos.

## 6. Switched off in the MVP (built, not active)

| Feature | MVP state | Switch to turn on later |
| --- | --- | --- |
| Online payment | Razorpay **test mode only** | `PAYMENTS_MODE=live` + live keys + Razorpay KYC |
| EMI | Hidden everywhere | `FEATURE_EMI=true` |
| Shipping carrier integration | Own staff deliver; slots and status managed in admin; no carrier API | `SHIPPING_PROVIDER=manual` → carrier adapter |

### Important: COD changes what the MVP is

With cash on delivery switched on, the MVP **can take real orders and real money**. That means:
- It is a real launch for COD customers, not only a private preview.
- GST invoices, legal pages, real delivery staff and the returns process must all be ready on day one (they are now in the MVP).
- Online payment and COD each have a switch in Admin → Settings → Payment methods; a method that is off is hidden from the storefront, and at least one must stay on. **Current setting: online only, with Razorpay test keys, so no real order can be paid yet.** Before a public launch, switch to live keys (`PAYMENTS_MODE=live`) or turn COD on.
- Without SMS OTP, the customer's phone number is not verified. Confirm every COD order by a phone call or email reply before dispatch, and keep the COD value limit low.
- COD returns need refunds paid by bank transfer or UPI by hand; the Refunds screen records these.

## 7. MVP is done when

Ticked = proven by an automated test (`backend/test/mvp.test.ts`, run with `npm test` in `backend/`) or the browser end-to-end scripts.
Unticked = built, but needs something you provide (keys, a phone, the server) to prove.

- [x] A tester browses, picks a variant, checks out as a guest and pays through Razorpay test mode — *proven with test net banking (`storefront/scripts/e2e-checkout.mjs`); test card and UPI not run*
- [ ] The order is confirmed by the webhook even if the browser is closed after paying — *needs test keys + webhook secret*
- [ ] A failed payment can be retried; an unpaid order expires after 15 minutes and its stock is released — *needs test keys*
- [x] A COD order over the value limit, or to a non-COD pincode, is refused with a clear message
- [x] A COD order waits for staff confirmation before it can be dispatched; cash collected is recorded
- [x] No EMI text or EMI option appears anywhere
- [x] A pincode that doesn't exist is blocked before payment (a blocked pincode uses the same check, but only the invalid case has a test)
- [x] A customer books a delivery slot; a full slot cannot be booked
- [x] Staff mark an order Shipped and Delivered, and the customer gets an email each time
- [x] A GST invoice PDF with the correct number series and tax split is created for every confirmed order
- [x] A return goes request → approved → picked up → inspected → refunded, and stock is restocked on pass
- [x] Only a customer with a delivered item can review it; reviews appear only after moderation
- [ ] Google sign-in with an email that already has an account logs into that same account — *client ID and secret are set; register the redirect URI `<storefront>/api/store/auth/google/callback` in Google Cloud, then try it*
- [ ] Compare shows up to 3 products side by side — *built; check by hand*
- [ ] The hero video never delays the first image (LCP), and stops for reduced motion — *built; measure with Lighthouse on the server*
- [ ] Page transitions and scroll stories fall back cleanly on unsupported browsers and for reduced motion — *built; check in Firefox/Safari*
- [x] The API refuses to start with a live Razorpay key while `PAYMENTS_MODE=test`
- [ ] "View in 3D" shows a 5 MB model within 5 seconds on a 4G phone, and finishes switch without reloading — *check on a real phone*
- [ ] Pages without a model download no 3D code — *3D code loads only when "View in 3D" is tapped; confirm in the browser network tab*
- [x] A 4th OTP request within 10 minutes gets `429` with `Retry-After`, and the storefront shows a clear message
- [ ] Rate limits hold across API restarts and multiple API processes — *counters are in PostgreSQL by design; confirm on the server with 2 API processes*
- [x] Razorpay webhooks are never blocked by rate limits
- [ ] A database backup can be restored from the copy on your own computer — *on the server: `backend/deploy/README.md` step 8*

Also tested (not on the original list): the last unit in stock sells exactly once when 8 people check out together; a double-clicked "Place order" creates one order; a tampered total is refused.

---

## 8. Later: advanced features

### Turn on first (already built, switched off)
- Live online payments
- EMI
- Shipping carrier integration (tracking numbers, carrier updates)

### P1 — next releases
- SMS OTP and WhatsApp order updates (also verifies phone numbers for COD)
- Room-fit check (enter wall width, see if it fits)
- Recently viewed products
- Gift cards
- Designer video consultation booking
- Shiprocket for small décor parcels
- Bulk CSV import with dry run
- Scheduled price changes
- Two-person approval for large refunds
- Advanced reports and exports (GST filing report, inventory value, refunds) — recommended soon after launch because COD brings real sales
- Dedicated search engine (Meilisearch) if the catalogue grows
- Visual regression tests

### P2 — later
- AR view (see it in your room)
- Room planner
- Modular sofa configurator
- Personalised recommendations
- Loyalty points and referrals
- Trade accounts and quotes
- Store pickup
- Multi-warehouse stock rules
- Suppliers and purchase orders
- Demand forecasting
- Multi-language and multi-currency
- Chat assistant
- Native mobile apps

## 9. Later: extra pages and screens

### Storefront (+7)
Gift cards, Store locator, Bulk / trade enquiry, Designer consultation booking, Support tickets list, Ticket detail, Room planner (P2).

### Admin (+12)
Support inbox, Ticket detail, Shipments board (carrier), Automatic promotions, Campaigns, GST and finance reports, Exports, Bulk CSV import, Notification templates, Scheduled price changes, Suppliers (P2), Purchase orders (P2).

### Backend modules (+8)
Support tickets, Shipping carrier adapters, SMS and WhatsApp, Gift cards, Promotions engine, Exports, Loyalty (P2), Trade accounts (P2).

---

## Decisions

| Question | Answer |
| --- | --- |
| Keep Cloudflare as an image cache? | **No.** Images and video served straight from the VPS |
| API and database on the VPS too? | **Yes.** API, background jobs and PostgreSQL all on the VPS |
| Storefront and admin (Next.js) on the VPS? | **Yes.** Run with PM2 behind Nginx, no Vercel |
| Docker? | **No.** All services installed directly; Redis and imgproxy removed |
| Project folders | Three standalone projects side by side: `storefront/`, `backend/`, `admin/` (each with its own `package.json`; no root workspace, no git files) |
| Brand | **SSS Furniture**, Salem. Logo, address and phone taken from the SSS CRM letterhead |
| Payment methods | **Online only for now** (Razorpay test keys); COD switched off. Both are switches in the admin |
| Delivery area | **All of India.** Default terms for any valid pincode; the pincode list holds exceptions |
| Customer sign-in | Google redirect sign-in ("Continue with Google") plus email code and password |

## Open questions

1. When do live Razorpay keys go in? Until then, the store can't take a real payment.
2. What are the real default delivery days and fee for all-India orders? (Currently 10 working days and ₹999, placeholders.)
3. What is the real GSTIN? (A placeholder is showing in the footer and on invoices.)
4. Which addresses does the shop use? `admin.` and `api.sssfurniture.co.in` already belong to the CRM, which also uses ports 3000 and 4000 on its server.
