import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function calculateWinRate(wins: number | null, losses: number | null): number {
  const total = (wins ?? 0) + (losses ?? 0);
  if (total === 0) return 0;
  return Math.round(((wins ?? 0) / total) * 100);
}
