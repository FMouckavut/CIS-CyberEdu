// Nejdříve si načteme prvky z HTML do proměnných, abychom s nimi mohli pracovat
const passwordInput = document.getElementById('password-input');
// ... (tvůj původní kód: const passwordInput = ...)
const togglePasswordBtn = document.getElementById('toggle-password');
const eyeIcon = document.getElementById('eye-icon');

const mfaCheckbox = document.getElementById('mfa-checkbox');
const lengthTextElement = document.getElementById('length-text');

const sqSelect = document.getElementById('sq-select');
const sqAnswer = document.getElementById('sq-answer');

const hintInput = document.getElementById('hint-input');
// Změnili jsme hintWarning na hintMessage
const hintMessage = document.getElementById('hint-message');

const checkBtn = document.getElementById('check-btn');

// Objekt obsahující všechny prvky požadavků
const requirements = {
    length: document.getElementById('req-length'),
    upper: document.getElementById('req-upper'),
    lower: document.getElementById('req-lower'),
    number: document.getElementById('req-number'),
    special: document.getElementById('req-special'),
    pwned: document.getElementById('req-pwned')
};

let requiredMinLength = 15;

// Funkce, která změní vzhled řádku podle toho, zda je pravidlo splněno
function updateRequirement(element, isValid, validClass) {
    if (isValid) {
        element.classList.add(validClass);
        element.querySelector('span').textContent = '✓'; // Změníme kolečko na fajfku
    } else {
        element.classList.remove(validClass);
        element.querySelector('span').textContent = '○'; // Vrátíme zpět na kolečko
    }
}

// 1. ČÁST: LOKÁLNÍ KONTROLA REGULÁRNÍMI VÝRAZY
function validatePasswordLocal(password) {
    // Kontrola délky (minimálně 12 znaků)
    updateRequirement(requirements.length, password.length >= requiredMinLength, 'valid-mandatory');
    
    // Kontrola velkého písmene (RegEx hledá cokoliv od A do Z)
    updateRequirement(requirements.upper, /[A-Z]/.test(password), 'valid-optional');
    
    // Kontrola malého písmene (RegEx hledá cokoliv od a do z)
    updateRequirement(requirements.lower, /[a-z]/.test(password), 'valid-optional');
    
    // Kontrola čísla (RegEx hledá číslici 0-9)
    updateRequirement(requirements.number, /[0-9]/.test(password), 'valid-optional');
    
    // Kontrola speciálního znaku (RegEx hledá cokoliv kromě písmen, číslic a mezer)
    updateRequirement(requirements.special, /[^A-Za-z0-9\s]/.test(password), 'valid-optional');
}

// 2. ČÁST: BEZPEČNÁ KONTROLA PROTI HIBP API (k-anonymita)
async function checkPwnedAPI(password) {
    // Pokud je heslo prázdné, zrušíme validaci
    if (!password) {
        updateRequirement(requirements.pwned, false, 'valid-mandatory');
        return;
    }

    try {
        // A. Zahešujeme heslo algoritmem SHA-1 (bezpečný prohlížečový standard API)
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-1', data);
        
        // Převedeme buffer na Hexadecimální řetězec (např. "5BAA6...")
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();

        // B. Rozdělíme hash pro k-anonymitu
        const prefix = hashHex.substring(0, 5); // Prvních 5 znaků posíláme API
        const suffix = hashHex.substring(5);    // Zbytek kontrolujeme jen my lokálně

        // C. Zavoláme API (posíláme JEN prefix!)
        const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
        const responseText = await response.text();

        // API nám vrátí textový seznam ve formátu "SUFFIX:počet_výskytů" oddělený novými řádky
        // Příklad řádku: "A0A1B2C3D4...:125"
        
        // D. Zjistíme, jestli se NÁŠ sufix nachází v datech od API
        const isPwned = responseText.includes(suffix);

        // Pokud NENÍ kompromitováno (isPwned === false), je to úspěch (true)
        updateRequirement(requirements.pwned, !isPwned, 'valid-mandatory');

    } catch (error) {
        console.error("Chyba při komunikaci s HIBP API:", error);
        // V případě výpadku API necháme položku v neutrálním stavu
    }
}

// 3. ČÁST: PROPOJENÍ S UŽIVATELSKÝM ROZHRANÍM
// Pro zabránění spamování API při každém stisku klávesy použijeme "Debounce"
// Kontrola API se spustí až 500ms poté, co uživatel přestane psát.
let timeoutId;

passwordInput.addEventListener('input', (event) => {
    const currentPassword = event.target.value;

    // Lokální kontrola se může dít okamžitě
    validatePasswordLocal(currentPassword);

    // Zrušíme předchozí čekání na volání API
    clearTimeout(timeoutId);
    
    // Nastavíme nové čekání
    timeoutId = setTimeout(() => {
        checkPwnedAPI(currentPassword);
    }, 500); // Čekáme 500 ms po posledním stisku klávesy

    hintInput.dispatchEvent(new Event('input'));
});

// Událost pro kliknutí na tlačítko s okem
togglePasswordBtn.addEventListener('click', () => {
    // 1. Zjistíme, jaký je aktuální stav inputu
    const isPassword = passwordInput.getAttribute('type') === 'password';
    
    // 2. Podle toho přepneme na opačný typ
    if (isPassword) {
        passwordInput.setAttribute('type', 'text');
        
        // Změníme SVG na "přeškrtnuté oko"
        eyeIcon.innerHTML = `
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
            <line x1="1" y1="1" x2="23" y2="23"></line>
        `;
    } else {
        passwordInput.setAttribute('type', 'password');
        
        // Změníme SVG zpět na "normální oko"
        eyeIcon.innerHTML = `
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
        `;
    }
});

