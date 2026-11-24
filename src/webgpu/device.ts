// WebGPU 设备初始化与能力检测
export interface GpuContext {
  device: GPUDevice
  context: GPUCanvasContext
  format: GPUTextureFormat
}

export const isWebGpuSupported = (): boolean =>
  typeof navigator !== 'undefined' && 'gpu' in navigator

export const initGpu = async (canvas: HTMLCanvasElement): Promise<GpuContext> => {
  if (!isWebGpuSupported()) {
    throw new Error('当前浏览器不支持 WebGPU，请使用最新版 Chrome/Edge')
  }
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: 'high-performance',
  })
  if (!adapter) throw new Error('未找到可用 GPU 适配器')
  const device = await adapter.requestDevice()
  const context = canvas.getContext('webgpu')
  if (!context) throw new Error('无法获取 WebGPU canvas 上下文')
  const format = navigator.gpu.getPreferredCanvasFormat()
  context.configure({ device, format, alphaMode: 'premultiplied' })
  return { device, context, format }
}

export const createBuffer = (
  device: GPUDevice,
  data: Float32Array | Uint32Array,
  usage: number,
): GPUBuffer => {
  const buffer = device.createBuffer({
    size: Math.max(16, Math.ceil(data.byteLength / 16) * 16),
    usage: usage | GPUBufferUsage.COPY_DST,
  })
  device.queue.writeBuffer(buffer, 0, data)
  return buffer
}
