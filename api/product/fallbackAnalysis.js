import { cacheProductAnalysis } from './cache.js'
import { fetchReaderProductAnalysis } from './reader.js'
import { fetchRenderedProductAnalysis } from './rendered.js'

export async function cacheRenderedProductAnalysis(urlString) {
  const renderedAnalysis = await fetchRenderedProductAnalysis(urlString)
  return renderedAnalysis ? cacheProductAnalysis(urlString, renderedAnalysis) : null
}

export async function fetchReaderOrRenderedProductAnalysis(urlString, reason = '') {
  const readerAnalysis = await fetchReaderProductAnalysis(urlString, reason)
  if (readerAnalysis) {
    return cacheProductAnalysis(urlString, readerAnalysis)
  }

  const renderedAnalysis = await cacheRenderedProductAnalysis(urlString)
  if (renderedAnalysis) {
    return renderedAnalysis
  }

  return null
}
