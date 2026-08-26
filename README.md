# Rentora

**Rent anything.**

Rentora is a peer-to-peer rental marketplace running on a live Firebase backend: real authentication (email/password, Google, Apple), Firestore-backed listings and rentals, real-time messaging, a person-to-person star rating system, a Discord-style staff support desk, and a deposit/damage-claim ledger awaiting a real payment backend.

---

## 11. This round: staff account management, listing moderation, and pickup/return photos

Three additions, all staff-facing:

### Staff can now manage user accounts — but never see a password

This came up because it was asked for directly, so it's worth being explicit: **Firebase Auth never stores a password anywhere in recoverable form** — not in the database, not in the console, not anywhere. There's no version of this feature where staff (or anyone) can see what a user's password is, including me building it for you. What's actually possible, and what's now in `admin.html`'s **Users** tab:

- **Browse and search every account** by email (`js/admin-users.js` → `admin-worker/`)
- **Disable / re-enable an account** — immediately blocks sign-in
- **Force sign-out everywhere** — invalidates all of that user's existing sessions/tokens right now, which is a stronger and faster action than disabling alone if you need to cut someone off immediately
- **Send a password reset email** — the user resets it themselves via Firebase's own flow; staff never see or set the actual value
- **Delete an account** — permanent, requires typing the person's email to confirm. This deletes their Firebase Auth login only; their Firestore data (listings, reviews, messages) isn't automatically cleaned up — see the note in the code if you want to build that cleanup later.

This needed a **new backend Worker** (`admin-worker/`), for the same reason the payments Worker did: managing accounts requires Firebase's Identity Toolkit admin API, which needs a privileged service-account credential that can never live in frontend code. Deployment is the same shape as `payments-worker/` (see §10 below) — Cloudflare Workers, a Firebase service account as a secret, and a URL you paste into `js/admin-config.js`. If you already generated a service account key for the payments Worker, the same key works here too.

Every action requires the caller to actually have a `staff/{uid}` Firestore doc — checked independently by the Worker itself via the same service account, not trusted from the client — and every action is written to a new `adminAuditLog` collection (who did what, to which account, when), readable from the admin panel by any staff member.

### Staff can now moderate any listing

`firestore.rules` now lets `isStaff()` hide, show, or delete any listing, not just the owner. `admin.html`'s new **Listings** tab lets staff search every listing on the platform, open one, and see its full rental history — every request against it, with status and deposit outcome — directly from the same panel used for ticket investigation.

### Pickup/return condition photos

Rentals now carry two new photo arrays: `pickupPhotoUrls` and `returnPhotoUrls`, alongside the existing `claimPhotoUrls` used for damage claims. From an accepted rental in their Dashboard, an owner can add pickup photos (documenting condition before the rental) and return photos (after) — separate from, and in addition to, the damage-specific evidence attached to an actual claim. Staff investigating a dispute can see all three photo sets together on a listing's rental history in the admin panel, which is the difference between "he-said-she-said" and an actual paper trail.

Staff can also add these photos themselves (`firestore.rules` allows either the owner or `isStaff()`) — useful if an owner won't cooperate during an active dispute and support needs to capture what's available directly.

### Deploying admin-worker/

Same shape as `payments-worker/` if you've done that before:

1. `cd admin-worker && npm install`
2. `wrangler login` (one-time, opens a browser to authorize)
3. `wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON` — paste the full contents of a Firebase service account key JSON file as one line (Firebase Console → Project settings → Service accounts → Generate new private key). Reuse the same key from `payments-worker/` if you already have one.
4. `wrangler deploy` — prints your Worker's URL (something like `https://rentora-admin.yourname.workers.dev`)
5. Paste that URL into `ADMIN_WORKER_URL` in `js/admin-config.js`

Once that's done, the Users tab in `admin.html` goes from "not configured yet" to fully working — no other code changes needed.

### Data model additions

```text
rentalRequests/{id}   + pickupPhotoUrls (string[], ≤20)
                       + returnPhotoUrls (string[], ≤20)
staff/{uid}             (unchanged shape — now also gated at the Worker level, not just firestore.rules)
adminAuditLog/{id}      staffId, staffName, action, targetType, targetId, details, createdAt
                        — staff-readable, append-only, never editable/deletable
```

---

