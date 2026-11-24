// 可读性失败原因分布：解析报告页 DOM
const httpGet = async (url) => (await fetch(url)).json()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const main = async () => {
  const targets = await httpGet('http://127.0.0.1:9222/json/list')
  const page = targets.find((t) => t.type === 'page')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((r) => (ws.onopen = r))
  let msgId = 0
  const pending = new Map()
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result)
    }
  }
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++msgId
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })
  await send('Runtime.enable')
  const evalJs = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    return r.result.value
  }
  await send('Page.enable')
  await send('Page.navigate', { url: 'http://127.0.0.1:4173/' })
  const poll = async (fn, timeout = 20000) => {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      if (await fn()) return true
      await sleep(300)
    }
    return false
  }
  await poll(async () => (await evalJs(`document.querySelector('.brand-name')?.textContent`)) === '展陈排版工坊')
  // 空库则生成演示数据
  const hasData = await evalJs(`document.querySelector('.project-meta')?.textContent ?? ''`)
  if (!hasData.includes('展板 200')) {
    await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('生成演示展览'))?.click()`)
    await poll(async () => (await evalJs(`document.querySelector('.project-meta')?.textContent ?? ''`)).includes('展板 200'), 20000)
  }
  await evalJs(`location.hash = '#/readability'`)
  await sleep(3500)
  const report = await evalJs(`(() => {
    const rows = [...document.querySelectorAll('tbody tr')]
    const reasonCount = {}
    const numSamples = []
    let pass = 0
    for (const tr of rows) {
      const tds = tr.querySelectorAll('td')
      if (tds.length < 9) continue
      const dangerTag = tr.querySelector('.tag-danger')
      if (dangerTag) {
        dangerTag.textContent.split('、').forEach((f) => (reasonCount[f] = (reasonCount[f] || 0) + 1))
      } else pass++
      if (numSamples.length < 4) {
        numSamples.push([...tds].slice(2, 8).map((td) => td.textContent.trim()))
      }
    }
    return JSON.stringify({ total: rows.length, pass, reasonCount, header: ['字高','字视角','对比度','视距','入射角','眩光'], numSamples })
  })()`)
  console.log('失败原因分布:\n', JSON.stringify(JSON.parse(report), null, 2))
  const debug = await evalJs(`JSON.stringify({
    url: location.href,
    hash: location.hash,
    ready: !!document.querySelector('.readability-page'),
    meta: document.querySelector('.project-meta')?.textContent ?? '',
    statCards: [...document.querySelectorAll('.stat-card strong')].map(e => e.textContent),
    tableCount: document.querySelectorAll('table').length,
  })`)
  console.log('页面状态:', debug)
  ws.close()
}
main().catch((e) => { console.error(e); process.exit(1) })
