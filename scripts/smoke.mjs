// headless Chrome 冒烟测试：通过 CDP 真实加载应用，验证核心流程与浏览器侧异常
// 用法：node scripts/smoke.mjs
const base = 'http://127.0.0.1:4173/'

const httpGet = async (url) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`CDP HTTP ${res.status} ${url}`)
  return res.json()
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const main = async () => {
  const targets = await httpGet('http://127.0.0.1:9222/json/list')
  const page = targets.find((t) => t.type === 'page')
  if (!page) throw new Error('未找到 CDP page target')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((r, j) => {
    ws.onopen = r
    ws.onerror = j
  })

  let msgId = 0
  const pending = new Map()
  const events = []
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
    } else if (msg.method) {
      events.push(msg)
    }
  }
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++msgId
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })

  await send('Runtime.enable')
  await send('Log.enable')
  await send('Page.enable')
  await send('Page.navigate', { url: base })

  const evalJs = async (expression) => {
    const r = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    if (r.exceptionDetails) {
      throw new Error('页面异常: ' + JSON.stringify(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text))
    }
    return r.result.value
  }
  const poll = async (fn, timeout = 15000, interval = 300) => {
    const deadline = Date.now() + timeout
    let lastErr
    while (Date.now() < deadline) {
      try {
        const v = await fn()
        if (v) return v
      } catch (e) {
        lastErr = e
      }
      await sleep(interval)
    }
    throw new Error('轮询超时: ' + (lastErr?.message ?? '条件未达成'))
  }

  const results = []
  const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail })
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
  }

  try {
    // 1. 应用挂载
    await poll(async () => {
      const brand = await evalJs(`document.querySelector('.brand-name')?.textContent`)
      return brand === '展陈排版工坊'
    })
    check('Vue 应用挂载与导航渲染', true)

    // 2. WebGPU 能力探测
    const gpuAvailable = await evalJs(`!!navigator.gpu`)
    check('浏览器暴露 navigator.gpu', gpuAvailable, gpuAvailable ? 'WebGPU 可用' : '该 headless 环境无 GPU，走优雅降级提示')

    // 3. 生成 200 板演示展览
    await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('生成演示展览'))?.click()`)
    await poll(async () => {
      const meta = await evalJs(`document.querySelector('.project-meta')?.textContent ?? ''`)
      return meta.includes('展板 200')
    }, 20000)
    const counts = await evalJs(`document.querySelector('.project-meta')?.textContent`)
    check('生成 200 块展板演示数据', true, counts.replace(/\s+/g, ' ').trim())

    // 4. 展厅平面页
    await evalJs(`location.hash = '#/floor'`)
    await poll(async () => evalJs(`document.querySelectorAll('.panel-dot').length > 0`), 10000)
    const dots = await evalJs(`document.querySelectorAll('.panel-dot').length`)
    const vpDots = await evalJs(`document.querySelectorAll('.vp-dot').length`)
    check('展厅平面：展板挂载点与动线站位渲染', dots > 0 && vpDots > 0, `展板点 ${dots}，站位点 ${vpDots}`)

    // 5. 排版页（WebGPU 距离场）
    await evalJs(`location.hash = '#/layout'`)
    await poll(async () => evalJs(`document.querySelector('.sdf-canvas') !== null`), 10000)
    await sleep(2500) // 等待图集 Worker 与首帧
    const layoutErr = await evalJs(`document.querySelector('.error-text')?.textContent ?? ''`)
    check('图文排版页加载（SDF Worker + WebGPU 画布）', gpuAvailable ? !layoutErr : true, layoutErr || '无渲染错误')

    // 6. 上墙预览页
    await evalJs(`location.hash = '#/preview'`)
    await poll(async () => evalJs(`document.querySelector('.preview-canvas') !== null`), 10000)
    await sleep(3000)
    const previewErr = await evalJs(`document.querySelector('.error-text')?.textContent ?? ''`)
    check('三维上墙预览页加载（四工艺 + 眩光）', gpuAvailable ? !previewErr : true, previewErr || '无渲染错误')

    // 7. 可读性报告页
    await evalJs(`location.hash = '#/readability'`)
    await poll(async () => evalJs(`document.querySelectorAll('tbody tr').length > 0`), 10000)
    const rows = await evalJs(`document.querySelectorAll('tbody tr').length`)
    const failTags = await evalJs(`[...document.querySelectorAll('tbody tr .tag-danger')].length`)
    check('可读性报告逐板输出', rows >= 200, `报告行 ${rows}，不合格标记 ${failTags}`)

    // 8. 出图页与精度验收（2048 光栅测量较重，给足超时）
    await evalJs(`location.hash = '#/export'`)
    await poll(async () => evalJs(`document.querySelector('.precision-table') !== null`), 60000)
    const precisionTag = await evalJs(`document.querySelector('.precision-summary .tag')?.textContent ?? ''`)
    check('0.1mm 精度验收组件运行', precisionTag.includes('0.1mm'), precisionTag)
  } catch (err) {
    check('冒烟流程', false, err.message)
  }

  // 汇总浏览器侧错误事件（favicon 等非业务资源 404 不计入失败）
  const pageErrors = events.filter((e) => {
    if (e.method === 'Runtime.exceptionThrown') return true
    if (e.method === 'Log.entryAdded' && e.params.entry.level === 'error') {
      const text = e.params.entry.text ?? ''
      const url = e.params.entry.url ?? ''
      return !text.includes('404') && !url.includes('favicon')
    }
    return false
  })
  check('浏览器控制台无未捕获异常', pageErrors.length === 0, pageErrors.length ? `${pageErrors.length} 条` : '')
  if (pageErrors.length) {
    for (const e of pageErrors.slice(0, 5)) {
      const detail = e.params.exceptionDetails?.text ?? e.params.entry?.text ?? JSON.stringify(e.params)
      console.log('  浏览器错误:', detail)
    }
  }

  ws.close()
  const failed = results.filter((r) => !r.ok)
  console.log(`\n冒烟结果：${results.length - failed.length}/${results.length} 通过`)
  process.exit(failed.length ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
