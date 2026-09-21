<template>
  <div id="login-box" :style=" background ? 'background: var(--el-bg-color)' : ''" v-loading="oauthLoading" element-loading-text="登录中...">
    <div id="background-wrap" v-if="!settingStore.settings.background">
      <div class="login-ambiance" aria-hidden="true">
        <div class="tech-grid"></div>
        <div class="tech-glow tech-glow-a"></div>
        <div class="tech-glow tech-glow-b"></div>
        <div class="tech-ring tech-ring-a"></div>
        <div class="tech-ring tech-ring-b"></div>
        <div class="tech-scan"></div>
        <div class="tech-beam"></div>
        <div class="tech-particles">
          <span v-for="n in 18" :key="n" :style="{ '--i': n }"></span>
        </div>
        <div class="tech-hud">
          <div class="hud-corner hud-tl"></div>
          <div class="hud-corner hud-tr"></div>
          <div class="hud-corner hud-bl"></div>
          <div class="hud-corner hud-br"></div>
          <div class="hud-brand">{{ settingStore.settings.title || 'Cloud Mail' }}</div>
          <div class="hud-line">SECURE CHANNEL · ONLINE</div>
          <div class="hud-meter">
            <i></i><i></i><i></i><i></i><i></i>
          </div>
        </div>
      </div>
    </div>
    <div v-else :style="background"></div>
    <div class="form-wrapper">
      <div class="container">
        <span class="form-title">{{ settingStore.settings.title }}</span>
        <span class="form-desc" v-if="show === 'login'">{{ $t('loginTitle') }}</span>
        <span class="form-desc" v-else>{{ $t('regTitle') }}</span>
        <div v-show="show === 'login'">
          <el-input :class="!hideLoginDomain ? 'email-input' : ''" v-model="form.email"
                    type="text" :placeholder="$t('emailAccount')" autocomplete="off" @keyup.enter="submit">
            <template #append v-if="!hideLoginDomain">
              <div @click.stop="openSelect">
                <el-select
                    v-if="show === 'login'"
                    ref="mySelect"
                    v-model="suffix"
                    :placeholder="$t('select')"
                    class="select"
                >
                  <el-option
                      v-for="item in domainList"
                      :key="item"
                      :label="item"
                      :value="item"
                  />
                </el-select>
                <div style="color: var(--el-text-color-primary)">
                  <span>{{ suffix }}</span>
                  <Icon class="setting-icon" icon="mingcute:down-small-fill" width="20" height="20"/>
                </div>
              </div>
            </template>
          </el-input>
          <el-input v-model="form.password" :placeholder="$t('password')" type="password" autocomplete="off" @keyup.enter="submit">
          </el-input>
          <el-button class="btn" type="primary" @click="submit" :loading="loginLoading"
          >{{ $t('loginBtn') }}
          </el-button>
          <el-button v-for="p in oauthProviders" :key="p.key" class="btn" style="margin-top: 10px" @click="oauthLogin(p.key)">
            <el-avatar v-if="p.iconType === 'image'" :src="p.icon" :size="18" style="margin-right: 10px" />
            <Icon v-else :icon="p.icon" width="18" height="18" style="margin-right: 10px" />
            {{ p.label }}
          </el-button>
        </div>
        <div v-show="show !== 'login'">
          <el-input :class="!hideLoginDomain ? 'email-input' : ''" v-model="registerForm.email" type="text" :placeholder="$t('emailAccount')"
                    autocomplete="off" @keyup.enter="submitRegister">
            <template #append v-if="!hideLoginDomain">
              <div @click.stop="openSelect">
                <el-select
                    v-if="show !== 'login'"
                    ref="mySelect"
                    v-model="suffix"
                    :placeholder="$t('select')"
                    class="select"
                >
                  <el-option
                      v-for="item in domainList"
                      :key="item"
                      :label="item"
                      :value="item"
                  />
                </el-select>
                <div>
                  <span>{{ suffix }}</span>
                  <Icon class="setting-icon" icon="mingcute:down-small-fill" width="20" height="20"/>
                </div>
              </div>
            </template>
          </el-input>
          <el-input v-model="registerForm.password" :placeholder="$t('password')" type="password" autocomplete="off" @keyup.enter="submitRegister"/>
          <el-input v-model="registerForm.confirmPassword" :placeholder="$t('confirmPwd')" type="password"
                    autocomplete="off" @keyup.enter="submitRegister"/>
          <el-input v-if="settingStore.settings.regKey === 0" v-model="registerForm.code" :placeholder="$t('regKey')"
                    type="text" autocomplete="off" @keyup.enter="submitRegister"/>
          <el-input v-if="settingStore.settings.regKey === 2" v-model="registerForm.code"
                    :placeholder="$t('regKeyOptional')" type="text" autocomplete="off" @keyup.enter="submitRegister"/>
          <div v-show="verifyShow"
               class="register-turnstile"
               :data-sitekey="settingStore.settings.siteKey"
               data-callback="onTurnstileSuccess"
               data-error-callback="onTurnstileError"
               data-after-interactive-callback="loadAfter"
               data-before-interactive-callback="loadBefore"
          >
            <span style="font-size: 12px;color: #F56C6C" v-if="botJsError">{{ $t('verifyModuleFailed') }}</span>
          </div>
          <el-button class="btn" style="margin: 0" type="primary" @click="submitRegister" :loading="registerLoading"
          >{{ $t('regBtn') }}
          </el-button>
          <el-button v-for="p in oauthProviders" :key="p.key" class="btn" style="margin-top: 10px" @click="oauthLogin(p.key)">
            <el-avatar v-if="p.iconType === 'image'" :src="p.icon" :size="18" style="margin-right: 10px" />
            <Icon v-else :icon="p.icon" width="18" height="18" style="margin-right: 10px" />
            {{ p.label }}
          </el-button>
        </div>
        <template v-if="settingStore.settings.register === 0">
          <div class="switch" @click="show = 'register'" v-if="show === 'login'">{{ $t('noAccount') }}
            <span>{{ $t('regSwitch') }}</span></div>
          <div class="switch" @click="show = 'login'" v-else>{{ $t('hasAccount') }} <span>{{ $t('loginSwitch') }}</span>
          </div>
        </template>
      </div>
    </div>
    <el-dialog class="bind-dialog" v-model="showBindForm" :title="$t('oauthBindTitle')" >
      <div class="bind-container">
        <el-input :class="!hideLoginDomain ? 'email-input' : ''" v-model="bindForm.email" type="text" :placeholder="$t('emailAccount')" autocomplete="off" @keyup.enter="bind">
          <template #append v-if="!hideLoginDomain">
            <div @click.stop="openSelect">
              <el-select
                  ref="mySelect"
                  v-model="suffix"
                  :placeholder="$t('select')"
                  class="select"
              >
                <el-option
                    v-for="item in domainList"
                    :key="item"
                    :label="item"
                    :value="item"
                />
              </el-select>
              <div>
                <span>{{ suffix }}</span>
                <Icon class="setting-icon" icon="mingcute:down-small-fill" width="20" height="20"/>
              </div>
            </div>
          </template>
        </el-input>
        <el-input v-model="bindForm.password" :placeholder="$t('oauthBindPwdTip')" type="password"
                  autocomplete="off" @keyup.enter="bind"/>
        <el-input v-if="settingStore.settings.regKey === 0" v-model="bindForm.code" :placeholder="$t('regKey')"
                  type="text" autocomplete="off" @keyup.enter="bind"/>
        <el-input v-if="settingStore.settings.regKey === 2" v-model="bindForm.code"
                  :placeholder="$t('regKeyOptional')" type="text" autocomplete="off" @keyup.enter="bind"/>
        <div class="bind-hint">{{ $t('oauthBindHint') }}</div>
        <el-button class="btn" type="primary" @click="bind" :loading="bindLoading"
        >{{ $t('oauthBindBtn') }}
        </el-button>
      </div>
    </el-dialog>
    <a v-show="settingStore.settings.projectLink" class="github" href="https://github.com/maillab/cloud-mail">
      <Icon icon="mingcute:github-line" color="var(--el-color-primary)" width="20" height="20" />
    </a>
  </div>
