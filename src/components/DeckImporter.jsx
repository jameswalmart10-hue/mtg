import { useState } from 'react'
import './DeckImporter.css'

function DeckImporter({ onImport }) {
  const [deckText, setDeckText] = useState('')
  const [deckName, setDeckName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const parseDeckList = (text) => {
    const cards = []
    const cardMap = new Map() // Use Map to deduplicate by set+number
    let commander = null

    // Remove the header if present
    let cleanText = text.replace(/1x\s*\/\/\s*COMMANDER\s*/i, '').trim()
    
    // Remove *F* foil markers
    cleanText = cleanText.replace(/\s*\*F\*\s*/g, ' ')

    // Pattern to match: "1 Card Name (SET) 123 " or "2 Card Name (SET) 123 "
    // Captures: quantity, card name, set code, collector number
    const cardPattern = /(\d+)\s+([^(]+?)\s+\(([A-Z0-9]+)\)\s+(\d+)(?=\s+\d+|\s*$)/g
    
    let match
    while ((match = cardPattern.exec(cleanText)) !== null) {
      const [, quantity, name, set, collectorNumber] = match
      
      const cardKey = `${set.toUpperCase()}-${collectorNumber.trim()}`
      
      const card = {
        quantity: parseInt(quantity),
        name: name.trim(),
        set: set.toUpperCase(),
        collectorNumber: collectorNumber.trim()
      }

      // Deduplicate - if we already saw this card, combine quantities
      if (cardMap.has(cardKey)) {
        const existing = cardMap.get(cardKey)
        existing.quantity += card.quantity
        console.warn(`Duplicate card found: ${card.name} - combining quantities`)
      } else {
        cardMap.set(cardKey, card)
        
        // First card is the commander
        if (!commander && cards.length === 0) {
          commander = card
        }
      }
    }
    
    // Convert map to array
    const deduplicatedCards = Array.from(cardMap.values())

    return { cards: deduplicatedCards, commander }
  }

  const fetchCardData = async (card) => {
    try {
      // Use Scryfall API to get card data
      const url = `https://api.scryfall.com/cards/${card.set.toLowerCase()}/${card.collectorNumber}`
      const response = await fetch(url)
      
      if (!response.ok) {
        throw new Error(`Card not found: ${card.name}`)
      }

      const data = await response.json()
      
      return {
        ...card,
        scryfallId: data.id,
        imageUrl: data.image_uris?.normal || data.card_faces?.[0]?.image_uris?.normal,
        manaCost: data.mana_cost,
        type: data.type_line,
        oracleText: data.oracle_text,
        colors: data.colors || [],
        colorIdentity: data.color_identity || [], // CRITICAL: This is what Commander uses!
        cmc: data.cmc
      }
    } catch (err) {
      console.error('Error fetching card:', card.name, err)
      return {
        ...card,
        error: err.message
      }
    }
  }

  const handleImport = async () => {
    if (!deckText.trim()) {
      setError('Please paste your deck list')
      return
    }

    setLoading(true)
    setError('')

    try {
      const { cards } = parseDeckList(deckText)
      
      if (cards.length === 0) {
        setError('No cards found. Make sure your deck list is in the correct format.')
        setLoading(false)
        return
      }

      // Fetch card data for all cards (with delay to respect API rate limits)
      const cardsWithData = []
      for (const card of cards) {
        const cardData = await fetchCardData(card)
        cardsWithData.push(cardData)
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 50))
      }

      const finalDeck = {
        name: deckName || `Imported Deck ${new Date().toLocaleDateString()}`,
        cards: cardsWithData
      }

      onImport(finalDeck)
      
      // Clear form
      setDeckText('')
      setDeckName('')
    } catch (err) {
      setError(`Import failed: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="deck-importer">
      <div className="importer-card">
        <h2>Import Your Deck</h2>
        <p className="instructions">
          Paste your deck list. Supports both formats:<br/>
          <code>1 Card Name (SET) 123</code> or <code>Card Name (SET) 123 1</code>
        </p>

        <input
          type="text"
          className="deck-name-input"
          placeholder="Deck Name (optional)"
          value={deckName}
          onChange={(e) => setDeckName(e.target.value)}
          disabled={loading}
        />

        <textarea
          className="deck-input"
          placeholder="1 Sauron, the Dark Lord (LTR) 224
1 Command Tower (LTC) 301
1 Sol Ring (C21) 263

OR

Sauron, the Dark Lord (LTR) 224 1
Command Tower (LTC) 301 1
Sol Ring (C21) 263 1
..."
          value={deckText}
          onChange={(e) => setDeckText(e.target.value)}
          disabled={loading}
          rows={15}
        />

        {error && (
          <div className="error-message">
            ⚠️ {error}
          </div>
        )}

        <button 
          className="import-button"
          onClick={handleImport}
          disabled={loading || !deckText.trim()}
        >
          {loading ? 'Importing...' : 'Import Deck'}
        </button>

        {loading && (
          <div className="loading-status">
            Fetching card data from Scryfall...
          </div>
        )}
      </div>
    </div>
  )
}

export default DeckImporter
