/** Trim and compact whitespace. Don't use on content where whitespace matters! */
export const simplifyWhitespace = (whitespaceInsensitiveString: string, newlineReplacement = ' ') => {
  return whitespaceInsensitiveString
    .replace(/\r?\n/g, newlineReplacement)
    .replace(/[\t ]+/g, ' ')
    .trim()
}
