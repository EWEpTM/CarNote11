/**
 * OCR 服务模块
 * 针对中国保险保单优化的识别与解析
 * - 图片: tesseract.js (chi_sim+eng) + sharp 预处理
 * - PDF: pdf-parse 提取文字 (电子保单)
 * 语言包加载优先级: 本地 language/ 目录 (随镜像内置) > OCR_LANG_PATH 环境变量 > CDN 下载
 */

const fs = require('fs');
const path = require('path');

const PDF_EXTENSIONS = ['.pdf'];

// 随项目内置的语言包目录 (backend/language)
const LOCAL_LANG_DIR = path.join(__dirname, '..', 'language');

/**
 * 解析 tesseract.js 语言包目录
 * 若本地语言包存在则使用本地路径，否则回退到环境变量或 CDN
 */
function resolveLangPath() {
    if (process.env.OCR_LANG_PATH) {
        return process.env.OCR_LANG_PATH;
    }
    if (fs.existsSync(path.join(LOCAL_LANG_DIR, 'chi_sim.traineddata.gz'))) {
        return LOCAL_LANG_DIR;
    }
    return undefined;
}

/**
 * 识别保单文件内容
 * @param {string} filePath 保单文件物理路径 (图片或 PDF)
 * @returns {Promise<{rawText: string, parsedData: object}>}
 */
async function recognizePolicy(filePath) {
    let rawText = '';
    let parsedData = {};

    try {
        const ext = path.extname(filePath || '').toLowerCase();

        if (PDF_EXTENSIONS.includes(ext)) {
            rawText = await extractPdfText(filePath);
        } else {
            rawText = await ocrImage(filePath);
        }

        parsedData = parseInsuranceText(rawText);
    } catch (error) {
        console.error('[OCR Service] 识别失败:', error);
        rawText = `识别出错: ${error.message}`;
    }

    return {
        rawText,
        parsedData
    };
}

/**
 * 图片 OCR (tesseract.js, 简体中文优先)
 * @param {string} filePath 图片物理路径
 * @returns {Promise<string>} 识别出的文本
 */
async function ocrImage(filePath) {
    let createWorker;
    try {
        ({ createWorker } = require('tesseract.js'));
    } catch (e) {
        throw new Error('OCR 引擎 (tesseract.js) 未安装，无法识别图片保单');
    }

    // 预处理图片，提升中文识别率
    let input = filePath;
    try {
        const sharp = require('sharp');
        input = await sharp(filePath)
            .rotate()                  // 自动旋转 (EXIF)
            .greyscale()               // 灰度化
            .normalize()               // 增强对比度
            .resize({ width: 2400, withoutEnlargement: true })
            .png()
            .toBuffer();
    } catch (e) {
        console.warn('[OCR Service] 图片预处理失败，将使用原图:', e.message);
    }

    const options = {};
    const langPath = resolveLangPath();
    if (langPath) {
        options.langPath = langPath;
    }

    const worker = await createWorker('chi_sim+eng', 1, options);
    try {
        const ret = await worker.recognize(input);
        return (ret.data && ret.data.text) || '';
    } finally {
        try { await worker.terminate(); } catch (e) { /* ignore */ }
    }
}

/**
 * PDF 文本提取 (适用于电子保单，扫描件请转图片后使用 OCR)
 * @param {string} filePath PDF 物理路径
 * @returns {Promise<string>} 提取出的文本
 */
async function extractPdfText(filePath) {
    let pdfParse;
    try {
        pdfParse = require('pdf-parse');
    } catch (e) {
        throw new Error('PDF 解析库 (pdf-parse) 未安装，无法提取 PDF 保单文本');
    }

    const data = await pdfParse(fs.readFileSync(filePath));
    const text = (data && data.text) || '';
    if (!text.trim()) {
        throw new Error('未能从该 PDF 提取到文字，可能是扫描件，请将保单转为图片后重试');
    }
    return text;
}

