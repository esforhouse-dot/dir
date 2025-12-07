import { state } from './state.js';
import { formatLength, debounce } from './utils.js';
import { saveToStorage } from './storage.js';
import { COLORS } from './config.js';

// Словарь дефолтных названий (оставляем как было)
const DEFAULT_NAMES = {
    pole: 'Опора', light: 'Светильник', cabinet: 'Шкаф', flag: 'Флаг', star: 'Звезда',
    substation: 'ТП', subscriber: 'Абонент', line: 'Линия', polygon: 'Зона (Полигон)', text: 'Текст'
};

class CadCore {
    constructor() {
        this.map = null;
        this.objects = null;
        this.labels = null;
        this.ghostLine = null;
        this.cursorTip = null;
        this.deleteBtn = null;
        
        // --- НОВОЕ: Переменная для объекта свечения ---
        this.glowEffect = null;
    }

    init() {
        if (typeof ymaps === 'undefined') throw new Error("Yandex API missed");
        document.oncontextmenu = () => false;
        
        this.map = new ymaps.Map("map", { center: [55.76, 37.64], zoom: 12, controls: ['zoomControl', 'typeSelector'] });
        this.objects = new ymaps.GeoObjectCollection();
        this.labels = new ymaps.GeoObjectCollection();
        this.map.geoObjects.add(this.objects);
        this.map.geoObjects.add(this.labels);

        // --- НОВОЕ: Инициализация эффекта свечения ---
        this.initGlowEffect();

        this.map.events.add('click', (e) => this.handleMapClick(e));
        this.map.events.add('contextmenu', () => this.resetMapState());
        this.map.events.add('boundschange', () => { 
            this.hideContextMenu(); 
            this.removeDeleteBtn(); 
            if(window.App.ui) window.App.ui.updateZoomDisplay();
        });
        
        document.addEventListener('mousemove', (e) => {
            state.mousePos = { x: e.clientX, y: e.clientY };
        });
    }

    // --- НОВЫЙ МЕТОД: Создаем "призрак" для свечения ---
    initGlowEffect() {
        // Создаем пустую линию, которая будет служить подсветкой
        // Мы делаем её интерактивной (interactive: false), чтобы она не перехватывала клики
        // но визуально создавала эффект гало.
        this.glowEffect = new ymaps.Polyline([], {}, {
            strokeColor: '#FFFFFF', // Цвет по умолчанию (будет меняться)
            strokeWidth: 12,        // Ширина свечения (шире основной линии)
            strokeOpacity: 0.4,     // Прозрачность (эффект неона)
            strokeStyle: 'solid',
            interactive: false,     // Важно! Клики должны проходить сквозь свечение к самой линии
            zIndex: 0               // Пытаемся положить под низ (в 2.1 работает не всегда, но прозрачность спасет)
        });
        
        // Сразу добавляем на карту, но скрываем
        this.glowEffect.options.set('visible', false);
        this.map.geoObjects.add(this.glowEffect);
    }

    // --- ЛОГИКА ПРОДОЛЖЕНИЯ ЛИНИИ (Оставляем без изменений) ---
    continueLine(targetLine, clickCoords) {
        if (!clickCoords || !targetLine.geometry) return;
        const coords = targetLine.geometry.getCoordinates();
        let minDst = Infinity; let closestIndex = -1;
        coords.forEach((c, i) => {
            const dst = ymaps.coordSystem.geo.getDistance(c, clickCoords);
            if(dst < minDst) { minDst = dst; closestIndex = i; }
        });
        const startPoint = coords[closestIndex];
        state.mergeTarget = targetLine; state.mergeIndex = closestIndex;
        this.startDrawing(targetLine.options.get('strokeColor'), null, startPoint);
        if(state.drawingLine) {
             state.drawingLine.options.set('strokeStyle', targetLine.options.get('strokeStyle'));
             state.drawingLine.options.set('strokeWidth', targetLine.options.get('strokeWidth'));
        }
    }

    setTool(tool, labelText) {
        this.resetMapState(false);
        state.tool = tool;
        if(window.App.ui) window.App.ui.updateTriggerButton(tool, labelText);
        
        const mapEl = document.getElementById('map');
        if(mapEl) {
            mapEl.classList.remove('crosshair-active', 'eraser-active');
            const btnEraser = document.getElementById('btn-eraser');
            if(btnEraser) btnEraser.classList.remove('active');

            if(tool === 'eraser') {
                mapEl.classList.add('eraser-active');
                if(btnEraser) btnEraser.classList.add('active');
            } else if(tool) {
                mapEl.classList.add('crosshair-active');
            }
        }
    }

