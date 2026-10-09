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

const aiService = {

	async translateEmail(c, params) {
		const ai = c.env.ai;
		if (!ai) {
			throw new BizError(t('aiNotConfigured'));
		}

		const targetLang = (params.targetLang || 'zh').toLowerCase();
		const langName = LANG_LABEL[targetLang] || LANG_LABEL.zh;
		const subject = (params.subject || '').trim();
		let body = (params.text || '').trim();
		if (!body && params.content) {
			body = emailUtils.htmlToText(params.content).trim();
		}
		body = body.replace(/\s+/g, ' ').trim().slice(0, 6000);

		if (!subject && !body) {
			throw new BizError(t('translateEmpty'));
		}

		const [translatedSubject, translatedText] = await Promise.all([
			subject ? this.translateText(c, subject, langName) : Promise.resolve(''),
			body ? this.translateText(c, body, langName) : Promise.resolve(''),
		]);

		const safeText = this.escapeHtml(translatedText || '');
		return {
			subject: translatedSubject || subject,
			text: translatedText,
			content: safeText ? `<div style="white-space:pre-wrap;line-height:1.6;font-family:inherit">${safeText}</div>` : '',
			targetLang,
		};
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
