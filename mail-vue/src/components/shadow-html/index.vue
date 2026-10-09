<template>
  <div class="content-box" ref="contentBox">
    <div ref="container" class="content-html"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'

const props = defineProps({
  html: {
    type: String,
    required: true
  }
})

const container = ref(null)
const contentBox = ref(null)
let shadowRoot = null

function updateContent() {
  if (!shadowRoot) return;

  const bodyStyleMatch = props.html.match(/<body[^>]*style="([^"]*)"[^>]*>/i);
  const bodyStyle = bodyStyleMatch ? bodyStyleMatch[1] : '';

  const emailStyles = [];
  let cleanedHtml = String(props.html || '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, (block) => {
      emailStyles.push(block);
      return '';
    })
    .replace(/<\/?(?:html|head|body)[^>]*>/gi, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '');

  // 不覆盖邮件自身样式：只做基础隔离，保留原信 table/inline style 版式
  shadowRoot.innerHTML = `
    <style>
      :host {
        display: block;
        width: 100%;
        height: 100%;
        word-break: break-word;
      }

      .shadow-content {
        background: #FFFFFF;
        width: fit-content;
        height: fit-content;
        min-width: 100%;
        ${bodyStyle || ''}
      }

      .shadow-content img {
        max-width: 100%;
        height: auto;
      }
    </style>
    ${emailStyles.join('\n')}
    <div class="shadow-content">
      ${cleanedHtml}
    </div>
  `;
}

function autoScale() {
  if (!shadowRoot || !contentBox.value) return

  const parent = contentBox.value
  const shadowContent = shadowRoot.querySelector('.shadow-content')

  if (!shadowContent) return

  const parentWidth = parent.offsetWidth
  const childWidth = shadowContent.scrollWidth

  if (childWidth === 0) return

  const scale = Math.min(1, parentWidth / childWidth)

  const hostElement = shadowRoot.host
  hostElement.style.zoom = scale
}

onMounted(() => {
  shadowRoot = container.value.attachShadow({ mode: 'open' })
  updateContent()
  autoScale()
})

watch(() => props.html, () => {
  updateContent()
  autoScale()
})
</script>

<style scoped>
.content-box {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.content-html {
  width: 100%;
  height: 100%;
}
</style>