    updateVisibility() {
        if(!this.objects) return;
        this.objects.each(obj => {
            const objGid = obj.properties.get('groupId');
            const isVisible = state.showAllGroups || (objGid === state.activeGroupId);
            obj.options.set('visible', isVisible);
            
            if(obj.geometry && obj.geometry.getType() === 'LineString') {
                 const labelsVisible = isVisible && state.showMeasurements;
                 if(obj.segmentLabels) obj.segmentLabels.forEach(l => l.options.set('visible', labelsVisible));
                 if(obj.totalLabel) obj.totalLabel.options.set('visible', labelsVisible);
            }
        });
        if(window.App.ui) window.App.ui.renderGroupsList();
    }

    handleMapClick(e) {
        if (state.tool === 'eraser') return;
        this.hideContextMenu(); this.removeDeleteBtn(); 
        if(window.App.ui) window.App.ui.closeToolsMenu();
        if (state.isDrawing) return;

        const coords = e.get('coords');
        if (state.tool === 'text') {
            const text = prompt("Введите текст:");
            if (text && text.trim() !== "") {
                this.placeTextObject(coords, text.trim(), state.color);
                this.setTool(null); 
            }
        }
        else if (state.tool === 'line') this.startDrawing(state.color, null, coords);
        else if (state.tool === 'polygon') this.placePolygon(coords, state.color);
        else if (state.tool) this.placePointObject(state.tool, coords);
    }

    placeTextObject(coords, text, color, groupId = null) {
        const layout = ymaps.templateLayoutFactory.createClass(
            `<div class="neon-text-label" style="--obj-color: $[properties.iconColor]">$[properties.iconContent]</div>`
        );
        const gid = groupId || state.activeGroupId;
        const placemark = new ymaps.Placemark(coords, { type: 'text', iconContent: text, iconColor: color, groupId: gid, userText: text }, { iconLayout: layout, iconPane: 'overlaps', draggable: false });
        this.objects.add(placemark);
        this.attachObjectEvents(placemark);
        saveToStorage();
        if(window.App.ui) window.App.ui.renderGroupsList();
    }

    startDrawing(color, existingPolyline = null, startPoint = null) {
        state.isDrawing = true;
        let polyline;
        if (existingPolyline) { 
            polyline = existingPolyline; 
        } else {
            const initialCoords = startPoint ? [startPoint] : [];
            polyline = new ymaps.Polyline(initialCoords, { groupId: state.activeGroupId }, { strokeColor: color, strokeWidth: state.lineWeight, strokeOpacity: state.opacity, strokeStyle: state.lineStyle, editorDrawingCursor: "crosshair" });
            this.setupPolyline(polyline);
        }
        state.drawingLine = polyline;
        polyline.editor.startDrawing(); 
        this.enableVisualAids(polyline);
        
        polyline.editor.events.add('drawingstop', () => { 
            state.isDrawing = false; 
            this.disableVisualAids(); 
            
            if (state.mergeTarget) {
                const originalCoords = state.mergeTarget.geometry.getCoordinates();
                const newCoords = state.drawingLine.geometry.getCoordinates();
                const isStart = (state.mergeIndex === 0);
                const isEnd = (state.mergeIndex === originalCoords.length - 1);

                if (isStart || isEnd) {
                    newCoords.shift(); 
                    let finalCoords;
                    if (isEnd) finalCoords = originalCoords.concat(newCoords);
                    else if (isStart) finalCoords = newCoords.reverse().concat(originalCoords);
                    
                    state.mergeTarget.geometry.setCoordinates(finalCoords);
                    this.objects.remove(state.drawingLine);
                    this.enableSegmentsCalculation(state.mergeTarget);
                }
                state.mergeTarget = null;
                state.mergeIndex = -1;
            }

            state.drawingLine = null; 
            saveToStorage(); 
            if(window.App.ui) window.App.ui.renderGroupsList(); 
        });
    }

