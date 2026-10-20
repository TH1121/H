<template>
  <div class="main-wrap" :class="{ 'has-account': accountVisible }">
    <aside v-if="accountVisible" class="account-pane">
      <account />
    </aside>
    <section class="content-pane">
      <router-view v-slot="{ Component, route }">
        <keep-alive :include="['email','all-email','send','sys-setting','star','spam','user','role','analysis','reg-key','draft','setting']">
          <component :is="Component" :key="route.name"/>
        </keep-alive>
      </router-view>
    </section>
    <Teleport to="body">
      <div
          v-if="accountVisible && isMobile"
          class="account-mask"
          @click="uiStore.accountShow = false"
      ></div>
    </Teleport>
  </div>
</template>
<script setup>
import account from '@/layout/account/index.vue'
import {useUiStore} from "@/store/ui.js";
import {useSettingStore} from "@/store/setting.js";
import {computed, onBeforeUnmount, onMounted, ref, watch} from "vue";
import { useRoute } from 'vue-router'
import { hasPerm } from "@/perm/perm.js"

const settingStore = useSettingStore()
const uiStore = useUiStore();
const route = useRoute()
const isMobile = ref(window.innerWidth <= 767)
let innerWidth = window.innerWidth

let elNotification = null

const accountVisible = computed(() => {
  const settings = settingStore.settings || {}
  return !!(uiStore.accountShow && settings.manyEmail === 0 && hasPerm('account:query'))
})

watch(() => uiStore.changeNotice, () => {
  const settings = settingStore.settings || {}
  showNotice({
    notice: settings.notice,
    noticeWidth: settings.noticeWidth,
    noticeTitle: settings.noticeTitle,
    noticeContent: settings.noticeContent,
    noticeType: settings.noticeType,
    noticeDuration: settings.noticeDuration,
    noticePosition: settings.noticePosition,
    noticeOffset: settings.noticeOffset
  })
})

watch(() => uiStore.changePreview, () => {
  showNotice(uiStore.previewData)
})

function showNotice(data) {
  if (!data || data.notice === 1) {
    return;
  }

  if (elNotification) {
    elNotification.close()
  }

  const style = document.createElement('style');
  style.innerHTML = `
  .custom-notice.el-notification {
    --el-notification-width: min(${data.noticeWidth}px,calc(100% - 30px)) !important;
  }
  `;

  document.head.appendChild(style);

  elNotification = ElNotification({
    title: data.noticeTitle,
    message: `<div style="width: 100%;height: 100%;">${data.noticeContent || ''}</div>`,
    type: data.noticeType === 'none' ? '' : data.noticeType,
    duration: data.noticeDuration,
    position: data.noticePosition,
    offset: data.noticeOffset,
    dangerouslyUseHTMLString: true,
    customClass: 'custom-notice'
  })
}

onMounted(() => {
  window.addEventListener('resize', handleResize)
  handleResize()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
})

const handleResize = () => {
  isMobile.value = window.innerWidth <= 767
  if (['content','email','send','spam'].includes(route.meta.name)) {
    if (innerWidth !== window.innerWidth) {
      innerWidth = window.innerWidth;
      uiStore.accountShow = window.innerWidth >= 767;
    }
  }
}

</script>
<style lang="scss" scoped>
.main-wrap {
  display: flex;
  flex: 1;
  width: 100%;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  background: var(--surface-color);
}

.account-pane {
  flex: 0 0 260px;
  width: 260px;
  max-width: 260px;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  z-index: 20;

  @media (max-width: 767px) {
    position: fixed;
    left: 0;
    top: 60px;
    bottom: 0;
    height: auto;
    z-index: 1001;
    background: var(--surface-color);
  }
}

.content-pane {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: auto;
  background: var(--surface-color);
}

.has-account {
  @media (max-width: 767px) {
    .content-pane {
      flex: 1 1 auto;
    }
  }
}
</style>

<style lang="scss">
.account-mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 60px;
  bottom: 0;
  background: #000000;
  opacity: 0.6;
  z-index: 1000;
}
</style>
