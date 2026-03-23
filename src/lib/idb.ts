export function openDB() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("YoussefiaChatDB", 1);
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("keys")) {
        db.createObjectStore("keys", { keyPath: "uid" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function savePrivateKey(uid: string, privateKeyPem: string) {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("keys", "readwrite");
    const store = tx.objectStore("keys");
    store.put({ uid, privateKeyPem });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPrivateKey(uid: string): Promise<string | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("keys", "readonly");
    const store = tx.objectStore("keys");
    const request = store.get(uid);
    request.onsuccess = () => resolve(request.result?.privateKeyPem || null);
    request.onerror = () => reject(tx.error);
  });
}
