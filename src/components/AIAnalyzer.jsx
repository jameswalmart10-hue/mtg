import { useState } from 'react'
import './AIAnalyzer.css'
import { filterCollectionByNeeds, buildFilterSummary } from '../services/collectionFilter'

function AIAnalyzer({ deck, collection, decks }) {
  const [apiKey, setApiKey] = useState(localStorage.getItem('anthropic_api_key') || '')
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showApiKeyInput, setShowApiKeyInput] = useState(!localStorage.getItem('anthropic_api_key'))
  const [showPrompt, setShowPrompt] = useState(false)

  // Calculate available copies (owned - in use across all decks)
  const getAvailableCards = () => {
    return collection.map(card => {
      let inUse = 0
      decks.forEach(d => {
        const deckCard = d.cards.find(c => c.scryfallId === card.scryfallId)
        if (deckCard) {
          inUse += deckCard.quantity
        }
      })
      return {
        ...card,
        available: card.quantity - inUse
      }
    }).filter(card => card.available > 0) // Only include cards with available copies
  }

  const saveApiKey = () => {
    localStorage.setItem('anthropic_api_key', apiKey)
    setShowApiKeyInput(false)
  }

  const formatDeckForAI = () => {
    // Find the commander(s) - handle partner commanders
    const commanders = deck.cards.filter((card, index) => 
      index === 0 || // First card is always commander
      (card.type?.toLowerCase().includes('legendary') && 
       card.type?.toLowerCase().includes('creature') &&
       index < 2) // Second card if it's legendary creature (partner)
    )
    
    const commander = commanders[0]
    const partnerCommander = commanders.length > 1 ? commanders[1] : null
    
    // Extract color identity from commander(s)
    const getColorIdentity = (cards) => {
      const colors = new Set()
      cards.forEach(card => {
        // Use colorIdentity field (what Commander rules use) not colors field
        if (card.colorIdentity && Array.isArray(card.colorIdentity)) {
          card.colorIdentity.forEach(c => colors.add(c))
        }
      })
      return Array.from(colors).sort()
    }
    
    const colorIdentity = getColorIdentity(commanders)
    const colorNames = {
      'W': 'White',
      'U': 'Blue', 
      'B': 'Black',
      'R': 'Red',
      'G': 'Green'
    }
    const identityString = colorIdentity.length > 0 
      ? colorIdentity.map(c => colorNames[c] || c).join(', ')
      : 'Colorless'
    
    const deckList = deck.cards.map(card => 
      `${card.quantity}x ${card.name} - ${card.type} - ${card.manaCost || 'N/A'}`
    ).join('\n')

    const availableCards = getAvailableCards()
    
    // Filter available cards by color identity (CRITICAL FOR COMMANDER)
    const legalCards = availableCards.filter(card => {
      // Cards with no color identity (empty array) are truly colorless - legal in any deck
      const cardCI = card.colorIdentity || card.color_identity || []
      if (cardCI.length === 0) return true
      return cardCI.every(color => colorIdentity.includes(color))
    })
    
    const illegalCount = availableCards.length - legalCards.length
    
    // FULL COLLECTION SCAN - No more 500 card limit!
    // Background functions have 15 minute timeout, can handle full collection
    // Include oracle text so AI can actually READ what cards do
    const fullCollectionList = legalCards.map(card => 
      `${card.name} | ${card.type || 'Unknown'} | ${card.cmc || 0} CMC | ${card.oracleText || 'No text'}`
    ).join('\n')
    
    const availableList = legalCards.length > 0
      ? `\n\n=== YOUR FULL COLLECTION (${legalCards.length} LEGAL CARDS) ===
The AI will scan your ENTIRE collection and identify the TOP 100 most synergistic cards for your commander's strategy.

${fullCollectionList}

=== END COLLECTION ===${illegalCount > 0 ? `\n\nNOTE: ${illegalCount} cards in your collection are ILLEGAL (wrong color identity) and not shown.` : ''}`
      : '\n\n=== NO LEGAL CARDS AVAILABLE ===\nAll cards in your collection that match your color identity are in use in other decks.\n=== END COLLECTION ==='

    // Count card types for role analysis
    const cardTypes = {
      removal: deck.cards.filter(c => 
        c.oracleText?.toLowerCase().includes('destroy') || 
        c.oracleText?.toLowerCase().includes('exile') ||
        c.type?.toLowerCase().includes('removal')
      ).length,
      ramp: deck.cards.filter(c => 
        c.oracleText?.toLowerCase().includes('add') && c.oracleText?.toLowerCase().includes('mana') ||
        c.type?.toLowerCase().includes('mana')
      ).length,
      draw: deck.cards.filter(c => 
        c.oracleText?.toLowerCase().includes('draw') ||
        c.type?.toLowerCase().includes('draw')
      ).length,
      flying: deck.cards.filter(c =>
        c.oracleText?.toLowerCase().includes('flying')
      ).length,
      reach: deck.cards.filter(c =>
        c.oracleText?.toLowerCase().includes('reach')
      ).length
    }

    // Mana curve analysis (exclude lands, they don't have CMC)
    const nonLandCards = deck.cards.filter(c => 
      !c.type?.toLowerCase().includes('land') && 
      typeof c.cmc === 'number'
    )
    
    const manaCurve = {
      low: nonLandCards.filter(c => c.cmc >= 0 && c.cmc <= 2).length,
      mid: nonLandCards.filter(c => c.cmc >= 3 && c.cmc <= 4).length,
      high: nonLandCards.filter(c => c.cmc >= 5).length
    }

    // Creature analysis (also exclude lands)
    const creatures = deck.cards.filter(c => 
      c.type?.toLowerCase().includes('creature') &&
      !c.type?.toLowerCase().includes('land')
    )

    return `ANALYZE COMMANDER DECK

COMMANDER: ${commander.name}
${commander.oracleText ? `ABILITY: ${commander.oracleText}` : ''}
${partnerCommander ? `PARTNER: ${partnerCommander.name}${partnerCommander.oracleText ? ` | ${partnerCommander.oracleText}` : ''}` : ''}
COLOR IDENTITY: ${colorIdentity.join('') || 'Colorless'}

CURRENT DECK (${deck.cards.reduce((sum, c) => sum + c.quantity, 0)} cards):
${deckList}

CURRENT STATS:
- Card Draw: ${cardTypes.draw} (need 10-12, or 6-8 if commander provides)
- Ramp: ${cardTypes.ramp} (need 10-12, or 6-8 if commander provides)
- Removal: ${cardTypes.removal} (need 8-10, or 5-7 if commander provides)
- Flying: ${cardTypes.flying} | Reach: ${cardTypes.reach} | Combined Air Defense: ${cardTypes.flying + cardTypes.reach} (need 8+ total)
- Mana Curve: ${manaCurve.low} low (0-2), ${manaCurve.mid} mid (3-4), ${manaCurve.high} high (5+)

AVAILABLE COLLECTION (${legalCards.length} cards):
${fullCollectionList}

=== HARD RULES (NEVER VIOLATE) ===

RULE 1 - COLOR IDENTITY: COLOR IDENTITY IS ${colorIdentity.join('') || 'Colorless'}.
Only suggest cards that fit within this exact color identity.
A card is ILLEGAL if it contains any mana symbol not in the commander's identity.
This applies to ALL suggested additions. No exceptions.

RULE 2 - COLLECTION ONLY: ONLY suggest cards that appear VERBATIM in the collection list above.
Do NOT suggest cards from your own knowledge. Do NOT suggest cards not in the list.
If a card is not in the collection list above, it CANNOT be suggested. Period.

RULE 3 - FLYING/REACH PROTECTION:
Current air defense: ${cardTypes.flying} flying + ${cardTypes.reach} reach = ${cardTypes.flying + cardTypes.reach} total
- If combined flying+reach is BELOW 8: DO NOT cut ANY flying or reach creatures. Add more instead.
- If combined flying+reach is 8-12: May cut flying/reach ONLY if replacing with another flying/reach card.
- If combined flying+reach is ABOVE 12: May cut excess, replace with non-flying cards.
Flying and reach BOTH count as air defense. Treat them equally.

RULE 4 - COMMANDER ANALYSIS FIRST:
Read the commander's oracle text carefully. Identify what it does EVERY TURN:
- Does it draw cards on trigger? -> Card draw minimum drops to 6-8
- Does it make mana or cheat costs? -> Ramp minimum drops to 6-8  
- Does it remove permanents? -> Removal minimum drops to 5-7
- Does it have flying/reach itself? -> Counts toward air defense
Current counts: Draw=${cardTypes.draw}, Ramp=${cardTypes.ramp}, Removal=${cardTypes.removal}
ONLY flag a category as a "gap" if it is BELOW the adjusted minimum for this commander.

RULE 5 - NO CONTRADICTIONS:
If a category is ABOVE its maximum -> remove excess, DO NOT also add more of that category.
If a category is BELOW its minimum -> add more, DO NOT also remove from that category.
Never say "too much X" and also "add more X" in the same analysis.

RULE 6 - CARD COMPOSITION CHECK:
Before suggesting any card, verify it works with this deck:
- Sacrifice synergies require sacrifice outlets or expendable creatures already in deck
- Tribal payoffs require 15+ of that creature type already in deck
- Board wipes are bad if deck has 30+ creatures - suggest spot removal instead
- Spell synergies require 20+ instants/sorceries already in deck

=== ANALYSIS STEPS ===

STEP 1: Read commander oracle text. List what roles it fills (draw/ramp/removal/evasion).
STEP 2: Calculate adjusted minimums based on commander role.
STEP 3: Count current draw/ramp/removal/flying+reach against adjusted minimums.
STEP 4: Identify ONLY true gaps (below adjusted minimum).
STEP 5: Scan collection for cards that fill gaps AND fit color identity AND are in the list.
STEP 6: Identify cuts - prefer cutting cards that are redundant, overcosted, or low synergy.
STEP 7: Verify every suggestion: Is it in the collection list? Does it match color identity?

=== RESPONSE FORMAT ===

**1. COMMANDER ANALYSIS**
- What the commander does each turn (be specific about triggers/abilities)
- Roles filled: [draw/ramp/removal/evasion - list which apply]
- Adjusted minimums: Draw=[X], Ramp=[X], Removal=[X]

**2. CURRENT STATS vs ADJUSTED MINIMUMS**
- Card Draw: ${cardTypes.draw} (adjusted minimum: X) - [OK / BELOW / EXCESSIVE]
- Ramp: ${cardTypes.ramp} (adjusted minimum: X) - [OK / BELOW / EXCESSIVE]
- Removal: ${cardTypes.removal} (adjusted minimum: X) - [OK / BELOW / EXCESSIVE]
- Air Defense: ${cardTypes.flying + cardTypes.reach} flying+reach (need 8+) - [OK / BELOW / EXCESSIVE]

**3. RECOMMENDED ADDITIONS** (ONLY from collection list, ONLY matching color identity)
- Card name | Why it helps | What gap it fills

**4. RECOMMENDED CUTS**
- Card name | Why it's the weakest link

**5. SUMMARY**
- Remove X, Add X (must be equal)
- Key improvements`
  }

  const analyzeWithAI = async () => {
    if (!apiKey) {
      setError('Please enter your Anthropic API key')
      setShowApiKeyInput(true)
      return
    }

    setLoading(true)
    setError('')
    setAnalysis(null)

    try {
      // ==========================================
      // STEP 1: Understand the deck (fast, ~5-10 sec)
      // ==========================================
      console.log('Step 1: Analyzing deck needs...')
      setError('🧠 Step 1/3: Understanding your deck strategy...')

      const deckInfo = formatDeckForAI()
      const commanders = deck.cards.filter((card, index) => 
        index === 0 || (card.type?.toLowerCase().includes('legendary') && 
        card.type?.toLowerCase().includes('creature') && index < 2)
      )
      const commander = commanders[0]

      const needsResponse = await fetch('/.netlify/functions/analyze-deck-needs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: apiKey,
          deck: deck,
          commander: commander
        })
      })

      if (!needsResponse.ok) {
        throw new Error(`Deck analysis failed: ${needsResponse.status}`)
      }

      const needsData = await needsResponse.json()
      const needs = needsData.needs

      console.log('Deck needs identified:', needs)
      console.log('Strategy:', needs.deckStrategy)
      console.log('Gaps:', needs.gaps)

      // ==========================================
      // STEP 2: Filter collection locally (instant)
      // ==========================================
      console.log('Step 2: Filtering collection...')
      setError('🔍 Step 2/3: Finding relevant cards in your collection...')

      const availableCards = getAvailableCards()

      // Get color identity for legal card filtering
      const getColorIdentity = (cards) => {
        const colors = new Set()
        cards.forEach(card => {
          if (card.colorIdentity && Array.isArray(card.colorIdentity)) {
            card.colorIdentity.forEach(c => colors.add(c))
          }
        })
        return Array.from(colors).sort()
      }
      const colorIdentity = getColorIdentity(commanders)

      // Filter by color identity first (check both field name variants)
      const legalCards = availableCards.filter(card => {
        const cardCI = card.colorIdentity || card.color_identity || []
        if (cardCI.length === 0) return true
        return cardCI.every(color => colorIdentity.includes(color))
      })

      // Now smart-filter by deck needs (browser-side, instant)
      const filteredCollection = filterCollectionByNeeds(legalCards, needs, deck.cards)
      const filterSummary = buildFilterSummary(filteredCollection, needs)

      console.log('Filter summary:', filterSummary)
      setError(`✅ Step 2/3: ${filterSummary}`)

      await new Promise(resolve => setTimeout(resolve, 500)) // brief pause so user sees the message

      // ==========================================
      // STEP 3: Direct streaming API call (no timeout!)
      // ==========================================
      console.log('Step 3: Starting streaming analysis...')
      setError(`🤖 Step 3/3: Analyzing ${filteredCollection.length} relevant cards...`)

      // Build the final prompt with filtered collection
      const filteredCollectionList = filteredCollection.map(card =>
        `${card.name} | ${card.type || ''} | ${card.cmc || 0}CMC | ${card.keywords?.join(', ') || ''} | ${(card.oracleText || '').substring(0, 80)}`
      ).join('\n')

      const illegalCount = availableCards.length - legalCards.length

      // Build the final prompt
      const collectionStartMarker = 'AVAILABLE COLLECTION ('
      const collectionEndMarker = '=== END COLLECTION ==='
      const startIdx = deckInfo.indexOf(collectionStartMarker)
      const endIdx = deckInfo.indexOf(collectionEndMarker)
      
      const beforeCollection = startIdx >= 0 ? deckInfo.substring(0, startIdx) : deckInfo
      const afterCollection = endIdx >= 0 ? deckInfo.substring(endIdx + collectionEndMarker.length) : ''
      
      const newCollectionSection = `AVAILABLE COLLECTION (${filteredCollection.length} pre-filtered relevant cards):
Note: Pre-selected from ${legalCards.length} legal cards based on gaps: ${needs.gaps?.join(', ') || 'general improvement'}

${filteredCollectionList}

=== END COLLECTION ===${illegalCount > 0 ? '\n\nNOTE: ' + illegalCount + ' cards excluded (wrong color identity)' : ''}`

      const finalPrompt = startIdx >= 0 
        ? beforeCollection + newCollectionSection + afterCollection
        : deckInfo + '\n\n' + newCollectionSection

      // Call Anthropic API directly from browser with streaming
      const streamResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4000,
          stream: true,
          messages: [{ role: 'user', content: finalPrompt }]
        })
      })

      if (!streamResponse.ok) {
        const errData = await streamResponse.json()
        throw new Error(`API error: ${streamResponse.status} - ${errData.error?.message || JSON.stringify(errData)}`)
      }

      // Read the streaming response
      const reader = streamResponse.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ''
      let chunkCount = 0

      setError('') // clear the status message
      setAnalysis('...') // show something immediately

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim()
            if (data === '[DONE]') continue
            try {
              const parsed = JSON.parse(data)
              if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
                fullText += parsed.delta.text
                chunkCount++
                // Update UI every 10 chunks so it feels live
                if (chunkCount % 10 === 0) {
                  setAnalysis(fullText)
                }
              }
            } catch (e) {
              // Skip unparseable lines
            }
          }
        }
      }

      // Final update with complete text
      setAnalysis(fullText)
      setLoading(false)
      console.log('Streaming analysis complete!')

    } catch (err) {
      console.error('Analysis error:', err)
      setError(`❌ Failed: ${err.message}`)
      setLoading(false)
    }
  }

  return (
    <div className="ai-analyzer">
      <div className="analyzer-header">
        <h2>🤖 AI Deck Analysis</h2>
        <p>Get strategic improvement suggestions powered by Claude</p>
      </div>

      {showApiKeyInput ? (
        <div className="api-key-section">
          <h3>Setup Anthropic API Key</h3>
          <p>
            You'll need an API key from Anthropic to use AI analysis.<br/>
            Get one at: <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer">
              console.anthropic.com
            </a>
          </p>
          <p className="api-cost-info">
            💰 Cost: ~$0.01-0.05 per analysis (Claude Sonnet 4)
          </p>
          <input
            type="password"
            className="api-key-input"
            placeholder="sk-ant-..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <div className="api-key-actions">
            <button onClick={saveApiKey} disabled={!apiKey}>
              Save API Key
            </button>
            {localStorage.getItem('anthropic_api_key') && (
              <button onClick={() => setShowApiKeyInput(false)}>
                Cancel
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="api-key-saved">
          <p>✅ API Key saved</p>
          <button onClick={() => setShowApiKeyInput(true)}>
            Change API Key
          </button>
        </div>
      )}

      <div className="analyze-section">
        <div className="deck-summary">
          <h3>Analyzing: {deck.name}</h3>
          <p>{deck.cards.reduce((sum, c) => sum + c.quantity, 0)} cards</p>
          {collection.length > 0 && (
            <p className="collection-note">
              ℹ️ {getAvailableCards().length} cards available in your collection (not in other decks)
            </p>
          )}
        </div>

        <button 
          className="analyze-button"
          onClick={analyzeWithAI}
          disabled={loading || !apiKey}
        >
          {loading ? 'Analyzing...' : '🔍 Analyze Deck'}
        </button>

        <button 
          className="debug-button"
          onClick={() => setShowPrompt(!showPrompt)}
          style={{ marginTop: '1rem' }}
        >
          {showPrompt ? '🔽 Hide AI Prompt' : '🔼 Show What AI Sees'}
        </button>

        {showPrompt && (
          <div className="prompt-display">
            <h4>AI Prompt (Debug View)</h4>
            <pre>{formatDeckForAI()}</pre>
            <p className="prompt-note">
              ℹ️ This is exactly what the AI receives. Check if all your available cards are listed.
            </p>
          </div>
        )}

        {error && (
          <div className="error-message">
            ⚠️ {error}
          </div>
        )}

        {loading && (
          <div className="loading-animation">
            <div className="spinner"></div>
            <p>Claude is analyzing your deck...</p>
          </div>
        )}

        {analysis && (
          <div className="analysis-result">
            <h3>Analysis Results</h3>
            <div className="analysis-content">
              {analysis.split('\n').map((line, index) => {
                if (line.startsWith('**') && line.endsWith('**')) {
                  return <h4 key={index}>{line.replace(/\*\*/g, '')}</h4>
                } else if (line.startsWith('###')) {
                  return <h4 key={index}>{line.replace(/###/g, '')}</h4>
                } else if (line.trim().startsWith('-') || line.trim().startsWith('•')) {
                  return <li key={index}>{line.replace(/^[-•]\s*/, '')}</li>
                } else if (line.trim()) {
                  return <p key={index}>{line}</p>
                }
                return <br key={index} />
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default AIAnalyzer
