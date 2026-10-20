<template>
  <div class="account-box">
    <div class="head-opt">
      <Icon v-perm="'account:add'" class="icon add" icon="ion:add-outline" width="23" height="23" @click="add"/>
      <Icon class="icon refresh" icon="ion:reload" width="18" height="18" @click="refresh"/>
    </div>
    <div v-if="blacklistShow" class="blacklist-panel">
      <div class="blacklist-panel-head">
        <Icon class="blacklist-back" icon="material-symbols-light:arrow-back-ios-new" width="18" height="18" @click="closeBlacklist"/>
        <div class="blacklist-panel-title">{{ $t('senderBlacklist') }}</div>
      </div>
      <div class="blacklist-panel-email">{{ account && account.email }}</div>
      <div class="blacklist-panel-desc">{{ $t('senderBlacklistDesc') }}</div>
      <div class="blacklist-add-row">
        <input
            v-model="blacklistInput"
            class="blacklist-input"
            type="text"
            :placeholder="$t('senderBlacklistTagPlaceholder')"
            @keyup.enter="addBlacklistItem"
        />
        <button type="button" class="blacklist-add-btn" @click="addBlacklistItem">{{ $t('add') }}</button>
      </div>
      <div class="blacklist-tag-list">
        <div v-for="(item, idx) in blacklistTags" :key="item + idx" class="blacklist-tag">
          <span class="blacklist-tag-text">{{ item }}</span>
          <span class="blacklist-tag-remove" @click="removeBlacklistItem(idx)">×</span>
        </div>
        <div v-if="!blacklistTags.length" class="blacklist-empty">{{ $t('senderBlacklistEmpty') }}</div>
      </div>
      <button type="button" class="blacklist-save" :disabled="blacklistLoading" @click="saveBlacklist">
        {{ blacklistLoading ? '...' : $t('save') }}
      </button>
    </div>
    <el-scrollbar v-else class="scrollbar" ref="scrollbarRef">
      <div v-infinite-scroll="getAccountList" :infinite-scroll-distance="600" :infinite-scroll-immediate="false">
        <el-card class="item" :class="itemBg(item.accountId)" v-for="(item, index) in accounts" :key="item.accountId"
                 @click="changeAccount(item)">
          <div class="account">
            {{ item.email }}
          </div>
          <div class="opt">
            <div class="send-email" @click.stop>
              <Icon @click="setAllReceive(item)" v-if="!item.allReceive" icon="eva:email-fill" width="22" height="22" color="#fccb1a"/>
              <Icon @click="setAllReceive(item)" v-else icon="flat-color-icons:folder" width="22" height="22" color="#23c4f1" />
            </div>
            <div class="settings" @click.stop>
              <span class="blacklist-btn" @click.stop="openBlacklist(item)">{{ $t('senderBlacklist') }}</span>
              <Icon icon="fluent-color:clipboard-24" width="22" height="22" @click.stop="copyAccount(item.email)"/>
              <el-dropdown trigger="click" @command="(cmd) => handleAccountCommand(cmd, item, index)">
                <span class="setting-trigger" @click.stop>
                  <Icon icon="fluent:settings-24-filled" width="21" height="21" color="#909399"/>
                </span>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item v-if="hasPerm('email:send')" command="rename">{{ $t('rename') }}</el-dropdown-item>
                    <el-dropdown-item command="blacklist">{{ $t('senderBlacklist') }}</el-dropdown-item>
                    <el-dropdown-item v-if="item.accountId !== userStore.user.account.accountId" command="pin">{{ $t('pin') }}</el-dropdown-item>
                    <el-dropdown-item v-if="item.accountId !== userStore.user.account.accountId && hasPerm('account:delete')"
                                      command="delete">{{ $t('delete') }}
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </div>
        </el-card>

        <template v-if="loading">
          <el-skeleton v-for="i in skeletonRows" :key="i" animated>
            <template #template>
              <el-card class="item">
                <el-skeleton-item variant="p" style="width: 70%; height: 20px; margin-bottom: 25px"/>
                <div style="display: flex; justify-content: space-between">
                  <el-skeleton-item variant="text" style="width: 20px"/>
                  <el-skeleton-item variant="text" style="width: 20px"/>
                </div>
              </el-card>
            </template>
          </el-skeleton>
        </template>

        <template v-if="accounts.length > 0 && !noLoading">
          <el-skeleton animated>
            <template #template>
              <el-card class="item">
                <el-skeleton-item variant="p" style="width: 70%; height: 20px; margin-bottom: 20px"/>
                <div style="display: flex; justify-content: space-between">
                  <el-skeleton-item variant="text" style="width: 20px"/>
                  <el-skeleton-item variant="text" style="width: 20px"/>
                </div>
              </el-card>
            </template>
          </el-skeleton>
        </template>

        <div class="noLoading" v-if="noLoading && accounts.length > 0">
          <div>{{ $t('noMoreData') }}</div>
        </div>
        <div class="empty" v-if="noLoading && accounts.length === 0">
          <el-empty :description="$t('noMessagesFound')"/>
        </div>
      </div>

    </el-scrollbar>
    <el-dialog v-model="showAdd" :title="$t('addAccount')" width="400px" append-to-body>
      <div class="container">
        <el-input v-model="addForm.email" ref="addRef" type="text" :placeholder="$t('emailAccount')" autocomplete="off" @keyup.enter="submit">
          <template #append>
            <div @click.stop="openSelect">
              <el-select
                  ref="mySelect"
                  v-model="addForm.suffix"
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
                <span>{{ addForm.suffix }}</span>
                <Icon class="setting-icon" icon="mingcute:down-small-fill" width="20" height="20"/>
              </div>
            </div>
          </template>
        </el-input>
        <el-button class="btn" type="primary" @click="submit" :loading="addLoading"
        >{{ $t('add') }}
        </el-button>
      </div>
      <div
          class="add-email-turnstile"
          :class="verifyShow ? 'turnstile-show' : 'turnstile-hide'"
          :data-sitekey="settingStore.settings.siteKey"
          data-callback="onTurnstileSuccess"
          data-error-callback="onTurnstileError"
      >
        <span style="font-size: 12px;color: #F56C6C" v-if="botJsError">{{ $t('verifyModuleFailed') }}</span>
      </div>
    </el-dialog>
    <el-dialog v-model="setNameShow" :title="$t('changeUserName')" width="400px" append-to-body>
      <div class="container">
        <el-input v-model="accountName" type="text" :placeholder="$t('username')" autocomplete="off" @keyup.enter="setName">
        </el-input>
        <el-button class="btn" type="primary" @click="setName" :loading="setNameLoading"
        >{{ $t('save') }}
        </el-button>
      </div>
    </el-dialog>
  </div>
