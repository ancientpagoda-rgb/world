const populationFormatter = new Intl.NumberFormat("en-US");
const DATA_URL = "../world-data.json";

const PAGE_SIZE = 48;
let visibleLimit = PAGE_SIZE;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const headlineTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatPublishedAt(value) {
  const date = new Date(value || "");
  return Number.isFinite(date.getTime()) ? headlineTimeFormatter.format(date) : "";
}

function renderCountries(countries) {
  const root = document.querySelector("#country-list");
  const items = [];

  countries.slice(0, visibleLimit).forEach((item, index) => {
    const desc = item.description || "";
    const descClamped = desc.length > 280 ? desc.slice(0, 277) + "..." : desc;
    const headline = item.headline || "No current headline available.";
    const headlineUrl = /^https:\/\//i.test(item.headlineUrl || "")
      ? item.headlineUrl
      : item.headline
        ? `https://news.google.com/search?q=${encodeURIComponent(item.headline)}`
        : "";
    const publishedAt = formatPublishedAt(item.headlinePublishedAt);
    items.push(`
        <article class="country-row">
          <div class="country-rank">#${index + 1}</div>
          <div>
            <h2 class="country-headline">${escapeHtml(item.name)}</h2>
            <span class="country-code">${escapeHtml(item.iso3)}</span>
            <p class="country-news">${headlineUrl ? `<a href="${escapeHtml(headlineUrl)}" target="_blank" rel="noopener noreferrer nofollow">${escapeHtml(headline)}</a>` : escapeHtml(headline)}</p>
            ${publishedAt ? `<time class="headline-timestamp" datetime="${escapeHtml(item.headlinePublishedAt)}">Published ${escapeHtml(publishedAt)}</time>` : ""}
            ${descClamped ? `<p class="country-description">${escapeHtml(descClamped)}</p>` : ""}
          </div>
          <div class="country-population">
            ${populationFormatter.format(item.population)}
            <span>${escapeHtml(item.year)}</span>
          </div>
        </article>
      `);
  });

  root.innerHTML = items.join("");
  if (visibleLimit < countries.length) {
    const footer = document.createElement("div");
    footer.className = "country-list-footer";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `Show ${Math.min(PAGE_SIZE, countries.length - visibleLimit)} more countries`;
    button.addEventListener("click", () => {
      visibleLimit += PAGE_SIZE;
      renderCountries(countries);
    });
    footer.appendChild(button);
    root.appendChild(footer);
  }
}

function renderLoading() {
  const root = document.querySelector("#country-list");
  root.innerHTML = `
    <article class="country-row">
      <div class="country-rank">...</div>
      <div>
        <p class="country-headline">Loading</p>
      </div>
      <div class="country-population">...</div>
    </article>
  `;
}

function renderError() {
  const root = document.querySelector("#country-list");
  root.innerHTML = `
    <article class="country-row">
      <div class="country-rank">!</div>
      <div>
        <p class="country-headline">Could not load data.</p>
      </div>
      <div class="country-population">ERR</div>
    </article>
  `;
}

async function loadData() {
  renderLoading();

  try {
    const countries = await (await fetch(DATA_URL)).json();
    renderCountries(countries);
  } catch (err) {
    console.error("Failed to load country data:", err);
    renderError();
  }
}

loadData();