## 10. A previous round: real deposit holds via Stripe test mode (optional, currently paused)

This was built as **Option A** from an earlier conversation — a Cloudflare Worker (`payments-worker/`) that creates real (test-mode) Stripe authorization holds for deposits, rather than the ledger-only tracking described in §9 below. It's complete and functional but **not required for anything else in this document to work** — the deposit ledger, damage claims, and the automatic overdue rule all run fine without it (`depositPaymentIntentId` just stays empty, and `js/rentals.js` falls back to the plain Firestore-write path automatically).

If you want to pick this back up: `payments-worker/README` — actually there isn't a separate one, the deployment shape is: `wrangler secret put STRIPE_SECRET_KEY` and `wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON`, then `wrangler deploy`, then fill in `PAYMENTS_WORKER_URL` and `STRIPE_PUBLISHABLE_KEY` in `js/payments-config.js`. The one piece left unfinished when this was paused: `product.js` doesn't yet collect a card via Stripe Elements at booking time, so even with the Worker deployed, bookings still go through the ledger-only path today. Worth knowing if you come back to this later.

---

## 9. An earlier round: deposits, damage claims, and why payments aren't live yet

**Short version: nothing charges real money by default.** Payment operations (charges, deposit holds, refunds) require a secret key that can never live in frontend code — it has to run on a server you control. §10 above describes the optional path that does connect real (test-mode) holds; absent that, this section describes the always-available ledger-only fallback.

### What's here now

- **Listings can have a security deposit** (`create-listing.html` → "Security deposit"). It's shown to renters on the product page as "+$X refundable security deposit," with a clear note that Rentora doesn't hold or charge it yet.
- **The deposit amount is locked in at booking time** and validated server-side against the listing (`firestore.rules`) — a renter can't quietly request with a lower deposit than the listing actually asks for.
- **Resolution, from the owner's dashboard**, once a rental is accepted:
  - **"Confirm clean return"** — releases the deposit (`depositStatus: "released"`), no claim.
  - **"Report damage"** — the owner states an amount (capped at the deposit), a description, and photo URLs. Per your call, **this applies automatically as submitted — no staff review step.** `firestore.rules` still enforces the cap so an owner can never claim more than the deposit itself, and it's a one-shot transition (can't be re-claimed or reversed once resolved).
  - **Automatic "never came back" rule** — if a rental is still `accepted` and the deposit still `pending` more than 48 hours (`RETURN_GRACE_HOURS` in `js/rentals.js`) past the end date, the full deposit is automatically claimed with that reason recorded.
- **Renters see the outcome and reason** on their own dashboard, with a "Think this is wrong? Contact support" link straight into the ticket system — since claims aren't reviewed automatically, this is the actual recourse for now if an owner is being unreasonable.

### The one real limitation: "automatic" currently means "client-triggered"

The overdue rule runs inside `js/dashboard.js`, triggered whenever the *owner's* dashboard loads and calls `applyOverdueDepositRule()` in `js/rentals.js`. That's genuinely automatic in the sense that it's the same deterministic rule every time, not a judgment call — but it only fires when someone has the page open. There's no background job checking this while everyone's away, because that requires a **scheduled Cloud Function**, which requires the Blaze plan. Once that's set up, this exact rule moves into a real `onSchedule` function and runs whether anyone's looking or not — the client-side version can then be deleted.

### When you're ready to connect real payments

1. **Upgrade Firebase to Blaze** (Firebase Console → upgrade plan). Still free at low usage — you're billed only past a generous free tier — but required for Cloud Functions to call any external API.
2. **Create a Stripe account**, and set up **Stripe Connect** (their marketplace product) so money can flow renter → Rentora → owner with a platform fee.
3. I'll build the Cloud Functions layer: create a PaymentIntent (with manual capture, for deposits) when a request is accepted, capture/release it based on exactly the `depositStatus` decisions already being recorded now, and a webhook handler to keep Firestore in sync with what Stripe actually did.
4. Talk to a lawyer before real strangers' money moves through this — marketplace payment handling has real regulatory dimensions (state money-transmission rules, 1099-K tax reporting for owners past certain volume) that are outside what I can advise on.

### Data model additions

