/*
 * script.js – logika simulace. Texty a data jsou v config.json.
 * Nic se neodesílá ani neukládá; stav žije jen v paměti stránky.
 */
(() => {
  'use strict';

  // Texty, zprávy, kroky průvodce a vlajka jsou v config.json.
  // fetch funguje jen přes webový server (http/https), ne po otevření souboru z disku (file://).
  fetch('config.json', { cache: 'no-cache' })
    .then((r) => {
      if (!r.ok) throw new Error(`config.json: HTTP ${r.status}`);
      return r.json();
    })
    .then(start, showLoadError);

  function showLoadError(err) {
    console.error(err);
    const intro = document.getElementById('intro');
    const title = document.createElement('h1');
    title.textContent = 'Simulaci se nepodařilo načíst';
    const text = document.createElement('p');
    text.textContent = window.location.protocol === 'file:'
      ? 'Stránka je otevřená přímo ze souboru a prohlížeč pak nedovolí načíst config.json. Spusťte ji přes webový server, například příkazem python -m http.server, nebo ji otevřete na webu školy.'
      : 'Soubor config.json chybí nebo obsahuje chybu (například chybějící čárku nebo uvozovky). Zkontrolujte jej.';
    const detail = document.createElement('code');
    detail.textContent = String(err);
    const wrap = document.createElement('div');
    wrap.className = 'intro-text';
    wrap.append(text, detail);
    intro.replaceChildren(title, wrap);
  }

  function start(C) {
    const $ = (sel, root = document) => root.querySelector(sel);
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const icon = (name, cls = 'i') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
    const ticks = (read) => `<svg class="ticks${read ? ' read' : ''}" viewBox="0 0 18 12" aria-label="${read ? 'Přečteno' : 'Doručeno'}"><use href="#i-ticks"/></svg>`;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const stepIndex = (id) => C.steps.findIndex((s) => s.id === id);
    const wide = () => window.matchMedia('(min-width: 960px)').matches;

    const phone = $('#phone');
    const chatBody = $('#chat-body');
    const menu = $('#menu');
    const menuBtn = $('#chats-menu');
    const viewer = $('#viewer');
    const scanner = $('#scanner');
    const sheet = $('#sheet');
    const scanDialog = $('#scan-dialog');
    const endDialog = $('#end-dialog');

    // tried: vyzkoušené volby v kroku „Výběr postupu“ (jen { call: true }; po skenování se k výběru nevrací).
    const state = { choice: null, tried: {}, chatOpened: false, solved: false };

    /* ---------------- Vykreslení obsahu z config.json ---------------- */

    // Pevné nápisy jsou přímo v index.html; z config.json se doplní jen kontakt a čas.
    function renderContact() {
      $('#status-time').textContent = C.statusTime;
      $('#chat-avatar').src = C.contact.avatar;
      $('#chat-name').textContent = C.contact.name;
      $('#chat-status').textContent = C.contact.status;
      $('#viewer-title').textContent = C.contact.name;
    }

    function renderChatList() {
      $('#chatlist').innerHTML = C.chatList.map((c) => {
        const isTarget = c.id === 'verca';
        const tag = isTarget ? 'button' : 'div';
        const attrs = isTarget ? ' type="button" id="chatrow-verca"' : '';
        return `<li><${tag} class="chatrow${c.unread ? ' unread' : ''}"${attrs}>
          <img class="avatar" src="${esc(c.avatar)}" alt="">
          <span class="chatrow-main">
            <span class="chatrow-top"><span class="chatrow-name">${esc(c.name)}</span><span class="chatrow-time">${esc(c.time)}</span></span>
            <span class="chatrow-bottom">
              <span class="chatrow-last">${c.ticks ? ticks(c.ticks === 'read') : ''}<span>${esc(c.last)}</span></span>
              ${c.unread ? `<span class="unread-count" aria-label="${c.unread} nepřečtené">${c.unread}</span>` : ''}
            </span>
          </span></${tag}></li>`;
      }).join('');
    }

    function qrCard(m) {
      return `<button type="button" class="qr-card" id="qr-open" aria-label="Obrázek: ${esc(m.title)}, ${esc(m.caption)}. Otevřít obrázek.">
        <span class="qr-card-head">${esc(m.title)}</span>
        <img class="qr-img" src="img/qr.png" alt="">
        <span class="qr-card-foot">${esc(m.caption)}</span></button>`;
    }

    function messagesHTML(list) {
      return list.map((m, i) => {
        if (m.day) return `<p class="day-chip">${esc(m.day)}</p>`;
        const prev = list[i - 1];
        const dir = m.from === 'me' ? 'out' : 'in';
        const tail = !prev || prev.day || prev.from !== m.from ? ' tail' : '';
        const id = m.id ? ` id="${esc(m.id)}"` : '';
        const meta = `<span class="meta">${esc(m.time)}${dir === 'out' ? ticks(true) : ''}</span>`;
        if (m.type === 'qr') return `<div class="msg ${dir}${tail} msg-img"${id}>${qrCard(m)}${meta}</div>`;
        return `<div class="msg ${dir}${tail}"${id}><span>${esc(m.text)}</span>${meta}</div>`;
      }).join('');
    }

    function renderChat() {
      $('#msgs-history').innerHTML = messagesHTML(C.chat.history);
      $('#msgs-today').innerHTML =
        `<p class="day-chip">${esc(C.chat.todayLabel)}</p><p class="unread-banner">${esc(C.chat.unreadBanner)}</p>` +
        messagesHTML(C.chat.today);
    }

    function renderDevices() {
      $('#devices').innerHTML = C.devices.map((d) => {
        const tag = d.unknown ? 'button' : 'div';
        return `<li><${tag} ${d.unknown ? 'type="button" ' : ''}class="device" id="${esc(d.id)}">
          <span class="device-icon">${icon(d.icon)}</span>
          <span class="device-text"><span class="row-title">${esc(d.name)}</span><span class="row-sub">${esc(d.detail)}</span></span>
        </${tag}></li>`;
      }).join('');
    }

    /* ---------------- Navigace v telefonu ---------------- */

    const SCREENS = ['chats', 'chat', 'settings', 'linked'];
    let stack = ['chats'];

    function showScreen(name) {
      SCREENS.forEach((s) => { $('#screen-' + s).hidden = s !== name; });
      phone.dataset.screen = name;
      if (name === 'chat') onChatOpen();
      // Fokus by jinak zůstal na skrytém tlačítku.
      const active = document.activeElement;
      if (active && active !== document.body && active.closest('[hidden]')) {
        const first = $('#screen-' + name + ' button:not(:disabled)');
        if (first) first.focus({ preventScroll: true });
      }
    }

    function nav(name, opts = {}) {
      closeMenu(true);
      if (opts.reset) stack = name === 'chats' ? ['chats'] : ['chats', name];
      else if (stack[stack.length - 1] !== name) stack.push(name);
      showScreen(name);
      if (!opts.silent) {
        emit('screen:' + name);
        syncTour();
      }
    }

    function back() {
      if (stack.length < 2) return;
      stack.pop();
      const name = stack[stack.length - 1];
      showScreen(name);
      emit('screen:' + name);
      syncTour();
    }

    function onChatOpen() {
      if (state.chatOpened) return;
      state.chatOpened = true;
      // Nové zprávy „přijdou“ postupně.
      document.querySelectorAll('#msgs-today .msg').forEach((m, i) => {
        m.style.setProperty('--d', `${i * 0.18}s`);
        m.classList.add('arrive');
      });
      const row = $('#chatrow-verca');
      row.classList.remove('unread');
      const count = row.querySelector('.unread-count');
      if (count) count.remove();
      $('#tab-badge').hidden = true;
      chatBody.scrollTop = $('#msgs-today .unread-banner').offsetTop - 40;
    }

    /* ---------------- Nabídka, toast, překryvy ---------------- */

    function openMenu() {
      menu.hidden = false;
      menuBtn.setAttribute('aria-expanded', 'true');
      menu.querySelector('button:not(:disabled)').focus({ preventScroll: true });
      emit('menu:open');
    }

    function closeMenu(silent) {
      if (menu.hidden) return;
      menu.hidden = true;
      menuBtn.setAttribute('aria-expanded', 'false');
      if (!silent) {
        menuBtn.focus({ preventScroll: true });
        emit('menu:close');
        syncTour();
      }
    }

    let toastTimer = 0;
    function toast(msg) {
      const t = $('#toast');
      t.textContent = msg;
      t.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
    }

    let returnFocus = null;
    function openLayer(layer, focusEl) {
      returnFocus = document.activeElement;
      layer.hidden = false;
      focusEl.focus({ preventScroll: true });
    }
    function closeLayer(layer) {
      layer.hidden = true;
      if (returnFocus && document.contains(returnFocus) && !returnFocus.closest('[hidden]')) returnFocus.focus({ preventScroll: true });
      returnFocus = null;
    }

    function openViewer() {
      tourPause();
      phone.dataset.dark = '';
      // Stejná karta jako v chatu, jen jako obrázek (ne tlačítko).
      $('#viewer-img').innerHTML = qrCard(C.chat.today.find((m) => m.type === 'qr'))
        .replace(/^<button type="button" class="qr-card" id="qr-open"/, '<div class="qr-card" role="img"')
        .replace(/<\/button>$/, '</div>');
      openLayer(viewer, $('#viewer-scan'));
    }
    function closeViewer(resume = true) {
      delete phone.dataset.dark;
      closeLayer(viewer);
      if (resume) tourResume();
    }

    function openSheet() {
      const d = C.devices.find((x) => x.unknown);
      $('#sheet-title').textContent = d.name;
      $('#sheet-info').innerHTML = d.info.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
      openLayer(sheet, $('#sheet-logout'));
      emit('device:open');
    }
    function closeSheet(silent) {
      if (sheet.hidden) return;
      closeLayer(sheet);
      if (!silent) {
        emit('device:close');
        syncTour();
      }
    }

    /* ---------------- Simulace skenování (bez skutečného následku) ---------------- */

    // Fáze: fotoaparát → nalezený odkaz (.result, průvodce upozorní na kontrolu adresy)
    // → po kliknutí na odkaz propojování (.linking) → vysvětlující dialog.
    let scanning = false;
    let scanTimer = 0;
    function startScan() {
      if (scanning) return;
      scanning = true;
      tourPause();
      if (!viewer.hidden) closeViewer(false);
      phone.dataset.dark = '';
      $('#scan-url').textContent = C.qrLink;
      $('#scan-url').scrollLeft = 0;
      scanner.classList.remove('result', 'linking');
      scanner.hidden = false;
      scanTimer = setTimeout(() => {
        scanner.classList.add('result');
        tour.note($('#scan-link'), C.scanTip.title, esc(C.scanTip.text));
      }, reduced ? 300 : 1500);
    }

    // Zpět do chatu bez otevření odkazu: průvodce se vrátí k výběru postupu (skenování zůstává nevyzkoušené).
    function closeScanner() {
      if (scanner.hidden || scanner.classList.contains('linking')) return;
      clearTimeout(scanTimer);
      tour.hide();
      scanner.hidden = true;
      scanner.classList.remove('result');
      delete phone.dataset.dark;
      scanning = false;
      tourResume();
    }

    // Odkaz je jen tlačítko s textem adresy: nikam nenaviguje, simulace jen pokračuje propojováním.
    function openScanLink() {
      if (!scanner.classList.contains('result')) return;
      tour.hide();
      const t = reduced ? 500 : 1800;
      scanner.style.setProperty('--link-ms', `${t}ms`);
      scanner.classList.replace('result', 'linking');
      setTimeout(() => {
        scanner.hidden = true;
        delete phone.dataset.dark;
        scanning = false;
        scanDialog.showModal();
      }, t);
    }

    // Kolečko myši posouvá adresu do strany (na dotykovém displeji stačí táhnout prstem).
    $('#scan-url').addEventListener('wheel', e => {
      if (!e.deltaY || e.deltaX) return;
      e.preventDefault();
      e.currentTarget.scrollLeft += e.deltaY;
    }, { passive: false });

    // Naskenování z kroku „Výběr postupu“ vede rovnou k počítači útočníka. Naskenování v dřívějším
    // kroku se nezapočítá: průvodce pokračuje tam, kde byl.
    const scanFromDecision = () => pausedIdx >= 0 && pausedIdx === stepIndex('decision');
    scanDialog.addEventListener('close', () => {
      if (!scanFromDecision()) { tourResume(); return; }
      pausedIdx = -1;
      go(stepIndex('reveal'));
    });

    /* ---------------- Průvodce ---------------- */

    const hasDriver = !!(window.driver && window.driver.js && typeof window.driver.js.driver === 'function');
    let tourOn = false;
    let tourIdx = -1;
    let pausedIdx = -1;

    // Rámeček kolem obou QR kódů pro krok „Vidíš to?“.
    const compareFrame = document.createElement('div');
    compareFrame.className = 'compare-frame';
    compareFrame.id = 'compare-frame';
    document.body.appendChild(compareFrame);

    // Zprávy v chatu se zvýrazní pruhem přes celou šířku chatu (až k okrajům), ne jen kolem bubliny.
    const STAGE_PAD = 6; // stejné jako stagePadding u driver.js
    const chatBand = document.createElement('div');
    chatBand.className = 'compare-frame';
    document.body.appendChild(chatBand);
    function placeBand(el) {
      const c = chatBody.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const top = Math.max(r.top, c.top + STAGE_PAD);
      const bottom = Math.min(r.bottom, c.bottom - STAGE_PAD);
      Object.assign(chatBand.style, {
        left: `${c.left + window.scrollX + STAGE_PAD}px`, top: `${top + window.scrollY}px`,
        width: `${c.width - STAGE_PAD * 2}px`, height: `${bottom - top}px`,
      });
      return chatBand;
    }

    function buttonsFor(s, i) {
      if (s.kind === 'wait' || s.kind === 'decision') return [];
      const prev = C.steps[i - 1];
      return prev && prev.kind === 'info' ? ['next', 'previous'] : ['next'];
    }

    function decisionHTML(s) {
      const buttons = C.choices.map((c) => {
        const done = !!state.tried[c.id];
        return `<button type="button" class="choice" data-choice="${esc(c.id)}"${done ? ' disabled' : ''}>${esc(c.label)}${done ? `<small>${esc(c.done)}</small>` : ''}</button>`;
      }).join('');
      return `<p>${esc(s.text)}</p><div class="choices">${buttons}</div>`;
    }

    function positionCompare() {
      const a = $('#msg-qr').getBoundingClientRect();
      const b = $('#attacker-qr').getBoundingClientRect();
      const pad = 8;
      const r = {
        left: Math.min(a.left, b.left), top: Math.min(a.top, b.top),
        right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom),
      };
      Object.assign(compareFrame.style, {
        left: `${r.left + window.scrollX - pad}px`, top: `${r.top + window.scrollY - pad}px`,
        width: `${r.right - r.left + pad * 2}px`, height: `${r.bottom - r.top + pad * 2}px`,
      });
    }

    const stepEl = (i) => {
      const e = C.steps[i].element;
      if (e === 'compare') return wide() ? compareFrame : $('#compare-strip');
      return e ? $(e) : null;
    };
    const isVisible = (el) => el.getClientRects().length > 0;

    // Posune jen chat (ne celou stránku), aby byl prvek celý vidět: menší na střed, větší od horního okraje.
    // Okamžitě, ať driver.js změří už konečnou polohu a nescrolluje sám.
    function scrollChatTo(el) {
      const top = el.getBoundingClientRect().top - chatBody.getBoundingClientRect().top + chatBody.scrollTop;
      const free = chatBody.clientHeight - el.offsetHeight;
      chatBody.scrollTop = free > 16 ? top - free / 2 : top - 8;
    }

    function prepareCompare() {
      scrollChatTo($('#msg-qr'));
      $('#msg-qr .qr-card').classList.add('qr-glow');
      $('#attacker-qr').classList.add('qr-glow');
      positionCompare();
    }

    /* Krok „přečtení konverzace“ (kind "read"): tlačítko v okně průvodce se odemkne až po posunu
       chatu nahoru i dolů; do té doby ukazuje nápovědu (hint). */
    function updateReading() {
      const s = C.steps[tourIdx];
      if (!s || s.kind !== 'read' || pausedIdx >= 0 || $('#tour-box').hidden) return;
      if (chatBody.scrollTop <= 8) state.readTop = true;
      if (chatBody.scrollTop + chatBody.clientHeight >= chatBody.scrollHeight - 8) state.readBottom = true;
      const done = !!(state.readTop && state.readBottom);
      const next = $('#tour-box-next');
      next.disabled = !done;
      next.textContent = done ? s.button : s.hint;
    }

    function go(i) {
      const s = C.steps[i];
      if (!s) {
        if (i >= C.steps.length) finish(); // za posledním krokem následuje okno s vlajkou
        return;
      }
      tourIdx = i;
      // Z chatu jde odejít až od kroku „back“, kdy k tomu vyzve průvodce. Nastavuje se při každém kroku,
      // aby se šipka znovu zamkla i po návratu tlačítkem Zpět na dřívější krok.
      $('#chat-back').disabled = i < stepIndex('back');
      // Nabídka (cesta do Nastavení) se odemkne až v kroku „menu“, jinak by šlo úkol zkrátit.
      $('#chats-menu').disabled = i < stepIndex('menu');
      document.querySelectorAll('.qr-glow').forEach((el) => el.classList.remove('qr-glow'));
      if (s.screen && phone.dataset.screen !== s.screen) nav(s.screen, { silent: true, reset: true });
      if (s.reveal) $('#attacker').hidden = false;
      let title = s.title;
      let html = esc(s.text);
      if (s.kind === 'decision') html = decisionHTML(s);
      if (s.kind === 'praise') {
        const p = C.praise[state.choice];
        title = p.title;
        // Po pochvale se vrací k výběru, kde zbývá vyzkoušet naskenování.
        html = esc(`${p.text} ${p.tryScan}`);
      }
      const el = stepEl(i);
      if (el && el !== chatBody && chatBody.contains(el)) scrollChatTo(el);
      if (s.compare) prepareCompare();
      tour.show(i, title, html);
      if (s.kind === 'read') {
        updateReading();
        chatBody.focus({ preventScroll: true }); // posun chatu i šipkami z klávesnice
      }
    }

    // Po akci uživatele: ukazuje-li průvodce na prvek, který už není vidět (zavřená nabídka, krok zpět,
    // návrat do chatu), vrátí se k poslednímu viditelnému čekacímu kroku.
    function syncTour() {
      if (!tourOn || pausedIdx >= 0) return;
      const s = C.steps[tourIdx];
      const el = stepEl(tourIdx);
      if (s.kind !== 'wait' || !el || isVisible(el)) return;
      for (let k = tourIdx - 1; k >= 0 && C.steps[k].kind === 'wait'; k--) {
        const prev = stepEl(k);
        if (prev && isVisible(prev)) { go(k); return; }
      }
    }

    // Posun průvodce po akci uživatele. Přeskočit lze jen řetězec čekacích kroků.
    function emit(evt) {
      if (!tourOn || pausedIdx >= 0 || tourIdx < 0) return;
      const cur = C.steps[tourIdx];
      if (cur.backOn === evt) { go(tourIdx - 1); return; }
      for (let k = tourIdx; k < C.steps.length && C.steps[k].kind === 'wait'; k++) {
        if (C.steps[k].waitFor === evt) {
          if (k + 1 < C.steps.length) go(k + 1);
          return;
        }
      }
    }

    function tourPause() {
      if (!tourOn || pausedIdx >= 0) return;
      pausedIdx = tourIdx;
      tour.hide();
    }
    function tourResume() {
      if (pausedIdx < 0) return;
      const i = pausedIdx;
      pausedIdx = -1;
      go(i);
    }

    // Okno průvodce je vždy vlastní (#tour-box) a stojí vedle telefonu nebo počítače, aby nic
    // nepřekrývalo. driver.js (je-li načtený) jen zvýrazní prvek a u kroků "dim" ztmaví okolí.
    const box = $('#tour-box');
    const NEXT_LABEL = $('#tour-box-next').textContent; // krok „read“ popisek dočasně mění
    const stage = $('#stage');
    const attacker = $('#attacker');
    const tour = {
      drv: hasDriver ? window.driver.js.driver({
        allowClose: false,
        allowKeyboardControl: false, // šipky obsluhuje okno průvodce
        overlayClickBehavior: () => {},
        overlayOpacity: 0.62,
        stagePadding: STAGE_PAD,
        stageRadius: 10,
        animate: !reduced,
      }) : null,
      target: null,
      opts: {},
      show(i, title, html) {
        const s = C.steps[i];
        const el = stepEl(i);
        this.render({
          el, title, html,
          dim: !!s.dim,
          // Výklad ve ztmaveném kroku zablokuje telefon i počítač (inert: nejde klikat, posouvat ani tabovat).
          // Výjimky: kroky „klikni na…“ (jde kliknout jen na zvýrazněný prvek, zbytek blokuje driver.css)
          // a kroky se "scroll": true (chat jde posouvat).
          lock: !!s.dim && s.kind !== 'wait' && !s.scroll,
          scroll: !!s.scroll,
          center: !!s.center,
          compare: !!s.compare,
          buttons: buttonsFor(s, i),
          focusEl: s.kind === 'wait' && el && el.matches('button') ? el : null,
        });
      },
      // Okno mimo kroky ze config.json (upozornění na odkaz po naskenování): bez ztmavení, aby šlo i kopírovat odkaz.
      note(el, title, html) {
        this.render({ el, title, html, dim: false, buttons: [], focusEl: el });
      },
      render(o) {
        this.opts = o;
        const el = o.el;
        document.body.classList.toggle('tour-soft', !o.dim);
        document.body.classList.toggle('tour-scroll', !!o.scroll);
        stage.inert = !!o.lock;
        if (this.target) this.target.classList.remove('tour-target');
        this.target = el;
        if (el) el.scrollIntoView({ block: 'nearest' });
        this.inChat = !!el && chatBody.contains(el);
        if (this.drv) this.drv.highlight(el ? { element: this.inChat ? placeBand(el) : el } : {});
        else if (el) el.classList.add('tour-target');
        $('#tour-box-title').textContent = o.title;
        $('#tour-box-text').innerHTML = o.html;
        const next = $('#tour-box-next');
        next.textContent = NEXT_LABEL;
        next.disabled = false;
        next.hidden = !o.buttons.includes('next');
        $('#tour-box-prev').hidden = !o.buttons.includes('previous');
        box.hidden = false;
        this.place();
        const focusEl = o.focusEl || box.querySelector('.choice:not([disabled])') || box.querySelector('#tour-box-next:not([hidden])');
        if (focusEl) focusEl.focus({ preventScroll: true });
      },
      hide() {
        box.hidden = true;
        stage.inert = false;
        document.body.classList.remove('tour-soft', 'tour-scroll');
        if (this.target) this.target.classList.remove('tour-target');
        this.target = null;
        if (this.drv && this.drv.isActive()) this.drv.destroy();
      },
      refresh() {
        if (box.hidden) return;
        if (this.inChat) placeBand(this.target);
        if (this.drv && this.drv.isActive()) this.drv.refresh();
        this.place();
      },
      // Pořadí: vedle telefonu/počítače (šipka z boku) → mezi telefon a počítač → pod/nad prvek (úzký displej).
      place() {
        const G = 18;
        const M = 12;
        const W = box.offsetWidth;
        const H = box.offsetHeight;
        const vw = document.documentElement.clientWidth;
        const vh = window.innerHeight;
        const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
        const s = this.opts;
        if (s.center) {
          box.style.left = `${(vw - W) / 2}px`;
          box.style.top = `${clamp((vh - H) / 2, M, vh - H - M)}px`;
          delete box.dataset.arrow;
          return;
        }
        const ph = phone.getBoundingClientRect();
        const atk = attacker.hidden ? null : attacker.getBoundingClientRect();
        const t = this.target ? this.target.getBoundingClientRect() : null;
        const content = [ph, atk].filter(Boolean);
        const free = (x) => x >= M && x + W <= vw - M && content.every((b) => x + W <= b.left - G / 2 || x >= b.right + G / 2);

        let candidates;
        if (s.compare && atk) candidates = [(ph.right + atk.left - W) / 2];
        else if (this.target && attacker.contains(this.target)) candidates = [atk.left - G - W, atk.right + G];
        else candidates = [ph.right + G, ph.left - G - W];
        const x = candidates.find(free);

        let left;
        let top;
        let arrow = null;
        let arrowPos = 0;
        if (x !== undefined) {
          const cy = t ? t.top + t.height / 2 : ph.top + ph.height / 2;
          left = x;
          top = clamp(cy - H / 2, M, vh - H - M);
          if (t && !s.compare) {
            arrow = x > t.left ? 'left' : 'right';
            arrowPos = clamp(cy - top, 20, H - 20);
          }
        } else {
          // Úzká obrazovka: vedle se nevejde, okno jde pod nebo nad prvek (překryv se nedá vyloučit).
          left = clamp(t ? t.left + t.width / 2 - W / 2 : (vw - W) / 2, M, vw - W - M);
          if (t && t.bottom + G + H <= vh - M) { top = t.bottom + G; arrow = 'top'; }
          else if (t && t.top - G - H >= M) { top = t.top - G - H; arrow = 'bottom'; }
          else top = vh - H - M;
          if (arrow) arrowPos = clamp(t.left + t.width / 2 - left, 20, W - 20);
        }
        box.style.left = `${left}px`;
        box.style.top = `${top}px`;
        if (arrow) {
          box.dataset.arrow = arrow;
          box.style.setProperty('--arrow', `${arrowPos}px`);
        } else delete box.dataset.arrow;
      },
    };

    /* ---------------- Závěr a vlajka ---------------- */

    function finish() {
      if (state.solved) return;
      state.solved = true;
      tourOn = false;
      pausedIdx = -1;
      tour.hide();
      document.querySelectorAll('.qr-glow').forEach((el) => el.classList.remove('qr-glow'));
      $('#flag').textContent = atob(C.flag);
      $('#result-btn').hidden = false;
      endDialog.showModal();
    }

    function logoutDevice() {
      const row = $('#device-unknown');
      closeSheet(true);
      toast($('#toast').dataset.loggedOut);
      row.classList.add('leaving');
      setTimeout(() => { row.closest('li').remove(); tour.refresh(); }, reduced ? 0 : 420);
      // Po odhlášení ještě poslední krok průvodce (upozornění kontaktu), pak okno s vlajkou.
      const last = stepIndex('warn');
      if (tourOn && last >= 0) go(last);
      else finish();
    }

    async function copyFlag() {
      const flag = $('#flag');
      try {
        await navigator.clipboard.writeText(flag.textContent);
        $('#copy-label').textContent = $('#copy-label').dataset.copied;
        $('#copy-msg').textContent = '';
      } catch {
        // Schránka není dostupná (např. bez HTTPS): označ vlajku k ručnímu zkopírování.
        const range = document.createRange();
        range.selectNodeContents(flag);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        $('#copy-msg').textContent = $('#copy-msg').dataset.fallback;
      }
    }

    // Zkopíruje adresu z QR kódu; ikona se na chvíli změní na fajfku. Bez schránky (bez HTTPS) adresu jen označí.
    let copyTimer = 0;
    async function copyScanLink() {
      const icon = $('#scan-copy use');
      try {
        await navigator.clipboard.writeText(C.qrLink);
        icon.setAttribute('href', '#i-check');
        clearTimeout(copyTimer);
        copyTimer = setTimeout(() => icon.setAttribute('href', '#i-copy'), 1500);
      } catch {
        window.getSelection().selectAllChildren($('#scan-url'));
      }
    }

    /* ---------------- Události ---------------- */

    document.addEventListener('click', (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;

      const choice = t.closest('[data-choice]');
      if (choice && !choice.disabled) {
        if (choice.dataset.choice === 'scan') startScan();
        else { state.choice = choice.dataset.choice; state.tried[state.choice] = true; go(stepIndex('praise')); }
        return;
      }

      // Klik mimo otevřenou nabídku ji zavře (kromě kliknutí do okna průvodce).
      if (!menu.hidden && !menu.contains(t) && !menuBtn.contains(t) && !t.closest('#tour-box')) closeMenu();

      if (t.closest('[data-back]') || t.closest('#chat-back')) { back(); return; }
      if (t.closest('#chatrow-verca')) { nav('chat'); return; }
      if (t.closest('#chats-menu')) { if (menu.hidden) openMenu(); else closeMenu(); return; }
      if (t.closest('#menu-settings')) { closeMenu(true); nav('settings'); return; }
      if (t.closest('#menu-linked') || t.closest('#settings-linked')) { closeMenu(true); nav('linked'); return; }
      if (t.closest('#qr-open')) { openViewer(); return; }
      if (t.closest('#viewer-close')) { closeViewer(); return; }
      if (t.closest('#viewer-scan')) { startScan(); return; }
      if (t.closest('#device-unknown')) { openSheet(); return; }
      if (t.closest('#sheet-close') || t === sheet) { closeSheet(); return; }
      if (t.closest('#sheet-logout')) { logoutDevice(); return; }
      if (t.closest('#scan-link')) { openScanLink(); return; }
      if (t.closest('#scan-copy')) { copyScanLink(); return; }
      if (t.closest('#scan-back')) { closeScanner(); return; }
      if (t.closest('#tour-box-next')) {
        go(C.steps[tourIdx].kind === 'praise' ? stepIndex('decision') : tourIdx + 1);
        return;
      }
      if (t.closest('#tour-box-prev')) { go(tourIdx - 1); }
    });

    $('#start-btn').addEventListener('click', () => {
      $('#intro').hidden = true;
      $('#stage').hidden = false;
      if (!hasDriver) $('#fallback-notice').hidden = false;
      tourOn = true;
      nav('chats', { silent: true, reset: true });
      go(0);
    });

    $('#scan-ok').addEventListener('click', () => scanDialog.close());
    $('#copy-btn').addEventListener('click', copyFlag);
    $('#end-close').addEventListener('click', () => endDialog.close());
    $('#result-btn').addEventListener('click', () => endDialog.showModal());

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!scanner.hidden) closeScanner();
        else if (!sheet.hidden) closeSheet();
        else if (!viewer.hidden) closeViewer();
        else if (!menu.hidden) closeMenu();
        return;
      }
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && menu.contains(document.activeElement)) {
        e.preventDefault();
        const items = [...menu.querySelectorAll('button:not(:disabled)')];
        const k = items.indexOf(document.activeElement) + (e.key === 'ArrowDown' ? 1 : -1);
        items[(k + items.length) % items.length].focus();
        return;
      }
      // Šipky ovládají okno průvodce (Další / Zpět), pokud je tlačítko vidět.
      if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !box.hidden) {
        const btn = $(e.key === 'ArrowRight' ? '#tour-box-next' : '#tour-box-prev');
        if (!btn.hidden) { e.preventDefault(); btn.click(); }
      }
    });

    // Tab odchytíme dřív než driver.js, který by jinak držel fokus jen na zvýrazněném prvku
    // a do okna průvodce by se z klávesnice nešlo dostat. Udržíme jen fokus v okně uvnitř telefonu.
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      e.stopImmediatePropagation();
      const layer = [sheet, viewer].find((l) => !l.hidden);
      if (!layer) return;
      const f = [...layer.querySelectorAll('button')];
      const first = f[0];
      const last = f[f.length - 1];
      if (!layer.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }, true);

    window.addEventListener('resize', () => {
      if (tourOn && C.steps[tourIdx] && C.steps[tourIdx].compare) positionCompare();
      tour.refresh();
    });
    // Chat jde během průvodce volně posouvat; okno průvodce se posune se zvýrazněným prvkem.
    let scrollQueued = false;
    window.addEventListener('scroll', () => {
      if (scrollQueued) return;
      scrollQueued = true;
      requestAnimationFrame(() => { scrollQueued = false; tour.refresh(); });
    }, true);
    chatBody.addEventListener('scroll', updateReading, { passive: true });

    /* ---------------- Start ---------------- */

    renderContact();
    renderChatList();
    renderChat();
    renderDevices();
    showScreen('chats');
    $('#start-btn').disabled = false;
  }
})();
