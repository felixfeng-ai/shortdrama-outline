// 本地图库：像素只留在用户的机器上（原则 P1 的前端落点）。
//
// 两条路径：
//   1. Chrome/Edge —— File System Access API，授权目录后可直接读写本地文件夹
//   2. Safari/其他 —— <input type="file"> + IndexedDB 存 Blob
//
// 无论哪条路径，服务端只会收到 vaultKey 与 fileHash，图本身永不上传。
// 这不是「尽量不上传」，是设计上不提供上传通道。

export type VaultMode = "fs-access" | "indexeddb"

export interface VaultFile {
  key: string      // 图库内相对路径（fs-access）或 IndexedDB key（indexeddb）
  name: string
  hash: string     // sha-256，用于检测「图被替换」
  size: number
  mime: string
}

const DB_NAME = "chengju-vault"
const STORE = "blobs"
const HANDLE_STORE = "handles"

/** 能力探测：决定用哪条路径 */
export function detectVaultMode(): VaultMode {
  return typeof window !== "undefined" && "showDirectoryPicker" in window ? "fs-access" : "indexeddb"
}

/** 计算 sha-256（用于指纹校验） */
export async function hashBlob(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  const digest = await crypto.subtle.digest("SHA-256", buf)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("")
}

// ── IndexedDB 基础操作 ─────────────────────────────────────────

function openVaultDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
      if (!db.objectStoreNames.contains(HANDLE_STORE)) db.createObjectStore(HANDLE_STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbPut(store: string, key: string, value: unknown): Promise<void> {
  const db = await openVaultDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite")
    tx.objectStore(store).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

async function idbGet<T>(store: string, key: string): Promise<T | null> {
  const db = await openVaultDb()
  const result = await new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(store, "readonly")
    const req = tx.objectStore(store).get(key)
    req.onsuccess = () => resolve((req.result as T) ?? null)
    req.onerror = () => reject(req.error)
  })
  db.close()
  return result
}

async function idbKeys(store: string): Promise<string[]> {
  const db = await openVaultDb()
  const keys = await new Promise<string[]>((resolve, reject) => {
    const tx = db.transaction(store, "readonly")
    const req = tx.objectStore(store).getAllKeys()
    req.onsuccess = () => resolve(req.result as string[])
    req.onerror = () => reject(req.error)
  })
  db.close()
  return keys
}

// ── 目录句柄的持久化（fs-access 路径）─────────────────────────

export async function saveDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  await idbPut(HANDLE_STORE, "current", handle)
}

export async function loadDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  return idbGet<FileSystemDirectoryHandle>(HANDLE_STORE, "current")
}

/**
 * 选择素材文件夹并持久化句柄。
 * 刷新后调用 loadDirectoryHandle 即可恢复，无需重新选择。
 */
export async function pickDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (detectVaultMode() !== "fs-access") return null
  const handle = await (window as unknown as {
    showDirectoryPicker: (opts?: { mode?: string }) => Promise<FileSystemDirectoryHandle>
  }).showDirectoryPicker({ mode: "readwrite" })
  await saveDirectoryHandle(handle)
  return handle
}

/** 递归列出目录下的图片（只要 image/*） */
export async function listImages(
  handle: FileSystemDirectoryHandle,
  prefix = "",
): Promise<VaultFile[]> {
  const out: VaultFile[] = []
  // @ts-expect-error values() 在 TS 的 lib.dom 里尚未覆盖
  for await (const entry of handle.values()) {
    const key = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.kind === "directory") {
      out.push(...(await listImages(entry as FileSystemDirectoryHandle, key)))
    } else {
      const file = await (entry as FileSystemFileHandle).getFile()
      if (!file.type.startsWith("image/")) continue
      out.push({
        key, name: entry.name, hash: await hashBlob(file), size: file.size, mime: file.type,
      })
    }
  }
  return out
}

// ── IndexedDB 路径 ─────────────────────────────────────────────

/** 把用户选的文件存进 IndexedDB（Safari 等不支持目录 API 的浏览器） */
export async function addFilesToVault(files: File[]): Promise<VaultFile[]> {
  const out: VaultFile[] = []
  for (const file of files) {
    const hash = await hashBlob(file)
    const key = `${hash.slice(0, 16)}-${file.name}`
    await idbPut(STORE, key, file)
    out.push({ key, name: file.name, hash, size: file.size, mime: file.type })
  }
  return out
}

export async function listVaultFiles(): Promise<VaultFile[]> {
  const keys = await idbKeys(STORE)
  const out: VaultFile[] = []
  for (const key of keys) {
    const blob = await idbGet<Blob>(STORE, key)
    if (!blob) continue
    out.push({
      key, name: key.replace(/^[0-9a-f]+-/, ""),
      hash: key.split("-")[0], size: blob.size, mime: blob.type || "image/png",
    })
  }
  return out
}

// ── 名字归一化与拼音折叠 ──────────────────────────────────────
//
// 真实场景：从即梦下载的定妆图，文件夹名是「JIAN NAN」这种拼音大写，
// 文件名是「简南_定妆照.png」这种「中文名_用途」。用户不可能为了让我们
// 认出图，回头把几十个文件夹一个个改名。
//
// 所以匹配必须自己扛住各种写法：
//   JIAN NAN / JIANNAN / jian_nan / jian-nan / 简南 / 简南-定妆 / 简南_定妆照
//   即梦_19700101.png / 1/ / 2/（无信息命名，算法无从下手 → 交给 AI 兜底，见 /api/asset-match）
//
// 为什么不走 LLM：拼音折叠是确定性算法，简南 ↔ JIAN NAN 是 100% 可判定的，
// 用概率模型既慢又要把文件名传到服务端，与「文件不出门」的设计冲突。
// LLM 只留给算法真的救不了的场景（纯数字名），且必须由用户显式触发。

/** 目录/文件名里常见的「用途词」，归一化后要剥掉，否则会干扰匹配 */
const NOISE_WORDS = [
  "定妆照", "定妆", "三视图", "参考图", "人设图", "角色图", "设定图", "全身图", "半身图",
  "正面", "侧面", "背面", "半身", "全身", "头像", "立绘", "即梦",
]

/** 常见姓氏与高频字的首字母，用于处理「拼音首字母」式命名（LR / JN） */
const INITIAL_HINT = "林李陈张刘王赵黄周吴徐孙马朱胡郭何高罗郑梁谢宋唐许韩冯邓曹彭曾肖田董袁潘蒋蔡余杜叶程苏魏吕丁沈任姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛闫段雷侯龙史陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向汤"

/** 多音字/易错字的定向修正（转拼音前先替换，避免把「重」读成 zhong） */
const PINYIN_FIX: Record<string, string> = {
  "长": "chang", "重": "chong", "乐": "le", "行": "xing", "曾": "zeng",
}

/**
 * 归一化：只保留字母、数字与汉字，其余（空格/下划线/连字符/点）全部丢弃。
 * 「JIAN NAN_定妆照」→「jiannan定妆照」，「林远-定妆」→「林远定妆」
 */
export function normalizeName(raw: string): string {
  return (raw ?? "")
    .toString()
    .toLowerCase()
    .replace(/[\s_\-–—.·、,，/\\|()（）\[\]【】]/g, "")
    .trim()
}

/** 剥掉用途词（正面/定妆照/即梦…），得到「可能是角色名」的那一段 */
export function stripNoise(raw: string): string {
  let out = normalizeName(raw)
  for (const word of NOISE_WORDS) out = out.split(normalizeName(word)).join("")
  return out
}

/**
 * 汉字 → 拼音（不带声调）。
 *
 * 为了守住「零新增依赖」，这里不引 pinyin-pro，用一张覆盖常用字的映射表：
 *   - 表里有的字：查表
 *   - 表里没有的字：原样保留（宁可匹配不上，也不要猜错——挂错图比不挂更糟）
 */
