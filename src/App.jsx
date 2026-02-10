import { useState, useEffect } from 'react'
import './App.css'
import DeckImporter from './components/DeckImporter'
import DeckViewer from './components/DeckViewer'
import CollectionManager from './components/CollectionManager'
import AIAnalyzer from './components/AIAnalyzer'
import ManaboxImporter from './components/ManaboxImporter'

function App() {
  const [view, setView] = useState('import') // import, deck, collection, analyze
  const [decks, setDecks] = useState([])
  const [currentDeck, setCurrentDeck] = useState(null)
  const [collection, setCollection] = useState([])
  const [lastAction, setLastAction] = useState(null) // For undo functionality
  const [showManaboxImporter, setShowManaboxImporter] = useState(false)

  // Load saved data from localStorage
  useEffect(() => {
    const savedDecks = localStorage.getItem('mtg_decks')
    const savedCollection = localStorage.getItem('mtg_collection')
    
    if (savedDecks) setDecks(JSON.parse(savedDecks))
    if (savedCollection) setCollection(JSON.parse(savedCollection))
  }, [])

  // Listen for shared files from service worker
  useEffect(() => {
    if (!navigator.serviceWorker) return;

    const handleMessage = async (event) => {
      if (event.data && event.data.type === 'SHARED_FILE') {
        console.log('Received shared file message:', event.data);
        
        try {
          // Retrieve the shared file data from cache
          const cache = await caches.open('mtg-deck-analyzer-v2');
          const response = await cache.match('/shared-deck-data');
          
          if (response) {
            const fileText = await response.text();
            
            // Auto-open Manabox importer with the file data
            setShowManaboxImporter(true);
            
            // Process the shared file
            // Note: The ManaboxImporter component will handle the actual processing
            // We just need to make it available
            window.sharedDeckData = fileText;
            
            alert(`📥 Received deck from Manabox!\n\nFile: ${event.data.filename}\nClick "Import from Manabox" to continue.`);
          }
        } catch (error) {
          console.error('Error processing shared file:', error);
        }
      }
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);
    
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage);
    };
  }, []);

  // Safe save with quota handling
  const safeLocalStorageSave = (key, data) => {
    try {
      const jsonData = JSON.stringify(data)
      const sizeInMB = (new Blob([jsonData]).size / 1024 / 1024).toFixed(2)
      console.log(`Saving ${key}: ${sizeInMB}MB`)
      
      localStorage.setItem(key, jsonData)
      return true
    } catch (err) {
      if (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
        console.error('Storage quota exceeded!')
        alert(`⚠️ Storage Full!\n\nYou've hit the browser storage limit (${key}).\n\nYour data was NOT saved. Please export your collection before adding more cards.`)
        return false
      } else {
        console.error('Storage error:', err)
        alert(`Failed to save ${key}: ${err.message}`)
        return false
      }
    }
  }

  // Save decks when they change
  useEffect(() => {
    if (decks.length > 0) {
      safeLocalStorageSave('mtg_decks', decks)
    }
  }, [decks])

  // Save collection when it changes
  useEffect(() => {
    if (collection.length > 0) {
      console.log('Saving collection:', collection.length, 'unique cards')
      const totalCards = collection.reduce((sum, c) => sum + c.quantity, 0)
      console.log('Total cards:', totalCards)
      
      // Optimize storage: only save essential data
      const optimizedCollection = collection.map(card => ({
        scryfallId: card.scryfallId,
        name: card.name,
        set: card.set,
        collectorNumber: card.collectorNumber,
        quantity: card.quantity,
        colors: card.colors,
        type: card.type,
        manaCost: card.manaCost,
        cmc: card.cmc
        // Skip imageUrl and oracleText to save space
      }))
      
      // Try to save current collection
      const saved = safeLocalStorageSave('mtg_collection', optimizedCollection)
      
      if (saved) {
        // Keep a backup of the last save
        try {
          const previousBackup = localStorage.getItem('mtg_collection_backup')
          if (previousBackup) {
            localStorage.setItem('mtg_collection_backup_old', previousBackup)
          }
          localStorage.setItem('mtg_collection_backup', JSON.stringify(optimizedCollection))
        } catch (err) {
          console.warn('Could not save backup:', err)
        }
      }
    }
  }, [collection])

  const handleDeckImport = (deckData) => {
    const newDeck = {
      id: Date.now(),
      name: deckData.name || `Deck ${decks.length + 1}`,
      cards: deckData.cards,
      createdAt: new Date().toISOString()
    }
    
    setDecks([...decks, newDeck])
    setCurrentDeck(newDeck)
    setView('deck')
  }

  const handleManaboxImport = (newDeck) => {
    console.log('Manabox import:', newDeck)
    
    // Add metadata if not present
    const deckWithMetadata = {
      id: newDeck.id || Date.now(),
      name: newDeck.name || `Deck ${decks.length + 1}`,
      cards: newDeck.cards,
      createdAt: new Date().toISOString()
    }
    
    setDecks([...decks, deckWithMetadata])
    setCurrentDeck(deckWithMetadata)
    setShowManaboxImporter(false)
    setView('deck')
    
    alert(`✅ Imported ${deckWithMetadata.name}!\n\n${deckWithMetadata.cards.length} cards loaded with full oracle text.`)
  }

  const handleDeleteDeck = (deckId) => {
    setDecks(decks.filter(d => d.id !== deckId))
    if (currentDeck && currentDeck.id === deckId) {
      setCurrentDeck(null)
    }
  }

  const handleUpdateDeck = (updatedDeck) => {
    setDecks(decks.map(d => d.id === updatedDeck.id ? updatedDeck : d))
    setCurrentDeck(updatedDeck)
  }

  const handleAddToCollection = (cards) => {
    console.log('Adding to collection:', cards.length, 'cards')
    console.log('Current collection size:', collection.length)
    
    // Save current state for undo
    setLastAction({
      type: 'addToCollection',
      previousCollection: [...collection],
      addedCards: cards
    })
    
    const newCollection = [...collection]
    
    cards.forEach(card => {
      // Safety check - make sure card has scryfallId
      if (!card.scryfallId) {
        console.error('Card missing scryfallId:', card.name)
        return
      }
      
      const existing = newCollection.find(c => c.scryfallId === card.scryfallId)
      if (existing) {
        console.log(`Updating existing card ${card.name}: ${existing.quantity} + ${card.quantity}`)
        existing.quantity += card.quantity
      } else {
        console.log(`Adding new card ${card.name}: ${card.quantity}`)
        newCollection.push(card)
      }
    })
    
    console.log('New collection size:', newCollection.length)
    setCollection(newCollection)
    
    // Show success message with actual counts
    const totalAdded = cards.reduce((sum, c) => sum + c.quantity, 0)
    alert(`Added ${totalAdded} cards (${cards.length} unique) to collection!\n\n💡 Tap "Undo" if this was a mistake.`)
  }

  const handleUndo = () => {
    if (!lastAction) {
      alert('Nothing to undo!')
      return
    }
    
    if (lastAction.type === 'addToCollection') {
      if (window.confirm('Undo adding cards to collection?')) {
        setCollection(lastAction.previousCollection)
        setLastAction(null)
        alert('✅ Undone!')
      }
    }
  }

  const handleExportAllData = () => {
    const allData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      decks: decks,
      collection: collection
    }
    
    const dataStr = JSON.stringify(allData, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `mtg-backup-${new Date().toISOString().split('T')[0]}.json`
    link.click()
    URL.revokeObjectURL(url)
    
    alert(`✅ Backup created!\n\n${decks.length} decks\n${collection.length} unique cards\n${collection.reduce((s,c) => s+c.quantity, 0)} total cards`)
  }

  const handleImportAllData = (event) => {
    const file = event.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const importedData = JSON.parse(e.target.result)
        
        if (!importedData.decks || !importedData.collection) {
          throw new Error('Invalid backup file format')
        }
        
        const deckCount = importedData.decks.length
        const cardCount = importedData.collection.length
        const totalCards = importedData.collection.reduce((sum, c) => sum + c.quantity, 0)
        
        if (window.confirm(`📂 Import backup with:\n\n${deckCount} decks\n${cardCount} unique cards\n${totalCards} total cards\n\n⚠️ This will REPLACE all current data!\n\nContinue?`)) {
          setDecks(importedData.decks)
          setCollection(importedData.collection)
          alert('✅ Backup restored successfully!')
          setView('deck')
        }
      } catch (err) {
        alert('❌ Failed to import backup:\n\n' + err.message)
      }
    }
    reader.readAsText(file)
    event.target.value = '' // Reset input
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-top">
          <h1>🎴 MTG Deck Analyzer</h1>
          <div className="backup-buttons">
            <button 
              className="backup-btn undo-btn" 
              onClick={handleUndo}
              disabled={!lastAction}
              title={lastAction ? 'Undo last action' : 'Nothing to undo'}
            >
              ↩️ Undo
            </button>
            <button className="backup-btn manabox-btn" onClick={() => setShowManaboxImporter(true)}>
              📥 Import Deck
            </button>
            <button className="backup-btn" onClick={handleExportAllData}>
              💾 Backup
            </button>
            <label className="backup-btn import-label">
              📂 Restore
              <input 
                type="file" 
                accept=".json" 
                onChange={handleImportAllData}
                style={{ display: 'none' }}
              />
            </label>
          </div>
        </div>
        <nav className="nav-buttons">
          <button 
            className={view === 'import' ? 'active' : ''} 
            onClick={() => setView('import')}
          >
            Import Deck
          </button>
          <button 
            className={view === 'deck' ? 'active' : ''} 
            onClick={() => setView('deck')}
            disabled={decks.length === 0}
          >
            My Decks ({decks.length})
          </button>
          <button 
            className={view === 'collection' ? 'active' : ''} 
            onClick={() => setView('collection')}
          >
            Collection ({collection.reduce((sum, c) => sum + c.quantity, 0)})
          </button>
          <button 
            className={view === 'analyze' ? 'active' : ''} 
            onClick={() => setView('analyze')}
            disabled={!currentDeck}
          >
            AI Analysis
          </button>
        </nav>
      </header>

      <main className="app-main">
        {view === 'import' && (
          <DeckImporter onImport={handleDeckImport} />
        )}

        {view === 'deck' && (
          <DeckViewer 
            decks={decks}
            currentDeck={currentDeck}
            setCurrentDeck={setCurrentDeck}
            onDeleteDeck={handleDeleteDeck}
            onUpdateDeck={handleUpdateDeck}
            onAddToCollection={handleAddToCollection}
          />
        )}

        {view === 'collection' && (
          <CollectionManager 
            collection={collection}
            setCollection={setCollection}
            decks={decks}
          />
        )}

        {view === 'analyze' && currentDeck && (
          <AIAnalyzer 
            deck={currentDeck}
            collection={collection}
            decks={decks}
          />
        )}
      </main>

      {showManaboxImporter && (
        <ManaboxImporter 
          onImport={handleManaboxImport}
          onClose={() => setShowManaboxImporter(false)}
        />
      )}
    </div>
  )
}

export default App
