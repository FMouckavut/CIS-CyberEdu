/**
 * Outlook Clone – page logic
 *
 * 1. Loads emails.json and renders the email list (groups + items).
 * 2. Clicking an email shows it in the reading pane and marks it as read.
 * 3. Three-dot menu → "Nahlásit" → phishing: the reported email disappears from the list ("Nahlásit spam" is inactive).
 * 4. Clicking "Outlook" in the header evaluates the reports and, on success, shows the flag.
 * 5. On the first visit in a browser session a driver.js tour walks through reporting one phishing email.
 */

/* ================================================================
   Constants
   ================================================================ */

const DATA_URL = 'emails.json';

/** Emails in this group show "Po 9:23" in the list, older ones "Čt 26.02" */
const THIS_WEEK_GROUP_ID = 'tento-tyden';

/** Fluent class that gives the selected email item its blue background */
const SELECTED_CLASS = 'is-selected';

/** sender.avatarColor values that have an .avatar-<color> class in css/styles.css */
const AVATAR_COLORS = new Set([
    'cranberry', 'red', 'peach', 'marigold', 'brass', 'teal', 'steel', 'blue',
    'navy', 'grape', 'lilac', 'pink', 'beige', 'anchor', 'gray',
]);
const DEFAULT_AVATAR_COLOR = 'blue';

/** Glyphs of the Fluent icon font (private-use code points, invisible in most editors) */
const ICON_CHEVRON_DOWN = '';
const ICON_MORE = '';

const CZ_DAYS = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];

const TYPE_LABELS = { phishing: 'phishing', normal: 'normální' };

/**
 * Reward for the exercise, base64-encoded so it does not appear as plain text in the source.
 * This is only obfuscation – a static page cannot hide the flag (or the answers in emails.json).
 */
const FLAG_BASE64 = 'RkxBRyhTb2NpYWxuaUluemVueXJzdHZpKQ==';

/** How long the "Nahlásit" submenu stays open after the mouse leaves its menu item */
const SUBMENU_CLOSE_DELAY_MS = 200;

const REPORT_DIALOGS = {
    phishing: { modal: 'reportPhishingModal', confirm: 'confirmPhishingBtn', cancel: 'cancelPhishingBtn', menuItem: 'reportPhishingBtn' },
};

/* ================================================================
   State
   ================================================================ */

/** emailId → email object from emails.json */
const emailsById = new Map();

/** emailId → id of the group the email belongs to */
const groupIdByEmailId = new Map();

/** emailId → 'phishing' – what the user reported */
const userFlags = new Map();

/** Id of the email shown in the reading pane (null = none) */
let selectedEmailId = null;

/* ================================================================
   Utilities
   ================================================================ */

const byId = (id) => document.getElementById(id);

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapes text for use in HTML content and in quoted attribute values */
function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/** Plain text of an HTML string. A <template> keeps the markup inert (no image loads, no handlers). */
function htmlToText(html) {
    const template = document.createElement('template');
    template.innerHTML = html;
    template.content.querySelectorAll('style, script').forEach((el) => el.remove());
    return template.content.textContent.replace(/\s+/g, ' ').trim();
}

function avatarClass(color) {
    return 'avatar-' + (AVATAR_COLORS.has(color) ? color : DEFAULT_AVATAR_COLOR);
}

/* ================================================================
   Date formatting
   ================================================================ */

function pad2(n) {
    return String(n).padStart(2, '0');
}

/** "Po 02.03.2026 9:23" – tooltip in the list and date in the reading pane */
function formatDateFull(d) {
    return `${CZ_DAYS[d.getDay()]} ${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} ${d.getHours()}:${pad2(d.getMinutes())}`;
}

/** "Po 9:23" – emails from this week */
function formatDateThisWeek(d) {
    return `${CZ_DAYS[d.getDay()]} ${d.getHours()}:${pad2(d.getMinutes())}`;
}

/** "Čt 26.02" – older emails */
function formatDateOlder(d) {
    return `${CZ_DAYS[d.getDay()]} ${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}`;
}

