const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const doc = process.argv[2];
const out = process.argv[3];
if (!doc || !out) {
  console.error('Usage: node extract-docx.js <input.docx> <output.txt>');
  process.exit(1);
}

const ps = `
Add-Type -AssemblyName System.IO.Compression.FileSystem
$z = [IO.Compression.ZipFile]::OpenRead('${doc.replace(/'/g, "''")}')
$e = $z.GetEntry('word/document.xml')
$r = New-Object IO.StreamReader($e.Open())
$xml = $r.ReadToEnd()
$r.Close()
$z.Dispose()
[Console]::OutputEncoding = [Text.UTF8Encoding]::new()
Write-Output $xml
`;

const xml = execSync(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`, {
  encoding: 'utf8',
  maxBuffer: 10 * 1024 * 1024,
});

const text = xml
  .replace(/<w:tab[^/]*\/>/g, '\t')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ')
  .trim();

fs.writeFileSync(out, text, 'utf8');
console.log(text.slice(0, 5000));
