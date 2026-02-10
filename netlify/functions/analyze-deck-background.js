import { getStore } from '@netlify/blobs'

exports.handler = async (event, context) => {
  // This is a background function - it has 15 minutes to complete
  // It will store results in Netlify Blobs for the frontend to retrieve
  
  const jsonResponse = (statusCode, body) => ({
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    },
    body: JSON.stringify(body)
  })

  try {
    // Handle OPTIONS for CORS
    if (event.httpMethod === 'OPTIONS') {
      return jsonResponse(200, { message: 'OK' })
    }

    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
      return jsonResponse(405, { error: 'Method not allowed' })
    }

    // Parse request body
    let requestBody
    try {
      requestBody = JSON.parse(event.body)
    } catch (parseError) {
      return jsonResponse(400, { 
        error: 'Invalid JSON in request body',
        message: parseError.message
      })
    }

    const { apiKey, deckData, analysisId } = requestBody

    if (!apiKey) {
      return jsonResponse(400, { error: 'API key is required' })
    }

    if (!deckData) {
      return jsonResponse(400, { error: 'Deck data is required' })
    }

    if (!analysisId) {
      return jsonResponse(400, { error: 'Analysis ID is required' })
    }

    console.log(`Starting background analysis ${analysisId}...`)

    // Store initial status
    const store = getStore('deck-analyses')
    await store.set(analysisId, JSON.stringify({
      status: 'processing',
      startTime: Date.now()
    }))

    // Make the request to Anthropic API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: deckData
        }]
      })
    })

    console.log('Response status:', response.status)

    const data = await response.json()

    if (!response.ok) {
      console.error('API error:', data)
      // Store error result
      await store.set(analysisId, JSON.stringify({
        status: 'error',
        error: data,
        timestamp: Date.now()
      }))
      return jsonResponse(200, { message: 'Analysis failed, error stored' })
    }

    console.log('Success! Storing result...')
    
    // Store successful result
    await store.set(analysisId, JSON.stringify({
      status: 'complete',
      result: data,
      timestamp: Date.now()
    }))

    return jsonResponse(200, { message: 'Analysis complete' })

  } catch (error) {
    console.error('Function error:', error)
    
    // Try to store error if we have analysisId
    try {
      const { analysisId } = JSON.parse(event.body)
      if (analysisId) {
        const store = getStore('deck-analyses')
        await store.set(analysisId, JSON.stringify({
          status: 'error',
          error: error.message,
          timestamp: Date.now()
        }))
      }
    } catch (storeError) {
      console.error('Could not store error:', storeError)
    }
    
    return jsonResponse(500, { 
      error: 'Internal server error',
      message: error.message
    })
  }
}
