/**
 * MiniMax 按量计费口径：汉字计 2 个字符，标点、空格和换行各计 1 个字符。
 * 这个函数同时用于服务端预算校验和前端预估，避免两处口径漂移。
 */
export function countSpeechCharacters(text: string): number {
  let count = 0
  for (const character of Array.from(text)) {
    count += /\p{Script=Han}/u.test(character) ? 2 : 1
  }
  return count
}
