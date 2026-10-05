# Especificações de fotos para documentos (Brasil e vistos) + recorte no navegador

Medidas de **foto 3x4, foto 5x7 para passaporte, visto americano (2x2 / DS-160), visto do Canadá e visto Schengen** em JSON, cada uma com a **fonte oficial**, e um motor em JavaScript que recorta a foto pela norma **dentro do navegador** (a imagem não sai do aparelho).

Usado em produção no **[FotoApta — foto 3x4 online grátis e sem marca d’água](https://fotoapta.com/)**.

| id | Foto | Tamanho | Altura da cabeça | Fundo | Fonte |
|---|---|---|---|---|---|
| `3x4` | Foto 3x4 | 30 x 40 mm | 28–32 mm | #ffffff, #dbe9f7 | [fonte](https://www.gov.br/anac/pt-br/assuntos/regulados/profissionais-da-aviacao-civil/processo-de-licencas-e-habilitacoes/arquivos/copy2_of_ORIENTAFOTOPADRAOOACI.pdf) |
| `5x7` | Foto 5x7 para passaporte | 50 x 70 mm | 31–36 mm | #ffffff | [fonte](https://www.gov.br/pf/pt-br/assuntos/passaporte) |
| `eua` | Foto para visto americano (2x2 pol.) | 51 x 51 mm | 25–35 mm | #ffffff | [fonte](https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/photos.html) |
| `canada` | Foto para visto do Canadá (35x45) | 35 x 45 mm | 31–36 mm | #ffffff, #f2f2f2 | [fonte](https://www.canada.ca/en/immigration-refugees-citizenship/services/application/application-forms-guides/temporary-resident-visa-application-photograph-specifications.html) |
| `schengen` | Foto para visto Schengen (35x45) | 35 x 45 mm | 32–36 mm | #ffffff, #eeeeee | [fonte](https://home-affairs.ec.europa.eu/policies/schengen-borders-and-visa/visa-policy_en) |

Conferido em 2026-10-05. Explicação de cada tamanho: [tamanhos de foto para documentos](https://fotoapta.com/tamanhos-de-foto-para-documentos/).

## Dados

`specs.json`: `wMm`, `hMm` (tamanho), `headMm` (faixa da altura da cabeça, do queixo ao topo), `headTargetMm`, `topMm` (margem acima da cabeça), `bg` (fundos aceitos), `dpi`, `digital` (pixels e KB máximos para envio online), `crown` (`hair` mede até o topo do cabelo; `skull`, até o topo do crânio), `basis` e `source`.

## Motor (`src/`)

- `geometry.mjs`: funções puras — `computeCrop` (recorte a partir do queixo e do topo da cabeça), `sheetLayout` (folha 10x15 e A4), `setJpegDpi` (grava 300 dpi no JFIF) e `checks` (avisos de enquadramento, olhos, sorriso, luz).
- `pdf.mjs`: gerador de PDF mínimo, sem dependências, com fotos em tamanho exato em mm.
- `photo.js`: pipeline no navegador com [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe) (Apache-2.0) — pontos do rosto, endireitar, segmentar a pessoa e trocar o fundo.

```js
import { computeCrop } from "./src/geometry.mjs";
import specs from "./specs.json" with { type: "json" };
const crop = computeCrop({ chinY: 900, crownY: 500, centerX: 600, imgW: 1200, imgH: 2000 }, specs.specs["3x4"]);
```

## Aviso

Referência informativa. Quem decide se a foto é aceita é o órgão que a recebe (Polícia Federal, consulado, OAB etc.). Encontrou uma medida desatualizada? Abra uma issue com o link oficial.

## Licença

Código: MIT. Dados (`specs.json`): CC BY 4.0 — cite “FotoApta (https://fotoapta.com)”.

---

**English:** Official ID-photo specs (Brazil 3x4, Brazilian passport 5x7, US visa 2x2 / DS-160, Canada visa, Schengen visa) as JSON with sources, plus a browser-only cropping engine built on MediaPipe. Live tool: https://fotoapta.com/
