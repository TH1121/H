import { parseHTML } from 'linkedom';

const emailUtils = {

	getDomain(email) {
		if (typeof email !== 'string') return '';
		const parts = this.extractAddress(email).split('@');
		return parts.length === 2 ? parts[1] : '';
	},

	getName(email) {
		if (typeof email !== 'string') return '';
		const parts = this.extractAddress(email).split('@');
		return parts.length === 2 ? parts[0] : '';
	},

	/** Normalize "Name <a@b.com>" / raw address to lowercase bare email */
	extractAddress(raw) {
		const text = String(raw || '').trim();
		if (!text) return '';
		const angled = text.match(/<([^>]+)>/);
		const value = (angled ? angled[1] : text).trim().toLowerCase();
		return value.includes('@') ? value : '';
	},

	getBaseEmail(email) {
		const parts = email.split('@');
		if (parts.length !== 2) return '';
		const localPart = parts[0].split('+')[0];
		return localPart + '@' + parts[1];
	},

	formatText(text) {
		if (!text) return ''
		return text
			.split('\n')
			.map(line => {
				return line.replace(/[\u200B-\u200F\uFEFF\u034F\u200B-\u200F\u00A0\u3000\u00AD]/g, '')
					.replace(/\s+/g, ' ')
					.trim();
			})
			.join('\n')
			.replace(/\n{3,}/g, '\n')
			.trim();
	},

	htmlToText(content) {
		if (!content) return ''
		try {
			const wrappedContent = content.includes('<body')
				? content
				: `<!DOCTYPE html><html><body>${content}</body></html>`;
			const { document } = parseHTML(wrappedContent);
			document.querySelectorAll('style, script, title').forEach(el => el.remove());
			let text = document.body.innerText;
			return this.formatText(text);
		} catch (e) {
			console.error(e)
			return ''
		}
	}
};

export default emailUtils;
