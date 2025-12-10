import { state } from './state.js';
import { cadCore } from './cad-core.js';
import { COLORS, SUPABASE_URL, SUPABASE_KEY, PROJECT_ID } from './config.js';

// Подключаем Supabase через CDN
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Инициализация клиента
let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY && SUPABASE_URL.includes('http')) {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
} else {
    console.warn("Supabase credentials not set in config.js");
}

// Сборка данных (JSON)
function getProjectData() {
    if(!cadCore.objects) return null;
    const data = [];
    
    cadCore.objects.each(obj => {
        // Игнорируем технические объекты
        if (obj === cadCore.ghostLine || obj === cadCore.deleteBtn || obj === cadCore.glowEffect) return;
        
        const gid = obj.properties.get('groupId') || 1;
        const type = obj.geometry ? obj.geometry.getType() : '';

        // ЛИНИИ
        if (type === 'LineString') {
            data.push({ 
                type: 'Polyline', 
                groupId: gid, 
                coords: obj.geometry.getCoordinates(), 
                color: obj.options.get('strokeColor'), 
                width: obj.options.get('strokeWidth'),
                opacity: obj.options.get('strokeOpacity'),
                style: obj.options.get('strokeStyle'),
                text: obj.properties.get('userText'),
                cableData: obj.properties.get('cableData') 
            });
        } 
        // ТОЧКИ
        else if (type === 'Point') {
            const subType = obj.properties.get('type');
            
            if (subType === 'text') {
                data.push({
                    type: 'Text', 
                    groupId: gid, 
                    coords: obj.geometry.getCoordinates(), 
                    text: obj.properties.get('iconContent'),
                    iconColor: obj.properties.get('iconColor')
                });
            } else if (subType === 'task') {
                data.push({
                    type: 'Point',
                    groupId: gid,
                    subtype: 'task',
                    coords: obj.geometry.getCoordinates(),
                    text: obj.properties.get('userText'),
                    iconColor: obj.properties.get('iconColor'),
                    taskData: obj.properties.get('taskData') 
                });
            } else {
                data.push({ 
                    type: 'Point', 
                    groupId: gid, 
                    subtype: subType, 
                    coords: obj.geometry.getCoordinates(), 
                    text: obj.properties.get('userText'), 
                    iconColor: obj.properties.get('iconColor') 
                });
            }
        }
        // ПОЛИГОНЫ
        else if (type === 'Polygon') {
            data.push({ 
                type: 'Polygon', 
                groupId: gid, 
                coords: obj.geometry.getCoordinates(), 
                color: obj.options.get('fillColor'), 
                opacity: obj.options.get('fillOpacity'),
                text: obj.properties.get('userText') 
            });
        }
    });
    
    return { objects: data, groups: state.groups, activeGroupId: state.activeGroupId };
}

// --- СОХРАНЕНИЕ ТОЛЬКО В ОБЛАКО ---
let saveTimeout = null;

export async function saveToStorage() {
    const storageObj = getProjectData();
    if (!storageObj) return;

    // Считаем размер данных в памяти для отображения в UI
    const jsonString = JSON.stringify(storageObj);
    const sizeKB = (jsonString.length / 1024).toFixed(1);
    if(document.getElementById('storage-val')) {
        document.getElementById('storage-val').innerText = sizeKB;
    }

    if (supabase) {
        // Debounce: ждем секунду, чтобы не спамить базу при каждом движении мыши
        if (saveTimeout) clearTimeout(saveTimeout);
        
        // Показываем индикатор
        const ind = document.getElementById('save-indicator');
        if (ind) {
            ind.innerHTML = '☁️ Синхронизация...';
            ind.classList.add('show');
            ind.style.background = 'rgba(0, 174, 239, 0.2)'; 
            ind.style.borderColor = '#00AEEF';
        }

        saveTimeout = setTimeout(async () => {
            try {
                // Upsert: Записываем в базу
                const { error } = await supabase
                    .from('projects')
                    .upsert({ id: PROJECT_ID, data: storageObj });

                if (error) throw error;

                // Успех
                if(window.App && window.App.ui) {
                    window.App.ui.showNotification('Сохранено в облако');
                }
            } catch (err) {
                console.error("Cloud save error:", err);
                if(window.App && window.App.ui) {
                    window.App.ui.showNotification('Ошибка облака', true);
                }
            }
        }, 1000); 
    }
}

