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

	async translateTexts(c, params) {
		const ai = c.env.ai;
		if (!ai) {
			throw new BizError(t('aiNotConfigured'));
		}

		const targetLang = this.normalizeLang(params.targetLang || 'zh');
		const sourceLang = this.normalizeLang(params.sourceLang || 'en');
		const texts = Array.isArray(params.texts) ? params.texts.slice(0, 120) : [];
		if (!texts.length) {
			return { list: [] };
		}

		const cache = new Map();
		const unique = [];
		for (const item of texts) {
			const key = String(item ?? '');
			if (!cache.has(key)) {
				cache.set(key, null);
				unique.push(key);
			}
		}

		await this.runPool(unique, Math.min(4, TRANSLATE_CONCURRENCY + 1), async (text) => {
			const trimmed = String(text || '').trim();
			if (!trimmed || this.isUrlLike(trimmed)) {
				cache.set(text, text);
				return;
			}
			if (!/[A-Za-z\u00C0-\u024F\u0400-\u04FF]/.test(trimmed)) {
				// 已无西文，通常无需再译
				cache.set(text, text);
				return;
			}
			const translated = await this.translateHtmlChunk(c, trimmed, sourceLang, targetLang);
			cache.set(text, translated || text);
		});

		return {
			list: texts.map((text) => cache.get(String(text ?? '')) ?? text),
			targetLang,
		};
	},

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
		if (plainBody && !this.isAcceptableTranslation(plainBody, translatedText, targetLang)) {
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
			// 解析失败也绝不打成纯文本，直接返回原 HTML 保样式
			return html;
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
			// 节点翻译尽量保留原文用词，只去掉纯链接噪声
			const text = trimmed.replace(/https?:\/\/\S+/gi, ' ').replace(/\s+/g, ' ').trim();
			if (!text || this.isUrlLike(text)) return;
			jobs.push({ index, node, raw, text });
		});

		jobs.sort((a, b) => b.text.length - a.text.length);

		if (!jobs.length) {
			return this.serializeTranslatedHtml(document, html);
		}

		await this.runPool(jobs, TRANSLATE_CONCURRENCY, async (job) => {
			const translated = await this.translateHtmlChunk(c, job.text, sourceLang, targetLang);
			if (!translated) return;
			const leading = job.raw.match(/^\s*/)?.[0] || '';
			const trailing = job.raw.match(/\s*$/)?.[0] || '';
			job.node.textContent = leading + translated.trim() + trailing;
		});

		// HTML 邮件始终返回结构化 HTML，绝不降级为纯文本（否则会像图2一样丢掉版式）
		return this.serializeTranslatedHtml(document, html);
	},

	async translateHtmlChunk(c, text, sourceLang, targetLang) {
		const from = this.normalizeLang(sourceLang);
		const to = this.normalizeLang(targetLang);
		const clean = String(text || '').trim();
		if (!clean) return '';

		let translated = await this.translateWithM2m(c, clean, from, to);
		if (!this.isHtmlNodeAcceptable(clean, translated, to)) {
			translated = await this.translateWithChat(c, clean, to);
		}
		if (!this.isHtmlNodeAcceptable(clean, translated, to)) {
			return '';
		}
		return this.cleanTranslatedOutput(translated);
	},

	isHtmlNodeAcceptable(original, translated, targetLang) {
		if (!translated) return false;
		const src = String(original || '').trim();
		const dst = String(translated || '').trim();
		if (!dst || dst === src) return false;
		if (/(.{2,8})\1{10,}/u.test(dst.replace(/\s+/g, ''))) return false;
		if ((dst.match(/您?好[!！]?/g) || []).length >= 6) return false;
		if (dst.length > src.length * 3.5 + 48) return false;
		if (targetLang === 'zh') return /[\u4E00-\u9FFF]/.test(dst);
		if (targetLang === 'ja') return /[\u3040-\u30FF\u4E00-\u9FFF]/.test(dst);
		if (targetLang === 'ko') return /[\uAC00-\uD7AF]/.test(dst);
		return /[A-Za-z]/.test(dst);
	},

	serializeTranslatedHtml(document, originalHtml = '') {
		const headStyles = Array.from(document.head?.querySelectorAll?.('style') || [])
			.map((el) => el.outerHTML)
			.join('');
		const bodyHtml = document.body?.innerHTML || '';
		const bodyStyle = document.body?.getAttribute?.('style') || '';
		const styledBody = bodyStyle
			? `<div style="${this.escapeHtml(bodyStyle)}">${bodyHtml}</div>`
			: bodyHtml;
		const result = `${headStyles}${styledBody}`;
		const visible = String(result || '')
			.replace(/<style[\s\S]*?<\/style>/gi, ' ')
			.replace(/<[^>]+>/g, ' ')
			.replace(/\s+/g, '')
			.length;
		const originalVisible = String(originalHtml || '')
			.replace(/<style[\s\S]*?<\/style>/gi, ' ')
			.replace(/<[^>]+>/g, ' ')
			.replace(/\s+/g, '')
			.length;
		// 序列化后几乎没字，说明解析/改写失败，回退原 HTML，避免前端空白
		if (visible < 20 || (originalVisible > 80 && visible < originalVisible * 0.2)) {
			return originalHtml;
		}
		return result || originalHtml;
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

		// 专用翻译模型优先，减少聊天模型扩写/幻觉
		let translated = await this.translateWithM2m(c, clean, from, to);
		if (!this.isAcceptableTranslation(clean, translated, to)) {
			translated = await this.translateWithChat(c, clean, to);
		}
		if (!this.isAcceptableTranslation(clean, translated, to)) {
			return '';
		}
		return this.cleanTranslatedOutput(translated);
	},

	isAcceptableTranslation(original, translated, targetLang) {
		return this.looksTranslated(original, translated, targetLang)
			&& !this.isGarbageTranslation(original, translated)
			&& !this.isHallucinatedTranslation(original, translated, targetLang);
	},

	cleanTranslatedOutput(text) {
		return String(text || '')
			.replace(/^\s*(?:译文|翻译|Translation)\s*[:：]\s*/i, '')
			.replace(/^["「『]|["」』]$/g, '')
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

		if (dst.length > Math.max(80, src.length * 1.8)) return true;

		const letters = compact.replace(/[^\p{L}]/gu, '');
		if (letters.length > 60) {
			const unique = new Set(letters).size;
			if (unique < 10) return true;
		}

		const urlCount = (dst.match(/https?:\/\//gi) || []).length;
		if (urlCount >= 3) return true;

		return false;
	},

	isHallucinatedTranslation(original, translated, targetLang) {
		const src = String(original || '').trim();
		const dst = String(translated || '').trim();
		if (!src || !dst) return true;

		const srcParts = src.split(/[.!?。！？;；]+/).map(s => s.trim()).filter(s => s.length > 1);
		const dstParts = dst.split(/[.!?。！？;；]+/).map(s => s.trim()).filter(s => s.length > 1);
		if (srcParts.length <= 2 && dstParts.length >= srcParts.length + 2) return true;
		if (srcParts.length > 2 && dstParts.length > Math.ceil(srcParts.length * 1.6) + 1) return true;

		// 英译中通常不会明显变长；过长多半是模型扩写
		if (targetLang === 'zh' && dst.length > src.length * 1.6 + 12) return true;
		if (targetLang !== 'zh' && dst.length > src.length * 2 + 20) return true;

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

	async translateWithChat(c, text, targetLang) {
		try {
			const langName = LANG_LABEL[targetLang] || LANG_LABEL.zh;
			const model = c.env.ai_model || CHAT_MODEL_DEFAULT;
			const maxTokens = Math.min(1024, Math.max(64, Math.ceil(text.length * 1.2)));
			const result = await c.env.ai.run(model, {
				messages: [
					{
						role: 'system',
						content: `You are a literal email translator. Translate the user text into ${langName}.
Rules:
- Translate ONLY the given text. Do not add greetings, explanations, summaries, or extra sentences.
- Do not invent facts, links, product names, or details not present in the source.
- Keep roughly the same amount of information. Do not expand.
- Keep brand names like Google Play unchanged when appropriate.
- Output only the translation, nothing else.`
					},
					{ role: 'user', content: text }
				],
				temperature: 0,
				max_tokens: maxTokens
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
		if (targetLang === 'zh') {
			const han = (dst.match(/[\u4E00-\u9FFF]/g) || []).length;
			if (han < 2) return false;
			if (src.length <= 48) return true;
			const latin = (dst.match(/[A-Za-z]/g) || []).length;
			return han >= Math.max(4, latin * 0.25);
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