function formatListDate(date, groupId) {
    return groupId === THIS_WEEK_GROUP_ID ? formatDateThisWeek(date) : formatDateOlder(date);
}

/* ================================================================
   Email list rendering – the Fluent class names match the captured Outlook CSS
   ================================================================ */

function renderEmailItem(email) {
    const id = Number(email.id);
    const { name, email: address, initials, avatarColor } = email.sender;
    const date = new Date(email.date);
    const shortDate = formatListDate(date, groupIdByEmailId.get(id));
    const preview = htmlToText(email.bodyHtml);
    const ariaLabel = `${name} ${email.subject} ${shortDate} ${preview}`;

    return `
    <div id="email-${id}" class="email-item${email.isRead ? '' : ' unread'}"
        data-email-id="${id}" role="option" aria-selected="false" aria-label="${escapeHtml(ariaLabel)}" tabindex="-1">
        <div draggable="true">
            <div class="email-item-inner" tabindex="-1">
                <div class="email-line-vars email-item-row">
                    <div class="email-avatar-column">
                        <div class="email-line-vars email-select"
                            tabindex="-1" role="checkbox" aria-checked="false" aria-label="Vyberte konverzaci">
                            <span role="img" class="avatar email-avatar" aria-label="${escapeHtml(name)}">
                                <span class="avatar-initials ${avatarClass(avatarColor)}">${escapeHtml(initials)}</span>
                            </span>
                        </div>
                    </div>
                    <div class="email-text">
                        <div class="email-sender-row email-line-vars">
                            <div class="email-sender">
                                <span title="${escapeHtml(address)}">${escapeHtml(name)}</span>
                            </div>
                        </div>
                        <div class="email-subject-row text-dark">
                            <div class="email-subject email-line-vars">
                                <span class="email-subject-text" title="">${escapeHtml(email.subject)}</span>
                            </div>
                            <span class="email-date text-dark" title="${escapeHtml(formatDateFull(date))}">${escapeHtml(shortDate)}</span>
                        </div>
                        <div class="email-preview-row email-line-vars">
                            <div class="email-preview-wrap">
                                <div class="email-preview-inner">
                                    <span class="email-preview">${escapeHtml(preview)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="email-actions"></div>
            </div>
        </div>
    </div>`;
}

/** Group = header ("Tento týden", …) followed by its email items */
function renderGroup(group) {
    return `
    <div class="email-group" data-group="${escapeHtml(group.id)}">
        <div class="email-group-header" role="button">
            <i class="group-collapse-icon">
                <i class="icon-fill inline-block icon-line-height icon-style icon-font">${ICON_CHEVRON_DOWN}</i>
            </i>
            <div class="email-group-title">${escapeHtml(group.label)}</div>
            <button type="button"
                class="fui-Button btn-base group-more-btn btn-transparent btn-borderless text-secondary btn-compact min-width-32">
                <span class="btn-icon">
                    <i class="fui-Icon-regular icon-style icon-font">${ICON_MORE}</i>
                </span>
            </button>
        </div>
        ${group.emails.map(renderEmailItem).join('')}
    </div>`;
}

/* ================================================================
   Reading pane
   ================================================================ */

function showReadingPane(visible) {
    byId('reading-pane-empty').style.display = visible ? 'none' : '';
    byId('ReadingPaneContainerId').style.display = visible ? '' : 'none';
}

function showEmailInReadingPane(email) {
    const { name, email: address, initials, avatarColor } = email.sender;
    showReadingPane(true);

    byId('reading-pane-subject').textContent = email.subject;

    const avatar = byId('reading-pane-sender-avatar');
    avatar.setAttribute('aria-label', name);
    avatar.closest('.persona-trigger').setAttribute('aria-label', `Otevře kartu pro ${name}.`);

    const initialsEl = byId('reading-pane-sender-initials');
    initialsEl.textContent = initials;
    initialsEl.className = 'avatar-initials ' + avatarClass(avatarColor);

    const senderName = byId('reading-pane-sender-name');
    senderName.textContent = name;
    senderName.closest('.persona-trigger').setAttribute('aria-label', `Od: ${name}`);

    /* Sender address in angle brackets right next to the name */
    byId('reading-pane-sender-email').textContent = address ? `<${address}>` : '';

    renderRecipients(parseRecipients(email.recipients));
    byId('reading-pane-date').textContent = formatDateFull(new Date(email.date));
    renderBody(email.bodyHtml);
}

