import { parseHTML } from 'linkedom';
import emailUtils from '../utils/email-utils';
import { settingConst } from '../const/entity-const';
import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';

const TRANSLATE_MODEL = '@cf/meta/m2m100-1.2b';
const CHAT_MODEL_DEFAULT = '@cf/meta/llama-3.1-8b-instruct-fast';

// m2m100 对全名更稳（chinese/english），短码时常翻译失败
const M2M_LANG_NAME = {
	zh: 'chinese',
	en: 'english',
	ja: 'japanese',
	ko: 'korean',
	fr: 'french',
	de: 'german',
	es: 'spanish',
	ru: 'russian',
};

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

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TITLE', 'NOSCRIPT', 'TEXTAREA', 'CODE', 'SVG', 'HEAD']);
const MAX_TRANSLATE_CHARS = 12000;
const MAX_SEGMENT_CHARS = 800;
const BATCH_CHARS = 1200;
const SEG_SEP = '\n⟦S⟧\n';

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
		return M2M_LANG_NAME[code] ? code : 'en';
	},

	async translateHtml(c, html, targetLang, sourceLang) {
		const wrapped = /<body[\s>]/i.test(html)
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
			return this.translateHtmlFallback(c, html, targetLang, sourceLang);
		}

		const originals = textNodes.map(node => node.textContent);
		const translated = await this.translateSegments(c, originals, targetLang, sourceLang);

		let changed = 0;
		textNodes.forEach((node, index) => {
			const next = translated[index];
			if (typeof next !== 'string' || !next.length) return;
			const raw = originals[index];
			const leading = raw.match(/^\s*/)?.[0] || '';
			const trailing = raw.match(/\s*$/)?.[0] || '';
			const value = leading + next.trim() + trailing;
			if (value.trim() !== raw.trim()) changed += 1;
			node.textContent = value;
		});

		// 几乎没改动：说明模型未真正翻译，回退整段纯文本翻译
		if (changed === 0) {
			return this.translateHtmlFallback(c, html, targetLang, sourceLang);
		}

		if (!/<body[\s>]/i.test(html)) {
			return document.body.innerHTML;
		}
		return document.body.innerHTML;
	},

	async translateHtmlFallback(c, html, targetLang, sourceLang) {
		const plain = emailUtils.htmlToText(html).replace(/\s+/g, ' ').trim().slice(0, MAX_TRANSLATE_CHARS);
		if (!plain) return html;
		const translatedText = await this.translateText(c, plain, targetLang, sourceLang);
		if (!translatedText || translatedText === plain) return html;
		const safeText = this.escapeHtml(translatedText);
		return `<div style="white-space:pre-wrap;line-height:1.7;font-family:inherit;font-size:14px;color:#13181D">${safeText}</div>`;
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
			if (this.isHiddenElement(node)) return;
			const children = Array.from(node.childNodes || []);
			for (const child of children) {
				walk(child);
				if (!canContinue()) return;
			}
		};
		walk(root);
	},

	isHiddenElement(node) {
		const style = `${node.getAttribute?.('style') || ''}`.toLowerCase();
		if (!style) return false;
		return /display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0|mso-hide\s*:\s*all|max-height\s*:\s*0|font-size\s*:\s*0|line-height\s*:\s*0/.test(style);
	},

	async translateSegments(c, segments, targetLang, sourceLang) {
		const result = new Array(segments.length).fill('');
		const pending = [];

		segments.forEach((raw, index) => {
			const text = (raw || '').trim();
			if (!text || !this.needsTranslate(text, targetLang)) {
				result[index] = text;
				return;
			}
			pending.push({ index, text });
		});

		// 按批次拼接，减少 AI 调用次数（营销邮件文本节点很多）
		let i = 0;
		while (i < pending.length) {
			const batch = [];
			let chars = 0;
			while (i < pending.length) {
				const item = pending[i];
				const len = item.text.length;
				if (batch.length && chars + len > BATCH_CHARS) break;
				batch.push(item);
				chars += len;
				i += 1;
				if (chars >= BATCH_CHARS) break;
			}

			const joined = batch.map(item => item.text).join(SEG_SEP);
			let translatedJoined = '';
			try {
				translatedJoined = await this.translateText(c, joined, targetLang, sourceLang);
			} catch (e) {
				console.error('batch translate failed:', e);
			}

			const parts = translatedJoined ? translatedJoined.split(SEG_SEP) : [];
			if (parts.length === batch.length) {
				batch.forEach((item, idx) => {
					result[item.index] = (parts[idx] || '').trim() || item.text;
				});
			} else {
				// 分隔符被模型吃掉时，逐条翻译
				for (const item of batch) {
					try {
						result[item.index] = await this.translateText(c, item.text, targetLang, sourceLang);
					} catch (e) {
						console.error('segment translate failed:', e);
						result[item.index] = item.text;
					}
				}
			}
		}

		return result;
	},

	needsTranslate(text, targetLang) {
		if (!/[A-Za-z\u00C0-\u024F\u0400-\u04FF\u3040-\u30FF\uAC00-\uD7AF\u4E00-\u9FFF]/.test(text)) {
			return false;
		}
		if (/^https?:\/\/\S+$/i.test(text)) return false;
		if (/^[\w.+-]+@[\w.-]+$/.test(text)) return false;
		if (targetLang === 'zh' && /[\u4E00-\u9FFF]/.test(text) && !/[A-Za-z]{4,}/.test(text)) {
			return false;
		}
		return true;
	},

	async translateText(c, text, targetLang, sourceLang = 'en') {
		const trimmed = String(text || '').trim();
		if (!trimmed) return '';
		if (!this.needsTranslate(trimmed, targetLang)) return trimmed;

		const from = this.normalizeLang(sourceLang);
		const to = this.normalizeLang(targetLang);
		if (from === to) return trimmed;

		const chunks = this.splitText(trimmed, MAX_SEGMENT_CHARS);
		const parts = [];
		for (const chunk of chunks) {
			let translated = await this.translateWithM2m(c, chunk, from, to);
			if (!translated || !this.looksTranslated(chunk, translated, to)) {
				translated = await this.translateWithChat(c, chunk, to);
			}
			parts.push(translated || chunk);
		}
		return parts.join('').trim() || trimmed;
	},

	async translateWithM2m(c, text, sourceLang, targetLang) {
		try {
			const result = await c.env.ai.run(TRANSLATE_MODEL, {
				text,
				source_lang: M2M_LANG_NAME[sourceLang] || 'english',
				target_lang: M2M_LANG_NAME[targetLang] || 'chinese',
			});
			return this.pickTranslatedText(result);
		} catch (e) {
			console.error('m2m translate failed:', e);
			return '';
		}
	},

	async translateWithChat(c, text, targetLang) {
		try {
			const langName = LANG_LABEL[targetLang] || LANG_LABEL.zh;
			const model = c.env.ai_model || CHAT_MODEL_DEFAULT;
			const result = await c.env.ai.run(model, {
				messages: [
					{
						role: 'system',
						content: `You are a professional email translator. Translate the user message into ${langName}. Output ONLY the translation. Keep URLs, emails, and product/package names unchanged. Do not add notes.`
					},
					{
						role: 'user',
						content: text
					}
				],
				temperature: 0.1,
				max_tokens: 2048
			});
			const content = typeof result === 'string' ? result : (result?.response || '');
			return String(content || '').trim();
		} catch (e) {
			console.error('chat translate failed:', e);
			return '';
		}
	},

	looksTranslated(original, translated, targetLang) {
		if (!translated) return false;
		const src = original.trim();
		const dst = translated.trim();
		if (!dst) return false;
		if (dst === src) return false;
		if (targetLang === 'zh') {
			return /[\u4E00-\u9FFF]/.test(dst);
		}
		if (targetLang === 'ja') {
			return /[\u3040-\u30FF\u4E00-\u9FFF]/.test(dst);
		}
		if (targetLang === 'ko') {
			return /[\uAC00-\uD7AF]/.test(dst);
		}
		return /[A-Za-z]/.test(dst);
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

			const result = await ai.run(c.env.ai_model || CHAT_MODEL_DEFAULT, {
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
