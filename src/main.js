import { cadCore } from './cad-core.js';
import { uiManager } from './ui-manager.js';
import { loadFromStorage } from './storage.js';

// Грязный хак, чтобы работали onclick в HTML строках
window.App = {
    cadCore: cadCore,
    ui: uiManager
};

// --- ГЛАВНАЯ ЗАЩИТА (SAFETY FIRST) ---
// Этот таймер сработает через 2.5 секунды, ЧТО БЫ НИ СЛУЧИЛОСЬ.
// Даже если Яндекс упал, интернет отключен или в коде ошибка.
// Мы гарантированно убираем черный экран.
const safetyTimer = setTimeout(() => {
    if (!document.body.classList.contains('loaded')) {
        console.warn("⚠️ Аварийное открытие интерфейса (Map/DB timeout)");
        document.body.classList.add('loaded');
    }
}, 2500);

// Основная инициализация
ymaps.ready(() => {
    console.log("Neon CAD Initializing...");
    try {
        // 1. Инициализируем ядро карты
        cadCore.init();
        
        // 2. Инициализируем интерфейс
        uiManager.init();
        
        // 3. Загружаем данные
        loadFromStorage().then(() => {
            console.log("Data loaded successfully");
            // Убираем шторку штатно (и отменяем аварийный таймер)
            clearTimeout(safetyTimer);
            document.body.classList.add('loaded');
        }).catch(e => {
            console.error("Data load failed:", e);
            // Даже при ошибке данных открываем интерфейс
            document.body.classList.add('loaded');
        });

    } catch (e) {
        console.error("Critical Init Error:", e);
        // Показываем ошибку пользователю, чтобы он не смотрел в пустоту
        alert("Ошибка запуска редактора: " + e.message);
        document.body.classList.add('loaded');
    }
});

// Дополнительный обработчик ошибок для мобильных устройств
window.onerror = function(msg, url, line) {
    console.error("Global Error: " + msg);
    // Если произошла глобальная ошибка JS, тоже открываем интерфейс
    document.body.classList.add('loaded');
    return false;
};
