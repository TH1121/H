import { parseHTML } from 'linkedom';
import emailUtils from '../utils/email-utils';
import { settingConst } from '../const/entity-const';
import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';

const LANG_LABEL = {
	zh: 'Simplified Chinese',
	en: 'English',
	ja: 'Japanese',
	ko: 'Korean',
	fr: 'French',
	de: 'German',
	es: 'Spanish',
	ru: 'Russian',
};

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TITLE', 'NOSCRIPT', 'TEXTAREA', 'CODE']);
const MAX_TRANSLATE_CHARS = 6000;
const BATCH_CHARS = 2800;

const aiService = {

	async translateEmail(c, params) {
		const ai = c.env.ai;
		if (!ai) {
			throw new BizError(t('aiNotConfigured'));
		}

		const targetLang = (params.targetLang || 'zh').toLowerCase();
		const langName = LANG_LABEL[targetLang] || LANG_LABEL.zh;
		const subject = (params.subject || '').trim();
		const html = (params.content || '').trim();
		const plain = (params.text || '').trim();

		if (!subject && !html && !plain) {
			throw new BizError(t('translateEmpty'));
		}

		const translatedSubject = subject
			? await this.translateText(c, subject, langName)
			: '';

		if (html) {
			const content = await this.translateHtml(c, html, langName);
			return {
				subject: translatedSubject || subject,
				text: emailUtils.htmlToText(content),
				content,
				targetLang,
			};
		}

		const body = plain.replace(/\s+/g, ' ').trim().slice(0, MAX_TRANSLATE_CHARS);
		const translatedText = body ? await this.translateText(c, body, langName) : '';
		const safeText = this.escapeHtml(translatedText || '');
		return {
			subject: translatedSubject || subject,
			text: translatedText,
			content: safeText ? `<div style="white-space:pre-wrap;line-height:1.6;font-family:inherit">${safeText}</div>` : '',
			targetLang,
		};
	},

	async translateHtml(c, html, langName) {
		const wrapped = html.includes('<body')
			? html
			: `<!DOCTYPE html><html><body>${html}</body></html>`;
		const { document } = parseHTML(wrapped);
		if (!document.body) {
			return html;
		}

		const textNodes = [];
		let usedChars = 0;
		this.collectTextNodes(document.body, textNodes, () => {
			if (usedChars >= MAX_TRANSLATE_CHARS) return false;
			return true;
		}, (len) => {
			usedChars += len;
		});

		if (!textNodes.length) {
			return html;
		}

		const originals = textNodes.map(node => node.textContent);
		const translated = await this.translateSegments(c, originals, langName);

		textNodes.forEach((node, index) => {
			if (typeof translated[index] === 'string' && translated[index].length) {
				// 保留原文首尾空白，避免打乱布局
				const raw = originals[index];
				const leading = raw.match(/^\s*/)?.[0] || '';
				const trailing = raw.match(/\s*$/)?.[0] || '';
				node.textContent = leading + translated[index].trim() + trailing;
			}
		});

		// 尽量返回与入参同形态的 HTML（无外层 html/body 时只回 body 内容）
		if (!html.includes('<body')) {
			return document.body.innerHTML;
		}
		return document.documentElement?.outerHTML || document.body.innerHTML;
	},

	collectTextNodes(root, out, canContinue, onAdd) {
		const walk = (node) => {
			if (!canContinue()) return;
			if (node.nodeType === 3) {
				const raw = node.textContent || '';
				if (!raw.trim()) return;
				const len = raw.trim().length;
				if (!canContinue()) return;
				out.push(node);
				onAdd(len);
				return;
			}
			if (node.nodeType !== 1) return;
			const tag = (node.tagName || '').toUpperCase();
			if (SKIP_TAGS.has(tag)) return;
			const children = Array.from(node.childNodes || []);
			for (const child of children) {
				walk(child);
				if (!canContinue()) return;
			}
		};
		walk(root);
	},

	async translateSegments(c, segments, langName) {
		const result = new Array(segments.length).fill('');
		let index = 0;

		while (index < segments.length) {
			const batch = [];
			const batchIndexes = [];
			let chars = 0;

			while (index < segments.length) {
				const item = segments[index];
				const len = item.trim().length;
				if (batch.length && chars + len > BATCH_CHARS) break;
				batch.push(item.trim());
				batchIndexes.push(index);
				chars += len;
				index += 1;
				if (chars >= BATCH_CHARS) break;
			}

			const translatedBatch = await this.translateJsonArray(c, batch, langName);
			batchIndexes.forEach((segIndex, i) => {
				result[segIndex] = translatedBatch[i] ?? batch[i] ?? '';
			});
		}

		return result;
	},

	async translateJsonArray(c, segments, langName) {
		if (!segments.length) return [];

		const ai = c.env.ai;
		const model = c.env.ai_model || '@cf/meta/llama-3.1-8b-instruct-fast';
		const result = await ai.run(model, {
			messages: [
				{
					role: 'system',
					content: `You are a professional email translator. Translate every string in the JSON array into ${langName}. Return ONLY a JSON array of the same length. Do not add keys, markdown, or explanations. Keep URLs, emails, and code-like tokens unchanged when possible.`
				},
				{
					role: 'user',
					content: JSON.stringify(segments)
				}
			],
			temperature: 0.1,
			max_tokens: 2048
		});

		const content = typeof result === 'string' ? result : (result?.response || '');
		const parsed = this.parseJsonArray(content, segments.length);
		if (parsed) return parsed;

		// 回退：整批拼成一段翻译后再按原段数尽量切分失败时逐条翻译
		const fallback = [];
		for (const seg of segments) {
			fallback.push(await this.translateText(c, seg, langName));
		}
		return fallback;
	},

	parseJsonArray(content, expectedLength) {
		if (!content) return null;
		const text = String(content).trim();
		const start = text.indexOf('[');
		const end = text.lastIndexOf(']');
		if (start < 0 || end <= start) return null;
		try {
			const arr = JSON.parse(text.slice(start, end + 1));
			if (!Array.isArray(arr) || arr.length !== expectedLength) return null;
			return arr.map(item => String(item ?? ''));
		} catch (e) {
			return null;
		}
	},

	async translateText(c, text, langName) {
		const ai = c.env.ai;
		const model = c.env.ai_model || '@cf/meta/llama-3.1-8b-instruct-fast';
		const result = await ai.run(model, {
			messages: [
				{
					role: 'system',
					content: `You are a professional email translator. Translate the user message into ${langName}. Preserve meaning and tone. Output only the translation with no quotes, labels, or explanations.`
				},
				{
					role: 'user',
					content: text
				}
			],
			temperature: 0.2,
			max_tokens: 2048
		});

		const content = typeof result === 'string' ? result : (result?.response || '');
		return String(content || '').trim();
	},

	escapeHtml(str) {
		return String(str)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	},

	async extractCode(c, email, options = {}) {
		if (!this.shouldExtractCode(options.aiCode, options.aiCodeFilter, email)) {
			return '';
		}

		const ai = c.env.ai;

		try {
			const subject = email.subject || '';
			const text = emailUtils.formatText(email.text || '');
			const htmlText = emailUtils.htmlToText(email.html || '');
			const body = (htmlText || text).slice(0, 6000);

			if (!subject && !body) {
				return '';
			}

			const result = await ai.run(c.env.ai_model || '@cf/meta/llama-3.1-8b-instruct-fast', {
				messages: [
					{
						role: 'system',
						content: 'You extract verification codes from emails. Return only JSON like {"code":"12345678"} or {"code":""}. The code must be 8 characters or fewer and must not contain spaces. If the code is longer than 8 characters or contains spaces, return {"code":""}. Do not explain.'
					},
					{
						role: 'user',
						content: `Subject: ${subject}\n\n${body}`
					}
				],
				temperature: 0,
				max_tokens: 32
			});

			const content = typeof result === 'string' ? result : result?.response || '';
			const json = typeof content === 'string' ? JSON.parse(content) : content;
			if (typeof json.code !== 'string') {
				return '';
			}

			if (json.code.length > 8 || /\s/.test(json.code)) {
				return '';
			}

			return json.code;
		} catch (e) {
			console.error('验证码提取失败: ', e);
			return '';
		}
	},

	shouldExtractCode(aiCode, aiCodeFilterStr, email) {
		if (aiCode !== settingConst.aiCode.OPEN) {
			return false;
		}

		const filterList = aiCodeFilterStr ? aiCodeFilterStr.split(',').map(item => item.trim().toLowerCase()).filter(Boolean) : [];

		if (filterList.length === 0) {
			return true;
		}

		const fromEmail = (email.from?.address || '').trim().toLowerCase();
		const fromDomain = emailUtils.getDomain(fromEmail).toLowerCase();

		return filterList.some(item => item === fromEmail || item === fromDomain);
	}
};

export default aiService;
