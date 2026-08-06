import type { Status } from '../domain/types';

export const STATUS_LABEL: Record<Status, string> = {
  unassessed: 'Unassessed',
  satisfied: 'Satisfied',
  partial: 'Partial',
  'not-satisfied': 'Not satisfied',
};

export const STATUS_SHORT: Record<Status, string> = {
  unassessed: '—',
  satisfied: 'Satisfied',
  partial: 'Partial',
  'not-satisfied': 'Not satisfied',
};

export function statusChipClass(status: Status): string {
  switch (status) {
    case 'satisfied':
      return 'chip chip--ok';
    case 'not-satisfied':
      return 'chip chip--bad';
    case 'partial':
      return 'chip chip--warn';
    default:
      return 'chip';
  }
}

export function pct(n: number): string {
  return `${n.toFixed(n % 1 === 0 ? 0 : 1)}%`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function titleCaseFamily(name: string): string {
  return name
    .toLowerCase()
    .split(' ')
    .map((w) => (w === 'and' ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}
