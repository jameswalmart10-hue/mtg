// Smart Collection Filter
// Uses deck needs from Step 1 AI analysis to filter collection
// All filtering happens IN THE BROWSER - instant, no API calls needed

export function filterCollectionByNeeds(collection, needs, deckCards) {
  console.log('=== COLLECTION FILTER START ===')
  console.log('Collection size:', collection.length)
  console.log('Deck needs:', needs)

  // Build a set of card names already in the deck for exclusion
  const deckCardNames = new Set(deckCards.map(c => c.name.toLowerCase()))

  // Score each card based on how well it matches the deck's needs
  const scoredCards = collection
    .filter(card => !deckCardNames.has(card.name?.toLowerCase())) // exclude cards already in deck
    .map(card => {
      const score = scoreCard(card, needs)
      return { ...card, relevanceScore: score }
    })
    .filter(card => card.relevanceScore > 0) // only keep relevant cards
    .sort((a, b) => b.relevanceScore - a.relevanceScore) // highest score first

  console.log(`Scored ${scoredCards.length} relevant cards from ${collection.length} total`)
  console.log('Top 10 scores:', scoredCards.slice(0, 10).map(c => `${c.name}: ${c.relevanceScore}`))

  // Take top 200 most relevant cards
  const filtered = scoredCards.slice(0, 100)

  console.log(`Sending ${filtered.length} cards to AI for final analysis`)
  console.log('=== COLLECTION FILTER COMPLETE ===')

  return filtered
}

function scoreCard(card, needs) {
  let score = 0
  const nameLower = (card.name || '').toLowerCase()
  const oracleLower = (card.oracleText || '').toLowerCase()
  const typeLower = (card.type || '').toLowerCase()
  const keywords = card.keywords || []
  const keywordsLower = keywords.map(k => k.toLowerCase())

  // --- SYNERGY ORACLE TERMS (highest priority) ---
  // These are deck-specific synergy words the AI identified
  if (needs.synergyOracleTerms?.length > 0) {
    needs.synergyOracleTerms.forEach(term => {
      const termLower = term.toLowerCase()
      if (oracleLower.includes(termLower) || nameLower.includes(termLower)) {
        score += 15 // big bonus for synergy terms
      }
    })
  }

  // --- WANTED KEYWORDS ---
  if (needs.wantedKeywords?.length > 0) {
    needs.wantedKeywords.forEach(keyword => {
      if (keywordsLower.includes(keyword.toLowerCase())) {
        score += 10
      }
    })
  }

  // --- WANTED CREATURE TYPES ---
  if (needs.wantedCreatureTypes?.length > 0) {
    needs.wantedCreatureTypes.forEach(type => {
      if (typeLower.includes(type.toLowerCase())) {
        score += 12
      }
    })
  }

  // --- ADDITIONAL ORACLE TERMS ---
  if (needs.additionalOracleTerms?.length > 0) {
    needs.additionalOracleTerms.forEach(term => {
      if (oracleLower.includes(term.toLowerCase())) {
        score += 8
      }
    })
  }

  // --- ROLE-BASED SCORING ---

  // Removal (if needed)
  if (needs.needsRemoval) {
    const removalTerms = ['destroy target', 'exile target', 'return target', '-x/-x', 'deals damage to target']
    if (removalTerms.some(term => oracleLower.includes(term))) {
      score += 12
    }
  }

  // Ramp (if needed)
  if (needs.needsRamp) {
    const rampTerms = ['add {', 'search your library for a', 'land', 'mana', 'tap: add']
    const isLandOrRamp = rampTerms.some(term => oracleLower.includes(term)) && 
                         (typeLower.includes('artifact') || typeLower.includes('creature') || typeLower.includes('enchantment'))
    if (isLandOrRamp) {
      score += 10
    }
    // Also score mana rocks
    if (typeLower.includes('artifact') && oracleLower.includes('{t}: add')) {
      score += 12
    }
  }

  // Card draw (if needed)
  if (needs.needsCardDraw) {
    const drawTerms = ['draw a card', 'draw two', 'draw three', 'draw cards', 'draws a card']
    if (drawTerms.some(term => oracleLower.includes(term))) {
      score += 12
    }
  }

  // Board wipes (if needed)
  if (needs.needsBoardWipes) {
    const wipeTerms = ['destroy all', 'exile all', 'each creature gets', 'all creatures']
    if (wipeTerms.some(term => oracleLower.includes(term))) {
      score += 15
    }
  }

  // Counterspells (if needed)
  if (needs.needsCounterspells) {
    if (oracleLower.includes('counter target spell') || oracleLower.includes('counter target creature')) {
      score += 15
    }
  }

  // Protection (if needed)
  if (needs.needsProtection) {
    const protectTerms = ['hexproof', 'indestructible', 'protection from', 'shroud', 'regenerate']
    if (protectTerms.some(term => oracleLower.includes(term) || keywordsLower.includes(term))) {
      score += 10
    }
  }

  // Graveyard synergy (if needed)
  if (needs.needsGraveyard) {
    const graveTerms = ['graveyard', 'return from', 'from your graveyard', 'dies', 'when ~ dies']
    if (graveTerms.some(term => oracleLower.includes(term))) {
      score += 10
    }
  }

  // Tokens (if needed)
  if (needs.needsTokens) {
    if (oracleLower.includes('create') && oracleLower.includes('token')) {
      score += 12
    }
  }

  // Tutors (if needed)
  if (needs.needsTutor) {
    if (oracleLower.includes('search your library') && oracleLower.includes('put it into your hand')) {
      score += 15
    }
  }

  // Land fetch (if needed)
  if (needs.needsLandFetch) {
    if (oracleLower.includes('search your library for a') && oracleLower.includes('land')) {
      score += 12
    }
  }

  // --- BIG CREATURES (if needed) ---
  if (needs.wantBigCreatures && needs.minPower) {
    const power = parseInt(card.power)
    if (!isNaN(power) && power >= needs.minPower) {
      score += 8
    }
  }

  // --- CMC CURVE BONUS ---
  // If deck is top-heavy, bonus for low CMC cards
  const cmcNote = (needs.cmcCurveNote || '').toLowerCase()
  const cmc = card.cmc || 0
  if (cmcNote.includes('top-heavy') || cmcNote.includes('expensive')) {
    if (cmc <= 3) score += 5
  }
  if (cmcNote.includes('too low') || cmcNote.includes('needs threats')) {
    if (cmc >= 5) score += 5
  }

  return score
}

// Build a human-readable summary of what was found
export function buildFilterSummary(filteredCards, needs) {
  const categories = {
    synergy: filteredCards.filter(c => c.relevanceScore >= 15).length,
    removal: filteredCards.filter(c => 
      (c.oracleText || '').toLowerCase().includes('destroy target') ||
      (c.oracleText || '').toLowerCase().includes('exile target')
    ).length,
    ramp: filteredCards.filter(c =>
      (c.oracleText || '').toLowerCase().includes('{t}: add') ||
      (c.oracleText || '').toLowerCase().includes('search your library for a') && (c.oracleText || '').toLowerCase().includes('land')
    ).length,
    draw: filteredCards.filter(c =>
      (c.oracleText || '').toLowerCase().includes('draw a card') ||
      (c.oracleText || '').toLowerCase().includes('draw two cards')
    ).length
  }

  return `Found ${filteredCards.length} relevant cards: ${categories.synergy} high-synergy, ${categories.removal} removal, ${categories.ramp} ramp, ${categories.draw} card draw`
}
