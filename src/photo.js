// Motor de foto para documento no navegador. A foto nunca sai do aparelho.
// MediaPipe Tasks Vision (Apache-2.0): FaceLandmarker (pontos do rosto + expressões) e ImageSegmenter multiclasse
// (fundo, cabelo, pele, roupa). Modelos e WASM servidos pelo próprio site.
import { FilesetResolver, FaceLandmarker, ImageSegmenter } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs';
import { computeCrop, checks, mmToPx, sheetLayout, setJpegDpi, headMmInOutput } from './geometry.mjs';
import { buildPdf } from './pdf.mjs';

let ready = null, hqReady = null, fileset = null, delegate = 'GPU';
let landmarker, segmenter, hqSegmenter;
const forceSeg = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('seg') : null;
const MODELS = { selfie_segmenter: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite', selfie_multiclass_256x256: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite' };
const makeSeg = (name) => ImageSegmenter.createFromOptions(fileset, { baseOptions: { modelAssetPath: MODELS[name], delegate }, runningMode: 'IMAGE', outputConfidenceMasks: true, outputCategoryMask: false });
// Leve (≈4 MB no total): pontos do rosto + segmentador simples de 250 KB. Resultado em segundos.
export function init() {
  ready ??= (async () => {
    fileset = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm');
    const make = async () => {
      landmarker = await FaceLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task', delegate }, runningMode: 'IMAGE', numFaces: 2, outputFaceBlendshapes: true });
      segmenter = await makeSeg(forceSeg || 'selfie_segmenter');
    };
    try { await make(); } catch { delegate = 'CPU'; await make(); }
  })();
  return ready;
}
// Alta qualidade (+16 MB): segmentador multiclasse, separa cabelo com mais detalhe.
export function initHQ() {
  hqReady ??= (async () => { await init(); hqSegmenter = await makeSeg('selfie_multiclass_256x256'); })();
  return hqReady;
}
export const hasHQ = () => !!hqSegmenter;

const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const ctx2d = (c) => c.getContext('2d', { willReadFrequently: true });

export async function loadImage(file, maxSide = 2200) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = canvas(bmp.width * k, bmp.height * k);
  ctx2d(c).drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return c;
}

const avg = (pts, ids) => ({ x: ids.reduce((a, i) => a + pts[i].x, 0) / ids.length, y: ids.reduce((a, i) => a + pts[i].y, 0) / ids.length });
const rotPt = (p, c, a) => { const s = Math.sin(a), k = Math.cos(a); const dx = p.x - c.x, dy = p.y - c.y; return { x: c.x + dx * k - dy * s, y: c.y + dx * s + dy * k }; };

function luminance(c, cx, cy, r) {
  const d = ctx2d(c).getImageData(Math.max(0, cx - r), Math.max(0, cy - r), Math.max(1, 2 * r), Math.max(1, 2 * r)).data;
  let s = 0; for (let i = 0; i < d.length; i += 4) s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  return s / (d.length / 4) / 255;
}

// Roda o segmentador numa região (em coordenadas de `src`) e devolve a probabilidade de "pessoa" e de "cabelo+rosto"
// já na resolução pedida (outW x outH).
function segmentRegion(src, rx, ry, rw, rh, outW, outH, seg = segmenter) {
  const side = 640; // entrada do segmentador; ele reduz para 256 internamente
  const k = side / Math.max(rw, rh);
  const c = canvas(rw * k, rh * k);
  const g = ctx2d(c);
  g.fillStyle = '#808080'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(src, rx, ry, rw, rh, 0, 0, c.width, c.height);
  const res = seg.segment(c);
  const masks = res.confidenceMasks;
  const mw = masks[0].width, mh = masks[0].height;
  // Multiclasse: [fundo, cabelo, pele do corpo, pele do rosto, roupa, outros]. Selfie simples: [pessoa].
  const multi = masks.length >= 4;
  const m0 = masks[0].getAsFloat32Array();
  const bg = multi ? m0 : m0.map((v) => 1 - v);
  const hair = multi ? masks[1].getAsFloat32Array() : null;
  const face = multi ? masks[3].getAsFloat32Array() : null;
  const sample = (arr, u, v) => { // bilinear
    const x = Math.min(mw - 1, Math.max(0, u * mw - 0.5)), y = Math.min(mh - 1, Math.max(0, v * mh - 0.5));
    const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(mw - 1, x0 + 1), y1 = Math.min(mh - 1, y0 + 1), fx = x - x0, fy = y - y0;
    return (arr[y0 * mw + x0] * (1 - fx) + arr[y0 * mw + x1] * fx) * (1 - fy) + (arr[y1 * mw + x0] * (1 - fx) + arr[y1 * mw + x1] * fx) * fy;
  };
  const person = new Float32Array(outW * outH), head = new Float32Array(outW * outH);
  for (let y = 0; y < outH; y++) for (let x = 0; x < outW; x++) {
    const u = (x + 0.5) / outW, v = (y + 0.5) / outH, i = y * outW + x;
    person[i] = 1 - sample(bg, u, v); head[i] = multi ? sample(hair, u, v) + sample(face, u, v) : person[i];
  }
  masks.forEach((m) => m.close()); res.close?.();
  return { person, head };
}