    placePointObject(type, coords, text = '', groupId = null, iconColor = null) {
        const hintLayout = ymaps.templateLayoutFactory.createClass('<div class="neon-hint">$[properties.hintContent]</div>');
        let layoutClass;
        const createDynamicLayout = (iconId) => { return ymaps.templateLayoutFactory.createClass(`<div class="custom-icon ${iconId}" style="--obj-color: $[properties.iconColor]"><svg viewBox="0 0 24 24"><use xlink:href="#${iconId}"></use></svg></div>`); };

        switch(type) {
            case 'light': layoutClass = ymaps.templateLayoutFactory.createClass('<div class="neon-light" style="--obj-color: $[properties.iconColor]"></div>'); break;
            case 'pole': layoutClass = createDynamicLayout('icon-pole'); break;
            case 'cabinet': layoutClass = createDynamicLayout('icon-cabinet'); break;
            case 'flag': layoutClass = createDynamicLayout('icon-flag'); break;
            case 'star': layoutClass = createDynamicLayout('icon-star'); break;
            case 'substation': layoutClass = createDynamicLayout('icon-substation'); break;
            case 'subscriber': layoutClass = createDynamicLayout('icon-house'); break;
            default: layoutClass = ymaps.templateLayoutFactory.createClass('<div class="neon-light"></div>');
        }

        const gid = groupId || state.activeGroupId;
        const color = iconColor || state.color;
        const defaultName = DEFAULT_NAMES[type] || 'Объект';
        const finalHint = (text && text.trim() !== '') ? text : defaultName;

        const placemark = new ymaps.Placemark(coords, { type: type, userText: text, hintContent: finalHint, groupId: gid, iconColor: color }, { iconLayout: layoutClass, iconPane: 'overlaps', draggable: true, hintLayout: hintLayout });
        this.objects.add(placemark);
        this.attachObjectEvents(placemark);
        saveToStorage();
        if(window.App.ui) window.App.ui.renderGroupsList();
    }
    
    placePolygon(coords, color, properties = {}, groupId = null, opacity = 0.3) {
         let finalCoords = [];
         if (coords.length === 2 && typeof coords[0] === 'number') {
             const c = coords;
             const dLat = 0.0003; const dLon = 0.0005;
             finalCoords = [[[c[0]-dLat, c[1]-dLon], [c[0]+dLat, c[1]-dLon], [c[0]+dLat, c[1]+dLon], [c[0]-dLat, c[1]+dLon], [c[0]-dLat, c[1]-dLon]]];
         } else { finalCoords = coords; }

         const userTxt = properties.text || '';
         const hintTxt = (userTxt && userTxt.trim() !== '') ? userTxt : DEFAULT_NAMES.polygon;

         const poly = new ymaps.Polygon(finalCoords, { groupId: groupId || state.activeGroupId, userText: userTxt, hintContent: hintTxt }, 
             { fillColor: color || state.color, strokeColor: color || state.color, fillOpacity: opacity, editorDrawingCursor: "crosshair" });
         
         poly.options.set('hintLayout', ymaps.templateLayoutFactory.createClass('<div class="neon-hint">$[properties.hintContent]</div>'));
         this.objects.add(poly);
         this.attachObjectEvents(poly);
         poly.events.add('geometrychange', () => saveToStorage());
         saveToStorage(); 
         if(window.App.ui) window.App.ui.renderGroupsList();
    }

    setupPolyline(polyline) {
        polyline.options.set('draggable', false); 
        polyline.events.add('geometrychange', () => saveToStorage());
        polyline.options.set('hintLayout', ymaps.templateLayoutFactory.createClass('<div class="neon-hint">$[properties.hintContent]</div>'));
        
        const currentText = polyline.properties.get('userText');
        const currentHint = polyline.properties.get('hintContent');
        if (!currentHint || currentHint.trim() === '') {
            const label = (currentText && currentText.trim() !== '') ? currentText : DEFAULT_NAMES.line;
            polyline.properties.set('hintContent', label);
        }

        this.objects.add(polyline);
        this.attachObjectEvents(polyline);
        
        polyline.segmentLabels = []; polyline.totalLabel = null;
        this.enableSegmentsCalculation(polyline);
    }

