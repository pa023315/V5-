import { HistoryItem } from '../types';

const DB_NAME = 'loom_ai_db';
const STORE_NAME = 'try_on_history';
const DB_VERSION = 1;

// Initialize or open the database
export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => {
      console.error("IndexedDB error:", request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
};

// Save a single history item
export const saveHistoryItem = async (item: HistoryItem): Promise<void> => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(item);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("Failed to save history item to DB:", error);
    throw error;
  }
};

// Get all history items, sorted by timestamp descending
export const getHistoryItems = async (): Promise<HistoryItem[]> => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      
      request.onsuccess = () => {
        const items = request.result as HistoryItem[];
        // Sort by newest first
        items.sort((a, b) => b.timestamp - a.timestamp);
        resolve(items);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("Failed to get history from DB:", error);
    return [];
  }
};

// Delete a specific item
export const deleteHistoryItemFromDb = async (id: string): Promise<void> => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("Failed to delete history item:", error);
    throw error;
  }
};

// Keep only the most recent N items
export const trimHistory = async (maxItems: number): Promise<void> => {
  try {
    const items = await getHistoryItems();
    if (items.length <= maxItems) return;

    const itemsToDelete = items.slice(maxItems); // Items after the cutoff
    const db = await initDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    itemsToDelete.forEach(item => {
      store.delete(item.id);
    });
    
    return new Promise((resolve) => {
      transaction.oncomplete = () => resolve();
    });
  } catch (error) {
    console.error("Failed to trim history:", error);
  }
};