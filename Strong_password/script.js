'use strict';

// ==========================================================================
// Konfigurace
// ==========================================================================
const MIN_LENGTH_DEFAULT = 15;
const MIN_LENGTH_MFA = 8;
const HIBP_RANGE_URL = 'https://api.pwnedpasswords.com/range/';
const HIBP_DEBOUNCE_MS = 500;   // Kontrola API se spustí až 500 ms poté, co uživatel přestane psát
const HIBP_TIMEOUT_MS = 10000;  // Zaseknutý požadavek nesmí navždy zablokovat tlačítko
const COPY_FEEDBACK_MS = 1600;

// Ikonky (prázdný čtverec / fajfka / křížek) kreslí CSS podle data-state,
// text slouží jen pro čtečky obrazovky
const STATUS_LABELS = { neutral: 'nevyhodnoceno', valid: 'splněno', invalid: 'nesplněno' };

// ==========================================================================
// Prvky stránky
// ==========================================================================
const $ = (id) => document.getElementById(id);

const pageMain = document.querySelector('main');
const passwordInput = $('password-input');
const togglePasswordBtn = $('toggle-password');
const mfaCheckbox = $('mfa-checkbox');
const lengthText = $('length-text');
const pwnedText = $('pwned-text');
const sqSelect = $('sq-select');
const sqAnswer = $('sq-answer');
const hintInput = $('hint-input');
const checkBtn = $('check-btn');
const flagTemplate = $('flag-template');

const modal = {
    root: $('result-modal'),
    content: $('result-modal').querySelector('.modal-content'),
    title: $('modal-title'),
    message: $('modal-message'),
    closeBtn: $('close-modal'),
    okBtn: $('modal-ok-btn'),
};

// ==========================================================================
// Požadavky na heslo
// ==========================================================================
let requiredMinLength = MIN_LENGTH_DEFAULT;

// Délka ve znacích tak, jak je vidí uživatel (emoji = 1 znak), ne v jednotkách UTF-16
const graphemes = 'Segmenter' in Intl ? new Intl.Segmenter('cs', { granularity: 'grapheme' }) : null;
const countChars = (text) => (graphemes ? [...graphemes.segment(text)] : [...text]).length;

// Každý požadavek: řádek v seznamu, zda je povinný, a lokální test.
// HIBP nemá lokální test - vyhodnocuje se asynchronně přes API (viz níže).
// \p{Lu} / \p{Ll} zahrnují i česká písmena (Ř, ě ...), ta se tak nepočítají jako speciální znaky.
const requirements = {
    length:  { el: $('req-length'),  mandatory: true,  test: (pw) => countChars(pw) >= requiredMinLength },
    pwned:   { el: $('req-pwned'),   mandatory: true },
    upper:   { el: $('req-upper'),   mandatory: false, test: (pw) => /\p{Lu}/u.test(pw) },
    lower:   { el: $('req-lower'),   mandatory: false, test: (pw) => /\p{Ll}/u.test(pw) },
    number:  { el: $('req-number'),  mandatory: false, test: (pw) => /\p{N}/u.test(pw) },
    special: { el: $('req-special'), mandatory: false, test: (pw) => /[^\p{L}\p{M}\p{N}\s]/u.test(pw) },
};

// state: 'neutral' (prázdný čtverec) | 'valid' (fajfka) | 'invalid' (červený křížek)
function setRequirementState(req, state) {
    req.state = state;
    req.el.dataset.state = state;
    req.el.querySelector('.req-status').textContent = STATUS_LABELS[state];
}

// Prázdné heslo -> neutrální. Splněno -> fajfka.
// Nesplněno -> povinný parametr dostane červený křížek, volitelný zůstane prázdný.
function localState(req, password) {
    if (password === '') return 'neutral';
    if (req.test(password)) return 'valid';
    return req.mandatory ? 'invalid' : 'neutral';
}

