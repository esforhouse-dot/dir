import { state } from './state.js';
import { cadCore } from './cad-core.js';
import { COLORS } from './config.js';

function getProjectData() {
    if(!cadCore.objects) return null;
    const data = [];
    cadCore.objects.each(obj => {
        if (obj === cadCore.ghostLine || obj === cadCore.deleteBtn || obj === cadCore.cursorTip) return;
        
        const gid = obj.properties.get('groupId') || 1;
        const type = obj.geometry ? obj.geometry.getType() : '';

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

export function saveToStorage() {
    const storageObj = getProjectData();
    if (!storageObj) return;
    localStorage.setItem('neon_cad_data_v4', JSON.stringify(storageObj));
    if(window.App && window.App.ui) {
        window.App.ui.updateStorageDisplay();
        const ind = document.getElementById('save-indicator');
        if(ind) { ind.classList.add('show'); setTimeout(() => ind.classList.remove('show'), 1500); }
    }
}

export function saveToFile() {
    const storageObj = getProjectData();
    if (!storageObj) return;
    const json = JSON.stringify(storageObj, null, 2); 
    const blob = new Blob([json], {type: "application/json"}); 
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `map_project_v4_${new Date().getTime()}.json`; 
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

export function loadFromStorage() {
    const json = localStorage.getItem('neon_cad_data_v4');
    if(!json) return;
    try {
        const parsed = JSON.parse(json);
        const objects = parsed.objects || [];
        state.groups = parsed.groups || [{id: 1, name: 'Группа 1'}];
        state.activeGroupId = parsed.activeGroupId || 1;
        
        let allPoints = [];

        objects.forEach(item => {
            const gid = item.groupId || 1;
            
            if (item.type === 'Polyline') {
                const sOp = (item.opacity !== undefined) ? item.opacity : 1.0; 
                const sStyle = item.style || 'solid';
                const sWidth = item.width || 6;
                const poly = new ymaps.Polyline(item.coords, { groupId: gid, userText: item.text, hintContent: item.text, cableData: item.cableData }, { strokeColor: item.color, strokeWidth: sWidth, strokeOpacity: sOp, strokeStyle: sStyle });
                cadCore.setupPolyline(poly);
                allPoints = allPoints.concat(item.coords);

            } else if (item.type === 'Point') { 
                cadCore.placePointObject(item.subtype, item.coords, item.text, gid, item.iconColor || COLORS[0]); 
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
        
        if(window.App && window.App.ui) window.App.ui.renderGroupsList();

        if (allPoints.length > 0 && cadCore.map) {
            const bounds = ymaps.util.bounds.fromPoints(allPoints);
            cadCore.map.setBounds(bounds, { checkZoomRange: true, zoomMargin: 50, duration: 500 });
        }

    } catch(e) { console.error("Load error", e); }
}