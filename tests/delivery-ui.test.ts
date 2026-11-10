import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

test("DELIVERY-UI4 global delivery center groups projects and exposes filters", () => {
  const overview = fs.readFileSync("components/DeliveryOverview.tsx", "utf8")
  const page = fs.readFileSync("app/delivery/page.tsx", "utf8")
  const sidebar = fs.readFileSync("components/WorkspaceSidebar.tsx", "utf8")
  const pageSource = fs.readFileSync("app/page.tsx", "utf8")
  const css = fs.readFileSync("app/globals.css", "utf8")

  assert.match(page, /DeliveryOverview/)
  assert.match(overview, /全部交付项目/)
  assert.match(overview, /statusFilter/)
  assert.match(overview, /进入项目交付/)
  assert.match(overview, /\/delivery\/\$\{encodeURIComponent\(project\.project\.id\)\}/)
  assert.match(sidebar, /交付中心/)
  assert.match(pageSource, /window\.open\('\/delivery'/)
  assert.match(css, /\.delivery-overview-list/)
})

test("DELIVERY-UI1 交付中心包含成片包、发布准备和真实发布记录", () => {
  const component = fs.readFileSync("components/DeliveryCenter.tsx", "utf8")
  const page = fs.readFileSync("app/delivery/[projectId]/page.tsx", "utf8")
  assert.match(component, /创建发布包/)
  assert.match(component, /复制标题/)
  assert.match(component, /复制话题/)
  assert.match(component, /打开.*上传页/)
  assert.match(component, /保存发布记录/)
  assert.match(component, /回填数据/)
  assert.match(page, /DeliveryCenter/)
})

test("DELIVERY-UI2 审片页只有称呼和角色标签，不建企业权限", () => {
  const component = fs.readFileSync("components/DeliveryCenter.tsx", "utf8")
  const review = fs.readFileSync("components/ReviewRoom.tsx", "utf8")
  for (const role of ["导演", "制片", "编剧", "客户", "发布运营"]) {
    assert.match(component, new RegExp(role))
  }
  assert.match(review, /时间点批注/)
  assert.match(review, /审核通过/)
  assert.match(review, /退回修改/)
  assert.doesNotMatch(component, /成员邀请|权限组|组织架构/)
  assert.doesNotMatch(review, /成员邀请|权限组|组织架构/)
})

test("DELIVERY-UI3 交付入口进入项目工具，并保持手机单列", () => {
  const sidebar = fs.readFileSync("components/WorkspaceSidebar.tsx", "utf8")
  const css = fs.readFileSync("app/globals.css", "utf8")
  assert.match(sidebar, /交付中心/)
  assert.match(sidebar, /onOpenDelivery/)
  assert.match(css, /\.delivery-builder-grid/)
  assert.match(css, /@media \(max-width: 620px\)/)
  assert.match(css, /\.review-comment-compose \{ grid-template-columns: 1fr; /)
})