// 1. ČÁST: LOKÁLNÍ KONTROLA REGULÁRNÍMI VÝRAZY
function validatePasswordLocal(password) {
    for (const req of Object.values(requirements)) {
        if (req.test) setRequirementState(req, localState(req, password));
    }
}

// ==========================================================================
// 2. ČÁST: BEZPEČNÁ KONTROLA PROTI HIBP API (k-anonymita)
// API posíláme jen prvních 5 znaků SHA-1 hashe, zbytek porovnáváme lokálně.
// ==========================================================================
let pwnedStatus = 'idle';     // 'idle' (nevyhodnoceno) | 'safe' | 'pwned' | 'error'
let hibpTimer = null;         // Odpočet debounce
let hibpRequestId = 0;        // Pořadové číslo kontroly - starší odpovědi z API ignorujeme
let hibpCheck = Promise.resolve(); // Poslední spuštěná kontrola
let hibpCheckedPassword = ''; // Heslo, pro které byla spuštěna poslední kontrola

function setPwnedStatus(status) {
    pwnedStatus = status;
    const state = status === 'safe' ? 'valid' : status === 'pwned' ? 'invalid' : 'neutral';
    setRequirementState(requirements.pwned, state);
    // Text řádku se mění podle výsledku: červený stav = heslo uniklo
    pwnedText.textContent = status === 'pwned' ? 'Heslo bylo kompromitováno' : 'Heslo nebylo kompromitováno';
}

async function sha1Hex(text) {
    const hashBuffer = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(hashBuffer), (b) => b.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
}

async function isPasswordPwned(password) {
    const hash = await sha1Hex(password);
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);

    const response = await fetch(HIBP_RANGE_URL + prefix, {
        referrerPolicy: 'no-referrer',
        credentials: 'omit',
        signal: AbortSignal.timeout?.(HIBP_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    // Odpověď má řádky ve tvaru "SUFFIX:POČET_ÚNIKŮ"
    const lines = (await response.text()).split('\n');
    return lines.some((line) => {
        const [lineSuffix, count] = line.trim().split(':');
        return lineSuffix === suffix && Number(count) > 0;
    });
}

async function checkPwned(password) {
    const requestId = ++hibpRequestId;
    const isLatest = () => requestId === hibpRequestId;

    if (password === '') {
        setPwnedStatus('idle');
        return;
    }

    try {
        const pwned = await isPasswordPwned(password);
        if (isLatest()) setPwnedStatus(pwned ? 'pwned' : 'safe');
    } catch (error) {
        if (!isLatest()) return;
        console.error('Chyba při komunikaci s HIBP API:', error);
        // Nenecháme platit výsledek pro předchozí heslo - vrátíme neutrální stav
        setPwnedStatus('error');
    }
}

function runPwnedCheck() {
    clearTimeout(hibpTimer);
    hibpTimer = null;
    hibpCheckedPassword = passwordInput.value;
    hibpCheck = checkPwned(hibpCheckedPassword);
}

function schedulePwnedCheck() {
    clearTimeout(hibpTimer);
    hibpTimer = setTimeout(runPwnedCheck, HIBP_DEBOUNCE_MS);
}

// Před vyhodnocením musí výsledek HIBP patřit aktuálnímu heslu:
// nečekáme na debounce a po chybě to zkusíme znovu. Pokud uživatel během čekání
// heslo změnil (a spustila se tím novější kontrola), počkáme i na tu.
async function settlePwnedCheck() {
    const isOutdated = () => hibpTimer !== null || passwordInput.value !== hibpCheckedPassword;
    if (isOutdated() || pwnedStatus === 'error') runPwnedCheck();

    let awaited;
    do {
        awaited = hibpCheck;
        await awaited;
        if (isOutdated()) runPwnedCheck();
    } while (awaited !== hibpCheck);
}

// ==========================================================================
// 3. ČÁST: PROPOJENÍ S UŽIVATELSKÝM ROZHRANÍM
// ==========================================================================
passwordInput.addEventListener('input', () => {
    validatePasswordLocal(passwordInput.value); // Lokální kontrola se může dít okamžitě
    schedulePwnedCheck();
});

// Ikonku (oko / přeškrtnuté oko) přepíná CSS podle aria-pressed
togglePasswordBtn.addEventListener('click', () => {
    const show = passwordInput.type === 'password';
    passwordInput.type = show ? 'text' : 'password';
    togglePasswordBtn.setAttribute('aria-pressed', String(show));
});

// S MFA stačí kratší heslo - délku musíme ihned přepočítat
function syncMinLength() {
    requiredMinLength = mfaCheckbox.checked ? MIN_LENGTH_MFA : MIN_LENGTH_DEFAULT;
    lengthText.textContent = `Minimálně ${requiredMinLength} znaků`;
}

mfaCheckbox.addEventListener('change', () => {
    syncMinLength();
    validatePasswordLocal(passwordInput.value);
});

// Pole pro odpověď je vidět jen při zvolené otázce. Vrací, zda je vidět.
function syncSecurityAnswer() {
    const noQuestion = sqSelect.value === 'none';
    sqAnswer.hidden = noQuestion;
    if (noQuestion) sqAnswer.value = ''; // Ať tam nezůstane stará odpověď
    return !noQuestion;
}

// Na Windows mění šipky (a psaní písmen) hodnotu zavřeného selectu okamžitě a vyvolají change.
// Kdybychom pak přesunuli fokus do odpovědi, nešlo by klávesnicí dojít k dalším možnostem.
// Potvrzení volby Enterem / mezerníkem fokus přesune normálně.
let sqChangedByKey = false;
sqSelect.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') return;
    sqChangedByKey = true;
    setTimeout(() => { sqChangedByKey = false; }); // change přichází hned po keydown
});

