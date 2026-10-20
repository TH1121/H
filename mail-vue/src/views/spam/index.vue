<template>
  <emailScroll ref="scroll"
               :cancel-success="cancelStar"
               :star-success="addStar"
               :getEmailList="getEmailList"
               :emailDelete="emailDelete"
               :star-add="starAdd"
               :star-cancel="starCancel"
               :time-sort="params.timeSort"
               :email-read="emailRead"
               :show-unread="true"
               actionLeft="4px"
               @jump="jumpContent"
  >
    <template #first>
      <emailFilter
          mode="receive"
          v-model:address="params.address"
          v-model:date-range="dateRange"
          v-model:status="params.unread"
          @search="applyFilter"
      />
      <Icon class="icon" @click="changeTimeSort" icon="material-symbols-light:timer-arrow-down-outline"
            v-if="params.timeSort === 0" width="28" height="28"/>
      <Icon class="icon" @click="changeTimeSort" icon="material-symbols-light:timer-arrow-up-outline" v-else
            width="28" height="28"/>
    </template>

  </emailScroll>
</template>

<script setup>
import {useAccountStore} from "@/store/account.js";
import {useEmailStore} from "@/store/email.js";
import emailScroll from "@/components/email-scroll/index.vue"
import emailFilter from "@/components/email-filter/index.vue"
import {emailList, emailDelete, emailRead} from "@/request/email.js";
import {starAdd, starCancel} from "@/request/star.js";
import {defineOptions, onMounted, reactive, ref, watch} from "vue";
import router from "@/router/index.js";
import {Icon} from "@iconify/vue";
import {toUtc} from "@/utils/day.js";

defineOptions({
  name: 'spam'
})

const emailStore = useEmailStore();
const accountStore = useAccountStore();
const scroll = ref({})
const dateRange = ref(null)
const params = reactive({
  timeSort: 0,
  address: '',
  unread: '',
  startTime: '',
  endTime: '',
})

onMounted(() => {
  emailStore.spamScroll = scroll;
})

watch(() => accountStore.currentAccountId, () => {
  scroll.value.refreshList();
})

function buildFilters() {
  const filters = { spam: 1 }
  if (params.address?.trim()) filters.address = params.address.trim()
  if (params.startTime) filters.startTime = params.startTime
  if (params.endTime) filters.endTime = params.endTime
  if (params.unread === '0' || params.unread === '1') filters.unread = params.unread
  return filters
}

function syncDateRangeToParams() {
  if (dateRange.value?.length === 2) {
    params.startTime = toUtc(dateRange.value[0]).format("YYYY-MM-DD HH:mm:ss")
    params.endTime = toUtc(dateRange.value[1]).add(1, 'day').format("YYYY-MM-DD HH:mm:ss")
  } else {
    params.startTime = ''
    params.endTime = ''
  }
}

function applyFilter() {
  syncDateRangeToParams()
  scroll.value.refreshList();
}

function changeTimeSort() {
  params.timeSort = params.timeSort ? 0 : 1
  scroll.value.refreshList();
}

function jumpContent(email) {
  emailStore.contentData.email = emailStore.toContentEmail(email)
  emailStore.contentData.delType = 'logic'
  emailStore.contentData.showUnread = true
  emailStore.contentData.showStar = true
  emailStore.contentData.showReply = true
  router.push('/mail')
}

function addStar(email) {
  emailStore.starScroll?.addItem(email)
}

function cancelStar(email) {
  emailStore.starScroll?.deleteEmail([email.emailId])
}

function getEmailList(emailId, size) {
  syncDateRangeToParams()
  const accountId = accountStore.currentAccountId;
  const allReceive = accountStore.currentAccount.allReceive;
  return emailStore.fetchList(full =>
    emailList(accountId, allReceive, emailId, params.timeSort, size, 0, full, buildFilters())
  )
}

</script>
<style>
.icon {
  cursor: pointer;
}
</style>
