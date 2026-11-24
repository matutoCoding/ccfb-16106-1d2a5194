// 主渲染器：统一管理相机 uniform、Shape/Text/Glare 三条管线与渲染循环
import { initGpu, createBuffer, type GpuContext } from './device'
import { ShapeRenderer, type ShapeObject } from './shape_renderer'
import { TextRenderer, type TextInstance } from './text_renderer'
import { GlareRenderer, type GlareInstance } from './glare_renderer'
import { mat4LookAt, mat4Multiply, mat4Ortho, mat4Perspective, type Mat4, type Vec3 } from './mat4'
import type { SdfAtlasMeta } from '@/types/domain'

interface CameraState {
  eye: Vec3
  target: Vec3
  ortho: boolean
  orthoHeight: number
  blurStartDistance: number
}

export class StudioRenderer {
  private ctx: GpuContext
  private shape: ShapeRenderer
  private text: TextRenderer
  private glare: GlareRenderer
  private cameraLayout: GPUBindGroupLayout
  private cameraBuffer: GPUBuffer
  private cameraBind: GPUBindGroup
  private depthTexture: GPUTexture | null = null
  camera: CameraState = {
    eye: [0, 2600, 6000],
    target: [0, 1400, 0],
    ortho: false,
    orthoHeight: 2400,
    blurStartDistance: 4000,
  }

  private constructor(ctx: GpuContext) {
    this.ctx = ctx
    this.cameraLayout = ctx.device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
    })
    this.cameraBuffer = createBuffer(ctx.device, new Float32Array(40), GPUBufferUsage.UNIFORM)
    this.cameraBind = ctx.device.createBindGroup({
      layout: this.cameraLayout,
      entries: [{ binding: 0, resource: { buffer: this.cameraBuffer } }],
    })
    this.shape = new ShapeRenderer(ctx.device, ctx.format, this.cameraLayout)
    this.text = new TextRenderer(ctx.device, ctx.format, this.cameraLayout)
    this.glare = new GlareRenderer(ctx.device, ctx.format, this.cameraLayout)
  }

  static async create(canvas: HTMLCanvasElement): Promise<StudioRenderer> {
    const ctx = await initGpu(canvas)
    return new StudioRenderer(ctx)
  }

  private ensureDepth(): void {
    const canvas = this.ctx.context.canvas
    if (
      this.depthTexture &&
      this.depthTexture.width === canvas.width &&
      this.depthTexture.height === canvas.height
    ) {
      return
    }
    this.depthTexture?.destroy()
    this.depthTexture = this.ctx.device.createTexture({
      size: { width: canvas.width, height: canvas.height },
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    })
  }

  setPerspectiveCamera(eye: Vec3, target: Vec3, blurStartDistance?: number): void {
    this.camera.ortho = false
    this.camera.eye = eye
    this.camera.target = target
    if (blurStartDistance) this.camera.blurStartDistance = blurStartDistance
  }

  setOrthoCamera(heightMm: number): void {
    this.camera.ortho = true
    this.camera.orthoHeight = heightMm
  }

  uploadAtlas(meta: SdfAtlasMeta, pixels: Uint8Array): void {
    this.text.uploadAtlas(meta, pixels)
  }

  private writeCamera(): Mat4 {
    const canvas = this.ctx.context.canvas
    const aspect = canvas.width / Math.max(1, canvas.height)
    let proj: Mat4
    if (this.camera.ortho) {
      const h = this.camera.orthoHeight / 2
      proj = mat4Ortho(-h * aspect, h * aspect, -h, h, -10000, 10000)
    } else {
      proj = mat4Perspective((55 * Math.PI) / 180, aspect, 10, 50000)
    }
    const view = this.camera.ortho
      ? mat4LookAt([0, 0, 5000], [0, 0, 0])
      : mat4LookAt(this.camera.eye, this.camera.target)
    const vp = mat4Multiply(proj, view)
    const data = new Float32Array(40)
    data.set(vp, 0)
    if (!this.camera.ortho) data.set(this.camera.eye, 16)
    data[19] = 12000
    data[20] = 40000
    data[21] = canvas.height
    data[22] = this.camera.blurStartDistance
    this.ctx.device.queue.writeBuffer(this.cameraBuffer, 0, data)
    return vp
  }

  render(frame: {
    shapes: ShapeObject[]
    textInstances: TextInstance[]
    glare: GlareInstance[]
  }): void {
    this.ensureDepth()
    this.writeCamera()
    const encoder = this.ctx.device.createCommandEncoder()
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.ctx.context.getCurrentTexture().createView(),
          clearValue: { r: 0.965, g: 0.97, b: 0.975, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      depthStencilAttachment: {
        view: this.depthTexture!.createView(),
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    })

    this.shape.draw(pass, frame.shapes, this.cameraBind)

    if (frame.textInstances.length) {
      const buffer = this.text.buildBuffer(frame.textInstances)
      if (buffer) this.text.draw(pass, buffer, frame.textInstances.length * 6, this.cameraBind)
    }

    if (frame.glare.length) {
      const buffer = this.glare.buildBuffer(frame.glare)
      if (buffer) this.glare.draw(pass, buffer, frame.glare.length * 6, this.cameraBind)
    }

    pass.end()
    this.ctx.device.queue.submit([encoder.finish()])
  }
}
