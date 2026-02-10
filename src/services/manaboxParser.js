// Manabox Format Parser
// Parses Manabox export format: "1 Sol Ring (DOM) 25"

export class ManaboxParser {
  parse(text) {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0)
    
    const deck = {
      commander: [],
      cards: [],
      errors: []
    }
    
    let currentSection = 'main'
    
    for (const line of lines) {
      // Check for section markers
      if (line.startsWith('//')) {
        const section = line.substring(2).trim().toLowerCase()
        if (section === 'commander') {
          currentSection = 'commander'
        } else {
          currentSection = 'main'
        }
        continue
      }
      
      // Parse card line: "1 Sol Ring (DOM) 25"
      const parsed = this.parseCardLine(line)
      
      if (parsed) {
        if (currentSection === 'commander') {
          deck.commander.push(parsed)
        } else {
          deck.cards.push(parsed)
        }
      } else if (line.length > 0 && !line.startsWith('//')) {
        deck.errors.push({ line, reason: 'Could not parse format' })
      }
    }
    
    return deck
  }
  
  parseCardLine(line) {
    // Format: "1 Sol Ring (DOM) 25"
    // Or: "1 Sol Ring"
    // Or: "1x Sol Ring (DOM) 25"
    
    // Try to match: QUANTITY NAME (SET) NUMBER
    const fullMatch = line.match(/^(\d+)x?\s+(.+?)\s*\(([A-Z0-9]+)\)\s*(\d+)/)
    
    if (fullMatch) {
      return {
        quantity: parseInt(fullMatch[1]),
        name: fullMatch[2].trim(),
        set: fullMatch[3],
        collectorNumber: fullMatch[4]
      }
    }
    
    // Try to match: QUANTITY NAME (no set info)
    const simpleMatch = line.match(/^(\d+)x?\s+(.+)/)
    
    if (simpleMatch) {
      return {
        quantity: parseInt(simpleMatch[1]),
        name: simpleMatch[2].trim(),
        set: null,
        collectorNumber: null
      }
    }
    
    return null
  }
  
  // Extract just card names for bulk lookup
  extractCardNames(parsedDeck) {
    const names = []
    
    // Add commanders
    parsedDeck.commander.forEach(card => {
      names.push(card.name)
    })
    
    // Add other cards
    parsedDeck.cards.forEach(card => {
      names.push(card.name)
    })
    
    // Remove duplicates
    return [...new Set(names)]
  }
  
  // Merge parsed deck with Scryfall data
  mergeScryfallData(parsedDeck, scryfallResults) {
    const { found, notFound } = scryfallResults
    
    // Create lookup map
    const cardMap = new Map()
    found.forEach(card => {
      cardMap.set(card.name.toLowerCase(), card)
    })
    
    // Merge commanders
    const enhancedCommanders = parsedDeck.commander.map(card => {
      const scryfallData = cardMap.get(card.name.toLowerCase())
      if (scryfallData) {
        return {
          ...card,
          scryfallId: scryfallData.id,
          type: scryfallData.type_line,
          oracleText: scryfallData.oracle_text,
          cmc: scryfallData.cmc,
          manaCost: scryfallData.mana_cost,
          colors: scryfallData.colors,
          colorIdentity: scryfallData.color_identity,
          power: scryfallData.power,
          toughness: scryfallData.toughness,
          keywords: scryfallData.keywords,
          imageUrl: scryfallData.image_uris?.normal || null
        }
      }
      return { ...card, notFound: true }
    })
    
    // Merge other cards
    const enhancedCards = parsedDeck.cards.map(card => {
      const scryfallData = cardMap.get(card.name.toLowerCase())
      if (scryfallData) {
        return {
          ...card,
          scryfallId: scryfallData.id,
          type: scryfallData.type_line,
          oracleText: scryfallData.oracle_text,
          cmc: scryfallData.cmc,
          manaCost: scryfallData.mana_cost,
          colors: scryfallData.colors,
          colorIdentity: scryfallData.color_identity,
          power: scryfallData.power,
          toughness: scryfallData.toughness,
          keywords: scryfallData.keywords,
          imageUrl: scryfallData.image_uris?.normal || null
        }
      }
      return { ...card, notFound: true }
    })
    
    return {
      commander: enhancedCommanders,
      cards: enhancedCards,
      notFound: notFound,
      errors: parsedDeck.errors
    }
  }
}

export default new ManaboxParser()
