<template>
  <div class="box">
    <div class="header-actions">
      <Icon class="icon" icon="material-symbols-light:arrow-back-ios-new" width="20" height="20" @click="handleBack"/>
      <Icon v-perm="'email:delete'" class="icon" icon="uiw:delete" width="16" height="16" @click="handleDelete"/>
      <span class="star" v-if="emailStore.contentData.showStar">
        <Icon class="icon" @click="changeStar" v-if="email.isStar" icon="fluent-color:star-16" width="20" height="20"/>
        <Icon class="icon" @click="changeStar" v-else icon="solar:star-line-duotone" width="18" height="18"/>
      </span>
      <Icon class="icon" v-if="emailStore.contentData.showReply" v-perm="'email:send'"  @click="openReply" icon="la:reply" width="21" height="21" />
      <Icon class="icon" v-if="emailStore.contentData.showReply" v-perm="'email:send'"  @click="openForward" icon="iconoir:arrow-up-right" width="20" height="20" />
    </div>
    <div></div>
    <el-scrollbar class="scrollbar">
      <div class="container">
        <div class="email-title">
          {{ displaySubject }}
        </div>
        <div class="content">
          <div class="email-info">
            <div>
              <div class="send"><span class="send-source">{{$t('from')}}</span>
                <div class="send-name">
                  <span class="send-name-title">{{ email.name }}</span>
                  <span><{{ email.sendEmail }}></span>
                </div>
              </div>
              <div class="receive"><span class="source">{{$t('recipient')}}</span><span class="receive-email">{{  formateReceive(email.recipient) }}</span></div>
              <div class="date">
                <div>{{ formatDetailDate(email.createTime) }}</div>
              </div>
            </div>
            <el-alert v-if="email.status === 3" :closable="false" :title="toMessage(email.message)" class="email-msg" type="error" show-icon />
            <el-alert v-if="email.status === 4" :closable="false" :title="$t('complained')" class="email-msg" type="warning" show-icon />
            <el-alert v-if="email.status === 5" :closable="false" :title="$t('delayed')" class="email-msg" type="warning" show-icon />
          </div>
          <div class="translate-banner" v-if="showTranslateBanner">
            <Icon class="translate-icon" icon="material-symbols:translate-rounded" width="20" height="20"/>
            <div class="translate-copy">
              <div class="translate-title">{{ translateHint }}</div>
              <button class="translate-action" type="button" :disabled="translating" @click="onTranslateAction">
                {{ translating ? $t('translating') : translateAction }}
              </button>
            </div>
            <button class="translate-close" type="button" :aria-label="$t('cancel')" @click="dismissTranslate">
              <Icon icon="material-symbols:close-rounded" width="18" height="18"/>
            </button>
          </div>
          <el-scrollbar class="htm-scrollbar" :class="!email.attList?.length ? 'bottom-distance' : ''">
            <ShadowHtml class="shadow-html" :html="formatImage(displayContent)" v-if="displayContent" />
            <pre v-else class="email-text" >{{displayText}}</pre>
          </el-scrollbar>
          <div class="att" v-if="email.attList?.length > 0">
            <div class="att-title">
              <span>{{$t('attachments')}}</span>
              <span>{{$t('attCount',{total: email.attList.length})}}</span>
            </div>
            <div class="att-box">

              <div class="att-item" v-for="att in email.attList" :key="att.attId">
                <div class="att-icon" @click="showImage(att.key)">
                  <Icon v-bind="getIconByName(att.filename)" />
                </div>
                <div class="att-name" @click="showImage(att.key)">
                  {{ att.filename }}
                </div>
                <div class="att-size">{{ formatBytes(att.size) }}</div>
                <div class="opt-icon att-icon">
                  <Icon v-if="isImage(att.filename)" icon="hugeicons:view" width="22" height="22" @click="showImage(att.key)"/>
                  <a :href="cvtR2Url(att.key)" download>
                    <Icon icon="system-uicons:push-down" width="22" height="22"/>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </el-scrollbar>
    <el-image-viewer
        v-if="showPreview"
        :url-list="srcList"
        show-progress
        @close="showPreview = false"
    />
  </div>
</template>
<script setup>
import ShadowHtml from '@/components/shadow-html/index.vue'
import {computed, reactive, ref, watch, onMounted, onUnmounted} from "vue";
import {useRouter} from 'vue-router'
import {ElMessage, ElMessageBox} from 'element-plus'
import {emailDelete, emailRead, emailTranslate} from "@/request/email.js";
import {Icon} from "@iconify/vue";
import {useEmailStore} from "@/store/email.js";
import {useAccountStore} from "@/store/account.js";
import {formatDetailDate} from "@/utils/day.js";
import {starAdd, starCancel} from "@/request/star.js";
import {getExtName, formatBytes} from "@/utils/file-utils.js";
import {cvtR2Url,toOssDomain} from "@/utils/convert.js";
import {getIconByName} from "@/utils/icon-utils.js";
import {useSettingStore} from "@/store/setting.js";
import {allEmailDelete} from "@/request/all-email.js";
import {useUiStore} from "@/store/ui.js";
import {useI18n} from "vue-i18n";
import {EmailUnreadEnum} from "@/enums/email-enum.js";
import {detectEmailLang, uiLang} from "@/utils/detect-lang.js";