sqSelect.addEventListener('change', () => {
    if (syncSecurityAnswer() && !sqChangedByKey) sqAnswer.focus();
});

// ==========================================================================
// Výsledek kontroly
// ==========================================================================
function collectErrors() {
    const errors = [];
    if (requirements.length.state !== 'valid') {
        errors.push(`Heslo nesplňuje minimální délku (${requiredMinLength} znaků).`);
    }
    if (passwordInput.value === '') {
        errors.push('Zadejte heslo.');
    } else if (pwnedStatus === 'pwned') {
        errors.push('Heslo bylo nalezeno v databázi uniklých hesel a není bezpečné.');
    } else if (pwnedStatus !== 'safe') {
        errors.push('Heslo se nepodařilo ověřit v databázi uniklých hesel (HIBP). Zkuste to prosím znovu.');
    }
    if (sqSelect.value !== 'none') {
        errors.push('Bezpečnostní otázka by neměla být nastavena (zastaralé řešení, které snižuje bezpečnost).');
    }
    if (hintInput.value.trim() !== '') {
        errors.push('Pole pro nápovědu k heslu by mělo zůstat prázdné (pokud je to možné).');
    }
    return errors;
}

const createElement = (tag, props = {}) => Object.assign(document.createElement(tag), props);

function showResult(errors) {
    const success = errors.length === 0;

    modal.content.classList.toggle('success-mode', success);
    modal.title.dataset.tone = success ? 'success' : 'error';

    if (success) {
        modal.title.textContent = 'Gratulujeme!';
        modal.message.replaceChildren(
            createElement('p', { textContent: 'Vaše heslo i nastavení zabezpečení splňují nejpřísnější standardy.' }),
            flagTemplate.content.cloneNode(true),
        );
    } else {
        modal.title.textContent = 'Něco není v pořádku';
        const list = createElement('ul', { className: 'modal-error-list' });
        list.append(...errors.map((error) => createElement('li', { textContent: error })));
        modal.message.replaceChildren(
            createElement('p', { textContent: 'Zkontrolujte a opravte prosím následující problémy:' }),
            list,
        );
    }

    openModal();
}

