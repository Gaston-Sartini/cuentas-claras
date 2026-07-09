// Genera y baja un CSV en el navegador (sin backend). Con BOM para que Excel
// abra bien los acentos, y punto y coma como separador (locale es-AR usa la
// coma para decimales, así Excel no rompe las columnas).
const escape = (val) => {
  const s = String(val ?? '')
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function downloadCSV(filename, headers, rows) {
  const lines = [headers, ...rows].map((cols) => cols.map(escape).join(';'))
  const blob = new Blob(['﻿' + lines.join('\r\n')], {
    type: 'text/csv;charset=utf-8;',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
