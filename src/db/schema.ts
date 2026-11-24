// IndexedDB 仓储定义：字体二进制、图集、项目数据分库存储
import type {
  Exhibition,
  FontAsset,
  Hall,
  Panel,
  SdfAtlasMeta,
  SpotLight,
  ViewPoint,
  Wall,
  DisplayCase,
} from '@/types/domain'

export const DB_NAME = 'exhibit-type-studio'
export const DB_VERSION = 1

export interface StoreDef {
  name: string
  keyPath: string
  indexes?: { name: string; field: string }[]
}

export const STORES = {
  meta: 'meta', // 单例设置文档
  fonts: 'fonts',
  fontData: 'fontData', // 大二进制单独存，避免游标拉全量
  atlases: 'atlases',
  atlasPixels: 'atlasPixels', // ImageBitmap/Canvas 位图
  exhibitions: 'exhibitions',
  halls: 'halls',
  walls: 'walls',
  cases: 'cases',
  panels: 'panels',
  viewpoints: 'viewpoints',
  spotlights: 'spotlights',
} as const

export const STORE_DEFS: StoreDef[] = [
  { name: STORES.meta, keyPath: 'id' },
  { name: STORES.fonts, keyPath: 'id' },
  { name: STORES.fontData, keyPath: 'id' },
  { name: STORES.atlases, keyPath: 'id', indexes: [{ name: 'fontId', field: 'fontId' }] },
  { name: STORES.atlasPixels, keyPath: 'id' },
  { name: STORES.exhibitions, keyPath: 'id' },
  { name: STORES.halls, keyPath: 'id', indexes: [{ name: 'hallId', field: 'hallId' }] },
  { name: STORES.walls, keyPath: 'id', indexes: [{ name: 'hallId', field: 'hallId' }] },
  { name: STORES.cases, keyPath: 'id', indexes: [{ name: 'hallId', field: 'hallId' }] },
  { name: STORES.panels, keyPath: 'id', indexes: [{ name: 'hallId', field: 'hallId' }] },
  { name: STORES.viewpoints, keyPath: 'id' },
  { name: STORES.spotlights, keyPath: 'id', indexes: [{ name: 'hallId', field: 'hallId' }] },
]

export type DomainStoreMap = {
  fonts: FontAsset
  fontData: { id: string; buffer: ArrayBuffer }
  atlases: SdfAtlasMeta
  exhibitions: Exhibition
  halls: Hall
  walls: Wall
  cases: DisplayCase
  panels: Panel
  viewpoints: ViewPoint
  spotlights: SpotLight
}