checkBtn.addEventListener('click', async () => {
    checkBtn.disabled = true;
    checkBtn.setAttribute('aria-busy', 'true');
    try {
        await settlePwnedCheck();
    } finally {
        checkBtn.disabled = false;
        checkBtn.removeAttribute('aria-busy');
    }
    showResult(collectErrors());
});

// ==========================================================================
// Vyskakovací okno (modal)
// ==========================================================================
// Stránka pod oknem je po dobu jeho zobrazení neaktivní (inert),
// takže se na ni nedostane fokus ani čtečka obrazovky.
function openModal() {
    modal.root.hidden = false;
    pageMain.inert = true;
    modal.okBtn.focus();
}

function closeModal() {
    modal.root.hidden = true;
    pageMain.inert = false;
    checkBtn.focus();
}

modal.closeBtn.addEventListener('click', closeModal);
modal.okBtn.addEventListener('click', closeModal);

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.root.hidden) closeModal();
});

// Zavření kliknutím na ztmavené pozadí. Stisk i puštění tlačítka myši musí být
// na pozadí - jinak by okno zavřelo i tažení myší při označování flagu.
let pointerDownOnBackdrop = false;
modal.root.addEventListener('pointerdown', (event) => {
    pointerDownOnBackdrop = event.target === modal.root;
});
modal.root.addEventListener('click', (event) => {
    if (pointerDownOnBackdrop && event.target === modal.root) closeModal();
});

// ==========================================================================
// Kopírování flagu do schránky
// ==========================================================================
// Záloha pro prohlížeče bez Clipboard API nebo se zakázaným přístupem
// (např. stránka otevřená přes http nebo vložená do rámu)
function copyTextFallback(text) {
    const previousFocus = document.activeElement;
    const textarea = createElement('textarea', { value: text, readOnly: true });
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    previousFocus?.focus();
    if (!copied) throw new Error('Kopírování selhalo');
}

async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
    } catch {
        copyTextFallback(text);
    }
}

function setCopyButtonState(copyBtn, copied) {
    copyBtn.toggleAttribute('data-copied', copied);
    copyBtn.setAttribute('aria-label', copied ? 'Zkopírováno' : 'Zkopírovat flag');
    copyBtn.title = copied ? 'Zkopírováno' : 'Zkopírovat';
}

// Tlačítko vzniká až při úspěchu, proto událost zachytáváme na obsahu modalu
let copyResetTimer = null;
modal.message.addEventListener('click', async (event) => {
    const copyBtn = event.target.closest('.copy-btn');
    if (!copyBtn) return;

    const flagText = copyBtn.closest('.flag-row').querySelector('.flag').textContent;
    try {
        await copyText(flagText);
        setCopyButtonState(copyBtn, true);
        clearTimeout(copyResetTimer);
        copyResetTimer = setTimeout(setCopyButtonState, COPY_FEEDBACK_MS, copyBtn, false);
    } catch (error) {
        console.error('Flag se nepodařilo zkopírovat:', error);
    }
});

// ==========================================================================
// Výchozí stav
// ==========================================================================
for (const req of Object.values(requirements)) {
    req.el.dataset.kind = req.mandatory ? 'mandatory' : 'optional';
}

// Stav odvodíme z aktuálních hodnot formuláře, ne z předpokladu, že je vše prázdné:
// při návratu na stránku je prohlížeč může obnovit (až po spuštění skriptu, proto i na pageshow).
function syncWithForm() {
    syncMinLength();
    syncSecurityAnswer();
    validatePasswordLocal(passwordInput.value);
    if (passwordInput.value !== hibpCheckedPassword) runPwnedCheck();
}

setPwnedStatus('idle');
syncWithForm();
window.addEventListener('pageshow', syncWithForm);
