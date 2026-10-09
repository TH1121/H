<template>
  <div class="content-box" ref="contentBox">
    <div ref="container" class="content-html"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, nextTick } from 'vue'

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
  if (!shadowRoot) return

  const raw = String(props.html || '')
  const bodyStyleMatch = raw.match(/<body[^>]*style=["']([^"']*)["'][^>]*>/i)
  const bodyStyle = bodyStyleMatch ? bodyStyleMatch[1] : ''

  const emailStyleTexts = []
  let cleanedHtml = raw
    .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (_, css) => {
      emailStyleTexts.push(css)
      return ''
    })
    .replace(/<\/?(?:html|head|body)[^>]*>/gi, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')

  // 用 DOM API 挂载，避免模板字符串把邮件 HTML/CSS 解析坏导致空白
  while (shadowRoot.firstChild) {
    shadowRoot.removeChild(shadowRoot.firstChild)
  }

  const baseStyle = document.createElement('style')
  baseStyle.textContent = `
    :host {
      display: block;
      width: 100%;
      word-break: break-word;
    }
    .shadow-content {
      background: #FFFFFF;
      width: 100%;
      max-width: 100%;
      overflow-x: auto;
    }
    .shadow-content img {
      max-width: 100%;
      height: auto;
    }
  `
  shadowRoot.appendChild(baseStyle)

  for (const css of emailStyleTexts) {
    const styleEl = document.createElement('style')
    styleEl.textContent = css
    shadowRoot.appendChild(styleEl)
  }

  const wrap = document.createElement('div')
  wrap.className = 'shadow-content'
  if (bodyStyle) {
    wrap.setAttribute('style', bodyStyle)
  }
  wrap.innerHTML = cleanedHtml
  shadowRoot.appendChild(wrap)

  // 重置缩放，避免上次 zoom 把内容缩成“看不见”
  if (shadowRoot.host) {
    shadowRoot.host.style.zoom = '1'
  }
}

function autoScale() {
  if (!shadowRoot || !contentBox.value) return

  const hostElement = shadowRoot.host
  const shadowContent = shadowRoot.querySelector('.shadow-content')
  if (!hostElement || !shadowContent) return

  hostElement.style.zoom = '1'

  const parentWidth = contentBox.value.offsetWidth
  const childWidth = shadowContent.scrollWidth
  if (!parentWidth || !childWidth) return

  // 仅轻度缩小过宽邮件，避免缩到接近 0 变成空白
  if (childWidth > parentWidth * 1.15) {
    const scale = Math.max(0.55, parentWidth / childWidth)
    hostElement.style.zoom = String(scale)
  }
}

onMounted(async () => {
  shadowRoot = container.value.attachShadow({ mode: 'open' })
  updateContent()
  await nextTick()
  autoScale()
})

watch(() => props.html, async () => {
  updateContent()
  await nextTick()
  autoScale()
})
</script>

<style scoped>
.content-box {
  width: 100%;
  min-height: 120px;
  overflow: auto;
}

.content-html {
  width: 100%;
}
</style>
