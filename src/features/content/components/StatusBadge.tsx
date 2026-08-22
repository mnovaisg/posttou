import { Badge } from '@/components/ui/badge'
import { STATUS_BADGE_VARIANT, STATUS_LABEL } from '@/features/content/types'
import type { ContentStatus } from '@/features/content/types'

export function StatusBadge({ status }: { status: ContentStatus }) {
  return <Badge variant={STATUS_BADGE_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
}
