// 把模型返回的原始数据整形为 Shot[]，并强制注入角色锚点。
//
// 与 normalize.ts 的分工：那里的对象是「创作产物」（人物/三幕/分集），
// 这里的是「资产链的镜头」。分开是因为镜头还多了一层「锚点注入 + 参考图标注」，
// 且要在流式过程中被反复调用（每收到一个镜头就整形一次）。
import { CAMERA_MOVES, SHOT_SIZES, type Shot, type Scene, type VisualCharacter } from "./types.ts"
import { injectAnchor } from "./anchors.ts"

interface NormalizeShotsInput {
  raw: unknown
  visuals: VisualCharacter[]
  /** 图台账：角色名 -> 该角色已有的参考图标签列表（用于标注本镜该带哪几张） */
  refMap?: Map<string, string[]>
  /** 一次生成只取一次，保证流式过程中 id 稳定（否则 React 会把卡片全部重挂） */
  stamp?: number
}

function pickArray(raw: unknown, key: string): unknown[] {
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === "object") {
    const v = (raw as Record<string, unknown>)[key]
    if (Array.isArray(v)) return v
  }
  return []
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" && v.trim() ? v.trim() : fallback
}

export function normalizeShots({ raw, visuals, refMap, stamp = Date.now() }: NormalizeShotsInput): Shot[] {
  const list = pickArray(raw, "shots")
  const byName = new Map(visuals.map((v) => [v.name, v]))

  const shots = list
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item, index) => {
      const characters = (Array.isArray(item.characters) ? item.characters : [])
        .map((c) => str(c))
        .filter(Boolean)

      /*
        景别与运镜分开兜底。
        还会兜住一种旧数据的错位：早期版本把两者合成一个 camera 字段，
        历史项目里可能存着 camera = "中景"。这里如果发现 camera 里装的是景别，
        就把它挪到 shotSize，运镜回落到「固定」——比整列显示成空要诚实。
      */
      const rawSize = str(item.shotSize)
      const rawCamera = str(item.camera)
      const cameraIsSize = (SHOT_SIZES as readonly string[]).includes(rawCamera)
      const shotSize = (SHOT_SIZES as readonly string[]).includes(rawSize)
        ? rawSize
        : cameraIsSize
          ? rawCamera
          : "中景"
      const camera = (CAMERA_MOVES as readonly string[]).includes(rawCamera) ? rawCamera : "固定"

      // ★B5：把出场角色的锚点强制拼进 prompt，防止模型改写或漏写
      let prompt = str(item.prompt)
      for (const name of characters) {
        const vc = byName.get(name)
        if (vc?.anchor) prompt = injectAnchor(prompt, vc.anchor)
      }

      // ★B6：标注本镜该带哪几张参考图；缺图的角色要显式记录
      const refImages: string[] = []
      const missingRefFor: string[] = []
      for (const name of characters) {
        const labels = refMap?.get(name) ?? []
        if (labels.length > 0) refImages.push(...labels.map((l) => `${name}·${l}`))
        else missingRefFor.push(name)
      }

      return {
        id: `shot-${index}-${stamp}`,
        entityId: `shot-e-${index}`,
        shot: index + 1,          // 镜号以数组下标为准，不信任模型写的值
        scene: str(item.scene, "场景待补充"),
        characters,
        action: str(item.action, "动作待补充"),
        shotSize,
        camera,
        prompt,
        refImages,
        missingRefFor,
        params: { ratio: "9:16", duration: 5, lastFrame: false },
        status: "todo" as const,
      }
    })

  return shots
}

/** 场次整形 */
export function normalizeScenes(raw: unknown): Scene[] {
  const list = pickArray(raw, "scenes")
  return list
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item, index) => ({
      id: `scene-${index}-${Date.now()}`,
      number: index + 1,
      episode: Number.isFinite(Number(item.episode)) ? Number(item.episode) : 1,
      location: str(item.location, "地点待补充"),
      timeOfDay: str(item.timeOfDay, "日"),
      summary: str(item.summary, "场次内容待补充"),
      characters: (Array.isArray(item.characters) ? item.characters : []).map((c) => str(c)).filter(Boolean),
    }))
}

/** 视觉锚点整形：模型可能只给部分字段，补齐并编译 anchor */
export function normalizeVisualCharacters(raw: unknown, names: string[]): VisualCharacter[] {
  const list = pickArray(raw, "visualCharacters")
  return list
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item, index) => {
      const fields = {
        age: str(item.age), face: str(item.face), hair: str(item.hair),
        marks: str(item.marks), wardrobe: str(item.wardrobe), props: str(item.props),
      }
      return {
        id: `vc-${index}-${Date.now()}`,
        name: str(item.name, names[index] ?? `角色 ${index + 1}`),
        ...fields,
        anchor: str(item.anchor) || compileAnchorLocal(fields),
      }
    })
}

// 局部引用，避免与 anchors.ts 形成循环依赖的错觉（这里只是同文件转调）
function compileAnchorLocal(f: { age: string; face: string; hair: string; marks: string; wardrobe: string; props: string }): string {
  const parts: string[] = []
  if (f.age.trim()) parts.push(`age: ${f.age.trim()}`)
  if (f.face.trim()) parts.push(`face: ${f.face.trim()}`)
  if (f.hair.trim()) parts.push(`hair: ${f.hair.trim()}`)
  if (f.marks.trim()) parts.push(`distinguishing feature: ${f.marks.trim()}`)
  if (f.wardrobe.trim()) parts.push(`wearing: ${f.wardrobe.trim()}`)
  if (f.props.trim()) parts.push(`carrying: ${f.props.trim()}`)
  return parts.join(", ")
}
