import { parseHTML } from 'linkedom';
import emailUtils from '../utils/email-utils';
import { settingConst } from '../const/entity-const';
import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';

const TRANSLATE_MODEL = '@cf/meta/m2m100-1.2b';
const M2M_LANG = {
	zh: 'zh',
	en: 'en',
	ja: 'ja',
	ko: 'ko',
	fr: 'fr',
	de: 'de',
	es: 'es',
	ru: 'ru',
};

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TITLE', 'NOSCRIPT', 'TEXTAREA', 'CODE']);
const MAX_TRANSLATE_CHARS = 8000;
const MAX_SEGMENT_CHARS = 1500;
const TRANSLATE_CONCURRENCY = 4;

const aiService = {

	async translateEmail(c, params) {
		const ai = c.env.ai;
		if (!ai) {
			throw new BizError(t('aiNotConfigured'));
		}

		const targetLang = this.normalizeLang(params.targetLang || 'zh');
		const sourceLang = this.normalizeLang(params.sourceLang || 'en');
		const subject = (params.subject || '').trim();
		const html = (params.content || '').trim();
		const plain = (params.text || '').trim();

		if (!subject && !html && !plain) {
			throw new BizError(t('translateEmpty'));
		}

		const translatedSubject = subject
			? await this.translateText(c, subject, targetLang, sourceLang)
			: '';

		if (html) {
			const content = await this.translateHtml(c, html, targetLang, sourceLang);
			return {
				subject: translatedSubject || subject,
				text: emailUtils.htmlToText(content),
				content,
				targetLang,
			};
		}

		const body = plain.replace(/\s+/g, ' ').trim().slice(0, MAX_TRANSLATE_CHARS);
		const translatedText = body ? await this.translateText(c, body, targetLang, sourceLang) : '';
		const safeText = this.escapeHtml(translatedText || '');
		return {
			subject: translatedSubject || subject,
			text: translatedText,
			content: safeText ? `<div style="white-space:pre-wrap;line-height:1.6;font-family:inherit">${safeText}</div>` : '',
			targetLang,
		};
	},

	normalizeLang(lang) {
		const code = String(lang || '').toLowerCase().split('-')[0];
		return M2M_LANG[code] || 'en';
	},

	async translateHtml(c, html, targetLang, sourceLang) {
		const wrapped = html.includes('<body')
			? html
			: `<!DOCTYPE html><html><body>${html}</body></html>`;
		const { document } = parseHTML(wrapped);
		if (!document.body) {
			return html;
		}

		const textNodes = [];
		let usedChars = 0;
		this.collectTextNodes(document.body, textNodes, () => usedChars < MAX_TRANSLATE_CHARS, (len) => {
			usedChars += len;
		});

		if (!textNodes.length) {
			return html;
		}

		const originals = textNodes.map(node => node.textContent);
		const translated = await this.translateSegments(c, originals, targetLang, sourceLang);

		textNodes.forEach((node, index) => {
			if (typeof translated[index] === 'string' && translated[index].length) {
				const raw = originals[index];
				const leading = raw.match(/^\s*/)?.[0] || '';
				const trailing = raw.match(/\s*$/)?.[0] || '';
				node.textContent = leading + translated[index].trim() + trailing;
			}
		});

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

	async translateSegments(c, segments, targetLang, sourceLang) {
		const result = new Array(segments.length).fill('');
		let cursor = 0;

		const worker = async () => {
			while (cursor < segments.length) {
				const index = cursor++;
				const raw = segments[index] || '';
				const text = raw.trim();
				if (!text || !this.needsTranslate(text, targetLang)) {
					result[index] = text;
					continue;
				}
				try {
					result[index] = await this.translateText(c, text, targetLang, sourceLang);
				} catch (e) {
					console.error('segment translate failed:', e);
					result[index] = text;
				}
			}
		};

		const workers = Array.from(
			{ length: Math.min(TRANSLATE_CONCURRENCY, segments.length) },
			() => worker()
		);
		await Promise.all(workers);
		return result;
	},

	needsTranslate(text, targetLang) {
		if (!/[\p{L}]/u.test(text)) return false;
		if (/^https?:\/\/\S+$/i.test(text)) return false;
		if (/^[\w.+-]+@[\w.-]+$/.test(text)) return false;
		if (targetLang === 'zh' && /[\u4E00-\u9FFF]/.test(text) && !/[A-Za-z]{3,}/.test(text)) {
			return false;
		}
		return true;
	},

	async translateText(c, text, targetLang, sourceLang = 'en') {
		const trimmed = String(text || '').trim();
		if (!trimmed) return '';
		if (!this.needsTranslate(trimmed, targetLang)) return trimmed;

		const ai = c.env.ai;
		const from = this.normalizeLang(sourceLang);
		const to = this.normalizeLang(targetLang);
		if (from === to) return trimmed;

		const chunks = this.splitText(trimmed, MAX_SEGMENT_CHARS);
		const parts = [];
		for (const chunk of chunks) {
			const result = await ai.run(TRANSLATE_MODEL, {
				text: chunk,
				source_lang: from,
				target_lang: to,
			});
			const translated = this.pickTranslatedText(result);
			parts.push(translated || chunk);
		}
		return parts.join('').trim() || trimmed;
	},

	pickTranslatedText(result) {
		if (!result) return '';
		if (typeof result === 'string') return result.trim();
		return String(
			result.translated_text
			|| result.translatedText
			|| result.response
			|| result.result?.translated_text
			|| ''
		).trim();
	},

	splitText(text, maxLen) {
		if (text.length <= maxLen) return [text];
		const chunks = [];
		let rest = text;
		while (rest.length > maxLen) {
			let cut = rest.lastIndexOf(' ', maxLen);
			if (cut < maxLen * 0.5) cut = maxLen;
			chunks.push(rest.slice(0, cut));
			rest = rest.slice(cut).trimStart();
		}
		if (rest) chunks.push(rest);
		return chunks;
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
