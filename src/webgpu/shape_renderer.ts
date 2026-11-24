// 实体网格渲染器：墙面、展板底板、展柜、亚克力立体字
import { createBuffer } from './device'
import { SHAPE_WGSL } from './shaders'
import type { MeshData } from '@/preview/geometry'
import type { MaterialSpec } from './materials'

export interface ShapeObject {
  mesh: MeshData
  material: MaterialSpec
}

export class ShapeRenderer {
  private pipeline: GPURenderPipeline

  constructor(
    private device: GPUDevice,
    format: GPUTextureFormat,
    cameraBindGroupLayout: GPUBindGroupLayout,
  ) {
    const module = device.createShaderModule({ code: SHAPE_WGSL })
    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [cameraBindGroupLayout] }),
      vertex: {
        module,
        entryPoint: 'vs_main',
        buffers: [
          {
            arrayStride: 11 * 4,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x3' },
              { shaderLocation: 1, offset: 12, format: 'float32x3' },
              { shaderLocation: 2, offset: 24, format: 'float32x4' },
              { shaderLocation: 3, offset: 40, format: 'float32' },
            ],
          },
        ],
      },
      fragment: {
        module,
        entryPoint: 'fs_main',
        targets: [{ format }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { depthWriteEnabled: true, depthCompare: 'less', format: 'depth24plus' },
    })
  }

  private uploadObject(obj: ShapeObject): {
    vertexBuffer: GPUBuffer
    indexBuffer: GPUBuffer
    indexCount: number
  } {
    const { mesh, material } = obj
    const vertexData = new Float32Array(mesh.positions.length / 3 * 11)
    for (let i = 0; i < mesh.positions.length / 3; i++) {
      vertexData.set(
        [
          mesh.positions[i * 3],
          mesh.positions[i * 3 + 1],
          mesh.positions[i * 3 + 2],
          mesh.normals[i * 3],
          mesh.normals[i * 3 + 1],
          mesh.normals[i * 3 + 2],
          material.color[0],
          material.color[1],
          material.color[2],
          1,
          material.shininess,
        ],
        i * 11,
      )
    }
    return {
      vertexBuffer: createBuffer(this.device, vertexData, GPUBufferUsage.VERTEX),
      indexBuffer: createBuffer(this.device, mesh.indices, GPUBufferUsage.INDEX),
      indexCount: mesh.indices.length,
    }
  }

  draw(pass: GPURenderPassEncoder, objects: ShapeObject[], cameraBind: GPUBindGroup): void {
    pass.setPipeline(this.pipeline)
    pass.setBindGroup(0, cameraBind)
    for (const obj of objects) {
      const buffers = this.uploadObject(obj)
      pass.setVertexBuffer(0, buffers.vertexBuffer)
      pass.setIndexBuffer(buffers.indexBuffer, 'uint32')
      pass.drawIndexed(buffers.indexCount)
    }
  }
}
