<template>
  <emailScroll ref="sendScroll"
               :cancel-success="cancelStar"
               :star-success="addStar"
               :getEmailList="getEmailList"
               :emailDelete="emailDelete"
               :star-add="starAdd"
               show-status
               show-quick-actions
               actionLeft="4px"
               :star-cancel="starCancel"
               @jump="jumpContent"
               :time-sort="params.timeSort"
               :type="'send'"
  >
    <template #first>
      <emailFilter
          mode="send"
          v-model:address="params.address"
          v-model:date-range="dateRange"
          v-model:status="params.opened"
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
import {emailList, emailDelete} from "@/request/email.js";
import {starAdd, starCancel} from "@/request/star.js";
import {defineOptions, onMounted, reactive, ref, watch} from "vue";
import router from "@/router/index.js";
import {Icon} from "@iconify/vue";
import {toUtc} from "@/utils/day.js";

defineOptions({
  name: 'send'
})

const emailStore = useEmailStore();
const accountStore = useAccountStore();
const sendScroll = ref({})
const dateRange = ref(null)
const params = reactive({
  timeSort: 0,
  address: '',
  opened: '',
  startTime: '',
  endTime: '',
})

onMounted(() => {
  emailStore.sendScroll = sendScroll;
})

watch(() => accountStore.currentAccountId, () => {
  sendScroll.value.refreshList();
})

function buildFilters() {
  const filters = {}
  if (params.address?.trim()) filters.address = params.address.trim()
  if (params.startTime) filters.startTime = params.startTime
  if (params.endTime) filters.endTime = params.endTime
  if (params.opened === '0' || params.opened === '1') filters.opened = params.opened
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
  sendScroll.value.refreshList();
}

function changeTimeSort() {
  params.timeSort = params.timeSort ? 0 : 1
  sendScroll.value.refreshList();
}

function jumpContent(email) {
  emailStore.contentData.email = emailStore.toContentEmail(email)
  emailStore.contentData.delType = 'logic'
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
  const accountId =  accountStore.currentAccountId;
  const allReceive = accountStore.currentAccount.allReceive;
  return emailStore.fetchList(full =>
    emailList(accountId, allReceive, emailId, params.timeSort, size, 1, full, buildFilters())
  ).then(data => {
    data.latestEmail.reqAccountId = accountId;
    data.latestEmail.allReceive = allReceive;
    return data;
  })
}

</script>

<style scoped>
.icon {
  cursor: pointer;
}
</style>
