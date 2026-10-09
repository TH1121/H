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
let pendingNodes = []

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

  while (shadowRoot.firstChild) {
    shadowRoot.removeChild(shadowRoot.firstChild)
  }

  const baseStyle = document.createElement('style')
  baseStyle.setAttribute('data-base', '1')
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

  pendingNodes = []
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

  if (childWidth > parentWidth * 1.15) {
    const scale = Math.max(0.55, parentWidth / childWidth)
    hostElement.style.zoom = String(scale)
  }
}

function collectTexts() {
  pendingNodes = []
  const root = shadowRoot?.querySelector('.shadow-content')
  if (!root) return []

  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if ((node.textContent || '').trim()) {
        pendingNodes.push(node)
      }
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const tag = (node.tagName || '').toUpperCase()
    if (['STYLE', 'SCRIPT', 'NOSCRIPT', 'TEXTAREA', 'CODE'].includes(tag)) return
    const style = `${node.getAttribute?.('style') || ''}`.toLowerCase()
    if (/display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0|font-size\s*:\s*0/.test(style)) return
    Array.from(node.childNodes || []).forEach(walk)
  }
  walk(root)
  // 提交去空白后的文本，保留节点引用以便写回时恢复首尾空白
  return pendingNodes.map((node) => (node.textContent || '').trim())
}

function applyTexts(list) {
  let changed = 0
  const translations = Array.isArray(list) ? list : []
  pendingNodes.forEach((node, index) => {
    const next = translations[index]
    if (typeof next !== 'string') return
    const raw = node.textContent || ''
    const trimmedNext = next.trim()
    if (!trimmedNext || trimmedNext === raw.trim()) return
    const leading = raw.match(/^\s*/)?.[0] || ''
    const trailing = raw.match(/\s*$/)?.[0] || ''
    node.textContent = leading + trimmedNext + trailing
    changed += 1
  })
  return changed
}

function exportHtml() {
  if (!shadowRoot) return ''
  const styles = Array.from(shadowRoot.querySelectorAll('style'))
    .filter((el) => el.getAttribute('data-base') !== '1')
    .map((el) => `<style>${el.textContent || ''}</style>`)
    .join('')
  const content = shadowRoot.querySelector('.shadow-content')?.innerHTML || ''
  return `${styles}${content}`
}

function getPlainText() {
  return shadowRoot?.querySelector('.shadow-content')?.innerText || ''
}

defineExpose({
  collectTexts,
  applyTexts,
  exportHtml,
  getPlainText,
})

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
