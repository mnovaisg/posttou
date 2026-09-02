// Bloco 10.1 (retrabalho) — os previews de Estilo de Imagem/Design usam
// fotos/artes REAIS, geradas uma única vez via o mesmo pipeline Kie.ai já
// usado em produção (ai-generate-image) e incorporadas como assets
// estáticos do bundle. A partir daqui a página nunca mais chama IA nem
// consome crédito para exibi-los — só renderiza os PNGs já prontos.
// Mesmo assunto (uma xícara de café) nos 3 exemplos de Estilo de Imagem, e
// o mesmo post-modelo ("5 dicas para vender mais") nos 5 de Estilo de
// Design, para a comparação ser sobre o tratamento visual, não o conteúdo.
import fotograficoImg from '@/assets/brand-style/fotografico.png'
import ilustracaoImg from '@/assets/brand-style/ilustracao.png'
import treDImg from '@/assets/brand-style/3d.png'
import modernoImg from '@/assets/brand-style/moderno.png'
import editorialImg from '@/assets/brand-style/editorial.png'
import popImg from '@/assets/brand-style/pop.png'
import minimalistaImg from '@/assets/brand-style/minimalista.png'
import impactanteImg from '@/assets/brand-style/impactante.png'
import socialImg from '@/assets/brand-style/social.png'

const IMAGE_STYLE_SRC: Record<'fotografico' | 'ilustracao' | '3d', string> = {
  fotografico: fotograficoImg,
  ilustracao: ilustracaoImg,
  '3d': treDImg,
}

const IMAGE_STYLE_ALT: Record<'fotografico' | 'ilustracao' | '3d', string> = {
  fotografico: 'Exemplo de estilo fotográfico: fotografia real de uma xícara de café com vapor, luz natural',
  ilustracao: 'Exemplo de estilo ilustração: ilustração vetorial de uma xícara de café com vapor',
  '3d': 'Exemplo de estilo 3D: render 3D de uma xícara de café com vapor, materiais e sombras volumétricas',
}

// primary (cor da marca) não é mais usado para renderizar — as imagens já
// são artes finais próprias — mas o parâmetro segue no tipo pra não exigir
// mudança no call site de BrandStylePage.tsx.
export function ImageStylePreview({ style }: { style: 'fotografico' | 'ilustracao' | '3d'; primary: string }) {
  return <img src={IMAGE_STYLE_SRC[style]} alt={IMAGE_STYLE_ALT[style]} className="aspect-square w-full rounded-lg object-cover" loading="lazy" />
}

const DESIGN_STYLE_SRC: Record<'moderno' | 'editorial' | 'pop' | 'minimalista' | 'impactante' | 'social', string> = {
  moderno: modernoImg,
  editorial: editorialImg,
  pop: popImg,
  minimalista: minimalistaImg,
  impactante: impactanteImg,
  social: socialImg,
}

const DESIGN_STYLE_ALT: Record<'moderno' | 'editorial' | 'pop' | 'minimalista' | 'impactante' | 'social', string> = {
  moderno: 'Exemplo de estilo moderno: post de Instagram com tipografia grande sobre gradiente diagonal',
  editorial: 'Exemplo de estilo editorial: post de Instagram com composição de revista, serifa e linhas finas',
  pop: 'Exemplo de estilo pop: post de Instagram com cores saturadas, contraste alto e padrão de bolinhas',
  minimalista: 'Exemplo de estilo minimalista: post de Instagram com espaço em branco generoso e poucos elementos',
  impactante: 'Exemplo de estilo impactante: post de Instagram com blocos diagonais e tipografia de alto contraste',
  social: 'Exemplo de estilo social: post com cara de rede social nativa, avatar, @ da marca e texto curto',
}

export function DesignStylePreview({ style }: { style: 'moderno' | 'editorial' | 'pop' | 'minimalista' | 'impactante' | 'social'; primary: string }) {
  return <img src={DESIGN_STYLE_SRC[style]} alt={DESIGN_STYLE_ALT[style]} className="aspect-[4/5] w-full rounded-lg object-cover" loading="lazy" />
}
