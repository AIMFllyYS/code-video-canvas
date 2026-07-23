import Link from 'next/link'
import { CenteredScreen } from '@/components/ui/centered-screen'
import { primaryActionClassName } from '@/components/ui/button'

export default function NotFound() {
  return (
    <CenteredScreen>
      <h1 className="mb-4 text-4xl font-bold">404</h1>
      <p className="mb-4 text-gray-600">页面不存在</p>
      <Link href="/" className={primaryActionClassName}>
        返回首页
      </Link>
    </CenteredScreen>
  )
}
