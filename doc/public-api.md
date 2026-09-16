# Cloud Mail 开放 API 文档

其他业务系统可通过开放 API 创建用户、查询邮件、发送登录验证码与事务邮件。

## 基本信息

| 项 | 说明 |
|----|------|
| Base URL | `https://你的域名/api` |
| 协议 | HTTPS |
| 数据格式 | JSON |
| 鉴权 Header | `Authorization: <token>` |

### 统一响应结构

成功：

```json
{
  "code": 200,
  "message": "success",
  "data": {}
}
```

失败：

```json
{
  "code": 401,
  "message": "错误信息"
}
```

判定建议：`code === 200` 为成功；发信接口可再判断 `data.success === true`。

### 鉴权说明

| 接口 | 鉴权方式 |
|------|----------|
| `POST /public/genToken` | 管理员邮箱 + 密码（Body） |
| 其余 `/public/*` | Header：`Authorization: <token>` |

> 每次调用 `genToken` 都会生成新 token，并覆盖旧 token。

### 发信前置条件

1. 系统设置中开启「邮件发送」
2. 配置 Resend Token，或启用 Cloudflare `send_email` 绑定
3. `from` 发件地址必须是本系统已存在的邮箱账号（不传则默认管理员邮箱）

---

## 1. 生成开放 Token

`POST /public/genToken`

**无需 Authorization**

### 请求参数

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| email | string | 是 | 管理员邮箱（需等于环境变量 `admin`） |
| password | string | 是 | 管理员密码 |

### 请求示例

```bash
curl -X POST 'https://你的域名/api/public/genToken' \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "admin@example.com",
    "password": "你的密码"
  }'
```

### 成功响应

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "token": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
  }
}
```

---

## 2. 发送登录验证码邮件

`POST /public/sendCode`

**需要 Authorization**

### 请求参数

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| to | string | 是 | - | 收件人邮箱 |
| from | string | 否 | 管理员邮箱 | 发件人，须为本系统已有账号 |
| name | string | 否 | 发件账号名 | 发件人显示名 |
| code | string | 否 | 自动生成 | 自定义验证码；不传则自动生成 |
| length | number | 否 | 6 | 自动生成时的位数（4~8） |
| subject | string | 否 | `{站点标题} - 登录验证码` | 邮件标题 |
| expire | number | 否 | 300 | 有效期（秒），最大 1800 |
| scene | string | 否 | `login` | 业务场景，用于隔离校验 |
| app | string | 否 | `default` | 应用标识，用于多项目隔离 |
| tip | string | 否 | 默认提示文案 | 邮件底部提示 |

### 限制

- 同一收件人约每 60 秒最多发送 5 次
- 验证码长度建议 4~12 位

### 请求示例

```bash
curl -X POST 'https://你的域名/api/public/sendCode' \
  -H 'Authorization: 你的token' \
  -H 'Content-Type: application/json' \
  -d '{
    "to": "user@gmail.com",
    "from": "admin@example.com",
    "scene": "login",
    "app": "my-app",
    "expire": 300
  }'
```

### 成功响应

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "success": true,
    "status": "success",
    "message": "发送成功",
    "emailId": 123,
    "emailStatus": 1,
    "to": "user@gmail.com",
    "from": "admin@example.com",
    "code": "483920",
    "expire": 300,
    "scene": "login",
    "app": "my-app"
  }
}
```

### 字段说明

| 字段 | 说明 |
|------|------|
| success | 是否发送成功 |
| status | 业务状态，成功为 `success` |
| message | 状态文案 |
| emailId | 系统内邮件记录 ID |
| emailStatus | 邮件投递状态码，见文末枚举 |
| code | 验证码（调用方可自行存储校验，也可走 `/public/verifyCode`） |

---

## 3. 校验验证码

`POST /public/verifyCode`

**需要 Authorization**

### 请求参数

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| to | string | 是 | - | 收件人邮箱（与发送时一致） |
| code | string | 是 | - | 用户输入的验证码 |
| scene | string | 否 | `login` | 须与发送时一致 |
| app | string | 否 | `default` | 须与发送时一致 |
| clear | boolean/number | 否 | `true` | 校验成功后是否删除验证码；传 `false`/`0` 可保留 |

### 请求示例

```bash
curl -X POST 'https://你的域名/api/public/verifyCode' \
  -H 'Authorization: 你的token' \
  -H 'Content-Type: application/json' \
  -d '{
    "to": "user@gmail.com",
    "code": "483920",
    "scene": "login",
    "app": "my-app"
  }'
```

