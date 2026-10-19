// 示例项目：第一次打开时能一键载入一整套六步产物。
//
// 为什么要它：空工作台就是"这个工具还没人用过"——用户得先相信它能产出东西，
// 才愿意掏自己的故事。示例数据还能顺手把六步之间的对应关系演一遍
// （镜头属于哪一集、参考图挂在哪个角色、提示词里的锚点长什么样）。
//
// 纪律：这里的锚点串必须与镜头提示词里嵌的**逐字一致**，
// 否则载入示例后「缺参考图 / 掉锚点」会立刻报错——示例反而变成反例。
import type { Act, Character, Episode } from './types'
import type { Scene, Shot, VisualCharacter, VisualPlace } from './assets/types'

export const SAMPLE_TITLE = '示例 · 快递员的最后一单'
export const SAMPLE_IDEA = '一个快递员意外继承了百万遗产，条件却是替原主人完成七桩未竟的交易'
export const SAMPLE_GENRE = 'suspense'

const CHEN = 'CHEN MO: 29 years old, Chinese man, long narrow face, short black hair, small scar on the left brow tip, worn dark blue delivery jacket'
const SU = 'SU WAN: 68 years old, Chinese woman, soft round face, silver hair in a low bun, grey wool cardigan'
const SHEN = 'SHEN ZHIYAO: 41 years old, Chinese man, square jaw, short greying hair, dark grey suit'
const VILLA = 'VILLA EXTERIOR: 1990s two-story European-style house, peeling white walls, iron gate, wet stone path, dim warm window light at night'
const SU_HOME = 'OLD APARTMENT GATEWAY: 1980s workers housing, peeling green paint on the stairwell, narrow doorway, single bare bulb'

export const SAMPLE_CHARACTERS: Character[] = [
  {
    id: 'sc-1',
    name: '陈默',
    identity: '快递员，29 岁，独居于城中村',
    personality: '沉默、认死理，习惯把话咽回去',
    motivation: '想证明自己不是「送完就走」的人',
    arc: '从被动接单到主动选择放弃',
  },
  {
    id: 'sc-2',
    name: '苏婉',
    identity: '沈伯年轻时的婚约对象，68 岁，独居',
    personality: '体面、克制，话里带刺',
    motivation: '想听一句道歉，但绝不开口要',
    arc: '从拒绝见面到亲手烧掉那封信',
  },
  {
    id: 'sc-3',
    name: '沈之遥',
    identity: '沈伯的亲生儿子，41 岁，外地做生意',
    personality: '精明、急躁，最怕被人提起父亲',
    motivation: '想拿回遗产，却不肯认这笔账',
    arc: '从只想拿钱到承认自己一直在等父亲先低头',
  },
]

export const SAMPLE_ACTS: Act[] = [
  {
    id: 'sa-1',
    key: 'setup',
    title: '第一幕 · 铺垫',
    summary: '陈默送了六年快递，余额从没超过四千。暴雨夜他把包裹送到城郊空置别墅，收件人却是三天前去世的独居老人。',
    beats: ['被要求签收一份不属于他的文件', '律师上门：他是遗产唯一继承人'],
  },
  {
    id: 'sa-2',
    key: 'conflict',
    title: '第二幕 · 冲突',
    summary: '继承有条件：三十天内替老人完成清单上的七桩交易，每完成一桩才能解锁下一桩的地址。',
    beats: ['第一桩牵出老人年轻时的婚约', '两桩交易指向老人的亲生儿子'],
  },
  {
    id: 'sa-3',
    key: 'resolution',
    title: '第三幕 · 结局',
    summary: '最后一桩交易是把遗产全部转给那个从未露面的儿子。陈默签字前发现，老人真正想交出去的是一句迟到四十年的道歉。',
    beats: ['他放弃继承，只留下那辆旧电动车'],
  },
]

export const SAMPLE_EPISODES: Episode[] = [
  {
    id: 'se-1',
    number: 1,
    title: '暴雨夜的签收',
    synopsis: '陈默冒雨把最后一件包裹送到城郊别墅，收件人却是三天前去世的独居老人。他放下包裹转身时，被一个陌生男人叫住，要求当场签收一份文件。',
    hook: '签完字他才发现，最后一页写的是「遗嘱执行确认书」，继承人一栏是他的名字。',
  },
  {
    id: 'se-2',
    number: 2,
    title: '三十天与七桩交易',
    synopsis: '律师宣读条件：三十天内完成七桩交易，每完成一桩才能拿到下一桩的地址。陈默以为这是骗局，直到第一笔钱打进账户。',
    hook: '清单第一项只有一行字：「替我向一个叫苏婉的人道歉。」',
  },
  {
    id: 'se-3',
    number: 3,
    title: '不肯开门的人',
    synopsis: '陈默找到苏婉住的旧楼，敲了半小时门。门开了一条缝，老人只看了一眼他手里的信就关上了。',
    hook: '门缝里掉出一张泛黄的车票——日期是四十年前的今天。',
  },
]

