import { databases, DATABASE_ID } from './appwrite'
import { AppSettings, DEFAULT_SETTINGS } from '@/types'

const COLLECTION = 'settings'
const DOC_ID = 'global'

export async function getSettings(): Promise<AppSettings> {
  try {
    const doc = await databases.getDocument(DATABASE_ID, COLLECTION, DOC_ID)
    return {
      initial_capital:      doc.initial_capital      ?? DEFAULT_SETTINGS.initial_capital,
      roi_target:           doc.roi_target            ?? DEFAULT_SETTINGS.roi_target,
      obj1_label:           doc.obj1_label            ?? DEFAULT_SETTINGS.obj1_label,
      obj1_target:          doc.obj1_target           ?? DEFAULT_SETTINGS.obj1_target,
      obj2_label:           doc.obj2_label            ?? DEFAULT_SETTINGS.obj2_label,
      obj2_target:          doc.obj2_target           ?? DEFAULT_SETTINGS.obj2_target,
      obj3_label:           doc.obj3_label            ?? DEFAULT_SETTINGS.obj3_label,
      obj3_target:          doc.obj3_target           ?? DEFAULT_SETTINGS.obj3_target,
      default_vinted_fees:  doc.default_vinted_fees   ?? DEFAULT_SETTINGS.default_vinted_fees,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export async function saveSettings(s: AppSettings): Promise<void> {
  try {
    await databases.updateDocument(DATABASE_ID, COLLECTION, DOC_ID, s)
  } catch {
    await databases.createDocument(DATABASE_ID, COLLECTION, DOC_ID, s)
  }
}
