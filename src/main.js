// Мы убрали импорт CSS отсюда, так как подключили его в HTML для ускорения отрисовки
// import './style.css'; 
import { cadCore } from './cad-core.js';
import { uiManager } from './ui-manager.js';
import { loadFromStorage } from './storage.js';

// Грязный хак, чтобы работали onclick в HTML строках (контекстное меню и т.д.)
window.App = {
    cadCore: cadCore,
    ui: uiManager
};

ymaps.ready(() => {
    console.log("Neon CAD Initializing...");
    try {
        cadCore.init();
        uiManager.init();
        loadFromStorage();
        
        console.log("Ready!");
        
        // --- ПЛАВНОЕ ПОЯВЛЕНИЕ ---
        // Ждем совсем чуть-чуть, чтобы браузер отрендерил иконки и шрифты,
        // а потом снимаем "черную шторку".
        setTimeout(() => {
            document.body.classList.add('loaded');
        }, 150);
        // ------------------------

    } catch (e) {
        console.error("Init failed:", e);
        // Если ошибка - всё равно показываем экран, чтобы увидеть alert
        document.body.classList.add('loaded');
        alert("Ошибка запуска карты: " + e.message);
    }
});