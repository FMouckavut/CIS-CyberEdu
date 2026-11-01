// Přepínač: true = pořadí obrázků se na začátku náhodně zamíchá.
const ZAMICHAT = false;

// Panel „Ověřovací nástroje“ – nástroje se otevírají v nové záložce. ikona = obsah SVG (viewBox 0 0 24 24).
const NASTROJE = [
  { ikona: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.4-4.4"/>', nazev: "Google Lens", url: "https://lens.google.com/", popis: "Zpětné vyhledávání: zjistí, kde se obrázek na internetu objevil dříve." },
  { ikona: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', nazev: "TinEye", url: "https://tineye.com/", popis: "Zpětné vyhledávání: řadí výskyty podle data, což usnadní dohledání nejstaršího zdroje." },
  { ikona: '<path d="M12 3l7.5 3v5.5c0 4.5-3.2 7.8-7.5 9.5-4.3-1.7-7.5-5-7.5-9.5V6z"/><path d="M9 12l2 2 4-4"/>', nazev: "Content Credentials Verify", url: "https://contentcredentials.org/verify", popis: "Údaje o původu obrázku: zobrazí, zda a jakým AI nástrojem byl obrázek vytvořen, pokud obsahuje CC údaje." },
  { ikona: '<path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/><circle cx="12" cy="12" r="3"/>', nazev: "Hive AI Detector", url: "https://hivedetect.ai/", popis: "AI detektor: odhadne pravděpodobnost, že obrázek vytvořila AI." }
];

// Pomocník do konzole prohlížeče: zakoduj("NovyText") → hodnota pro "vlajka" v images.json.
function zakoduj(text) {
  return btoa(text);
}

const $ = (id) => document.getElementById(id);
const svg = (obsah) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${obsah}</svg>`;

let IMAGES = [];
let TEXT_SKUTECNA = "";
let VLAJKA = "";
let total = 0;

let fronta = [];
let odpovezeno = false;
let posledniSpravne = false;
let pokusy = 0;
let spravne = 0;
const spatneIds = new Set();

// ---------- Panel nástrojů ----------
$("tools-list").innerHTML = NASTROJE.map((n) => `
  <li><a class="tool" href="${n.url}" target="_blank" rel="noopener noreferrer">
    ${svg(n.ikona)}
    <span class="tool-text"><strong>${n.nazev}</strong><small>${n.popis}</small></span>
    ${svg('<path d="M14 4h6v6M20 4l-8 8M18 14v6H4V6h6"/>')}
  </a></li>`).join("");

// ---------- Načtení dat ----------
fetch("images.json")
  .then((r) => {
    if (!r.ok) throw new Error(r.status);
    return r.json();
  })
  .then((data) => {
    IMAGES = data.obrazky;
    TEXT_SKUTECNA = data.textSkutecna;
    VLAJKA = data.vlajka;
    total = IMAGES.length;
    document.querySelectorAll(".js-total").forEach((el) => (el.textContent = total));
    $("bar").setAttribute("aria-valuemax", total);
    $("start").disabled = false;
  })
  .catch(() => {
    $("load-error").hidden = false;
  });

// ---------- Hra ----------
function start() {
  fronta = IMAGES.slice();
  if (ZAMICHAT) {
    for (let i = fronta.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [fronta[i], fronta[j]] = [fronta[j], fronta[i]];
    }
  }
  $("intro").hidden = true;
  $("game").hidden = false;
  $("status").hidden = false;
  $("bar").hidden = false;
  zobraz();
}

function zobraz() {
  const obr = fronta[0];
  odpovezeno = false;
  $("photo").src = obr.soubor;
  $("photo").alt = obr.alt;
  $("download").href = obr.soubor;
  $("download").setAttribute("download", obr.soubor.split("/").pop());
  $("figure").className = "figure enter";
  $("feedback").className = "feedback";
  $("feedback").textContent = "";
  document.querySelectorAll(".btn-answer").forEach((b) => (b.disabled = false));
  $("next").hidden = true;
  aktualizujPrubeh();
}

function aktualizujPrubeh() {
  $("done").textContent = spravne;
  $("wrong").textContent = pokusy - spravne;
  $("bar-fill").style.width = (spravne / total) * 100 + "%";
  $("bar").setAttribute("aria-valuenow", spravne);
}

function odpovez(volba) {
  if (odpovezeno || $("game").hidden) return;
  odpovezeno = true;
  pokusy++;
  const obr = fronta[0];
  posledniSpravne = obr.odpoved === volba;

  document.querySelectorAll(".btn-answer").forEach((b) => (b.disabled = true));
  $("figure").className = "figure " + (posledniSpravne ? "ok" : "bad");
  $("feedback").className = "feedback " + (posledniSpravne ? "ok" : "bad");
  $("feedback").innerHTML = posledniSpravne
    ? svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>') + "Správně"
    : svg('<path d="M6 6l12 12M18 6L6 18"/>') + "Nesprávně";
  if (posledniSpravne) spravne++;
  // Po odpovědi ukázat verzi s vyznačenými chybami (stažení dál nabízí originál).
  if (obr.napoveda) $("photo").src = obr.napoveda;
  aktualizujPrubeh();
  $("next").hidden = false;
  $("next").focus();

  if (!posledniSpravne) {
    spatneIds.add(obr.id);
    if (obr.odpoved === "ai") otevriModal("Obrázek vytvořený AI", obr.vysvetleni);
    else otevriModal("Skutečná fotografie", TEXT_SKUTECNA);
  }
}

function dalsi() {
  if (!odpovezeno || $("modal").open) return;
  const obr = fronta.shift();
  if (!posledniSpravne) fronta.push(obr);
  if (fronta.length) zobraz();
  else konec();
}

function konec() {
  $("game").hidden = true;
  $("end").hidden = false;
  $("flag").textContent = "FLAG(" + atob(VLAJKA) + ")";
  $("stat-attempts").textContent = pokusy;
  $("stat-first").textContent = total - spatneIds.size;
  $("end-title").focus();
}

$("start").addEventListener("click", start);
$("next").addEventListener("click", dalsi);
document.querySelectorAll(".btn-answer").forEach((b) =>
  b.addEventListener("click", () => odpovez(b.dataset.answer)));

let casovacKopirovani;
$("copy").addEventListener("click", async () => {
  const text = $("flag").textContent;
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    // Záloha pro prohlížeče, kde Clipboard API není dostupné.
    getSelection().selectAllChildren($("flag"));
    document.execCommand("copy");
  }
  $("copy-label").textContent = "Zkopírováno";
  clearTimeout(casovacKopirovani);
  casovacKopirovani = setTimeout(() => ($("copy-label").textContent = "Zkopírovat"), 2000);
});

// ---------- Modální okno ----------
function otevriModal(nadpis, text) {
  $("modal-title").textContent = nadpis;
  $("modal-text").textContent = text;
  $("modal").showModal();
}
$("modal-ok").addEventListener("click", () => $("modal").close());

// ---------- Lightbox se zoomem ----------
const lb = $("lightbox");
const lbImg = $("lb-img");
const lbStage = $("lb-stage");
let zoom = 1;
let zakladniSirka = 0;

$("open-lightbox").addEventListener("click", () => {
  lbImg.src = $("photo").src;
  lbImg.alt = $("photo").alt;
  nastavZoom(1);
  lb.showModal();
});
$("lb-close").addEventListener("click", () => lb.close());

// Klik mimo obrázek zavře, klik na obrázek přepíná přiblížení.
lb.addEventListener("click", (e) => {
  if (e.target === lbImg) nastavZoom(zoom > 1 ? 1 : 2.5, e.clientX, e.clientY);
  else if (e.target === lb || e.target === lbStage) lb.close();
});
lbStage.addEventListener("wheel", (e) => {
  e.preventDefault();
  nastavZoom(zoom * (e.deltaY < 0 ? 1.25 : 0.8), e.clientX, e.clientY);
}, { passive: false });

function nastavZoom(z, cx, cy) {
  const r = lbImg.getBoundingClientRect();
  if (zoom === 1) zakladniSirka = r.width;
  if (cx === undefined) { cx = r.left + r.width / 2; cy = r.top + r.height / 2; }
  const fx = r.width ? (cx - r.left) / r.width : 0.5;
  const fy = r.height ? (cy - r.top) / r.height : 0.5;

  zoom = Math.min(6, Math.max(1, z));
  lbImg.classList.toggle("zoomed", zoom > 1);
  lbImg.style.width = zoom > 1 ? zakladniSirka * zoom + "px" : "";

  // Bod pod kurzorem zůstane na místě.
  const n = lbImg.getBoundingClientRect();
  lbStage.scrollLeft += n.left + fx * n.width - cx;
  lbStage.scrollTop += n.top + fy * n.height - cy;
}

// ---------- Klávesnice ----------
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector("dialog[open]")) return;
  if ($("game").hidden) return;
  const k = e.key.toLowerCase();
  if (k === "r") odpovez("real");
  else if (k === "a") odpovez("ai");
  // Na tlačítku/odkazu Enter vyřeší prohlížeč sám (jinak by se akce provedla dvakrát).
  else if (k === "enter" && !e.target.closest("button, a")) dalsi();
});