/**
 * Email bodies come from emails.json (authored with the exercise). Links open in a new tab
 * so the progress in this tab is kept; noopener/noreferrer cut the new tab off from this page.
 */
function renderBody(html) {
    const body = byId('reading-pane-body');
    body.innerHTML = html;
    for (const link of body.querySelectorAll('a[href]')) {
        if (link.protocol === 'mailto:') continue;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
    }
}

/**
 * Buttons in an email body that would need inline onclick (blocked by the CSP) declare their action instead:
 * data-reveal-img + data-reveal-src load a blocked image, data-open-url opens a popup window.
 * On a link, data-open-url replaces the href, so hovering still shows the phishing URL but clicking opens the harmless page.
 */
function setupBodyActions() {
    byId('reading-pane-body').addEventListener('click', (event) => {
        const button = event.target.closest('[data-open-url]');
        if (!button) return;
        event.preventDefault();

        const img = byId(button.dataset.revealImg);
        if (img) {
            img.src = button.dataset.revealSrc;
            img.classList.remove('blocked-image');
        }
        window.open(button.dataset.openUrl, 'email_popup', 'width=900,height=600,left=100,top=100');
    });
}

/* ── Recipients row ("Komu: …") ──────────────────────────────── */

function parseRecipients(text) {
    return (text || '').split(';').map((s) => s.trim()).filter(Boolean);
}

/** Collapsed: first recipient + "+N další" link that expands the full list */
function renderRecipients(recipients) {
    const row = byId('reading-pane-recipients-row');
    const content = byId('reading-pane-recipients-content');
    row.style.display = recipients.length ? '' : 'none';
    content.innerHTML = '';
    if (!recipients.length) return;

    const [first, ...others] = recipients;
    content.innerHTML = `<span class="reading-pane-recipient-name">${escapeHtml(first)}${others.length ? ';' : ''}</span>`;
    if (!others.length) return;

    content.insertAdjacentHTML('beforeend',
        `<span class="reading-pane-more-link" role="button" tabindex="0">&nbsp;&nbsp;+${others.length} další</span>`);

    const moreLink = content.querySelector('.reading-pane-more-link');
    const expand = () => renderRecipientsExpanded(recipients);
    moreLink.addEventListener('click', expand);
    moreLink.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            expand();
        }
    });
}

/** Expanded: one recipient per line */
function renderRecipientsExpanded(recipients) {
    const [first, ...others] = recipients;
    byId('reading-pane-recipients-content').innerHTML =
        `<span class="reading-pane-recipient-name">${escapeHtml(first)};</span>`
        + others.map((name, i) => {
            const separator = i < others.length - 1 ? ';' : '';
            return `<div class="reading-pane-recipient-name reading-pane-recipient-extra">${escapeHtml(name)}${separator}</div>`;
        }).join('');
}

/* ================================================================
   Selection + unread state
   ================================================================ */

function setItemSelected(emailId, selected) {
    const item = emailId === null ? null : byId('email-' + emailId);
    if (!item) return;
    item.classList.toggle(SELECTED_CLASS, selected);
    item.setAttribute('aria-selected', String(selected));
    item.tabIndex = selected ? 0 : -1;
}

function selectEmail(emailId) {
    if (emailId === selectedEmailId) return;
    setItemSelected(selectedEmailId, false);
    setItemSelected(emailId, true);
    selectedEmailId = emailId;

    const email = emailsById.get(emailId);
    if (!email) return;
    markAsRead(email);
    showEmailInReadingPane(email);
}

function markAsRead(email) {
    if (email.isRead) return;
    email.isRead = true;
    byId('email-' + email.id)?.classList.remove('unread');
    updateUnreadBadges();
}

