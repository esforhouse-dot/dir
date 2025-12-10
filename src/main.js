import { cadCore } from './cad-core.js';
import { uiManager } from './ui-manager.js';
import { loadFromStorage } from './storage.js';

// Грязный хак, чтобы работали onclick в HTML строках
window.App = {
    cadCore: cadCore,
    ui: uiManager
};

ymaps.ready(() => {
    console.log("Neon CAD Initializing...");
    try {
        cadCore.init();
        uiManager.init();
        
        // Загрузка данных
        loadFromStorage().then(() => {
            // Убираем шторку только после загрузки данных
            document.body.classList.add('loaded');
        }).catch(e => {
            console.error("Load failed", e);
            document.body.classList.add('loaded'); // Все равно показываем интерфейс
        });
        
        // --- SAFETY TIMEOUT (ДЛЯ МОБИЛОК) ---
        // Если через 3 секунды "черный экран" все еще висит (например, из-за медленного интернета),
        // принудительно показываем интерфейс.
        setTimeout(() => {
            if (!document.body.classList.contains('loaded')) {
                console.warn("Forcing UI load due to timeout");
                document.body.classList.add('loaded');
            }
        }, 3000);

    } catch (e) {
        console.error("Init failed:", e);
        document.body.classList.add('loaded');
        alert("Ошибка запуска: " + e.message);
    }
});
