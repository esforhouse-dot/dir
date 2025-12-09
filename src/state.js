import { COLORS } from './config.js';

export const state = {
    opacity: 1.0,
    lineStyle: 'solid',
    lineWeight: 5,
    tool: null,
    color: COLORS[0],
    showMeasurements: true,
    isDrawing: false,
    activeEditingObject: null,
    drawingLine: null,
    
    // Новые свойства для логики слияния линий
    mergeTarget: null, // Линия, которую мы продолжаем
    mergeIndex: -1,    // Индекс узла, от которого начали (0 - начало, last - конец)

    groups: [{id: 1, name: 'Группа 1'}],
    activeGroupId: 1,
    showAllGroups: true,
    poiEnabled: true,
    isEraserDown: false,
    mousePos: { x: 0, y: 0 },
    activeContextObject: null
};