### 成功响应

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "to": "user@gmail.com",
    "scene": "login",
    "app": "my-app",
    "valid": true
  }
}
```

### 失败示例

```json
{
  "code": 500,
  "message": "验证码错误或已过期"
}
```

---

## 4. 发送自定义邮件

`POST /public/sendEmail`

**需要 Authorization**

### 请求参数

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| to | string \| string[] | 是 | 收件人，支持单个或数组 |
| from | string | 否 | 发件人，默认管理员邮箱 |
| name | string | 否 | 发件人显示名 |
| subject | string | 是 | 邮件标题 |
| content | string | 条件必填 | HTML 正文；与 `text` 至少填一个 |
| text | string | 条件必填 | 纯文本正文；与 `content` 至少填一个 |

### 请求示例

```bash
curl -X POST 'https://你的域名/api/public/sendEmail' \
  -H 'Authorization: 你的token' \
  -H 'Content-Type: application/json' \
  -d '{
    "to": ["user@gmail.com"],
    "from": "admin@example.com",
    "name": "My App",
    "subject": "欢迎注册",
    "content": "<p>欢迎使用本服务</p>",
    "text": "欢迎使用本服务"
  }'
```

### 成功响应

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "success": true,
    "status": "success",
    "message": "发送成功",
    "from": "admin@example.com",
    "to": ["user@gmail.com"],
    "emailId": 124,
    "emailStatus": 1
  }
}
```

---

## 5. 查询邮件列表

`POST /public/emailList`

**需要 Authorization**

### 请求参数

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| toEmail | string | 否 | - | 收件人，支持 `LIKE`，如 `%@gmail.com` |
| sendEmail | string | 否 | - | 发件人，支持 `LIKE` |
| sendName | string | 否 | - | 发件人名称，支持 `LIKE` |
| subject | string | 否 | - | 标题，支持 `LIKE` |
| content | string | 否 | - | 正文，支持 `LIKE` |
| type | number | 否 | - | `0` 收件，`1` 发件 |
| isDel | number | 否 | - | `0` 正常，`1` 已删 |
| timeSort | string | 否 | `desc` | `asc` / `desc` |
| num | number | 否 | 1 | 页码 |
| size | number | 否 | 20 | 每页条数 |

### 请求示例

```bash
curl -X POST 'https://你的域名/api/public/emailList' \
  -H 'Authorization: 你的token' \
  -H 'Content-Type: application/json' \
  -d '{
    "toEmail": "user@%",
    "type": 1,
    "num": 1,
    "size": 20
  }'
```

### 成功响应

```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "emailId": 123,
      "sendEmail": "admin@example.com",
      "sendName": "admin",
      "subject": "登录验证码",
      "toEmail": "user@gmail.com",
      "toName": null,
      "type": 1,
      "createTime": "2026-09-11 16:00:00",
      "content": "<html>...</html>",
      "text": "您的验证码是...",
      "isDel": 0
    }
  ]
}
```

---

## 6. 批量创建用户

`POST /public/addUser`

**需要 Authorization**

### 请求参数

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| list | array | 是 | 用户列表 |
| list[].email | string | 是 | 邮箱，域名须在系统 `domain` 内 |
| list[].password | string | 否 | 不传则自动生成随机密码 |
| list[].roleName | string | 否 | 角色名；不传则使用默认角色 |

### 请求示例

```bash
curl -X POST 'https://你的域名/api/public/addUser' \
  -H 'Authorization: 你的token' \
  -H 'Content-Type: application/json' \
  -d '{
    "list": [
      { "email": "a@example.com", "password": "Passw0rd!" },
      { "email": "b@example.com", "roleName": "user" }
    ]
  }'
```

### 成功响应

```json
{
  "code": 200,
  "message": "success",
  "data": null
}
```

---

## 邮件状态枚举（emailStatus）

| 值 | 含义 |
|----|------|
| 0 | 已接收 |
| 1 | 已发送（Resend 提交成功） |
| 2 | 已投递 |
| 3 | 退信 |
| 4 | 投诉 |
| 5 | 延迟 |
| 6 | 保存中 |
| 7 | 无收件人 |
| 8 | 失败 |

发信成功时，一般返回 `1`（Resend）或 `2`（Cloudflare Email）。

---

## 常见错误码

| code | message 示例 | 说明 |
|------|--------------|------|
| 401 | token验证失败 | Authorization 缺失或错误 |
| 403 | 邮件发送功能已停用 | 后台关闭了发信 |
| 429 | 验证码发送过于频繁，请稍后再试 | 触发频率限制 |
| 500 | 发件人邮箱不存在 | from 非系统账号 |
| 500 | 非法邮箱域名 | from 域名不在配置内 |
| 500 | 发信服务未配置，只能给站内邮箱发件 | 未配 Resend/CF Email |
| 500 | 验证码错误或已过期 | 校验失败 |
| 500 | 有邮箱已存在数据库中 | addUser 冲突 |

---

## 业务接入建议（登录验证码）

1. 调用 `/public/genToken` 拿到 token（建议服务端保存，不要暴露到前端）
2. 用户请求登录验证码时，服务端调用 `/public/sendCode`
3. 校验方式二选一：
   - 使用返回的 `data.code` 自行存缓存并校验
   - 或调用 `/public/verifyCode` 由 Cloud Mail 校验
4. 用 `code === 200 && data.success === true` 判断发送是否成功
