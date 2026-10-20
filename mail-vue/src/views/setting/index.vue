<template>
  <div class="box">
    <div class="blacklist-setting">
      <div class="title">{{ $t('senderBlacklist') }}</div>
      <div class="blacklist-tip">{{ $t('senderBlacklistDesc') }}</div>
      <div class="blacklist-add-row">
        <input
            v-model="blacklistInput"
            class="blacklist-input"
            type="text"
            :placeholder="$t('senderBlacklistTagPlaceholder')"
            @keyup.enter="addBlacklistItem"
        />
        <el-button type="primary" @click="addBlacklistItem">{{ $t('add') }}</el-button>
      </div>
      <div class="blacklist-tag-list">
        <div v-for="(item, idx) in blacklistTags" :key="item + idx" class="blacklist-tag">
          <span>{{ item }}</span>
          <span class="blacklist-tag-remove" @click="removeBlacklistItem(idx)">×</span>
        </div>
        <div v-if="!blacklistTags.length" class="blacklist-empty">{{ $t('senderBlacklistEmpty') }}</div>
      </div>
      <el-button type="primary" class="blacklist-save" :loading="blacklistLoading" @click="saveBlacklist">
        {{ $t('save') }}
      </el-button>
    </div>
    <div class="container">
      <div class="title">{{$t('profile')}}</div>
      <div class="item">
        <div>{{$t('username')}}</div>
        <div>
          <span v-if="setNameShow" class="edit-name-input">
            <el-input v-model="accountName"  ></el-input>
            <span class="edit-name" @click="setName">
             {{$t('save')}}
            </span>
          </span>
          <span v-else class="user-name">
            <span >{{ userStore.user?.name || '-' }}</span>
            <span class="edit-name" @click="showSetName">
             {{$t('change')}}
            </span>
          </span>
        </div>
      </div>
      <div class="item">
        <div>{{$t('emailAccount')}}</div>
        <div>{{ userStore.user?.email || '-' }}</div>
      </div>
      <div class="item">
        <div>{{$t('password')}}</div>
        <div>
          <el-button type="primary" @click="pwdShow = true">{{$t('changePwdBtn')}}</el-button>
        </div>
      </div>
    </div>
    <div class="oauth-bind" v-if="visibleOauthPlatforms.length">
      <div class="title">{{ $t('oauthBindAccounts') }}</div>
      <div class="oauth-row" v-for="p in visibleOauthPlatforms" :key="p.key">
        <div class="oauth-left">
          <el-avatar v-if="p.iconType === 'image'" :src="p.icon" :size="22"/>
          <Icon v-else :icon="p.icon" width="22" height="22"/>
          <span class="oauth-label">{{ p.label }}</span>
          <span class="oauth-account" v-if="boundOf(p.key)">{{ boundOf(p.key).username || boundOf(p.key).name }}</span>
          <span class="oauth-empty" v-else>{{ $t('oauthNotBound') }}</span>
        </div>
        <el-button v-if="boundOf(p.key)" type="danger" plain size="small" :loading="unbindId === boundOf(p.key).oauthId" @click="unbindOauth(boundOf(p.key))">
          {{ $t('oauthUnbind') }}
        </el-button>
        <el-button v-else type="primary" size="small" @click="startOauthBind(p.key)">
          {{ $t('oauthBindBtn') }}
        </el-button>
      </div>
    </div>
    <div class="language">
      <div class="title">{{$t('language')}}</div>
      <el-select
          :model-value="langSelect"
          class="language-select"
          placeholder="Select"
          @change="changeLang"
      >
        <el-option label="中文" value="zh" @pointerdown.prevent.stop="changeLang('zh')"/>
        <el-option label="English" value="en" @pointerdown.prevent.stop="changeLang('en')"/>
      </el-select>
    </div>
    <div class="del-email" v-perm="'my:delete'">
      <div class="title">{{$t('deleteUser')}}</div>
      <div style="color: var(--regular-text-color);">
        {{$t('delAccountMsg')}}
      </div>
      <div>
        <el-button type="primary" @click="deleteConfirm">{{$t('deleteUserBtn')}}</el-button>
      </div>
    </div>
    <el-dialog v-model="pwdShow" :title="$t('changePassword')" width="340">
      <div class="update-pwd">
        <el-input type="password" :placeholder="$t('newPassword')" v-model="form.password" autocomplete="off" @keyup.enter="submitPwd"/>
        <el-input type="password" :placeholder="$t('confirmPassword')" v-model="form.newPwd" autocomplete="off" @keyup.enter="submitPwd"/>
        <el-button type="primary" :loading="setPwdLoading" @click="submitPwd">{{$t('save')}}</el-button>
      </div>
    </el-dialog>
  </div>
