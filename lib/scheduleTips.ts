import * as Notifications from 'expo-notifications'
import { getTipsForLanguage } from './tips'
import i18n from 'i18next'

const NOTIF_IDENTIFIER_PREFIX = 'salon_tip_'
const SCHEDULE_KEY = 'tips_scheduled_until'
const DAYS_AHEAD = 7

// 09:00, 13:00, 18:00
const HOURS = [9, 13, 18]

async function cancelExistingTips() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync()
  for (const n of scheduled) {
    if (n.identifier.startsWith(NOTIF_IDENTIFIER_PREFIX)) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier)
    }
  }
}

function tipIndexForDayAndSlot(dayOfYear: number, slotIndex: number, totalTips: number): number {
  return (dayOfYear * HOURS.length + slotIndex) % totalTips
}

function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0)
  const diff = date.getTime() - start.getTime()
  return Math.floor(diff / 86400000)
}

export async function scheduleTips() {
  try {
    const { status } = await Notifications.getPermissionsAsync()
    if (status !== 'granted') return

    await cancelExistingTips()

    const lang = i18n.language ?? 'tr'
    const tips = getTipsForLanguage(lang)
    const now = new Date()

    for (let dayOffset = 0; dayOffset < DAYS_AHEAD; dayOffset++) {
      const targetDate = new Date(now)
      targetDate.setDate(now.getDate() + dayOffset)
      const doy = dayOfYear(targetDate)

      for (let slotIdx = 0; slotIdx < HOURS.length; slotIdx++) {
        const hour = HOURS[slotIdx]
        const fireTime = new Date(targetDate)
        fireTime.setHours(hour, 0, 0, 0)

        // Skip times already in the past
        if (fireTime <= now) continue

        const tip = tips[tipIndexForDayAndSlot(doy, slotIdx, tips.length)]

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
      }
    }
  } catch {
    // Notification scheduling is non-critical
  }
}
