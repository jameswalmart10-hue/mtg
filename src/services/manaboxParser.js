// Manabox Format Parser
// Parses Manabox export format: "1 Sol Ring (DOM) 25"
// Also parses Manabox CSV collection export

export class ManaboxParser {
  // Auto-detect format and parse accordingly
  parse(text) {
    // Detect CSV format (has commas and header row)
    const firstLine = text.split('\n')[0].trim()
    if (firstLine.includes(',') && (firstLine.toLowerCase().includes('name') || firstLine.toLowerCase().includes('binder'))) {
      return this.parseCSV(text)
    }
    return this.parseTXT(text)
  }

  // Parse Manabox TXT deck export format
  parseTXT(text) {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0)
    
    const deck = {
      commander: [],
      cards: [],
      errors: []
    }
    
    let currentSection = 'main'
    // Track cards by name to merge duplicates (same card, different prints)
    const cardsByName = { commander: {}, main: {} }
    
    for (const line of lines) {
      if (line.startsWith('//')) {
        const section = line.substring(2).trim().toLowerCase()
        currentSection = section === 'commander' ? 'commander' : 'main'
        continue
      }
      
      const parsed = this.parseCardLine(line)
      
      if (parsed) {
        const section = currentSection
        const nameLower = parsed.name.toLowerCase()
        
        // Merge duplicates: same card name = add quantities together
        if (cardsByName[section][nameLower]) {
          cardsByName[section][nameLower].quantity += parsed.quantity
        } else {
          cardsByName[section][nameLower] = parsed
        }
      } else if (line.length > 0 && !line.startsWith('//')) {
        deck.errors.push({ line, reason: 'Could not parse format' })
      }
    }
    
    deck.commander = Object.values(cardsByName.commander)
    deck.cards = Object.values(cardsByName.main)
    
    console.log(`Parsed TXT: ${deck.commander.length} commanders, ${deck.cards.length} unique cards`)
    
    return deck
  }

  // Parse Manabox CSV collection export
  // Format: Binder Name, Binder Type, Name, Set code, Set name, Collector number, Foil, Quantity, ...
  parseCSV(text) {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0)
    
    if (lines.length < 2) {
      return { commander: [], cards: [], errors: [{ line: '', reason: 'CSV file is empty' }] }
    }
    
    // Parse header row to find column indices
    const headers = this.parseCSVLine(lines[0]).map(h => h.toLowerCase().trim())
    console.log('CSV headers:', headers)
    
    // Find relevant columns (Manabox uses various column names)
    const nameIdx = headers.findIndex(h => h === 'name' || h === 'card name')
    const qtyIdx = headers.findIndex(h => h.includes('quantity') || h.includes('qty') || h === 'count')
    const setIdx = headers.findIndex(h => h === 'set code' || h === 'set' || h === 'edition')
    const collectorIdx = headers.findIndex(h => h.includes('collector') || h.includes('number'))
    
    console.log(`CSV columns - name:${nameIdx}, qty:${qtyIdx}, set:${setIdx}, collector:${collectorIdx}`)
    
    if (nameIdx === -1) {
      return { 
        commander: [], 
        cards: [], 
        errors: [{ line: lines[0], reason: `Could not find "Name" column in CSV. Found: ${headers.join(', ')}` }] 
      }
    }
    
    const cardsByName = {}
    const errors = []
    
    for (let i = 1; i < lines.length; i++) {
      const cols = this.parseCSVLine(lines[i])
      if (cols.length < 2) continue
      
      const name = cols[nameIdx]?.trim()
      if (!name) continue
      
      const quantity = qtyIdx !== -1 ? (parseInt(cols[qtyIdx]) || 1) : 1
      const set = setIdx !== -1 ? cols[setIdx]?.trim() : null
      const collectorNumber = collectorIdx !== -1 ? cols[collectorIdx]?.trim() : null
      
      const nameLower = name.toLowerCase()
      
      if (cardsByName[nameLower]) {
        cardsByName[nameLower].quantity += quantity
      } else {
        cardsByName[nameLower] = { name, quantity, set, collectorNumber }
      }
    }
    
    const cards = Object.values(cardsByName)
    console.log(`Parsed CSV: ${cards.length} unique cards`)
    
    return { commander: [], cards, errors }
  }

  // Parse a single CSV line (handles quoted fields)
  parseCSVLine(line) {
    const result = []
    let current = ''
    let inQuotes = false
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        result.push(current)
        current = ''
      } else {
        current += char
      }
    }
    result.push(current)
    return result
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
          colorIdentity: scryfallData.colorIdentity || scryfallData.color_identity,
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
          colorIdentity: scryfallData.colorIdentity || scryfallData.color_identity,
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
