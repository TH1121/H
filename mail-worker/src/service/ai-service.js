import { parseHTML } from 'linkedom';
import emailUtils from '../utils/email-utils';
import { settingConst } from '../const/entity-const';
import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';

const TRANSLATE_MODEL = '@cf/meta/m2m100-1.2b';
const CHAT_MODEL_DEFAULT = '@cf/meta/llama-3.1-8b-instruct-fast';

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
const MAX_TRANSLATE_CHARS = 6000;
const MAX_CHUNK_CHARS = 500;
const TRANSLATE_CONCURRENCY = 3;

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
			? await this.translateText(c, this.cleanForTranslate(subject), targetLang, sourceLang)
			: '';

		if (html) {
			const content = await this.translateHtmlPreserve(c, html, targetLang, sourceLang);
			const text = this.cleanForTranslate(emailUtils.htmlToText(content) || '');
			return {
				subject: translatedSubject || subject,
				text,
				content,
				targetLang,
			};
		}

		const plainBody = this.cleanForTranslate(plain).slice(0, MAX_TRANSLATE_CHARS);
		const translatedText = plainBody
			? await this.translateText(c, plainBody, targetLang, sourceLang)
			: '';
		if (plainBody && (this.isGarbageTranslation(plainBody, translatedText) || !this.looksTranslated(plainBody, translatedText, targetLang))) {
			throw new BizError(t('translateEmpty'));
		}
		return {
			subject: translatedSubject || subject,
			text: translatedText,
			content: translatedText ? this.wrapTranslatedHtml(translatedText) : '',
			targetLang,
		};
	},

	async translateHtmlPreserve(c, html, targetLang, sourceLang) {
		const wrapped = /<body[\s>]/i.test(html)
			? html
			: `<!DOCTYPE html><html><body>${html}</body></html>`;
		const { document } = parseHTML(wrapped);
		if (!document?.body) {
			return this.translatePlainFallback(c, html, targetLang, sourceLang);
		}

		const textNodes = [];
		let usedChars = 0;
		this.collectTextNodes(document.body, textNodes, () => usedChars < MAX_TRANSLATE_CHARS, (len) => {
			usedChars += len;
		});

		const jobs = [];
		textNodes.forEach((node, index) => {
			const raw = node.textContent || '';
			const trimmed = raw.trim();
			if (!trimmed || !this.needsTranslate(trimmed, targetLang)) return;
			if (this.isUrlLike(trimmed)) return;
			jobs.push({ index, node, raw, text: this.cleanForTranslate(trimmed) });
		});

		if (!jobs.length) {
			return this.translatePlainFallback(c, html, targetLang, sourceLang);
		}

		await this.runPool(jobs, TRANSLATE_CONCURRENCY, async (job) => {
			const translated = await this.translateOneChunk(c, job.text, sourceLang, targetLang);
			if (!translated || this.isGarbageTranslation(job.text, translated) || !this.looksTranslated(job.text, translated, targetLang)) {
				return;
			}
			const leading = job.raw.match(/^\s*/)?.[0] || '';
			const trailing = job.raw.match(/\s*$/)?.[0] || '';
			job.node.textContent = leading + translated.trim() + trailing;
		});

		const content = document.body.innerHTML;
		const checkText = this.cleanForTranslate(emailUtils.htmlToText(content) || '');
		const sourceText = this.cleanForTranslate(
			emailUtils.htmlToText(html) || this.stripHtml(html) || ''
		).slice(0, MAX_TRANSLATE_CHARS);

		// 整封信允许保留品牌英文；只要有足够目标语言且不是垃圾译文，就保留 HTML 样式
		if (!checkText || this.isGarbageTranslation(sourceText, checkText) || !this.hasEnoughTargetLang(checkText, targetLang)) {
			return this.translatePlainFallback(c, html, targetLang, sourceLang, sourceText);
		}
		return content;
	},

	hasEnoughTargetLang(text, targetLang) {
		const dst = String(text || '');
		if (targetLang === 'zh') return (dst.match(/[\u4E00-\u9FFF]/g) || []).length >= 12;
		if (targetLang === 'ja') return (dst.match(/[\u3040-\u30FF\u4E00-\u9FFF]/g) || []).length >= 12;
		if (targetLang === 'ko') return (dst.match(/[\uAC00-\uD7AF]/g) || []).length >= 12;
		return (dst.match(/[A-Za-z]/g) || []).length >= 12;
	},

	async translatePlainFallback(c, html, targetLang, sourceLang, preparedPlain = '') {
		const plainBody = (preparedPlain || this.cleanForTranslate(
			emailUtils.htmlToText(html) || this.stripHtml(html) || ''
		)).slice(0, MAX_TRANSLATE_CHARS);
		if (!plainBody) return html;
		const translatedText = await this.translateText(c, plainBody, targetLang, sourceLang);
		if (!translatedText || this.isGarbageTranslation(plainBody, translatedText) || !this.looksTranslated(plainBody, translatedText, targetLang)) {
			throw new BizError(t('translateEmpty'));
		}
		return this.wrapTranslatedHtml(translatedText);
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
			for (const child of Array.from(node.childNodes || [])) {
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

	isUrlLike(text) {
		const t = String(text || '').trim();
		if (/^https?:\/\/\S+$/i.test(t)) return true;
		if (/^(?:www\.)\S+$/i.test(t)) return true;
		if (/^(?:c\.gle|goo\.gl|bit\.ly|t\.co)\/\S+$/i.test(t)) return true;
		return false;
	},

	async runPool(items, concurrency, worker) {
		let cursor = 0;
		const run = async () => {
			while (cursor < items.length) {
				const index = cursor++;
				await worker(items[index], index);
			}
		};
		await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => run()));
	},

	cleanForTranslate(text) {
		return String(text || '')
			.replace(/https?:\/\/\S+/gi, ' ')
			.replace(/www\.\S+/gi, ' ')
			.replace(/[\w.+-]+@[\w.-]+\.\w+/g, ' ')
			.replace(/\b(?:c\.gle|goo\.gl|bit\.ly|t\.co)\/\S+/gi, ' ')
			.replace(/[A-Za-z0-9_-]{28,}/g, ' ')
			.replace(/[|｜•·]{2,}/g, ' ')
			.replace(/[-=_]{4,}/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();
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
		const cleaned = this.cleanForTranslate(text);
		if (cleaned.length < 2) return false;
		if (!/[A-Za-z\u00C0-\u024F\u0400-\u04FF\u3040-\u30FF\uAC00-\uD7AF\u4E00-\u9FFF]/.test(cleaned)) {
			return false;
		}
		if (targetLang === 'zh' && /[\u4E00-\u9FFF]/.test(cleaned) && !/[A-Za-z]{4,}/.test(cleaned)) {
			return false;
		}
		return true;
	},

	async translateText(c, text, targetLang, sourceLang = 'en') {
		const trimmed = this.cleanForTranslate(text);
		if (!trimmed) return '';
		if (!this.needsTranslate(trimmed, targetLang)) return trimmed;

		const from = this.normalizeLang(sourceLang);
		const to = this.normalizeLang(targetLang);
		if (from === to) return trimmed;

		const chunks = this.splitText(trimmed, MAX_CHUNK_CHARS);
		const parts = new Array(chunks.length);
		await this.runPool(chunks.map((chunk, index) => ({ chunk, index })), Math.min(2, chunks.length), async (item) => {
			parts[item.index] = await this.translateOneChunk(c, item.chunk, from, to);
		});
		return parts.filter(Boolean).join('\n\n').trim() || trimmed;
	},

	async translateOneChunk(c, chunk, sourceLang, targetLang) {
		const from = this.normalizeLang(sourceLang);
		const to = this.normalizeLang(targetLang);
		const clean = this.cleanForTranslate(chunk);
		if (!clean) return '';

		let translated = await this.translateWithChat(c, clean, to);
		if (this.isGarbageTranslation(clean, translated) || !this.looksTranslated(clean, translated, to)) {
			translated = await this.translateWithM2m(c, clean, from, to);
		}
		if (this.isGarbageTranslation(clean, translated) || !this.looksTranslated(clean, translated, to)) {
			translated = await this.translateWithChat(c, clean, to, true);
		}
		if (this.isGarbageTranslation(clean, translated) || !this.looksTranslated(clean, translated, to)) {
			return '';
		}
		return this.cleanTranslatedOutput(translated);
	},

	cleanTranslatedOutput(text) {
		return String(text || '')
			.replace(/https?:\/\/\S+/gi, ' ')
			.replace(/(您好[!！]?\s*){3,}/g, '您好！')
			.replace(/(你好[!！]?\s*){3,}/g, '你好！')
			.replace(/\s+/g, ' ')
			.trim();
	},

	isGarbageTranslation(original, translated) {
		if (!translated) return true;
		const src = String(original || '').trim();
		const dst = String(translated || '').trim();
		if (!dst) return true;

		const compact = dst.replace(/\s+/g, '');
		if (/(.{2,10})\1{6,}/u.test(compact)) return true;

		const helloZh = (dst.match(/您?好[!！]?/g) || []).length;
		if (helloZh >= 4) return true;

		if (dst.length > Math.max(120, src.length * 2.5)) return true;

		const letters = compact.replace(/[^\p{L}]/gu, '');
		if (letters.length > 60) {
			const unique = new Set(letters).size;
			if (unique < 10) return true;
		}

		const urlCount = (dst.match(/https?:\/\//gi) || []).length;
		if (urlCount >= 3) return true;

		return false;
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
				? `Translate the email excerpt into ${langName}. Output fluent ${langName} only. Never repeat the same word or greeting. Do not invent content. Do not output URLs.`
				: `You are a professional email translator. Translate into ${langName}. Keep meaning and tone. Output only the translation. Do not repeat phrases. Do not output URLs.`;
			const result = await c.env.ai.run(model, {
				messages: [
					{ role: 'system', content: system },
					{ role: 'user', content: text }
				],
				temperature: 0.1,
				max_tokens: 1024
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
		if (!dst || dst === src) return false;
		if (this.isGarbageTranslation(src, dst)) return false;
		if (targetLang === 'zh') {
			const han = (dst.match(/[\u4E00-\u9FFF]/g) || []).length;
			const latin = (dst.match(/[A-Za-z]/g) || []).length;
			// 允许保留品牌名，但中文要明显占优或至少有一定数量
			return han >= 4 && han >= latin * 0.35;
		}
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
			if (cut < maxLen * 0.35) cut = rest.lastIndexOf('。', maxLen);
			if (cut < maxLen * 0.35) cut = rest.lastIndexOf('! ', maxLen);
			if (cut < maxLen * 0.35) cut = rest.lastIndexOf('? ', maxLen);
			if (cut < maxLen * 0.35) cut = rest.lastIndexOf(' ', maxLen);
			if (cut < maxLen * 0.35) cut = maxLen;
			const end = '.。!?'.includes(rest[cut]) ? cut + 1 : cut;
			chunks.push(rest.slice(0, end).trim());
			rest = rest.slice(end).trimStart();
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