// --- ЭКСПОРТ В ФАЙЛ ---
export function saveToFile() {
    const storageObj = getProjectData();
    if (!storageObj) return;
    const json = JSON.stringify(storageObj, null, 2); 
    const blob = new Blob([json], {type: "application/json"}); 
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `project_cloud_${new Date().getTime()}.json`; 
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

// --- ЗАГРУЗКА ТОЛЬКО ИЗ ОБЛАКА ---
export async function loadFromStorage() {
    if (!supabase) {
        console.warn("Нет подключения к Supabase");
        return;
    }

    try {
        console.log("Загрузка из облака...");
        const { data, error } = await supabase
            .from('projects')
            .select('data')
            .eq('id', PROJECT_ID)
            .single();

        if (error) {
            console.warn("Проект в облаке еще пуст или ошибка доступа", error);
            if(window.App && window.App.ui) window.App.ui.showNotification('Новый проект', false);
            return;
        }

        if (data && data.data) {
            applyData(data.data);
            if(window.App && window.App.ui) {
                window.App.ui.renderGroupsList();
                window.App.ui.showNotification('Загружено из облака');
            }
        }
    } catch (e) {
        console.error("Critical load error", e);
        if(window.App && window.App.ui) window.App.ui.showNotification('Ошибка сети', true);
    }
}

// Функция отрисовки данных на карте
function applyData(parsed) {
    const objects = parsed.objects || [];
    state.groups = parsed.groups || [{id: 1, name: 'Группа 1'}];
    state.activeGroupId = parsed.activeGroupId || 1;
    
    let allPoints = [];

    // Очищаем карту перед загрузкой
    cadCore.objects.removeAll();
    cadCore.labels.removeAll();

    objects.forEach(item => {
        const gid = item.groupId || 1;
        
        if (item.type === 'Polyline') {
            const sOp = (item.opacity !== undefined) ? item.opacity : 1.0; 
            const sStyle = item.style || 'solid';
            const sWidth = item.width || 6;
            const poly = new ymaps.Polyline(item.coords, { 
                groupId: gid, 
                userText: item.text, 
                hintContent: item.text, 
                cableData: item.cableData 
            }, { 
                strokeColor: item.color, 
                strokeWidth: sWidth, 
                strokeOpacity: sOp, 
                strokeStyle: sStyle 
            });
            cadCore.setupPolyline(poly);
            allPoints = allPoints.concat(item.coords);

        } else if (item.type === 'Point') { 
            if (item.subtype === 'task') {
                cadCore.placePointObject(item.subtype, item.coords, item.text, gid, item.iconColor);
                // Восстанавливаем данные задачи
                const lastObj = cadCore.objects.get(cadCore.objects.getLength() - 1);
                if (lastObj && item.taskData) {
                    lastObj.properties.set('taskData', item.taskData);
                }
            } else {
                cadCore.placePointObject(item.subtype, item.coords, item.text, gid, item.iconColor || COLORS[0]); 
            }
            allPoints.push(item.coords);
        
        } else if (item.type === 'Text') { 
            cadCore.placeTextObject(item.coords, item.text, item.iconColor || COLORS[0], gid);
            allPoints.push(item.coords);

        } else if (item.type === 'Polygon') {
            const pOp = (item.opacity !== undefined) ? item.opacity : 0.3;
            cadCore.placePolygon(item.coords, item.color, {text: item.text}, gid, pOp);
            if(item.coords && item.coords[0]) allPoints = allPoints.concat(item.coords[0]);
        }
    });

    if (allPoints.length > 0 && cadCore.map) {
        try {
            const bounds = ymaps.util.bounds.fromPoints(allPoints);
            cadCore.map.setBounds(bounds, { checkZoomRange: true, zoomMargin: 50, duration: 500 });
        } catch(e) {}
    }
    
    // Обновляем размер в UI сразу после загрузки
    const jsonString = JSON.stringify(parsed);
    const sizeKB = (jsonString.length / 1024).toFixed(1);
    if(document.getElementById('storage-val')) {
        document.getElementById('storage-val').innerText = sizeKB;
    }
}