</template>
<script setup>
import {Icon} from "@iconify/vue";
import {computed, nextTick, reactive, ref, watch} from "vue";
import {
  accountList,
  accountAdd,
  accountDelete,
  accountSetName,
  accountSetAllReceive,
  accountSetAsTop,
  accountSetBlacklist
} from "@/request/account.js";
import {sleep} from "@/utils/time-utils.js"
import {isEmail, isDomain} from "@/utils/verify-utils.js";
import {useSettingStore} from "@/store/setting.js";
import {useAccountStore} from "@/store/account.js";
import {useEmailStore} from "@/store/email.js";
import {useUserStore} from "@/store/user.js";
import {hasPerm} from "@/perm/perm.js"
import {useI18n} from "vue-i18n";
import {AccountAllReceiveEnum} from "@/enums/account-enum.js";

const {t} = useI18n();
const userStore = useUserStore();
const accountStore = useAccountStore();
const settingStore = useSettingStore();
const emailStore = useEmailStore();
const showAdd = ref(false)
const addLoading = ref(false);
const domainList = computed(() => settingStore.domainList)
const accounts = reactive([])
const noLoading = ref(false)
const loading = ref(false)
const followLoading = ref(false);
const verifyShow = ref(false)
const setNameShow = ref(false)
const setNameLoading = ref(false)
const accountName = ref(null)
const blacklistShow = ref(false)
const blacklistLoading = ref(false)
const blacklistTags = ref([])
const blacklistInput = ref('')
const addRef = ref({})
const scrollbarRef = ref({})
let account = null
let turnstileId = null
const botJsError = ref(false)
let verifyToken = ''
let verifyErrorCount = 0
let first = true
const addForm = reactive({
  email: '',
  suffix: settingStore.domainList[0]
})
let skeletonRows = 10
const queryParams = {
  size: 30
}

const mySelect = ref()

if (hasPerm('account:query')) {
  getAccountList()
}

watch(() => accountStore.changeUserAccountName, () => {
  accounts[0].name = accountStore.changeUserAccountName
})

watch(() => settingStore.domainList, (list) => {
  if (!addForm.suffix && list.length > 0) {
    addForm.suffix = list[0]
  }
}, {immediate: true})


const openSelect = () => {
  mySelect.value.toggleMenu()
}

window.onTurnstileError = () => {
  verifyErrorCount ++
  if (verifyErrorCount > 2) {
    botJsError.value = true
  }
}

