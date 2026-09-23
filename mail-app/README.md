# Cloud Mail App（多端安装壳）

与 `mail-vue` / `mail-worker` 分离的客户端壳工程，用于打安装包并上架：

| 平台 | 工程目录 | 工具 |
|------|----------|------|
| Android | `android/` | Capacitor + Android Studio |
| iOS | `ios/` | Capacitor + Xcode（SPM） |
| 鸿蒙 NEXT | `harmony/` | DevEco Studio（ArkWeb） |

三端均打开同一线上站点（默认 `https://aegis-wallet.vip`）。  
统一包名 / Bundle ID：`vip.aegiswallet.mail`  
版本：`1.0.0`

> **华为说明**：旧版鸿蒙（兼容 Android）可直接安装 Android APK；**纯血鸿蒙 NEXT** 需用 `harmony/` 工程打 HAP 并上架华为应用市场。

---

## 公共准备

```bash
cd mail-app
npm install
```

更换站点域名（同时改 Capacitor + 鸿蒙）：

```bash
npm run set-server -- https://你的域名
npx cap sync
```

---

## Android

### 环境

- JDK 17+
- [Android Studio](https://developer.android.com/studio) + SDK 35

```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
npx cap sync android
npx cap open android
# 或
npm run build:android:debug
```

签名上架见 `android/keystore.properties.example`，构建：

```bash
npm run build:android:release   # APK
npm run build:android:bundle    # AAB（Google Play）
```

---

## iOS（Apple）

### 环境

- macOS + **完整 Xcode**（仅 Command Line Tools 不够）
- Apple Developer 账号（真机 / 上架）

本工程已用 **Swift Package Manager**，一般不需要 CocoaPods。

```bash
npx cap sync ios
npx cap open ios
```

在 Xcode 中：

1. 选 Team 签名（Signing & Capabilities）  
2. 真机或模拟器 Run  
3. Product → Archive → 上传 App Store Connect  

Bundle ID：`vip.aegiswallet.mail`  
显示名：Cloud Mail  

---

## 华为鸿蒙 NEXT

### 环境

- [DevEco Studio](https://developer.huawei.com/consumer/cn/deveco-studio/)  
- HarmonyOS SDK（API 12+ / 按 IDE 提示安装）

```bash
# 用 DevEco Studio 打开目录：
# mail-app/harmony
```

站点地址在：

`harmony/entry/src/main/ets/config/AppConfig.ets`

构建与签名在 DevEco 内完成（Build Hap / App），上传 [华为应用市场 / AppGallery Connect](https://developer.huawei.com/consumer/cn/service/josp/agc/index.html)。

旧款华为机若仍兼容 Android，也可直接分发 `android` 打出的 APK。

---

## 上架清单（简要）

| 项 | 说明 |
|----|------|
| 名称 | Cloud Mail |
| 包名 | `vip.aegiswallet.mail`（上架后勿随便改） |
| 隐私政策 | 公网可访问 URL |
| 截图 | 各端竖屏 |
| Google Play | `.aab` |
| App Store | Xcode Archive |
| 华为 / 传音等 | `.hap` 或 `.apk` + 软著/主体（按商店要求） |

---

## 能力与限制

- 邮箱密码登录、收发信：正常（走线上站点）  
- 网页发版后，一般**不必重发安装包**（除非改壳）  
- OAuth（尤其 Google）在部分 WebView 可能被拦截；可用密码登录，或后续接系统浏览器  
- 推送：当前未接 FCM / APNs / 华为推送  

---

## 目录

```
mail-app/
├── capacitor.config.json   # Android / iOS 共用配置
├── www/                    # 离线占位页
├── android/                # Android 原生工程
├── ios/                    # iOS 原生工程（SPM）
├── harmony/                # 鸿蒙 NEXT 工程
├── scripts/set-server.mjs  # 统一改站点域名
└── README.md
```