const PINYIN_TABLE: Record<string, string> = {
  "阿":"a", "啊":"a", "爱":"ai", "艾":"ai", "唉":"ai", "哀":"ai", "矮":"ai", "碍":"ai", "安":"an", "按":"an", "案":"an", "暗":"an",
  "岸":"an", "昂":"ang", "奥":"ao", "澳":"ao", "傲":"ao", "熬":"ao", "八":"ba", "巴":"ba", "吧":"ba", "拔":"ba", "把":"ba", "爸":"ba",
  "罢":"ba", "霸":"ba", "白":"bai", "百":"bai", "拜":"bai", "败":"bai", "柏":"bai", "摆":"bai", "班":"ban", "般":"ban", "搬":"ban", "板":"ban",
  "版":"ban", "半":"ban", "办":"ban", "伴":"ban", "扮":"ban", "帮":"bang", "邦":"bang", "榜":"bang", "棒":"bang", "绑":"bang", "包":"bao", "宝":"bao",
  "保":"bao", "报":"bao", "抱":"bao", "暴":"bao", "爆":"bao", "薄":"bao", "饱":"bao", "堡":"bao", "北":"bei", "背":"bei", "贝":"bei", "备":"bei",
  "被":"bei", "倍":"bei", "悲":"bei", "杯":"bei", "辈":"bei", "碑":"bei", "本":"ben", "奔":"ben", "笨":"ben", "蹦":"beng", "泵":"beng", "比":"bi",
  "笔":"bi", "必":"bi", "毕":"bi", "币":"bi", "闭":"bi", "碧":"bi", "壁":"bi", "避":"bi", "疲":"bi", "鼻":"bi", "鄙":"bi", "边":"bian",
  "编":"bian", "变":"bian", "遍":"bian", "便":"bian", "辩":"bian", "辨":"bian", "鞭":"bian", "表":"biao", "标":"biao", "彪":"biao", "镖":"biao", "婊":"biao",
  "别":"bie", "憋":"bie", "宾":"bin", "滨":"bin", "彬":"bin", "斌":"bin", "濒":"bin", "并":"bing", "病":"bing", "兵":"bing", "冰":"bing", "饼":"bing",
  "柄":"bing", "秉":"bing", "屏":"bing", "波":"bo", "博":"bo", "伯":"bo", "播":"bo", "泊":"bo", "勃":"bo", "拨":"bo", "脖":"bo", "不":"bu",
  "步":"bu", "部":"bu", "布":"bu", "补":"bu", "捕":"bu", "簿":"bu", "怖":"bu", "擦":"ca", "才":"cai", "材":"cai", "财":"cai", "采":"cai",
  "彩":"cai", "菜":"cai", "猜":"cai", "裁":"cai", "参":"can", "残":"can", "惨":"can", "灿":"can", "餐":"can", "蚕":"can", "藏":"cang", "仓":"cang",
  "苍":"cang", "舱":"cang", "草":"cao", "曹":"cao", "操":"cao", "糙":"cao", "策":"ce", "测":"ce", "侧":"ce", "册":"ce", "厕":"ce", "层":"ceng",
  "曾":"ceng", "蹭":"ceng", "查":"cha", "差":"cha", "茶":"cha", "插":"cha", "叉":"cha", "察":"cha", "刹":"cha", "拆":"chai", "柴":"chai", "产":"chan",
  "颤":"chan", "缠":"chan", "禅":"chan", "馋":"chan", "长":"chang", "常":"chang", "场":"chang", "厂":"chang", "唱":"chang", "昌":"chang", "畅":"chang", "尝":"chang",
  "肠":"chang", "朝":"chao", "超":"chao", "潮":"chao", "吵":"chao", "炒":"chao", "抄":"chao", "车":"che", "彻":"che", "扯":"che", "撤":"che", "陈":"chen",
  "晨":"chen", "沉":"chen", "尘":"chen", "臣":"chen", "辰":"chen", "衬":"chen", "趁":"chen", "橙":"chen", "嗔":"chen", "成":"cheng", "城":"cheng", "程":"cheng",
  "诚":"cheng", "承":"cheng", "称":"cheng", "呈":"cheng", "乘":"cheng", "惩":"cheng", "澄":"cheng", "撑":"cheng", "吃":"chi", "持":"chi", "迟":"chi", "池":"chi",
  "尺":"chi", "赤":"chi", "痴":"chi", "翅":"chi", "耻":"chi", "驰":"chi", "冲":"chong", "充":"chong", "重":"chong", "崇":"chong", "宠":"chong", "虫":"chong",
  "抽":"chou", "仇":"chou", "愁":"chou", "丑":"chou", "臭":"chou", "筹":"chou", "绸":"chou", "出":"chu", "除":"chu", "初":"chu", "处":"chu", "楚":"chu",
  "触":"chu", "储":"chu", "厨":"chu", "础":"chu", "锄":"chu", "雏":"chu", "传":"chuan", "船":"chuan", "川":"chuan", "穿":"chuan", "串":"chuan", "喘":"chuan",
  "创":"chuang", "窗":"chuang", "床":"chuang", "闯":"chuang", "疮":"chuang", "吹":"chui", "垂":"chui", "锤":"chui", "春":"chun", "纯":"chun", "唇":"chun", "蠢":"chun",
  "淳":"chun", "次":"ci", "此":"ci", "刺":"ci", "词":"ci", "慈":"ci", "磁":"ci", "瓷":"ci", "赐":"ci", "从":"cong", "聪":"cong", "匆":"cong",
  "丛":"cong", "葱":"cong", "粗":"cu", "促":"cu", "醋":"cu", "窜":"cuan", "崔":"cui", "催":"cui", "脆":"cui", "翠":"cui", "存":"cun", "村":"cun",
  "寸":"cun", "错":"cuo", "措":"cuo", "挫":"cuo", "大":"da", "打":"da", "达":"da", "答":"da", "搭":"da", "带":"dai", "代":"dai", "待":"dai",
  "戴":"dai", "袋":"dai", "贷":"dai", "逮":"dai", "呆":"dai", "单":"dan", "但":"dan", "担":"dan", "丹":"dan", "淡":"dan", "蛋":"dan", "弹":"dan",
  "胆":"dan", "旦":"dan", "诞":"dan", "耽":"dan", "当":"dang", "党":"dang", "挡":"dang", "荡":"dang", "档":"dang", "到":"dao", "道":"dao", "倒":"dao",
  "刀":"dao", "岛":"dao", "盗":"dao", "导":"dao", "稻":"dao", "德":"de", "得":"de", "等":"deng", "灯":"deng", "邓":"deng", "登":"deng", "凳":"deng",
  "地":"di", "第":"di", "低":"di", "底":"di", "迪":"di", "弟":"di", "敌":"di", "帝":"di", "递":"di", "堤":"di", "滴":"di", "点":"dian",
  "电":"dian", "店":"dian", "典":"dian", "殿":"dian", "垫":"dian", "惦":"dian", "淀":"dian", "掉":"diao", "调":"diao", "吊":"diao", "雕":"diao", "刁":"diao",
  "爹":"die", "叠":"die", "跌":"die", "蝶":"die", "定":"ding", "丁":"ding", "顶":"ding", "订":"ding", "鼎":"ding", "盯":"ding", "钉":"ding", "东":"dong",
  "动":"dong", "懂":"dong", "冬":"dong", "董":"dong", "洞":"dong", "冻":"dong", "栋":"dong", "都":"dou", "斗":"dou", "豆":"dou", "抖":"dou", "陡":"dou",
  "兜":"dou", "读":"du", "度":"du", "独":"du", "毒":"du", "赌":"du", "堵":"du", "渡":"du", "杜":"du", "肚":"du", "镀":"du", "段":"duan",
  "断":"duan", "端":"duan", "短":"duan", "锻":"duan", "对":"dui", "队":"dui", "堆":"dui", "兑":"dui", "顿":"dun", "吨":"dun", "蹲":"dun", "盾":"dun",
  "炖":"dun", "多":"duo", "夺":"duo", "朵":"duo", "躲":"duo", "舵":"duo", "堕":"duo", "饿":"e", "恶":"e", "额":"e", "鹅":"e", "俄":"e",
  "娥":"e", "扼":"e", "恩":"en", "儿":"er", "而":"er", "尔":"er", "耳":"er", "二":"er", "发":"fa", "法":"fa", "罚":"fa", "乏":"fa",
  "伐":"fa", "饭":"fan", "反":"fan", "犯":"fan", "翻":"fan", "凡":"fan", "范":"fan", "烦":"fan", "繁":"fan", "番":"fan", "返":"fan", "贩":"fan",
  "方":"fang", "放":"fang", "房":"fang", "防":"fang", "访":"fang", "仿":"fang", "芳":"fang", "纺":"fang", "飞":"fei", "非":"fei", "费":"fei", "肥":"fei",
  "废":"fei", "肺":"fei", "匪":"fei", "沸":"fei", "分":"fen", "份":"fen", "粉":"fen", "纷":"fen", "奋":"fen", "愤":"fen", "芬":"fen", "风":"feng",
  "封":"feng", "峰":"feng", "丰":"feng", "疯":"feng", "冯":"feng", "奉":"feng", "缝":"feng", "凤":"feng", "锋":"feng", "佛":"fo", "否":"fou", "副":"fu",
  "服":"fu", "福":"fu", "富":"fu", "府":"fu", "父":"fu", "复":"fu", "付":"fu", "负":"fu", "妇":"fu", "扶":"fu", "浮":"fu", "幅":"fu",
  "俯":"fu", "符":"fu", "肤":"fu", "腐":"fu", "该":"gai", "改":"gai", "盖":"gai", "概":"gai", "钙":"gai", "丐":"gai", "干":"gan", "感":"gan",
  "敢":"gan", "甘":"gan", "刚":"gan", "肝":"gan", "赶":"gan", "杆":"gan", "尴":"gan", "钢":"gang", "岗":"gang", "港":"gang", "纲":"gang", "缸":"gang",
  "高":"gao", "告":"gao", "搞":"gao", "稿":"gao", "膏":"gao", "糕":"gao", "个":"ge", "各":"ge", "格":"ge", "歌":"ge", "哥":"ge", "割":"ge",
  "搁":"ge", "阁":"ge", "葛":"ge", "隔":"ge", "给":"gei", "跟":"gen", "根":"gen", "更":"geng", "庚":"geng", "耕":"geng", "耿":"geng", "埂":"geng",
  "工":"gong", "公":"gong", "共":"gong", "同":"gong", "攻":"gong", "功":"gong", "宫":"gong", "巩":"gong", "贡":"gong", "恭":"gong", "拱":"gong", "够":"gou",
  "沟":"gou", "狗":"gou", "构":"gou", "购":"gou", "勾":"gou", "钩":"gou", "古":"gu", "故":"gu", "顾":"gu", "骨":"gu", "谷":"gu", "股":"gu",
  "鼓":"gu", "固":"gu", "雇":"gu", "孤":"gu", "姑":"gu", "挂":"gua", "刮":"gua", "瓜":"gua", "寡":"gua", "怪":"guai", "拐":"guai", "关":"guan",
  "管":"guan", "观":"guan", "官":"guan", "冠":"guan", "馆":"guan", "惯":"guan", "灌":"guan", "光":"guang", "广":"guang", "逛":"guang", "贵":"gui", "归":"gui",
  "鬼":"gui", "柜":"gui", "规":"gui", "桂":"gui", "跪":"gui", "硅":"gui", "滚":"gun", "棍":"gun", "国":"guo", "过":"guo", "果":"guo", "锅":"guo",
  "郭":"guo", "裹":"guo", "哈":"ha", "还":"hai", "海":"hai", "孩":"hai", "害":"hai", "嗨":"hai", "喊":"han", "汗":"han", "汉":"han", "韩":"han",
  "含":"han", "寒":"han", "涵":"han", "旱":"han", "焊":"han", "憾":"han", "行":"hang", "航":"hang", "杭":"hang", "好":"hao", "号":"hao", "豪":"hao",
  "毫":"hao", "浩":"hao", "耗":"hao", "郝":"hao", "和":"he", "合":"he", "何":"he", "喝":"he", "河":"he", "贺":"he", "赫":"he", "荷":"he",
  "盒":"he", "核":"he", "鹤":"he", "禾":"he", "黑":"hei", "嘿":"hei", "很":"hen", "恨":"hen", "痕":"hen", "横":"heng", "恒":"heng", "衡":"heng",
  "哼":"heng", "亨":"heng", "红":"hong", "洪":"hong", "宏":"hong", "轰":"hong", "烘":"hong", "虹":"hong", "鸿":"hong", "弘":"hong", "后":"hou", "候":"hou",
  "厚":"hou", "侯":"hou", "吼":"hou", "喉":"hou", "乎":"hu", "护":"hu", "户":"hu", "呼":"hu", "胡":"hu", "湖":"hu", "虎":"hu", "互":"hu",
  "忽":"hu", "壶":"hu", "糊":"hu", "蝴":"hu", "化":"hua", "华":"hua", "花":"hua", "话":"hua", "画":"hua", "划":"hua", "滑":"hua", "哗":"hua",
  "桦":"hua", "怀":"huai", "坏":"huai", "淮":"huai", "槐":"huai", "换":"huan", "环":"huan", "缓":"huan", "欢":"huan", "幻":"huan", "唤":"huan", "焕":"huan",
  "患":"huan", "黄":"huang", "荒":"huang", "慌":"huang", "皇":"huang", "煌":"huang", "晃":"huang", "谎":"huang", "凰":"huang", "会":"hui", "回":"hui", "惠":"hui",
  "挥":"hui", "辉":"hui", "灰":"hui", "恢":"hui", "汇":"hui", "慧":"hui", "绘":"hui", "悔":"hui", "贿":"hui", "婚":"hun", "混":"hun", "魂":"hun",
  "昏":"hun", "浑":"hun", "活":"huo", "火":"huo", "或":"huo", "货":"huo", "获":"huo", "祸":"huo", "惑":"huo", "霍":"huo", "几":"ji", "及":"ji",
  "即":"ji", "机":"ji", "级":"ji", "极":"ji", "急":"ji", "集":"ji", "记":"ji", "计":"ji", "济":"ji", "技":"ji", "击":"ji", "既":"ji",
  "纪":"ji", "继":"ji", "基":"ji", "绩":"ji", "季":"ji", "寄":"ji", "鸡":"ji", "激":"ji", "迹":"ji", "姬":"ji", "冀":"ji", "忌":"ji",
  "脊":"ji", "寂":"ji", "家":"jia", "加":"jia", "价":"jia", "假":"jia", "甲":"jia", "佳":"jia", "架":"jia", "嘉":"jia", "嫁":"jia", "夹":"jia",
  "驾":"jia", "稼":"jia", "见":"jian", "件":"jian", "间":"jian", "建":"jian", "健":"jian", "剑":"jian", "键":"jian", "简":"jian", "坚":"jian", "监":"jian",
  "渐":"jian", "肩":"jian", "艰":"jian", "减":"jian", "检":"jian", "荐":"jian", "箭":"jian", "舰":"jian", "兼":"jian", "将":"jiang", "江":"jiang", "讲":"jiang",
  "降":"jiang", "蒋":"jiang", "奖":"jiang", "姜":"jiang", "酱":"jiang", "疆":"jiang", "匠":"jiang", "叫":"jiao", "教":"jiao", "交":"jiao", "较":"jiao", "角":"jiao",
  "脚":"jiao", "觉":"jiao", "焦":"jiao", "骄":"jiao", "郊":"jiao", "缴":"jiao", "浇":"jiao", "娇":"jiao", "接":"jie", "结":"jie", "节":"jie", "解":"jie",
  "街":"jie", "界":"jie", "借":"jie", "介":"jie", "姐":"jie", "阶":"jie", "届":"jie", "劫":"jie", "杰":"jie", "洁":"jie", "捷":"jie", "竭":"jie",
  "今":"jin", "金":"jin", "进":"jin", "近":"jin", "紧":"jin", "尽":"jin", "仅":"jin", "劲":"jin", "禁":"jin", "津":"jin", "锦":"jin", "谨":"jin",
  "晋":"jin", "浸":"jin", "京":"jing", "经":"jing", "精":"jing", "惊":"jing", "警":"jing", "竟":"jing", "境":"jing", "静":"jing", "敬":"jing", "镜":"jing",
  "睛":"jing", "景":"jing", "净":"jing", "晶":"jing", "荆":"jing", "径":"jing", "颈":"jing", "窘":"jiong", "就":"jiu", "九":"jiu", "久":"jiu", "酒":"jiu",
  "旧":"jiu", "救":"jiu", "究":"jiu", "纠":"jiu", "揪":"jiu", "舅":"jiu", "句":"ju", "局":"ju", "举":"ju", "具":"ju", "居":"ju", "据":"ju",
  "剧":"ju", "聚":"ju", "巨":"ju", "拒":"ju", "距":"ju", "矩":"ju", "鞠":"ju", "菊":"ju", "咀":"ju", "卷":"juan", "捐":"juan", "圈":"juan",
  "倦":"juan", "娟":"juan", "决":"jue", "绝":"jue", "爵":"jue", "掘":"jue", "倔":"jue", "诀":"jue", "军":"jun", "均":"jun", "君":"jun", "俊":"jun",
  "菌":"jun", "峻":"jun", "骏":"jun", "钧":"jun", "郡":"jun", "卡":"ka", "咖":"ka", "喀":"ka", "开":"kai", "凯":"kai", "慨":"kai", "楷":"kai",
  "看":"kan", "砍":"kan", "刊":"kan", "堪":"kan", "康":"kang", "抗":"kang", "扛":"kang", "炕":"kang", "考":"kao", "靠":"kao", "烤":"kao", "拷":"kao",
  "可":"ke", "科":"ke", "克":"ke", "客":"ke", "刻":"ke", "课":"ke", "颗":"ke", "渴":"ke", "壳":"ke", "柯":"ke", "苛":"ke", "肯":"ken",
  "恳":"ken", "啃":"ken", "坑":"keng", "空":"kong", "孔":"kong", "恐":"kong", "控":"kong", "口":"kou", "扣":"kou", "抠":"kou", "寇":"kou", "哭":"ku",
  "苦":"ku", "库":"ku", "裤":"ku", "酷":"ku", "枯":"ku", "窟":"ku", "跨":"kua", "夸":"kua", "垮":"kua", "快":"kuai", "块":"kuai", "筷":"kuai",
  "款":"kuan", "宽":"kuan", "况":"kuang", "狂":"kuang", "框":"kuang", "矿":"kuang", "筐":"kuang", "亏":"kui", "愧":"kui", "溃":"kui", "魁":"kui", "葵":"kui",
  "困":"kun", "昆":"kun", "捆":"kun", "扩":"kuo", "阔":"kuo", "括":"kuo", "啦":"la", "拉":"la", "辣":"la", "落":"la", "蜡":"la", "喇":"la",
  "来":"lai", "赖":"lai", "莱":"lai", "睐":"lai", "兰":"lan", "蓝":"lan", "懒":"lan", "栏":"lan", "烂":"lan", "拦":"lan", "篮":"lan", "澜":"lan",
  "览":"lan", "浪":"lang", "朗":"lang", "狼":"lang", "郎":"lang", "廊":"lang", "老":"lao", "劳":"lao", "牢":"lao", "捞":"lao", "姥":"lao", "了":"le",
  "乐":"le", "勒":"le", "类":"lei", "雷":"lei", "累":"lei", "泪":"lei", "蕾":"lei", "擂":"lei", "磊":"lei", "冷":"leng", "愣":"leng", "里":"li",
  "理":"li", "力":"li", "立":"li", "李":"li", "利":"li", "离":"li", "例":"li", "历":"li", "丽":"li", "礼":"li", "励":"li", "厉":"li",
  "黎":"li", "莉":"li", "犁":"li", "篱":"li", "隶":"li", "联":"lian", "连":"lian", "脸":"lian", "练":"lian", "恋":"lian", "莲":"lian", "链":"lian",
  "怜":"lian", "廉":"lian", "镰":"lian", "两":"liang", "量":"liang", "亮":"liang", "良":"liang", "凉":"liang", "粮":"liang", "梁":"liang", "辆":"liang", "谅":"liang",
  "料":"liao", "聊":"liao", "疗":"liao", "廖":"liao", "辽":"liao", "撩":"liao", "列":"lie", "烈":"lie", "裂":"lie", "猎":"lie", "劣":"lie", "林":"lin",
  "临":"lin", "邻":"lin", "淋":"lin", "琳":"lin", "鳞":"lin", "霖":"lin", "吝":"lin", "领":"ling", "令":"ling", "另":"ling", "零":"ling", "灵":"ling",
  "铃":"ling", "龄":"ling", "凌":"ling", "陵":"ling", "玲":"ling", "六":"liu", "流":"liu", "留":"liu", "刘":"liu", "柳":"liu", "溜":"liu", "瘤":"liu",
  "龙":"long", "隆":"long", "笼":"long", "聋":"long", "拢":"long", "楼":"lou", "漏":"lou", "露":"lou", "搂":"lou", "路":"lu", "陆":"lu", "录":"lu",
  "鲁":"lu", "炉":"lu", "卢":"lu", "鹿":"lu", "颅":"lu", "庐":"lu", "吕":"lv", "旅":"lv", "绿":"lv", "律":"lv", "虑":"lv", "铝":"lv",
  "履":"lv", "乱":"luan", "卵":"luan", "略":"lue", "掠":"lue", "论":"lun", "轮":"lun", "伦":"lun", "沦":"lun", "罗":"luo", "洛":"luo", "络":"luo",
  "骆":"luo", "裸":"luo", "萝":"luo", "逻":"luo", "妈":"ma", "马":"ma", "吗":"ma", "嘛":"ma", "码":"ma", "麻":"ma", "骂":"ma", "玛":"ma",
  "买":"mai", "卖":"mai", "麦":"mai", "迈":"mai", "脉":"mai", "埋":"mai", "满":"man", "慢":"man", "蛮":"man", "漫":"man", "瞒":"man", "蔓":"man",
  "曼":"man", "忙":"mang", "盲":"mang", "茫":"mang", "芒":"mang", "莽":"mang", "毛":"mao", "冒":"mao", "贸":"mao", "貌":"mao", "猫":"mao", "矛":"mao",
  "茂":"mao", "茅":"mao", "锚":"mao", "么":"me", "没":"mei", "每":"mei", "美":"mei", "妹":"mei", "眉":"mei", "梅":"mei", "煤":"mei", "媒":"mei",
  "霉":"mei", "玫":"mei", "镁":"mei", "酶":"mei", "门":"men", "们":"men", "闷":"men", "梦":"meng", "猛":"meng", "蒙":"meng", "孟":"meng", "盟":"meng",
  "萌":"meng", "朦":"meng", "米":"mi", "密":"mi", "迷":"mi", "秘":"mi", "蜜":"mi", "谜":"mi", "弥":"mi", "面":"mian", "免":"mian", "棉":"mian",
  "眠":"mian", "绵":"mian", "勉":"mian", "缅":"mian", "秒":"miao", "苗":"miao", "妙":"miao", "描":"miao", "庙":"miao", "瞄":"miao", "渺":"miao", "灭":"mie",
  "蔑":"mie", "民":"min", "敏":"min", "闽":"min", "皿":"min", "悯":"min", "名":"ming", "明":"ming", "命":"ming", "鸣":"ming", "铭":"ming", "冥":"ming",
  "谬":"miu", "莫":"mo", "摸":"mo", "模":"mo", "磨":"mo", "摩":"mo", "默":"mo", "墨":"mo", "末":"mo", "沫":"mo", "抹":"mo", "陌":"mo",
  "膜":"mo", "魔":"mo", "某":"mou", "谋":"mou", "牟":"mou", "母":"mu", "目":"mu", "木":"mu", "幕":"mu", "慕":"mu", "牧":"mu", "穆":"mu",
  "亩":"mu", "墓":"mu", "拇":"mu", "那":"na", "拿":"na", "哪":"na", "纳":"na", "娜":"na", "呐":"na", "乃":"nai", "奶":"nai", "耐":"nai",
  "奈":"nai", "南":"nan", "难":"nan", "男":"nan", "楠":"nan", "囊":"nang", "脑":"nao", "闹":"nao", "恼":"nao", "挠":"nao", "呢":"ne", "内":"nei",
  "嫩":"nen", "能":"neng", "你":"ni", "尼":"ni", "泥":"ni", "逆":"ni", "昵":"ni", "匿":"ni", "腻":"ni", "倪":"ni", "年":"nian", "念":"nian",
  "粘":"nian", "碾":"nian", "娘":"niang", "酿":"niang", "鸟":"niao", "尿":"niao", "捏":"nie", "聂":"nie", "孽":"nie", "您":"nin", "宁":"ning", "凝":"ning",
  "拧":"ning", "牛":"niu", "扭":"niu", "纽":"niu", "钮":"niu", "弄":"nong", "农":"nong", "浓":"nong", "怒":"nu", "努":"nu", "奴":"nu", "女":"nv",
  "暖":"nuan", "诺":"nuo", "挪":"nuo", "懦":"nuo", "哦":"o", "噢":"o", "欧":"ou", "偶":"ou", "呕":"ou", "鸥":"ou", "怕":"pa", "爬":"pa",
  "帕":"pa", "趴":"pa", "排":"pai", "派":"pai", "拍":"pai", "牌":"pai", "徘":"pai", "盘":"pan", "判":"pan", "潘":"pan", "盼":"pan", "叛":"pan",
  "攀":"pan", "旁":"pang", "胖":"pang", "庞":"pang", "跑":"pao", "泡":"pao", "炮":"pao", "抛":"pao", "袍":"pao", "陪":"pei", "配":"pei", "培":"pei",
  "赔":"pei", "佩":"pei", "裴":"pei", "喷":"pen", "盆":"pen", "朋":"peng", "彭":"peng", "碰":"peng", "鹏":"peng", "蓬":"peng", "捧":"peng", "棚":"peng",
  "膨":"peng", "皮":"pi", "批":"pi", "披":"pi", "劈":"pi", "匹":"pi", "屁":"pi", "脾":"pi", "僻":"pi", "片":"pian", "篇":"pian", "偏":"pian",
  "骗":"pian", "翩":"pian", "票":"piao", "漂":"piao", "飘":"piao", "瓢":"piao", "撇":"pie", "品":"pin", "拼":"pin", "贫":"pin", "频":"pin", "聘":"pin",
  "平":"ping", "评":"ping", "凭":"ping", "瓶":"ping", "苹":"ping", "萍":"ping", "破":"po", "颇":"po", "坡":"po", "泼":"po", "婆":"po", "迫":"po",
  "魄":"po", "剖":"pou", "普":"pu", "铺":"pu", "扑":"pu", "朴":"pu", "谱":"pu", "葡":"pu", "蒲":"pu", "仆":"pu", "起":"qi", "其":"qi",
  "气":"qi", "七":"qi", "期":"qi", "齐":"qi", "奇":"qi", "妻":"qi", "旗":"qi", "启":"qi", "企":"qi", "器":"qi", "汽":"qi", "祁":"qi",
  "戚":"qi", "岂":"qi", "凄":"qi", "祈":"qi", "泣":"qi", "恰":"qia", "掐":"qia", "前":"qian", "钱":"qian", "千":"qian", "签":"qian", "浅":"qian",
  "欠":"qian", "歉":"qian", "牵":"qian", "迁":"qian", "铅":"qian", "谦":"qian", "乾":"qian", "茜":"qian", "强":"qiang", "枪":"qiang", "抢":"qiang", "墙":"qiang",
  "腔":"qiang", "跄":"qiang", "桥":"qiao", "敲":"qiao", "巧":"qiao", "瞧":"qiao", "乔":"qiao", "侨":"qiao", "俏":"qiao", "窍":"qiao", "切":"qie", "且":"qie",
  "窃":"qie", "茄":"qie", "亲":"qin", "秦":"qin", "琴":"qin", "勤":"qin", "侵":"qin", "禽":"qin", "芹":"qin", "沁":"qin", "钦":"qin", "请":"qing",
  "情":"qing", "青":"qing", "轻":"qing", "清":"qing", "庆":"qing", "晴":"qing", "倾":"qing", "卿":"qing", "擎":"qing", "穷":"qiong", "琼":"qiong", "求":"qiu",
  "球":"qiu", "秋":"qiu", "丘":"qiu", "邱":"qiu", "囚":"qiu", "酋":"qiu", "去":"qu", "取":"qu", "区":"qu", "曲":"qu", "趣":"qu", "娶":"qu",
  "屈":"qu", "趋":"qu", "渠":"qu", "全":"quan", "权":"quan", "拳":"quan", "劝":"quan", "泉":"quan", "犬":"quan", "券":"quan", "却":"que", "确":"que",
  "缺":"que", "鹊":"que", "雀":"que", "瘸":"que", "群":"qun", "裙":"qun", "然":"ran", "染":"ran", "燃":"ran", "冉":"ran", "让":"rang", "嚷":"rang",
  "壤":"rang", "绕":"rao", "扰":"rao", "饶":"rao", "热":"re", "惹":"re", "人":"ren", "认":"ren", "任":"ren", "仁":"ren", "忍":"ren", "韧":"ren",
  "刃":"ren", "饪":"ren", "仍":"reng", "扔":"reng", "日":"ri", "容":"rong", "荣":"rong", "融":"rong", "绒":"rong", "溶":"rong", "蓉":"rong", "戎":"rong",
  "肉":"rou", "柔":"rou", "揉":"rou", "入":"ru", "如":"ru", "乳":"ru", "辱":"ru", "儒":"ru", "茹":"ru", "软":"ruan", "阮":"ruan", "瑞":"rui",
  "锐":"rui", "睿":"rui", "蕊":"rui", "润":"run", "闰":"run", "若":"ruo", "弱":"ruo", "撒":"sa", "洒":"sa", "萨":"sa", "赛":"sai", "塞":"sai",
  "腮":"sai", "三":"san", "散":"san", "伞":"san", "叁":"san", "桑":"sang", "嗓":"sang", "丧":"sang", "扫":"sao", "骚":"sao", "嫂":"sao", "色":"se",
  "涩":"se", "瑟":"se", "森":"sen", "僧":"seng", "沙":"sha", "杀":"sha", "啥":"sha", "衫":"sha", "傻":"sha", "纱":"sha", "煞":"sha", "莎":"sha",
  "晒":"shai", "筛":"shai", "山":"shan", "善":"shan", "闪":"shan", "珊":"shan", "删":"shan", "扇":"shan", "杉":"shan", "上":"shang", "商":"shang", "伤":"shang",
  "尚":"shang", "赏":"shang", "裳":"shang", "少":"shao", "绍":"shao", "烧":"shao", "稍":"shao", "勺":"shao", "邵":"shao", "社":"she", "设":"she", "射":"she",
  "舍":"she", "蛇":"she", "舌":"she", "涉":"she", "摄":"she", "奢":"she", "身":"shen", "深":"shen", "神":"shen", "什":"shen", "甚":"shen", "审":"shen",
  "申":"shen", "伸":"shen", "沈":"shen", "慎":"shen", "肾":"shen", "渗":"shen", "婶":"shen", "绅":"shen", "生":"sheng", "声":"sheng", "胜":"sheng", "升":"sheng",
  "省":"sheng", "圣":"sheng", "盛":"sheng", "绳":"sheng", "剩":"sheng", "甥":"sheng", "是":"shi", "时":"shi", "十":"shi", "实":"shi", "使":"shi", "事":"shi",
  "市":"shi", "式":"shi", "识":"shi", "史":"shi", "示":"shi", "世":"shi", "始":"shi", "士":"shi", "视":"shi", "试":"shi", "师":"shi", "诗":"shi",
  "施":"shi", "湿":"shi", "失":"shi", "适":"shi", "释":"shi", "拾":"shi", "尸":"shi", "狮":"shi", "屎":"shi", "饰":"shi", "手":"shou", "受":"shou",
  "收":"shou", "首":"shou", "守":"shou", "瘦":"shou", "寿":"shou", "授":"shou", "兽":"shou", "售":"shou", "书":"shu", "数":"shu", "术":"shu", "树":"shu",
  "属":"shu", "输":"shu", "熟":"shu", "舒":"shu", "叔":"shu", "束":"shu", "述":"shu", "署":"shu", "鼠":"shu", "蔬":"shu", "淑":"shu", "枢":"shu",
  "刷":"shua", "耍":"shua", "帅":"shuai", "摔":"shuai", "甩":"shuai", "衰":"shuai", "栓":"shuan", "拴":"shuan", "双":"shuang", "爽":"shuang", "霜":"shuang", "水":"shui",
  "谁":"shui", "税":"shui", "睡":"shui", "顺":"shun", "瞬":"shun", "舜":"shun", "说":"shuo", "硕":"shuo", "朔":"shuo", "四":"si", "死":"si", "思":"si",
  "司":"si", "私":"si", "丝":"si", "寺":"si", "撕":"si", "饲":"si", "肆":"si", "嘶":"si", "送":"song", "松":"song", "宋":"song", "诵":"song",
  "颂":"song", "耸":"song", "搜":"sou", "艘":"sou", "素":"su", "苏":"su", "速":"su", "诉":"su", "俗":"su", "宿":"su", "肃":"su", "塑":"su",
  "酥":"su", "粟":"su", "算":"suan", "酸":"suan", "蒜":"suan", "岁":"sui", "随":"sui", "虽":"sui", "碎":"sui", "穗":"sui", "隧":"sui", "隋":"sui",
  "孙":"sun", "损":"sun", "笋":"sun", "所":"suo", "锁":"suo", "索":"suo", "缩":"suo", "梭":"suo", "他":"ta", "她":"ta", "它":"ta", "塔":"ta",
  "踏":"ta", "塌":"ta", "太":"tai", "台":"tai", "态":"tai", "抬":"tai", "泰":"tai", "胎":"tai", "钛":"tai", "谈":"tan", "探":"tan", "坦":"tan",
  "碳":"tan", "滩":"tan", "贪":"tan", "摊":"tan", "毯":"tan", "谭":"tan", "潭":"tan", "堂":"tang", "唐":"tang", "糖":"tang", "躺":"tang", "汤":"tang",
  "趟":"tang", "塘":"tang", "膛":"tang", "套":"tao", "涛":"tao", "逃":"tao", "陶":"tao", "桃":"tao", "讨":"tao", "滔":"tao", "掏":"tao", "特":"te",
  "疼":"teng", "腾":"teng", "藤":"teng", "题":"ti", "体":"ti", "提":"ti", "替":"ti", "踢":"ti", "梯":"ti", "剃":"ti", "啼":"ti", "天":"tian",
  "田":"tian", "甜":"tian", "填":"tian", "添":"tian", "舔":"tian", "条":"tiao", "跳":"tiao", "挑":"tiao", "铁":"tie", "贴":"tie", "帖":"tie", "听":"ting",
  "停":"ting", "挺":"ting", "厅":"ting", "庭":"ting", "亭":"ting", "婷":"ting", "霆":"ting", "艇":"ting", "通":"tong", "痛":"tong", "童":"tong", "铜":"tong",
  "筒":"tong", "统":"tong", "瞳":"tong", "桐":"tong", "头":"tou", "投":"tou", "透":"tou", "偷":"tou", "土":"tu", "图":"tu", "突":"tu", "徒":"tu",
  "兔":"tu", "吐":"tu", "途":"tu", "涂":"tu", "屠":"tu", "团":"tuan", "推":"tui", "退":"tui", "腿":"tui", "吞":"tun", "屯":"tun", "托":"tuo",
  "脱":"tuo", "拖":"tuo", "妥":"tuo", "驼":"tuo", "拓":"tuo", "瓦":"wa", "挖":"wa", "娃":"wa", "袜":"wa", "哇":"wa", "外":"wai", "歪":"wai",
  "万":"wan", "完":"wan", "晚":"wan", "玩":"wan", "湾":"wan", "丸":"wan", "碗":"wan", "腕":"wan", "弯":"wan", "婉":"wan", "顽":"wan", "王":"wang",
  "往":"wang", "望":"wang", "网":"wang", "亡":"wang", "忘":"wang", "旺":"wang", "汪":"wang", "为":"wei", "位":"wei", "委":"wei", "伟":"wei", "卫":"wei",
  "围":"wei", "未":"wei", "危":"wei", "微":"wei", "威":"wei", "维":"wei", "唯":"wei", "违":"wei", "尾":"wei", "味":"wei", "慰":"wei", "魏":"wei",
  "韦":"wei", "苇":"wei", "蔚":"wei", "喂":"wei", "问":"wen", "文":"wen", "闻":"wen", "温":"wen", "稳":"wen", "纹":"wen", "吻":"wen", "蚊":"wen",
  "翁":"weng", "我":"wo", "握":"wo", "卧":"wo", "沃":"wo", "窝":"wo", "无":"wu", "五":"wu", "物":"wu", "武":"wu", "午":"wu", "舞":"wu",
  "务":"wu", "误":"wu", "吴":"wu", "屋":"wu", "雾":"wu", "污":"wu", "悟":"wu", "伍":"wu", "捂":"wu", "西":"xi", "系":"xi", "细":"xi",
  "洗":"xi", "喜":"xi", "习":"xi", "希":"xi", "席":"xi", "息":"xi", "吸":"xi", "悉":"xi", "膝":"xi", "夕":"xi", "析":"xi", "溪":"xi",
  "熙":"xi", "锡":"xi", "下":"xia", "夏":"xia", "吓":"xia", "霞":"xia", "侠":"xia", "峡":"xia", "狭":"xia", "瞎":"xia", "先":"xian", "现":"xian",
  "线":"xian", "县":"xian", "显":"xian", "险":"xian", "限":"xian", "鲜":"xian", "献":"xian", "闲":"xian", "贤":"xian", "弦":"xian", "嫌":"xian", "衔":"xian",
  "仙":"xian", "掀":"xian", "咸":"xian", "想":"xiang", "向":"xiang", "相":"xiang", "香":"xiang", "乡":"xiang", "像":"xiang", "象":"xiang", "项":"xiang", "响":"xiang",
  "箱":"xiang", "祥":"xiang", "翔":"xiang", "详":"xiang", "湘":"xiang", "镶":"xiang", "小":"xiao", "笑":"xiao", "消":"xiao", "校":"xiao", "孝":"xiao", "萧":"xiao",
  "晓":"xiao", "肖":"xiao", "效":"xiao", "销":"xiao", "宵":"xiao", "箫":"xiao", "些":"xie", "写":"xie", "谢":"xie", "血":"xie", "斜":"xie", "鞋":"xie",
  "协":"xie", "邪":"xie", "携":"xie", "泄":"xie", "械":"xie", "卸":"xie", "蟹":"xie", "新":"xin", "心":"xin", "信":"xin", "辛":"xin", "欣":"xin",
  "薪":"xin", "芯":"xin", "鑫":"xin", "性":"xing", "形":"xing", "星":"xing", "兴":"xing", "姓":"xing", "醒":"xing", "刑":"xing", "幸":"xing", "型":"xing",
  "邢":"xing", "兄":"xiong", "雄":"xiong", "熊":"xiong", "胸":"xiong", "凶":"xiong", "匈":"xiong", "修":"xiu", "休":"xiu", "秀":"xiu", "袖":"xiu", "朽":"xiu",
  "绣":"xiu", "羞":"xiu", "需":"xu", "许":"xu", "须":"xu", "徐":"xu", "续":"xu", "序":"xu", "虚":"xu", "叙":"xu", "蓄":"xu", "绪":"xu",
  "旭":"xu", "絮":"xu", "选":"xuan", "宣":"xuan", "玄":"xuan", "悬":"xuan", "旋":"xuan", "绚":"xuan", "轩":"xuan", "喧":"xuan", "学":"xue", "雪":"xue",
  "薛":"xue", "靴":"xue", "削":"xue", "寻":"xun", "训":"xun", "讯":"xun", "迅":"xun", "询":"xun", "循":"xun", "荀":"xun", "勋":"xun", "熏":"xun",
  "呀":"ya", "压":"ya", "牙":"ya", "亚":"ya", "芽":"ya", "雅":"ya", "鸦":"ya", "鸭":"ya", "崖":"ya", "丫":"ya", "眼":"yan", "演":"yan",
  "言":"yan", "严":"yan", "研":"yan", "烟":"yan", "沿":"yan", "颜":"yan", "延":"yan", "炎":"yan", "燕":"yan", "宴":"yan", "艳":"yan", "验":"yan",
  "掩":"yan", "厌":"yan", "雁":"yan", "焰":"yan", "岩":"yan", "彦":"yan", "妍":"yan", "晏":"yan", "盐":"yan", "样":"yang", "양":"yang", "阳":"yang",
  "杨":"yang", "养":"yang", "洋":"yang", "仰":"yang", "央":"yang", "秧":"yang", "羊":"yang", "氧":"yang", "痒":"yang", "漾":"yang", "要":"yao", "药":"yao",
  "摇":"yao", "咬":"yao", "腰":"yao", "姚":"yao", "遥":"yao", "瑶":"yao", "耀":"yao", "尧":"yao", "邀":"yao", "妖":"yao", "谣":"yao", "也":"ye",
  "业":"ye", "夜":"ye", "叶":"ye", "野":"ye", "爷":"ye", "页":"ye", "液":"ye", "椰":"ye", "耶":"ye", "冶":"ye", "一":"yi", "以":"yi",
  "已":"yi", "意":"yi", "义":"yi", "议":"yi", "衣":"yi", "医":"yi", "依":"yi", "易":"yi", "益":"yi", "艺":"yi", "亿":"yi", "宜":"yi",
  "姨":"yi", "译":"yi", "异":"yi", "翼":"yi", "遗":"yi", "仪":"yi", "毅":"yi", "逸":"yi", "怡":"yi", "伊":"yi", "乙":"yi", "弈":"yi",
  "奕":"yi", "因":"yin", "音":"yin", "引":"yin", "银":"yin", "印":"yin", "阴":"yin", "隐":"yin", "饮":"yin", "殷":"yin", "尹":"yin", "吟":"yin",
  "姻":"yin", "寅":"yin", "应":"ying", "英":"ying", "影":"ying", "营":"ying", "迎":"ying", "赢":"ying", "硬":"ying", "樱":"ying", "鹰":"ying", "莹":"ying",
  "盈":"ying", "颖":"ying", "婴":"ying", "鹦":"ying", "哟":"yo", "用":"yong", "永":"yong", "勇":"yong", "拥":"yong", "涌":"yong", "庸":"yong", "咏":"yong",
  "泳":"yong", "踊":"yong", "甬":"yong", "有":"you", "又":"you", "由":"you", "右":"you", "游":"you", "优":"you", "友":"you", "油":"you", "尤":"you",
  "邮":"you", "忧":"you", "幽":"you", "悠":"you", "佑":"you", "幼":"you", "诱":"you", "柚":"you", "铀":"you", "与":"yu", "于":"yu", "语":"yu",
  "雨":"yu", "鱼":"yu", "玉":"yu", "育":"yu", "遇":"yu", "域":"yu", "余":"yu", "予":"yu", "欲":"yu", "愈":"yu", "狱":"yu", "宇":"yu",
  "羽":"yu", "御":"yu", "裕":"yu", "俞":"yu", "瑜":"yu", "昱":"yu", "虞":"yu", "渝":"yu", "郁":"yu", "元":"yuan", "原":"yuan", "员":"yuan",
  "院":"yuan", "远":"yuan", "愿":"yuan", "源":"yuan", "圆":"yuan", "缘":"yuan", "怨":"yuan", "袁":"yuan", "援":"yuan", "渊":"yuan", "苑":"yuan", "媛":"yuan",
  "月":"yue", "越":"yue", "约":"yue", "岳":"yue", "悦":"yue", "阅":"yue", "跃":"yue", "粤":"yue", "钥":"yue", "云":"yun", "运":"yun", "晕":"yun",
  "允":"yun", "韵":"yun", "孕":"yun", "匀":"yun", "芸":"yun", "耘":"yun", "杂":"za", "咋":"za", "在":"zai", "再":"zai", "载":"zai", "灾":"zai",
  "栽":"zai", "宰":"zai", "咱":"zan", "暂":"zan", "赞":"zan", "攒":"zan", "脏":"zang", "葬":"zang", "早":"zao", "造":"zao", "遭":"zao", "糟":"zao",
  "枣":"zao", "噪":"zao", "灶":"zao", "皂":"zao", "则":"ze", "责":"ze", "泽":"ze", "择":"ze", "贼":"zei", "怎":"zen", "增":"zeng", "赠":"zeng",
  "憎":"zeng", "炸":"zha", "扎":"zha", "渣":"zha", "闸":"zha", "眨":"zha", "诈":"zha", "摘":"zhai", "窄":"zhai", "债":"zhai", "宅":"zhai", "寨":"zhai",
  "站":"zhan", "战":"zhan", "占":"zhan", "展":"zhan", "沾":"zhan", "斩":"zhan", "詹":"zhan", "湛":"zhan", "张":"zhang", "章":"zhang", "涨":"zhang", "掌":"zhang",
  "丈":"zhang", "帐":"zhang", "账":"zhang", "障":"zhang", "彰":"zhang", "樟":"zhang", "找":"zhao", "照":"zhao", "招":"zhao", "赵":"zhao", "昭":"zhao", "兆":"zhao",
  "召":"zhao", "沼":"zhao", "罩":"zhao", "这":"zhe", "着":"zhe", "者":"zhe", "折":"zhe", "哲":"zhe", "浙":"zhe", "遮":"zhe", "真":"zhen", "阵":"zhen",
  "镇":"zhen", "震":"zhen", "针":"zhen", "珍":"zhen", "诊":"zhen", "振":"zhen", "甄":"zhen", "贞":"zhen", "侦":"zhen", "枕":"zhen", "正":"zheng", "政":"zheng",
  "整":"zheng", "争":"zheng", "郑":"zheng", "证":"zheng", "征":"zheng", "睁":"zheng", "挣":"zheng", "蒸":"zheng", "筝":"zheng", "铮":"zheng", "之":"zhi", "只":"zhi",
  "知":"zhi", "制":"zhi", "至":"zhi", "治":"zhi", "直":"zhi", "指":"zhi", "志":"zhi", "纸":"zhi", "质":"zhi", "致":"zhi", "植":"zhi", "职":"zhi",
  "值":"zhi", "执":"zhi", "止":"zhi", "支":"zhi", "智":"zhi", "秩":"zhi", "帜":"zhi", "芝":"zhi", "枝":"zhi", "汁":"zhi", "稚":"zhi", "址":"zhi",
  "滞":"zhi", "殖":"zhi", "中":"zhong", "种":"zhong", "众":"zhong", "终":"zhong", "钟":"zhong", "忠":"zhong", "衷":"zhong", "肿":"zhong", "仲":"zhong", "周":"zhou",
  "州":"zhou", "走":"zhou", "洲":"zhou", "轴":"zhou", "舟":"zhou", "咒":"zhou", "宙":"zhou", "皱":"zhou", "肘":"zhou", "主":"zhu", "住":"zhu", "注":"zhu",
  "助":"zhu", "竹":"zhu", "朱":"zhu", "祝":"zhu", "逐":"zhu", "筑":"zhu", "猪":"zhu", "柱":"zhu", "诸":"zhu", "驻":"zhu", "烛":"zhu", "煮":"zhu",
  "嘱":"zhu", "抓":"zhua", "转":"zhuan", "专":"zhuan", "砖":"zhuan", "赚":"zhuan", "装":"zhuang", "状":"zhuang", "庄":"zhuang", "撞":"zhuang", "壮":"zhuang", "妆":"zhuang",
  "追":"zhui", "坠":"zhui", "缀":"zhui", "准":"zhun", "桌":"zhuo", "捉":"zhuo", "卓":"zhuo", "浊":"zhuo", "酌":"zhuo", "琢":"zhuo", "子":"zi", "自":"zi",
  "字":"zi", "资":"zi", "紫":"zi", "姿":"zi", "滋":"zi", "兹":"zi", "籽":"zi", "姊":"zi", "总":"zong", "宗":"zong", "综":"zong", "纵":"zong",
  "踪":"zong", "棕":"zong", "邹":"zou", "奏":"zou", "揍":"zou", "族":"zu", "组":"zu", "祖":"zu", "足":"zu", "阻":"zu", "租":"zu", "卒":"zu",
  "钻":"zuan", "最":"zui", "嘴":"zui", "罪":"zui", "醉":"zui", "尊":"zun", "遵":"zun", "做":"zuo", "作":"zuo", "左":"zuo", "坐":"zuo", "座":"zuo",
  "昨":"zuo", "佐":"zuo", "砚":"yan", "喆":"zhe", "淼":"miao", "燊":"shen", "垚":"yao", "犇":"ben", "玥":"yue", "姸":"yan", "婳":"hua", "璟":"jing",
  "昇":"sheng", "晟":"sheng", "暐":"wei", "晞":"xi", "曦":"xi", "栎":"li", "柠":"ning", "洺":"ming", "湉":"tian", "溦":"wei", "煊":"xuan", "熠":"yi",
  "璆":"qiu", "玧":"yun", "珉":"min", "琀":"han", "瑄":"xuan", "璇":"xuan", "甯":"ning", "祎":"yi", "禛":"zhen", "筱":"xiao", "糅":"rou", "翀":"chong",
  "胤":"yin", "茗":"ming", "荞":"qiao", "蒽":"en", "蕙":"hui", "蕤":"rui", "薇":"wei", "薰":"xun", "覃":"qin", "觐":"jin", "谕":"yu", "赟":"yun",
  "逍":"xiao", "郅":"zhi", "鄢":"yan", "钊":"zhao", "钏":"chuan", "铖":"cheng", "锴":"kai", "阎":"yan", "雯":"wen", "霓":"ni", "靖":"jing", "颢":"hao",
  "飚":"biao", "馨":"xin", "骐":"qi", "骥":"ji", "鸾":"luan", "龚":"gong",

}

