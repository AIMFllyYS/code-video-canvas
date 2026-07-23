import { Download, Film, Folder, LayoutDashboard, Settings, Waypoints } from 'lucide-react'
import { NavItem } from '@/components/ui/nav-item'
import {
  Sidebar,
  SidebarBrand,
  SidebarDivider,
  SidebarFooter,
  SidebarLocalStatus,
  SidebarNav,
  SidebarSection,
} from '@/components/ui/sidebar'

export function CanvasSidebar({ projectTitle }: { projectTitle: string }) {
  return (
    <Sidebar>
      <SidebarBrand />
      <SidebarSection>项目</SidebarSection>
      <SidebarNav>
        <NavItem icon={LayoutDashboard} href="/">工作台</NavItem>
        <NavItem icon={Folder} href="/projects">项目列表</NavItem>
        <NavItem icon={Waypoints} href="/canvas" active>画布编辑器</NavItem>
        <NavItem icon={Film}>{projectTitle}</NavItem>
        <NavItem icon={Download} href="/canvas/export">合成与导出</NavItem>
      </SidebarNav>
      <SidebarDivider />
      <SidebarFooter>
        <NavItem icon={Settings} href="/settings">设置</NavItem>
        <SidebarLocalStatus />
      </SidebarFooter>
    </Sidebar>
  )
}