/** Unread count next to every "Doručená pošta" folder in the navigation pane */
function updateUnreadBadges() {
    const unreadCount = [...emailsById.values()].filter((email) => !email.isRead).length;

    for (const folder of document.querySelectorAll('.nav-folder[title="Doručená pošta"]')) {
        folder.querySelector('.unread-badge')?.remove();
        if (unreadCount > 0) {
            const badge = document.createElement('span');
            badge.className = 'unread-badge';
            badge.textContent = unreadCount;
            folder.appendChild(badge);
        }
    }
}

/* ================================================================
   Three-dot menu ("Další možnosti") with the "Nahlásit" submenu
   ================================================================ */

function closeMenus() {
    byId('moreItemsMenu').classList.remove('open');
    byId('nahlasitSubmenu').classList.remove('open');
}

function setupMoreItemsMenu() {
    const button = byId('moreItemsBtn');
    const menu = byId('moreItemsMenu');
    const reportItem = byId('nahlasitMenuItem');
    const submenu = byId('nahlasitSubmenu');
    let submenuCloseTimer = null;

    button.addEventListener('click', (event) => {
        event.stopPropagation();
        if (menu.classList.contains('open')) {
            closeMenus();
            return;
        }
        if (selectedEmailId === null) return;

        /* Right-align the menu with the button */
        const rect = button.getBoundingClientRect();
        menu.style.top = `${rect.bottom + 2}px`;
        menu.style.right = `${window.innerWidth - rect.right}px`;
        menu.style.left = 'auto';
        menu.style.maxHeight = `${window.innerHeight - rect.bottom - 10}px`;
        menu.classList.add('open');
    });

    /* Submenu opens to the left of the menu */
    reportItem.addEventListener('mouseenter', () => {
        clearTimeout(submenuCloseTimer);
        const menuRect = menu.getBoundingClientRect();
        const itemRect = reportItem.getBoundingClientRect();
        submenu.style.top = `${itemRect.top - 4}px`;
        submenu.style.right = `${window.innerWidth - menuRect.left + 2}px`;
        submenu.style.left = 'auto';
        submenu.classList.add('open');
    });
    reportItem.addEventListener('mouseleave', () => {
        submenuCloseTimer = setTimeout(() => submenu.classList.remove('open'), SUBMENU_CLOSE_DELAY_MS);
    });
    submenu.addEventListener('mouseenter', () => clearTimeout(submenuCloseTimer));
    submenu.addEventListener('mouseleave', () => submenu.classList.remove('open'));

    for (const dialog of Object.values(REPORT_DIALOGS)) {
        byId(dialog.menuItem).addEventListener('click', () => {
            closeMenus();
            byId(dialog.modal).classList.add('open');
        });
    }

    /* Clicks inside the menus must not reach the document handler that closes them */
    menu.addEventListener('click', (event) => event.stopPropagation());
    submenu.addEventListener('click', (event) => event.stopPropagation());
    document.addEventListener('click', closeMenus);
}

/* ================================================================
   Report modals (phishing)
   ================================================================ */

function setupReportModals() {
    for (const [type, dialog] of Object.entries(REPORT_DIALOGS)) {
        const modal = byId(dialog.modal);
        byId(dialog.confirm).addEventListener('click', () => {
            reportSelectedEmail(type);
            modal.classList.remove('open');
        });
        byId(dialog.cancel).addEventListener('click', () => modal.classList.remove('open'));
    }
}

/** Stores the report, hides the email from the list and resets the reading pane */
function reportSelectedEmail(type) {
    if (selectedEmailId === null) return;

    userFlags.set(selectedEmailId, type);
    setItemSelected(selectedEmailId, false);
    byId('email-' + selectedEmailId).style.display = 'none';
    selectedEmailId = null;

    showReadingPane(false);
    hideEmptyGroupHeaders();
}

function hideEmptyGroupHeaders() {
    for (const group of document.querySelectorAll('.email-group')) {
        const hasVisibleEmail = [...group.querySelectorAll('.email-item')]
            .some((item) => item.style.display !== 'none');
        group.querySelector('.email-group-header').style.display = hasVisibleEmail ? '' : 'none';
    }
}

/* ================================================================
   Evaluation – triggered by the "Outlook" link in the header
   ================================================================ */

