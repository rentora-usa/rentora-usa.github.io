// Static Help Center content. Each article's `body` is an array of
// paragraphs (plain text — rendered and escaped by help.js, not raw HTML)
// so writing new articles never needs touching help.js itself.

export const HELP_CATEGORIES = [
  {
    id: "getting-started",
    title: "Getting Started",
    icon: "🚀",
    description: "Create an account and find your way around.",
    articles: [
      {
        id: "create-account",
        title: "Creating an account",
        summary: "Email/password, Google, or Apple — pick what's fastest.",
        body: [
          "You can sign up with an email and password, or use the \"Continue with Google\" or \"Continue with Apple\" buttons for one-tap sign-in — click the account icon in the top right and choose Sign up.",
          "Whichever way you sign up, Rentora creates a profile for you automatically. You can fill in your display name, bio, location, and photo afterward from Settings.",
          "You don't need an account to browse or search listings — only to message an owner, request a rental, or list something yourself."
        ]
      },
      {
        id: "google-apple-signin",
        title: "Signing in with Google or Apple",
        summary: "One-tap sign-in, no password to remember.",
        body: [
          "On the login page, click \"Continue with Google\" or \"Continue with Apple\" instead of filling in the email/password form. You'll be asked to confirm through Google's or Apple's own sign-in window.",
          "The first time you do this, Rentora creates your profile using the name attached to that account. Apple only shares your name on the very first sign-in, so if you skip it there, you can still set a display name yourself in Settings."
        ]
      },
      {
        id: "browse-search",
        title: "Browsing and searching listings",
        summary: "Filter by category, price, and location.",
        body: [
          "The homepage shows categories and a handful of featured listings. Click \"Explore\" or any category to reach the full search page.",
          "From there you can filter by category, subcategory, and maximum daily price, and sort by price. Searching also matches against listing titles and descriptions, so try a few different words if your first search comes up empty."
        ]
      }
    ]
  },
  {
    id: "renting",
    title: "Renting an Item",
    icon: "📦",
    description: "Requesting, messaging, and managing a rental.",
    articles: [
      {
        id: "request-rental",
        title: "How to request a rental",
        summary: "Pick your dates and send a request to the owner.",
        body: [
          "Open a listing, choose a start and end date, and click \"Request to rent.\" This sends a request to the owner — it doesn't book the item automatically. The owner has to accept it first.",
          "You'll see the request's status (pending, accepted, or declined) from your Dashboard under \"Rentals I've requested.\" If it's accepted, those dates are locked in for you."
        ]
      },
      {
        id: "availability",
        title: "Understanding booking dates and availability",
        summary: "Why some dates can't be selected.",
        body: [
          "Once an owner accepts a request, those dates become unavailable on that listing — Rentora checks this automatically and will warn you before you submit a request that overlaps an existing booking.",
          "Because this check happens client-side rather than through a locking transaction, it's technically possible (though unlikely) for two people to both slip past the check at nearly the same moment. If that ever happens to you, message the owner directly — they'll be the one deciding which request to honor."
        ]
      },
      {
        id: "message-owner",
        title: "Messaging an owner",
        summary: "Ask questions before or after requesting.",
        body: [
          "Click \"Message owner\" on any listing to open a direct conversation — you don't need to have an active request to ask a question first.",
          "All your conversations live under \"Messages\" in the account menu, with a badge showing how many have unread replies."
        ]
      },
      {
        id: "cancel-request",
        title: "Canceling a request",
        summary: "Only possible while it's still pending.",
        body: [
          "Go to Dashboard → \"Rentals I've requested\" and click \"Cancel request\" — this only works while the request is still pending.",
          "Once an owner has accepted a request, cancellations need to be worked out directly with them — message them, or open a support ticket if you can't reach an agreement."
        ]
      }
    ]
  },
  {
    id: "listing",
    title: "Listing an Item",
    icon: "🏷️",
    description: "Publish something and manage requests.",
    articles: [
      {
        id: "how-to-list",
        title: "How to list something",
        summary: "Title, price, photos, and a description.",
        body: [
          "Click \"List an item\" in the header and fill in a title, description, category, price per day, location, and photo links. Publishing takes it live in search immediately.",
          "Photos are linked by URL for now rather than uploaded directly — paste a link to an image hosted elsewhere (or your own site) into the photo field."
        ]
      },
      {
        id: "edit-hide-listing",
        title: "Editing or hiding a listing",
        summary: "Take something out of search without deleting it.",
        body: [
          "From your Dashboard, click \"Edit\" on any listing to change its details, price, or photos.",
          "\"Hide\" takes it out of search temporarily without losing anything — click \"Show\" later to bring it back. \"Delete\" is permanent."
        ]
      },
      {
        id: "handle-requests",
        title: "Handling a rental request",
        summary: "Accept, decline, and mark rentals complete.",
        body: [
          "Go to Dashboard → \"Requests I've received.\" Accepting a request automatically blocks those dates on your listing so no one else can book over them.",
          "Once a rental period is underway, you can mark it \"Completed\" once it's over — this is also where you'd confirm the item came back cleanly or report an issue, if you set a security deposit on the listing."
        ]
      },
      {
        id: "set-deposit",
        title: "Setting a security deposit",
        summary: "An optional refundable amount for higher-value items.",
        body: [
          "When creating or editing a listing, you can set an optional security deposit. Renters see it clearly on the listing before requesting.",
          "See \"How security deposits work\" in the Deposits & Damage section for what happens with it during and after a rental."
        ]
      }
    ]
  },
  {
    id: "deposits",
    title: "Deposits & Damage",
    icon: "🛡️",
    description: "What happens if something goes wrong.",
    articles: [
      {
        id: "how-deposits-work",
        title: "How security deposits work",
        summary: "What's tracked, and what isn't charged automatically.",
        body: [
          "If a listing has a deposit, it's shown to renters as a refundable amount alongside the daily price. Rentora tracks the deposit's status through the rental — pending, released, or claimed — so both sides have a clear record.",
          "Depending on how your instance of Rentora is set up, deposits may or may not involve an actual card hold. If real payments aren't connected, nothing is ever charged automatically — deposits are recorded for reference, and owners and renters are expected to settle them directly if needed.",
          "Once a rental is accepted, the owner resolves the deposit from their Dashboard: \"Confirm clean return\" releases it, or \"Report damage\" claims some or all of it."
        ]
      },
      {
        id: "report-damage",
        title: "Reporting damage or a missing item",
        summary: "What owners can do, and what evidence to include.",
        body: [
          "From Dashboard → \"Requests I've received,\" an owner can click \"Report damage\" on a rental once it's accepted. This asks for an amount (capped at the deposit), a description of what happened, and photo links as evidence.",
          "This is applied as submitted, without a separate review step — so include enough detail and photos to back it up. If you're the renter and think a claim was unfair, use the \"Contact support\" link shown next to it to open a ticket."
        ]
      },
      {
        id: "item-not-returned",
        title: "What happens if an item isn't returned",
        summary: "The automatic overdue rule.",
        body: [
          "If a rental is still marked \"accepted\" and its deposit still unresolved more than 48 hours after the scheduled end date, Rentora automatically claims the full deposit and records the reason.",
          "This check runs when the owner's dashboard is open, so if you're an owner waiting on an overdue return, it's worth checking back a day or two after the rental was due back."
        ]
      }
    ]
  },
  {
    id: "reviews",
    title: "Reviews & Ratings",
    icon: "⭐",
    description: "How reputation works on Rentora.",
    articles: [
      {
        id: "how-ratings-work",
        title: "How star ratings work",
        summary: "Ratings are about people, not listings.",
        body: [
          "After a rental is marked completed, both the renter and the owner can leave each other a star rating and a short review. Your profile shows the average of everything you've received, so people can see whether you're reliable before renting with you.",
          "Ratings are tied to people rather than individual listings — a listing itself doesn't carry a separate star rating, since the same owner's reliability applies across everything they list."
        ]
      },
      {
        id: "write-review",
        title: "Writing a review",
        summary: "Available once a rental is marked complete.",
        body: [
          "From your Dashboard, completed rentals show a \"Review\" button. Pick a star rating and optionally add a short note about your experience.",
          "You can only review someone you actually completed a rental with — the review is tied to that specific rental request."
        ]
      },
      {
        id: "edit-review",
        title: "Editing a review",
        summary: "You get one review per rental, editable anytime.",
        body: [
          "Go back to the same completed rental in your Dashboard and click \"Edit review.\" Submitting again replaces your original review rather than adding a second one — each rental only ever produces one review per person."
        ]
      }
    ]
  },
  {
    id: "account",
    title: "Account & Privacy",
    icon: "🔒",
    description: "What's public, and how to manage your info.",
    articles: [
      {
        id: "whats-public",
        title: "What others can see about you",
        summary: "Your profile is public; your contact info isn't.",
        body: [
          "Your display name, photo, bio, general location, star rating, reviews, and active listings are visible on your public profile to anyone.",
          "Your email address and exact pickup address are never shown publicly. Exact pickup details are meant to be shared directly with the other person once a rental is confirmed."
        ]
      },
      {
        id: "update-profile",
        title: "Updating your profile",
        summary: "Name, bio, location, and photo.",
        body: [
          "Open the account menu in the top right and choose Settings. From there you can update your display name, bio, location text, and profile photo."
        ]
      },
      {
        id: "sign-out",
        title: "Signing out or switching accounts",
        summary: "One click from the account menu.",
        body: [
          "Open the account menu in the top right and choose \"Log out.\" To switch accounts, log out and then sign back in with a different email, Google account, or Apple ID."
        ]
      }
    ]
  },
  {
    id: "safety",
    title: "Safety & Trust",
    icon: "🛟",
    description: "Renting from and to people you don't know yet.",
    articles: [
      {
        id: "renting-safely",
        title: "Tips for renting safely",
        summary: "A few habits worth keeping.",
        body: [
          "Check the other person's profile — their rating, review history, and how long they've been on Rentora — before committing to a rental.",
          "Keep the conversation on Rentora's messaging rather than moving to text or email right away; it keeps a record of what was agreed on.",
          "Meet in a public or well-lit place for pickup and return when possible, especially for a first rental with someone new."
        ]
      },
      {
        id: "something-wrong",
        title: "What to do if something goes wrong",
        summary: "Message first, then escalate if needed.",
        body: [
          "If an item doesn't show up as described, isn't returned, or comes back damaged, message the other person first — most issues get sorted out directly.",
          "If that doesn't work, open a support ticket. Include the listing, the other person's name, and what happened — our team can step in from there."
        ]
      },
      {
        id: "reporting",
        title: "Reporting a problem",
        summary: "When to involve support.",
        body: [
          "Open a support ticket for anything you can't resolve directly — a disputed deposit claim, a listing that seems misleading, or behavior that made you uncomfortable.",
          "There isn't yet a separate in-app \"report\" button on profiles or listings — for now, a support ticket is the right way to flag any of this."
        ]
      }
    ]
  }
];

export function findArticle(articleId) {
  for (const cat of HELP_CATEGORIES) {
    const article = cat.articles.find(a => a.id === articleId);
    if (article) return { category: cat, article };
  }
  return null;
}

export function findCategory(categoryId) {
  return HELP_CATEGORIES.find(c => c.id === categoryId) || null;
}

export function searchArticles(query) {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const results = [];
  for (const cat of HELP_CATEGORIES) {
    for (const article of cat.articles) {
      const haystack = `${article.title} ${article.summary} ${article.body.join(" ")}`.toLowerCase();
      if (haystack.includes(q)) results.push({ category: cat, article });
    }
  }
  return results;
}