```text
listings/{id}             + depositAmount (number, 0 = no deposit)
rentalRequests/{id}       + depositAmount (snapshotted from listing at booking)
                          + returnDeadline (Timestamp = endDate + 48h)
                          + returnedAt (Timestamp | null)
                          + depositStatus ("n/a" | "pending" | "released" | "claimed")
                          + claimedAmount (number, ≤ depositAmount)
                          + claimReason (string)
                          + claimPhotoUrls (string[])
                          + claimedAt (Timestamp | null)
```

---

## 8. Previous round: two bug fixes + a staff support system


### Bug fix — "the chat system doesn't work"

**Root cause:** `startOrOpenConversation()` used to `getDoc()` a conversation to check whether it already existed before deciding whether to create it. That doesn't work with Firestore security rules: the read rule requires the requester to already be listed in the conversation's `participants` array — but for a **brand-new** conversation there's no document yet, so there's no `participants` array to check against, and Firestore denies the read outright rather than treating it as "not found." So the very first message anyone ever tried to send — clicking "Message owner" for the first time — failed with `permission-denied` before a conversation could ever be created.

**Fix:** `js/messages.js` no longer checks first. It calls `setDoc(ref, {...}, { merge: true })` directly — Firestore evaluates that as a `create` when the document is new and an `update` when it isn't, so no existence check is needed at all. The rule also now has a defensive `resource == null ||` clause as a second layer of protection, in case anything else ever reads a conversation the same way.

**If chat still doesn't work after updating these files:** the most common cause is that `firestore.rules` wasn't redeployed. Firestore rules only take effect once you paste the file's contents into **Firebase Console → Firestore → Rules → Publish** (or run `firebase deploy --only firestore:rules`) — editing the file locally does nothing on its own. If `conversations` was never covered by whatever rules are currently live, every read/write to it is denied by Firestore's default-deny behavior. Worth checking the browser console for the exact error (`permission-denied` vs. something else) next time — that narrows it down immediately.

### "The rating system doesn't work"

Two things were likely going on here:

1. **Listing cards always showed "★ 0.0."** Ratings in Rentora are about *people*, not *items* — you rate the person you rented from or to, not the couch. But the listing cards never stopped rendering a per-listing star number, and since nothing ever wrote to a listing's `rating` field, it was permanently zero. That reads as "broken" even though nothing was erroring. Fixed: listing cards (`app.js`, `search.js`) no longer show a rating at all, and the product page (`product.js`) now shows the **owner's** real, live-computed rating instead (or "New host" if they have none yet) — which is the number that was actually supposed to be meaningful.
2. **If it was actually failing to submit** (not just displaying wrong), I audited `reviews.js`, `dashboard.js`'s review dialog, and the `reviews` rule end-to-end and didn't find a code bug — the review flow doesn't have the same existence-check problem the chat did, because reviews are publicly readable (`allow read: if true`), so checking whether one exists never hits a permission wall. The leading suspect if this is still failing is the same one as above: **stale/undeployed rules**. `dashboard.js` now surfaces a more specific error message pointing at that if a review submission fails.

If you hit either of these again, open the browser dev console when it happens — a `permission-denied` FirebaseError there, with the collection name in the stack, is almost always "the deployed rules don't match this code" rather than a client bug.

### New: Staff support desk (Discord-style tickets)

- **`support.html`** — any signed-in user's own support view. "New ticket" prompts for a subject and first message, then opens a live chat thread with your support team. Users can close/reopen their own tickets.
- **`admin.html`** — staff-only. A ticket queue (Open / Assigned to me / Closed), a live thread per ticket with Claim and Close/Reopen actions, and a "My support identity" editor where a staff member sets the display name and photo shown to users — deliberately separate from their personal Rentora profile.
- **Becoming staff is a manual, console-only action** — see below. There's no in-app way to grant yourself or anyone else staff access, on purpose.

#### Making someone staff