    attachObjectEvents(obj) {
        // --- НОВАЯ ЛОГИКА НАВЕДЕНИЯ (СВЕЧЕНИЕ) ---
        obj.events.add('mouseenter', (e) => {
            if (state.isDrawing) return;
            const type = obj.geometry.getType();

            // Эффект только для Линий и Полигонов (точкам свечение не нужно, у них иконки)
            if (type === 'LineString' || type === 'Polygon') {
                if (this.glowEffect) {
                    // 1. Копируем геометрию
                    this.glowEffect.geometry.setCoordinates(obj.geometry.getCoordinates());
                    
                    // 2. Берем цвет объекта
                    const objColor = type === 'Polygon' ? obj.options.get('fillColor') : obj.options.get('strokeColor');
                    const objWidth = obj.options.get('strokeWidth') || 5;
                    
                    // 3. Настраиваем свечение (делаем его шире)
                    this.glowEffect.options.set('strokeColor', objColor);
                    this.glowEffect.options.set('strokeWidth', objWidth + 10); // +10px ширины для эффекта гало
                    this.glowEffect.options.set('strokeOpacity', 0.4); // Полупрозрачность
                    
                    // 4. Показываем
                    this.glowEffect.options.set('visible', true);
                }
            }
        });

        obj.events.add('mouseleave', (e) => {
            // При уходе курсора просто скрываем свечение
            if (this.glowEffect) {
                this.glowEffect.options.set('visible', false);
            }
        });
        // ------------------------------------------

        obj.events.add('click', (e) => {
            if (state.tool === 'eraser') {
                 const type = obj.geometry.getType();
                 const subType = obj.properties.get('type');
                 if (type === 'Point' && subType !== 'cursor') {
                     this.objects.remove(obj); 
                     saveToStorage(); 
                     if(window.App.ui) window.App.ui.renderGroupsList();
                 }
                 // Скрываем свечение при удалении
                 if (this.glowEffect) this.glowEffect.options.set('visible', false);
                 return;
            }
            if (state.isDrawing) return;
            e.preventDefault(); e.stopPropagation();
            this.removeDeleteBtn(); this.hideContextMenu();
            
            const type = obj.geometry.getType();
            window.App.lastClickCoords = e.get('coords');

            if (type === 'Point') {
                if (obj.properties.get('type') === 'text') {
                    const clickPixels = e.get('clientPixels');
                    if(window.App.ui) window.App.ui.showContextMenu(clickPixels, obj);
                } else {
                    this.showPointMenu(obj);
                }
            }
            else if (type === 'LineString' || type === 'Polygon') {
                const clickPixels = e.get('clientPixels');
                if(window.App.ui) window.App.ui.showContextMenu(clickPixels, obj);
            }
        });
        
        obj.events.add('contextmenu', (e) => {
             e.preventDefault();
             const type = obj.geometry.getType();
             const subType = obj.properties.get('type');
             if (subType === 'text') return;
             if(window.App.ui) {
                 if (type === 'Point' || type === 'Polygon') window.App.ui.openRenameModal(obj);
                 else if (type === 'LineString') window.App.ui.openCableModal(obj);
             }
        });
        
        obj.events.add('dragend', () => {
            if(obj.properties.get('type') === 'text') {
                obj.options.set('draggable', false);
            }
            saveToStorage();
        });
    }

    resetMapState() {
        if(this.objects) this.objects.each(obj => { try { if(obj.editor) obj.editor.stopEditing(); } catch(e){} });
        this.removeDeleteBtn();
        this.hideContextMenu();
        if (this.glowEffect) this.glowEffect.options.set('visible', false); // Сброс свечения
        if (state.drawingLine) {
            try { state.drawingLine.editor.stopDrawing(); } catch(e){}
            this.objects.remove(state.drawingLine);
            state.drawingLine = null;
        }
        state.isDrawing = false;
        state.tool = null;
        state.mergeTarget = null;
        if(window.App.ui) window.App.ui.updateTriggerButton(null);
    }

    enableVisualAids(polyline) {
        if (!this.ghostLine) {
             this.ghostLine = new ymaps.Polyline([], {}, { strokeColor: '#fff', strokeWidth: 2, strokeStyle: 'dash' });
             this.map.geoObjects.add(this.ghostLine);
        }
        this.ghostLine.options.set('visible', true);
        
        this._moveHandler = (e) => {
            const coords = polyline.geometry.getCoordinates();
            if(coords.length > 0) {
                const last = coords[coords.length-1];
                const cursor = e.get('coords');
                this.ghostLine.geometry.setCoordinates([last, cursor]);
            }
        };
        this.map.events.add('mousemove', this._moveHandler);
    }
    
    disableVisualAids() {
        if(this.ghostLine) this.ghostLine.options.set('visible', false);
        if(this._moveHandler) {
            this.map.events.remove('mousemove', this._moveHandler);
            this._moveHandler = null;
        }
    }

