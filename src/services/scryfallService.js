// Scryfall Bulk Data Service
// Downloads and indexes the complete Scryfall card database for instant lookups

const BULK_DATA_URL = 'https://api.scryfall.com/bulk-data'
const DB_NAME = 'MTGAnalyzerDB'
const DB_VERSION = 1
const CARDS_STORE = 'cards'
const METADATA_STORE = 'metadata'

class ScryfallService {
  constructor() {
    this.db = null
    this.cardIndex = null
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
        
        // Store for card data
        if (!db.objectStoreNames.contains(CARDS_STORE)) {
          const cardStore = db.createObjectStore(CARDS_STORE, { keyPath: 'id' })
          cardStore.createIndex('name', 'name', { unique: false })
          cardStore.createIndex('name_lower', 'name_lower', { unique: false })
        }
        
        // Store for metadata (bulk data version, last update, etc.)
        if (!db.objectStoreNames.contains(METADATA_STORE)) {
          db.createObjectStore(METADATA_STORE, { keyPath: 'key' })
        }
      }
    })
  }

  // Check if bulk data is already cached
  async isBulkDataCached() {
    if (!this.db) await this.initDB()
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([METADATA_STORE], 'readonly')
      const store = transaction.objectStore(METADATA_STORE)
      const request = store.get('bulk_data_version')
      
      request.onsuccess = () => {
        const metadata = request.result
        // Consider cached if downloaded within last 7 days
        if (metadata && metadata.downloadedAt) {
          const age = Date.now() - metadata.downloadedAt
          const sevenDays = 7 * 24 * 60 * 60 * 1000
          resolve(age < sevenDays)
        } else {
          resolve(false)
        }
      }
      
      request.onerror = () => reject(request.error)
    })
  }

  // Download and cache bulk data
  async downloadBulkData(onProgress) {
    console.log('Downloading Scryfall bulk data...')
    
    try {
      // Get bulk data info
      const bulkResponse = await fetch(BULK_DATA_URL)
      const bulkData = await bulkResponse.json()
      
      // Find "Default Cards" bulk data (all cards in English)
      const defaultCards = bulkData.data.find(item => item.type === 'default_cards')
      
      if (!defaultCards) {
        throw new Error('Default cards bulk data not found')
      }
      
      console.log(`Bulk data size: ${(defaultCards.size / 1024 / 1024).toFixed(2)} MB`)
      console.log(`Download URL: ${defaultCards.download_uri}`)
      
      if (onProgress) {
        onProgress({ stage: 'downloading', percent: 0, message: 'Downloading card database...' })
      }
      
      // Download the bulk data file
      const dataResponse = await fetch(defaultCards.download_uri)
      const cards = await dataResponse.json()
      
      console.log(`Downloaded ${cards.length} cards`)
      
      if (onProgress) {
        onProgress({ stage: 'storing', percent: 50, message: 'Storing cards in database...' })
      }
      
      // Store in IndexedDB
      await this.storeBulkData(cards, onProgress)
      
      // Save metadata
      await this.saveMetadata({
        key: 'bulk_data_version',
        version: defaultCards.updated_at,
        downloadedAt: Date.now(),
        cardCount: cards.length
      })
      
      console.log('Bulk data cached successfully')
      
      if (onProgress) {
        onProgress({ stage: 'complete', percent: 100, message: 'Card database ready!' })
      }
      
      return true
    } catch (error) {
      console.error('Error downloading bulk data:', error)
      throw error
    }
  }

  // Store bulk data in IndexedDB
  async storeBulkData(cards, onProgress) {
    if (!this.db) await this.initDB()
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([CARDS_STORE], 'readwrite')
      const store = transaction.objectStore(CARDS_STORE)
      
      let processed = 0
      const total = cards.length
      const batchSize = 100
      
      const processBatch = (startIndex) => {
        const endIndex = Math.min(startIndex + batchSize, total)
        
        for (let i = startIndex; i < endIndex; i++) {
          const card = cards[i]
          
          // Only store paper cards (not Arena-only)
          if (card.layout === 'art_series' || card.layout === 'token') {
            continue
          }
          
          // Create indexed card object
          const indexedCard = {
            id: card.id,
            name: card.name,
            name_lower: card.name.toLowerCase(),
            oracle_text: card.oracle_text || '',
            type_line: card.type_line || '',
            mana_cost: card.mana_cost || '',
            cmc: card.cmc || 0,
            colors: card.colors || [],
            color_identity: card.color_identity || [],
            power: card.power || null,
            toughness: card.toughness || null,
            keywords: card.keywords || [],
            set: card.set,
            collector_number: card.collector_number,
            rarity: card.rarity,
            image_uris: card.image_uris || null
          }
          
          store.put(indexedCard)
        }
        
        processed = endIndex
        
        if (onProgress && processed % 1000 === 0) {
          const percent = 50 + Math.floor((processed / total) * 50)
          onProgress({ 
            stage: 'storing', 
            percent, 
            message: `Storing cards... ${processed}/${total}` 
          })
        }
        
        if (processed < total) {
          setTimeout(() => processBatch(processed), 0)
        }
      }
      
      transaction.oncomplete = () => {
        console.log(`Stored ${processed} cards in IndexedDB`)
        resolve()
      }
      
      transaction.onerror = () => reject(transaction.error)
      
      processBatch(0)
    })
  }

  // Save metadata
  async saveMetadata(data) {
    if (!this.db) await this.initDB()
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([METADATA_STORE], 'readwrite')
      const store = transaction.objectStore(METADATA_STORE)
      const request = store.put(data)
      
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  // Look up card by name
  async findCardByName(name) {
    if (!this.db) await this.initDB()
    
    const nameLower = name.toLowerCase().trim()
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([CARDS_STORE], 'readonly')
      const store = transaction.objectStore(CARDS_STORE)
      const index = store.index('name_lower')
      const request = index.get(nameLower)
      
      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
    })
  }

  // Look up multiple cards by names
  async findCardsByNames(names, onProgress) {
    if (!this.db) await this.initDB()
    
    const results = []
    const notFound = []
    
    for (let i = 0; i < names.length; i++) {
      const name = names[i]
      const card = await this.findCardByName(name)
      
      if (card) {
        results.push(card)
      } else {
        notFound.push(name)
      }
      
      if (onProgress && (i % 10 === 0 || i === names.length - 1)) {
        const percent = Math.floor((i / names.length) * 100)
        onProgress({
          stage: 'matching',
          percent,
          message: `Matching cards... ${i + 1}/${names.length}`,
          found: results.length,
          notFound: notFound.length
        })
      }
    }
    
    return { found: results, notFound }
  }

  // Ensure bulk data is ready
  async ensureBulkData(onProgress) {
    const isCached = await this.isBulkDataCached()
    
    if (!isCached) {
      console.log('Bulk data not cached, downloading...')
      await this.downloadBulkData(onProgress)
    } else {
      console.log('Bulk data already cached')
      if (onProgress) {
        onProgress({ stage: 'complete', percent: 100, message: 'Card database ready!' })
      }
    }
  }
}

// Export singleton instance
export default new ScryfallService()