export const SAMPLE_VISUALS: VisualCharacter[] = [
  {
    id: 'sv-1',
    name: '陈默',
    age: '29 岁',
    face: '偏长脸、窄眼、下颌线硬',
    hair: '黑色短发、略乱',
    marks: '左眉尾一道浅疤',
    wardrobe: '洗旧的深蓝快递外套、内搭灰 T',
    props: '旧电动车钥匙、磨白的帆布单肩包',
    anchor: CHEN,
  },
  {
    id: 'sv-2',
    name: '苏婉',
    age: '68 岁',
    face: '圆脸、眼下细纹、眼神克制',
    hair: '银灰长发、低盘髻',
    marks: '右手无名指有旧戒痕',
    wardrobe: '灰色羊毛开衫、深色长裤',
    props: '老式铁皮饼干盒（装着那封信）',
    anchor: SU,
  },
  {
    id: 'sv-3',
    name: '沈之遥',
    age: '41 岁',
    face: '方下颌、眉毛浓、嘴角向下',
    hair: '短寸、鬓角发白',
    marks: '左手戴一块旧表',
    wardrobe: '深灰西装、不系领带',
    props: '一只被反复折叠的牛皮纸信封',
    anchor: SHEN,
  },
]

export const SAMPLE_PLACES: VisualPlace[] = [
  {
    id: 'sp-1',
    name: '城郊别墅·门外',
    space: '1990 年代两层欧式小楼，外墙白漆剥落，铁艺大门，湿石阶',
    props: '门口堆着未拆的快递纸箱、一盏生锈的门灯',
    lighting: '夜雨，二楼只有一扇窗亮着暖光，地面有反光',
    grade: '冷蓝夜色打底，窗口一处暖橙',
    anchor: VILLA,
  },
  {
    id: 'sp-2',
    name: '苏婉家·旧楼门口',
    space: '1980 年代工人宿舍楼，窄门洞，水磨石台阶',
    props: '门上一张褪色的福字、楼梯间的白炽灯',
    lighting: '黄昏，楼梯间只有一颗裸灯泡，门缝透出室内微光',
    grade: '暖灰偏绿的旧楼道，门内更暗',
    anchor: SU_HOME,
  },
]

export const SAMPLE_SCENES: Scene[] = [
  {
    id: 'ss-1',
    number: 1,
    episode: 1,
    location: '城郊别墅·门外',
    timeOfDay: '暴雨夜',
    summary: '陈默把包裹送到空置别墅，被陌生男人要求签收文件',
    characters: ['陈默'],
  },
  {
    id: 'ss-2',
    number: 2,
    episode: 2,
    location: '律师事务所',
    timeOfDay: '日',
    summary: '律师宣读继承条件，陈默拿到第一桩交易',
    characters: ['陈默', '沈之遥'],
  },
  {
    id: 'ss-3',
    number: 3,
    episode: 3,
    location: '苏婉家·旧楼门口',
    timeOfDay: '黄昏',
    summary: '苏婉开门又关门，门缝掉出一张四十年前的车票',
    characters: ['陈默', '苏婉'],
  },
]

export const SAMPLE_SHOTS: Shot[] = [
  {
    id: 'st-1',
    entityId: 'ste-1',
    shot: 1,
    episode: 1,
    scene: '城郊别墅·门外',
    characters: ['陈默'],
    action: '陈默撑伞站在铁门外，雨水顺着伞骨成串落下，他抬头看向二楼唯一亮灯的窗',
    shotSize: '中景',
    camera: '固定',
    speaker: '',
    dialogue: '',
    prompt: `medium shot, ${CHEN}, standing outside an iron gate in heavy rain, holding a black umbrella, rain streaks catching the light, he looks up toward the only lit window on the second floor, ${VILLA}, cold blue night tones with a single warm window glow, cinematic, vertical 9:16, photorealistic, 35mm lens`,
    place: '城郊别墅·门外',
    refImages: ['陈默·正面'],
    missingRefFor: [],
    params: { ratio: '9:16', duration: 5, lastFrame: true },
    status: 'done',
  },
  {
    id: 'st-2',
    entityId: 'ste-2',
    shot: 2,
    episode: 1,
    scene: '城郊别墅·门外',
    characters: ['陈默'],
    action: '一只手从门内伸出，把一份文件递到他面前；他没有接',
    shotSize: '近景',
    camera: '推',
    speaker: '陌生男人',
    dialogue: '签一下，就一页。',
    prompt: `close shot, a hand reaching out from behind the iron gate holding a paper document, ${CHEN}, he does not take it, rain on the paper, ${VILLA}, cold blue night tones, cinematic, vertical 9:16, photorealistic`,
    place: '城郊别墅·门外',
    refImages: ['陈默·正面'],
    missingRefFor: [],
    params: { ratio: '9:16', duration: 6, lastFrame: false },
    status: 'todo',
  },
  {
    id: 'st-3',
    entityId: 'ste-3',
    shot: 3,
    episode: 3,
    scene: '苏婉家·旧楼门口',
    characters: ['陈默', '苏婉'],
    action: '门开了一条缝，苏婉只看了一眼他手里的信就关上；门缝里掉出一张泛黄车票',
    shotSize: '双人中景',
    camera: '固定',
    speaker: '苏婉',
    dialogue: '这东西，我不认。',
    prompt: `two-shot, a door opened a narrow gap, ${SU}, she glances at the envelope in his hand and closes the door, ${CHEN}, a yellowed train ticket slips out through the gap, ${SU_HOME}, restrained tension, cinematic, vertical 9:16, photorealistic`,
    place: '苏婉家·旧楼门口',
    refImages: ['陈默·正面'],
    missingRefFor: ['苏婉'],
    params: { ratio: '9:16', duration: 7, lastFrame: false },
    status: 'rework',
  },
]
