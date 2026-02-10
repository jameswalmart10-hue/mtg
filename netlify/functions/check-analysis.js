import { getStore } from '@netlify/blobs'

exports.handler = async (event, context) => {
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

    const { analysisId } = requestBody

    if (!analysisId) {
      return jsonResponse(400, { error: 'Analysis ID is required' })
    }

    // Check for result in Netlify Blobs
    const store = getStore('deck-analyses')
    const resultString = await store.get(analysisId)

    if (!resultString) {
      // No result yet - still processing or doesn't exist
      return jsonResponse(200, { status: 'pending' })
    }

    const result = JSON.parse(resultString)
    
    return jsonResponse(200, result)

  } catch (error) {
    console.error('Status check error:', error)
    return jsonResponse(500, { 
      error: 'Internal server error',
      message: error.message
    })
  }
}
