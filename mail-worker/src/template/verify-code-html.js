/**
 * 登录/验证码邮件 HTML 模板
 * @param {{ title: string, code: string, expireMinutes: number, tip?: string }} params
 */
export default function verifyCodeHtmlTemplate(params) {
	const { title, code, expireMinutes, tip } = params;
	const safeTitle = escapeHtml(title || '验证码');
	const safeTip = escapeHtml(tip || '如非本人操作，请忽略本邮件。');
	const safeCode = escapeHtml(String(code || ''));
	const minutes = Number(expireMinutes) || 5;

	return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background:#f5f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f6f8;padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:28px 28px 8px;font-size:18px;font-weight:600;color:#111827;">
              ${safeTitle}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 0;font-size:14px;line-height:1.6;color:#4b5563;">
              您的验证码为：
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 28px;">
              <div style="display:inline-block;letter-spacing:8px;font-size:32px;font-weight:700;color:#111827;background:#f3f4f6;border-radius:10px;padding:14px 22px;">
                ${safeCode}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 8px;font-size:14px;line-height:1.6;color:#4b5563;">
              验证码 ${minutes} 分钟内有效，请勿泄露给他人。
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 28px;font-size:13px;line-height:1.6;color:#9ca3af;">
              ${safeTip}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(str) {
	return String(str)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}