/**
 * A mistake is any email whose report differs from its type in emails.json
 * (unreported = "normal"): a missed phishing email or a normal email reported as phishing.
 * Any mistake costs the flag.
 */
function collectMistakes() {
    const mistakes = [];
    const byIdAscending = [...emailsById].sort(([a], [b]) => a - b);

    for (const [id, email] of byIdAscending) {
        const expected = email.type || 'normal';
        const got = userFlags.get(id);   // undefined = not reported
        if ((got ?? 'normal') !== expected) mistakes.push({ email, expected, got });
    }
    return mistakes;
}

function renderMistakeList(mistakes) {
    const items = mistakes.map(({ email, expected, got }) =>
        `<li><strong>${escapeHtml(email.subject)}</strong> — správně: ${TYPE_LABELS[expected]}, `
        + `vaše označení: ${got ? TYPE_LABELS[got] : 'neoznačen'}</li>`);
    return `<ul class="eval-mistakes">${items.join('')}</ul>`;
}

/* Fluent icons copy_20_regular / checkmark_20_regular */
const ICON_COPY = '<svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor" aria-hidden="true">'
    + '<path d="M8 2a2 2 0 0 0-2 2v10c0 1.1.9 2 2 2h6a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8ZM7 4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4ZM4 6a2 2 0 0 1 1-1.73V14.5A2.5 2.5 0 0 0 7.5 17h6.23A2 2 0 0 1 12 18H7.5A3.5 3.5 0 0 1 4 14.5V6Z"/></svg>';
const ICON_CHECK = '<svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor" aria-hidden="true">'
    + '<path d="M7.03 13.9 3.56 10a.75.75 0 0 0-1.12 1l4 4.5c.29.32.79.34 1.09.03l10.5-10.5a.75.75 0 0 0-1.06-1.06l-9.94 9.94Z"/></svg>';

function renderFlag() {
    return '<div class="eval-flag">'
        + '<div class="eval-flag-label">Vaše vlajka:</div>'
        + `<span class="eval-flag-value">${escapeHtml(atob(FLAG_BASE64))}</span>`
        + `<button type="button" class="eval-flag-copy" title="Kopírovat vlajku" aria-label="Kopírovat vlajku">${ICON_COPY}</button>`
        + '</div>';
}

/** navigator.clipboard needs HTTPS or localhost – on plain HTTP fall back to execCommand */
async function copyFlag(button) {
    const flagEl = button.previousElementSibling;
    try {
        await navigator.clipboard.writeText(flagEl.textContent);
    } catch {
        const range = document.createRange();
        range.selectNodeContents(flagEl);
        getSelection().removeAllRanges();
        getSelection().addRange(range);
        document.execCommand('copy');
    }
    button.innerHTML = ICON_CHECK;
    button.title = 'Zkopírováno';
    setTimeout(() => {
        button.innerHTML = ICON_COPY;
        button.title = 'Kopírovat vlajku';
    }, 1500);
}

function showEvaluation() {
    const mistakes = collectMistakes();
    const passed = mistakes.length === 0;
    let title, html;

    if (passed) {
        title = 'Gratulujeme!';
        html = 'Správně jste identifikovali všechny nebezpečné e-maily. Výborná práce!' + renderFlag();
    } else {
        title = 'Zkuste to znovu';
        html = '<p>Některé e-maily nebyly označeny správně:</p>' + renderMistakeList(mistakes);
    }

    const titleEl = byId('evalModalTitle');
    titleEl.textContent = title;
    titleEl.classList.toggle('eval-title-success', passed);
    titleEl.classList.toggle('eval-title-fail', !passed);
    byId('evalModalText').innerHTML = html;
    byId('evalModal').classList.add('open');
}

function setupEvaluation() {
    byId('outlookEvalBtn').addEventListener('click', (event) => {
        event.preventDefault();
        showEvaluation();
    });

    byId('evalModalText').addEventListener('click', (event) => {
        const button = event.target.closest('.eval-flag-copy');
        if (button) copyFlag(button);
    });

    /* Closing the result starts the exercise again */
    byId('evalModalBtn').addEventListener('click', () => {
        byId('evalModal').classList.remove('open');
        window.location.reload();
    });
}

