<template>
  <el-input
      v-model="address"
      :placeholder="addressPlaceholder"
      class="filter-input"
      clearable
      @clear="emitSearch"
      @keyup.enter="emitSearch"
  />
  <el-date-picker
      v-model="dateRange"
      class="filter-date"
      type="daterange"
      unlink-panels
      :teleported="true"
      :range-separator="$t('to')"
      :start-placeholder="$t('startDate')"
      :end-placeholder="$t('endDate')"
      size="default"
      @change="emitSearch"
  />
  <el-select
      v-model="status"
      class="filter-status"
      :placeholder="$t('all')"
      @change="emitSearch"
  >
    <el-option :label="$t('all')" value=""/>
    <template v-if="mode === 'send'">
      <el-option :label="$t('mailUnopened')" value="0"/>
      <el-option :label="$t('mailOpened')" value="1"/>
    </template>
    <template v-else>
      <el-option :label="$t('unreadMail')" value="0"/>
      <el-option :label="$t('readMail')" value="1"/>
    </template>
  </el-select>
  <Icon class="icon" icon="iconoir:search" width="20" height="20" @click="emitSearch"/>
</template>

<script setup>
import {computed} from 'vue'
import {Icon} from '@iconify/vue'
import {useI18n} from 'vue-i18n'

const props = defineProps({
  mode: {
    type: String,
    default: 'receive', // receive | send | all
  },
  address: {type: String, default: ''},
  dateRange: {type: [Array, String, null], default: null},
  status: {type: [String, Number], default: ''},
})

const emit = defineEmits(['update:address', 'update:dateRange', 'update:status', 'search'])

const {t} = useI18n()

const addressPlaceholder = computed(() => {
  if (props.mode === 'send') return t('filterByToEmail')
  if (props.mode === 'all') return t('filterByEmail')
  return t('filterByFromEmail')
})

const address = computed({
  get: () => props.address,
  set: (v) => emit('update:address', v ?? ''),
})

const dateRange = computed({
  get: () => props.dateRange,
  set: (v) => emit('update:dateRange', v),
})

const status = computed({
  get: () => props.status === null || props.status === undefined ? '' : String(props.status),
  set: (v) => emit('update:status', v ?? ''),
})

function emitSearch() {
  emit('search')
}
</script>

<style scoped lang="scss">
.filter-input {
  width: 100%;
  max-width: 200px;
  height: 28px;
}

.filter-date {
  width: 240px;
  max-width: 100%;

  :deep(.el-range-input) {
    font-size: 12px;
  }

  :deep(.el-range-separator) {
    flex: 0;
    padding: 0 4px;
  }
}

.filter-status {
  width: 110px;
  margin-bottom: 2px;

  :deep(.el-select__wrapper) {
    min-height: 28px;
    padding: 2px 10px;
  }
}

.icon {
  cursor: pointer;
}

@media (max-width: 767px) {
  .filter-input {
    max-width: 160px;
  }

  .filter-date {
    width: 200px;
  }

  .filter-status {
    width: 96px;
  }
}
</style>
