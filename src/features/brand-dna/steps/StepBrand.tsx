import type { BrandDnaDraft } from '@/features/brand-dna/state'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

export function StepBrand({
  draft,
  onChange,
}: {
  draft: BrandDnaDraft
  onChange: (patch: Partial<BrandDnaDraft>) => void
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="companyName">
            Nome da empresa/marca <span className="text-danger-500">*</span>
          </Label>
          <Input
            id="companyName"
            value={draft.companyName}
            onChange={(e) => onChange({ companyName: e.target.value })}
            placeholder="Ex.: Loja Aurora"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="primaryLanguage">Idioma principal</Label>
          <Input
            id="primaryLanguage"
            value={draft.primaryLanguage}
            onChange={(e) => onChange({ primaryLanguage: e.target.value })}
            placeholder="pt-BR"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">
          Descrição da empresa <span className="text-danger-500">*</span>
        </Label>
        <Textarea
          id="description"
          value={draft.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="O que sua empresa faz, para quem e por quê."
          rows={3}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="segment">Segmento</Label>
          <Input id="segment" value={draft.segment} onChange={(e) => onChange({ segment: e.target.value })} placeholder="Ex.: Moda, Saúde, Educação" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="location">Localização</Label>
          <Input id="location" value={draft.location} onChange={(e) => onChange({ location: e.target.value })} placeholder="Cidade/Estado ou 'Online'" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="website">Site</Label>
          <Input id="website" value={draft.website} onChange={(e) => onChange({ website: e.target.value })} placeholder="https://" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="instagramHandle">Instagram</Label>
          <Input
            id="instagramHandle"
            value={draft.instagramHandle}
            onChange={(e) => onChange({ instagramHandle: e.target.value })}
            placeholder="@suamarca"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="products">Produtos</Label>
          <Textarea id="products" value={draft.products} onChange={(e) => onChange({ products: e.target.value })} rows={2} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="services">Serviços</Label>
          <Textarea id="services" value={draft.services} onChange={(e) => onChange({ services: e.target.value })} rows={2} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="differentiators">Diferenciais</Label>
          <Textarea
            id="differentiators"
            value={draft.differentiators}
            onChange={(e) => onChange({ differentiators: e.target.value })}
            rows={2}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="problemsSolved">Problemas que resolve</Label>
          <Textarea
            id="problemsSolved"
            value={draft.problemsSolved}
            onChange={(e) => onChange({ problemsSolved: e.target.value })}
            rows={2}
          />
        </div>
      </div>
    </div>
  )
}