window.onTurnstileSuccess = (token) => {
  verifyToken = token;
};

function getSkeletonRows() {
  if (accounts.length > 20) return skeletonRows = 20
  if (accounts.length === 0) return skeletonRows = 1
  skeletonRows = accounts.length
}

function setName() {

  if (setNameLoading.value) return

  let name = accountName.value

  if (name === account.name) {
    setNameShow.value = false
    return
  }

  if (!name) {
    ElMessage({
      message: t('emptyUserNameMsg'),
      type: 'error',
      plain: true,
    })
    return;
  }

  setNameLoading.value = true
  accountSetName(account.accountId, name).then(() => {
    account.name = name
    setNameShow.value = false

    if (account.accountId === userStore.user.account.accountId) {
      userStore.user.name = name
    }

    ElMessage({
      message: t('saveSuccessMsg'),
      type: "success",
      plain: true
    })
  }).finally(() => {
    setNameLoading.value = false
  })
}

function openSetName(accountItem) {
  accountName.value = accountItem.name
  account = accountItem
  setNameShow.value = true
}

function setAllReceive(account) {
  let allReceiveAccount = accounts.find(account => account.allReceive === AccountAllReceiveEnum.ENABLED);
  if (allReceiveAccount && allReceiveAccount.accountId !== account.accountId) allReceiveAccount.allReceive = AccountAllReceiveEnum.DISABLED;
  account.allReceive = account.allReceive === AccountAllReceiveEnum.DISABLED ? AccountAllReceiveEnum.ENABLED : AccountAllReceiveEnum.DISABLED;
  accountSetAllReceive(account.accountId).catch(() => {
    account.allReceive = account.allReceive === AccountAllReceiveEnum.DISABLED ? AccountAllReceiveEnum.ENABLED : AccountAllReceiveEnum.DISABLED;
    if (allReceiveAccount) allReceiveAccount.allReceive = AccountAllReceiveEnum.ENABLED;
  }).then(() => {
    if (account.allReceive === AccountAllReceiveEnum.ENABLED) {
      ElMessage({
        message: t('setSuccess'),
        type: 'success',
        plain: true,
      })
    }
    changeAccount(account);
    if (emailStore.emailScroll && emailStore.emailScroll.refreshList) {
      emailStore.emailScroll.refreshList();
    }
    if (emailStore.sendScroll && emailStore.sendScroll.refreshList) {
      emailStore.sendScroll.refreshList();
    }
  })
}


function handleAccountCommand(command, accountItem, index) {
  if (command === 'rename') openSetName(accountItem)
  else if (command === 'blacklist') openBlacklist(accountItem)
  else if (command === 'pin') setAsTop(accountItem, index)
  else if (command === 'delete') remove(accountItem)
}

function openBlacklist(accountItem) {
  account = accountItem
  blacklistInput.value = ''
  blacklistTags.value = String(accountItem.blacklist || '')
      .split(/[,，]/)
      .map(s => s.trim().toLowerCase())
      .filter(Boolean)
  blacklistShow.value = true
}

function closeBlacklist() {
  blacklistShow.value = false
  blacklistInput.value = ''
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
  if (blacklistLoading.value || !account) return

  const list = (blacklistTags.value || [])
      .map(s => String(s || '').trim().toLowerCase())
      .filter(Boolean)

  for (const item of list) {
    if (!isEmail(item) && !isDomain(item)) {
      ElMessage({
        message: t('notEmailMsg'),
        type: 'error',
        plain: true,
      })
      return
    }
  }

  blacklistLoading.value = true
  const blacklist = list.join(',')
  accountSetBlacklist(account.accountId, blacklist).then(() => {
    account.blacklist = blacklist
    blacklistShow.value = false
    if (emailStore.emailScroll && emailStore.emailScroll.refreshList) {
      emailStore.emailScroll.refreshList()
    }
    if (emailStore.spamScroll && emailStore.spamScroll.refreshList) {
      emailStore.spamScroll.refreshList()
    }
    ElMessage({
      message: t('saveSuccessMsg'),
      type: 'success',
      plain: true,
    })
  }).finally(() => {
    blacklistLoading.value = false
  })
}

function itemBg(accountId) {
  return accountStore.currentAccountId === accountId ? 'item-choose' : ''
}



function remove(account) {
  ElMessageBox.confirm(t('delConfirm', {msg: account.email}), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    accountDelete(account.accountId).then(() => {
      const index = accounts.findIndex(item => item.accountId === account.accountId);
      accounts.splice(index, 1);
      if (accounts.length < queryParams.size) {
        getAccountList()
      }
      ElMessage({
        message: t('delSuccessMsg'),
        type: 'success',
        plain: true,
      })
    })
  });
}

