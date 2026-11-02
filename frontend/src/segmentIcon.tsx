import { Building2, Landmark, Sprout, Store, User, UsersRound } from 'lucide-react';
import type { Segment } from './api';

const byCode: Record<string, typeof User> = { AG: Sprout, PF: User, PJ: Building2, PUB: Landmark, VAR: Store };

export function SegmentIcon({ segment, size = 19 }: { segment: Pick<Segment, 'code' | 'name'>; size?: number }) {
  const name = segment.name.toLowerCase();
  const Icon = byCode[segment.code.toUpperCase()]
    ?? (name.includes('agro') ? Sprout : name.includes('jur') ? Building2 : name.includes('fís') || name.includes('fis') ? User : UsersRound);
  return <Icon size={size} />;
}
