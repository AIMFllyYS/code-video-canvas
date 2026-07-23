import { CenteredScreen } from '@/components/ui/centered-screen'

export default function HomePage() {
  return (
    <CenteredScreen as="main">
      <h1 className="text-4xl font-bold">code-video-canvas</h1>
      <p className="mt-4 text-lg text-gray-600">基于自然语言的代码视频创作工作流程-节点平台</p>
    </CenteredScreen>
  )
}
