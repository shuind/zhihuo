export function formatRelativeTime(date: Date | string): string {
  const now = new Date()
  const target = new Date(date)
  const diffMs = now.getTime() - target.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSeconds < 60) {
    return '刚刚'
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} 分钟前`
  }
  if (diffHours < 24) {
    return `${diffHours} 小时前`
  }
  if (diffDays === 1) {
    return '昨天'
  }
  if (diffDays < 7) {
    return `${diffDays} 天前`
  }
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7)
    return `${weeks} 周前`
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30)
    return `${months} 个月前`
  }
  const years = Math.floor(diffDays / 365)
  return `${years} 年前`
}

export function formatAbsoluteTime(date: Date | string): string {
  const target = new Date(date)
  const now = new Date()
  const isThisYear = target.getFullYear() === now.getFullYear()
  
  const month = target.getMonth() + 1
  const day = target.getDate()
  const hour = target.getHours()
  
  const timeOfDay = hour < 6 ? '凌晨' : hour < 12 ? '上午' : hour < 18 ? '下午' : '晚上'
  const displayHour = hour % 12 || 12
  
  if (isThisYear) {
    return `${month}月${day}日 ${timeOfDay}${displayHour}点`
  }
  return `${target.getFullYear()}年${month}月${day}日 ${timeOfDay}${displayHour}点`
}

export function formatFullDate(date: Date | string): string {
  const target = new Date(date)
  const now = new Date()
  const isThisYear = target.getFullYear() === now.getFullYear()
  
  const month = target.getMonth() + 1
  const day = target.getDate()
  const hour = target.getHours().toString().padStart(2, '0')
  const minute = target.getMinutes().toString().padStart(2, '0')
  
  if (isThisYear) {
    return `${month}月${day}日 ${hour}:${minute}`
  }
  return `${target.getFullYear()}年${month}月${day}日 ${hour}:${minute}`
}
