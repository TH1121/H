import app from '../hono/hono';
import userService from '../service/user-service';
import oauthService from '../service/oauth-service';
import result from '../model/result';
import userContext from '../security/user-context';

app.get('/my/loginUserInfo', async (c) => {
	const user = await userService.loginUserInfo(c, userContext.getUserId(c));
	return c.json(result.ok(user));
});

app.put('/my/resetPassword', async (c) => {
	await userService.resetPassword(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
});

app.delete('/my/delete', async (c) => {
	await userService.delete(c, userContext.getUserId(c));
	return c.json(result.ok());
});

app.get('/my/oauth/list', async (c) => {
	const list = await oauthService.listByUserId(c, userContext.getUserId(c));
	return c.json(result.ok(list));
});

app.delete('/my/oauth/:oauthId', async (c) => {
	await oauthService.unbind(c, userContext.getUserId(c), Number(c.req.param('oauthId')));
	return c.json(result.ok());
});

app.put('/my/oauth/link', async (c) => {
	const { oauthUserId } = await c.req.json();
	const row = await oauthService.linkCurrentUser(c, userContext.getUserId(c), oauthUserId);
	return c.json(result.ok(row));
});


