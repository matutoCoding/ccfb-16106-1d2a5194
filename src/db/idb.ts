// IndexedDB Promise 化封装，只暴露仓储级 CRUD
import { DB_NAME, DB_VERSION, STORE_DEFS } from './schema'

let dbPromise: Promise<IDBDatabase> | null = null

const openDb = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      for (const def of STORE_DEFS) {
        if (!db.objectStoreNames.contains(def.name)) {
          const store = db.createObjectStore(def.name, { keyPath: def.keyPath })
          def.indexes?.forEach((idx) => store.createIndex(idx.name, idx.field))
        }
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

const tx = async <T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode)
    const req = fn(t.objectStore(store))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export const idbPut = async <T extends object>(store: string, value: T): Promise<IDBValidKey> =>
  tx(store, 'readwrite', (s) => s.put(value))

export const idbGet = async <T>(store: string, key: IDBValidKey): Promise<T | undefined> =>
  tx<T | undefined>(store, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>)

export const idbGetAll = async <T>(store: string): Promise<T[]> =>
  tx<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>)

export const idbDelete = async (store: string, key: IDBValidKey): Promise<void> => {
  await tx(store, 'readwrite', (s) => s.delete(key))
}

export const idbGetByIndex = async <T>(
  store: string,
  index: string,
  value: IDBValidKey,
): Promise<T[]> => {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readonly')
    const req = t.objectStore(store).index(index).getAll(value)
    req.onsuccess = () => resolve(req.result as T[])
    req.onerror = () => reject(req.error)
  })
}

export const idbClear = async (store: string): Promise<void> => {
  await tx(store, 'readwrite', (s) => s.clear())
}
