/**
 * 后端统一时间与时区工具库
 * 确保所有时间项均以国际标准时间 (ISO 8601 UTC) 存储与读取，不受运行环境时区影响
 */

/**
 * 获取当前国际标准时间 (ISO 8601 UTC 字符串)
 * @returns {string} 例如 "2026-09-28T17:08:00.000Z"
 */
function nowIso() {
    return new Date().toISOString();
}

/**
 * 将传入的时间值转换为标准国际时间 (ISO 8601 UTC)
 * @param {string|Date|number} val
 * @returns {string|null}
 */
function toUtcIso(val) {
    if (!val) return null;
    if (val instanceof Date) {
        return isNaN(val.getTime()) ? null : val.toISOString();
    }
    const str = String(val).trim();
    if (!str) return null;

    // 如果已经是标准的带 Z 格式，直接返回
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/i.test(str)) {
        return str;
    }

    // 处理 SQLite 'YYYY-MM-DD HH:MM:SS'
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(str)) {
        return str.replace(' ', 'T') + 'Z';
    }

    const d = new Date(str);
    return isNaN(d.getTime()) ? str : d.toISOString();
}

/**
 * 校验并规范化纯日期格式 (YYYY-MM-DD)
 * 适用于无需时分秒的业务字段 (如 purchase_date, installed_date 等)
 * @param {string|Date} val
 * @returns {string|null}
 */
function toDateOnly(val) {
    if (!val) return null;
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val.trim())) {
        return val.trim().substring(0, 10);
    }
    const d = new Date(val);
    if (isNaN(d.getTime())) return null;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * 规范化数据库查询结果中的时间字段
 * 将 SQLite 返回的无时区标记 UTC 时间字符串 (如 "2026-09-28 17:08:00") 转换为标准 ISO 8601 ("2026-09-28T17:08:00.000Z")
 * @param {object} row
 * @returns {object}
 */
function normalizeRowTimestamps(row) {
    if (!row || typeof row !== 'object') return row;
    for (const key of Object.keys(row)) {
        const val = row[key];
        if (typeof val === 'string') {
            // 匹配 SQLite CURRENT_TIMESTAMP 的格式: "YYYY-MM-DD HH:MM:SS" 或带毫秒
            if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(val)) {
                row[key] = val.replace(' ', 'T') + 'Z';
            }
        } else if (val instanceof Date) {
            row[key] = val.toISOString();
        }
    }
    return row;
}

module.exports = {
    nowIso,
    toUtcIso,
    toDateOnly,
    normalizeRowTimestamps
};