</template>
<script setup>
import {reactive, ref, defineOptions, computed, onMounted} from 'vue'
import {resetPassword, userDelete, oauthBindList, oauthUnbind} from "@/request/my.js";
import {useUserStore} from "@/store/user.js";
import router from "@/router/index.js";
import {accountSetName, accountSetBlacklist} from "@/request/account.js";
import {useAccountStore} from "@/store/account.js";
import {useEmailStore} from "@/store/email.js";
import {useI18n} from "vue-i18n";
import {useSettingStore} from "@/store/setting.js";
import {Icon} from "@iconify/vue";
import {isEmail, isDomain} from "@/utils/verify-utils.js";

defineOptions({
  name: 'setting'
})

const { t } = useI18n()
const accountStore = useAccountStore()
const emailStore = useEmailStore()
const settingStore = useSettingStore()
const userStore = useUserStore();
const setPwdLoading = ref(false)
const setNameShow = ref(false)
const accountName = ref(null)
const langSelect = ref(settingStore.lang || 'zh')
const oauthBinds = ref([])
const unbindId = ref(null)
const blacklistTags = ref([])
const blacklistInput = ref('')
const blacklistLoading = ref(false)

const oauthPlatforms = [
  { key: 'google', label: 'Google', icon: 'devicon:google', iconType: 'iconify' },
  { key: 'github', label: 'GitHub', icon: 'codicon:github-inverted', iconType: 'iconify' },
  { key: 'linuxdo', label: 'LinuxDo', icon: '/image/linuxdo.webp', iconType: 'image' },
]

const visibleOauthPlatforms = computed(() => {
  const settings = settingStore.settings || {}
  return oauthPlatforms.filter(p => {
    if (boundOf(p.key)) return true
    return settings[p.key + 'Switch'] === 0
  })
})

function boundOf(key) {
  return oauthBinds.value.find(item => item.platform === key)
}

function loadOauthBinds() {
  oauthBindList().then(list => {
    oauthBinds.value = list || []
  })
}

function startOauthBind(provider) {
  const clientId = settingStore.settings[provider + 'ClientId']
  if (!clientId) {
    ElMessage({ message: t('oauthNoClient'), type: 'error', plain: true })
    return
  }
  const redirectUri = encodeURIComponent(window.location.origin + '/login')
  sessionStorage.setItem('oauthProvider', provider)
  sessionStorage.setItem('oauthLinkCurrent', '1')
  const authorizeUrls = {
    linuxdo: `https://connect.linux.do/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=openid+profile+email&state=${provider}`,
    github: `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=user:email&state=${provider}`,
    google: `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=openid+profile+email&state=${provider}`,
  }
  window.location.href = authorizeUrls[provider]
}

function unbindOauth(row) {
  ElMessageBox.confirm(t('oauthUnbindConfirm', { name: row.username || row.name || row.platform }), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning',
  }).then(() => {
    unbindId.value = row.oauthId
    oauthUnbind(row.oauthId).then(() => {
      oauthBinds.value = oauthBinds.value.filter(item => item.oauthId !== row.oauthId)
      ElMessage({ message: t('oauthUnbindSuccess'), type: 'success', plain: true })
    }).finally(() => {
      unbindId.value = null
    })
  }).catch(() => {})
}

function loadBlacklist() {
  const raw = userStore.user?.account?.blacklist
      || accountStore.currentAccount?.blacklist
      || ''
  blacklistTags.value = String(raw)
      .split(/[,，]/)
      .map(s => s.trim().toLowerCase())
      .filter(Boolean)
}

function addBlacklistItem() {
  const items = Array.from(new Set(
      String(blacklistInput.value || '')
          .split(/[,，\s]+/)
          .map(item => item.trim().toLowerCase())
          .filter(Boolean)
  ))
  if (!items.length) return
  for (const item of items) {
    if (!isEmail(item) && !isDomain(item)) {
      ElMessage({ message: t('notEmailMsg'), type: 'error', plain: true })
      return
    }
    if (!blacklistTags.value.includes(item)) {
      blacklistTags.value.push(item)
    }
  }
  blacklistInput.value = ''
}

function removeBlacklistItem(index) {
  blacklistTags.value.splice(index, 1)
}

function saveBlacklist() {
  if (blacklistLoading.value) return
  const accountId = userStore.user?.account?.accountId
  if (!accountId) return

  const list = (blacklistTags.value || [])
      .map(s => String(s || '').trim().toLowerCase())
      .filter(Boolean)

  for (const item of list) {
    if (!isEmail(item) && !isDomain(item)) {
      ElMessage({ message: t('notEmailMsg'), type: 'error', plain: true })
      return
    }
  }

  blacklistLoading.value = true
  const blacklist = list.join(',')
  accountSetBlacklist(accountId, blacklist).then(() => {
    if (userStore.user.account) userStore.user.account.blacklist = blacklist
    if (accountStore.currentAccount?.accountId === accountId) {
      accountStore.currentAccount.blacklist = blacklist
    }
    emailStore.emailScroll?.refreshList()
    emailStore.spamScroll?.refreshList()
    ElMessage({ message: t('saveSuccessMsg'), type: 'success', plain: true })
  }).finally(() => {
    blacklistLoading.value = false
  })
}

onMounted(() => {
  try {
    loadOauthBinds()
    loadBlacklist()
  } catch (e) {
    console.error(e)
  }
})

