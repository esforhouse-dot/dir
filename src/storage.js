import { state } from './state.js';
import { cadCore } from './cad-core.js';
import { API_URL } from './config.js'; // Берем адрес твоего сервера

// --- ФЛАГ БЛОКИРОВКИ ---
let isLoading = false; 

function getProjectData() {
    if(!cadCore.objects) return null;
    const data = [];
    
    cadCore.objects.each(obj => {
        try {
            if (obj === cadCore.ghostLine || obj === cadCore.deleteBtn) return;
            
            const gid = obj.properties.get('groupId') || 1;
            const type = obj.geometry ? obj.geometry.getType() : '';

            if (type === 'LineString') {
                const coords = obj.geometry.getCoordinates();
                if (coords && coords.length >= 2) {
                    data.push({ 
                        type: 'Polyline', groupId: gid, coords: coords, 
                        color: obj.options.get('strokeColor'), width: obj.options.get('strokeWidth'),
                        opacity: obj.options.get('strokeOpacity'), style: obj.options.get('strokeStyle'),
                        text: obj.properties.get('userText'), cableData: obj.properties.get('cableData') 
                    });
                }
            } else if (type === 'Point') {
                const subType = obj.properties.get('type');
                const coords = obj.geometry.getCoordinates();
                if (subType === 'text') {
                    data.push({ type: 'Text', groupId: gid, coords: coords, text: obj.properties.get('iconContent'), iconColor: obj.properties.get('iconColor') });
                } else if (subType === 'task') {
                    data.push({ type: 'Point', groupId: gid, subtype: 'task', coords: coords, text: obj.properties.get('userText'), iconColor: obj.properties.get('iconColor'), taskData: obj.properties.get('taskData') });
                } else {
                    data.push({ type: 'Point', groupId: gid, subtype: subType, coords: coords, text: obj.properties.get('userText'), iconColor: obj.properties.get('iconColor') });
                }
            } else if (type === 'Polygon') {
                data.push({ type: 'Polygon', groupId: gid, coords: obj.geometry.getCoordinates(), color: obj.options.get('fillColor'), opacity: obj.options.get('fillOpacity'), text: obj.properties.get('userText') });
            }
        } catch (objErr) {}
    });
    
    return { objects: data, groups: state.groups, activeGroupId: state.activeGroupId };
}

let saveTimeout = null;

// --- СОХРАНЕНИЕ НА СВОЙ СЕРВЕР ---
export async function saveToStorage() {
    if (isLoading) return;

    const storageObj = getProjectData();
    if (!storageObj) return;

    const jsonString = JSON.stringify(storageObj);
    if(document.getElementById('storage-val')) {
        document.getElementById('storage-val').innerText = (jsonString.length / 1024).toFixed(1);
    }

    if (saveTimeout) clearTimeout(saveTimeout);
    
    const ind = document.getElementById('save-indicator');
    if (ind) {
        ind.innerHTML = '☁️ Сохранение...';
        ind.classList.add('show');
        ind.style.background = 'rgba(0, 174, 239, 0.2)'; 
        ind.style.borderColor = '#00AEEF';
    }

    saveTimeout = setTimeout(async () => {
        if (isLoading) return; 

        try {
            // ОТПРАВЛЯЕМ POST ЗАПРОС
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(storageObj)
            });

            if (!response.ok) throw new Error('Server Error');

            if(window.App && window.App.ui) {
                window.App.ui.showNotification('Сохранено');
            }
        } catch (err) {
            console.error("Save error:", err);
            // Если ошибка Mixed Content, она отобразится здесь
            if(window.App && window.App.ui) {
                window.App.ui.showNotification('Ошибка сети (Проверь HTTP/HTTPS)', true);
            }
        }
    }, 2000); 
}

export function saveToFile() {
    const storageObj = getProjectData();
    if (!storageObj) return;
    const json = JSON.stringify(storageObj, null, 2); 
    const blob = new Blob([json], {type: "application/json"}); 
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `project.json`; 
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

// --- ЗАГРУЗКА СО СВОЕГО СЕРВЕРА ---
export async function loadFromStorage() {
    isLoading = true;

    try {
        console.log("Загрузка с сервера...", API_URL);
        
        // ДЕЛАЕМ GET ЗАПРОС
        const response = await fetch(API_URL);
        
        if (response.ok) {
            const data = await response.json();
            if (data) {
                applyData(data);
                if(window.App && window.App.ui) window.App.ui.showNotification('Загружено');
            }
        } else {
            console.warn("Server response not OK", response.status);
            if(window.App && window.App.ui) window.App.ui.showNotification('Новый проект', false);
        }
    } catch (e) {
        console.error("Load error", e);
        if(window.App && window.App.ui) window.App.ui.showNotification('Сервер недоступен', true);
    } finally {
        setTimeout(() => { isLoading = false; }, 1000);
    }
}

function applyData(parsed) {
    const objects = parsed.objects || [];
    state.groups = parsed.groups || [{id: 1, name: 'Группа 1'}];
    state.activeGroupId = parsed.activeGroupId || 1;
    
    let allPoints = [];
    cadCore.objects.removeAll();
    cadCore.labels.removeAll();

    objects.forEach(item => {
        try {
            const gid = item.groupId || 1;
            if (item.type === 'Polyline') {
                if (!item.coords || !Array.isArray(item.coords) || item.coords.length < 2) return;
                const poly = new ymaps.Polyline(item.coords, { 
                    groupId: gid, userText: item.text, hintContent: item.text, cableData: item.cableData 
                }, { 
                    strokeColor: item.color, strokeWidth: item.width || 6, 
                    strokeOpacity: item.opacity || 1, strokeStyle: item.style || 'solid' 
                });
                cadCore.setupPolyline(poly);
                allPoints = allPoints.concat(item.coords);

            } else if (item.type === 'Point') { 
                if (item.subtype === 'task') {
                    cadCore.placePointObject(item.subtype, item.coords, item.text, gid, item.iconColor);
                    const lastObj = cadCore.objects.get(cadCore.objects.getLength() - 1);
                    if (lastObj && item.taskData) lastObj.properties.set('taskData', item.taskData);
                } else {
                    cadCore.placePointObject(item.subtype, item.coords, item.text, gid, item.iconColor || COLORS[0]); 
                }
                allPoints.push(item.coords);
            } else if (item.type === 'Text') { 
                cadCore.placeTextObject(item.coords, item.text, item.iconColor || COLORS[0], gid);
                allPoints.push(item.coords);
            } else if (item.type === 'Polygon') {
                cadCore.placePolygon(item.coords, item.color, {text: item.text}, gid, item.opacity || 0.3);
                if(item.coords && item.coords[0]) allPoints = allPoints.concat(item.coords[0]);
            }
        } catch (e) {}
    });

    cadCore.updateVisibility();
    if (allPoints.length > 0 && cadCore.map) {
        try {
            const bounds = ymaps.util.bounds.fromPoints(allPoints);
            cadCore.map.setBounds(bounds, { checkZoomRange: true, zoomMargin: 50, duration: 500 });
        } catch(e) {}
    }
    
    if(window.App && window.App.ui) window.App.ui.renderGroupsList();
    
    const jsonString = JSON.stringify(parsed);
    const sizeKB = (jsonString.length / 1024).toFixed(1);
    if(document.getElementById('storage-val')) document.getElementById('storage-val').innerText = sizeKB;
}
