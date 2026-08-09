# Rentora

**Rent anything.**

Rentora is a clean, Airbnb-inspired peer-to-peer rental marketplace. The frontend now runs on a **live Firebase backend**: real email/password + Google authentication, and listings/rental requests read from and written to Firestore instead of a hardcoded demo array.

- Responsive homepage, search, and product pages backed by Firestore
- Real Firebase Authentication (email/password **and** Google sign-in)
- "List an item" flow that writes real `listings` documents
- Rental request flow that writes real `rentalRequests` documents
- Firestore security rules with field validation and status-flow enforcement
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

`js/auth.js` already implements both flows via `signInWithEmailAndPassword` / `createUserWithEmailAndPassword` and `signInWithPopup(auth, googleProvider)`. Either path creates a matching `users/{uid}` profile document the first time someone signs in.

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
users/{uid}            displayName, email, photoURL, bio, location, createdAt
listings/{listingId}   ownerId, ownerName, title, description, category, subcategory,
                        pricePerDay, locationText, imageUrls[], rating, reviewCount,
                        available, createdAt, updatedAt
rentalRequests/{id}     listingId, ownerId, renterId, startDate, endDate, totalPrice,
                        status (pending|accepted|declined|cancelled|completed),
                        createdAt, updatedAt
reviews/{reviewId}      listingId, rentalRequestId, authorId, targetUserId, rating, text, createdAt
```

### Security rules

Deploy the rules in `firestore.rules` (Firebase Console → Firestore → Rules, or via the Firebase CLI: `firebase deploy --only firestore:rules`). Compared to a bare-minimum starting point, these:

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
  firebase.js           Initializes app/auth/db/storage — everything else imports from here
  categories.js         Static category/subcategory taxonomy
  auth.js                Real email/password + Google sign-in (login.html)
  header-auth.js         Reflects signed-in state in the header, on every page
  listings.js             Firestore reads/writes for listings
  app.js                  Homepage: featured listings from Firestore
  search.js               Search/browse page: Firestore-backed filtering
  product.js               Product page + rental request creation
  create-listing.js       "List an item" form → writes to Firestore
```

---

## 7. What to build next

1. **Direct photo uploads** to Firebase Storage (see §5) instead of pasted URLs.
2. **Messaging** — renter ↔ owner chat via Firestore real-time listeners (`onSnapshot`).
3. **Reviews UI** — a form on completed rentals that writes to `reviews` and recomputes the listing's `rating`/`reviewCount` (best done via a Cloud Function so clients can't forge it).
4. **Payments** — Stripe Connect for marketplace payouts. Never process card numbers directly in the frontend.
5. **Trust & safety** — report/block flows, identity checks where appropriate, admin moderation.
6. **Server-side logic** — a small set of Cloud Functions (or another trusted backend) for anything that shouldn't be client-writable directly: aggregating ratings, enforcing rental-date conflicts, sending notifications on status changes.

### Important architecture note

Never put Firebase **Admin SDK** credentials or a service-account JSON file in this frontend or in GitHub. Admin credentials belong only on a trusted server (Cloud Functions, or your own backend).

---

## Project status

- Homepage, search, filters, categories, product pages: working, Firestore-backed
- Auth: real Firebase Auth, email/password + Google
- Listing creation: working, writes to Firestore
- Rental requests: working, writes to Firestore
- Firestore security rules: tightened (see §4)
- Photo uploads to Storage: not yet — URLs only
- Reviews UI, messaging, payments: not yet included
