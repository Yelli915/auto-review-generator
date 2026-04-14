export function getGoogleClientId() {
  if (
    typeof import.meta === 'undefined' ||
    !import.meta.env ||
    typeof import.meta.env.VITE_GOOGLE_CLIENT_ID !== 'string'
  ) {
    return ''
  }
  return import.meta.env.VITE_GOOGLE_CLIENT_ID.trim()
}
