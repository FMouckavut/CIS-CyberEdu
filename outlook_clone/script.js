/**
 * Outlook Clone – Email List & Reading Pane Controller
 *
 * Reads emails.json → renders the email list dynamically → handles click-to-read.
 */

(function () {
    'use strict';

    /* ── Selectors for the reading pane ────────────────────────── */
    const SEL = {
        subject:        '#reading-pane-subject',
        senderAvatar:   '#reading-pane-sender-avatar',
        senderInitials: '#reading-pane-sender-initials',
        senderName:     '#reading-pane-sender-name',
        date:           '#reading-pane-date',
        body:           '#reading-pane-body',
        listContainer:  '#emailListContainer',
        mailList:       '#MailList',
    };

    /* ── Base color classes that every initials span keeps ──────── */
    const INITIALS_BASE_CLASSES = 'fui-Avatar__initials rip04v';

    /* ── Avatar color name → CSS class pair mapping ────────────── */
    const AVATAR_COLOR_MAP = {
        cranberry:  'fg9gses f1lwxszt',
        red:        'f23f7i0 f1q9qhfq',
        peach:      'fknu15p f1b9nr51',
        marigold:   'f9603vw f3z4w6d',
        brass:      'f28g5vo f4w2gd0',
        teal:       'f135dsb4 f6hvv1p',
        steel:      'f151dlcp f1lnp8zf',
        blue:       'f1rjv50u f1ggcpy6',
        grape:      'f1fiiydq f1o4k8oy',
        lilac:      'f1res9jt f1x6mz1o',
        pink:       'fv3fbbi fydlv6t',
        beige:      'f1ntv3ld f101elhj',
        anchor:     'f1f3ti53 fu4yj0j',
    };

    /* ── Czech day-of-week abbreviations ───────────────────────── */
    const CZ_DAYS = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];

    /* ── Currently selected email id (null = none) ─────────────── */
    let selectedEmailId = null;

    /* ── Flat lookup: emailId → email object ───────────────────── */
    let emailMap = {};

    /* ── Group lookup: emailId → groupId ───────────────────────── */
    let emailGroupMap = {};

    /* ── User flags: emailId → 'spam' | 'phishing' ───────────── */
    let userFlags = {};

    /* ── Original JSON data (for evaluation) ──────────────────── */
    let emailData = null;

    /* ================================================================
       Date formatting helpers
       ================================================================ */

    function pad2(n) { return n < 10 ? '0' + n : '' + n; }

    /** Full tooltip date: "Po 02.03.2026 9:23" */
    function formatDateFull(d) {
        return CZ_DAYS[d.getDay()] + ' '
            + pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1) + '.' + d.getFullYear()
            + ' ' + d.getHours() + ':' + pad2(d.getMinutes());
    }

    /** Short date for "tento-tyden" group: "Po 9:23" */
    function formatDateThisWeek(d) {
        return CZ_DAYS[d.getDay()] + ' ' + d.getHours() + ':' + pad2(d.getMinutes());
    }

    /** Short date for older groups: "Čt 26.02" */
    function formatDateOlder(d) {
        return CZ_DAYS[d.getDay()] + ' ' + pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1);
    }

    /** Get the short display date based on group type */
    function getShortDate(email) {
        var d = new Date(email.date);
        var groupId = emailGroupMap[email.id];
        if (groupId === 'tento-tyden') {
            return formatDateThisWeek(d);
        }
        return formatDateOlder(d);
    }

    /** Get the full tooltip date */
    function getFullDate(email) {
        return formatDateFull(new Date(email.date));
    }

    /* ================================================================
       Preview extraction from bodyHtml
       ================================================================ */

    /** Strip HTML tags and return plain text */
    function htmlToText(html) {
        var tmp = document.createElement('div');
        tmp.innerHTML = html;
        return (tmp.textContent || tmp.innerText || '').replace(/\s+/g, ' ').trim();
    }

    /* ================================================================
       Avatar color resolution
       ================================================================ */

    function getAvatarClasses(colorName) {
        return AVATAR_COLOR_MAP[colorName] || AVATAR_COLOR_MAP.blue;
    }

    /* ================================================================
       HTML builders – match the exact class structure from index.html
       ================================================================ */

    /** Build a single email-item div (outerHTML string). */
    function buildEmailItem(email) {
        const isSelected = email.id === selectedEmailId;
        const selectedClass = isSelected ? ' epBmH' : '';
        const unreadClass = !email.isRead ? ' unread' : '';
        const ariaSelected = isSelected ? 'true' : 'false';
        const tabIdx = isSelected ? '0' : '-1';

        const shortDate = getShortDate(email);
        const fullDate = getFullDate(email);
        const preview = htmlToText(email.bodyHtml);
        const avatarClasses = getAvatarClasses(email.sender.avatarColor);

        const ariaLabel = `${email.sender.name} ${email.subject} ${shortDate} ${preview}`;

        return `
        <div id="email-${email.id}" class="email-item jGG6V gDC9O${selectedClass}${unreadClass} UWKUc"
            data-email-id="${email.id}" role="option" aria-selected="${ariaSelected}"
            aria-label="${escapeAttr(ariaLabel)}"
            tabindex="${tabIdx}" data-focusable-row="true">
            <div draggable="true">
                <div class="lHRXq hDNlA" tabindex="-1">
                    <div class="XG5Jd TszOG">
                        <div class="ZfoST VlT6S azUpZ">
                            <div class="XG5Jd WNvBZ TBtad q0f8X XW8cf DoCKv vbEPJ"
                                tabindex="-1" role="checkbox" aria-checked="false"
                                aria-label="Vyberte konverzaci">
                                <span role="img" class="fui-Avatar r81b29z mP9b0" aria-label="${escapeAttr(email.sender.name)}">
                                    <span class="fui-Avatar__initials rip04v ${avatarClasses}">${escapeHtml(email.sender.initials)}</span>
                                </span>
                                <div class="ms-Checkbox is-enabled to0aR XG5Jd root-254 sf-hidden"></div>
                            </div>
                        </div>
                        <div class="S2NDX">
                            <div class="gCSJa XG5Jd">
                                <div class="ESO13 gy2aJ CYQyC Ejrkd">
                                    <span title="${escapeAttr(email.sender.email)}">${escapeHtml(email.sender.name)}</span>
                                </div>
                            </div>
                            <div class="nf3X_ D8iyG Q19mi">
                                <div class="IjzWp XG5Jd gy2aJ Ejrkd lME98">
                                    <span class="TtcXM" title="">${escapeHtml(email.subject)}</span>
                                </div>
                                <span class="_rWRU Ejrkd qq2gS D8iyG" title="${escapeAttr(fullDate)}">${escapeHtml(shortDate)}</span>
                            </div>
                            <div class="tAtdo XG5Jd">
                                <div class="GVo2G">
                                    <div class="Zgp3k">
                                        <span class="FqgPc gy2aJ Ejrkd email-preview">${escapeHtml(preview)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="wBMYh"></div>
                </div>
            </div>
        </div>`;
    }

    /** Build a group container (header + email items). */
    function buildGroup(group) {
        const header = `
        <div class="email-group-header HJne5 l17f5 MtAK6 d4ROo threeColumnCirclePersonaDivWidth Cnnoo qvgmu"
            role="button" style="padding-left: 40px">
            <i class="H1SeE pqyEZ lzRkn Cnnoo root-89">
                <i class="fui-Icon-font Q0K3G f14t3ns0 fne0op0 fmd4ok8 f303qgw f1sxfq9t"
                    fill="currentColor"></i>
            </i>
            <div class="PukTV">${escapeHtml(group.label)}</div>
            <button type="button"
                class="fui-Button r1f29ykk jUsDj c58By f1c21dwh f1p3nwhy f11589ue f1q5o8ev f1pdflbu fkfq4zb fjxutwb f1s2uweq fr80ssc f1ukrpxl fecsdlb f139oj5f ft1hn21 fkoldzo fhvnf4x fb6swo4 f1klyf7k f232fm2 f1l983o9 f1nhwcv0 f1gm6xmp fxoo9op f1v3eptx f1i0gk12 fd4bjan f18ktai2 fwbmr0d f44c6la">
                <span class="fui-Button__icon rywnvv2">
                    <i class="fui-Icon-font fui-Icon-regular fmd4ok8 f1sxfq9t"
                        fill="currentColor"></i>
                </span>
            </button>
        </div>`;

        const emails = group.emails.map(buildEmailItem).join('');

        return `<div class="email-group" data-group="${escapeAttr(group.id)}">${header}${emails}</div>`;
    }

    /* ================================================================
       Reading pane update
       ================================================================ */

    function showReadingPane() {
        var empty = document.getElementById('reading-pane-empty');
        var content = document.getElementById('ReadingPaneContainerId');
        if (empty) empty.style.display = 'none';
        if (content) content.style.display = '';
    }

    function showEmailInReadingPane(email) {
        showReadingPane();
        const $ = (sel) => document.querySelector(sel);

        /* Subject */
        $(SEL.subject).textContent = email.subject;

        /* Sender avatar */
        const avatar = $(SEL.senderAvatar);
        avatar.setAttribute('aria-label', email.sender.name);

        /* Sender initials + color */
        const initials = $(SEL.senderInitials);
        initials.textContent = email.sender.initials;
        initials.className = INITIALS_BASE_CLASSES + ' ' + getAvatarClasses(email.sender.avatarColor);

        /* Sender name */
        $(SEL.senderName).textContent = email.sender.name;

        /* Date */
        $(SEL.date).textContent = getFullDate(email);

        /* Body */
        $(SEL.body).innerHTML = email.bodyHtml;

        /* Also update the container-287 span aria-label around the avatar */
        const avatarBtn = avatar.closest('.container-287');
        if (avatarBtn) {
            avatarBtn.setAttribute('aria-label', `Otevře kartu pro ${email.sender.name}.`);
        }

        /* Update the "Od:" aria-label on sender name button */
        const senderBtn = $(SEL.senderName).closest('.container-287');
        if (senderBtn) {
            senderBtn.setAttribute('aria-label', `Od: ${email.sender.name}`);
        }
    }

    /* ================================================================
       Selection handling
       ================================================================ */

    function selectEmail(emailId) {
        if (emailId === selectedEmailId) return;

        /* Deselect previous */
        if (selectedEmailId !== null) {
            const prev = document.getElementById('email-' + selectedEmailId);
            if (prev) {
                prev.classList.remove('epBmH');
                prev.setAttribute('aria-selected', 'false');
                prev.setAttribute('tabindex', '-1');
            }
        }

        /* Select new */
        selectedEmailId = emailId;
        const next = document.getElementById('email-' + emailId);
        if (next) {
            next.classList.add('epBmH');
            next.setAttribute('aria-selected', 'true');
            next.setAttribute('tabindex', '0');
        }

        /* Update MailList data attribute */
        const mailList = document.querySelector(SEL.mailList);
        if (mailList) {
            mailList.setAttribute('data-active-email', emailId);
        }

        /* Mark as read + show in reading pane */
        const email = emailMap[emailId];
        if (email) {
            markAsRead(emailId);
            showEmailInReadingPane(email);
        }
    }

    /* ================================================================
       Event delegation – one click handler on the list container
       ================================================================ */

    function attachClickHandler() {
        const container = document.querySelector(SEL.listContainer);
        if (!container) return;

        container.addEventListener('click', function (e) {
            const emailItem = e.target.closest('.email-item');
            if (!emailItem) return;

            const emailId = parseInt(emailItem.getAttribute('data-email-id'), 10);
            if (!isNaN(emailId)) {
                selectEmail(emailId);
            }
        });
    }

    /* ================================================================
       Unread badge – count unread emails and show on sidebar
       ================================================================ */

    function getUnreadCount() {
        var count = 0;
        for (var id in emailMap) {
            if (!emailMap[id].isRead) count++;
        }
        return count;
    }

    function updateUnreadBadges() {
        var unreadCount = getUnreadCount();

        /* Find all "Doručená pošta" nav items and add/update badge */
        var navFolders = document.querySelectorAll('.nav-folder[title="Doručená pošta"]');
        navFolders.forEach(function (folder) {
            var existing = folder.querySelector('.unread-badge');
            if (existing) existing.remove();

            if (unreadCount > 0) {
                var badge = document.createElement('span');
                badge.className = 'unread-badge';
                badge.textContent = unreadCount;
                folder.appendChild(badge);
            }
        });
    }

    /* ================================================================
       Mark email as read
       ================================================================ */

    function markAsRead(emailId) {
        var email = emailMap[emailId];
        if (!email || email.isRead) return;

        email.isRead = true;

        /* Remove unread styling from the list item */
        var item = document.getElementById('email-' + emailId);
        if (item) {
            item.classList.remove('unread');
        }

        /* Update sidebar badges */
        updateUnreadBadges();
    }

    /* ================================================================
       Utilities
       ================================================================ */

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function escapeAttr(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    /* ================================================================
       Three-dot menu (More items) logic
       ================================================================ */

    var _subTimer = null;

    function closeAllMenus() {
        var menu = document.getElementById('moreItemsMenu');
        var sub = document.getElementById('nahlasitSubmenu');
        if (menu) menu.classList.remove('open');
        if (sub) sub.classList.remove('open');
    }

    function setupMoreItemsMenu() {
        var btn = document.getElementById('moreItemsBtn');
        var menu = document.getElementById('moreItemsMenu');
        var nahlasitItem = document.getElementById('nahlasitMenuItem');
        var submenu = document.getElementById('nahlasitSubmenu');

        if (!btn || !menu) return;

        /* Toggle main menu on button click */
        btn.addEventListener('click', function (e) {
            e.stopPropagation();

            /* Already open → close */
            if (menu.classList.contains('open')) {
                closeAllMenus();
                return;
            }

            /* Nothing selected → do nothing */
            if (!selectedEmailId) return;

            /* Position: right-align menu with the button */
            var rect = btn.getBoundingClientRect();
            menu.style.top = (rect.bottom + 2) + 'px';
            menu.style.right = (window.innerWidth - rect.right) + 'px';
            menu.style.left = 'auto';
            menu.style.maxHeight = (window.innerHeight - rect.bottom - 10) + 'px';
            menu.classList.add('open');
        });

        /* Nahlásit hover → show submenu to the left */
        if (nahlasitItem && submenu) {
            nahlasitItem.addEventListener('mouseenter', function () {
                clearTimeout(_subTimer);
                var menuRect = menu.getBoundingClientRect();
                var itemRect = nahlasitItem.getBoundingClientRect();
                submenu.style.top = (itemRect.top - 4) + 'px';
                submenu.style.right = (window.innerWidth - menuRect.left + 2) + 'px';
                submenu.style.left = 'auto';
                submenu.classList.add('open');
            });
            nahlasitItem.addEventListener('mouseleave', function () {
                _subTimer = setTimeout(function () {
                    submenu.classList.remove('open');
                }, 200);
            });
            submenu.addEventListener('mouseenter', function () {
                clearTimeout(_subTimer);
            });
            submenu.addEventListener('mouseleave', function () {
                submenu.classList.remove('open');
            });
        }

        /* Report spam */
        var spamBtn = document.getElementById('reportSpamBtn');
        if (spamBtn) {
            spamBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                closeAllMenus();
                showReportModal('spam');
            });
        }

        /* Report phishing */
        var phishBtn = document.getElementById('reportPhishingBtn');
        if (phishBtn) {
            phishBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                closeAllMenus();
                showReportModal('phishing');
            });
        }

        /* Close menus when clicking outside */
        document.addEventListener('click', function () {
            closeAllMenus();
        });

        /* Prevent clicks inside menus from bubbling to document */
        menu.addEventListener('click', function (e) { e.stopPropagation(); });
        if (submenu) {
            submenu.addEventListener('click', function (e) { e.stopPropagation(); });
        }
    }

    /* ================================================================
       Report modals (spam / phishing)
       ================================================================ */

    function showReportModal(type) {
        var id = type === 'spam' ? 'reportSpamModal' : 'reportPhishingModal';
        var modal = document.getElementById(id);
        if (modal) modal.classList.add('open');
    }

    function hideReportModal(type) {
        var id = type === 'spam' ? 'reportSpamModal' : 'reportPhishingModal';
        var modal = document.getElementById(id);
        if (modal) modal.classList.remove('open');
    }

    function flagCurrentEmail(type) {
        if (!selectedEmailId) return;

        userFlags[selectedEmailId] = type;

        /* Hide the email from the list */
        var emailEl = document.getElementById('email-' + selectedEmailId);
        if (emailEl) emailEl.style.display = 'none';

        /* Reset reading pane to empty state */
        var empty = document.getElementById('reading-pane-empty');
        var content = document.getElementById('ReadingPaneContainerId');
        if (empty) empty.style.display = '';
        if (content) content.style.display = 'none';

        /* Check if all emails in a group are hidden → hide the group header */
        checkEmptyGroups();

        selectedEmailId = null;
    }

    function checkEmptyGroups() {
        var groups = document.querySelectorAll('.email-group');
        groups.forEach(function (group) {
            var items = group.querySelectorAll('.email-item');
            var allHidden = true;
            items.forEach(function (item) {
                if (item.style.display !== 'none') allHidden = false;
            });
            var header = group.querySelector('.email-group-header');
            if (header) {
                header.style.display = allHidden ? 'none' : '';
            }
        });
    }

    function setupReportModals() {
        /* Spam modal */
        var confirmSpam = document.getElementById('confirmSpamBtn');
        var cancelSpam = document.getElementById('cancelSpamBtn');
        if (confirmSpam) {
            confirmSpam.addEventListener('click', function () {
                flagCurrentEmail('spam');
                hideReportModal('spam');
            });
        }
        if (cancelSpam) {
            cancelSpam.addEventListener('click', function () {
                hideReportModal('spam');
            });
        }

        /* Phishing modal */
        var confirmPhishing = document.getElementById('confirmPhishingBtn');
        var cancelPhishing = document.getElementById('cancelPhishingBtn');
        if (confirmPhishing) {
            confirmPhishing.addEventListener('click', function () {
                flagCurrentEmail('phishing');
                hideReportModal('phishing');
            });
        }
        if (cancelPhishing) {
            cancelPhishing.addEventListener('click', function () {
                hideReportModal('phishing');
            });
        }
    }

    /* ================================================================
       Outlook button – evaluate user flags
       ================================================================ */

    function setupEvaluation() {
        var evalBtn = document.getElementById('outlookEvalBtn');
        if (!evalBtn) return;

        evalBtn.addEventListener('click', function (e) {
            e.preventDefault();

            var allCorrect = true;
            var mistakes = [];

            for (var id in emailMap) {
                var email = emailMap[id];
                var correctType = email.type || 'normal';
                var userFlag = userFlags[id] || null;

                if (correctType === 'normal') {
                    if (userFlag !== null) {
                        allCorrect = false;
                        mistakes.push({ email: email, expected: 'normal', got: userFlag });
                    }
                } else {
                    if (userFlag !== correctType) {
                        allCorrect = false;
                        mistakes.push({ email: email, expected: correctType, got: userFlag });
                    }
                }
            }

            showEvalModal(allCorrect, mistakes);
        });
    }

    function showEvalModal(allCorrect, mistakes) {
        var modal = document.getElementById('evalModal');
        var title = document.getElementById('evalModalTitle');
        var text = document.getElementById('evalModalText');
        var btn = document.getElementById('evalModalBtn');

        if (!modal || !title || !text || !btn) return;

        if (allCorrect) {
            title.textContent = 'Gratulujeme!';
            text.innerHTML = 'Správně jste identifikovali všechny nebezpečné e-maily. Výborná práce!';
            title.style.color = '#0e700e';
        } else {
            title.textContent = 'Zkuste to znovu';
            var html = '<p>Některé e-maily nebyly označeny správně:</p>';
            html += '<ul style="margin-top:8px;padding-left:20px;">';
            var labels = { spam: 'spam', phishing: 'phishing', normal: 'normální' };
            for (var i = 0; i < mistakes.length; i++) {
                var m = mistakes[i];
                var got = m.got ? labels[m.got] : 'neoznačen';
                html += '<li><strong>' + escapeHtml(m.email.subject) + '</strong> — správně: ' + labels[m.expected] + ', vaše označení: ' + got + '</li>';
            }
            html += '</ul>';
            text.innerHTML = html;
            title.style.color = '#c4314b';
        }

        modal.classList.add('open');

        /* Replace button to avoid stacking listeners */
        var newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener('click', function () {
            modal.classList.remove('open');
            window.location.reload();
        });
    }

    /* ================================================================
       Init
       ================================================================ */

    async function init() {
        try {
            const resp = await fetch('emails.json');
            if (!resp.ok) throw new Error('Failed to load emails.json: ' + resp.status);
            const data = await resp.json();
            emailData = data;

            /* Build flat map + group map */
            for (const group of data.groups) {
                for (const email of group.emails) {
                    emailMap[email.id] = email;
                    emailGroupMap[email.id] = group.id;
                }
            }

            /* No email selected by default – empty state shown */

            /* Render email list */
            const container = document.querySelector(SEL.listContainer);
            if (!container) {
                console.error('Email list container not found');
                return;
            }
            container.innerHTML = data.groups.map(buildGroup).join('');

            /* Attach click handler */
            attachClickHandler();

            /* Update unread badges in sidebar */
            updateUnreadBadges();

            /* Setup three-dot menu, report modals, evaluation */
            setupMoreItemsMenu();
            setupReportModals();
            setupEvaluation();

        } catch (err) {
            console.error('Outlook clone init error:', err);
        }
    }

    /* Wait for DOM, then go */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