const uiStore = useUiStore();
const settingStore = useSettingStore();
const accountStore = useAccountStore();
const emailStore = useEmailStore();
const router = useRouter()
const email = computed(() => emailStore.contentData.email || {
  emailId: 0,
  attList: [],
  content: '',
  text: '',
  recipient: '[]',
})
const showPreview = ref(false)
const srcList = reactive([])
const translating = ref(false)
const showTranslated = ref(false)
const translated = ref(null)
const bannerDismissed = ref(false)
const sourceLang = ref('')

const { t, locale } = useI18n()
const targetLang = computed(() => uiLang(locale.value))

const displaySubject = computed(() => {
  if (showTranslated.value && translated.value?.subject) return translated.value.subject
  return email.value.subject
})

function visibleTextLength(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, '')
    .length
}

const displayContent = computed(() => {
  if (showTranslated.value && translated.value) {
    const html = translated.value.content || ''
    const original = email.value.content || ''
    // 译文 HTML 几乎没有可见文字时，回退原文，避免整页空白
    if (html && visibleTextLength(html) >= 20) return html
    if (html && original && visibleTextLength(html) >= visibleTextLength(original) * 0.3) return html
    const text = translated.value.text || ''
    if (text) {
      return `<div style="white-space:pre-wrap;word-break:break-word;line-height:1.7">${escapeHtml(text)}</div>`
    }
    return original
  }
  return email.value.content || ''
})

const displayText = computed(() => {
  if (showTranslated.value && translated.value) {
    return translated.value.text || ''
  }
  return email.value.text || ''
})

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const langName = (code) => {
  const map = {
    zh: t('langNameZh'),
    en: t('langNameEn'),
    ja: t('langNameJa'),
    ko: t('langNameKo'),
  }
  return map[code] || code
}

const showTranslateBanner = computed(() => {
  if (bannerDismissed.value) return false
  if (translated.value) return true
  return !!sourceLang.value && sourceLang.value !== targetLang.value
})

const translateHint = computed(() => {
  if (showTranslated.value && translated.value) {
    return t('translatedToLang', { lang: langName(translated.value.targetLang || targetLang.value) })
  }
  if (sourceLang.value) {
    return t('emailSeemsInLang', { lang: langName(sourceLang.value) })
  }
  return t('emailSeemsInLang', { lang: langName('en') })
})

const translateAction = computed(() => {
  if (translated.value && showTranslated.value) return t('showOriginal')
  if (translated.value && !showTranslated.value) return t('showTranslation')
  return t('translateToLang', { lang: langName(targetLang.value) })
})

watch(() => accountStore.currentAccountId, () => {
  handleBack()
})

watch(() => email.value?.emailId, () => {
  translated.value = null
  showTranslated.value = false
  translating.value = false
  bannerDismissed.value = false
  sourceLang.value = ''
})

watch(
  () => [email.value?.emailId, email.value?.subject, email.value?.text, email.value?.content, targetLang.value],
  () => {
    if (translated.value) return
    const sample = [email.value?.subject, email.value?.text, email.value?.content]
      .filter(Boolean)
      .join('\n')
    const detected = detectEmailLang(sample)
    sourceLang.value = detected && detected !== targetLang.value ? detected : ''
  },
  { immediate: true }
)

let readRequesting = false

function tryMarkRead() {
  if (!emailStore.contentData.showUnread || readRequesting) return
  const current = email.value
  if (!current?.emailId || current.unread !== EmailUnreadEnum.UNREAD) return

  // 等详情数据就绪（detailMap 已写入，或正文已有内容）再标已读
  const full = emailStore.detailMap[current.emailId]
  const detailReady = !!full || !!(current.content || current.text)
  if (!detailReady) return

  readRequesting = true
  const emailId = current.emailId
  current.unread = EmailUnreadEnum.READ
  if (emailStore.detailMap[emailId]) {
    emailStore.detailMap[emailId].unread = EmailUnreadEnum.READ
  }
  emailStore.markListRead(emailId)
  emailRead([emailId]).finally(() => {
    readRequesting = false
  })
}

watch(
  () => [
    email.value?.emailId,
    email.value?.content,
    email.value?.text,
    emailStore.detailMap[email.value?.emailId]
  ],
  () => tryMarkRead(),
  { flush: 'post' }
)

