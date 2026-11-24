// 距离场文字渲染器：图集上传、字形实例四边形生成、同一套管线服务 2D 排版与 3D 上墙
import { createBuffer } from './device'
import { TEXT_WGSL } from './shaders'
import type { SdfAtlasMeta } from '@/types/domain'

export interface TextInstance {
  // 四边形中心（mm）
  x: number
  y: number
  z: number
  // 四边形尺寸（mm）
  w: number
  h: number
  r: number
  g: number
  b: number
  a: number
  // 图集 uv
  u0: number
  v0: number
  u1: number
  v1: number
}

// 每个实例 6 顶点 * (pos3 + uv2 + color4 + world3) = 12 float
const FLOATS_PER_VERTEX = 12

export class TextRenderer {
  private pipeline: GPURenderPipeline
  private sampler: GPUSampler
  private atlasView: GPUTextureView | null = null
  private bindGroup: GPUBindGroup | null = null
  private atlasId = ''

  constructor(
    private device: GPUDevice,
    format: GPUTextureFormat,
    cameraBindGroupLayout: GPUBindGroupLayout,
  ) {
    const module = device.createShaderModule({ code: TEXT_WGSL })
    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [
          cameraBindGroupLayout,
          device.createBindGroupLayout({
            entries: [
              { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
              { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
            ],
          }),
        ],
      }),
      vertex: {
        module,
        entryPoint: 'vs_main',
        buffers: [
          {
            arrayStride: FLOATS_PER_VERTEX * 4,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x3' },
              { shaderLocation: 1, offset: 12, format: 'float32x2' },
              { shaderLocation: 2, offset: 20, format: 'float32x4' },
              { shaderLocation: 3, offset: 36, format: 'float32x3' },
            ],
          },
        ],
      },
      fragment: {
        module,
        entryPoint: 'fs_main',
        targets: [
          {
            format,
            blend: {
              color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { depthWriteEnabled: true, depthCompare: 'less', format: 'depth24plus' },
    })
    this.sampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    })
  }

  // 上传或替换图集（换字体时重建）
  uploadAtlas(meta: SdfAtlasMeta, pixels: Uint8Array): void {
    if (this.atlasId === meta.id) return
    const texture = this.device.createTexture({
      size: { width: meta.width, height: meta.height },
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    })
    this.device.queue.writeTexture(
      { texture },
      pixels,
      { bytesPerRow: meta.width * 4, rowsPerImage: meta.height },
      { width: meta.width, height: meta.height },
    )
    this.atlasView = texture.createView()
    this.bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(1),
      entries: [
        { binding: 1, resource: this.atlasView },
        { binding: 2, resource: this.sampler },
      ],
    })
    this.atlasId = meta.id
  }

  buildBuffer(instances: TextInstance[]): GPUBuffer | null {
    if (!instances.length) return null
    const data = new Float32Array(instances.length * 6 * FLOATS_PER_VERTEX)
    let offset = 0
    const pushVertex = (
      x: number, y: number, z: number,
      u: number, v: number,
      t: TextInstance,
    ) => {
      data.set([x, y, z, u, v, t.r, t.g, t.b, t.a, x, y, z], offset)
      offset += FLOATS_PER_VERTEX
    }
    for (const t of instances) {
      const corners: [number, number, number, number][] = [
        [t.x - t.w / 2, t.y - t.h / 2, t.u0, t.v1],
        [t.x + t.w / 2, t.y - t.h / 2, t.u1, t.v1],
        [t.x + t.w / 2, t.y + t.h / 2, t.u1, t.v0],
        [t.x - t.w / 2, t.y - t.h / 2, t.u0, t.v1],
        [t.x + t.w / 2, t.y + t.h / 2, t.u1, t.v0],
        [t.x - t.w / 2, t.y + t.h / 2, t.u0, t.v0],
      ]
      corners.forEach(([x, y, u, v]) => pushVertex(x, y, t.z, u, v, t))
    }
    return createBuffer(this.device, data, GPUBufferUsage.VERTEX)
  }

  draw(pass: GPURenderPassEncoder, vertexBuffer: GPUBuffer, vertexCount: number, cameraBind: GPUBindGroup): void {
    if (!this.bindGroup) return
    pass.setPipeline(this.pipeline)
    pass.setBindGroup(0, cameraBind)
    pass.setBindGroup(1, this.bindGroup)
    pass.setVertexBuffer(0, vertexBuffer)
    pass.draw(vertexCount)
  }
}