</template>

<script setup>
import router from "@/router";
import {useRoute} from "vue-router";
import {computed, nextTick, reactive, ref} from "vue";
import {login} from "@/request/login.js";
import {register} from "@/request/login.js";
import {websiteConfig} from "@/request/setting.js";
import {isEmail} from "@/utils/verify-utils.js";
import {useSettingStore} from "@/store/setting.js";
import {useAccountStore} from "@/store/account.js";
import {useUserStore} from "@/store/user.js";
import {useUiStore} from "@/store/ui.js";
import {Icon} from "@iconify/vue";
import {cvtR2Url} from "@/utils/convert.js";
import {loginUserInfo, oauthLinkCurrent} from "@/request/my.js";
import {permsToRouter} from "@/perm/perm.js";
import {useI18n} from "vue-i18n";
import {oauthBindUser, oauthLinuxDoLogin, oauthGithubLogin, oauthGoogleLogin} from "@/request/ouath.js";

const {t} = useI18n();
const accountStore = useAccountStore();
const userStore = useUserStore();
const uiStore = useUiStore();
const settingStore = useSettingStore();
const route = useRoute();
const loginLoading = ref(false)
const bindLoading = ref(false)
const oauthLoading = ref(false);
const showBindForm = ref(false);
const show = ref('login')

