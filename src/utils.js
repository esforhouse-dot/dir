export function debounce(func, wait) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

export function formatLength(val, useComma = false) {
    let res;
    if (val < 100) {
        res = val.toFixed(1) + ' м';
    } else if (val < 1000) {
        res = Math.round(val) + ' м';
    } else {
        res = (val / 1000).toFixed(2) + ' км';
    }
    if(useComma) return res.replace('.', ',');
    return res;
}

// --- НОВАЯ ФУНКЦИЯ ДЛЯ ЗАЩИТЫ ОТ XSS ---
export function escapeHtml(text) {
    if (!text) return text;
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}