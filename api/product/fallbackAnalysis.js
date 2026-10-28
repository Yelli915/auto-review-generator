import { fetchReaderProductAnalysis } from './reader.js'
import { fetchRenderedProductAnalysis } from './rendered.js'

export async function fetchReaderOrRenderedProductAnalysis(urlString, reason, signal) {
  return (
    (await fetchReaderProductAnalysis(urlString, reason, signal)) ||
    (await fetchRenderedProductAnalysis(urlString, signal))
  )
}
