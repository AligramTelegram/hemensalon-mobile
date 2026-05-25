import * as Notifications from 'expo-notifications'
import { getTipsForLanguage } from './tips'
import i18n from 'i18next'

const NOTIF_IDENTIFIER_PREFIX = 'salon_tip_'
const SCHEDULE_KEY = 'tips_scheduled_until'
const DAYS_AHEAD = 7

const DAILY_SLOTS = [10, 15]  // 10:00 ve 15:00
const MAX_NOTIFS = 50         // iOS limiti 64, güvenli kalıyoruz

async function cancelExistingTips() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync()
  for (const n of scheduled) {
    if (n.identifier.startsWith(NOTIF_IDENTIFIER_PREFIX)) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier)
    }
  }
}

function seededRandom(seed: number): number {
  const x = Math.sin(seed + 1) * 10000
  return x - Math.floor(x)
}

function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0)
  return Math.floor((date.getTime() - start.getTime()) / 86400000)
}

export async function scheduleTips() {
  try {
    const { status } = await Notifications.getPermissionsAsync()
    if (status !== 'granted') return

    await cancelExistingTips()

    const lang = i18n.language ?? 'tr'
    const tips = getTipsForLanguage(lang)
    const now = new Date()
    let notifCount = 0

    outer: for (let dayOffset = 0; dayOffset < DAYS_AHEAD; dayOffset++) {
      const targetDate = new Date(now)
      targetDate.setDate(now.getDate() + dayOffset)
      const doy = dayOfYear(targetDate)

      for (let slotIdx = 0; slotIdx < DAILY_SLOTS.length; slotIdx++) {
        const hour = DAILY_SLOTS[slotIdx]
        const seed = doy * 10 + slotIdx
        const minute = Math.floor(seededRandom(seed) * 60)

        const fireTime = new Date(targetDate)
        fireTime.setHours(hour, minute, 0, 0)

        if (fireTime <= now) continue

        const tipIdx = (seed * 7 + 3) % tips.length
        const tip = tips[tipIdx]

        if (notifCount >= MAX_NOTIFS) break outer
        await Notifications.scheduleNotificationAsync({
          identifier: `${NOTIF_IDENTIFIER_PREFIX}${doy}_${slotIdx}`,
          content: {
            title: tip.title,
            body: tip.body,
            sound: false,
            data: { type: 'salon_tip' },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: fireTime,
          },
        })
        notifCount++
      }
    }
  } catch {
    // Notification scheduling is non-critical
  }
}
