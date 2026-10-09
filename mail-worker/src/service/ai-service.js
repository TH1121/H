import emailUtils from '../utils/email-utils';
import { settingConst } from '../const/entity-const';
import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';

const TRANSLATE_MODEL = '@cf/meta/m2m100-1.2b';
const CHAT_MODEL_DEFAULT = '@cf/meta/llama-3.1-8b-instruct-fast';

// m2m100 对全名更稳（chinese/english）
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

const MAX_TRANSLATE_CHARS = 10000;
const MAX_CHUNK_CHARS = 700;

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

		// 正文以纯文本为准（主题已能译出，HTML 节点替换对营销邮件不可靠）
		const plainBody = (plain || emailUtils.htmlToText(html) || this.stripHtml(html) || '')
			.replace(/\s+/g, ' ')
			.trim()
			.slice(0, MAX_TRANSLATE_CHARS);

		const [translatedSubject, translatedText] = await Promise.all([
			subject ? this.translateText(c, subject, targetLang, sourceLang) : Promise.resolve(''),
			plainBody ? this.translateText(c, plainBody, targetLang, sourceLang) : Promise.resolve(''),
		]);

		if (plainBody && !this.looksTranslated(plainBody, translatedText, targetLang)) {
			throw new BizError(t('translateEmpty'));
		}

		const content = translatedText
			? this.wrapTranslatedHtml(translatedText)
			: '';

		return {
			subject: translatedSubject || subject,
			text: translatedText || plainBody,
			content,
			targetLang,
		};
	},

	wrapTranslatedHtml(text) {
		const safe = this.escapeHtml(text);
		return `<div style="white-space:pre-wrap;word-break:break-word;line-height:1.7;font-family:inherit;font-size:14px;color:#13181D;padding:4px 0">${safe}</div>`;
	},

	stripHtml(html) {
		return String(html || '')
			.replace(/<script[\s\S]*?<\/script>/gi, ' ')
			.replace(/<style[\s\S]*?<\/style>/gi, ' ')
			.replace(/<!--[\s\S]*?-->/g, ' ')
			.replace(/<[^>]+>/g, ' ')
			.replace(/&nbsp;/gi, ' ')
			.replace(/&amp;/gi, '&')
			.replace(/&lt;/gi, '<')
			.replace(/&gt;/gi, '>')
			.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
			.replace(/\s+/g, ' ')
			.trim();
	},

	normalizeLang(lang) {
		const code = String(lang || '').toLowerCase().split('-')[0];
		return M2M_LANG_NAME[code] ? code : 'en';
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

		const chunks = this.splitText(trimmed, MAX_CHUNK_CHARS);
		const parts = new Array(chunks.length);
		let cursor = 0;
		const concurrency = Math.min(3, chunks.length);

		const worker = async () => {
			while (cursor < chunks.length) {
				const index = cursor++;
				const chunk = chunks[index];
				let translated = await this.translateWithM2m(c, chunk, from, to);
				if (!this.looksTranslated(chunk, translated, to)) {
					translated = await this.translateWithChat(c, chunk, to);
				}
				if (!this.looksTranslated(chunk, translated, to)) {
					translated = await this.translateWithChat(c, chunk, to, true);
				}
				parts[index] = translated && this.looksTranslated(chunk, translated, to) ? translated : chunk;
			}
		};

		await Promise.all(Array.from({ length: concurrency }, () => worker()));
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
			console.error('m2m translate failed:', e?.message || e);
			return '';
		}
	},

	async translateWithChat(c, text, targetLang, strict = false) {
		try {
			const langName = LANG_LABEL[targetLang] || LANG_LABEL.zh;
			const model = c.env.ai_model || CHAT_MODEL_DEFAULT;
			const system = strict
				? `Translate EVERY sentence into ${langName}. The output MUST be in ${langName}. Do not keep English sentences. Keep URLs and email addresses unchanged. Output only the translation.`
				: `You are a professional email translator. Translate the user message into ${langName}. Output ONLY the translation. Keep URLs, emails, and product/package names unchanged.`;
			const result = await c.env.ai.run(model, {
				messages: [
					{ role: 'system', content: system },
					{ role: 'user', content: text }
				],
				temperature: 0.1,
				max_tokens: 2048
			});
			const content = typeof result === 'string' ? result : (result?.response || '');
			return String(content || '').trim();
		} catch (e) {
			console.error('chat translate failed:', e?.message || e);
			return '';
		}
	},

	looksTranslated(original, translated, targetLang) {
		if (!translated) return false;
		const src = String(original || '').trim();
		const dst = String(translated || '').trim();
		if (!dst) return false;
		if (dst === src) return false;
		if (targetLang === 'zh') return /[\u4E00-\u9FFF]/.test(dst);
		if (targetLang === 'ja') return /[\u3040-\u30FF\u4E00-\u9FFF]/.test(dst);
		if (targetLang === 'ko') return /[\uAC00-\uD7AF]/.test(dst);
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
			let cut = rest.lastIndexOf('. ', maxLen);
			if (cut < maxLen * 0.4) cut = rest.lastIndexOf(' ', maxLen);
			if (cut < maxLen * 0.4) cut = maxLen;
			chunks.push(rest.slice(0, cut + (rest[cut] === '.' ? 1 : 0)).trim());
			rest = rest.slice(cut + (rest[cut] === '.' ? 1 : 0)).trimStart();
		}
		if (rest) chunks.push(rest);
		return chunks.filter(Boolean);
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
