// Netteté d'une image de pièce : dispersion du laplacien (détails fins) rapportée au contraste,
// mesurée dans le disque central. Une image floue (mise au point ratée, bougé) donne une valeur basse.
export function sharpness(gray: Float32Array, size: number): number {
  const c = size / 2
  const limit = (size * 0.42) ** 2
  let n = 0, sumL = 0, sumL2 = 0, sumG = 0, sumG2 = 0
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      if ((x - c) ** 2 + (y - c) ** 2 > limit) continue
      const i = y * size + x
      const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - size] - gray[i + size]
      sumL += lap
      sumL2 += lap * lap
      sumG += gray[i]
      sumG2 += gray[i] * gray[i]
      n++
    }
  }
  if (!n) return 0
  const stdL = Math.sqrt(Math.max(0, sumL2 / n - (sumL / n) ** 2))
  const stdG = Math.sqrt(Math.max(0, sumG2 / n - (sumG / n) ** 2))
  return stdL / (stdG + 8)
}
