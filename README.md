# Rentora

**Rent anything.**

Rentora is a clean, Airbnb-inspired peer-to-peer rental marketplace. The frontend now runs on a **live Firebase backend**: real email/password + Google authentication, and listings/rental requests read from and written to Firestore instead of a hardcoded demo array.

- Responsive homepage, search, and product pages backed by Firestore
- Real Firebase Authentication (email/password, Google, **and Apple**), with an account dropdown that updates in place instead of full-page reloads
- "List an item" flow (also doubles as the edit flow) that writes real `listings` documents
- Rental request flow with a client-side date-conflict check and server-enforced validation
- **Real-time dashboard** — manage your own listings (edit, hide, delete) and track rental requests you've sent or received (accept/decline/cancel), updating live via `onSnapshot`
- **Messaging** — a direct conversation thread between renter and owner per listing, real-time, with an unread badge in the header
- **Star ratings & reviews** — after a rental is marked complete, both sides can rate and review each other; a public profile page shows the resulting average
- **Settings** — edit your public profile, see account info, sign out
- **Help Center** — a searchable FAQ
- A 404 page for GitHub Pages
- Firestore security rules with field validation, status-flow enforcement, and cross-document checks (e.g. a rental request can't be created against a delisted item)
- GitHub Pages-friendly static frontend (no build step — plain ES modules)

---

## 1. Put it on GitHub

1. Create a new GitHub repository, for example `rentora`.
2. Upload everything in this folder, keeping the structure intact:
   - `index.html`, `about.html`, `login.html`, `search.html`, `product.html`, `create-listing.html`
   - `css/`
   - `js/`
3. In GitHub, go to **Settings → Pages** → **Build and deployment** → **Deploy from a branch** → select `main` / `/ (root)` → Save.

For local testing, use a local server (e.g. VS Code Live Server) rather than opening `index.html` directly — the site now uses ES module `<script type="module">` tags, which most browsers block over the `file://` protocol.

---

## 2. Firebase project

Your Firebase Web App config already lives in `js/firebase-config.js`. That object (`apiKey`, `authDomain`, etc.) is **not a secret** — it identifies your project to Firebase's servers, it doesn't authorize access on its own. Your Firestore/Storage security rules are what actually protect data, so keep those locked down instead of trying to hide this file.

If you ever need to point this frontend at a different Firebase project, replace the values in `js/firebase-config.js` with the config from **Project settings → Your apps → Web app** in the Firebase console.

---

## 3. Authentication

### Email/Password

1. Firebase Console → **Build → Authentication → Get started**.
2. **Sign-in method** → enable **Email/Password**.

### Google Sign-In

1. Same **Sign-in method** tab → enable **Google**.
2. Set a support email (required by Google's consent screen).
3. Go to **Authentication → Settings → Authorized domains** and make sure both `localhost` (for local dev) and your GitHub Pages domain (e.g. `yourname.github.io`) are listed. `signInWithPopup` will fail with `auth/unauthorized-domain` on any domain not in this list.

### Apple Sign-In

This one has real setup outside of Firebase, on Apple's side — it can't be done from code alone:

1. You need a paid **Apple Developer Program** membership.
2. In the Apple Developer portal: create an **App ID** with "Sign in with Apple" enabled, then a **Services ID** (this becomes the client ID Firebase uses), and register Firebase's return URL against that Services ID.
3. Create a **Sign in with Apple private key** (Certificates, Identifiers & Profiles → Keys) and note the Key ID and your Team ID.
4. Firebase Console → Authentication → Sign-in method → enable **Apple**, and paste in the Services ID, Team ID, Key ID, and the private key.
5. Make sure the same authorized domains from the Google section above are set — Apple's popup flow needs them too.

Once that's done, no further code changes are needed — `js/firebase.js` already builds an `OAuthProvider("apple.com")` with the `email`/`name` scopes requested, and `js/auth.js` wires it to the "Continue with Apple" button. Apple only returns the person's name on their *very first* authorization, so `ensureUserDoc()` captures it then and falls back to the email's local part afterward.

`js/auth.js` implements all three flows via `signInWithEmailAndPassword` / `createUserWithEmailAndPassword` and `signInWithPopup()` for Google/Apple. Every path creates a matching `users/{uid}` profile document the first time someone signs in.

### Sign-in/out UX

- The header avatar is now an account dropdown (`js/header-auth.js`) — click it to reach Dashboard, Settings, or Log out, without leaving the page you're on.
- Logging out on a public page (home, search, a listing) just updates the header in place; you keep browsing. Logging out from a page that requires an account (Dashboard, Settings, List an item) sends you back to the homepage.
- Clicking "List an item" or the avatar while signed out takes you to `login.html?next=<page>` — after logging in you land back where you meant to go, not always the homepage.
- Visiting `login.html` while already signed in redirects you straight through instead of showing the form again.

---

## 4. Firestore

1. Firebase Console → **Build → Firestore Database → Create database**.
2. Start in **production mode** (the rules in `firestore.rules` cover this — don't leave it in test mode long-term).
3. Pick the closest region to your users.

### Does Firestore need collections created ahead of time?

**No.** Firestore is schemaless. A collection — and any document inside it — is created implicitly the first time you write to that path. You'll never need to manually create `users`, `listings`, `rentalRequests`, or `reviews` in the console; `createListing()` in `js/listings.js` creates the `listings` collection on its very first call, for example.

Two things worth knowing:
- An **empty** collection isn't visible in the console. If you delete the last document in a collection, the collection itself disappears from the console view (it's not literally deleted, it just has nothing to show).
- Combined queries — e.g. filtering by `available == true` **and** `category == X` **and** sorting by `createdAt` — usually need a **composite index**. To keep this MVP simple and index-free, `fetchListings()` only sends Firestore a single `where("available","==",true)` filter and does category filtering/sorting client-side. As your catalog grows past a few hundred listings, move that filtering server-side; Firestore will throw an error with a direct "create this index" link the first time you run a query that needs one.

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
```

### Renting: fluid and secured, with one honest gap

- **Dates are Firestore `Timestamp`s**, not strings — this lets rules validate `endDate > startDate` directly, and sorts correctly.
- **Availability lives on the listing**, not by querying other people's requests. When an owner accepts a request, `js/dashboard.js` calls `addBookedRange()` to append the accepted range to `listings/{id}.bookedRanges` — a public, single-document field. This is what lets `hasDateConflict()` in `js/listings.js` warn a renter about overlapping dates *without* needing read access to other renters' private `rentalRequests` (which the rules correctly forbid).
- **The `rentalRequests` create rule now checks the listing itself**: a request can't be forged against a delisted (`available: false`) item, and the `ownerId` on the request must actually match the listing's real owner.
- **The honest gap:** the conflict check above is a UX convenience, not a transaction. Two renters can still both pass the check and both get accepted by the owner in quick succession — Firestore security rules validate one write in isolation, they can't atomically check-and-reserve across documents. Closing that gap for real needs a Cloud Function running the accept + booked-range update as a server-side transaction. Worth doing before this handles real money changing hands; not necessary for a low-volume MVP where the owner just manually declines the second request.
- The dashboard's request lists (`js/rentals.js` → `subscribeRequestsAsRenter/Owner`) are **live** (`onSnapshot`), so accept/decline/cancel — from this tab, another tab, or another device — shows up immediately without a reload.

### Messaging

- One thread per (listing, renter) pair, id'd deterministically so "Message owner" always reopens the same conversation. `js/messages.js` has `startOrOpenConversation()`, `subscribeConversations()`, `subscribeMessages()`, and `sendMessage()`.
- Rules restrict both the `conversations` doc and its `messages` subcollection to the two `participants` — nobody else can read or write into a thread they're not part of, and the participant list itself is immutable after creation.
- The header's unread badge (`js/header-auth.js`) subscribes to all of a signed-in person's conversations and compares `lastMessageAt` against their own `lastRead` entry, live.

### Star ratings & reviews

- After an owner marks a rental `completed`, both sides get a "Review" button on the dashboard (`js/dashboard.js`) that opens a star-picker + text dialog (`js/reviews.js` → `submitReview()`).
- Review documents use a **deterministic id** (`{rentalRequestId}_{authorId}`), enforced in `firestore.rules` — so each person gets exactly one review per completed rental, and resubmitting the form edits it instead of creating a duplicate.
- The rule for creating/editing a review re-checks the referenced `rentalRequests` doc server-side: it must be `completed`, and the author/target must actually be that rental's renter and owner. You can't review someone you never transacted with.
- Rather than trusting a stored aggregate rating (which a client could forge without a Cloud Function to recompute it), `js/profile.js` computes the average live from `fetchReviewsForUser()` each time a profile loads. Slightly more reads, but the number shown is never fake.
- `profile.html?uid=<uid>` is the public page this powers — linked from every listing's "Listed by" line and from the dropdown's "View my profile".

### Security rules

Deploy the rules in `firestore.rules` (Firebase Console → Firestore → Rules, or via the Firebase CLI: `firebase deploy --only firestore:rules`). On top of what's described above, they also:

- Validate field types/sizes on `create` (title length, price > 0, rating range, etc.) instead of trusting the client blindly.
- Prevent a listing owner from forging `rating`/`reviewCount` on their own listing during an edit.
- Lock `rentalRequests` status transitions down: only the **owner** can move a request to `accepted` / `declined` / `completed`, only the **renter** can `cancel` a still-`pending` request, and neither can touch any other field once the request exists.
- Keep `users.email` and `users.createdAt` immutable after account creation.

Treat this as a strong starting point, not a final audit — review it against your actual product rules before real money is involved.

---

## 5. Firebase Storage (optional next step)

`create-listing.html` currently takes photos as comma-separated URLs to keep the MVP simple. To let owners upload photos directly:

1. Firebase Console → **Build → Storage → Get started**, same region as Firestore.
2. Store images at paths like `listings/{listingId}/{imageId}.jpg` and `users/{uid}/profile.jpg`.
3. Add `uploadBytes`/`getDownloadURL` calls (from `firebase/storage`) in `js/create-listing.js`, and restrict write rules to the listing's owner.

---

## 6. Frontend structure

```text
js/
  firebase-config.js   Your Firebase Web App config (not secret)
  firebase.js            Initializes app/auth/db/storage + Google/Apple providers
  categories.js          Static category/subcategory taxonomy
  auth.js                 Email/password + Google + Apple sign-in (login.html)
  header-auth.js          Account dropdown, unread-messages badge, fluid sign-in/out, page guards
  listings.js              Firestore reads/writes for listings — incl. owner queries, edit, delete,
                            booked-date ranges, and the client-side conflict check
  rentals.js                Firestore reads/writes for rentalRequests, real-time dashboard subscriptions
  messages.js                Conversations + real-time messages subcollection
  reviews.js                  Submit/fetch reviews, live average-rating computation
  app.js                   Homepage: featured listings from Firestore
  search.js                 Search/browse page: Firestore-backed filtering
  product.js                 Product page: request-to-rent, conflict check, message owner
  create-listing.js          "List an item" form — also handles editing via ?id=
  settings.js                  Settings page: profile editing, account info, sign out
  dashboard.js                 Dashboard: manage listings, live requests, accept/decline/review
  profile.js                    Public profile page: star rating + reviews + active listings
  messages-page.js               Messages page: conversation list + active thread

Pages: index.html, about.html, search.html, product.html, login.html,
       create-listing.html, settings.html, dashboard.html, messages.html,
       profile.html, help.html, 404.html
```

### Pages added this round, and why

- **Dashboard** (`dashboard.html`) — the only place to see and manage what you've published and requested. Three tabs: your listings (edit/hide/delete), rentals you've requested (cancel while pending), and requests on your own listings (accept/decline, then review once completed).
- **Messages** (`messages.html`) — a real-time conversation list + thread between a renter and an owner, reachable from any listing or dashboard row.
- **Profile** (`profile.html?uid=`) — the public "is this person actually good?" page: star rating, review list, and their active listings.
- **Settings** (`settings.html`) — edits the `users/{uid}` profile doc (display name, location, bio, photo) and shows read-only account info (email, sign-in method, member-since date).
- **Help Center** (`help.html`) — a searchable, static FAQ. No backend needed; it's plain `<details>` accordions filtered by a small inline script.
- **404** (`404.html`) — GitHub Pages serves this automatically for unmatched paths once it's in the repo root.

---

## 7. What to build next

1. **Direct photo uploads** to Firebase Storage (see §5) instead of pasted URLs — this would touch both `create-listing.html`/`create-listing.js` and a profile-photo uploader in `settings.html`.
2. **Server-side booking transactions** — close the double-booking race condition described in §4 with a Cloud Function that accepts a request and reserves its date range atomically.
3. **Payments** — Stripe Connect for marketplace payouts. Never process card numbers directly in the frontend.
4. **Trust & safety** — report/block flows, identity checks where appropriate, admin moderation. The one-review-per-completed-rental system is a start, but there's no reporting or blocking mechanism yet.
5. **Push/email notifications** — for new messages, accepted requests, etc. Firestore's real-time listeners already surface this live while someone's on the site; notifying them while they're away needs Cloud Functions + FCM or an email provider.
6. **Aggregate rating caching** — `profile.js` computes a person's star average live from every review each time their profile loads, which is honest but won't scale past a few hundred reviews per person. A Cloud Function trigger that maintains a cached `rating`/`reviewCount` on `users/{uid}` (the same pattern already reserved-but-unused on `listings`) would fix that without reintroducing the "client could forge it" problem, since only the trusted function would write the aggregate.

### Important architecture note

Never put Firebase **Admin SDK** credentials or a service-account JSON file in this frontend or in GitHub. Admin credentials belong only on a trusted server (Cloud Functions, or your own backend).

---

## Project status

- Homepage, search, filters, categories, product pages: working, Firestore-backed
- Auth: real Firebase Auth, email/password + Google + Apple, fluid dropdown sign-in/out
- Listing creation & editing: working, writes to Firestore
- Rental requests: working — Timestamp dates, client-side conflict check, server-validated against the listing
- Dashboard: working — manage listings, live-updating requests, accept/decline/cancel/complete
- Messaging: working — real-time per-listing conversations, unread badge
- Star ratings & reviews: working — one review per completed rental, public profile pages
- Help Center: working — searchable static FAQ
- Settings: working — edit profile, view account info, sign out
- Firestore security rules: tightened (see §4), including cross-document checks on rental requests and reviews
- Photo uploads to Storage: not yet — URLs only
- True double-booking prevention (server-side transaction), payments, notifications, moderation tools: not yet included
