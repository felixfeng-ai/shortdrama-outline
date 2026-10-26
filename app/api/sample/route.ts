// 载入示例项目：把一整套六步产物写成一个真实项目（不调模型、不扣额度）。
//
// 为什么做成服务端写库而不是只塞进页面状态：
//   示例如果只活在内存里，刷新就没了——那正好演示了"这东西会丢"，
//   与我们要证明的「刷新可续」自相矛盾。写进库里它就和个人项目一样，
//   会出现在项目条里、可切换、可删除。
import { NextResponse } from 'next/server'
import { errorResponse, ok } from '@/lib/api'
import { getDbForRequest } from '@/lib/assets/store'
import { createProject } from '@/lib/assets/repo'
import { persistIfProject } from '@/lib/assets/persist'
import {
  SAMPLE_ACTS,
  SAMPLE_CHARACTERS,
  SAMPLE_EPISODES,
  SAMPLE_IDEA,
  SAMPLE_PLACES,
  SAMPLE_SCENES,
  SAMPLE_SHOTS,
  SAMPLE_TITLE,
  SAMPLE_GENRE,
  SAMPLE_VISUALS,
} from '@/lib/sample'
import { resolveProjectOwner } from '@/lib/auth/request'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const db = getDbForRequest()
    const project = createProject(db, SAMPLE_TITLE, resolveProjectOwner(db, req))

    // 按血缘顺序写：每一步的 parents 指向上一步，这样「影响范围」与对账在示例里也是通的
    persistIfProject(db, project.id, 'idea', { idea: SAMPLE_IDEA, genre: SAMPLE_GENRE }, { kinds: [] })
    persistIfProject(db, project.id, 'characters', SAMPLE_CHARACTERS, { kinds: ['idea'] })
    persistIfProject(db, project.id, 'acts', SAMPLE_ACTS, { kinds: ['characters'] })
    persistIfProject(db, project.id, 'episodes', SAMPLE_EPISODES, { kinds: ['acts'] })
    persistIfProject(db, project.id, 'visualCharacters', SAMPLE_VISUALS, { kinds: ['characters'] })
    persistIfProject(db, project.id, 'visualPlaces', SAMPLE_PLACES, { kinds: ['scenes'] })
    persistIfProject(db, project.id, 'scenes', SAMPLE_SCENES, { kinds: ['episodes'] })
    persistIfProject(db, project.id, 'shots', SAMPLE_SHOTS, { kinds: ['scenes', 'visualCharacters', 'visualPlaces'] })

    return NextResponse.json(ok({ project }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}