function refresh() {
  if (loading.value) {
    return
  }
  loading.value = false
  followLoading.value = false
  noLoading.value = false
  queryParams.accountId = 0
  queryParams.lastSort = null
  getSkeletonRows();
  scrollbarRef.value.setScrollTop(0)
  accounts.splice(0, accounts.length)
  getAccountList()
}

function changeAccount(account) {
  accountStore.currentAccountId = account.accountId
  accountStore.currentAccount = account
}

function add() {
  addForm.suffix = addForm.suffix || settingStore.domainList[0]
  showAdd.value = true
  setTimeout(() => {
    addRef.value.focus()
  }, 100)
}

function setAsTop(account, index) {
  accountSetAsTop(account.accountId).then(() => {
    ElMessage({
      message: t('setSuccess'),
      type: 'success',
      plain: true,
    })

    const [item] = accounts.splice(index, 1);
    accounts.splice(1, 0, item);

  });
}

async function copyAccount(account) {
  try {
    await navigator.clipboard.writeText(account);
    ElMessage({
      message: t('copySuccessMsg'),
      type: 'success',
      plain: true,
    })
  } catch (err) {
    console.error(`${t('copyFailMsg')}:`, err);
  }
}


function getAccountList() {

  if (followLoading.value || noLoading.value ) {
    return
  }

  if (first) {
    loading.value = true
    getSkeletonRows()
  }

  followLoading.value = true
  accountList(queryParams.accountId, queryParams.size, queryParams.lastSort).then(async list => {

    if (list.length === 0) {
      noLoading.value = true
      loading.value = false
      followLoading.value = false
      return
    }

    queryParams.accountId = list.at(-1).accountId
    queryParams.lastSort = list.at(-1).sort

    if (list.length < queryParams.size) {
      noLoading.value = true
    }

    if (!first) {
      await sleep(300)
    }

    if (accounts.length === 0) {
      accountStore.currentAccountId = list[0].accountId
    }

    if (accounts.length === 0) {
      accountStore.currentAccount = list[0]
    }

    accounts.push(...list)

    loading.value = false
    followLoading.value = false
    first = false
  }).catch(() => {
    loading.value = false
    followLoading.value = false
  })
}