function showSetName() {
  accountName.value = userStore.user.name
  setNameShow.value = true
}

function setName() {

  if (!accountName.value) {
    ElMessage({
      message: t('emptyUserNameMsg'),
      type: 'error',
      plain: true,
    })
    return;
  }

  setNameShow.value = false
  let name = accountName.value

  if (name === userStore.user.name) {
    return
  }

  userStore.user.name = accountName.value

  accountSetName(userStore.user.account.accountId,name).then(() => {
    ElMessage({
      message: t('saveSuccessMsg'),
      type: 'success',
      plain: true,
    })

    accountStore.changeUserAccountName = name

  }).catch(() => {
    userStore.user.name = name
  })
}

function changeLang(lang) {
  let setting = {}
  try {
    setting = JSON.parse(localStorage.getItem('setting') || '{}')
  } catch (e) {
    setting = {}
  }
  localStorage.setItem('setting', JSON.stringify({...setting, lang}))
  window.location.reload()
}

const pwdShow = ref(false)
const form = reactive({
  password: '',
  newPwd: '',
})

const deleteConfirm = () => {
  ElMessageBox.confirm(t('delAccountConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    userDelete().then(() => {
      localStorage.removeItem('token');
      router.replace('/login');
      ElMessage({
        message: t('delSuccessMsg'),
        type: 'success',
        plain: true,
      })
    })
  })
}


function submitPwd() {

  if (setPwdLoading.value) return

  if (!form.password) {
    ElMessage({
      message: t('emptyPwdMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (form.password.length < 6) {
    ElMessage({
      message: t('pwdLengthMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (form.password !== form.newPwd) {
    ElMessage({
      message: t('confirmPwdFailMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  setPwdLoading.value = true
  resetPassword(form.password).then(() => {
    ElMessage({
      message: t('saveSuccessMsg'),
      type: 'success',
      plain: true,
    })
    pwdShow.value = false
    setPwdLoading.value = false
    form.password = ''
    form.newPwd = ''
  }).catch(() => {
    setPwdLoading.value = false
  })

}

</script>
<style scoped lang="scss">
.box {
  padding: 40px 40px;
  min-height: 100%;
  box-sizing: border-box;
  color: var(--el-text-color-primary);

  @media (max-width: 767px) {
    padding: 30px 30px;
  }

  .update-pwd {
    display: flex;
    flex-direction: column;
    gap: 15px;
  }

  .title {
    font-size: 18px;
    font-weight: bold;
  }

  .blacklist-setting {
    margin-bottom: 40px;
    max-width: 560px;
    padding: 16px;
    border: 1px solid var(--light-border);
    border-radius: 10px;
    background: var(--el-bg-color);

    .blacklist-tip {
      margin: 10px 0 12px;
      font-size: 13px;
      color: var(--regular-text-color);
      line-height: 1.5;
    }

    .blacklist-add-row {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
    }

    .blacklist-input {
      flex: 1;
      min-width: 0;
      height: 32px;
      padding: 0 10px;
      border: 1px solid var(--light-border);
      border-radius: 6px;
      background: var(--surface-color);
      color: var(--el-text-color-primary);
      outline: none;
    }

    .blacklist-tag-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 12px;
      min-height: 32px;
    }

    .blacklist-tag {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      border-radius: 6px;
      background: var(--surface-color);
      border: 1px solid var(--light-border);
      font-size: 13px;
    }

    .blacklist-tag-remove {
      cursor: pointer;
      font-size: 16px;
      line-height: 1;
    }

    .blacklist-empty {
      font-size: 13px;
      color: var(--secondary-text-color);
    }

    .blacklist-save {
      margin-top: 4px;
    }
  }

  .container {
    font-size: 14px;
    display: grid;
    gap: 20px;
    margin-bottom: 40px;

    .item {
      display: grid;
      grid-template-columns: 50px 1fr;
      gap: 140px;
      position: relative;
      .user-name {
        display: grid;
        grid-template-columns: auto 1fr;
        span:first-child {
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }
      }

      .edit-name-input {
        position: absolute;
        bottom: -6px;
        .el-input {
          width: min(200px,calc(100vw - 222px));
        }
      }

      .edit-name {
        color: #4dabff;
        padding-left: 10px;
        cursor: pointer;
      }

      @media (max-width: 767px) {
        gap: 70px;
      }

      div:first-child {
        font-weight: bold;
      }

      div:last-child {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
    }
  }

  .language {
    display: flex;
    flex-direction: column;
    gap: 20px;
    margin-bottom: 40px;

    .language-select {
      width: 100px;
    }
  }

  .oauth-bind {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-bottom: 40px;
    font-size: 14px;

    .oauth-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      max-width: 520px;
    }

    .oauth-left {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }

    .oauth-label {
      font-weight: 600;
    }

    .oauth-account {
      color: var(--el-text-color-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .oauth-empty {
      color: var(--secondary-text-color, #64748B);
    }
  }

  .del-email {
    font-size: 14px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
}
</style>