/* ================================================================
   Guided tour (driver.js) – reporting the first phishing email, once per browser session
   ================================================================ */

/** sessionStorage key: set once the tour was finished or closed, so a refresh skips it */
const TOUR_DONE_KEY = 'reportTourDone';

/** Keeps a menu visible while the tour points into it (the submenu normally closes on mouseleave) */
const PINNED_CLASS = 'is-pinned';

function startReportTour() {
    const createDriver = window.driver?.js?.driver;   // undefined when the CDN script did not load
    const email = [...emailsById.values()].find((e) => e.type === 'phishing');
    if (!createDriver || !email || sessionStorage.getItem(TOUR_DONE_KEY)) return;

    const listeners = new AbortController();
    const unpinMenus = () => document.querySelectorAll('.' + PINNED_CLASS)
        .forEach((menu) => menu.classList.remove(PINNED_CLASS));

    /* Interactive step: the user does the real action (the app's own handlers run first), then the tour moves on */
    const advanceOn = (eventType, afterAction) => ({
        onHighlightStarted: (element) => element.addEventListener(eventType, () => {
            afterAction?.();
            tour.moveNext();
        }, { once: true, signal: listeners.signal }),
    });
    const pin = (id) => () => byId(id).classList.add(PINNED_CLASS);

    /* Link step: hovering shows the real target in the browser status bar, but the link cannot be opened during the tour */
    const hoverOnly = {
        onHighlightStarted: (element) => {
            for (const type of ['click', 'auxclick']) {
                element.addEventListener(type, (event) => event.preventDefault(), { signal: listeners.signal });
            }
        },
    };

    const tour = createDriver({
        showProgress: true,
        progressText: '{{current}} / {{total}}',
        nextBtnText: 'Další',
        doneBtnText: 'Rozumím',
        showButtons: ['close'],
        /* Arrow keys would skip the action the step waits for; closing stays on ✕ and the overlay */
        allowKeyboardControl: false,
        steps: [
            /* No element → driver.js centers the popover on the screen */
            {
                popover: {
                    title: 'Vítejte',
                    description: 'Ve vaší poště jsou podvodné (phishingové) e-maily. Na prvním z nich si ukážeme, jak takový e-mail nahlásit. Ostatní pak zvládnete sami.',
                    showButtons: ['next', 'close'],
                },
            },
            {
                element: '#email-' + email.id,
                popover: { title: 'Podezřelý e-mail', description: 'Ukážeme si, jak nahlásit phishing. Klikněte na tento e-mail a otevřete ho.' },
                ...advanceOn('click'),
            },
            {
                element: '.message-card',
                popover: {
                    title: 'Prostudujte e-mail',
                    description: 'Nejdřív si celý e-mail (hlavičku i text) v klidu přečtěte a zkuste sami najít, co je na něm podezřelé. Potom pokračujte tlačítkem Další.',
                    side: 'left',
                    showButtons: ['next', 'close'],
                },
            },
            {
                element: '#reading-pane-sender-email',
                popover: {
                    title: 'Zkontrolujte odesílatele',
                    description: 'Adresa odesílatele nepatří k oficiální doméně České pošty (cpost.cz). Takový e-mail se jen tváří, že je od Pošty.',
                    showButtons: ['next', 'close'],
                },
            },
            /* Suspicious parts of the email body; links can be hovered but not opened (hoverOnly), the rest is not interactive.
               shortcut: selectors match the body of the first phishing email (id 1) in emails.json, update them if it changes. */
            {
                element: '#reading-pane-body a[href*="tinyurl"]',
                ...hoverOnly,
                popover: {
                    title: 'Odkaz vede jinam',
                    description: 'Najeďte myší na odkaz a podívejte se vlevo dole v prohlížeči, kam doopravdy vede. Text ukazuje postaonline.cz, ale cíl je tinyurl.com, tedy zkracovač adres, který skrývá skutečnou stránku.',
                    showButtons: ['next', 'close'],
                },
            },
            {
                element: '#reading-pane-body ul',
                disableActiveInteraction: true,
                popover: {
                    title: 'Výhrůžky',
                    description: 'E-mail straší nepříjemnými následky, abyste jednali rychle a bez přemýšlení.',
                    showButtons: ['next', 'close'],
                },
            },
            {
                element: '#reading-pane-body strong',
                disableActiveInteraction: true,
                popover: {
                    title: 'Časový nátlak',
                    description: 'Krátký termín („do 24 hodin“) má vyvolat paniku. Skutečné instituce vám obvykle dají na vyřízení víc času.',
                    showButtons: ['next', 'close'],
                },
            },
            {
                element: '#reading-pane-body a[href$=".exe"]',
                ...hoverOnly,
                popover: {
                    title: 'Nebezpečná příloha',
                    description: 'Najeďte myší na odkaz „Stitek_zasilky.pdf“: tváří se jako PDF, ale stahuje spustitelný soubor (.pdf.exe) z cizí domény. Tak se nejčastěji šíří malware. Takové soubory nikdy nestahujte ani nespouštějte.',
                    showButtons: ['next', 'close'],
                },
            },
            {
                element: '#moreItemsBtn',
                popover: { title: 'Další možnosti', description: 'Klikněte na tři tečky.' },
                ...advanceOn('click', pin('moreItemsMenu')),
            },
            {
                element: '#nahlasitMenuItem',
                popover: { title: 'Nahlásit', description: 'Najeďte myší na položku Nahlásit.' },
                ...advanceOn('mouseenter', pin('nahlasitSubmenu')),
            },
            {
                element: '#reportPhishingBtn',
                popover: { title: 'Nahlásit útok phishing', description: 'Klikněte na Nahlásit útok phishing.' },
                ...advanceOn('click', unpinMenus),
            },
            {
                element: '#confirmPhishingBtn',
                popover: { title: 'Potvrzení', description: 'Nahlášení potvrďte tlačítkem Sestava. E-mail tím zmizí ze seznamu.' },
                ...advanceOn('click'),
            },
            {
                element: '#outlookEvalBtn',
                disableActiveInteraction: true,
                popover: {
                    title: 'Teď už sami',
                    description: 'Stejně projděte ostatní e-maily a nahlaste ty podvodné. Až budete hotovi, klikněte na Outlook – zobrazí se vyhodnocení.',
                    showButtons: ['next'],
                },
            },
        ],
        /* Runs on finish and on early close – both count as done */
        onDestroyed: () => {
            listeners.abort();
            unpinMenus();
            sessionStorage.setItem(TOUR_DONE_KEY, '1');
        },
    });
    tour.drive();
}

