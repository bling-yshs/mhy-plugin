export interface GenshinCharacterDetailResponse {
  retcode: number
  message: string
  data: GenshinCharacterDetailData
}

export interface GenshinCharacterDetailData {
  list: GenshinCharacterDetail[]
  property_map: Record<string, GenshinPropertyMap>
  relic_property_options: GenshinRelicPropertyOptions
  relic_wiki: Record<string, string>
  weapon_wiki: Record<string, string>
  avatar_wiki: Record<string, string>
}

export interface GenshinCharacterDetail {
  base: GenshinCharacterBase
  weapon: GenshinCharacterWeapon
  relics: GenshinRelic[]
  constellations: GenshinConstellation[]
  costumes: GenshinCostume[]
  selected_properties: GenshinProperty[]
  base_properties: GenshinProperty[]
  extra_properties: GenshinProperty[]
  element_properties: GenshinProperty[]
  skills: GenshinSkill[]
  recommend_relic_property: GenshinRecommendRelicProperty
  weapon_skin: GenshinWeaponSkin | null
  unlock_tps: boolean
}

export interface GenshinCharacterBase {
  id: number
  icon: string
  name: string
  element: GenshinElement
  fetter: number
  level: number
  rarity: number
  actived_constellation_num: number
  image: string
  is_chosen: boolean
  side_icon: string
  weapon_type: number
  weapon: GenshinBaseWeapon
}

export type GenshinElement = 'Cryo' | 'Pyro' | 'Geo' | 'Hydro' | 'Electro' | 'Anemo' | 'Dendro'

export interface GenshinBaseWeapon {
  id: number
  icon: string
  type: number
  rarity: number
  level: number
  affix_level: number
  name: string
}

export interface GenshinProperty {
  property_type: number
  base: string
  add: string
  final: string
}

export interface GenshinConstellation {
  id: number
  name: string
  icon: string
  effect: string
  is_actived: boolean
  pos: number
  is_enhanced: boolean
  enhanced_effect: string
  can_enhanced: boolean
}

export interface GenshinCostume {
  id: number
  name: string
  icon: string
}

export interface GenshinRecommendRelicProperty {
  recommend_properties: GenshinRelicPropertyOptions
  custom_properties: null
  has_set_recommend_prop: boolean
}

export interface GenshinRelicPropertyOptions {
  sand_main_property_list: number[]
  goblet_main_property_list: number[]
  circlet_main_property_list: number[]
  sub_property_list: number[]
}

export interface GenshinRelic {
  id: number
  name: string
  icon: string
  pos: number
  rarity: number
  level: number
  set: GenshinRelicSet
  pos_name: GenshinRelicPositionName
  main_property: GenshinRelicProperty
  sub_property_list: GenshinRelicProperty[]
}

export interface GenshinRelicProperty {
  property_type: number
  value: string
  times: number
}

export type GenshinRelicPositionName = '生之花' | '死之羽' | '时之沙' | '空之杯' | '理之冠'

export interface GenshinRelicSet {
  id: number
  name: string
  affixes: GenshinRelicSetAffix[]
}

export interface GenshinRelicSetAffix {
  activation_number: number
  effect: string
}

export interface GenshinSkill {
  skill_id: number
  skill_type: number
  level: number
  desc: string
  skill_affix_list: GenshinSkillAffix[]
  icon: string
  is_unlock: boolean
  name: string
  is_enhanced: boolean
  enhanced_desc: string
  before_enhanced_skill_attr_index: number[]
  after_enhanced_skill_attr_index: number[]
  can_enhanced: boolean
}

export interface GenshinSkillAffix {
  name: string
  value: string
}

export interface GenshinCharacterWeapon {
  id: number
  name: string
  icon: string
  type: number
  rarity: number
  level: number
  promote_level: number
  type_name: GenshinWeaponTypeName
  desc: string
  affix_level: number
  main_property: GenshinProperty
  sub_property: GenshinProperty | null
}

export type GenshinWeaponTypeName = '单手剑' | '双手剑' | '法器' | '弓' | '长柄武器'

export interface GenshinWeaponSkin {
  weapon_skin_icon: string
  weapon_skin_rarity: number
  weapon_skin_name: string
}

export interface GenshinPropertyMap {
  property_type: number
  name: string
  icon: string
  filter_name: string
}
