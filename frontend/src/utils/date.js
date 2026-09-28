/**
 * 日期工具：避免「只有日期」字段被序列化成 UTC 导致少一天
 */

/** 转成 YYYY-MM-DD（按浏览器本地日历日，不要用 toISOString） */
export function toDateOnly(value) {
  if (value == null || value === '') return null
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4}-\d{2}-\d{2})/)
    if (m) return m[1]
  }
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 把接口返回的日期转成本地 Date，供 Calendar 绑定 */
export function parseDateLocal(value) {
  if (value == null || value === '') return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m) {
      return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    }
  }
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** 列表展示：优先显示 YYYY-MM-DD */
export function formatDate(value, empty = '未知') {
  if (value == null || value === '') return empty
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4}-\d{2}-\d{2})/)
    if (m) return m[1]
  }
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return empty
  return toDateOnly(d) || empty
}

/** 带时间的展示 */
export function formatDateTime(value, empty = '') {
  if (value == null || value === '') return empty
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return empty
  return d.toLocaleString('zh-CN', { hour12: false })
}
