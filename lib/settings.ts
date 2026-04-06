import { supabase } from './supabase'
import { AppSettings, DEFAULT_SETTINGS } from '@/types'

const DOC_ID = 'global'

export async function getSettings(): Promise<AppSettings> {
  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .eq('id', DOC_ID)
    .single()

  if (error || !data) return DEFAULT_SETTINGS

  return {
    initial_capital:     data.initial_capital     ?? DEFAULT_SETTINGS.initial_capital,
    roi_target:          data.roi_target           ?? DEFAULT_SETTINGS.roi_target,
    obj1_label:          data.obj1_label           ?? DEFAULT_SETTINGS.obj1_label,
    obj1_target:         data.obj1_target          ?? DEFAULT_SETTINGS.obj1_target,
    obj2_label:          data.obj2_label           ?? DEFAULT_SETTINGS.obj2_label,
    obj2_target:         data.obj2_target          ?? DEFAULT_SETTINGS.obj2_target,
    obj3_label:          data.obj3_label           ?? DEFAULT_SETTINGS.obj3_label,
    obj3_target:         data.obj3_target          ?? DEFAULT_SETTINGS.obj3_target,
    default_vinted_fees: data.default_vinted_fees  ?? DEFAULT_SETTINGS.default_vinted_fees,
    romain_owed_pokemon: data.romain_owed_pokemon  ?? DEFAULT_SETTINGS.romain_owed_pokemon,
    celian_owed_pokemon: data.celian_owed_pokemon  ?? DEFAULT_SETTINGS.celian_owed_pokemon,
  }
}

export async function saveSettings(s: AppSettings): Promise<void> {
  const { error } = await supabase
    .from('settings')
    .upsert({
      id:                  DOC_ID,
      initial_capital:     Number(s.initial_capital),
      roi_target:          Number(s.roi_target),
      obj1_label:          s.obj1_label,
      obj1_target:         Number(s.obj1_target),
      obj2_label:          s.obj2_label,
      obj2_target:         Number(s.obj2_target),
      obj3_label:          s.obj3_label,
      obj3_target:         Number(s.obj3_target),
      default_vinted_fees: Number(s.default_vinted_fees),
      romain_owed_pokemon: Number(s.romain_owed_pokemon),
      celian_owed_pokemon: Number(s.celian_owed_pokemon),
    })
  if (error) throw new Error(`saveSettings: ${error.message}`)
}

export async function saveOwed(
  romainKey: string, romainValue: number,
  celianKey: string,  celianValue: number,
): Promise<void> {
  const { error } = await supabase
    .from('settings')
    .update({ [romainKey]: Number(romainValue), [celianKey]: Number(celianValue) })
    .eq('id', DOC_ID)
  if (error) throw new Error(`saveOwed: ${error.message}`)
}
