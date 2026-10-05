/**
 * 统一时间与时区处理工具库
 * 确保所有时间以国际标准时间 (ISO 8601 UTC) 存储与传输，
 * 在用户界面无论服务器处于何种时区，均准确呈现用户输入的真实时间，杜绝时区漂移。
 */

/**
 * 将任意时间字符串或对象安全解析为 Date 对象
 * 若 SQLite 返回 'YYYY-MM-DD HH:MM:SS' (UTC 无时区标识)，自动补齐 UTC 标识 'Z'
 */
export function parseDate(val) {
    if (!val) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;

    let str = String(val).trim();
    if (!str) return null;

    // 处理纯日期格式 'YYYY-MM-DD'：按本地日期的 00:00:00 解析，避免按 UTC 解析造成跨时区减一天
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        const [year, month, day] = str.split('-').map(Number);
        return new Date(year, month - 1, day);
    }

    // 处理 SQLite CURRENT_TIMESTAMP 格式 'YYYY-MM-DD HH:MM:SS' (SQLite 中记录的是 UTC 时间)
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(str)) {
        str = str.replace(' ', 'T') + 'Z';
    }

    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
}

/**
 * 格式化纯日期 (YYYY-MM-DD)
 * 无论浏览器或服务器处于什么时区，纯日期（如购车日期、保险起止日期、出险日期）始终保持用户输入的具体公历日
 * @param {string|Date} val - 待格式化日期
 * @param {string} fallback - 为空时的默认显示值
 */
export function formatDate(val, fallback = '-') {
    if (!val) return fallback;

    // 如果已经是 'YYYY-MM-DD' 格式，直接返回，避免任何时区转换
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val.trim())) {
        return val.trim();
    }

    const d = parseDate(val);
    if (!d) return fallback;

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * 格式化日期与时间 (YYYY-MM-DD HH:mm:ss 或 YYYY-MM-DD HH:mm)
 * 将保存的国际标准时间 (UTC) 转换为用户客户端所在时区的当地时间展示
 * @param {string|Date} val - 待格式化时间
 * @param {boolean} includeSeconds - 是否包含秒数，默认 false
 * @param {string} fallback - 为空时的默认显示值
 */
export function formatDateTime(val, includeSeconds = false, fallback = '-') {
    if (!val) return fallback;

    const d = parseDate(val);
    if (!d) return fallback;

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');

    if (includeSeconds) {
        const seconds = String(d.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * 提交纯日期字段给后端 (如购车日期、保单生效日)
 * 提取用户在日历控件中选取的本地年月日，转换为 'YYYY-MM-DD' 字符串
 * 杜绝传统 .toISOString().split('T')[0] 在东半球导致日期少一天的严重 Bug
 */
export function toLocalDateString(val) {
    if (!val) return null;
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val.trim())) {
        return val.trim();
    }

    const d = val instanceof Date ? val : parseDate(val);
    if (!d) return null;

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * 提交具体时间点字段给后端 (如加油时间、保养时间)
 * 将本地选取的具体时间转换为标准国际时间 (ISO 8601 UTC 字符串，如 2026-09-28T16:30:00.000Z)
 * 无论服务端设置在任何时区（UTC / 东八区 / 欧美时区），底层均记录绝对无歧义的时间戳
 */
export function toUtcIsoString(val) {
    if (!val) return null;
    const d = val instanceof Date ? val : parseDate(val);
    if (!d) return null;
    return d.toISOString();
}

/**
 * 专为 PrimeVue Calendar 组件编辑弹窗设计的解析器
 * 将后端返回的 'YYYY-MM-DD' 转换为本地 Date 对象，使日历弹窗高亮对应的正确公历日
 */
export function parseLocalDate(val) {
    return parseDate(val);
}

export default {
    parseDate,
    formatDate,
    formatDateTime,
    toLocalDateString,
    toUtcIsoString,
    parseLocalDate
};
