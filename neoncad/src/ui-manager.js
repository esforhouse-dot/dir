import { state } from './state.js';
import { cadCore } from './cad-core.js';
import { saveToStorage, saveToFile } from './storage.js';
import { formatLength, escapeHtml } from './utils.js'; // <--- ДОБАВИЛИ escapeHtml
import { COLORS, TRANSLATIONS } from './config.js';

class UiManager {
    init() {
        // ... (весь код init оставляем без изменений) ...
        // --- ГЛОБАЛЬНЫЕ КЛАВИШИ ---
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                cadCore.resetMapState();
                this.closeSidePanels(); 
                this.closeToolsMenu();
                document.getElementById('style-dropdown').classList.remove('open');
                document.getElementById('modal-overlay').style.display = 'none';
                document.getElementById('cable-modal-overlay').style.display = 'none';
                cadCore.hideContextMenu();
                cadCore.removeDeleteBtn();
            }
            if (e.key === 'Tab') {
                e.preventDefault();
                const menu = document.getElementById('tools-menu');
                if (menu.classList.contains('open')) {
                    this.closeToolsMenu();
                } else {
                    this.showFloatingToolsMenu();
                }
            }
        });

        // --- ПАНЕЛИ И МЕНЮ ---
        const toolTrigger = document.getElementById('tool-trigger');
        const toolsMenu = document.getElementById('tools-menu');
        
        toolTrigger.onclick = (e) => { 
            e.stopPropagation(); 
            toolsMenu.classList.remove('floating');
            toolsMenu.style.left = ''; toolsMenu.style.top = '';
            toolsMenu.classList.toggle('open'); 
        };
        
        document.addEventListener('click', (e) => {
            if (!toolTrigger.contains(e.target) && !toolsMenu.contains(e.target)) {
                this.closeToolsMenu();
            }
            const styleDropdown = document.getElementById('style-dropdown');
            const btnStyle = document.getElementById('btn-style');
            if (styleDropdown && btnStyle && !styleDropdown.contains(e.target) && !btnStyle.contains(e.target)) {
                styleDropdown.classList.remove('open');
            }
        });

        document.getElementById('esc-btn').onclick = () => { 
            cadCore.resetMapState(); 
            this.closeSidePanels(); 
            this.closeToolsMenu();
            document.getElementById('style-dropdown').classList.remove('open');
            document.getElementById('modal-overlay').style.display = 'none';
            document.getElementById('cable-modal-overlay').style.display = 'none';
        };
        
        // --- ИНСТРУМЕНТЫ ---
        document.querySelectorAll('.minimal-btn').forEach(btn => {
            btn.onclick = () => {
                const tool = btn.getAttribute('data-tool');
                const label = btn.getAttribute('data-label');
                cadCore.resetMapState(false);
                cadCore.setTool(tool, label);
                this.closeToolsMenu();
            };
        });

        // --- ВЕРХНИЙ ТУЛБАР ---
        document.getElementById('btn-eraser').onclick = () => { 
            if(state.tool === 'eraser') cadCore.setTool(null);
            else cadCore.setTool('eraser', 'Ластик');
        };

        const btnStyle = document.getElementById('btn-style');
        const styleDropdown = document.getElementById('style-dropdown');
        
        btnStyle.onclick = (e) => {
            e.stopPropagation();
            const rect = btnStyle.getBoundingClientRect();
            styleDropdown.style.top = (rect.bottom + 8) + 'px'; 
            styleDropdown.style.left = rect.left + 'px';
            styleDropdown.classList.toggle('open');
        };

        document.querySelectorAll('.style-option').forEach(opt => {
            opt.onclick = () => {
                const style = opt.getAttribute('data-style');
                state.lineStyle = style;
                if(state.drawingLine) state.drawingLine.options.set('strokeStyle', style);
                styleDropdown.classList.remove('open');
            };
        });

        const btnRuler = document.getElementById('btn-ruler');
        btnRuler.onclick = () => {
            state.showMeasurements = !state.showMeasurements;
            btnRuler.classList.toggle('active', state.showMeasurements);
            cadCore.objects.each(obj => {
                if(obj.geometry.getType() === 'LineString') cadCore.enableSegmentsCalculation(obj);
            });
        };
        
        const btnPoi = document.getElementById('btn-poi');
        btnPoi.onclick = () => {
            state.poiEnabled = !state.poiEnabled;
            if(cadCore.map) cadCore.map.options.set('yandexMapDisablePoiInteractivity', !state.poiEnabled);
            btnPoi.classList.toggle('active', !state.poiEnabled);
        };

        document.getElementById('btn-save').onclick = () => saveToFile();
        
        document.getElementById('btn-clear').onclick = () => { 
            if(confirm('Удалить всё с карты?')) { 
                cadCore.objects.removeAll(); 
                cadCore.labels.removeAll(); 
                localStorage.removeItem('neon_cad_data_v4'); 
                state.groups = [{id: 1, name: 'Группа 1'}];
                state.activeGroupId = 1;
                this.renderGroupsList();
                this.updateStorageDisplay();
            } 
        };
        
        const fileInput = document.getElementById('file-input');
        document.getElementById('btn-load').onclick = () => fileInput.click();
        fileInput.onchange = (e) => this.handleFileLoad(e);

        // --- ПАЛИТРА ---
        const p = document.getElementById('palette');
        COLORS.forEach(c => {
            let b = document.createElement('div'); 
            b.className = 'color-btn'; 
            b.style.backgroundColor = c;
            b.setAttribute('data-color', c);
            b.onclick = () => { 
                this.setActiveColor(c);
                if(state.tool !== 'line' && state.tool !== 'polygon') cadCore.setTool('line', 'Линия');
            };
            p.appendChild(b);
        });
        this.setActiveColor(state.color);

        // --- СЛАЙДЕРЫ ---
        document.getElementById('opacity-slider').oninput = function() { 
            state.opacity = this.value / 100; 
            if (state.drawingLine) state.drawingLine.options.set('strokeOpacity', state.opacity); 
        };
        document.getElementById('icon-scale-slider').oninput = function() { 
            document.documentElement.style.setProperty('--icon-scale', this.value / 100); 
        };
        document.getElementById('map-dimmer').oninput = function() {
            const val = this.value + '%';
            if(cadCore.map) {
                const pane = cadCore.map.panes.get('ground').getElement();
                if(pane) pane.style.filter = `brightness(${val}) grayscale(100%) invert(88%) contrast(90%)`; 
            }
        };

        // --- ПАНЕЛИ ---
        document.getElementById('btn-bom').onclick = () => { this.calculateBOM(); this.togglePanel('bom-panel'); };
        document.getElementById('btn-groups').onclick = () => { this.renderGroupsList(); this.togglePanel('groups-panel'); };
        document.getElementById('help-toggle-btn').onclick = () => this.togglePanel('help-panel');
        document.querySelectorAll('.panel-close').forEach(btn => btn.onclick = () => this.closeSidePanels());

        // --- МОДАЛКИ (События) ---
        document.getElementById('btn-modal-cancel').onclick = () => document.getElementById('modal-overlay').style.display = 'none';
        document.getElementById('btn-modal-save').onclick = () => this.saveRenameModal();
        
        document.getElementById('btn-cable-cancel').onclick = () => document.getElementById('cable-modal-overlay').style.display = 'none';
        document.getElementById('btn-cable-save').onclick = () => this.saveCableData();
        
        document.getElementById('cable-type-select').onchange = () => this.updateCableForm();

        // --- СОЗДАНИЕ ГРУППЫ ---
        document.querySelector('.btn-add-group').onclick = () => {
            const newId = state.groups.length > 0 ? Math.max(...state.groups.map(g => g.id)) + 1 : 1;
            state.groups.push({id: newId, name: 'Группа '+newId});
            state.activeGroupId = newId;
            state.showAllGroups = false;
            cadCore.updateVisibility(); 
            saveToStorage(); 
            this.renderGroupsList();
        };

        // Поиск (Enter)
        document.getElementById('search-input').addEventListener('keypress', function (e) {
            if (e.key === 'Enter' && cadCore.map) {
                const query = this.value;
                if(query) ymaps.geocode(query).then(function (res) {
                    var firstGeoObject = res.geoObjects.get(0);
                    if (firstGeoObject) cadCore.map.setBounds(firstGeoObject.properties.get('boundedBy'), { checkZoomRange: true });
                });
            }
        });
    }

    // --- СИСТЕМНЫЕ УВЕДОМЛЕНИЯ ---
    showNotification(text) {
        const ind = document.getElementById('save-indicator');
        if (!ind) return;

        const originalHTML = ind.innerHTML;
        const originalBg = ind.style.background;
        const originalBorder = ind.style.borderColor;

        ind.innerHTML = escapeHtml(text); // Экранируем уведомление тоже, на всякий случай
        ind.style.background = 'rgba(0, 174, 239, 0.2)'; 
        ind.style.borderColor = '#00AEEF';
        
        ind.classList.add('show');

        setTimeout(() => {
            ind.classList.remove('show');
            setTimeout(() => {
                ind.innerHTML = originalHTML;
                ind.style.background = originalBg;
                ind.style.borderColor = originalBorder;
            }, 500); 
        }, 3000);
    }

    showFloatingToolsMenu() {
        const menu = document.getElementById('tools-menu');
        const { x, y } = state.mousePos;
        
        menu.style.top = ''; 
        menu.style.left = '';
        menu.classList.add('floating', 'open');
        
        const rect = menu.getBoundingClientRect();
        const width = rect.width || 160; 
        const height = rect.height || 300;
        const gap = 15;
        
        let left = x - width - gap;
        let top = y - (height / 2);
        
        if (left < 10) { left = x + gap; menu.style.transformOrigin = 'left center'; } 
        else { menu.style.transformOrigin = 'right center'; }
        
        if (top < 80) top = 80;
        if (top + height > window.innerHeight) top = window.innerHeight - height - 10;
        
        menu.style.left = left + 'px'; 
        menu.style.top = top + 'px';
    }

    closeToolsMenu() { 
        const menu = document.getElementById('tools-menu');
        menu.classList.remove('open');
        setTimeout(() => { 
            if (!menu.classList.contains('open')) { 
                menu.classList.remove('floating'); menu.style.left = ''; menu.style.top = ''; 
            } 
        }, 200);
    }

    setActiveColor(color) {
        state.color = color;
        document.querySelectorAll('.color-btn').forEach(btn => {
            btn.classList.remove('active');
            btn.style.boxShadow = 'none';
            btn.style.borderColor = '#555'; 
        });
        const activeBtn = document.querySelector(`.color-btn[data-color="${color}"]`);
        if(activeBtn) {
            activeBtn.classList.add('active');
            activeBtn.style.boxShadow = `0 0 8px ${color}`; 
            activeBtn.style.borderColor = '#fff';
        }
    }

    updateZoomDisplay() {
        if(cadCore.map) document.getElementById('zoom-val').innerText = cadCore.map.getZoom();
    }
    
    updateStorageDisplay() {
        const len = (localStorage.getItem('neon_cad_data_v4')||'').length;
        document.getElementById('storage-val').innerText = (len/1024).toFixed(1);
    }
    
    updateTriggerButton(tool, label) {
        const textSpan = document.getElementById('active-tool-name');
        const trigger = document.getElementById('tool-trigger');
        const buttons = document.querySelectorAll('.minimal-btn');
        buttons.forEach(b => b.classList.remove('selected'));
        
        if (tool) {
            trigger.classList.add('active-tool');
            textSpan.textContent = label || tool;
            const targetBtn = Array.from(buttons).find(b => b.getAttribute('data-tool') === tool);
            if(targetBtn) targetBtn.classList.add('selected');
        } else {
            trigger.classList.remove('active-tool');
            textSpan.textContent = '';
        }
    }
    
    togglePanel(id) {
        const p = document.getElementById(id);
        const isOpen = p.classList.contains('open');
        this.closeSidePanels();
        if(!isOpen) p.classList.add('open');
    }
    
    closeSidePanels() { 
        document.querySelectorAll('.side-panel').forEach(p => p.classList.remove('open')); 
    }

    renderGroupsList() {
        const list = document.getElementById('groups-list');
        list.innerHTML = '';
        const allItem = document.createElement('div');
        allItem.className = 'group-item' + (state.showAllGroups ? ' active' : '');
        allItem.innerHTML = `<div class="group-name">Общая (Все)</div>`;
        allItem.onclick = () => { state.showAllGroups = true; cadCore.updateVisibility(); this.renderGroupsList(); };
        list.appendChild(allItem);

        state.groups.forEach(g => {
            const d = document.createElement('div');
            const isActive = !state.showAllGroups && state.activeGroupId === g.id;
            d.className = 'group-item' + (isActive ? ' active' : '');
            
            let count = 0;
            if(cadCore.objects) {
                 cadCore.objects.each(obj => {
                    if(obj.properties.get('groupId') === g.id && obj !== cadCore.ghostLine && obj !== cadCore.deleteBtn) count++;
                 });
            }

            const nameDiv = document.createElement('div');
            nameDiv.className = 'group-name';
            nameDiv.style.flexGrow = '1';
            nameDiv.style.cursor = 'pointer';
            
            const statusDot = document.createElement('div');
            statusDot.className = 'group-status';
            
            const nameSpan = document.createElement('span');
            // Здесь безопасно, так как innerText не исполняет HTML
            nameSpan.innerText = g.name; 
            nameSpan.style.marginLeft = '8px';
            
            nameDiv.appendChild(statusDot);
            nameDiv.appendChild(nameSpan);

            const rightDiv = document.createElement('div');
            rightDiv.style.display = 'flex';
            rightDiv.style.alignItems = 'center';
            rightDiv.style.gap = '8px';

            const countDiv = document.createElement('div');
            countDiv.className = 'group-count';
            countDiv.innerText = count;
            countDiv.style.opacity = 0.5;
            countDiv.style.fontSize = '10px';
            
            const delBtn = document.createElement('div');
            delBtn.innerHTML = '✕';
            delBtn.style.cursor = 'pointer';
            delBtn.style.color = '#ff5555';
            delBtn.style.fontSize = '12px';
            delBtn.style.opacity = '0.7';
            delBtn.title = 'Удалить группу';
            delBtn.onmouseenter = () => delBtn.style.opacity = '1';
            delBtn.onmouseleave = () => delBtn.style.opacity = '0.7';
            
            delBtn.onclick = (e) => {
                e.stopPropagation();
                if(confirm(`Внимание! Вместе с группой "${g.name}" будут удалены все объекты этой группы. Вы уверены?`)) {
                    const toRemove = [];
                    cadCore.objects.each(obj => {
                        if(obj.properties.get('groupId') === g.id) toRemove.push(obj);
                    });
                    toRemove.forEach(o => cadCore.objects.remove(o));
                    state.groups = state.groups.filter(grp => grp.id !== g.id);
                    if(state.activeGroupId === g.id) {
                        state.showAllGroups = true;
                        if(state.groups.length > 0) state.activeGroupId = state.groups[0].id;
                    }
                    saveToStorage();
                    this.renderGroupsList();
                }
            };

            rightDiv.appendChild(countDiv);
            rightDiv.appendChild(delBtn);
            d.appendChild(nameDiv);
            d.appendChild(rightDiv);
            d.onclick = () => { state.activeGroupId = g.id; state.showAllGroups = false; cadCore.updateVisibility(); this.renderGroupsList(); };
            nameDiv.ondblclick = (e) => {
                e.stopPropagation(); e.preventDefault();
                const newName = prompt("Введите новое имя группы:", g.name);
                if (newName && newName.trim() !== "") { g.name = newName.trim(); saveToStorage(); this.renderGroupsList(); }
            };
            list.appendChild(d);
        });
    }

    calculateBOM() { 
        const container = document.getElementById('bom-content');
        let html = '';
        let totalCable = 0;
        let specificCables = {};
        let genericCables = {};
        let totalArea = 0;
        let poles = 0, lights = 0, cabinets = 0, flags = 0, stars = 0, substations = 0, subscribers = 0;

        cadCore.objects.each(obj => {
            if (obj.options.get('visible') === false) return;
            const gType = obj.geometry.getType();
            if (gType === 'Point') {
                 const type = obj.properties.get('type');
                 if (type === 'pole') poles++; if (type === 'light') lights++; if (type === 'cabinet') cabinets++;
                 if (type === 'flag') flags++; if (type === 'star') stars++; if (type === 'substation') substations++;
                 if (type === 'subscriber') subscribers++;
            }
            else if (gType === 'LineString' && obj !== cadCore.ghostLine) {
                 const coords = obj.geometry.getCoordinates();
                 let len = 0;
                 for(let i=0; i<coords.length-1; i++) len += ymaps.coordSystem.geo.getDistance(coords[i], coords[i+1]);
                 totalCable += len;
                 const cableData = obj.properties.get('cableData');
                 if (cableData && cableData.type) {
                     const key = `${cableData.type}|${cableData.install}|${cableData.voltage || cableData.subtype || ''}|${cableData.mark || ''}`;
                     if (!specificCables[key]) specificCables[key] = { length: 0, meta: cableData };
                     specificCables[key].length += len;
                 } else {
                     const color = obj.options.get('strokeColor');
                     genericCables[color] = (genericCables[color] || 0) + len;
                 }
            }
            else if (gType === 'Polygon') {
                try { totalArea += ymaps.util.calculateArea(obj.geometry); } catch(e){}
            }
        });
        
        let activeName = state.showAllGroups ? 'Все объекты' : (state.groups.find(g=>g.id===state.activeGroupId)||{}).name;
        // ОБНОВЛЕНО: Используем escapeHtml для вывода имени группы
        html += `<div style="font-size:12px; color:#888; margin-bottom:10px;">Для: <strong style="color:#fff">${escapeHtml(activeName)}</strong></div>`;

        const specKeys = Object.keys(specificCables);
        if (specKeys.length > 0) {
            html += `<div class="bom-section-title">Кабельные линии (Спецификация)</div>`;
            specKeys.forEach(key => {
                const item = specificCables[key];
                const m = item.meta;
                let mainTitle = TRANSLATIONS[m.type] || m.type;
                let subTitle = TRANSLATIONS[m.install] || m.install;
                if (m.voltage) mainTitle += `, ${m.voltage}кВ`;
                if (m.subtype && TRANSLATIONS[m.subtype]) mainTitle += `, ${TRANSLATIONS[m.subtype]}`;
                // ОБНОВЛЕНО: Экранируем марку кабеля
                if (m.mark) mainTitle += ` (${escapeHtml(m.mark)})`;
                
                html += `<div class="bom-row"><div class="bom-label"><span class="bom-label-main">${mainTitle}</span><span class="bom-label-sub">${subTitle}</span></div><div class="bom-value">${formatLength(item.length, true)}</div></div>`;
            });
        }

        const genericKeys = Object.keys(genericCables);
        if (genericKeys.length > 0) {
            html += `<div class="bom-section-title">Прочие линии (Без свойств)</div>`;
            genericKeys.forEach(c => {
                html += `<div class="bom-row"><div class="bom-label" style="flex-direction:row; align-items:center;"><div class="bom-color" style="background-color:${c}"></div><span>Кабель (Цвет)</span></div><div class="bom-value">${formatLength(genericCables[c], true)}</div></div>`;
            });
        }

        if (totalArea > 0) {
            let areaStr = Math.round(totalArea) + ' м²';
            if (totalArea > 10000) areaStr = (totalArea / 10000).toFixed(2) + ' га';
            html += `<div class="bom-section-title">Площади</div><div class="bom-row"><div class="bom-label"><span>Зоны покрытия</span></div><div class="bom-value">${areaStr}</div></div>`;
        }

        if (poles+lights+cabinets+flags+stars+substations+subscribers > 0) {
            html += `<div class="bom-section-title">Объекты инфраструктуры</div>`;
            if(subscribers > 0) html += `<div class="bom-row"><div class="bom-label"><span>Абоненты (Дома)</span></div><div class="bom-value">${subscribers} шт.</div></div>`;
            if(lights > 0) html += `<div class="bom-row"><div class="bom-label"><span>Светильники</span></div><div class="bom-value">${lights} шт.</div></div>`;
            if(poles > 0) html += `<div class="bom-row"><div class="bom-label"><span>Опоры</span></div><div class="bom-value">${poles} шт.</div></div>`; 
            if(cabinets > 0) html += `<div class="bom-row"><div class="bom-label"><span>Шкафы</span></div><div class="bom-value">${cabinets} шт.</div></div>`;
            if(flags > 0) html += `<div class="bom-row"><div class="bom-label"><span>Флаги</span></div><div class="bom-value">${flags} шт.</div></div>`;
            if(substations > 0) html += `<div class="bom-row"><div class="bom-label"><span>ТП</span></div><div class="bom-value">${substations} шт.</div></div>`;
        }
        
        html += `<div class="bom-total">Всего кабеля: ${formatLength(totalCable, true)}</div>`;
        html += `<div class="btn-export" id="btn-bom-export"><svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"></path></svg>Скачать .CSV</div>`;
        container.innerHTML = html;
        setTimeout(() => { const expBtn = document.getElementById('btn-bom-export'); if(expBtn) expBtn.onclick = () => this.exportToExcel(); }, 0);
    }

    exportToExcel() { 
        let csv = "\uFEFFКатегория;Тип/Марка;Прокладка;Количество;Ед.изм;Группа\n"; 
        let poles = 0, lights = 0, cabinets = 0, flags = 0, stars = 0, substations = 0, subscribers = 0;
        let genericCables = {}; 
        let specificCables = {};
        let totalArea = 0;

        cadCore.objects.each(obj => {
            if (obj.options.get('visible') === false) return;
            const gType = obj.geometry ? obj.geometry.getType() : '';

            if (gType === 'Point') { 
                const type = obj.properties.get('type');
                if (type === 'pole') poles++; if (type === 'light') lights++; if (type === 'cabinet') cabinets++; 
                if (type === 'flag') flags++; if (type === 'star') stars++; if (type === 'substation') substations++;
                if (type === 'subscriber') subscribers++;
            } 
            else if (gType === 'LineString' && obj !== cadCore.ghostLine) { 
                const coords = obj.geometry.getCoordinates(); 
                let len = 0; 
                for(let i=0; i<coords.length-1; i++) len += ymaps.coordSystem.geo.getDistance(coords[i], coords[i+1]);
                
                const cableData = obj.properties.get('cableData');
                if (cableData && cableData.type) {
                    const key = `${cableData.type}|${cableData.install}|${cableData.voltage || cableData.subtype || ''}|${cableData.mark || ''}`;
                    if (!specificCables[key]) specificCables[key] = { length: 0, meta: cableData };
                    specificCables[key].length += len;
                } else {
                    const color = obj.options.get('strokeColor');
                    genericCables[color] = (genericCables[color] || 0) + len; 
                }
            }
            else if (gType === 'Polygon') {
                try { totalArea += ymaps.util.calculateArea(obj.geometry); } catch(e){}
            }
        });

        let groupName = state.showAllGroups ? "Все" : (state.groups.find(g => g.id === state.activeGroupId) || {}).name;

        Object.values(specificCables).forEach(item => {
            const m = item.meta;
            let desc = TRANSLATIONS[m.type] || m.type;
            if(m.voltage) desc += ` ${m.voltage}кВ`;
            if(m.subtype) desc += ` ${TRANSLATIONS[m.subtype] || m.subtype}`;
            if(m.mark) desc += ` (${m.mark})`;
            const install = TRANSLATIONS[m.install] || m.install;
            let val = formatLength(item.length, true);
            csv += `Кабель;${desc};${install};${val.split(' ')[0]};${val.split(' ')[1]};${groupName}\n`;
        });

        Object.keys(genericCables).forEach(c => { 
            let val = formatLength(genericCables[c], true); 
            csv += `Кабель (Прочее);Цвет ${c};-;${val.split(' ')[0]};${val.split(' ')[1]};${groupName}\n`; 
        });

        if (totalArea > 0) csv += `Площадь;Зоны;-;${Math.round(totalArea)};м²;${groupName}\n`;
        if(subscribers > 0) csv += `Оборудование;Абонент;-;${subscribers};шт.;${groupName}\n`;
        if(lights > 0) csv += `Оборудование;Светильники;-;${lights};шт.;${groupName}\n`;
        if(poles > 0) csv += `Оборудование;Опоры;-;${poles};шт.;${groupName}\n`; 
        if(cabinets > 0) csv += `Оборудование;Шкафы;-;${cabinets};шт.;${groupName}\n`;
        if(flags > 0) csv += `Оборудование;Флаги;-;${flags};шт.;${groupName}\n`;
        if(substations > 0) csv += `Оборудование;ТП;-;${substations};шт.;${groupName}\n`;

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' }); 
        const link = document.createElement("a"); 
        link.href = URL.createObjectURL(blob); 
        link.download = `smeta_${new Date().getTime()}.csv`; 
        document.body.appendChild(link); 
        link.click(); 
        document.body.removeChild(link);
    }

    openRenameModal(target) { state.activeEditingObject = target; document.getElementById('modal-input').value = target.properties.get('userText') || ''; document.getElementById('modal-overlay').style.display = 'flex'; document.getElementById('modal-input').focus(); }
    saveRenameModal() { if(state.activeEditingObject) { const val = document.getElementById('modal-input').value; state.activeEditingObject.properties.set('userText', val); state.activeEditingObject.properties.set('hintContent', val); saveToStorage(); } document.getElementById('modal-overlay').style.display = 'none'; state.activeEditingObject = null; }
    
    updateCableForm() { 
        const type = document.getElementById('cable-type-select').value;
        const container = document.getElementById('cable-dynamic-fields');
        container.innerHTML = '';
        let html = '';
        
        // ВАЖНО: Мы создаем инпуты. Если мы восстанавливаем сохраненное значение, 
        // оно должно быть экранировано, чтобы не сломать HTML атрибут value="...".
        // В данной реализации формы мы создаем ПУСТЫЕ или дефолтные инпуты при переключении типа,
        // а заполнение данными происходит в openCableModal (через .value = ...), что безопасно.
        // Но на всякий случай, placeholders безопасны, так как они статичны.
        
        if (type === 'power') {
            html += `<div class="form-group"><label>Напряжение</label><div class="select-wrapper"><select id="cable-voltage-select"><option value="0.4">0.4 кВ</option><option value="6">6 кВ</option><option value="10">10 кВ</option><option value="35">35 кВ</option></select></div></div><div class="form-group"><label>Марка / Сечение</label><input type="text" id="cable-mark-input" placeholder="Напр: СИП-4 4х16..."></div>`;
        } else if (type === 'low_current') {
            html += `<div class="form-group"><label>Тип системы</label><div class="select-wrapper"><select id="cable-subtype-select"><option value="phone">Линии связи (Телефон)</option><option value="lan">СКС / ЛВС (Витая пара)</option><option value="coax">Коаксиальные (ТВ)</option><option value="security">ОПС / СБ</option></select></div></div><div class="form-group"><label>Марка / Описание</label><input type="text" id="cable-mark-input" placeholder="Напр: UTP 5e..."></div>`;
        } else if (type === 'fiber') {
            html += `<div class="form-group"><label>Тип ВОЛС</label><div class="select-wrapper"><select id="cable-subtype-select"><option value="dist">Распределительная</option><option value="main">Магистральная</option><option value="drop">Дроп</option></select></div></div><div class="form-group"><label>Волоконность / Марка</label><input type="text" id="cable-mark-input" placeholder="Напр: 8 волокон..."></div>`;
        }
        container.innerHTML = html;
    }

    openCableModal(target) { 
        state.activeEditingObject = target; 
        const props = target.properties.get('cableData') || {}; 
        const typeSelect = document.getElementById('cable-type-select'); 
        const installSelect = document.getElementById('cable-install-select'); 
        typeSelect.value = props.type || 'power'; 
        installSelect.value = props.install || 'air'; 
        
        this.updateCableForm(); 
        
        // Безопасная вставка значений через DOM свойства, а не через HTML атрибуты
        setTimeout(() => { 
            if(props.subtype) { const el = document.getElementById('cable-subtype-select'); if(el) el.value = props.subtype; } 
            if(props.voltage) { const el = document.getElementById('cable-voltage-select'); if(el) el.value = props.voltage; } 
            if(props.mark) { const el = document.getElementById('cable-mark-input'); if(el) el.value = props.mark; } 
        }, 0); 
        
        document.getElementById('cable-modal-overlay').style.display = 'flex'; 
    }

    saveCableData() { if(state.activeEditingObject) { const type = document.getElementById('cable-type-select').value; const install = document.getElementById('cable-install-select').value; const elSubtype = document.getElementById('cable-subtype-select'); const elVoltage = document.getElementById('cable-voltage-select'); const elMark = document.getElementById('cable-mark-input'); const subtype = elSubtype ? elSubtype.value : null; const voltage = elVoltage ? elVoltage.value : null; const mark = elMark ? elMark.value : ''; let labelText = ''; if (type === 'power') labelText = `${voltage} кВ`; else if (type === 'low_current') { const map = {phone:'Тел.', lan:'LAN', coax:'Coax', security:'СБ'}; labelText = map[subtype] || 'Слаботочка'; } else if (type === 'fiber') labelText = 'ВОЛС'; if (mark) labelText += ` (${mark})`; state.activeEditingObject.properties.set('cableData', { type, install, subtype, voltage, mark }); state.activeEditingObject.properties.set('userText', labelText); state.activeEditingObject.properties.set('hintContent', labelText); saveToStorage(); } document.getElementById('cable-modal-overlay').style.display = 'none'; state.activeEditingObject = null; }
    handleFileLoad(e) { const file = e.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = (ev) => { try { localStorage.setItem('neon_cad_data_v4', ev.target.result); location.reload(); } catch (err) { alert("Ошибка файла"); } }; reader.readAsText(file); }

    showContextMenu(pixel, target) {
        const menu = document.getElementById('context-menu');
        menu.innerHTML = '';
        state.activeContextObject = target;
        const type = target.geometry.getType();
        const subType = target.properties.get('type');
        
        if (type === 'Point' && subType === 'text') {
            const editItem = document.createElement('div');
            editItem.className = 'ctx-item';
            editItem.innerHTML = `<svg class="ctx-icon" viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg> Изменить текст`;
            editItem.onclick = () => { menu.style.display = 'none'; const currentText = target.properties.get('iconContent'); const newText = prompt("Новый текст:", currentText); if(newText && newText.trim() !== "") { target.properties.set('iconContent', newText.trim()); target.properties.set('userText', newText.trim()); saveToStorage(); } };
            menu.appendChild(editItem);

            const moveItem = document.createElement('div');
            moveItem.className = 'ctx-item';
            moveItem.innerHTML = `<svg class="ctx-icon" viewBox="0 0 24 24"><path d="M10 9h4V6h3l-5-5-5 5h3v3zm-1 1H6V7l-5 5 5 5v-3h3v-4zm14 2l-5-5v3h-3v4h3v3l5-5zm-9 3h-4v3H7l5 5 5-5h-3v-3z"/></svg> Переместить`;
            moveItem.onclick = () => { menu.style.display = 'none'; target.options.set('draggable', true); this.showNotification('Перетащите текст. Он зафиксируется автоматически.'); };
            menu.appendChild(moveItem);

            const div1 = document.createElement('div'); div1.className = 'ctx-divider'; menu.appendChild(div1);
            const rowColors = document.createElement('div'); rowColors.className = 'ctx-row';
            COLORS.forEach(c => { const b = document.createElement('div'); b.className = 'color-btn-mini'; b.style.backgroundColor = c; b.onclick = () => { window.App.cadCore.setPointColor(c); }; rowColors.appendChild(b); });
            menu.appendChild(rowColors);

            const div2 = document.createElement('div'); div2.className = 'ctx-divider'; menu.appendChild(div2);
            const delItem = document.createElement('div');
            delItem.className = 'ctx-item';
            delItem.innerHTML = `<svg class="ctx-icon" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg> Удалить`;
            delItem.onclick = () => { window.App.cadCore.deleteObject(); };
            menu.appendChild(delItem);
        } else {
            // ЛИНИИ И ПОЛИГОНЫ
            if (type === 'LineString') {
                const contItem = document.createElement('div');
                contItem.className = 'ctx-item';
                contItem.innerHTML = `<svg class="ctx-icon" viewBox="0 0 24 24"><path d="M14 6l-6 6h12v2H8l6 6-1.41 1.41L2.83 12l9.76-9.41z"/></svg> Продолжить линию`;
                contItem.onclick = () => { 
                    menu.style.display = 'none';
                    if (window.App.lastClickCoords) {
                        cadCore.continueLine(target, window.App.lastClickCoords);
                    }
                };
                menu.appendChild(contItem);
            }

            const editItem = document.createElement('div');
            editItem.className = 'ctx-item';
            editItem.innerHTML = `<svg class="ctx-icon" viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg> Редактировать узлы`;
            editItem.onclick = () => { menu.style.display = 'none'; cadCore.objects.each(obj => { try{ if(obj.editor) obj.editor.stopEditing() }catch(e){} }); target.editor.startEditing(); };
            menu.appendChild(editItem);

            const delItem = document.createElement('div');
            delItem.className = 'ctx-item';
            let delText = 'Удалить объект';
            if (type === 'LineString') delText = 'Удалить линию';
            else if (type === 'Polygon') delText = 'Удалить зону';
            delItem.innerHTML = `<svg class="ctx-icon" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg> ${delText}`;
            delItem.onclick = () => { window.App.cadCore.deleteObject(); };
            menu.appendChild(delItem);
            
            const div1 = document.createElement('div'); div1.className = 'ctx-divider'; menu.appendChild(div1);
            const rowColors = document.createElement('div'); rowColors.className = 'ctx-row';
            COLORS.forEach(c => { const b = document.createElement('div'); b.className = 'color-btn-mini'; b.style.backgroundColor = c; b.onclick = () => { target.options.set('strokeColor', c); if(type === 'Polygon') target.options.set('fillColor', c); saveToStorage(); }; rowColors.appendChild(b); });
            menu.appendChild(rowColors);

            if (type === 'LineString') {
                const div2 = document.createElement('div'); div2.className = 'ctx-divider'; menu.appendChild(div2);
                const rowType = document.createElement('div'); rowType.className = 'ctx-row';
                const btnSolid = document.createElement('div'); btnSolid.className = 'weight-btn'; btnSolid.innerHTML = '<div class="line-preview solid"></div>'; btnSolid.onclick = () => { target.options.set('strokeStyle', 'solid'); saveToStorage(); };
                const btnDash = document.createElement('div'); btnDash.className = 'weight-btn'; btnDash.innerHTML = '<div class="line-preview dash"></div>'; btnDash.onclick = () => { target.options.set('strokeStyle', 'dash'); saveToStorage(); };
                const btnDot = document.createElement('div'); btnDot.className = 'weight-btn'; btnDot.innerHTML = '<div class="line-preview dot"></div>'; btnDot.onclick = () => { target.options.set('strokeStyle', 'dot'); saveToStorage(); };
                rowType.appendChild(btnSolid); rowType.appendChild(btnDash); rowType.appendChild(btnDot);
                menu.appendChild(rowType);

                const rowWeight = document.createElement('div'); rowWeight.className = 'ctx-row';
                [4, 6, 10].forEach(w => { const btnW = document.createElement('div'); btnW.className = 'weight-btn'; btnW.innerHTML = `<div class="line-preview" style="height:${w/2}px; background:#ccc;"></div>`; btnW.onclick = () => { target.options.set('strokeWidth', w); saveToStorage(); }; rowWeight.appendChild(btnW); });
                menu.appendChild(rowWeight);
            }

            const div3 = document.createElement('div'); div3.className = 'ctx-divider'; menu.appendChild(div3);
            const rowOpacity = document.createElement('div'); rowOpacity.className = 'ctx-row';
            let val = (type === 'Polygon') ? target.options.get('fillOpacity') : target.options.get('strokeOpacity');
            if (val === undefined || val === null) val = 0.8;
            let percent = Math.round(val * 100);
            rowOpacity.innerHTML = `<div style="width:20px;height:20px;display:flex;align-items:center;justify-content:center;"><svg width="16" height="16" fill="none" stroke="#aaa" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3" fill="#aaa"/></svg></div><input type="range" class="ctx-slider" min="10" max="100" value="${percent}">`;
            const slider = rowOpacity.querySelector('input');
            slider.onclick = (e) => e.stopPropagation();
            slider.oninput = (e) => { const op = e.target.value / 100; target.options.set('strokeOpacity', op); if(type === 'Polygon') target.options.set('fillOpacity', op); saveToStorage(); };
            menu.appendChild(rowOpacity);
        }

        menu.style.display = 'flex';
        const menuWidth = menu.offsetWidth; const menuHeight = menu.offsetHeight;
        let x = pixel[0]; let y = pixel[1];
        if (x + menuWidth > window.innerWidth) x = x - menuWidth;
        if (y + menuHeight > window.innerHeight) y = y - menuHeight;
        if (x < 0) x = 0; if (y < 0) y = 0;
        menu.style.left = x + 'px'; menu.style.top = y + 'px';
    }
}

export const uiManager = new UiManager();