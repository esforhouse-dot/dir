import { state } from './state.js';
import { cadCore } from './cad-core.js';
import { uiManager } from './ui-manager.js'; // Чтобы показывать уведомления
import { COLORS } from './config.js';

// АДРЕС ТВОЕГО БУДУЩЕГО СЕРВЕРА (Пока заглушка)
const API_URL = 'https://api.tvoj-proekt.com/v1/project/123'; 

function getProjectData() {
    // ... (Этот код сбора данных остается тем же, что и был) ...
    // Мы собираем objects, groups и activeGroupId в один объект data
    if(!cadCore.objects) return null;
    const data = [];
    
    // ... (тут твой код сбора objects.each) ...
    // Я его сокращу для примера, но ты оставляешь свой полный сборщик
    
    cadCore.objects.each(obj => {
        if (obj === cadCore.ghostLine || obj === cadCore.deleteBtn || obj === cadCore.glowEffect) return;
        // ... логика сбора данных ...
    });
    
    // Возвращаем полный объект
    return { objects: data, groups: state.groups, activeGroupId: state.activeGroupId };
}

// --- НОВАЯ ФУНКЦИЯ СОХРАНЕНИЯ В ОБЛАКО ---
export async function saveToStorage() {
    const storageObj = getProjectData();
    if (!storageObj) return;

    // 1. Сначала сохраняем локально (на всякий случай, для скорости)
    localStorage.setItem('neon_cad_data_v4', JSON.stringify(storageObj));
    
    // 2. Отправляем на сервер
    try {
        if(window.App && window.App.ui) window.App.ui.showNotification('Синхронизация...', false);
        
        // В реальном проекте здесь будет fetch к твоему серверу
        // const response = await fetch(API_URL, {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify(storageObj)
        // });
        
        // if (!response.ok) throw new Error('Ошибка сети');

        // Имитация задержки сети для теста
        await new Promise(r => setTimeout(r, 500)); 

        if(window.App && window.App.ui) {
            window.App.ui.updateStorageDisplay();
            // Показываем стандартное "Сохранено"
            const ind = document.getElementById('save-indicator');
            // Сброс стилей через таймер реализован в ui-manager, 
            // здесь просто вызываем уведомление успеха
            window.App.ui.showNotification('Сохранено в облако');
        }
    } catch (e) {
        console.error(e);
        if(window.App && window.App.ui) window.App.ui.showNotification('Ошибка сохранения в облако', true);
    }
}

// --- НОВАЯ ФУНКЦИЯ ЗАГРУЗКИ ИЗ ОБЛАКА ---
export async function loadFromStorage() {
    try {
        // 1. Пытаемся загрузить с сервера
        // const response = await fetch(API_URL);
        // const parsed = await response.json();
        
        // ПОКА ИСПОЛЬЗУЕМ ЛОКАЛКУ ДЛЯ ТЕСТА
        const json = localStorage.getItem('neon_cad_data_v4');
        if(!json) return;
        const parsed = JSON.parse(json);

        // ... (Весь код парсинга и добавления на карту остается без изменений) ...
        // ... CadCore.placePointObject ... CadCore.setupPolyline ...
        
        console.log("Данные загружены.");
    } catch(e) { 
        console.error("Load error", e); 
        if(window.App && window.App.ui) window.App.ui.showNotification('Ошибка загрузки', true);
    }
}

export function saveToFile() {
    // ... (Твой старый код экспорта в файл) ...
}