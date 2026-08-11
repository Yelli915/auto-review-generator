export const ACCESS_CHALLENGE_PATTERN =
  String.raw`\b(?:just a moment|verification successful|checking your browser|ray[_ -]?id|cf-ray|target url returned error 403|403 forbidden|access denied|forbidden)\b`

const ACCESS_CHALLENGE_RE = new RegExp(ACCESS_CHALLENGE_PATTERN, 'i')

export function isAccessChallengeText(text) {
  return ACCESS_CHALLENGE_RE.test(String(text || ''))
}
