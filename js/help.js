import { HELP_CATEGORIES, findArticle, findCategory, searchArticles } from "./help-content.js";

const bodyEl = document.getElementById("helpBody");
const crumbsEl = document.getElementById("helpBreadcrumbs");
const heroTitle = document.getElementById("helpHeroTitle");
const searchInput = document.getElementById("helpSearch");

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function setCrumbs(parts) {
  if (!parts.length) { crumbsEl.classList.add("hidden"); crumbsEl.innerHTML = ""; return; }
  crumbsEl.classList.remove("hidden");
  crumbsEl.innerHTML = parts.map((p, i) => {
    const isLast = i === parts.length - 1;
    return isLast
      ? `<span>${escapeHtml(p.label)}</span>`
      : `<a href="${p.href}">${escapeHtml(p.label)}</a><span class="crumb-sep">/</span>`;
  }).join("");
}

function articleRow(category, article, showCategory) {
  return `<a class="help-article-row" href="help.html?article=${article.id}">
    <div>
      <h3>${escapeHtml(article.title)}</h3>
      <p>${escapeHtml(article.summary)}</p>
    </div>
    ${showCategory
      ? `<span class="help-article-tag">${category.icon} ${escapeHtml(category.title)}</span>`
      : `<span class="help-article-arrow">→</span>`}
  </a>`;
}

// A hand-picked handful spanning different categories, shown on the home view.
function popularArticles() {
  const picks = [
    ["renting", "request-rental"],
    ["listing", "how-to-list"],
    ["deposits", "how-deposits-work"],
    ["reviews", "how-ratings-work"],
    ["account", "whats-public"],
    ["getting-started", "create-account"]
  ];
  return picks
    .map(([catId, articleId]) => {
      const category = findCategory(catId);
      const article = category?.articles.find(a => a.id === articleId);
      return article ? { category, article } : null;
    })
    .filter(Boolean);
}

function renderHome() {
  heroTitle.textContent = "Hi. How can we help?";
  setCrumbs([]);
  bodyEl.innerHTML = `
    <div class="help-category-grid">
      ${HELP_CATEGORIES.map(c => `
        <a class="help-category-card" href="help.html?cat=${c.id}">
          <div class="help-category-icon">${c.icon}</div>
          <h3>${escapeHtml(c.title)}</h3>
          <p>${escapeHtml(c.description)}</p>
          <span class="help-category-count">${c.articles.length} article${c.articles.length === 1 ? "" : "s"}</span>
        </a>
      `).join("")}
    </div>
    <h2 class="help-section-title">Popular articles</h2>
    <div class="help-article-list">
      ${popularArticles().map(({ category, article }) => articleRow(category, article)).join("")}
    </div>
  `;
}

function renderCategory(catId) {
  const category = findCategory(catId);
  if (!category) {
    setCrumbs([{ label: "Help Center", href: "help.html" }]);
    bodyEl.innerHTML = `<p class="state-message">That section doesn't exist. <a href="help.html">Back to Help Center</a></p>`;
    return;
  }
  heroTitle.textContent = category.title;
  setCrumbs([{ label: "Help Center", href: "help.html" }, { label: category.title }]);
  bodyEl.innerHTML = `<div class="help-article-list">${category.articles.map(a => articleRow(category, a)).join("")}</div>`;
}

function renderArticle(articleId) {
  const found = findArticle(articleId);
  if (!found) {
    setCrumbs([{ label: "Help Center", href: "help.html" }]);
    bodyEl.innerHTML = `<p class="state-message">That article doesn't exist. <a href="help.html">Back to Help Center</a></p>`;
    return;
  }
  const { category, article } = found;
  heroTitle.textContent = category.title;
  setCrumbs([
    { label: "Help Center", href: "help.html" },
    { label: category.title, href: `help.html?cat=${category.id}` },
    { label: article.title }
  ]);

  const related = category.articles.filter(a => a.id !== article.id).slice(0, 3);
  bodyEl.innerHTML = `
    <article class="help-article">
      <span class="help-article-category">${category.icon} ${escapeHtml(category.title)}</span>
      <h1>${escapeHtml(article.title)}</h1>
      ${article.body.map(p => `<p>${escapeHtml(p)}</p>`).join("")}
    </article>
    ${related.length ? `
      <h2 class="help-section-title">More in ${escapeHtml(category.title)}</h2>
      <div class="help-article-list">${related.map(a => articleRow(category, a)).join("")}</div>
    ` : ""}
  `;
}

function renderSearch(q) {
  heroTitle.textContent = "Search results";
  setCrumbs([{ label: "Help Center", href: "help.html" }, { label: `"${q}"` }]);
  const results = searchArticles(q);
  bodyEl.innerHTML = results.length
    ? `<div class="help-article-list">${results.map(({ category, article }) => articleRow(category, article, true)).join("")}</div>`
    : `<p class="state-message">No articles match "${escapeHtml(q)}". <a href="support.html?new=1">Open a ticket</a> and we'll help directly.</p>`;
}

function render() {
  const params = new URLSearchParams(location.search);
  const q = params.get("q") || "";
  const catId = params.get("cat");
  const articleId = params.get("article");

  searchInput.value = q;

  if (q) renderSearch(q);
  else if (articleId) renderArticle(articleId);
  else if (catId) renderCategory(catId);
  else renderHome();

  wireInternalLinks();
}

// Intercepts clicks on help.html?... links inside the content area and the
// breadcrumb trail so navigating around the Help Center feels instant
// (no full page reload) while still leaving real, shareable URLs.
function wireInternalLinks() {
  document.querySelectorAll(".help-shell a[href^='help.html'], .help-breadcrumbs a[href^='help.html']").forEach(a => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const url = new URL(a.href);
      history.pushState(null, "", url.pathname + url.search);
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

searchInput.addEventListener("input", () => {
  const q = searchInput.value;
  const url = new URL(location.href);
  if (q.trim()) url.searchParams.set("q", q); else url.searchParams.delete("q");
  url.searchParams.delete("cat");
  url.searchParams.delete("article");
  history.replaceState(null, "", url.pathname + url.search);
  render();
});

window.addEventListener("popstate", render);

render();