const oauthKeys = ['linuxdo', 'github', 'google']

const oauthProvider = computed(() => {
  const fromState = route.query.state
  if (oauthKeys.includes(fromState)) return fromState
  const fromStore = sessionStorage.getItem('oauthProvider')
  return oauthKeys.includes(fromStore) ? fromStore : null
})

const oauthProviders = computed(() => {
  const allProviders = [
    { key: 'google', label: 'Google', icon: 'devicon:google', iconType: 'iconify' },
    { key: 'github', label: 'GitHub', icon: 'codicon:github-inverted', iconType: 'iconify' },
    { key: 'linuxdo', label: 'LinuxDo', icon: '/image/linuxdo.webp', iconType: 'image' },
  ]
  return allProviders.filter(p => settingStore.settings[p.key + 'Switch'] === 0)
})

const bindForm = reactive({
  email: '',
  oauthUserId: '',
  code: '',
  password: '',
})

const form = reactive({
  email: '',
  password: '',

});
const mySelect = ref()
const suffix = ref('')
const registerForm = reactive({
  email: '',
  password: '',
  confirmPassword: '',
  code: null
})
const domainList = settingStore.domainList;
const registerLoading = ref(false)
suffix.value = domainList[0]
const verifyShow = ref(false)
let verifyToken = ''
let turnstileId = null
let botJsError = ref(false)
let verifyErrorCount = 0

window.onTurnstileSuccess = (token) => {
  verifyToken = token;
};

window.onTurnstileError = (e) => {
  if (verifyErrorCount >= 4) {
    return
  }
  verifyErrorCount++
  console.warn('人机验加载失败', e)
  setTimeout(() => {
    nextTick(() => {
      if (!turnstileId) {
        turnstileId = window.turnstile.render('.register-turnstile')
      } else {
        window.turnstile.reset(turnstileId);
      }
    })
  }, 1500)
};

window.loadAfter = (e) => {
  console.log('loadAfter')
}

window.loadBefore = (e) => {
  console.log('loadBefore')
}

const loginOpacity = computed(() => {
  const opacity = settingStore.settings.loginOpacity
  return uiStore.dark ? `rgba(0, 0, 0, ${opacity})` : `rgba(255, 255, 255, ${opacity})`
})

const hideLoginDomain = computed(() => settingStore.settings.loginDomain === 1)

const background = computed(() => {

  return settingStore.settings.background ? {
    'background-image': `url(${cvtR2Url(settingStore.settings.background)})`,
    'background-repeat': 'no-repeat',
    'background-size': 'cover',
    'background-position': 'center'
  } : ''
})

const openSelect = () => {
  mySelect.value.toggleMenu()
}

const getFullEmail = (email) => {
  return hideLoginDomain.value ? email : email + suffix.value
}

const getEmailName = (email) => {
  return email.split('@')[0]
}

function oauthLogin(provider) {
  const clientId = settingStore.settings[provider + 'ClientId']
  const redirectUri = encodeURIComponent(window.location.origin + '/login')
  sessionStorage.setItem('oauthProvider', provider)
  const authorizeUrls = {
    linuxdo: `https://connect.linux.do/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=openid+profile+email&state=${provider}`,
    github: `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=user:email&state=${provider}`,
    google: `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=openid+profile+email&state=${provider}`,
  }
  window.location.href = authorizeUrls[provider]
}

