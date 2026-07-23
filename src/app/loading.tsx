import { CenteredScreen } from '@/components/ui/centered-screen'

export default function Loading() {
  return (
    <CenteredScreen column={false} padded={false}>
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-gray-900" />
    </CenteredScreen>
  )
}
