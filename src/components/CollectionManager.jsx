import { useState } from 'react'
import './CollectionManager.css'

function CollectionManager({ collection, setCollection, decks }) {
  const [selectedCards, setSelectedCards] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState('name') // name, quantity, color, available
  const [loadingImages, setLoadingImages] = useState(false)
  const [longPressTimer, setLongPressTimer] = useState(null)
  const [longPressCard, setLongPressCard] = useState(null)
  
  // Fetch image URLs for cards that don't have them
  const handleLoadImages = async () => {
    const cardsNeedingImages = collectionWithAvailability.filter(card => !card.imageUrl && card.scryfallId)
    
    if (cardsNeedingImages.length === 0) {
      alert('All cards already have images!')
      return
    }
    
    if (!window.confirm(`Load images for ${cardsNeedingImages.length} cards? This will take ~${Math.ceil(cardsNeedingImages.length * 0.05 / 60)} minutes.`)) {
      return
    }
    
    setLoadingImages(true)
    const updatedCollection = [...collection]
    let loaded = 0
    
    for (const card of cardsNeedingImages) {
      try {
        const response = await fetch(`https://api.scryfall.com/cards/${card.scryfallId}`)
        if (response.ok) {
          const data = await response.json()
          const cardIndex = updatedCollection.findIndex(c => c.scryfallId === card.scryfallId)
          if (cardIndex !== -1) {
            updatedCollection[cardIndex].imageUrl = data.image_uris?.normal || data.card_faces?.[0]?.image_uris?.normal
            loaded++
          }
        }
        // Rate limit: 50ms between requests
        await new Promise(resolve => setTimeout(resolve, 50))
      } catch (err) {
        console.warn(`Failed to fetch image for ${card.name}:`, err)
      }
    }
    
    setCollection(updatedCollection)
    setLoadingImages(false)
    alert(`Loaded ${loaded} card images!`)
  }

  // Long-press to delete handlers
  const handleTouchStart = (card) => {
    const timer = setTimeout(() => {
      if (window.confirm(`Delete ${card.name} from collection?\n\nOwned: ${card.quantity}\nIn use: ${card.quantity - card.available}`)) {
        setCollection(collection.filter(c => c.scryfallId !== card.scryfallId))
        alert(`✅ Deleted ${card.name}`)
      }
      setLongPressCard(null)
    }, 800) // 800ms long press
    
    setLongPressTimer(timer)
    setLongPressCard(card)
  }

  const handleTouchEnd = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer)
      setLongPressTimer(null)
    }
  }

  const handleTouchMove = () => {
    // Cancel long press if finger moves
    if (longPressTimer) {
      clearTimeout(longPressTimer)
      setLongPressTimer(null)
      setLongPressCard(null)
    }
  }

  // Calculate how many copies of each card are in use across all decks
  const getCardUsage = (card) => {
    let inUse = 0
    decks.forEach(deck => {
      const deckCard = deck.cards.find(c => c.scryfallId === card.scryfallId)
      if (deckCard) {
        inUse += deckCard.quantity
      }
    })
    return inUse
  }

  // Add availability info to each card
  const collectionWithAvailability = collection.map(card => ({
    ...card,
    inUse: getCardUsage(card),
    available: card.quantity - getCardUsage(card)
  }))

  const handleSelectCard = (card) => {
    if (selectedCards.find(c => c.scryfallId === card.scryfallId)) {
      setSelectedCards(selectedCards.filter(c => c.scryfallId !== card.scryfallId))
    } else {
      setSelectedCards([...selectedCards, card])
    }
  }

  const handleSelectAll = () => {
    if (selectedCards.length === filteredCollection.length) {
      setSelectedCards([])
    } else {
      setSelectedCards([...filteredCollection])
    }
  }

  const handleDeleteSelected = () => {
    const remainingCards = collection.filter(
      card => !selectedCards.find(sc => sc.scryfallId === card.scryfallId)
    )
    setCollection(remainingCards)
    setSelectedCards([])
  }

  const handleClearCollection = () => {
    if (window.confirm('Are you sure you want to clear your entire collection? This cannot be undone.')) {
      setCollection([])
      setSelectedCards([])
    }
  }

  const handleRestoreBackup = () => {
    const backup = localStorage.getItem('mtg_collection_backup')
    if (backup) {
      try {
        const backupData = JSON.parse(backup)
        const totalCards = backupData.reduce((sum, c) => sum + c.quantity, 0)
        if (window.confirm(`Restore backup with ${totalCards} cards?`)) {
          setCollection(backupData)
          alert('Backup restored!')
        }
      } catch (err) {
        alert('Failed to restore backup')
      }
    } else {
      alert('No backup found')
    }
  }

  const handleExportCollection = () => {
    try {
      const dataStr = JSON.stringify(collection, null, 2)
      const dataBlob = new Blob([dataStr], { type: 'application/json' })
      const url = URL.createObjectURL(dataBlob)
      const link = document.createElement('a')
      link.href = url
      link.download = `mtg-collection-${new Date().toISOString().split('T')[0]}.json`
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert('Failed to export collection: ' + err.message)
    }
  }

  const handleImportCollection = (event) => {
    const file = event.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const importedData = JSON.parse(e.target.result)
        if (!Array.isArray(importedData)) {
          throw new Error('Invalid collection format')
        }
        
        const totalCards = importedData.reduce((sum, c) => sum + c.quantity, 0)
        if (window.confirm(`Import ${totalCards} cards? This will replace your current collection.`)) {
          setCollection(importedData)
          alert('Collection imported successfully!')
        }
      } catch (err) {
        alert('Failed to import collection: ' + err.message)
      }
    }
    reader.readAsText(file)
  }

  const filteredCollection = collectionWithAvailability.filter(card =>
    card.name.toLowerCase().includes(searchTerm.toLowerCase())
  ).sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return a.name.localeCompare(b.name)
      case 'quantity':
        return b.quantity - a.quantity
      case 'available':
        return b.available - a.available
      case 'color':
        const colorA = a.colors?.[0] || 'Z'
        const colorB = b.colors?.[0] || 'Z'
        return colorA.localeCompare(colorB)
      default:
        return 0
    }
  })

  const getTotalCards = () => {
    return collection.reduce((sum, card) => sum + card.quantity, 0)
  }

  const getStorageInfo = () => {
    try {
      let totalSize = 0
      for (let key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
          totalSize += localStorage[key].length + key.length
        }
      }
      const sizeInMB = (totalSize / 1024 / 1024).toFixed(2)
      const estimatedLimit = 5 // Most browsers: 5-10MB
      const percentage = ((totalSize / (estimatedLimit * 1024 * 1024)) * 100).toFixed(0)
      return { sizeInMB, percentage }
    } catch {
      return { sizeInMB: '?', percentage: '?' }
    }
  }

  return (
    <div className="collection-manager">
      <div className="collection-header">
        <div>
          <h2>Your Collection</h2>
          <div className="collection-stats">
            <span>📦 {getTotalCards()} total cards</span>
          </div>
          <div className="storage-info">
            💾 Storage: {getStorageInfo().sizeInMB}MB used (~{getStorageInfo().percentage}% of limit)
            {parseInt(getStorageInfo().percentage) > 80 && (
              <span className="storage-warning"> ⚠️ Nearly full! Export your collection!</span>
            )}
            <br/>
            <small>💡 Card images not stored to save space. Click "Load Card Images" to view them.</small>
          </div>
        </div>
        <div className="collection-actions">
          <button onClick={handleExportCollection}>
            💾 Export Collection
          </button>
          <label className="import-button">
            📂 Import Collection
            <input 
              type="file" 
              accept=".json" 
              onChange={handleImportCollection}
              style={{ display: 'none' }}
            />
          </label>
          <button onClick={handleLoadImages} disabled={loadingImages}>
            {loadingImages ? '⏳ Loading Images...' : '🖼️ Load Card Images'}
          </button>
          <button onClick={handleRestoreBackup}>
            🔄 Restore Backup
          </button>
          <button 
            className="danger-button"
            onClick={handleClearCollection}
            disabled={collection.length === 0}
          >
            🗑️ Clear Collection
          </button>
        </div>
      </div>

      {collection.length === 0 ? (
        <div className="empty-collection">
          <p>Your collection is empty.</p>
          <p>Add cards from your decks to start building your collection!</p>
        </div>
      ) : (
        <>
          <div className="collection-controls">
            <input
              type="text"
              className="search-input"
              placeholder="Search cards..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            
            <select
              className="sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="name">Sort by Name</option>
              <option value="quantity">Sort by Quantity</option>
              <option value="available">Sort by Available</option>
              <option value="color">Sort by Color</option>
            </select>
          </div>

          {selectedCards.length > 0 && (
            <div className="selection-toolbar">
              <span>{selectedCards.length} card(s) selected</span>
              <div className="selection-actions">
                <button onClick={handleSelectAll}>
                  {selectedCards.length === filteredCollection.length ? 'Deselect All' : 'Select All'}
                </button>
                <button 
                  className="danger-button"
                  onClick={handleDeleteSelected}
                >
                  Remove Selected
                </button>
              </div>
            </div>
          )}

          <div className="cards-grid">
            {filteredCollection.map((card, index) => (
              <div 
                key={`${card.scryfallId}-${index}`}
                className={`card-item ${selectedCards.find(c => c.scryfallId === card.scryfallId) ? 'selected' : ''} ${longPressCard?.scryfallId === card.scryfallId ? 'long-pressing' : ''}`}
                onClick={() => handleSelectCard(card)}
                onTouchStart={() => handleTouchStart(card)}
                onTouchEnd={handleTouchEnd}
                onTouchMove={handleTouchMove}
                onContextMenu={(e) => {
                  // Desktop right-click to delete
                  e.preventDefault()
                  if (window.confirm(`Delete ${card.name} from collection?\n\nOwned: ${card.quantity}\nIn use: ${card.quantity - card.available}`)) {
                    setCollection(collection.filter(c => c.scryfallId !== card.scryfallId))
                    alert(`✅ Deleted ${card.name}`)
                  }
                }}
              >
                {card.imageUrl ? (
                  <img src={card.imageUrl} alt={card.name} />
                ) : (
                  <div className="card-placeholder">
                    <p>{card.name}</p>
                    <small>{card.set} #{card.collectorNumber}</small>
                  </div>
                )}
                <div className="card-quantity">
                  <div className="owned-count">Own: {card.quantity}</div>
                  <div className={`available-count ${card.available === 0 ? 'none-available' : ''}`}>
                    Free: {card.available}
                  </div>
                </div>
                {selectedCards.find(c => c.scryfallId === card.scryfallId) && (
                  <div className="selected-indicator">✓</div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default CollectionManager