const loginFns = {
  linuxdo: oauthLinuxDoLogin,
  github: oauthGithubLogin,
  google: oauthGoogleLogin,
}

oauthGetUser();

async function oauthGetUser() {

  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  if (!code || !oauthProvider.value) return

  const provider = oauthProvider.value
  oauthLoading.value = true
  sessionStorage.removeItem('oauthProvider')
  window.history.replaceState({}, '', window.location.origin + window.location.pathname)

  loginFns[provider](code, window.location.origin + '/login').then(async data => {

    bindForm.oauthUserId = data.userInfo.oauthUserId;
    const linkCurrent = sessionStorage.getItem('oauthLinkCurrent') === '1'
    sessionStorage.removeItem('oauthLinkCurrent')

    // 个人设置页发起的绑定：挂到当前登录用户，不要切换成其他账号
    if (linkCurrent && localStorage.getItem('token')) {
      try {
        await oauthLinkCurrent(data.userInfo.oauthUserId)
        ElMessage({
          message: t('oauthBindSuccess'),
          type: 'success',
          plain: true,
        })
        await router.replace({ name: 'setting' })
      } catch (e) {
        await router.replace({ name: 'setting' })
      } finally {
        oauthLoading.value = false
      }
      return
    }

    if (!data.token) {
      showBindForm.value = true
      oauthLoading.value = false
      ElMessage({
        message: t('oauthBindNeedEmail'),
        type: 'warning',
        duration: 4000,
        plain: true,
      })
      return;
    }

    saveToken(data.token);
  }).catch(() => {
    oauthLoading.value = false
    sessionStorage.removeItem('oauthLinkCurrent')
  })
}

