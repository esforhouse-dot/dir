export const COLORS = ['#FF3333', '#FF8800', '#FFD700', '#00CC44', '#00AAFF', '#0055FF', '#9900FF', '#FFFFFF'];

export const TRANSLATIONS = {
    power: 'Силовой',
    low_current: 'Слаботочка',
    fiber: 'ВОЛС',
    air: 'Воздушная',
    ground: 'В грунте',
    water: 'Подводная',
    building: 'По фасаду',
    phone: 'Телефон',
    lan: 'СКС/ЛВС',
    coax: 'Коаксиал',
    security: 'СБ/ОПС',
    dist: 'Распред.',
    main: 'Магистраль',
    drop: 'Дроп',
    active: 'Выполняется',
    done: 'Выполнено',
    canceled: 'Закрыто без выполнения'
};

export const TASK_COLORS = {
    active: '#00AEEF', // Синий
    done: '#00CC44',   // Зеленый
    canceled: '#FF4444' // Красный
};

// --- НАСТРОЙКИ SUPABASE ---
// ВСТАВЬ СЮДА СВОИ ДАННЫЕ ИЗ НАСТРОЕК SUPABASE!
export const SUPABASE_URL = 'https://ynavkkfyupwshqvvhrtb.supabase.co'; 
export const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InluYXZra2Z5dXB3c2hxdnZocnRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzNDc4OTAsImV4cCI6MjA4MDkyMzg5MH0.-vJwYlCDVDhm_Zo7NRwYlV_dZx0-pVe74kt7shuuc28';

// ID проекта в базе данных. Пока используем 1 для всех.
// В будущем сюда можно подставлять ID из URL (для разных городов/чертежей).
export const PROJECT_ID = 1;
