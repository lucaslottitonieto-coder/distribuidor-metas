/** Cores extraídas da paleta de referência dos segmentos. */
export const segmentPalette = [
  { name: 'Verde vivo', color: '#27C200', ink: '#006C2D' },
  { name: 'Branco', color: '#F7F7F7', ink: '#536053' },
  { name: 'Verde escuro', color: '#006C2D', ink: '#006C2D' },
  { name: 'Cinza', color: '#536053', ink: '#536053' },
  { name: 'Verde claro', color: '#CBDEBD', ink: '#006C2D' },
  { name: 'Amarelo', color: '#F7C500', ink: '#5C3A17' },
  { name: 'Marrom', color: '#5C3A17', ink: '#5C3A17' },
] as const;

/** Mantém a cor de identificação no fundo e usa tinta legível nos tons claros. */
export function segmentStyle(color: string) {
  const ink = segmentPalette.find(option => option.color.toLowerCase() === color.toLowerCase())?.ink ?? color;
  return { color: ink, background: `${color}18`, borderColor: `${ink}30` };
}
