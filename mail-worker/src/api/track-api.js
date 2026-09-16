import app from '../hono/hono';
import emailService from '../service/email-service';

const TRANSPARENT_GIF = Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'), c => c.charCodeAt(0));

app.get('/track/open/:trackId', async (c) => {
	const trackId = c.req.param('trackId');
	if (trackId) {
		c.executionCtx.waitUntil(emailService.trackOpen(c, trackId));
	}

	return new Response(TRANSPARENT_GIF, {
		status: 200,
		headers: {
			'Content-Type': 'image/gif',
			'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
			Pragma: 'no-cache',
			Expires: '0'
		}
	});
});