/**
 * 从文本中解析中国保险保单常见字段
 * @param {string} text OCR / PDF 提取出的原始文本
 * @returns {object} parsedData
 */
function parseInsuranceText(text) {
    const data = {};
    if (!text) return data;

    // 保单号
    const policyNoMatch = text.match(/(?:保单(?:号|号码)?|保险单(?:号|号码)?|单号|投保单号)\s*[:：]\s*([A-Za-z0-9][A-Za-z0-9\-_]{5,})/);
    if (policyNoMatch) data.policyNumber = policyNoMatch[1];

    // 保险公司
    const companyMatch = text.match(/(中国平安财产保险|中国平安产险|平安产险|中国平安|中国太平洋财产保险|太平洋产险|中国太平洋|太平洋保险|中国人民财产保险|人保财险|中国人保|中国人民保险|中国人寿财产保险|国寿财险|中国人寿|中华联合财产保险|中华联合|中华保险|大地财产保险|大地保险|阳光财产保险|阳光产险|阳光保险|天安财产保险|天安保险|鼎和财产保险|鼎和保险|华安财产保险|华安保险|永安财产保险|永安保险|安盛天平|中银保险|众安保险|泰康在线|华泰财产保险|华泰财险|太平财产保险|太平财险|紫金财产保险|紫金财险|大家财产保险|大家保险|渤海财产保险|渤海保险|都邦财产保险|亚太财产保险|浙商财产保险|利宝保险|京东安联|安联财产保险|美亚财产保险|中意财产保险)/);
    if (companyMatch) data.insuranceCompany = companyMatch[1];

    // 被保险人 / 投保人
    const insuredMatch = text.match(/(?:被保险人|被保人|投保人|车主)\s*[:：]\s*([^\n\r,，;；【】\s][^\n\r,，;；【】]{0,19})/);
    if (insuredMatch) data.insuredName = insuredMatch[1].trim();

    // 车牌号 (中国车牌)
    const plateMatch = text.match(/([京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼使领][A-Z][A-Z0-9]{4,6}[A-Z0-9挂学警港澳]{0,2})/);
    if (plateMatch) data.plateNumber = plateMatch[1];

    // 保险期间 - 起保日期
    const startMatch = text.match(/(?:保险期间|保险期限|保险起期|起保日期|起保时间|生效日期|保险期间起|承保期间)\s*[:：]?\s*(?:自)?\s*(\d{4})\s*[年\-/. ]\s*(\d{1,2})\s*[月\-/. ]\s*(\d{1,2})\s*日?/);
    if (startMatch) data.startDate = toDateString(startMatch[1], startMatch[2], startMatch[3]);

    // 保险期间 - 终保日期 (至 ... 止)
    const endMatch = text.match(/(?:至|止到|到|截止)\s*(\d{4})\s*[年\-/. ]\s*(\d{1,2})\s*[月\-/. ]\s*(\d{1,2})\s*日?/);
    if (endMatch) data.endDate = toDateString(endMatch[1], endMatch[2], endMatch[3]);

    // 保费
    const premiumMatch = text.match(/(?:保费|保险费|实缴保费|实收保费|商业险保费|交强险保费|保费合计|总保费)\s*[:：]?\s*[￥¥]?\s*([0-9][0-9,]*\.?\d{0,2})/);
    if (premiumMatch) {
        const num = parseFloat(premiumMatch[1].replace(/,/g, ''));
        if (!isNaN(num)) data.premium = num;
    }

    // 险种类型
    const hasCompulsory = /交强险/.test(text);
    const hasCommercial = /商业险/.test(text);
    if (hasCompulsory && hasCommercial) data.insuranceType = '商业+交强险';
    else if (hasCommercial) data.insuranceType = '商业险';
    else if (hasCompulsory) data.insuranceType = '交强险';

    return data;
}

/**
 * 将年月日拼接为 YYYY-MM-DD
 */
function toDateString(year, month, day) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${year}-${pad(month)}-${pad(day)}`;
}

module.exports = {
    recognizePolicy,
    parseInsuranceText
};
