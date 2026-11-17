/***
 * 将秒级 Unix 时间戳按本机时区格式化为年月日时分秒。
 * @param seconds 秒级 Unix 时间戳。
 * @returns YYYY-MM-DD HH:mm:ss 格式的时间文本。
 * @throws 不主动抛出异常。
 */
export function formatTime(seconds: number): string {
  const date = new Date(seconds * 1000)
  const twoDigits = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())} ${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}:${twoDigits(date.getSeconds())}`
}