// Událost pro zaškrtnutí/odškrtnutí MFA checkboxu
mfaCheckbox.addEventListener('change', (event) => {
    // Pokud je zaškrtnuto, chceme 8 znaků, jinak 15
    if (event.target.checked) {
        requiredMinLength = 8;
        lengthTextElement.textContent = 'Minimálně 8 znaků';
    } else {
        requiredMinLength = 15;
        lengthTextElement.textContent = 'Minimálně 15 znaků';
    }

    // DŮLEŽITÉ: Musíme ihned znovu zavolat validaci!
    // Co když uživatel už napsal 10 znaků a pak zapnul MFA? 
    // Musíme okamžitě přepočítat, zda to najednou splňuje pravidla.
    validatePasswordLocal(passwordInput.value);
});

// Hledáme událost 'change' (změna výběru) na našem rozbalovacím menu
sqSelect.addEventListener('change', (event) => {
    // Podíváme se na aktuálně vybranou hodnotu
    const selectedValue = event.target.value;

    if (selectedValue === 'none') {
        // Pokud vybral "Nenastavovat", přidáme poli třídu 'hidden' (skryjeme ho)
        sqAnswer.classList.add('hidden');
        // Zároveň pole vymažeme, aby tam nezůstala stará odpověď, kdyby si to rozmyslel
        sqAnswer.value = ''; 
    } else {
        // Pokud vybral jakoukoliv otázku, odebereme třídu 'hidden' (zobrazíme ho)
        sqAnswer.classList.remove('hidden');
        
        // Z pohledu dobrého UX (uživatelského zážitku) rovnou do pole přesuneme kurzor,
        // aby mohl uživatel začít okamžitě psát
        sqAnswer.focus();
    }
});

// Hlídáme psaní do pole pro nápovědu
hintInput.addEventListener('input', () => {
    const currentPassword = passwordInput.value.toLowerCase();
    const currentHint = hintInput.value.toLowerCase();

    // 1. Před každou kontrolou to "vyčistíme" do výchozího stavu
    hintMessage.className = 'hint-msg'; // Odstraní staré barvy i třídu hidden
    hintInput.style.borderColor = '';
    
    /*
    // 2. Kaskáda pravidel - od nejčastějšího po nejhorší
    if (currentHint === '') {
        // Prázdné pole - Edukujeme uživatele
        hintMessage.textContent = '💡 Tip: Nenastavovat nápovědu je často ta nejbezpečnější volba.';
        hintMessage.classList.add('msg-info');
        hintInput.style.borderColor = '#17a2b8';
        
    } else if (currentPassword !== '' && currentHint.includes(currentPassword)) {
        // Obsahuje heslo - Kritická chyba!
        hintMessage.textContent = '❌ Pozor: Nápověda nesmí obsahovat samotné heslo!';
        hintMessage.classList.add('msg-error');
        hintInput.style.borderColor = '#dc3545';
        
    } */
    
    // else if (currentHint.length > 0 && currentHint.length < 3) {
    //     // Příliš krátké (např. "a", "xy")
    //     hintMessage.textContent = '⚠️ Nápověda je příliš krátká, pravděpodobně vám nepomůže.';
    //     hintMessage.classList.add('msg-warn');
    //     hintInput.style.borderColor = '#ffc107';
        
    // } else if (/(.)\1{2,}/.test(currentHint) || currentHint.includes('asdf') || currentHint.includes('qwert')) {
    //     // Magie! Regulární výraz /(.)\1{2,}/ hledá 3 a více stejných znaků po sobě (aaa, 111)
    //     // Dále hlídáme klasické přejíždění po klávesnici (asdf)
    //     hintMessage.textContent = '⚠️ Nápověda vypadá jako náhodné znaky. Zkuste smysluplnou frázi.';
    //     hintMessage.classList.add('msg-warn');
    //     hintInput.style.borderColor = '#ffc107';
        
    // } else {
    //     // Pokud to projde vším výše, vypadá to jako dobrá nápověda
    //     hintMessage.textContent = '✅ Dobrá nápověda by měla dávat smysl pouze vám.';
    //     hintMessage.classList.add('msg-success');
    //     hintInput.style.borderColor = '#28a745';
    // }
});

// Událost pro kliknutí na finální tlačítko "Kontrola hesla"
checkBtn.addEventListener('click', () => {
    // 1. Kontrola povinných parametrů
    const isLengthValid = document.getElementById('req-length').classList.contains('valid-mandatory');
    const isPwnedValid = document.getElementById('req-pwned').classList.contains('valid-mandatory');
    
    // 2. Kontrola bezpečnostní otázky
    const isQuestionNone = sqSelect.value === 'none';
    
    // 3. Kontrola nápovědy
    const isHintEmpty = hintInput.value.trim() === '';

    // Vyhodnocení pomocí vyskakovacího okna (alert)
    if (isLengthValid && isPwnedValid && isQuestionNone && isHintEmpty) {
        // Použijeme funkci alert() pro zobrazení úspěchu
        alert('🎉 Gratulujeme! Vaše heslo i nastavení zabezpečení splňují nejpřísnější standardy.\n\nFLAG(silneheslo)');
    } else {
        // Použijeme funkci alert() pro zobrazení chyby
        alert('❌ Něco není v pořádku.\n\nZkontrolujte, zda máte splněné všechny povinné parametry a další nastavení dle zadání.');
    }
});
