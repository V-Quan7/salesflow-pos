export type BarcodeScanCandidate = {
  code: string;
  format: string;
};

export type BarcodeScanSnapshot = {
  candidate: BarcodeScanCandidate | null;
  matchCount: number;
  requiredMatches: number;
  confirmed: BarcodeScanCandidate | null;
  locked: boolean;
};

type BarcodeScanGateOptions = {
  windowSize?: number;
  requiredMatches?: number;
  absenceMs?: number;
  cooldownMs?: number;
};

const DEFAULT_WINDOW_SIZE = 5;
const DEFAULT_REQUIRED_MATCHES = 3;

export function includeScannedBarcode(message: string, code: string): string {
  return `${message}\nMã camera đã đọc: ${code}`;
}

/**
 * Confirms a decoded barcode only after the same unmodified code and format
 * appear repeatedly in the recent processed camera frames.
 */
export function createBarcodeScanGate({
  windowSize = DEFAULT_WINDOW_SIZE,
  requiredMatches = DEFAULT_REQUIRED_MATCHES,
  absenceMs = 700,
  cooldownMs = 1200,
}: BarcodeScanGateOptions = {}) {
  const safeWindowSize = Math.max(1, Math.floor(windowSize));
  const safeRequiredMatches = Math.min(safeWindowSize, Math.max(1, Math.floor(requiredMatches)));
  let observations: Array<BarcodeScanCandidate | null> = [];
  let locked = false;
  let lockedCandidate: BarcodeScanCandidate | null = null;
  let absentSince: number | null = null;
  let cooldownUntil = 0;

  function snapshot(confirmed: BarcodeScanCandidate | null = null): BarcodeScanSnapshot {
    if (locked) {
      return {
        candidate: lockedCandidate,
        matchCount: safeRequiredMatches,
        requiredMatches: safeRequiredMatches,
        confirmed,
        locked,
      };
    }

    const counts = new Map<string, { candidate: BarcodeScanCandidate; count: number; latestIndex: number }>();
    observations.forEach((candidate, index) => {
      if (!candidate) return;
      const key = JSON.stringify([candidate.format, candidate.code]);
      const current = counts.get(key);
      if (current) {
        current.count += 1;
        current.latestIndex = index;
      } else {
        counts.set(key, { candidate, count: 1, latestIndex: index });
      }
    });

    const best = [...counts.values()].sort((left, right) =>
      right.count - left.count || right.latestIndex - left.latestIndex,
    )[0];

    return {
      candidate: best?.candidate ?? null,
      matchCount: best?.count ?? 0,
      requiredMatches: safeRequiredMatches,
      confirmed,
      locked,
    };
  }

  return {
    observe(candidate: BarcodeScanCandidate | null, now = Date.now()): BarcodeScanSnapshot {
      const code = candidate?.code.trim() ?? '';
      const format = candidate?.format.trim() ?? '';
      const sample = code && format ? { code, format } : null;

      if (locked) {
        if (sample) {
          absentSince = null;
        } else {
          absentSince ??= now;
          const absentLongEnough = now - absentSince >= absenceMs;
          const cooldownFinished = now >= cooldownUntil;
          if (absentLongEnough && cooldownFinished) {
            locked = false;
            lockedCandidate = null;
            observations = [];
            absentSince = null;
          }
        }
        if (locked) return snapshot();
      }

      observations.push(sample);
      if (observations.length > safeWindowSize) observations.shift();

      const current = snapshot();
      if (current.candidate && current.matchCount >= safeRequiredMatches) {
        locked = true;
        lockedCandidate = current.candidate;
        cooldownUntil = now + cooldownMs;
        absentSince = null;
        return snapshot(current.candidate);
      }
      return current;
    },

    reset() {
      observations = [];
      locked = false;
      lockedCandidate = null;
      absentSince = null;
      cooldownUntil = 0;
    },
  };
}
