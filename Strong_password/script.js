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

// Načtení prvků modálního okna
const modal = document.getElementById('result-modal');
const modalTitle = document.getElementById('modal-title');
const modalMessage = document.getElementById('modal-message');
const closeModalBtn = document.getElementById('close-modal');
const modalOkBtn = document.getElementById('modal-ok-btn');
const modalContent = document.querySelector('.modal-content');

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
function updateRequirement(element, isValid, validClass, isEmpty, isMandatory = false) {
    // 1. Nejprve odstraníme barevné třídy, abychom měli "čistý štít"
    element.classList.remove(validClass, 'invalid-mandatory');

    if (isEmpty) {
        // STAV A: Pole je prázdné -> vše vracíme do šedého výchozího stavu s kolečkem
        element.querySelector('span').textContent = '○';
    } else if (isValid) {
        // STAV B: Pravidlo je splněno -> přidáme úspěšnou třídu (zelená/modrá) a fajfku
        element.classList.add(validClass);
        element.querySelector('span').textContent = '✓';
    } else {
        // STAV C: Pravidlo NENÍ splněno a uživatel už něco napsal
        if (isMandatory) {
            // Jde o povinný parametr -> nastavíme červenou barvu a křížek
            element.classList.add('invalid-mandatory');
            element.querySelector('span').textContent = '✗';
        } else {
            // Jde o volitelný parametr -> necháme jen obyčejné šedé kolečko
            element.querySelector('span').textContent = '○';
        }
    }
}

// 1. ČÁST: LOKÁLNÍ KONTROLA REGULÁRNÍMI VÝRAZY
function validatePasswordLocal(password) {
    // Vytvoříme si proměnnou, která je 'true', pokud je heslo úplně prázdné
    const isEmpty = password === ''; 

    // Kontrola délky - Přidali jsme 'isEmpty' a 'true' (protože je to POVINNÝ parametr)
    updateRequirement(requirements.length, password.length >= requiredMinLength, 'valid-mandatory', isEmpty, true);
    
    // Kontroly pro volitelné parametry - Přidali jsme 'isEmpty' a 'false'
    updateRequirement(requirements.upper, /[A-Z]/.test(password), 'valid-optional', isEmpty, false);

    updateRequirement(requirements.lower, /[a-z]/.test(password), 'valid-optional', isEmpty, false);

    updateRequirement(requirements.number, /[0-9]/.test(password), 'valid-optional', isEmpty, false);

    updateRequirement(requirements.special, /[^A-Za-z0-9\s]/.test(password), 'valid-optional', isEmpty, false);
}

// 2. ČÁST: BEZPEČNÁ KONTROLA PROTI HIBP API (k-anonymita)
async function checkPwnedAPI(password) {
    const isEmpty = password === '';

    // Pokud je heslo prázdné, rovnou nastavíme výchozí stav a ukončíme funkci
    if (isEmpty) {
        updateRequirement(requirements.pwned, false, 'valid-mandatory', isEmpty, true);
        return;
    }

    try {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-1', data);
        
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();

        const prefix = hashHex.substring(0, 5); 
        const suffix = hashHex.substring(5);    

        const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
        const responseText = await response.text();

        const isPwned = responseText.includes(suffix);

        // Voláme updateRequirement s tím, že jde o povinný parametr (isMandatory = true)
        updateRequirement(requirements.pwned, !isPwned, 'valid-mandatory', isEmpty, true);

    } catch (error) {
        console.error("Chyba při komunikaci s HIBP API:", error);
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

// Událost pro kliknutí na finální tlačítko "Kontrola hesla"
checkBtn.addEventListener('click', () => {
    // 1. Zjistíme stavy všech povinných požadavků
    const isLengthValid = requirements.length.classList.contains('valid-mandatory');
    const isPwnedValid = requirements.pwned.classList.contains('valid-mandatory');
    const isQuestionNone = sqSelect.value === 'none';
    const isHintEmpty = hintInput.value.trim() === '';

    // 2. Vytvoříme si prázdné pole, do kterého budeme sbírat chybové hlášky
    let errors = [];

    // Pokud něco není splněno, přidáme do pole srozumitelnou zprávu
    if (!isLengthValid) {
        errors.push(`Heslo nesplňuje minimální délku (${requiredMinLength} znaků).`);
    }
    if (!isPwnedValid) {
        errors.push('Heslo bylo nalezeno v databázi uniklých hesel a není bezpečné.');
    }
    if (!isQuestionNone) {
        errors.push('Bezpečnostní otázka by neměla být nastavena (dle zadání úkolu).');
    }
    if (!isHintEmpty) {
        errors.push('Pole pro nápovědu k heslu by mělo zůstat prázdné (pokud je to možné).');
    }

    // 3. Rozhodneme, co do modalu vypíšeme
    // 3. Rozhodneme, co do modalu vypíšeme
    if (errors.length === 0) {
        // Žádné chyby = ÚSPĚCH
        modalTitle.textContent = '🎉 Gratulujeme!';
        modalTitle.style.color = '#28a745'; // Zelený nadpis
        modalMessage.innerHTML = 'Vaše heslo i nastavení zabezpečení splňují nejpřísnější standardy.<br><br><strong>FLAG(silneheslo)</strong>';
        
        // PŘIDÁNO: Přidáme třídu, která modal roztáhne a zakáže zalamování
        modalContent.classList.add('success-mode');
    } else {
        // Máme chyby = SELHÁNÍ
        modalTitle.textContent = '❌ Něco není v pořádku';
        modalTitle.style.color = '#dc3545'; // Červený nadpis
        
        let errorHtml = '<p>Zkontrolujte a opravte prosím následující problémy:</p>';
        errorHtml += '<ul class="modal-error-list">';
        
        errors.forEach((err) => {
            errorHtml += `<li>${err}</li>`;
        });
        errorHtml += '</ul>';
        
        modalMessage.innerHTML = errorHtml; 
        
        // PŘIDÁNO: Odebereme třídu, aby se dlouhé chyby mohly zalamovat do normálního okna
        modalContent.classList.remove('success-mode');
    }

    // 4. Zobrazíme modal odstraněním třídy 'hidden'
    modal.classList.remove('hidden');
});

// Funkce pro zavření modalu
function closeModal() {
    modal.classList.add('hidden');
}

// Přiřazení zavírací funkce k tlačítkům
closeModalBtn.addEventListener('click', closeModal);
modalOkBtn.addEventListener('click', closeModal);

// Vylepšení: Zavření modalu při kliknutí mimo něj (na ztmavené pozadí)
modal.addEventListener('click', (event) => {
    // Zkontrolujeme, jestli uživatel klikl přímo na pozadí (ne na obsah okna uvnitř)
    if (event.target === modal) {
        closeModal();
    }
});
