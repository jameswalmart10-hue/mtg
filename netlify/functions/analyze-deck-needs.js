// Step 1: Analyze deck and return structured needs
// Fast function (30-second timeout) - just reads the deck, no collection needed
// Returns JSON telling us exactly what keywords/synergies/creature types to look for

const Anthropic = require('@anthropic-ai/sdk')

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  }

  try {
    const { deck, commander } = JSON.parse(event.body)

    if (!deck || !commander) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing deck or commander' })
      }
    }

    const client = new Anthropic()

    // Build a compact deck list with oracle text
    const deckList = deck.cards.map(card =>
      `${card.name} | ${card.type || ''} | ${card.cmc || 0}CMC | ${card.keywords?.join(', ') || ''} | ${card.oracleText || ''}`
    ).join('\n')

    const commanderInfo = `${commander.name} | ${commander.type || ''} | ${commander.oracleText || ''}`

    const prompt = `You are a Magic: The Gathering Commander deck analyst.

COMMANDER:
${commanderInfo}

CURRENT DECK (${deck.cards.length} cards):
${deckList}

Analyze this deck thoroughly and return ONLY a JSON object (no other text) with this exact structure:

{
  "deckStrategy": "2-3 sentence summary of what this deck is trying to do",
  "gaps": ["specific gap 1", "specific gap 2", "specific gap 3"],
  
  "wantedKeywords": ["Flying", "Lifelink"],
  
  "synergyOracleTerms": ["wall", "defender", "toughness"],
  
  "wantedCreatureTypes": ["Wall", "Wizard"],
  
  "wantBigCreatures": false,
  "minPower": null,
  
  "needsRemoval": true,
  "needsRamp": true, 
  "needsCardDraw": true,
  "needsBoardWipes": false,
  "needsCounterspells": false,
  "needsProtection": false,
  "needsLandFetch": false,
  "needsGraveyard": false,
  "needsTokens": false,
  "needsTutor": false,
  
  "removalCount": 4,
  "rampCount": 8,
  "cardDrawCount": 5,
  
  "idealRemovalCount": 8,
  "idealRampCount": 10,
  "idealCardDrawCount": 10,
  
  "additionalOracleTerms": ["other relevant term"],
  
  "cmcCurveNote": "curve is top-heavy, needs more 2-3 drops"
}

Be precise and specific. The wantedKeywords, synergyOracleTerms, and wantedCreatureTypes will be used to search the player's card collection - so include ALL relevant terms for this deck's strategy.`

    const response = await client.messages.create({
      model: 'claude-opus-4-5-20251101',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    })

    const responseText = response.content[0].text.trim()
    console.log('Deck needs response:', responseText)

    // Parse JSON response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('AI did not return valid JSON')
    }

    const needs = JSON.parse(jsonMatch[0])

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ needs })
    }

  } catch (error) {
    console.error('Error analyzing deck needs:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    }
  }
}