onMounted(() => {
  tryMarkRead()
  window.addEventListener('keydown', handleKeyDown);
})

onUnmounted(() => {
  emailStore.contentData.showUnread = false;
  readRequesting = false
  window.removeEventListener('keydown', handleKeyDown);
})

function handleKeyDown(event) {
  if (event.key !== 'Escape') return;
  if (showPreview.value) return;
  if (document.querySelector('.el-message-box')) return;
  const writeBox = document.querySelector('.write-box');
  if (writeBox && writeBox.offsetParent !== null) return;
  handleBack();
}

function openReply() {
  uiStore.writerRef.openReply(email.value)
}

function openForward() {
  uiStore.writerRef.openForward(email.value)
}

function dismissTranslate() {
  bannerDismissed.value = true
  if (translated.value) {
    showTranslated.value = false
  }
}

async function onTranslateAction() {
  if (translating.value) return
  if (translated.value) {
    showTranslated.value = !showTranslated.value
    return
  }
  await handleTranslate(targetLang.value)
}

async function handleTranslate(lang) {
  if (translating.value || !email.value?.emailId) return

  translating.value = true
  try {
    const data = await emailTranslate({
      subject: email.value.subject || '',
      content: email.value.content || '',
      text: email.value.text || '',
      targetLang: lang || targetLang.value,
      sourceLang: sourceLang.value || 'en',
    })
    if (!data?.content && !data?.text && !data?.subject) {
      throw new Error('empty translation')
    }
    translated.value = data
    showTranslated.value = true
  } catch (e) {
    console.error(e)
    ElMessage({
      message: t('reqFailErrorMsg'),
      type: 'error',
      plain: true,
    })
  } finally {
    translating.value = false
  }
}

function toMessage(message) {
  return  message ? JSON.parse(message).message : '';
}

function formatImage(content) {
  content = content || '';
  const domain = settingStore.settings.r2Domain;
  return  content.replace(/{{domain}}/g, toOssDomain(domain) + '/');
}

function showImage(key) {
  if (!isImage(key)) return;
  const url = cvtR2Url(key)
  srcList.length = 0
  srcList.push(url)
  showPreview.value = true
}

function isImage(filename) {
  return ['png', 'jpg', 'jpeg', 'bmp', 'gif','jfif'].includes(getExtName(filename))
}

function formateReceive(recipient) {
  if (!recipient) return ''
  recipient = JSON.parse(recipient)
  return recipient.map(item => item.address).join(', ')
}

function changeStar() {
  if (email.value.isStar) {
    email.value.isStar = 0;
    starCancel(email.value.emailId).then(() => {
      email.value.isStar = 0;
      emailStore.cancelStarEmailId = email.value.emailId
      setTimeout(() => emailStore.cancelStarEmailId = 0)
      emailStore.starScroll?.deleteEmail([email.value.emailId])
    }).catch((e) => {
      console.error(e)
      email.value.isStar = 1;
    })
  } else {
    email.value.isStar = 1;
    starAdd(email.value.emailId).then(() => {
      email.value.isStar = 1;
      emailStore.addStarEmailId = email.value.emailId
      setTimeout(() => emailStore.addStarEmailId = 0)
      emailStore.starScroll?.addItem(email.value)
    }).catch((e) => {
      console.error(e)
      email.value.isStar = 0;
    })
  }
}

const handleBack = () => {
  router.back()
}

const handleDelete = () => {
  ElMessageBox.confirm(t('delEmailConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    if (emailStore.contentData.delType === 'logic') {
      emailDelete(email.value.emailId).then(() => {
        ElMessage({
          message: t('delSuccessMsg'),
          type: 'success',
          plain: true,
        })
        emailStore.deleteIds = [email.value.emailId]
      })
    } else  {

      allEmailDelete(email.value.emailId).then(() => {
        ElMessage({
          message: t('delSuccessMsg'),
          type: 'success',
          plain: true,
        })
        emailStore.deleteIds = [email.value.emailId]
      })
    }

    router.back()
  })
}
</script>
<style scoped lang="scss">
.box {
  height: 100%;
  overflow: hidden;
}

.header-actions {
  padding: 10px 16px;
  display: flex;
  align-items: center;
  gap: 20px;
  background: color-mix(in srgb, var(--surface-color) 94%, var(--tech-accent) 6%);
  box-shadow: inset 0 -1px 0 0 var(--light-border), inset 0 -1px 0 0 rgba(6, 182, 212, 0.08);
  font-size: 18px;
  .star {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 21px;
  }
  .icon {
    cursor: pointer;
    transition: color 0.15s ease, filter 0.15s ease;

    &:hover {
      color: var(--tech-accent);
      filter: drop-shadow(0 0 6px rgba(34, 211, 238, 0.4));
    }
  }
}


