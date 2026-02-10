// Scryfall Service
// Uses direct API for deck imports (fast, reliable on mobile)
// Uses bulk data only for full collection imports (3000+ cards)

const BULK_DATA_URL = 'https://api.scryfall.com/bulk-data'
const CARD_NAMED_URL = 'https://api.scryfall.com/cards/named'
const DB_NAME = 'MTGAnalyzerDB'
const DB_VERSION = 1
const CARDS_STORE = 'cards'
const METADATA_STORE = 'metadata'

class ScryfallService {
  constructor() {
    this.db = null
    this.requestQueue = []
    this.isProcessing = false
  }

  // Initialize IndexedDB
  async initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        resolve(this.db)
      }
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result
        
        if (!db.objectStoreNames.contains(CARDS_STORE)) {
          const cardStore = db.createObjectStore(CARDS_STORE, { keyPath: 'id' })
          cardStore.createIndex('name', 'name', { unique: false })
          cardStore.createIndex('name_lower', 'name_lower', { unique: false })
        }
        
        if (!db.objectStoreNames.contains(METADATA_STORE)) {
          db.createObjectStore(METADATA_STORE, { keyPath: 'key' })
        }
      }
    })
  }

  // Format card data consistently
  formatCard(card) {
    return {
      id: card.id,
      name: card.name,
      name_lower: card.name.toLowerCase(),
      oracle_text: card.oracle_text || card.card_faces?.[0]?.oracle_text || '',
      type_line: card.type_line || '',
      mana_cost: card.mana_cost || card.card_faces?.[0]?.mana_cost || '',
      cmc: card.cmc || 0,
      colors: card.colors || card.card_faces?.[0]?.colors || [],
      color_identity: card.color_identity || [],
      power: card.power || null,
      toughness: card.toughness || null,
      keywords: card.keywords || [],
      set: card.set,
      collector_number: card.collector_number,
      rarity: card.rarity,
      image_uris: card.image_uris || card.card_faces?.[0]?.image_uris || null
    }
  }

  // Look up a single card by name via Scryfall API (with rate limiting)
  async fetchCardByName(name) {
    // Rate limit: max 10 requests/sec, we'll do 8 to be safe
    await this.rateLimit()
    
    try {
      const url = `${CARD_NAMED_URL}?fuzzy=${encodeURIComponent(name)}`
      console.log(`Fetching card: ${name}`)
      
      const response = await fetch(url)
      
      if (response.status === 404) {
        console.warn(`Card not found: ${name}`)
        return null
      }
      
      if (!response.ok) {
        console.error(`API error for ${name}: ${response.status}`)
        return null
      }
      
      const card = await response.json()
      return this.formatCard(card)
    } catch (error) {
      console.error(`Error fetching ${name}:`, error)
      return null
    }
  }

  // Rate limiter: 8 requests per second max
  rateLimit() {
    return new Promise(resolve => {
      setTimeout(resolve, 125) // 125ms = 8/sec
    })
  }

  // Look up multiple cards by name via direct API
  // Best for deck imports (up to ~100 cards)
  async findCardsByNames(names, onProgress) {
    const found = []
    const notFound = []
    
    console.log(`Looking up ${names.length} cards via Scryfall API...`)
    
    for (let i = 0; i < names.length; i++) {
      const name = names[i]
      const card = await this.fetchCardByName(name)
      
      if (card) {
        found.push(card)
        // Cache in IndexedDB for future use
        this.cacheCard(card)
      } else {
        notFound.push(name)
      }
      
      if (onProgress) {
        const percent = Math.floor(((i + 1) / names.length) * 100)
        onProgress({
          stage: 'matching',
          percent,
          message: `Looking up cards... ${i + 1}/${names.length}`,
          found: found.length,
          notFound: notFound.length
        })
      }
    }
    
    console.log(`Results: ${found.length} found, ${notFound.length} not found`)
    return { found, notFound }
  }

  // Cache a single card in IndexedDB
  async cacheCard(card) {
    try {
      if (!this.db) await this.initDB()
      
      const transaction = this.db.transaction([CARDS_STORE], 'readwrite')
      const store = transaction.objectStore(CARDS_STORE)
      store.put(card)
    } catch (error) {
      // Silently fail - caching is best-effort
      console.warn('Cache write failed:', error)
    }
  }

  // Check cache first, then API
  async findCardByName(name) {
    // Try cache first
    try {
      if (!this.db) await this.initDB()
      
      const cached = await new Promise((resolve, reject) => {
        const transaction = this.db.transaction([CARDS_STORE], 'readonly')
        const store = transaction.objectStore(CARDS_STORE)
        const index = store.index('name_lower')
        const request = index.get(name.toLowerCase().trim())
        
        request.onsuccess = () => resolve(request.result || null)
        request.onerror = () => reject(request.error)
      })
      
      if (cached) {
        console.log(`Cache hit: ${name}`)
        return cached
      }
    } catch (error) {
      console.warn('Cache read failed:', error)
    }
    
    // Fall back to API
    return this.fetchCardByName(name)
  }

  // Check if bulk data is cached (for full collection imports)
  async isBulkDataCached() {
    try {
      if (!this.db) await this.initDB()
      
      return new Promise((resolve) => {
        const transaction = this.db.transaction([METADATA_STORE], 'readonly')
        const store = transaction.objectStore(METADATA_STORE)
        const request = store.get('bulk_data_version')
        
        request.onsuccess = () => {
          const metadata = request.result
          if (metadata && metadata.downloadedAt && metadata.cardCount > 10000) {
            const age = Date.now() - metadata.downloadedAt
            const sevenDays = 7 * 24 * 60 * 60 * 1000
            resolve(age < sevenDays)
          } else {
            resolve(false)
          }
        }
        
        request.onerror = () => resolve(false)
      })
    } catch (error) {
      return false
    }
  }

  // Download and cache bulk data (for full collection imports only)
  async downloadBulkData(onProgress) {
    console.log('Downloading Scryfall bulk data...')
    
    if (onProgress) {
      onProgress({ stage: 'downloading', percent: 0, message: 'Connecting to Scryfall...' })
    }
    
    try {
      const bulkResponse = await fetch(BULK_DATA_URL)
      
      if (!bulkResponse.ok) {
        throw new Error(`Failed to get bulk data info: ${bulkResponse.status}`)
      }
      
      const bulkData = await bulkResponse.json()
      const defaultCards = bulkData.data.find(item => item.type === 'default_cards')
      
      if (!defaultCards) {
        throw new Error('Default cards bulk data not found')
      }
      
      const sizeMB = (defaultCards.size / 1024 / 1024).toFixed(0)
      console.log(`Bulk data: ${sizeMB}MB`)
      
      if (onProgress) {
        onProgress({ 
          stage: 'downloading', 
          percent: 5, 
          message: `Downloading ${sizeMB}MB card database... (this takes 1-2 minutes)` 
        })
      }
      
      const dataResponse = await fetch(defaultCards.download_uri)
      
      if (!dataResponse.ok) {
        throw new Error(`Failed to download card data: ${dataResponse.status}`)
      }
      
      if (onProgress) {
        onProgress({ stage: 'parsing', percent: 40, message: 'Processing card data...' })
      }
      
      const cards = await dataResponse.json()
      console.log(`Downloaded ${cards.length} cards`)
      
      if (!cards || cards.length < 10000) {
        throw new Error(`Download seems incomplete: only got ${cards?.length || 0} cards`)
      }
      
      if (onProgress) {
        onProgress({ stage: 'storing', percent: 50, message: `Storing ${cards.length.toLocaleString()} cards...` })
      }
      
      await this.storeBulkData(cards, onProgress)
      
      await this.saveMetadata({
        key: 'bulk_data_version',
        version: defaultCards.updated_at,
        downloadedAt: Date.now(),
        cardCount: cards.length
      })
      
      console.log('Bulk data cached successfully!')
      
      if (onProgress) {
        onProgress({ stage: 'complete', percent: 100, message: `${cards.length.toLocaleString()} cards ready!` })
      }
      
      return true
    } catch (error) {
      console.error('Bulk data download failed:', error)
      throw new Error(`Failed to download card database: ${error.message}`)
    }
  }

  // Store bulk data in IndexedDB in batches
  async storeBulkData(cards, onProgress) {
    if (!this.db) await this.initDB()
    
    const batchSize = 500
    let processed = 0
    
    for (let i = 0; i < cards.length; i += batchSize) {
      const batch = cards.slice(i, i + batchSize)
      
      await new Promise((resolve, reject) => {
        const transaction = this.db.transaction([CARDS_STORE], 'readwrite')
        const store = transaction.objectStore(CARDS_STORE)
        
        batch.forEach(card => {
          if (card.layout !== 'art_series' && card.layout !== 'token') {
            store.put(this.formatCard(card))
          }
        })
        
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
      })
      
      processed += batch.length
      
      if (onProgress && processed % 5000 === 0) {
        const percent = 50 + Math.floor((processed / cards.length) * 50)
        onProgress({ 
          stage: 'storing', 
          percent, 
          message: `Storing cards... ${processed.toLocaleString()}/${cards.length.toLocaleString()}` 
        })
      }
    }
    
    console.log(`Stored ${processed} cards`)
  }

  // Save metadata
  async saveMetadata(data) {
    if (!this.db) await this.initDB()
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([METADATA_STORE], 'readwrite')
      const store = transaction.objectStore(METADATA_STORE)
      store.put(data)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
  }

  // Ensure bulk data is ready (for collection imports)
  async ensureBulkData(onProgress) {
    const isCached = await this.isBulkDataCached()
    
    if (!isCached) {
      await this.downloadBulkData(onProgress)
    } else {
      console.log('Bulk data already cached')
      if (onProgress) {
        onProgress({ stage: 'complete', percent: 100, message: 'Card database ready!' })
      }
    }
  }
}

export default new ScryfallService()