    enableSegmentsCalculation(polyline) {
        const recalc = debounce(() => {
            const coords = polyline.geometry.getCoordinates();
            this.clearLineLabels(polyline);
            if (!coords || coords.length < 2) return;
            if (polyline.options.get('visible') === false) return;
            
            let totalLen = 0;
            for (let i = 0; i < coords.length - 1; i++) {
                const dist = ymaps.coordSystem.geo.getDistance(coords[i], coords[i+1]);
                totalLen += dist;
                if(state.showMeasurements) {
                    const mid = [(coords[i][0]+coords[i+1][0])/2, (coords[i][1]+coords[i+1][1])/2];
                    const l = new ymaps.Placemark(mid, {iconContent: formatLength(dist)}, {iconLayout: ymaps.templateLayoutFactory.createClass('<div class="label-box segment-label">$[properties.iconContent]</div>'), interactive:false});
                    this.labels.add(l); polyline.segmentLabels.push(l);
                }
            }
            if(state.showMeasurements) {
                let labelContent = '∑ ' + formatLength(totalLen);
                const userText = polyline.properties.get('userText');
                if (userText && !userText.includes(labelContent) && userText.trim() !== '') {
                    labelContent = `<span style="color:#aaa">${userText}</span> | ${labelContent}`;
                }
                const total = new ymaps.Placemark(coords[coords.length-1], {iconContent: labelContent}, {iconLayout: ymaps.templateLayoutFactory.createClass('<div class="label-box total-label">$[properties.iconContent]</div>'), interactive:false});
                this.labels.add(total); polyline.totalLabel = total;
            }
        }, 50);
        polyline.events.add(['geometrychange', 'pixelgeometrychange'], recalc);
        recalc();
    }

    clearLineLabels(polyline) {
        if (polyline.segmentLabels) { polyline.segmentLabels.forEach(l => this.labels.remove(l)); polyline.segmentLabels = []; }
        if (polyline.totalLabel) { this.labels.remove(polyline.totalLabel); polyline.totalLabel = null; }
    }
    
    setPointColor(color) {
        if(state.activeContextObject) {
            state.activeContextObject.properties.set('iconColor', color);
            if(state.activeContextObject.properties.get('type') === 'text') {
               state.activeContextObject.options.set('visible', false);
               state.activeContextObject.options.set('visible', true);
            }
            saveToStorage();
        }
    }

    showPointMenu(targetObject) {
         this.removeDeleteBtn();
         const coords = targetObject.geometry.getCoordinates();
         let paletteHtml = '';
         COLORS.forEach(c => { paletteHtml += `<div class="mini-color-btn" style="background:${c}" onclick="window.App.cadCore.setPointColor('${c}')" ontouchstart="event.stopPropagation();"></div>`; });

         const menuLayout = ymaps.templateLayoutFactory.createClass(`
            <div class="point-ctrl-wrapper" onclick="event.stopPropagation()">
                <div class="point-palette-container">${paletteHtml}</div>
                <div class="point-delete-badge" id="p-del-btn" onclick="window.App.cadCore.deleteObject()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    <span class="del-tooltip">Удалить объект</span>
                </div>
            </div>
         `);
         
         state.activeContextObject = targetObject;
         this.deleteBtn = new ymaps.Placemark(coords, {}, { iconLayout: menuLayout, iconPane: 'overlaps', iconOffset: [0, 0], zIndex: 10000, interactive: true });
         this.map.geoObjects.add(this.deleteBtn);
    }
    
    deleteObject() {
        if(state.activeContextObject) {
            const type = state.activeContextObject.geometry.getType();
            if (type === 'LineString' || type === 'Polygon' || state.activeContextObject.properties.get('type') === 'text') {
                if(!confirm('Удалить этот объект?')) return;
            }
            this.objects.remove(state.activeContextObject);
            if(type === 'LineString') this.clearLineLabels(state.activeContextObject);
            this.removeDeleteBtn();
            if (this.glowEffect) this.glowEffect.options.set('visible', false); // Скрыть свечение при удалении
            saveToStorage(); 
            if(window.App.ui) window.App.ui.renderGroupsList();
        }
    }

    removeDeleteBtn() { if(this.deleteBtn) { this.map.geoObjects.remove(this.deleteBtn); this.deleteBtn = null; state.activeContextObject = null; } }
    hideContextMenu() { document.getElementById('context-menu').style.display = 'none'; }
}

export const cadCore = new CadCore();