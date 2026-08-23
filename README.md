# Rentora

**Rent anything.**

Rentora is a peer-to-peer rental marketplace running on a live Firebase backend: real authentication (email/password, Google, Apple), Firestore-backed listings and rentals, real-time messaging, a person-to-person star rating system, and a Discord-style staff support desk.

---

## 8. This round: two bug fixes + a staff support system

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
                          pricePerDay, locationText, imageUrls[], rating, reviewCount,
                          available, bookedRanges[{start,end}], createdAt, updatedAt
rentalRequests/{id}      listingId, ownerId, renterId, startDate (Timestamp), endDate (Timestamp),
                          totalPrice, status (pending|accepted|declined|cancelled|completed),
                          createdAt, updatedAt
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
```

### Renting: fluid and secured, with one honest gap

- Dates are Firestore `Timestamp`s, letting rules validate `endDate > startDate` directly.
- Availability lives on the listing (`bookedRanges[]`), not by querying other people's private requests — `js/dashboard.js` appends to it when an owner accepts, and `hasDateConflict()` in `js/listings.js` reads it to warn renters before they submit.
- The `rentalRequests` create rule cross-checks the listing itself: a request can't be forged against a delisted item or the wrong owner.
- **The honest gap:** the conflict check is a UX convenience, not a transaction. Two renters can still both pass the check and both get accepted in quick succession. Closing that for real needs a Cloud Function doing accept + reserve as a server-side transaction — worth it before real money is on the line, not necessary for a low-volume MVP.
- Dashboard request lists are real-time (`onSnapshot`) — accept/decline/cancel reflects immediately across tabs/devices.

### Security rules

Deploy `firestore.rules` via **Firebase Console → Firestore → Rules → Publish** (or `firebase deploy --only firestore:rules`) — **this step is required every time the rules file changes**, including the fixes in §8. On top of collection-specific validation, they also:
- Prevent a listing owner from forging `rating`/`reviewCount` on their own listing.
- Lock `rentalRequests` status transitions to exactly what the owner/renter are each allowed to do.
- Keep `users.email`/`createdAt` immutable after signup.
- Restrict `conversations` and `supportTickets` (and their `messages` subcollections) to participants only, with a `resource == null` fallback so checking "does this exist yet" never itself gets denied.
- Gate `admin.html` functionality via `isStaff()`, which checks for a `staff/{uid}` doc that only a human with console access can create.

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
  listings.js              Listings CRUD, booked-date ranges, conflict check
  rentals.js                Rental request CRUD + real-time dashboard subscriptions
  messages.js                Peer conversations + real-time messages (fixed this round — see §8)
  reviews.js                  Submit/fetch reviews, live average-rating computation
  support.js                  Support tickets: create, subscribe, reply, claim, staff profile
  app.js                   Homepage: featured listings
  search.js                 Search/browse page
  product.js                 Product page: request-to-rent, conflict check, message owner, owner rating
  create-listing.js          "List an item" form — also handles editing via ?id=
  settings.js                  Settings: profile editing, account info, sign out
  dashboard.js                 Manage listings, live requests, accept/decline/review
  profile.js                    Public profile: star rating + reviews + active listings
  messages-page.js              Peer messages: conversation list + thread
  support-page.js                End-user support: ticket list + new ticket + thread
  admin.js                        Staff admin panel: ticket queue, claim/respond, staff identity

Pages: index.html, about.html, search.html, product.html, login.html,
       create-listing.html, settings.html, dashboard.html, messages.html,
       profile.html, help.html, support.html, admin.html, 404.html
```

---

## 7. What to build next

1. **Server-side booking transactions** — close the double-booking race described in §4 with a Cloud Function.
2. **Direct photo uploads** to Storage instead of pasted URLs.
3. **Payments** — Stripe Connect. Never process card numbers in the frontend.
4. **Notifications** — for new messages/tickets/accepted requests. Real-time listeners already surface this live while someone's on the site; reaching them while they're away needs Cloud Functions + FCM or email.
5. **Aggregate rating caching** — profiles compute the star average live from every review each time, which is honest but won't scale past a few hundred reviews per person. A Cloud Function trigger maintaining a cached `rating`/`reviewCount` on `users/{uid}` would fix that without reintroducing the "client could forge it" problem.
6. **Ticket priority/categories**, file attachments, and staff notifications for the support desk.

### Important architecture note

Never put Firebase **Admin SDK** credentials or a service-account JSON file in this frontend or in GitHub.

---

## Project status

- Homepage, search, filters, categories, product pages: working
- Auth: email/password + Google + Apple, fluid dropdown sign-in/out
- Listings: create/edit/hide/delete, working
- Rentals: request/accept/decline/cancel/complete, Timestamp dates, conflict check, working
- Messaging: real-time, **fixed this round** (see §8)
- Star ratings & reviews: person-to-person, live-computed, working — listing cards no longer show a fake rating
- Staff support desk: new this round — tickets, live chat, staff identity, admin queue
- Help Center: working, now links to Support
- Settings, Dashboard: working
- Firestore security rules: hardened, including the conversation existence-check fix and new staff/ticket rules — **redeploy them if you haven't since this round**
- Photo uploads to Storage, server-side booking transactions, payments, notifications: not yet included
