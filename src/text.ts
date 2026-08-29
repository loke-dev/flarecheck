export function terminalText(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, (character) => {
    if (character === '\n') return '\\n'
    if (character === '\r') return '\\r'
    if (character === '\t') return '\\t'
    return `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
  })
}
