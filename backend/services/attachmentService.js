/**
 * 附件管理服务
 * 记录所有上传文件，供后台附件管理使用：
 *  - 记录上传者 (user_id)
 *  - 检测文件是否被业务记录引用 (用于哪个项目)
 *  - 支持管理员删除 (含历史/孤儿文件)
 */
const path = require('path');
const fs = require('fs');
const { query, get } = require('../config/database');

/**
 * 系统上传目录 (UPLOAD_PATH)
 */
function getUploadDir() {
    const uploadPath = process.env.UPLOAD_PATH || './uploads';
    return path.isAbsolute(uploadPath) ? uploadPath : path.resolve(process.cwd(), uploadPath);
}

/**
 * 历史上传目录 (旧版本曾将文件存放在 data/upload)
 */
function getLegacyUploadDir() {
    return path.resolve(process.cwd(), 'data', 'upload');
}

/**
 * 记录一次上传
 */
async function recordAttachment({ userId, originalName, storedName, mimetype, size, url, projectType }) {
    try {
        await query(
            `INSERT INTO attachments (user_id, original_name, stored_name, mime_type, size, url, project_type)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [userId || null, originalName || '', storedName || '', mimetype || '', size || 0, url, projectType || null]
        );
    } catch (err) {
        console.error('[Attachments] 记录附件失败:', err.message);
    }
}

/**
 * 构建"已使用"文件引用索引: url -> 项目描述
 * 遍历所有可能引用上传文件的业务表
 */
async function buildReferenceIndex() {
    const refs = {};
    const add = (url, label) => {
        if (url && typeof url === 'string') refs[url] = label;
    };

    // 车险保单
    const insurances = await query(`
        SELECT i.policy_image_url, v.plate_number, i.policy_number
        FROM insurances i
        LEFT JOIN vehicles v ON i.vehicle_id = v.id
    `);
    for (const r of insurances) {
        add(r.policy_image_url, `车险保单 · ${r.plate_number || '未关联车辆'}${r.policy_number ? ' · ' + r.policy_number : ''}`);
    }

    // 保养发票
    const maintenance = await query(`
        SELECT m.invoice_url, v.plate_number, m.maintenance_date
        FROM maintenance_records m
        LEFT JOIN vehicles v ON m.vehicle_id = v.id
    `);
    for (const r of maintenance) {
        add(r.invoice_url, `保养发票 · ${r.plate_number || '未关联车辆'}${r.maintenance_date ? ' · ' + String(r.maintenance_date).slice(0, 10) : ''}`);
    }

    // 车辆照片
    const vehicles = await query(`SELECT photo_url, plate_number FROM vehicles`);
    for (const r of vehicles) add(r.photo_url, `车辆照片 · ${r.plate_number || ''}`);

    // 配件照片
    const parts = await query(`
        SELECT p.photo_url, p.name, v.plate_number
        FROM parts p
        LEFT JOIN vehicles v ON p.vehicle_id = v.id
    `);
    for (const r of parts) {
        add(r.photo_url, `配件照片 · ${r.name || ''}${r.plate_number ? ' (' + r.plate_number + ')' : ''}`);
    }

    // 站点图标
    const icon = await get(`SELECT value FROM system_settings WHERE key = 'site_icon'`);
    add(icon && icon.value, '站点图标');

    // PWA 派生图标 (系统组件，避免误删)
    const uploadDir = getUploadDir();
    for (const name of ['icon-192.png', 'icon-512.png', 'favicon.png']) {
        if (fs.existsSync(path.join(uploadDir, name))) {
            add('/uploads/' + name, '站点图标 (PWA)');
        }
    }

    return refs;
}

/**
 * 扫描磁盘上的上传文件
 * @returns {{ set: Set, files: Array }}
 */
function scanDisk() {
    const set = new Set();
    const files = [];

    const walk = (root, urlPrefix) => {
        if (!fs.existsSync(root)) return;
        const stack = [root];
        while (stack.length) {
            const dir = stack.pop();
            let entries;
            try {
                entries = fs.readdirSync(dir, { withFileTypes: true });
            } catch (e) {
                continue;
            }
            for (const ent of entries) {
                const full = path.join(dir, ent.name);
                if (ent.isDirectory()) {
                    stack.push(full);
                } else if (ent.isFile()) {
                    const rel = path.relative(root, full).split(path.sep).join('/');
                    const url = urlPrefix + rel;
                    let st;
                    try {
                        st = fs.statSync(full);
                    } catch (e) {
                        continue;
                    }
                    set.add(url);
                    files.push({ url, basename: ent.name, size: st.size, mtime: st.mtime });
                }
            }
        }
    };

    walk(getUploadDir(), '/uploads/');
    walk(getLegacyUploadDir(), '/data/upload/');

    return { set, files };
}

/**
 * 根据 URL 推断文件类型显示名
 */
function typeLabel(url, projectType) {
    const map = {
        insurance: '车险保单',
        system: '系统图标',
        maintenance: '保养发票',
        vehicle: '车辆照片',
        parts: '配件照片'
    };
    if (projectType && map[projectType]) return map[projectType];
    if (!url) return '文件';
    if (/\.pdf$/i.test(url)) return 'PDF 文档';
    if (/site_icon|icon-192|icon-512|favicon/i.test(url)) return '站点图标';
    if (/insurance\//.test(url)) return '车险保单';
    if (/\.(png|jpe?g|gif|webp|svg)$/i.test(url)) return '图片';
    return '文件';
}

/**
 * 获取附件列表 (数据库记录 + 磁盘历史文件)
 * 每项包含: 上传用户 / 使用状态 / 关联项目 / 文件是否存在
 */
async function listAttachments() {
    const [rows, refs, disk] = await Promise.all([
        query(`
            SELECT a.*, COALESCE(u.nickname, u.username) AS uploader_name
            FROM attachments a
            LEFT JOIN users u ON a.user_id = u.id
            ORDER BY a.created_at DESC, a.id DESC
        `),
        buildReferenceIndex(),
        scanDisk()
    ]);

    const dbUrls = new Set(rows.map(r => r.url));
    const items = [];

    for (const r of rows) {
        items.push({
            id: r.id,
            url: r.url,
            original_name: r.original_name,
            stored_name: r.stored_name,
            mime_type: r.mime_type,
            size: r.size,
            created_at: r.created_at,
            uploader_id: r.user_id,
            uploader_name: r.uploader_name || '未知用户',
            project_type: r.project_type,
            type_label: typeLabel(r.url, r.project_type),
            used: !!refs[r.url],
            project_label: refs[r.url] || null,
            file_exists: disk.set.has(r.url),
            source: 'db'
        });
    }

    for (const d of disk.files) {
        if (dbUrls.has(d.url)) continue;
        items.push({
            id: null,
            url: d.url,
            original_name: d.basename,
            stored_name: d.basename,
            mime_type: '',
            size: d.size,
            created_at: new Date(d.mtime).toISOString(),
            uploader_id: null,
            uploader_name: '未知 (历史文件)',
            project_type: null,
            type_label: typeLabel(d.url, null),
            used: !!refs[d.url],
            project_label: refs[d.url] || null,
            file_exists: true,
            source: 'disk'
        });
    }

    items.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    return items;
}

/**
 * 将 URL 解析为磁盘绝对路径 (防路径穿越)
 */
function resolveUrlToPath(url) {
    if (typeof url !== 'string' || !url) return null;

    let base, rel;
    if (url.startsWith('/uploads/')) {
        base = getUploadDir();
        rel = url.slice('/uploads/'.length);
    } else if (url.startsWith('/data/upload/')) {
        base = getLegacyUploadDir();
        rel = url.slice('/data/upload/'.length);
    } else {
        return null;
    }

    if (!rel) return null;
    const p = path.resolve(base, rel);
    const relCheck = path.relative(base, p);
    if (relCheck.startsWith('..') || path.isAbsolute(relCheck)) return null;
    return p;
}

/**
 * 删除附件 (文件 + 数据库记录)
 * 被业务记录引用的文件不允许删除
 */
async function deleteAttachment({ id, url }) {
    let row = null;
    if (id) {
        row = await get('SELECT * FROM attachments WHERE id = ?', [id]).catch(() => null);
        if (row) url = row.url;
    }
    if (!url) {
        return { ok: false, status: 400, message: '缺少文件地址' };
    }

    // 检查是否被业务记录引用
    const refs = await buildReferenceIndex();
    if (refs[url]) {
        return {
            ok: false,
            status: 409,
            message: `该文件正被「${refs[url]}」使用，无法删除。请先删除关联的业务记录`
        };
    }

    const absPath = resolveUrlToPath(url);
    if (absPath) {
        try {
            if (fs.existsSync(absPath)) {
                fs.unlinkSync(absPath);
            }
        } catch (e) {
            return { ok: false, status: 500, message: '删除文件失败: ' + e.message };
        }
    }

    if (row) {
        await query('DELETE FROM attachments WHERE id = ?', [row.id]);
    }
    return { ok: true, message: '文件已删除' };
}

module.exports = {
    getUploadDir,
    getLegacyUploadDir,
    recordAttachment,
    buildReferenceIndex,
    listAttachments,
    deleteAttachment
};
