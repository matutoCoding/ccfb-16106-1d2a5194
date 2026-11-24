// 眩光叠加渲染器：把射灯反光椭圆以半透明暖黄叠在展板前方
import { createBuffer } from './device'
import { GLARE_WGSL } from './shaders'

export interface GlareInstance {
  cx: number
  cy: number
  z: number
  radiusX: number
  radiusY: number
  intensity: number
}

const FLOATS = 10 // pos3 + local2 + params4

export class GlareRenderer {
  private pipeline: GPURenderPipeline

  constructor(
    private device: GPUDevice,
    format: GPUTextureFormat,
    cameraBindGroupLayout: GPUBindGroupLayout,
  ) {
    const module = device.createShaderModule({ code: GLARE_WGSL })
    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [cameraBindGroupLayout] }),
      vertex: {
        module,
        entryPoint: 'vs_main',
        buffers: [
          {
            arrayStride: FLOATS * 4,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x3' },
              { shaderLocation: 1, offset: 12, format: 'float32x2' },
              { shaderLocation: 2, offset: 20, format: 'float32x4' },
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
      depthStencil: { depthWriteEnabled: false, depthCompare: 'less', format: 'depth24plus' },
    })
  }

  buildBuffer(instances: GlareInstance[]): GPUBuffer | null {
    if (!instances.length) return null
    const data = new Float32Array(instances.length * 6 * FLOATS)
    let off = 0
    const push = (
      px: number, py: number, pz: number,
      lx: number, ly: number,
      intensity: number, rx: number, ry: number,
    ) => {
      data.set([px, py, pz, lx, ly, intensity, 1, rx, ry, 0], off)
      off += FLOATS
    }
    for (const g of instances) {
      const x0 = g.cx - g.radiusX
      const x1 = g.cx + g.radiusX
      const y0 = g.cy - g.radiusY
      const y1 = g.cy + g.radiusY
      const verts: [number, number, number, number][] = [
        [x0, y0, -g.radiusX, -g.radiusY],
        [x1, y0, g.radiusX, -g.radiusY],
        [x1, y1, g.radiusX, g.radiusY],
        [x0, y0, -g.radiusX, -g.radiusY],
        [x1, y1, g.radiusX, g.radiusY],
        [x0, y1, -g.radiusX, g.radiusY],
      ]
      verts.forEach(([x, y, lx, ly]) => push(x, y, g.z, lx, ly, g.intensity, g.radiusX, g.radiusY))
    }
    return createBuffer(this.device, data, GPUBufferUsage.VERTEX)
  }

  draw(pass: GPURenderPassEncoder, buffer: GPUBuffer, vertexCount: number, cameraBind: GPUBindGroup): void {
    pass.setPipeline(this.pipeline)
    pass.setBindGroup(0, cameraBind)
    pass.setVertexBuffer(0, buffer)
    pass.draw(vertexCount)
  }
}