/* ================================================================
   Init
   ================================================================ */

async function loadEmails() {
    const response = await fetch(DATA_URL);
    if (!response.ok) throw new Error(`Failed to load ${DATA_URL}: ${response.status}`);
    return response.json();
}

function renderEmailList(data) {
    for (const group of data.groups) {
        for (const email of group.emails) {
            const id = Number(email.id);
            emailsById.set(id, email);
            groupIdByEmailId.set(id, group.id);
        }
    }

    /* No email is selected at start – the reading pane shows its empty state */
    const listContainer = byId('emailListContainer');
    listContainer.innerHTML = data.groups.map(renderGroup).join('');
    listContainer.addEventListener('click', (event) => {
        const item = event.target.closest('.email-item');
        if (item) selectEmail(Number(item.dataset.emailId));
    });
}

function showLoadError() {
    byId('emailListContainer').innerHTML =
        `<p class="email-list-error">Nepodařilo se načíst e-maily (${DATA_URL}). Podrobnosti jsou v konzoli prohlížeče.</p>`;
}

async function init() {
    try {
        renderEmailList(await loadEmails());
        updateUnreadBadges();
        setupMoreItemsMenu();
        setupReportModals();
        setupEvaluation();
        setupBodyActions();
    } catch (err) {
        console.error('Outlook clone init error:', err);
        showLoadError();
        return;
    }
    /* Outside the try: a tour failure must not replace the email list with the load error */
    startReportTour();
}

init();