/** 单字转拼音；非汉字原样返回 */
function charPinyin(ch: string): string {
  const fixed = PINYIN_FIX[ch]
  if (fixed) return fixed
  return PINYIN_TABLE[ch] ?? ch
}

/** 整串转拼音：汉字逐字转，英文/数字原样保留，最后归一化 */
export function toPinyin(raw: string): string {
  const text = stripNoise(raw)
  let out = ""
  for (const ch of text) out += charPinyin(ch)
  return normalizeName(out)
}

/**
 * 拼音首字母串（林远 → ly，简南 → jn）。
 * 有些用户会按首字母命名文件夹，这是第三条兜底规则。
 */
export function toInitials(raw: string): string {
  const text = stripNoise(raw)
  let out = ""
  for (const ch of text) {
    if (/[a-z0-9]/.test(ch)) { out += ch; continue }
    const fixed = PINYIN_FIX[ch]
    const py = fixed ?? PINYIN_TABLE[ch]
    if (py) out += py[0]
  }
  return out
}

/**
 * 判断「一段路径/文件名」是否属于某个角色。命中返回命中方式，否则返回 null。
 *
 * 置信度顺序即返回顺序：
 *   zh    —— 中文原名直接命中（旧规则，最可信）
 *   py    —— 全拼折叠命中（JIAN NAN ↔ 简南）
 *   ini   —— 首字母命中（JN ↔ 简南，置信度最低，只在没有更好候选时采信）
 *   fuzzy —— 该段里「包含」角色名的拼音（林远之 vs 林远）
 */
