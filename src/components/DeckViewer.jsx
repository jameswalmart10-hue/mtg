import { useState } from 'react'
import './DeckViewer.css'

function DeckViewer({ decks, currentDeck, setCurrentDeck, onDeleteDeck, onUpdateDeck, onAddToCollection }) {
  const [selectedCards, setSelectedCards] = useState([])
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [selectedImage, setSelectedImage] = useState(null)

  const handleSelectCard = (card) => {
    if (selectedCards.find(c => c.scryfallId === card.scryfallId)) {
      setSelectedCards(selectedCards.filter(c => c.scryfallId !== card.scryfallId))
    } else {
      setSelectedCards([...selectedCards, card])
    }
  }

  const handleSelectAll = () => {
    if (selectedCards.length === currentDeck.cards.length) {
      setSelectedCards([])
    } else {
      setSelectedCards([...currentDeck.cards])
    }
  }

  const handleDeleteSelected = () => {
    const remainingCards = currentDeck.cards.filter(
      card => !selectedCards.find(sc => sc.scryfallId === card.scryfallId)
    )
    
    onUpdateDeck({
      ...currentDeck,
      cards: remainingCards
    })
    
    setSelectedCards([])
  }

  const handleAddSelectedToCollection = () => {
    onAddToCollection(selectedCards)
    setSelectedCards([])
    alert(`Added ${selectedCards.length} card(s) to collection!`)
  }

  const handleDeleteDeck = () => {
    onDeleteDeck(currentDeck.id)
    setShowDeleteConfirm(false)
  }

  const getTotalCards = () => {
    return currentDeck.cards.reduce((sum, card) => sum + card.quantity, 0)
  }

  const getColorBreakdown = () => {
    const colorCounts = {}
    currentDeck.cards.forEach(card => {
      if (card.colors && card.colors.length > 0) {
        card.colors.forEach(color => {
          colorCounts[color] = (colorCounts[color] || 0) + card.quantity
        })
      } else {
        colorCounts['Colorless'] = (colorCounts['Colorless'] || 0) + card.quantity
      }
    })
    return colorCounts
  }

  if (!currentDeck) {
    return (
      <div className="deck-viewer">
        <div className="deck-list">
          <h2>Your Decks</h2>
          {decks.length === 0 ? (
            <p className="no-decks">No decks yet. Import one to get started!</p>
          ) : (
            <div className="saved-decks">
              {decks.map(deck => (
                <div 
                  key={deck.id} 
                  className="deck-card"
                  onClick={() => setCurrentDeck(deck)}
                >
                  <h3>{deck.name}</h3>
                  <p>{deck.cards.reduce((sum, c) => sum + c.quantity, 0)} cards</p>
                  <p className="deck-date">
                    {new Date(deck.createdAt).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  const colorBreakdown = getColorBreakdown()

  return (
    <div className="deck-viewer">
      <div className="deck-header">
        <div className="deck-info">
          <h2>{currentDeck.name}</h2>
          <div className="deck-stats">
            <span>🎴 {currentDeck.cards.reduce((sum, c) => sum + c.quantity, 0)} cards</span>
            <span>📊 {getTotalCards()} total cards</span>
          </div>
          <div className="color-breakdown">
            {Object.entries(colorBreakdown).map(([color, count]) => (
              <span key={color} className="color-badge">
                {color}: {count}
              </span>
            ))}
          </div>
        </div>
        
        <div className="deck-actions">
          <button onClick={() => setCurrentDeck(null)}>
            ← Back to Decks
          </button>
          <button 
            className="danger-button"
            onClick={() => setShowDeleteConfirm(true)}
          >
            🗑️ Delete Deck
          </button>
        </div>
      </div>

      {selectedCards.length > 0 && (
        <div className="selection-toolbar">
          <span>{selectedCards.length} card(s) selected</span>
          <div className="selection-actions">
            <button onClick={handleSelectAll}>
              {selectedCards.length === currentDeck.cards.length ? 'Deselect All' : 'Select All'}
            </button>
            <button onClick={handleAddSelectedToCollection}>
              Add to Collection
            </button>
            <button 
              className="danger-button"
              onClick={handleDeleteSelected}
            >
              Remove from Deck
            </button>
          </div>
        </div>
      )}

      <div className="cards-grid">
        {currentDeck.cards.map((card, index) => (
          <div 
            key={`${card.scryfallId}-${index}`}
            className={`card-item ${selectedCards.find(c => c.scryfallId === card.scryfallId) ? 'selected' : ''}`}
            onClick={() => handleSelectCard(card)}
          >
            {card.imageUrl ? (
              <img 
                src={card.imageUrl} 
                alt={card.name}
              />
            ) : (
              <div className="card-placeholder">
                <p>{card.name}</p>
                <small>{card.set} #{card.collectorNumber}</small>
              </div>
            )}
            <div className="card-quantity">x{card.quantity}</div>
            {selectedCards.find(c => c.scryfallId === card.scryfallId) && (
              <div className="selected-indicator">✓</div>
            )}
          </div>
        ))}
      </div>

      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Deck?</h3>
            <p>Are you sure you want to delete "{currentDeck.name}"?</p>
            <p>This cannot be undone.</p>
            <div className="modal-actions">
              <button onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
              <button className="danger-button" onClick={handleDeleteDeck}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedImage && (
        <div className="modal-overlay" onClick={() => setSelectedImage(null)}>
          <img 
            src={selectedImage} 
            alt="Card preview" 
            className="card-preview"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}

export default DeckViewer
