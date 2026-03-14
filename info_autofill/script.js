document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('newsletter-form');
    const modal = document.getElementById('result-modal');
    const closeModalBtn = document.getElementById('close-modal');
    const stolenDataList = document.getElementById('stolen-data-list');

    form.addEventListener('submit', function(event) {
        // Zabráníme skutečnému odeslání formuláře
        event.preventDefault();

        // Vyčistíme předchozí data v modálním okně
        stolenDataList.innerHTML = '';

        // Aktualizovaný seznam polí (bez starého cc-name, které teď chytáme pod 'name')
        const fieldsToSteal = [
            { id: 'regular-name', label: 'Běžné jméno (skryté)' },
            { id: 'email', label: 'E-mail (viditelné)' },
            { id: 'phone', label: 'Telefon (skryté)' },
            { id: 'org', label: 'Organizace (skryté)' },
            { id: 'street', label: 'Ulice (skryté)' },
            { id: 'city', label: 'Město (skryté)' },
            { id: 'zip', label: 'PSČ (skryté)' },
            { id: 'country', label: 'Země (skryté)' },
            // Karetní údaje hezky pohromadě dole
            { id: 'cc-name', label: 'Jméno na kartě (viditelné)' },
            { id: 'cc-number', label: 'Číslo karty (skryté)' },
            { id: 'cc-exp', label: 'Expirace karty (skryté)' }
        ];

        // Projdeme všechna pole
        fieldsToSteal.forEach(field => {
            const inputElement = document.getElementById(field.id);
            
            // BEZPEČNOSTNÍ KONTROLA: Zpracujeme pole jen tehdy, pokud v HTML skutečně existuje
            if (inputElement) {
                const value = inputElement.value;
                const listItem = document.createElement('li');
                
                if (value) {
                    // Použili jsme červenou barvu z nového designu pro zvýraznění získaných dat
                    listItem.innerHTML = `<strong>${field.label}:</strong> <span style="color: #ef4444; font-weight: bold;">${value}</span>`;
                } else {
                    listItem.innerHTML = `<strong>${field.label}:</strong> <em style="color: #94a3b8;">(nevyplněno / nenalezeno)</em>`;
                }
                
                stolenDataList.appendChild(listItem);
            }
        });

        // Zobrazíme modální okno s výsledkem
        modal.classList.remove('hidden');
    });

    // Zavírání modálního okna a reset formuláře
    closeModalBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
        form.reset();
    });
});