function submit() {

  if (addLoading.value) return

  if (!addForm.email) {
    ElMessage({
      message: t('emptyEmailMsg'),
      type: "error",
      plain: true
    })
    return
  }

  if (addForm.email.length < settingStore.settings.minEmailPrefix) {
    ElMessage({
      message: t('minEmailPrefix', {msg: settingStore.settings.minEmailPrefix}),
      type: 'error',
      plain: true,
    })
    return
  }

  if (!isEmail(addForm.email + addForm.suffix)) {
    ElMessage({
      message: t('notEmailMsg'),
      type: "error",
      plain: true
    })
    return
  }

  if (!verifyToken && (settingStore.settings.addEmailVerify === 0 || (settingStore.settings.addEmailVerify === 2 && settingStore.settings.addVerifyOpen))) {
    if (!verifyShow.value) {
      verifyShow.value = true
      nextTick(() => {
        if (!turnstileId) {
          try {
            turnstileId = window.turnstile.render('.add-email-turnstile')
          } catch (e) {
            botJsError.value = true
            console.log('人机验证js加载失败')
          }
        } else {
          window.turnstile.reset('.add-email-turnstile')
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

  addLoading.value = true
  accountAdd(addForm.email + addForm.suffix, verifyToken).then(account => {
    addLoading.value = false
    addForm.email = ''
    accounts.push(account)
    verifyToken = ''
    settingStore.settings.addVerifyOpen = account.addVerifyOpen
    ElMessage({
      message: t('addSuccessMsg'),
      type: "success",
      plain: true
    })
    showAdd.value = false
    verifyShow.value = false
  }).catch(() => {
    verifyToken = ''
    if (turnstileId) {
      window.turnstile.reset(turnstileId)
    } else {
      nextTick(() => {
        turnstileId = window.turnstile.render('.add-email-turnstile')
      })
    }
    verifyShow.value = true
    addLoading.value = false
  })
}
</script>
<style>
path[fill="#ffdda1"] {
  fill: #ffdd7d;
}
</style>
<style scoped lang="scss">
.account-box {
  border-right: 1px solid var(--light-border) !important;
  background-color: var(--surface-color);
  height: 100%;
  width: 100%;
  max-width: 260px;
  min-width: 0;
  overflow: hidden;
  box-sizing: border-box;

  .head-opt {
    display: flex;
    align-items: center;
    height: 38px;
    box-shadow: var(--header-actions-border);
    padding-left: 10px;
    padding-right: 10px;

    .icon {
      cursor: pointer;
    }

    .refresh {
      margin-left: 10px;
    }

    .add {
      margin-left: 2px;
    }
  }

  .scrollbar {
    width: 100%;
    height: calc(100% - 38px);
    overflow: auto;
    @media (max-width: 767px) {
      height: calc(100% - 98px);
    }

    .empty {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100%;
    }

    .noLoading {
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 10px 0;
      color: var(--secondary-text-color);
    }
  }

  .btn {
    width: 100%;
    margin-top: 15px;
  }

  .item {
    background-color: var(--el-bg-color);
    border-radius: 8px;
    padding: 10px;
    margin-bottom: 11px;
    margin-left: 10px;
    margin-right: 10px;
    cursor: pointer;

    .account {
      font-weight: 400;
      font-size: 15px;
      margin-bottom: 20px;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .opt {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: #888;

      .settings {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }

      .setting-trigger {
        display: inline-flex;
        align-items: center;
        cursor: pointer;
        outline: none;
      }

      .blacklist-btn {
        font-size: 12px;
        color: var(--el-color-primary);
        cursor: pointer;
        white-space: nowrap;
        user-select: none;
      }

      .send-email {
        display: flex;
        align-items: center;
      }
    }

    :deep(.el-card__body) {
      padding: 0;
    }
  }

  .item:first-child {
    margin-top: 10px;
  }

  .item-choose {
    background: var(--choose-account-background);
  }

  .blacklist-panel {
    height: calc(100% - 38px);
    width: 100%;
    max-width: 260px;
    padding: 12px;
    overflow-x: hidden;
    overflow-y: auto;
    box-sizing: border-box;

    .blacklist-panel-head {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
    }

    .blacklist-back {
      cursor: pointer;
      flex-shrink: 0;
    }

    .blacklist-panel-title {
      font-size: 15px;
      font-weight: 600;
    }

    .blacklist-panel-email {
      font-size: 12px;
      color: var(--secondary-text-color);
      margin-bottom: 8px;
      word-break: break-all;
    }

    .blacklist-panel-desc {
      font-size: 12px;
      color: var(--secondary-text-color);
      line-height: 1.5;
      margin-bottom: 10px;
    }

    .blacklist-add-row {
      display: flex;
      gap: 6px;
      margin-bottom: 10px;
    }

    .blacklist-input {
      flex: 1;
      min-width: 0;
      height: 32px;
      padding: 0 8px;
      border: 1px solid var(--light-border);
      border-radius: 6px;
      background: var(--el-bg-color);
      color: var(--el-text-color-primary);
      font-size: 12px;
      outline: none;
      box-sizing: border-box;
    }

    .blacklist-add-btn {
      flex-shrink: 0;
      height: 32px;
      padding: 0 10px;
      border: none;
      border-radius: 6px;
      background: var(--el-color-primary);
      color: #fff;
      cursor: pointer;
      font-size: 12px;
    }

    .blacklist-tag-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 12px;
      min-height: 40px;
    }

    .blacklist-tag {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      padding: 6px 8px;
      border-radius: 6px;
      background: var(--el-bg-color);
      border: 1px solid var(--light-border);
      font-size: 12px;
      word-break: break-all;
    }

    .blacklist-tag-text {
      min-width: 0;
      flex: 1;
    }

    .blacklist-tag-remove {
      cursor: pointer;
      flex-shrink: 0;
      font-size: 16px;
      line-height: 1;
      color: var(--secondary-text-color);
    }

    .blacklist-empty {
      font-size: 12px;
      color: var(--secondary-text-color);
      padding: 8px 0;
    }

    .blacklist-save {
      width: 100%;
      height: 36px;
      border: none;
      border-radius: 6px;
      background: var(--el-color-primary);
      color: #fff;
      cursor: pointer;
      font-size: 14px;
    }

    .blacklist-save:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }
}


.setting-icon {
  position: relative;
  top: 6px;
}

:deep(.el-input-group__append) {
  padding: 0 !important;
  padding-left: 8px !important;
  background: var(--el-bg-color);
}

.select {
  position: absolute;
  right: 30px;
  width: 100px;
  opacity: 0;
  pointer-events: none;
}

:deep(.el-pagination .el-select) {
  width: 100px;
  background: var(--el-bg-color);
}

.add-email-turnstile {
  margin-top: 15px;
}

.turnstile-show {
  opacity: 1;
}

.turnstile-hide {
  opacity: 0;
  pointer-events: none;
  position: fixed;
}

</style>