1. Firebase Console → Firestore Database → Start collection (if `staff` doesn't exist yet) → collection ID `staff`.
2. Add a document whose **Document ID is that person's Firebase Auth UID** (find it in Authentication → Users). Fields don't matter yet — an empty doc is enough to grant access; they'll fill in `displayName`/`photoURL` themselves from the admin panel's "My support identity" button.
3. That person can now see `admin.html` when they visit it (the link also appears in their account dropdown automatically).

#### Data model

```text
staff/{uid}                    displayName, photoURL — self-editable once the doc exists
supportTickets/{ticketId}      userId, userName, subject, status (open|closed),
                                assignedStaffId, assignedStaffName,
                                lastMessage, lastMessageAt, lastSenderId, createdAt
  /messages/{messageId}         senderId, senderRole (user|staff), senderName, text, createdAt
```

Security rules (`firestore.rules`) restrict ticket read/write to the ticket's owner and staff; only staff can claim a ticket or set `senderRole: "staff"` on a message, and only the actual ticket owner can send as `senderRole: "user"` — so a regular user can't spoof a staff reply and vice versa.

#### What this doesn't do yet

- No notifications when a new ticket or reply comes in — staff need to have `admin.html` open (or check back) to see new tickets, same limitation as the peer messaging system.
- No file/image attachments in tickets.
- No ticket categories/priority/SLA tracking — it's a flat open/closed queue.

---

## 1. Put it on GitHub

1. Create a new GitHub repository, for example `rentora`.
2. Upload everything in this folder, keeping the structure intact.
3. In GitHub, go to **Settings → Pages** → **Build and deployment** → **Deploy from a branch** → select `main` / `/ (root)` → Save.

For local testing, use a local server (e.g. VS Code Live Server) rather than opening `index.html` directly — the site uses ES module `<script type="module">` tags, which most browsers block over the `file://` protocol.

---

## 2. Firebase project

Your Firebase Web App config lives in `js/firebase-config.js`. That object (`apiKey`, `authDomain`, etc.) is **not a secret** — your Firestore/Storage security rules are what actually protect data, so keep those locked down instead of trying to hide this file.

---

## 3. Authentication

### Email/Password
Firebase Console → **Build → Authentication → Get started → Sign-in method** → enable **Email/Password**.

### Google Sign-In
1. Same **Sign-in method** tab → enable **Google**, set a support email.
2. **Authentication → Settings → Authorized domains** → add `localhost` and your GitHub Pages domain, or `signInWithPopup` fails with `auth/unauthorized-domain`.

### Apple Sign-In
Real setup on Apple's side — can't be done from code alone:
1. Paid **Apple Developer Program** membership required.
2. Create an **App ID** with Sign in with Apple enabled, then a **Services ID** (the client ID Firebase uses), and register Firebase's return URL against it.
3. Create a **Sign in with Apple private key**, note the Key ID and Team ID.
4. Firebase Console → Authentication → Sign-in method → enable **Apple**, paste in Services ID, Team ID, Key ID, and the private key.
5. Use the same authorized domains as Google above.

`js/auth.js` implements all three via `signInWithEmailAndPassword`/`createUserWithEmailAndPassword` and `signInWithPopup()`. Every path creates a matching `users/{uid}` profile document on first sign-in.

### Sign-in/out UX
- The header avatar is an account dropdown (`js/header-auth.js`) — Dashboard, Messages (with an unread badge), your profile, Support, Settings, and (if you're staff) Staff Admin, plus Log out.
- Signing out on a public page updates the header in place; signing out from a page that needs an account sends you home.
- `login.html?next=<page>` sends you back to where you meant to go after logging in. Already signed in and land on `login.html` anyway? It redirects you straight through.

---

## 4. Firestore

Firestore is schemaless — collections and documents are created implicitly on first write, nothing needs to be pre-created in the console except the `staff` doc described in §8 (that one's deliberately manual).

### Collections used

```text
users/{uid}              displayName, email, photoURL, bio, location, createdAt
listings/{listingId}     ownerId, ownerName, title, description, category, subcategory,
                          pricePerDay, depositAmount, locationText, imageUrls[], rating,
                          reviewCount, available, bookedRanges[{start,end}], createdAt, updatedAt
rentalRequests/{id}      listingId, ownerId, renterId, startDate (Timestamp), endDate (Timestamp),
                          totalPrice, status (pending|accepted|declined|cancelled|completed),
                          depositAmount, depositPaymentIntentId, returnDeadline (Timestamp),
                          returnedAt (Timestamp|null),
                          depositStatus (n/a|pending|authorized|released|claimed|captured),
                          claimedAmount, claimReason, claimPhotoUrls[], claimedAt (Timestamp|null),
                          pickupPhotoUrls[], returnPhotoUrls[], createdAt, updatedAt
reviews/{id}              listingId, rentalRequestId, authorId, targetUserId, rating, text, createdAt
                          — doc id is "{rentalRequestId}_{authorId}"
conversations/{id}        listingId, listingTitle, ownerId, renterId, participants[2],
                          lastMessage, lastMessageAt, lastSenderId, lastRead{uid: Timestamp}
                          — doc id is "{listingId}_{renterId}"
  /messages/{messageId}    senderId, text, createdAt
staff/{uid}                displayName, photoURL — see §8, created manually
supportTickets/{id}        userId, userName, subject, status, assignedStaffId,
                          assignedStaffName, lastMessage, lastMessageAt, lastSenderId, createdAt
  /messages/{messageId}    senderId, senderRole, senderName, text, createdAt
adminAuditLog/{id}          staffId, staffName, action, targetType, targetId, details, createdAt
                          — staff-readable, append-only, see §11
```

### Renting: fluid and secured, with one honest gap

- Dates are Firestore `Timestamp`s, letting rules validate `endDate > startDate` directly.
- Availability lives on the listing (`bookedRanges[]`), not by querying other people's private requests — `js/dashboard.js` appends to it when an owner accepts, and `hasDateConflict()` in `js/listings.js` reads it to warn renters before they submit.
- The `rentalRequests` create rule cross-checks the listing itself: a request can't be forged against a delisted item or the wrong owner.
- **The honest gap:** the conflict check is a UX convenience, not a transaction. Two renters can still both pass the check and both get accepted in quick succession. Closing that for real needs a Cloud Function doing accept + reserve as a server-side transaction — worth it before real money is on the line, not necessary for a low-volume MVP.
- Dashboard request lists are real-time (`onSnapshot`) — accept/decline/cancel reflects immediately across tabs/devices.

### Security rules

Deploy `firestore.rules` via **Firebase Console → Firestore → Rules → Publish** (or `firebase deploy --only firestore:rules`) — **this step is required every time the rules file changes**. On top of collection-specific validation, they also:
- Prevent a listing owner from forging `rating`/`reviewCount` on their own listing.
- Lock `rentalRequests` status transitions to exactly what the owner/renter are each allowed to do.
- Keep `users.email`/`createdAt` immutable after signup.
- Restrict `conversations` and `supportTickets` (and their `messages` subcollections) to participants only, with a `resource == null` fallback so checking "does this exist yet" never itself gets denied.
- Gate `admin.html` functionality — including listing moderation and reading any rental request — via `isStaff()`, which checks for a `staff/{uid}` doc that only a human with console access can create.
- Let either the owner or staff attach pickup/return condition photos to a rental, capped at 20 each.

Treat this as a strong starting point, not a final audit.

---

## 5. Firebase Storage (optional next step)

Photos are pasted URLs for now (`create-listing.html`, and it'd be natural to add a profile-photo uploader to `settings.html` and `admin.js`'s staff-identity editor too). To move to direct uploads: Storage → Get started, same region as Firestore, store at `listings/{listingId}/{imageId}.jpg` / `users/{uid}/profile.jpg`, and restrict write rules to the relevant owner.

---

## 6. Frontend structure

```text
js/
  firebase-config.js   Your Firebase Web App config (not secret)
  firebase.js            Initializes app/auth/db/storage + Google/Apple providers
  categories.js          Static category/subcategory taxonomy
  auth.js                 Email/password + Google + Apple sign-in (login.html)
  header-auth.js          Account dropdown, unread badge, staff-admin link, fluid sign-in/out, page guards
  listings.js              Listings CRUD, booked-date ranges, conflict check, staff "all listings" query
  rentals.js                Rental request CRUD, real-time subscriptions, deposit ledger, pickup/return photos
  messages.js                Peer conversations + real-time messages
  reviews.js                  Submit/fetch reviews, live average-rating computation
  support.js                  Support tickets: create, subscribe, reply, claim, staff profile
  payments.js                  Client for payments-worker/ (optional — see §10)
  payments-config.js            PAYMENTS_WORKER_URL / STRIPE_PUBLISHABLE_KEY (optional)
  admin-users.js                Client for admin-worker/ — user account management
  admin-config.js               ADMIN_WORKER_URL
  help-content.js                Help Center article/category data
  app.js                   Homepage: featured listings
  search.js                 Search/browse page
  product.js                 Product page: request-to-rent, conflict check, message owner, owner rating
  create-listing.js          "List an item" form — also handles editing via ?id=
  settings.js                  Settings: profile editing, account info, sign out
  dashboard.js                 Manage listings, live requests, accept/decline/review, deposit + photo docs
  profile.js                    Public profile: star rating + reviews + active listings
  messages-page.js              Peer messages: conversation list + thread
  support-page.js                End-user support: ticket list + new ticket + thread
  help.js                         Help Center: home/category/article/search views
  admin.js                        Staff admin panel: Tickets / Users / Listings sections

payments-worker/    Optional Cloudflare Worker for real Stripe test-mode deposit holds — see §10
admin-worker/       Cloudflare Worker for staff user-account management — see §11

Pages: index.html, about.html, search.html, product.html, login.html,
       create-listing.html, settings.html, dashboard.html, messages.html,
       profile.html, help.html, support.html, admin.html, 404.html
```

---

## 7. What to build next

1. **Finish the Stripe Elements integration** in `product.js` (see §10) if real deposit holds matter to you — the Worker side is done, only the card-collection UI at booking time is left.
2. **Server-side booking transactions** — close the double-booking race described in §4 with a Cloud Function.
3. **A real scheduled job for the overdue-deposit rule** — moves `applyOverdueDepositRule()` from "runs when the owner's dashboard loads" to a proper background job. Needs Blaze.
4. **Direct photo uploads** to Storage instead of pasted URLs — listing photos, pickup/return/damage-claim photos, profile/staff photos all currently take a pasted link.
5. **Notifications** — for new messages/tickets/accepted requests/deposit claims. Real-time listeners already surface this live while someone's on the site; reaching them while they're away needs Cloud Functions + FCM or email.
6. **Aggregate rating caching** — profiles compute the star average live from every review each time, which is honest but won't scale past a few hundred reviews per person. A Cloud Function trigger maintaining a cached `rating`/`reviewCount` on `users/{uid}` would fix that without reintroducing the "client could forge it" problem.
7. **Ticket priority/categories**, file attachments, and staff notifications for the support desk.
8. **Revisit auto-approved damage claims once volume grows** — right now an owner's claim is applied as submitted, no review step, per an earlier call. Worth reconsidering if disputes/chargebacks become common — the support-ticket contest path is the safety valve for now, not a formal review queue.
9. **Clean up Firestore data when an account is deleted** — `admin-worker/`'s delete-account action removes the Firebase Auth login only; their listings, reviews, and messages stay behind. Fine for now, but worth a real answer (anonymize vs. cascade-delete) before this handles real users at scale.
10. **Paginate the Users/Listings tabs** — both currently load in one page-sized batch; fine for a small marketplace, will need real pagination UI once either collection grows past a few hundred.

### Important architecture note

Never put Firebase **Admin SDK** credentials or a service-account JSON file in this frontend or in GitHub.

---

## Project status

- Homepage, search, filters, categories, product pages: working
- Auth: email/password + Google + Apple, fluid dropdown sign-in/out
- Listings: create/edit/hide/delete, deposit amount, working — staff can also moderate any listing
- Rentals: request/accept/decline/cancel/complete, Timestamp dates, conflict check, working
- Deposits & damage claims: ledger layer working (see §9), optional real Stripe test-mode holds available but not fully wired up (see §10) — **no real money moves by default**
- Pickup/return condition photos: working, alongside existing damage-claim photos
- Messaging: real-time, working
- Star ratings & reviews: person-to-person, live-computed, working — listing cards don't show a fake rating
- Staff support desk: tickets, live chat, staff identity, working
- Staff user management: browse/search accounts, disable/enable, force sign-out, password reset email, delete — **new this round**, needs `admin-worker/` deployed
- Staff audit log: working, staff-readable
- Help Center: working, links to Support
- Settings, Dashboard: working
- Firestore security rules: hardened, including staff listing/rental access and pickup/return photo rules — **redeploy them, this round changed the rules again**
- Photo uploads to Storage (still URL-based everywhere), real payments end-to-end, server-side booking transactions, scheduled jobs, notifications, Firestore cleanup on account deletion: not yet included
