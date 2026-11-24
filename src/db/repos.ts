// 仓储层：领域对象的读写与按展厅聚合查询
import type {
  Exhibition,
  FontAsset,
  Hall,
  Panel,
  SdfAtlasMeta,
  ViewPoint,
  Wall,
  DisplayCase,
  SpotLight,
} from '@/types/domain'
import { STORES } from './schema'
import { idbDelete, idbGet, idbGetAll, idbGetByIndex, idbPut } from './idb'

type Repo<T extends { id: string }> = {
  list: () => Promise<T[]>
  get: (id: string) => Promise<T | undefined>
  save: (item: T) => Promise<void>
  remove: (id: string) => Promise<void>
}

const repo = <T extends { id: string }>(store: string): Repo<T> => ({
  list: () => idbGetAll<T>(store),
  get: (id) => idbGet<T>(store, id),
  save: async (item) => {
    await idbPut(store, item)
  },
  remove: (id) => idbDelete(store, id),
})

export const exhibitionRepo = repo<Exhibition>(STORES.exhibitions)
export const hallRepo = repo<Hall>(STORES.halls)
export const wallRepo = repo<Wall>(STORES.walls)
export const caseRepo = repo<DisplayCase>(STORES.cases)
export const panelRepo = repo<Panel>(STORES.panels)
export const viewpointRepo = repo<ViewPoint>(STORES.viewpoints)
export const spotlightRepo = repo<SpotLight>(STORES.spotlights)
export const fontRepo = repo<FontAsset>(STORES.fonts)
export const atlasRepo = repo<SdfAtlasMeta>(STORES.atlases)

export const listByHall = <T>(store: string, hallId: string): Promise<T[]> =>
  idbGetByIndex<T>(store, 'hallId', hallId)

export const saveFontBuffer = async (id: string, buffer: ArrayBuffer): Promise<void> => {
  await idbPut(STORES.fontData, { id, buffer })
}

export const loadFontBuffer = async (id: string): Promise<ArrayBuffer | undefined> => {
  const row = await idbGet<{ buffer: ArrayBuffer }>(STORES.fontData, id)
  return row?.buffer
}

export const saveAtlasPixels = async (id: string, pixels: Uint8Array): Promise<void> => {
  await idbPut(STORES.atlasPixels, { id, pixels })
}

export const loadAtlasPixels = async (id: string): Promise<Uint8Array | undefined> => {
  const row = await idbGet<{ pixels: Uint8Array }>(STORES.atlasPixels, id)
  return row?.pixels
}