export type MatchKind = "zh" | "py" | "ini" | "fuzzy"

/**
 * 从一段文本里切出「连续的 ASCII 单词组」，用来识别即梦文件名里的拼音人名。
 *
 * 即梦下载下来的文件名长这样：
 *   jimeng-2026-10-14-1992-34-year-old woman Jiang Nan, long face w....png
 * 里面唯一属于「角色名」的部分是 "Jiang Nan" 这两个连续单词。
 * 直接对整段做归一化必然变成超长串，拼音折叠会退化到 fuzzy（能命中但置信度低，
 * 而且描述词里如果碰巧出现相似拼写就会误伤）。
 *
 * 这个函数把连续单词切成一组一组：["jimeng","year","old","woman","jiang nan",...]，
 * 再单独拿每一组去和角色拼音比对。
 */
export function wordGroups(text: string): string[] {
  const out: string[] = []
  // 连续字母（含中间空格/连字符）算一组；数字与标点作为分隔
  const re = /[A-Za-z][A-Za-z\s\-']*[A-Za-z]|[A-Za-z]/g
  const runs = (text ?? "").match(re) ?? []
  for (const run of runs) {
    const words = run.split(/[\s\-']+/).filter(Boolean).map((w) => w.toLowerCase())
    if (words.length === 0) continue
    // 单组本身（"jiang nan" → "jiangnan"）
    out.push(words.join(""))
    // 相邻两个单词的滑窗（应对 "Yuanzheng Lu" 这类语序颠倒 / 多词名）
    for (let i = 0; i + 1 < words.length; i++) out.push(words[i] + words[i + 1])
    for (let i = 0; i + 2 < words.length; i++) out.push(words[i] + words[i + 1] + words[i + 2])
    // 每个单词单独也算（应对单名只有一个词）
    out.push(...words)
  }
  return out.filter((g) => g.length >= 2)
}

export function matchSegment(segment: string, characterName: string): MatchKind | null {
  const seg = normalizeName(segment)
  if (!seg) return null

  const name = normalizeName(characterName)
  if (!name) return null

  // 1) 中文原名直接包含（旧规则，保持不退化）
  if (seg.includes(name)) return "zh"

  const namePy = toPinyin(characterName)
  const segPy = toPinyin(segment)
  if (!namePy) return null

  // 2) 全拼相等（JIANNAN === jiannan）
  if (segPy === namePy) return "py"

  // 3) 该段是以角色名短语开头/结尾的（林远-定妆 已由 zh 覆盖，这里管 JIANNAN-stand）
  if (segPy.startsWith(namePy) || segPy.endsWith(namePy)) return "py"

  // 4) 首字母（JN / LY），要求两字及以上，单字首字母误伤太大
  const nameIni = toInitials(characterName)
  if (nameIni.length >= 2 && stripNoise(segment) === nameIni) return "ini"

  // 5) 英文单词组比对：即梦文件名里的拼音人名是空格分隔的（Jiang Nan）
  //    归一化整段会因为混入年份/描述而失配，所以按单词组逐个比。
  //    完全相等记为 py（这是真正的拼音命中），仅包含记为 fuzzy。
  const groups = wordGroups(segment)
  for (const g of groups) {
    if (g === namePy) return "py"
  }

  // 6) 包含关系（「林远之」里含「林远」，或长描述句里含拼音名），置信度最低
  for (const g of groups) {
    if (g.includes(namePy) || segPy.includes(namePy)) return "fuzzy"
  }

  return null
}

/** 取文件 key 里有信息的那几段：目录各段 + 文件名（去扩展名） */
function segmentsOf(key: string): string[] {
  const parts = key.split("/").filter(Boolean)
  const fileName = (parts.pop() ?? "").replace(/\.[^.]+$/, "")
  const dirs = parts
  return fileName ? [...dirs, fileName] : dirs
}

/** 拼音映射表（构建期生成，见 scripts/gen-pinyin-table.cjs） */
export const PINYIN_COVERAGE = { chars: Object.keys(PINYIN_TABLE).length }

/**
 * 按「目录名 / 文件名匹配角色名」把图分给角色。返回带置信度的明细。
 *
 * 抽成纯函数是为了可测：这条规则看起来简单，边界却不少
 * （角色名互相包含、目录带后缀、平铺文件、嵌套目录、拼音命名）。
 * 自动挂错比不挂更糟——用户会以为已经垫好图了。
 *
 * 匹配顺序（逐段尝试，取置信度最高的一段）：
 *   1. 中文原名直接包含（旧规则，最可信）
 *   2. 全拼折叠（JIAN NAN / jiannan / jian_nan → 简南）
 *   3. 首字母（JN → 简南，仅两字以上且长度完全一致时采信）
 *   4. 拼音包含（林远之 里含 林远，置信度最低）
 *
 * 为什么不再「只认第一段目录名」：即梦下载下来是
 * 「JIAN NAN/简南_定妆照.png」，光看第一段是拼音，光看文件名才有中文，
 * 必须两段都试。风险是误挂，所以每一段都带置信度，界面可以据此标注。
 *
 * 仍不做的：纯数字 / 时间戳命名（即梦_19700101.png、1/ 2/）算法无从下手，
 * 交给 /api/asset-match 的 AI 兜底，且必须由用户显式触发。
 */
export interface MatchHit {
  key: string
  /** 命中的是哪一段（目录名或去扩展名的文件名） */
  segment: string
  kind: MatchKind
}

/** 置信度排序：数字越小越可信 */
const KIND_RANK: Record<MatchKind, number> = { zh: 0, py: 1, ini: 2, fuzzy: 3 }

/**
 * 判断一张图归属于哪个角色。返回 null 表示没有证据。
 *
 * 同一张图可能同时命中多个角色（比如「林远之」同时包含「林远」与「林远之」），
 * 取置信度最高的那个；完全相同则按传入顺序取第一个，保证结果稳定可复现。
 */
export function matchFileToCharacter(file: VaultFile, names: string[]): MatchHit | null {
  const segs = segmentsOf(file.key)
  let best: MatchHit | null = null

  for (const seg of segs) {
    for (const name of names) {
      if (!name) continue
      const kind = matchSegment(seg, name)
      if (!kind) continue
      const hit: MatchHit = { key: file.key, segment: seg, kind }
      if (!best || KIND_RANK[kind] < KIND_RANK[best.kind]) best = hit
    }
  }
  return best
}

/**
 * 批量匹配：角色名 -> 文件 key 列表。
 *
 * 返回形状保持不变（Record<string, string[]>），因为调用方与既有测试都依赖它；
 * 需要置信度明细时用 matchByFolderDetailed。
 */
export function matchByFolder(
  files: VaultFile[],
  names: string[],
): Record<string, string[]> {
  const detailed = matchByFolderDetailed(files, names)
  const out: Record<string, string[]> = {}
  for (const [name, hits] of Object.entries(detailed)) out[name] = hits.map((h) => h.key)
  return out
}

/**
 * 带明细的批量匹配。出于「挂错比不挂更糟」，这里对模糊命中做了节制：
 * 只有 fuzzy（拼音包含）命中的角色，若它同一张图也被更可信的规则命中过，就丢弃。
 */
export function matchByFolderDetailed(
  files: VaultFile[],
  names: string[],
): Record<string, MatchHit[]> {
  const perFile = new Map<string, { name: string; hit: MatchHit }>()

  // 一张图只归一个角色：先选出全局最优，再按角色聚合
  for (const file of files) {
    let bestName: string | null = null
    let best: MatchHit | null = null
    for (const name of names) {
      if (!name) continue
      const hit = matchFileToCharacter(file, [name])
      if (!hit) continue
      if (!best || KIND_RANK[hit.kind] < KIND_RANK[best.kind]) { best = hit; bestName = name }
    }
    if (best && bestName) perFile.set(file.key, { name: bestName, hit: best })
  }

  const out: Record<string, MatchHit[]> = {}
  for (const file of files) {
    const entry = perFile.get(file.key)
    if (!entry) continue
    const bucket = out[entry.name] ?? (out[entry.name] = [])
    bucket.push(entry.hit)
  }

  // 保证同一角色内的顺序稳定：按 key 排序，避免「同一次扫描两次结果不同」
  for (const key of Object.keys(out)) out[key].sort((a, b) => a.key.localeCompare(b.key))
  return out
}

/** 简单的中文说明，用于界面上标注「为什么这张图被挂上了」 */
export function describeMatchKind(kind: MatchKind): string {
  if (kind === "zh") return "中文名"
  if (kind === "py") return "拼音"
  if (kind === "ini") return "首字母"
  return "相近"
}

/**
 * 扫描后给一句话汇总：让用户看得见「自动挂了几张、靠什么规则、谁没命中」。
 * 静默失败是之前最大的问题——用户以为挂好了，其实一张都没有。
 */
export interface AttachSummary {
  matchedCharacters: number
  matchedFiles: number
  byKind: Record<MatchKind, number>
  /** 一张图都没挂上的角色名 */
  unmatched: string[]
}

export function summarizeAttach(
  files: VaultFile[],
  names: string[],
  matched: Record<string, MatchHit[]>,
): AttachSummary {
  const byKind: Record<MatchKind, number> = { zh: 0, py: 0, ini: 0, fuzzy: 0 }
  let matchedFiles = 0
  for (const hits of Object.values(matched)) {
    for (const hit of hits) { byKind[hit.kind] += 1; matchedFiles += 1 }
  }
  return {
    matchedCharacters: Object.keys(matched).length,
    matchedFiles,
    byKind,
    unmatched: names.filter((n) => n && !(n in matched)),
  }
}

/**
 * 这张图是不是「算法看不出归属」的无信息命名——AI 兜底按钮据此提示。
 *
 * 判断的是「有没有可用来认人的文字」，而不是「有没有文字」：
 *   即梦_19700101.png  → 只剩「即梦」，是厂商前缀，认不出人 → true
 *   1/2.png            → 只剩「12」，纯数字     → true
 *   简南/正面.png       → 有「简南」            → false
 *   jimeng-...-Jiang Nan, long face.png → 有「Jiang Nan」→ false
 *
 * 注意不能简单地把「数字全部删掉后判空」：那样 "1/2.png" 会残留 "12" 而误判为
 * 有信息。正确做法是要求剩下的必须是「非数字的字母或汉字」。
 */
export function looksUninformative(file: VaultFile): boolean {
  const segs = segmentsOf(file.key)
  return segs.every((seg) => {
    const clean = stripNoise(seg)               // 先去用途词/厂商前缀
    const letters = clean.replace(/[0-9]/g, "") // 再看有没有字母或汉字
    return letters.length < 2                   // 只剩 0-1 个字符，认不出人
  })
}

/**
 * 走 fs-access 路径时，通过相对路径在已授权目录里找文件。
 * key 形如 "林远/正面.png"，逐级下钻文件名。
 */
async function findFileByKey(key: string): Promise<File | null> {
  const root = await loadDirectoryHandle()
  if (!root) return null

  const parts = key.split("/").filter(Boolean)
  const fileName = parts.pop()
  if (!fileName) return null

  let dir: FileSystemDirectoryHandle = root
  try {
    for (const seg of parts) dir = await dir.getDirectoryHandle(seg)
    const fileHandle = await dir.getFileHandle(fileName)
    return await fileHandle.getFile()
  } catch {
    // 目录被搬走 / 文件被删 / 改名，都会走到这里
    return null
  }
}

/**
 * 取回可渲染的 blob URL（本地预览，零上传）。
 *
 * 两条路径都要覆盖：
 *   - indexeddb：直接从库里取 Blob
 *   - fs-access：通过相对路径在用户授权的目录里找文件
 * 之前只实现了前者，导致目录直连模式下拿不到预览——
 * 而目录直连才是 Chrome/Edge 下的主路径。
 *
 * 注意：blob URL 需要调用方在不用时 revokeObjectURL，否则会一直占内存。
 */
export async function getPreviewUrl(key: string): Promise<string | null> {
  const fromIdb = await idbGet<Blob>(STORE, key)
  if (fromIdb) return URL.createObjectURL(fromIdb)

  const file = await findFileByKey(key)
  return file ? URL.createObjectURL(file) : null
}

/** 判断某个 key 现在还能不能取到图（用于「图丢了」提示） */
export async function vaultFileExists(key: string): Promise<boolean> {
  const fromIdb = await idbGet<Blob>(STORE, key)
  if (fromIdb) return true
  return (await findFileByKey(key)) !== null
}
