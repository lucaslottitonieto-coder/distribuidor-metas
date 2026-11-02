/** Expande células mescladas para manter o contexto de cada linha no CSV. */
export function tableCsv(table: HTMLTableElement) {
  const rows = Array.from(table.rows);
  const grid: string[][] = [];
  rows.forEach((row, rowIndex) => {
    grid[rowIndex] ??= [];
    let column = 0;
    Array.from(row.cells).forEach(cell => {
      while (grid[rowIndex][column] !== undefined) column++;
      // Rótulos auxiliares da tela (ex.: "3 agências" sob o nome da regional) não vão para o arquivo.
      // Na tela os meses são abreviados; o arquivo leva o nome completo (data-export-label).
      let text = cell.dataset?.exportLabel ?? cell.innerText;
      cell.querySelectorAll?.('[data-export-ignore]').forEach(el => { text = text.replace((el as HTMLElement).innerText, ''); });
      // O traço da tela indica célula sem valor: no arquivo ela fica vazia.
      const trimmed = text.replace(/\s+/g, ' ').trim();
      const value = trimmed === '—' ? '' : trimmed;
      const height = cell.rowSpan === 0 ? rows.length - rowIndex : cell.rowSpan;
      for (let y = 0; y < height; y++) {
        grid[rowIndex + y] ??= [];
        for (let x = 0; x < cell.colSpan; x++) grid[rowIndex + y][column + x] = value;
      }
      column += cell.colSpan;
    });
  });
  // Linhas de meta levam a vers\u00E3o (data-goal-revision) numa \u00FAltima coluna: na importa\u00E7\u00E3o, ela mostra se a meta
  // mudou no sistema depois desta exporta\u00E7\u00E3o.
  if (rows.some(row => row.dataset?.goalRevision)) {
    const revisionColumn = Math.max(0, ...grid.map(row => row.length));
    rows.forEach((row, index) => { grid[index][revisionColumn] = index === 0 ? 'Vers\u00E3o da meta' : row.dataset?.goalRevision ?? ''; });
  }
  const width = Math.max(0, ...grid.map(row => row.length));
  return '\uFEFF' + grid.map(row => Array.from({ length: width }, (_, column) => {
    const value = row[column] ?? '';
    // Nomes cadastrados são texto, mesmo quando começam com um sinal de fórmula.
    // Valores negativos (ex.: -1.234,5) continuam números; só textos com cara de fórmula levam o apóstrofo.
    const safe = /^[=+@-]/.test(value) && !/^-\d[\d.,]*$/.test(value) ? `'${value}` : value;
    return `"${safe.replace(/"/g, '""')}"`;
  }).join(';')).join('\r\n') + '\r\n';
}

export function downloadTableCsv(table: HTMLTableElement, filename: string) {
  const url = URL.createObjectURL(new Blob([tableCsv(table)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
