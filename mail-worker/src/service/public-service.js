import BizError from '../error/biz-error';
import orm from '../entity/orm';
import { v4 as uuidv4 } from 'uuid';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import saltHashUtils from '../utils/crypto-utils';
import cryptoUtils from '../utils/crypto-utils';
import emailUtils from '../utils/email-utils';
import roleService from './role-service';
import verifyUtils from '../utils/verify-utils';
import { t } from '../i18n/i18n';
import reqUtils from '../utils/req-utils';
import dayjs from 'dayjs';
import { isDel, roleConst, settingConst } from '../const/entity-const';
import email from '../entity/email';
import userService from './user-service';
import KvConst from '../const/kv-const';
import accountService from './account-service';
import settingService from './setting-service';
import emailService from './email-service';
import verifyCodeHtmlTemplate from '../template/verify-code-html';

const DEFAULT_CODE_EXPIRE = 300;
const MAX_CODE_EXPIRE = 1800;
const CODE_RATE_LIMIT = 5;
const CODE_RATE_WINDOW = 60;

const publicService = {

	async emailList(c, params) {

		let { toEmail, content, subject, sendName, sendEmail, timeSort, num, size, type , isDel } = params

		const query = orm(c).select({
				emailId: email.emailId,
				sendEmail: email.sendEmail,
				sendName: email.name,
				subject: email.subject,
				toEmail: email.toEmail,
				toName: email.toName,
				type: email.type,
				createTime: email.createTime,
				content: email.content,
				text: email.text,
				isDel: email.isDel,
		}).from(email)

		if (!size) {
			size = 20
		}

		if (!num) {
			num = 1
		}

		size = Number(size);
		num = Number(num);

		num = (num - 1) * size;

		let conditions = []

		if (toEmail) {
			conditions.push(sql`${email.toEmail} COLLATE NOCASE LIKE ${toEmail}`)
		}

		if (sendEmail) {
			conditions.push(sql`${email.sendEmail} COLLATE NOCASE LIKE ${sendEmail}`)
		}

		if (sendName) {
			conditions.push(sql`${email.name} COLLATE NOCASE LIKE ${sendName}`)
		}

		if (subject) {
			conditions.push(sql`${email.subject} COLLATE NOCASE LIKE ${subject}`)
		}

		if (content) {
			conditions.push(sql`${email.content} COLLATE NOCASE LIKE ${content}`)
		}

		if (type || type === 0) {
			conditions.push(eq(email.type, type))
		}

		if (isDel || isDel === 0) {
			conditions.push(eq(email.isDel, isDel))
		}

		if (conditions.length === 1) {
			query.where(...conditions)
		} else if (conditions.length > 1) {
			query.where(and(...conditions))
		}

		if (timeSort === 'asc') {
			query.orderBy(asc(email.emailId));
		} else {
			query.orderBy(desc(email.emailId));
		}

		return query.limit(size).offset(num);

	},

	async addUser(c, params) {
		const { list } = params;

		if (list.length === 0) return;

		for (const emailRow of list) {
			if (!verifyUtils.isEmail(emailRow.email)) {
				throw new BizError(t('notEmail'));
			}

			if (!c.env.domain.includes(emailUtils.getDomain(emailRow.email))) {
				throw new BizError(t('notEmailDomain'));
			}

			const { salt, hash } = await saltHashUtils.hashPassword(
				emailRow.password || cryptoUtils.genRandomPwd()
			);

			emailRow.salt = salt;
			emailRow.hash = hash;
		}


		const activeIp = reqUtils.getIp(c);
		const { os, browser, device } = reqUtils.getUserAgent(c);
		const activeTime = dayjs().format('YYYY-MM-DD HH:mm:ss');

		const roleList = await roleService.roleSelectUse(c);
		const defRole = roleList.find(roleRow => roleRow.isDefault === roleConst.isDefault.OPEN);

		const userList = [];

		for (const emailRow of list) {
			let { email, hash, salt, roleName } = emailRow;
			let type = defRole.roleId;

			if (roleName) {
				const roleRow = roleList.find(role => role.name === roleName);
				type = roleRow ? roleRow.roleId : type;
			}

			const userSql = `INSERT INTO user (email, password, salt, type, os, browser, active_ip, create_ip, device, active_time, create_time)
			VALUES ('${email}', '${hash}', '${salt}', '${type}', '${os}', '${browser}', '${activeIp}', '${activeIp}', '${device}', '${activeTime}', '${activeTime}')`

			const accountSql = `INSERT INTO account (email, name, user_id)
			VALUES ('${email}', '${emailUtils.getName(email)}', 0);`;

			userList.push(c.env.db.prepare(userSql));
			userList.push(c.env.db.prepare(accountSql));

		}

		userList.push(c.env.db.prepare(`UPDATE account SET user_id = (SELECT user_id FROM user WHERE user.email = account.email) WHERE user_id = 0;`))

		try {
			await c.env.db.batch(userList);
		} catch (e) {
			if(e.message.includes('SQLITE_CONSTRAINT')) {
				throw new BizError(t('emailExistDatabase'))
			} else {
				throw e
			}
		}

	},

	async genToken(c, params) {

		await this.verifyUser(c, params)

		const uuid = uuidv4();

		await c.env.kv.put(KvConst.PUBLIC_KEY, uuid);

		return {token: uuid}
	},

	async verifyUser(c, params) {

		const { email, password } = params

		const userRow = await userService.selectByEmailIncludeDel(c, email);

		if (email !== c.env.admin) {
			throw new BizError(t('notAdmin'));
		}

		if (!userRow || userRow.isDel === isDel.DELETE) {
			throw new BizError(t('notExistUser'));
		}

		if (!await cryptoUtils.verifyPassword(password, userRow.salt, userRow.password)) {
			throw new BizError(t('IncorrectPwd'));
		}
	},

	/**
	 * 开放 API：发送登录/业务验证码邮件
	 * 其他项目可通过此接口触发发信，自行校验或调用 /public/verifyCode
	 */
	async sendCode(c, params) {
		const {
			to,
			from,
			name,
			code,
			subject,
			expire,
			scene = 'login',
			app = 'default',
			tip,
			length
		} = params || {};

		if (!to) {
			throw new BizError(t('emptyToEmail'));
		}

		if (!verifyUtils.isEmail(to)) {
			throw new BizError(t('notEmail'));
		}

		await this.checkCodeRateLimit(c, to);

		const settingRow = await settingService.query(c);
		if (settingRow.send === settingConst.send.CLOSE) {
			throw new BizError(t('disabledSend'), 403);
		}

		let expireSec = Number(expire);
		if (Number.isNaN(expireSec) || expireSec <= 0) {
			expireSec = DEFAULT_CODE_EXPIRE;
		}
		if (expireSec > MAX_CODE_EXPIRE) {
			expireSec = MAX_CODE_EXPIRE;
		}

		const verifyCode = code ? String(code).trim() : cryptoUtils.genVerifyCode(length);
		if (!verifyCode || verifyCode.length < 4 || verifyCode.length > 12) {
			throw new BizError(t('invalidVerifyCode'));
		}

		const accountRow = await this.resolveSenderAccount(c, from);
		const title = settingRow.title || 'Cloud Mail';
		const mailSubject = subject || `${title} - 登录验证码`;
		const expireMinutes = Math.max(1, Math.ceil(expireSec / 60));
		const html = verifyCodeHtmlTemplate({
			title: mailSubject,
			code: verifyCode,
			expireMinutes,
			tip
		});
		const text = `您的验证码是 ${verifyCode}，${expireMinutes} 分钟内有效。${tip || '如非本人操作，请忽略本邮件。'}`;

		const sendResult = await emailService.send(c, {
			accountId: accountRow.accountId,
			name: name || accountRow.name || emailUtils.getName(accountRow.email),
			receiveEmail: [to],
			subject: mailSubject,
			content: html,
			text
		}, accountRow.userId);

		const emailRow = sendResult?.[0];
		const kvKey = this.verifyCodeKey(app, scene, to);
		await c.env.kv.put(kvKey, verifyCode, { expirationTtl: expireSec });

		return {
			success: true,
			status: 'success',
			message: '发送成功',
			emailId: emailRow?.emailId ?? null,
			emailStatus: emailRow?.status ?? null,
			to,
			from: accountRow.email,
			code: verifyCode,
			expire: expireSec,
			scene,
			app
		};
	},

	/**
	 * 开放 API：校验验证码（可选，调用方也可自行校验）
	 */
	async verifyCode(c, params) {
		const { to, code, scene = 'login', app = 'default', clear = true } = params || {};

		if (!to || !code) {
			throw new BizError(t('emptyVerifyCode'));
		}

		if (!verifyUtils.isEmail(to)) {
			throw new BizError(t('notEmail'));
		}

		const kvKey = this.verifyCodeKey(app, scene, to);
		const stored = await c.env.kv.get(kvKey);

		if (!stored || stored !== String(code).trim()) {
			throw new BizError(t('verifyCodeFail'));
		}

		if (clear !== false && clear !== 0 && clear !== '0') {
			await c.env.kv.delete(kvKey);
		}

		return { to, scene, app, valid: true };
	},

	/**
	 * 开放 API：通用发信（自定义主题与内容）
	 */
	async sendEmail(c, params) {
		const {
			to,
			from,
			name,
			subject,
			content,
			text
		} = params || {};

		if (!to) {
			throw new BizError(t('emptyToEmail'));
		}

		const toList = Array.isArray(to) ? to : [to];
		if (toList.length === 0) {
			throw new BizError(t('emptyToEmail'));
		}

		for (const emailAddr of toList) {
			if (!verifyUtils.isEmail(emailAddr)) {
				throw new BizError(t('notEmail'));
			}
		}

		if (!subject) {
			throw new BizError(t('emptySubject'));
		}

		if (!content && !text) {
			throw new BizError(t('emptyEmailContent'));
		}

		const settingRow = await settingService.query(c);
		if (settingRow.send === settingConst.send.CLOSE) {
			throw new BizError(t('disabledSend'), 403);
		}

		const accountRow = await this.resolveSenderAccount(c, from);

		const result = await emailService.send(c, {
			accountId: accountRow.accountId,
			name: name || accountRow.name || emailUtils.getName(accountRow.email),
			receiveEmail: toList,
			subject,
			content: content || '',
			text: text || ''
		}, accountRow.userId);

		const emailRow = result?.[0];

		return {
			success: true,
			status: 'success',
			message: '发送成功',
			from: accountRow.email,
			to: toList,
			emailId: emailRow?.emailId ?? null,
			emailStatus: emailRow?.status ?? null
		};
	},

	async resolveSenderAccount(c, from) {
		const fromEmail = (from || c.env.admin || '').trim().toLowerCase();

		if (!fromEmail || !verifyUtils.isEmail(fromEmail)) {
			throw new BizError(t('senderAccountNotExist'));
		}

		if (!c.env.domain.includes(emailUtils.getDomain(fromEmail))) {
			throw new BizError(t('notEmailDomain'));
		}

		const accountRow = await accountService.selectByEmailIncludeDel(c, fromEmail);

		if (!accountRow || accountRow.isDel === isDel.DELETE) {
			throw new BizError(t('senderAccountNotExist'));
		}

		return accountRow;
	},

	verifyCodeKey(app, scene, to) {
		return `${KvConst.VERIFY_CODE}${String(app).toLowerCase()}:${String(scene).toLowerCase()}:${String(to).toLowerCase()}`;
	},

	async checkCodeRateLimit(c, to) {
		const rateKey = `${KvConst.VERIFY_CODE_RATE}${String(to).toLowerCase()}`;
		const current = Number(await c.env.kv.get(rateKey)) || 0;

		if (current >= CODE_RATE_LIMIT) {
			throw new BizError(t('verifyCodeRateLimit'), 429);
		}

		await c.env.kv.put(rateKey, String(current + 1), { expirationTtl: CODE_RATE_WINDOW });
	}

}

export default publicService
