# Especificações de fotos para documentos (Brasil e vistos) + recorte no navegador

Medidas de **foto 3x4, foto 5x7 para passaporte, visto americano (2x2 / DS-160), visto do Canadá e visto Schengen** em JSON com fontes, e um motor em JavaScript para recorte e folhas de impressão **dentro do navegador** (a imagem não sai do aparelho nesse editor).

**Escopo da 3x4:** não existe uma norma nacional única para todos os usos. A referência ANAC/OACI abaixo é uma orientação de enquadramento no contexto de aviação; não garante aceitação por escolas, empresas, consulados ou outros órgãos. Confirme sempre as regras de quem recebe a foto, inclusive restrições a editar o fundo.

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

Código: MIT. Dados (`specs.json`): CC BY 4.0 — cite [FotoApta](https://fotoapta.com/).

---

**English:** Sourced document-photo dimensions and a browser-only cropping/print-sheet engine built on MediaPipe. The Brazil 3x4 entry is a reference based on ANAC guidance, not a universal national acceptance rule. Always check the receiving authority’s current requirements.

Free document editor: [FotoApta in English](https://fotoapta.com/en/). This repository covers the local editor engine and specification data, not the complete production service. The separate AI professional-portrait workflow sends selfies to external generation providers and offers optional paid output; it is not covered by the local/no-upload claim above.

Scope clarification updated 2026-11-14. The specification verification date above remains 2026-10-05; this documentation change does not claim a fresh audit of every authority or guarantee acceptance.
