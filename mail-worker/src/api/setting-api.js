import app from '../hono/hono';
import result from '../model/result';
import settingService from '../service/setting-service';
import userContext from "../security/user-context";

app.put('/setting/set', async (c) => {
	await settingService.set(c, await c.req.json());
	return c.json(result.ok());
});

app.get('/setting/query', async (c) => {
	const setting = await settingService.get(c);
	return c.json(result.ok(setting));
});

app.get('/setting/websiteConfig', async (c) => {
	const setting = await settingService.websiteConfig(c);
	return c.json(result.ok(setting));
})

app.put('/setting/setBackground', async (c) => {
	const key = await settingService.setBackground(c, await c.req.json());
	return c.json(result.ok(key));
});

app.delete('/setting/deleteBackground', async (c) => {
	await settingService.deleteBackground(c);
	return c.json(result.ok());
});

app.put('/setting/setBlacklist', async (c) => {
	const setting = await settingService.setBlacklist(c, await c.req.json());
	return c.json(result.ok(setting));
})

app.get('/setting/latestVersion', async (c) => {
	const repo = c.env.github_repo || 'TH1121/mail-330';
	const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
		headers: {
			'User-Agent': 'cloud-mail',
			Accept: 'application/vnd.github+json',
		},
	});
	if (!res.ok) {
		return c.json(result.fail(`github release http ${res.status}`, res.status));
	}
	const data = await res.json();
	const version = String(data.tag_name || data.name || '').trim();
	return c.json(result.ok({ version }));
})

