// Geometria pura (testável no Node): enquadramento, folhas de impressão, DPI no JPEG, checagens.
export const mmToPx = (mm, dpi) => Math.round((mm / 25.4) * dpi);

// Dado o rosto (queixo, topo da cabeça, centro horizontal, ângulo dos olhos) em pixels da imagem de origem,
// devolve o retângulo de recorte (no sistema já rotacionado) que põe a cabeça no tamanho da norma.
export function computeCrop({ chinY, crownY, centerX, imgW, imgH }, spec) {
  const headPx = chinY - crownY;
  if (!(headPx > 0)) throw new Error('head_not_found');
  const pxPerMm = headPx / spec.headTargetMm;
  const w = spec.wMm * pxPerMm;
  const h = spec.hMm * pxPerMm;
  const x = centerX - w / 2;
  const y = crownY - spec.topMm * pxPerMm;
  const outside = {
    left: Math.max(0, -x), right: Math.max(0, x + w - imgW),
    top: Math.max(0, -y), bottom: Math.max(0, y + h - imgH),
  };
  // Falta de imagem abaixo dos ombros é tolerável (preenchida com o fundo); acima da cabeça ou dos lados, menos.
  const missing = { sides: (outside.left + outside.right) / w, top: outside.top / h, bottom: outside.bottom / h };
  return { x, y, w, h, pxPerMm, headPx, missing };
}

export function headMmInOutput(crop, spec) { return crop.headPx / crop.pxPerMm; }

// Quantas fotos cabem numa folha (mm), com espaço entre elas e margem.
export function sheetLayout(spec, sheet = { wMm: 152.4, hMm: 101.6 }, gapMm = 2, marginMm = 3, allowRotate = true) {
  const fit = (W, w) => Math.max(0, Math.floor((W - 2 * marginMm + gapMm) / (w + gapMm)));
  const a = { cols: fit(sheet.wMm, spec.wMm), rows: fit(sheet.hMm, spec.hMm) };
  const b = { cols: fit(sheet.hMm, spec.wMm), rows: fit(sheet.wMm, spec.hMm) };
  const best = !allowRotate || a.cols * a.rows >= b.cols * b.rows ? { ...a, sheetW: sheet.wMm, sheetH: sheet.hMm } : { ...b, sheetW: sheet.hMm, sheetH: sheet.wMm };
  const usedW = best.cols * spec.wMm + (best.cols - 1) * gapMm;
  const usedH = best.rows * spec.hMm + (best.rows - 1) * gapMm;
  const ox = (best.sheetW - usedW) / 2, oy = (best.sheetH - usedH) / 2;
  const cells = [];
  for (let r = 0; r < best.rows; r++) for (let c = 0; c < best.cols; c++) cells.push({ x: ox + c * (spec.wMm + gapMm), y: oy + r * (spec.hMm + gapMm) });
  return { ...best, count: cells.length, cells, gapMm };
}

// Grava a densidade (DPI) no cabeçalho JFIF de um JPEG, para a foto sair no tamanho certo ao imprimir.
export function setJpegDpi(bytes, dpi) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // SOI FFD8, APP0 FFE0, length(2), 'JFIF\0'(5), version(2), units(1) @13, Xdensity(2) @14, Ydensity(2) @16
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff && b[3] === 0xe0 && b[6] === 0x4a && b[7] === 0x46 && b[8] === 0x49 && b[9] === 0x46) {
    b[13] = 1; b[14] = dpi >> 8; b[15] = dpi & 255; b[16] = dpi >> 8; b[17] = dpi & 255;
  }
  return b;
}

// Checagens de conformidade a partir de medidas simples (ângulos em graus, valores 0–1).
export function checks({ faces, rollDeg, yawRatio, blinkL, blinkR, smile, jawOpen, faceHeightPx, lightBalance, missing, headMm, spec }) {
  const out = [];
  const add = (id, level, text) => out.push({ id, level, text });
  if (faces === 0) { add('face', 'erro', 'Não encontramos um rosto. Use uma foto de frente, com o rosto inteiro visível.'); return out; }
  if (faces > 1) add('faces', 'erro', 'Há mais de uma pessoa na foto. Use uma foto só com você.');
  if (Math.abs(rollDeg) > 3) add('roll', 'ok', `Cabeça inclinada ${Math.abs(rollDeg).toFixed(0)}° — corrigimos automaticamente.`);
  if (Math.abs(yawRatio) > 0.12) add('yaw', 'aviso', 'O rosto parece virado para o lado. Olhe direto para a câmera.');
  if (blinkL > 0.55 || blinkR > 0.55) add('eyes', 'aviso', 'Os olhos parecem fechados ou semicerrados. Deixe os dois olhos bem abertos.');
  if (smile > 0.45) add('smile', 'aviso', 'Parece um sorriso. Documentos pedem expressão neutra, boca fechada.');
  if (jawOpen > 0.25) add('mouth', 'aviso', 'A boca parece aberta. Feche a boca.');
  if (faceHeightPx < 220) add('res', 'aviso', 'O rosto está pequeno na foto original; a impressão pode sair sem nitidez. Chegue mais perto ou use a câmera traseira.');
  if (lightBalance > 0.22) add('light', 'aviso', 'Um lado do rosto está bem mais escuro. Fique de frente para a janela ou para a luz.');
  if (missing.top > 0.02 || missing.sides > 0.12) add('frame', 'aviso', 'A foto original corta o topo da cabeça ou os lados. Afaste um pouco a câmera.');
  else if (missing.bottom > 0.12) add('shoulders', 'aviso', 'Os ombros ficaram de fora; completamos com o fundo. Se puder, mostre os ombros.');
  if (headMm < spec.headMm[0] - 0.5 || headMm > spec.headMm[1] + 0.5) add('head', 'aviso', `Cabeça com ${headMm.toFixed(1)} mm (norma: ${spec.headMm[0]}–${spec.headMm[1]} mm).`);
  if (!out.some((c) => c.level !== 'ok')) add('pass', 'ok', 'Enquadramento, olhos, expressão e luz dentro do esperado.');
  return out;
}