// Processa a foto: detecta, endireita, recorta pela norma, troca o fundo. Retorna canvas final + checagens.
export async function makePhoto(src, spec, bgColor = '#ffffff', { dpi = spec.dpi || 300, hq = false } = {}) {
  await init();
  const seg = hq && hqSegmenter ? hqSegmenter : segmenter;
  const det = landmarker.detect(src);
  const faces = det.faceLandmarks?.length || 0;
  if (!faces) return { ok: false, checks: checks({ faces: 0 }) };
  // Usa o maior rosto.
  let fi = 0, best = 0;
  det.faceLandmarks.forEach((lm, i) => { const ys = lm.map((p) => p.y); const h = Math.max(...ys) - Math.min(...ys); if (h > best) { best = h; fi = i; } });
  const W = src.width, H = src.height;
  const P = det.faceLandmarks[fi].map((p) => ({ x: p.x * W, y: p.y * H }));
  const eyeA = avg(P, [33, 133, 159, 145]), eyeB = avg(P, [362, 263, 386, 374]);
  const roll = Math.atan2(eyeB.y - eyeA.y, eyeB.x - eyeA.x);
  const mid = { x: (eyeA.x + eyeB.x) / 2, y: (eyeA.y + eyeB.y) / 2 };
  const eyeDist = Math.hypot(eyeB.x - eyeA.x, eyeB.y - eyeA.y);
  const yawRatio = (P[1].x - mid.x) / eyeDist;
  const bs = Object.fromEntries((det.faceBlendshapes?.[fi]?.categories || []).map((c) => [c.categoryName, c.score]));

  // Endireita a imagem em torno do centro dos olhos.
  const rot = canvas(W, H);
  const rg = ctx2d(rot);
  rg.translate(mid.x, mid.y); rg.rotate(-roll); rg.translate(-mid.x, -mid.y); rg.drawImage(src, 0, 0);
  const R = P.map((p) => rotPt(p, mid, -roll));
  const chin = R[152], top = R[10];
  const faceH = chin.y - top.y;
  const faceW = Math.abs(R[454].x - R[234].x);
  const centerX = (R[234].x + R[454].x) / 2;

  // Topo da cabeça: segmentação grossa em volta da cabeça.
  const gx = centerX - faceH * 1.4, gy = top.y - faceH * 1.1, gw = faceH * 2.8, gh = faceH * 2.0;
  const gW = 280, gH = Math.round(gW * gh / gw);
  const coarse = segmentRegion(rot, gx, gy, gw, gh, gW, gH, seg);
  const colFrom = Math.round(((centerX - faceW * 0.3) - gx) / gw * gW), colTo = Math.round(((centerX + faceW * 0.3) - gx) / gw * gW);
  let hairTop = null;
  for (let y = 0; y < gH && hairTop === null; y++) { let n = 0; for (let x = colFrom; x <= colTo; x++) if (coarse.head[y * gW + x] > 0.5) n++; if (n >= Math.max(2, (colTo - colFrom) * 0.08)) hairTop = gy + (y / gH) * gh; }
  // Crânio estimado pelos pontos do rosto (o ponto 10 fica no alto da testa). Cabelo muito volumoso não encolhe o rosto além do razoável.
  const skullTop = chin.y - (chin.y - top.y) * 1.24;
  const crownY = hairTop === null ? skullTop : spec.crown === 'hair' ? Math.min(hairTop, skullTop) : Math.max(hairTop, skullTop - (chin.y - skullTop) * 0.06);

  const crop = computeCrop({ chinY: chin.y, crownY, centerX, imgW: W, imgH: H }, spec);
  const outW = mmToPx(spec.wMm, dpi), outH = mmToPx(spec.hMm, dpi);

  // Segmentação fina na própria área do recorte.
  const fine = segmentRegion(rot, crop.x, crop.y, crop.w, crop.h, outW, outH, seg);
  const out = canvas(outW, outH);
  const og = ctx2d(out);
  og.imageSmoothingQuality = 'high';
  og.drawImage(rot, crop.x, crop.y, crop.w, crop.h, 0, 0, outW, outH);
  const img = og.getImageData(0, 0, outW, outH);
  const d = img.data;
  const bg = [1, 3, 5].map((i) => parseInt(bgColor.slice(i, i + 2), 16));
  // Dentro da imagem original? (fora dela, só fundo)
  const sx = crop.w / outW, sy = crop.h / outH;
  const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let y = 0; y < outH; y++) {
    const srcY = crop.y + y * sy;
    for (let x = 0; x < outW; x++) {
      const i = y * outW + x, j = i * 4;
      const srcX = crop.x + x * sx;
      const inside = srcX >= 0 && srcY >= 0 && srcX < W && srcY < H;
      let a = inside ? smooth(0.3, 0.8, fine.person[i]) : 0;
      // Remove halo claro do fundo antigo na borda: escurece levemente a mistura onde a > 0 e < 1.
      d[j] = d[j] * a + bg[0] * (1 - a); d[j + 1] = d[j + 1] * a + bg[1] * (1 - a); d[j + 2] = d[j + 2] * a + bg[2] * (1 - a); d[j + 3] = 255;
    }
  }
  og.putImageData(img, 0, 0);

  const cheekL = rotPt(P[50], mid, -roll), cheekR = rotPt(P[280], mid, -roll);
  const r = Math.max(4, Math.round(faceW * 0.06));
  const lightBalance = Math.abs(luminance(rot, Math.round(cheekL.x), Math.round(cheekL.y), r) - luminance(rot, Math.round(cheekR.x), Math.round(cheekR.y), r));
  const headMm = headMmInOutput(crop, spec);
  const list = checks({ faces, rollDeg: roll * 180 / Math.PI, yawRatio, blinkL: bs.eyeBlinkLeft || 0, blinkR: bs.eyeBlinkRight || 0, smile: Math.max(bs.mouthSmileLeft || 0, bs.mouthSmileRight || 0), jawOpen: bs.jawOpen || 0, faceHeightPx: faceH, lightBalance, missing: crop.missing, headMm, spec });
  return { ok: true, hq: seg === hqSegmenter, canvas: out, checks: list, headMm, crop, dpi, metrics: { yawRatio, lightBalance, rollDeg: roll * 180 / Math.PI, smile: Math.max(bs.mouthSmileLeft || 0, bs.mouthSmileRight || 0), blink: Math.max(bs.eyeBlinkLeft || 0, bs.eyeBlinkRight || 0) } };
}