.scrollbar {
  height: calc(100% - 38px);
  width: 100%;
}

.container {
  font-size: 14px;
  padding-left: 20px;
  padding-right: 20px;
  padding-top: 10px;
  @media (max-width: 1023px) {
    padding-left: 15px;
    padding-right: 15px;
  }

  .email-title {
    font-size: 20px;
    font-weight: 700;
    letter-spacing: -0.01em;
    margin-bottom: 10px;
  }

  .htm-scrollbar {
  }

  .content {
    display: flex;
    flex-direction: column;

    .att {
      margin-top: 30px;
      margin-bottom: 30px;
      border: 1px solid var(--light-border-color);
      padding: 14px;
      border-radius: 6px;
      width: fit-content;
      .att-box {
        min-width: min(410px,calc(100vw - 60px));
        max-width: 600px;
        display: grid;
        gap: 12px;
        grid-template-rows: 1fr;
      }

      .att-title {
        margin-bottom: 8px;
        display: flex;
        justify-content: space-between;
        span:first-child {
          font-weight: bold;
        }
      }

      .att-item {
        cursor: pointer;
        div {
          align-self: center;
        }
        background: var(--light-ill);
        padding: 5px 7px;
        border-radius: 4px;
        align-self: start;
        display: grid;
        grid-template-columns: auto 1fr auto auto;
        .att-icon {
          display: grid;
        }

        .att-size {
          color: var(--secondary-text-color);
        }

        .att-name {
          margin-left: 8px;
          margin-right: 8px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          word-break: break-all;
        }

        .att-image {
          width: 60px;
          height: 60px;
          object-fit: contain;
        }

        .opt-icon {
          padding-left: 10px;
          color: var(--secondary-text-color);
          align-items: center;
          display: flex;
          gap: 8px;
          cursor: pointer;
          a {
            color: var(--secondary-text-color);
            align-items: center;
            display: flex;
          }
        }
      }
    }

    .email-info {

      border-bottom: 1px solid var(--light-border-color);
      margin-bottom: 20px;
      padding-bottom: 8px;
      @media (max-width: 1024px) {
        margin-bottom: 15px;
      }
      .date {
        color: var(--regular-text-color);
        margin-bottom: 6px;
      }

      .email-msg {
        max-width: 400px;
        width: fit-content;
        margin-bottom: 15px;
      }

      .send {
        display: flex;
        margin-bottom: 6px;

        .send-name {
          color: var(--regular-text-color);
          display: flex;
          flex-wrap: wrap;
        }

        .send-name-title {
          padding-right: 5px;
        }
      }

      .receive {
        margin-bottom: 6px;
        display: flex;
        .receive-email {
          max-width: 700px;
          word-break: break-word;
        }
        span:nth-child(2) {
          color: var(--regular-text-color);
        }
      }

      .send-source {
        white-space: nowrap;
        font-weight: bold;
        padding-right: 10px;
      }

      .source {
        white-space: nowrap;
        font-weight: bold;
        padding-right: 10px;
      }
    }

    .translate-banner {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      max-width: 520px;
      margin: -4px 0 16px;
      padding: 12px 12px 12px 14px;
      border-radius: 12px;
      background: color-mix(in srgb, #E8F0FE 88%, var(--surface-color) 12%);
      color: var(--el-text-color-primary);
      box-shadow: inset 0 0 0 1px color-mix(in srgb, #1A73E8 12%, transparent);

      .translate-icon {
        flex: none;
        margin-top: 1px;
        color: #1A73E8;
      }

      .translate-copy {
        min-width: 0;
        flex: 1;
      }

      .translate-title {
        font-size: 14px;
        line-height: 1.45;
        color: var(--el-text-color-primary);
      }

      .translate-action {
        margin-top: 4px;
        padding: 0;
        border: 0;
        background: none;
        color: #1A73E8;
        font-size: 14px;
        line-height: 1.4;
        cursor: pointer;

        &:hover:not(:disabled) {
          text-decoration: underline;
        }

        &:disabled {
          cursor: default;
          opacity: 0.7;
        }
      }

      .translate-close {
        flex: none;
        display: grid;
        place-items: center;
        width: 28px;
        height: 28px;
        margin-top: -4px;
        margin-right: -4px;
        border: 0;
        border-radius: 50%;
        background: transparent;
        color: var(--secondary-text-color, #5f6368);
        cursor: pointer;

        &:hover {
          background: color-mix(in srgb, #1A73E8 8%, transparent);
        }
      }
    }
  }
}

.shadow-html::after  {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--message-block-color); /* 半透明黑色蒙层 */
  pointer-events: none; /* 不影响点击 */
}

.email-text {
  font-family: inherit;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}

.bottom-distance {
  margin-bottom: 30px;
}


</style>
