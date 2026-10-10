// Terminal bytes are parsed as control sequences by xterm.js. Convert dynamic
// simulator output to plain text so only this app's fixed SGR styles are trusted.
export function toTerminalText(value) {
  return String(value)
    .replace(/\r\n?|\n/g, '\n')
    .replace(/\t/g, '    ')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, '\uFFFD')
    .replace(/\n/g, '\r\n');
}