export async function toJpeg(c, { dpi = 300, maxKb = null, quality = 0.95 } = {}) {
  let q = quality, blob;
  for (let i = 0; i < 12; i++) {
    blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', q));
    if (!maxKb || blob.size <= maxKb * 1024) break;
    q -= 0.07;
  }
  const bytes = setJpegDpi(new Uint8Array(await blob.arrayBuffer()), dpi);
  return new Blob([bytes], { type: 'image/jpeg' });
}

export function resizeSquare(c, px) { const o = canvas(px, px); const g = ctx2d(o); g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, px, px); return o; }

// Folha 10x15 cm (4x6 pol.) para revelar em qualquer farmácia/gráfica, com linhas de corte.
export function sheetCanvas(photo, spec, dpi = 300) {
  const L = sheetLayout(spec);
  const c = canvas(mmToPx(L.sheetW, dpi), mmToPx(L.sheetH, dpi));
  const g = ctx2d(c);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
  const pw = mmToPx(spec.wMm, dpi), ph = mmToPx(spec.hMm, dpi);
  g.strokeStyle = '#bdbdbd'; g.lineWidth = 1;
  for (const cell of L.cells) {
    const x = mmToPx(cell.x, dpi), y = mmToPx(cell.y, dpi);
    g.drawImage(photo, x, y, pw, ph);
    g.strokeRect(x - 0.5, y - 0.5, pw + 1, ph + 1);
  }
  return { canvas: c, layout: L };
}

// PDF A4 com as fotos no tamanho exato (imprimir em 100%, sem "ajustar à página").
export async function a4Pdf(photo, spec, label) {
  const L = sheetLayout(spec, { wMm: 210, hMm: 297 }, 3, 12, false);
  const blob = await new Promise((r) => photo.toBlob(r, 'image/jpeg', 0.95));
  const jpeg = new Uint8Array(await blob.arrayBuffer());
  const bytes = buildPdf({ jpeg, jpegW: photo.width, jpegH: photo.height, cells: L.cells, cellW: spec.wMm, cellH: spec.hMm, text: `${label} - ${spec.wMm} x ${spec.hMm} mm. Imprima em tamanho real (100%), sem ajustar a pagina.` });
  return { blob: new Blob([bytes], { type: 'application/pdf' }), count: L.count };
}
