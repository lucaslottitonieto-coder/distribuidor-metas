import type { Coins } from 'lucide-react';
import { toCsv } from './reportData';

/** Peças compartilhadas pelas abas dos relatórios. */
export const percent = (share: number, digits = 1) => `${(share * 100).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
/** Variação com sinal: +25,0% / −10,0%. */
export const signed = (share: number | null, digits = 1) => share === null ? '—' : `${share > 0 ? '+' : share < 0 ? '−' : ''}${percent(Math.abs(share), digits)}`;

export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.hidden = true;
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Metric({ label, value, hint, Icon, color, onClick }: { label: string; value: string; hint: string; Icon: typeof Coins; color: string; onClick?: () => void }) {
  const body = <><div className="metric-top"><span>{label}</span><span className={`metric-icon ${color}`}><Icon size={19} strokeWidth={1.7} /></span></div><strong>{value}</strong><small>{hint}</small></>;
  return onClick ? <button type="button" className="metric-card is-button" onClick={onClick}>{body}</button> : <div className="metric-card">{body}</div>;
}
