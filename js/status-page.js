import { subscribeComponents, subscribeIncidents, COMPONENT_STATUSES, INCIDENT_STATUSES } from "./status.js";

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function statusLabel(list, id) {
  return (list.find(s => s.id === id) || {}).label || id;
}
function fmtDateTime(ts) {
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return isNaN(d) ? "" : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

let components = [];

subscribeComponents(items => {
  components = items;
  renderBanner();
  renderComponents();
});

subscribeIncidents(items => renderIncidents(items));

function renderBanner() {
  const banner = document.getElementById("statusBanner");
  const text = document.getElementById("statusBannerText");
  const icon = document.getElementById("statusBannerIcon");

  let worst = "operational";
  if (components.some(c => c.status === "major_outage")) worst = "major_outage";
  else if (components.some(c => c.status === "partial_outage")) worst = "partial_outage";
  else if (components.some(c => c.status === "degraded")) worst = "degraded";

  const copy = {
    operational: "All systems operational",
    degraded: "Some systems are experiencing degraded performance",
    partial_outage: "Some systems are experiencing a partial outage",
    major_outage: "Rentora is experiencing a major outage"
  };

  banner.className = `status-banner status-banner-${worst}`;
  text.textContent = components.length ? copy[worst] : "No status components set up yet";
  icon.textContent = worst === "operational" ? "✓" : "!";
}

function renderComponents() {
  const el = document.getElementById("statusComponents");
  if (!components.length) {
    el.innerHTML = `<p class="state-message">Nothing to show yet.</p>`;
    return;
  }
  el.innerHTML = components.map(c => `
    <div class="status-component-row">
      <span>${escapeHtml(c.name)}</span>
      <span class="status-pill status-pill-${c.status}"><span class="status-pill-dot"></span>${escapeHtml(statusLabel(COMPONENT_STATUSES, c.status))}</span>
    </div>`).join("");
}

function renderIncidents(items) {
  const el = document.getElementById("statusIncidents");
  if (!items.length) {
    el.innerHTML = `<p class="state-message">No incidents reported.</p>`;
    return;
  }
  el.innerHTML = items.map(incident => `
    <div class="incident-card">
      <div class="incident-card-top">
        <h3>${escapeHtml(incident.title)}</h3>
        <span class="status-pill status-pill-impact-${incident.impact}">${escapeHtml(incident.impact)}</span>
      </div>
      <div class="incident-timeline">
        ${[...(incident.updates || [])].reverse().map(u => `
          <div class="incident-update">
            <div class="incident-update-top">
              <strong>${escapeHtml(statusLabel(INCIDENT_STATUSES, u.status))}</strong>
              <span class="review-date">${fmtDateTime(u.createdAt)}</span>
            </div>
            <p>${escapeHtml(u.message)}</p>
          </div>`).join("")}
      </div>
    </div>`).join("");
}