function bind() {

  if (bindLoading.value) return

  if (!bindForm.email) {
    ElMessage({
      message: t('emptyEmailMsg'),
      type: 'error',
      plain: true,
    })
    return
  }


  if (getEmailName(bindForm.email).length < settingStore.settings.minEmailPrefix) {
    ElMessage({
      message: t('minEmailPrefix', {msg: settingStore.settings.minEmailPrefix}),
      type: 'error',
      plain: true,
    })
    return
  }

  let email = getFullEmail(bindForm.email);


  if (!isEmail(email)) {
    ElMessage({
      message: t('notEmailMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (settingStore.settings.regKey === 0) {

    if (!bindForm.password && !bindForm.code) {

      ElMessage({
        message: t('oauthBindNeedPwdOrKey'),
        type: 'error',
        plain: true,
      })
      return
    }

  }

  const form = {email, oauthUserId: bindForm.oauthUserId, code: bindForm.code, password: bindForm.password}

  bindLoading.value = true
  oauthBindUser(form).then(data => {
    saveToken(data.token)
  }).catch(() => {
    bindLoading.value = false
  })
}

const submit = () => {

  if (loginLoading.value) return

  if (!form.email) {
    ElMessage({
      message: t('emptyEmailMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  let email = getFullEmail(form.email);

  if (!isEmail(email)) {
    ElMessage({
      message: t('notEmailMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (!form.password) {
    ElMessage({
      message: t('emptyPwdMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  loginLoading.value = true
  login(email, form.password).then(async data => {
    await saveToken(data.token)
  }).finally(() => {
    loginLoading.value = false
  })
}

async function saveToken(token) {
  localStorage.setItem('token', token)
  refreshWebsiteConfig()
  const user = await loginUserInfo();
  accountStore.currentAccountId = user.account.accountId;
  accountStore.currentAccount = user.account;
  userStore.user = user;
  const routers = permsToRouter(user.permKeys);
  routers.forEach(routerData => {
    router.addRoute('layout', routerData);
  });
  await router.replace({name: 'layout'})
  uiStore.showNotice()
  oauthLoading.value = false;
  bindLoading.value = false;
}

function refreshWebsiteConfig() {
  websiteConfig().then(setting => {
    settingStore.settings = setting
    settingStore.domainList = setting.domainList
    if (!suffix.value && setting.domainList.length > 0) {
      suffix.value = setting.domainList[0]
    }
    document.title = setting.title
  }).catch(e => {
    console.error(e)
  })
}


function submitRegister() {

  if (registerLoading.value) return

  if (!registerForm.email) {
    ElMessage({
      message: t('emptyEmailMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  console.log(registerForm.email)

  if (getEmailName(registerForm.email).length < settingStore.settings.minEmailPrefix) {
    ElMessage({
      message: t('minEmailPrefix', {msg: settingStore.settings.minEmailPrefix}),
      type: 'error',
      plain: true,
    })
    return
  }

  const email = getFullEmail(registerForm.email);

  if (!isEmail(email)) {
    ElMessage({
      message: t('notEmailMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (!registerForm.password) {
    ElMessage({
      message: t('emptyPwdMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (registerForm.password.length < 6) {
    ElMessage({
      message: t('pwdLengthMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (registerForm.password !== registerForm.confirmPassword) {

    ElMessage({
      message: t('confirmPwdFailMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (settingStore.settings.regKey === 0) {

    if (!registerForm.code) {

      ElMessage({
        message: t('emptyRegKeyMsg'),
        type: 'error',
        plain: true,
      })
      return
    }

  }

  if (!verifyToken && (settingStore.settings.registerVerify === 0 || (settingStore.settings.registerVerify === 2 && settingStore.settings.regVerifyOpen))) {
    if (!verifyShow.value) {
      verifyShow.value = true
      nextTick(() => {
        if (!turnstileId) {
          try {
            turnstileId = window.turnstile.render('.register-turnstile')
          } catch (e) {
            botJsError.value = true
            console.log('人机验证js加载失败')
          }
        } else {
          window.turnstile.reset('.register-turnstile')
        }
      })
    } else if (!botJsError.value) {
      ElMessage({
        message: t('botVerifyMsg'),
        type: "error",
        plain: true
      })
    }
    return;
  }

  registerLoading.value = true

  const form = {
    email,
    password: registerForm.password,
    token: verifyToken,
    code: registerForm.code
  }

  register(form).then(({regVerifyOpen}) => {
    show.value = 'login'
    registerForm.email = ''
    registerForm.password = ''
    registerForm.confirmPassword = ''
    registerForm.code = ''
    registerLoading.value = false
    verifyToken = ''
    settingStore.settings.regVerifyOpen = regVerifyOpen
    verifyShow.value = false
    ElMessage({
      message: t('regSuccessMsg'),
      type: 'success',
      plain: true,
    })
  }).catch(res => {

    registerLoading.value = false

    if (res.code === 400) {
      verifyToken = ''
      settingStore.settings.regVerifyOpen = true
      if (turnstileId) {
        window.turnstile.reset(turnstileId)
      } else {
        nextTick(() => {
          turnstileId = window.turnstile.render('.register-turnstile')
        })
      }
      verifyShow.value = true

    }
  });
}

</script>


<style>
.el-select-dropdown__item {
  padding: 0 15px;
}

.no-autofill-pwd {
  .el-input__inner {
    -webkit-text-security: disc !important;
  }
}
</style>

<style lang="scss" scoped>

.form-wrapper {
  position: fixed;
  right: 0;
  height: 100%;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  @media (max-width: 767px) {
    width: 100%;
  }
}

.container {
  background: v-bind(loginOpacity);
  backdrop-filter: blur(20px) saturate(1.2);
  padding-left: 44px;
  padding-right: 44px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: 450px;
  height: 100%;
  border-left: 1px solid rgba(34, 211, 238, 0.22);
  box-shadow:
    -12px 0 40px rgba(0, 0, 0, 0.28),
    inset 1px 0 0 rgba(34, 211, 238, 0.08);
  position: relative;
  overflow: hidden;

  &::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, #22D3EE, #06B6D4, transparent);
    opacity: 0.85;
    pointer-events: none;
  }

  @media (max-width: 1024px) {
    padding: 28px 22px;
    width: 384px;
    margin-left: 18px;
    border-radius: 16px;
    height: auto;
    max-height: calc(100% - 36px);
    border: 1px solid rgba(34, 211, 238, 0.22);
  }
  @media (max-width: 767px) {
    border: 1px solid rgba(34, 211, 238, 0.22);
    padding: 28px 20px;
    border-radius: 16px;
    height: fit-content;
    width: 100%;
    margin-right: 18px;
    margin-left: 18px;
  }

  .btn {
    height: 40px;
    width: 100%;
    border-radius: 10px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .btn.el-button--primary {
    background: linear-gradient(135deg, #22D3EE, #0891B2);
    border: none;
    color: #041016;
    box-shadow: 0 0 24px rgba(6, 182, 212, 0.35);
  }

  .btn:not(.el-button--primary) {
    background: rgba(6, 182, 212, 0.06);
    border: 1px solid rgba(34, 211, 238, 0.28);
    color: var(--el-text-color-primary);
  }

  .form-desc {
    margin-top: 8px;
    margin-bottom: 24px;
    color: var(--form-desc-color);
    font-size: 13px;
    font-family: "JetBrains Mono", "Space Grotesk", monospace;
    letter-spacing: 0.04em;
  }

  .form-title {
    font-weight: 700;
    font-size: 28px !important;
    letter-spacing: -0.02em;
    background: linear-gradient(135deg, var(--el-text-color-primary) 20%, var(--tech-accent) 100%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }

  .switch {
    margin-top: 20px;
    text-align: center;

    span {
      color: var(--login-switch-color);
      cursor: pointer;
      font-weight: 500;
      text-shadow: 0 0 12px rgba(34, 211, 238, 0.35);
    }
  }

  :deep(.el-input__wrapper) {
    border-radius: 10px;
    background: var(--surface-color);
    box-shadow: 0 0 0 1px var(--base-border-color) inset;
    transition: box-shadow 0.2s ease;

    &.is-focus {
      box-shadow: 0 0 0 1px var(--tech-accent) inset, 0 0 16px rgba(6, 182, 212, 0.2) !important;
    }
  }

  .email-input :deep(.el-input__wrapper) {
    border-radius: 10px 0 0 10px;
    background: var(--surface-color);
  }

  .el-input {
    height: 42px;
    width: 100%;
    margin-bottom: 16px;

    :deep(.el-input__inner) {
      height: 40px;
    }
  }
}

:deep(.el-select-dropdown__item) {
  padding: 0 10px;
}

:deep(.bind-dialog) {
  width: 400px !important;
  @media (max-width: 440px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

.bind-container {
  display: grid;
  grid-template-columns: 1fr;
  gap: 15px;
}

.bind-hint {
  font-size: 12px;
  color: var(--secondary-text-color, #64748B);
  line-height: 1.5;
}

.setting-icon {
  position: relative;
  top: 6px;
}

.github {
  position: fixed;
  width: 36px;
  height: 36px;
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 10px;
  background: rgba(11, 18, 32, 0.85);
  bottom: 14px;
  right: 14px;
  z-index: 1000;
  border: 1px solid rgba(34, 211, 238, 0.25);
  box-shadow: 0 0 16px rgba(6, 182, 212, 0.15);
  cursor: pointer;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;

  &:hover {
    border-color: rgba(34, 211, 238, 0.5);
    box-shadow: 0 0 22px rgba(6, 182, 212, 0.3);
  }
}

:deep(.el-input-group__append) {
  padding: 0 !important;
  padding-left: 8px !important;
  padding-right: 4px !important;
  background: var(--surface-color);
  border-radius: 0 10px 10px 0;
  box-shadow: 0 0 0 1px var(--base-border-color) inset;
}

:deep(.el-button+.el-button) {
  margin: 0;
}

.register-turnstile {
  margin-bottom: 18px;
}

.select {
  position: absolute;
  right: 30px;
  width: 100px;
  opacity: 0;
  pointer-events: none;
  visibility: hidden;
}

.custom-style {
  margin-bottom: 10px;
}

.custom-style .el-segmented {
  --el-border-radius-base: 8px;
  width: 180px;
}


#login-box {
  background:
    radial-gradient(900px 500px at 15% 20%, rgba(6, 182, 212, 0.22), transparent 55%),
    radial-gradient(700px 480px at 85% 75%, rgba(14, 165, 233, 0.14), transparent 50%),
    linear-gradient(160deg, #05080F 0%, #0B1220 45%, #030712 100%);
  font-family: inherit;
  height: 100%;
  margin: 0;
  padding: 0;
  overflow-x: hidden;
  display: grid;
  grid-template-columns: 1fr;
}


#background-wrap {
  height: 100%;
  z-index: 0;
  position: relative;
  overflow: hidden;
}

.login-ambiance {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 80% 60% at 30% 40%, rgba(6, 182, 212, 0.18), transparent 55%),
    radial-gradient(ellipse 50% 40% at 70% 70%, rgba(14, 165, 233, 0.12), transparent 50%),
    linear-gradient(165deg, #030712 0%, #0B1220 42%, #020617 100%);
  overflow: hidden;
}

.tech-grid {
  position: absolute;
  inset: -20%;
  background-image:
    linear-gradient(rgba(34, 211, 238, 0.07) 1px, transparent 1px),
    linear-gradient(90deg, rgba(34, 211, 238, 0.07) 1px, transparent 1px);
  background-size: 42px 42px;
  transform: perspective(600px) rotateX(58deg) scale(1.4);
  transform-origin: center 20%;
  animation: tech-grid-move 22s linear infinite;
  mask-image: linear-gradient(to bottom, rgba(0,0,0,0.85), transparent 88%);
  -webkit-mask-image: linear-gradient(to bottom, rgba(0,0,0,0.85), transparent 88%);
  opacity: 0.9;
}

.tech-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(40px);
  pointer-events: none;
}

.tech-glow-a {
  width: 380px;
  height: 380px;
  left: 12%;
  top: 18%;
  background: rgba(34, 211, 238, 0.35);
  animation: tech-pulse 6s ease-in-out infinite;
}

.tech-glow-b {
  width: 280px;
  height: 280px;
  right: 18%;
  bottom: 16%;
  background: rgba(6, 182, 212, 0.28);
  animation: tech-pulse 8s ease-in-out infinite reverse;
}

.tech-ring {
  position: absolute;
  left: 28%;
  top: 42%;
  border: 1px solid rgba(34, 211, 238, 0.35);
  border-radius: 50%;
  box-shadow:
    0 0 24px rgba(6, 182, 212, 0.2),
    inset 0 0 24px rgba(34, 211, 238, 0.08);
  pointer-events: none;
}

.tech-ring-a {
  width: min(420px, 55vw);
  height: min(420px, 55vw);
  margin: calc(min(420px, 55vw) / -2) 0 0 calc(min(420px, 55vw) / -2);
  animation: tech-spin 28s linear infinite;
  border-top-color: rgba(103, 232, 249, 0.85);
  border-right-color: transparent;
}

.tech-ring-b {
  width: min(280px, 38vw);
  height: min(280px, 38vw);
  margin: calc(min(280px, 38vw) / -2) 0 0 calc(min(280px, 38vw) / -2);
  animation: tech-spin 18s linear infinite reverse;
  border-bottom-color: rgba(6, 182, 212, 0.9);
  border-left-color: transparent;
}

.tech-scan {
  position: absolute;
  left: 0;
  right: 40%;
  height: 120px;
  background: linear-gradient(
    to bottom,
    transparent,
    rgba(34, 211, 238, 0.08),
    rgba(103, 232, 249, 0.22),
    rgba(34, 211, 238, 0.08),
    transparent
  );
  animation: tech-scan-y 5.5s ease-in-out infinite;
  pointer-events: none;
  mix-blend-mode: screen;
}

.tech-beam {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 18%;
  width: 2px;
  background: linear-gradient(
    to bottom,
    transparent 0%,
    rgba(34, 211, 238, 0.55) 35%,
    rgba(103, 232, 249, 0.9) 50%,
    rgba(34, 211, 238, 0.55) 65%,
    transparent 100%
  );
  box-shadow: 0 0 18px rgba(34, 211, 238, 0.55);
  animation: tech-beam-x 9s ease-in-out infinite;
  opacity: 0.55;
  pointer-events: none;
}

.tech-particles {
  position: absolute;
  inset: 0;
  pointer-events: none;

  span {
    position: absolute;
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: #67E8F9;
    box-shadow: 0 0 8px 2px rgba(34, 211, 238, 0.75);
    left: calc(8% + (var(--i) * 4.6%));
    top: 110%;
    animation: tech-float calc(7s + var(--i) * 0.35s) linear infinite;
    animation-delay: calc(var(--i) * -0.55s);
    opacity: 0.85;
  }

  span:nth-child(3n) {
    width: 2px;
    height: 2px;
    background: #22D3EE;
  }

  span:nth-child(4n) {
    width: 4px;
    height: 4px;
  }
}

.tech-hud {
  position: absolute;
  left: 8%;
  right: 42%;
  top: 14%;
  bottom: 14%;
  pointer-events: none;
  min-width: 220px;

  @media (max-width: 1024px) {
    right: 8%;
    opacity: 0.55;
  }

  @media (max-width: 767px) {
    display: none;
  }
}

.hud-corner {
  position: absolute;
  width: 28px;
  height: 28px;
  border-color: rgba(34, 211, 238, 0.7);
  border-style: solid;
  border-width: 0;
}

.hud-tl { top: 0; left: 0; border-top-width: 2px; border-left-width: 2px; }
.hud-tr { top: 0; right: 0; border-top-width: 2px; border-right-width: 2px; }
.hud-bl { bottom: 0; left: 0; border-bottom-width: 2px; border-left-width: 2px; }
.hud-br { bottom: 0; right: 0; border-bottom-width: 2px; border-right-width: 2px; }

.hud-brand {
  position: absolute;
  left: 36px;
  top: 36px;
  font-size: clamp(28px, 4vw, 48px);
  font-weight: 700;
  letter-spacing: 0.04em;
  color: #ECFEFF;
  text-shadow: 0 0 24px rgba(34, 211, 238, 0.55);
  max-width: calc(100% - 72px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hud-line {
  position: absolute;
  left: 36px;
  top: 96px;
  font-family: "JetBrains Mono", "Space Grotesk", monospace;
  font-size: 11px;
  letter-spacing: 0.22em;
  color: rgba(103, 232, 249, 0.75);
  animation: tech-blink 3.2s ease-in-out infinite;
}

.hud-meter {
  position: absolute;
  left: 36px;
  bottom: 40px;
  display: flex;
  gap: 6px;

  i {
    display: block;
    width: 8px;
    height: 22px;
    border-radius: 2px;
    background: rgba(34, 211, 238, 0.25);
    box-shadow: 0 0 8px rgba(6, 182, 212, 0.35);
    animation: tech-meter 1.6s ease-in-out infinite;

    &:nth-child(2) { animation-delay: 0.15s; }
    &:nth-child(3) { animation-delay: 0.3s; }
    &:nth-child(4) { animation-delay: 0.45s; }
    &:nth-child(5) { animation-delay: 0.6s; }
  }
}

@keyframes tech-grid-move {
  from { background-position: 0 0, 0 0; }
  to { background-position: 0 42px, 42px 0; }
}

@keyframes tech-pulse {
  0%, 100% { transform: scale(1); opacity: 0.55; }
  50% { transform: scale(1.18); opacity: 0.9; }
}

@keyframes tech-spin {
  to { transform: rotate(360deg); }
}

@keyframes tech-scan-y {
  0% { top: -10%; opacity: 0; }
  15% { opacity: 1; }
  85% { opacity: 1; }
  100% { top: 95%; opacity: 0; }
}

@keyframes tech-beam-x {
  0%, 100% { transform: translateX(0); opacity: 0.35; }
  50% { transform: translateX(42vw); opacity: 0.7; }
}

@keyframes tech-float {
  0% { transform: translateY(0) scale(1); opacity: 0; }
  10% { opacity: 0.9; }
  90% { opacity: 0.7; }
  100% { transform: translateY(-120vh) scale(0.6); opacity: 0; }
}

@keyframes tech-blink {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 1; }
}

@keyframes tech-meter {
  0%, 100% { transform: scaleY(0.45); background: rgba(34, 211, 238, 0.25); }
  50% { transform: scaleY(1); background: #67E8F9; }
}

@media (prefers-reduced-motion: reduce) {
  .tech-grid,
  .tech-glow,
  .tech-ring,
  .tech-scan,
  .tech-beam,
  .tech-particles span,
  .hud-line,
  .hud-meter i {
    animation: none !important;
  }
}

</style>
