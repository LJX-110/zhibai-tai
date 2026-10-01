/**
 * 系统 · **桌宠**（Step 5-2 单开一组）
 *
 * 用户明确要求：桌宠的设置不要混在其它组里。
 * 它是**本应用的一个角色**，有自己的一套取舍（开关 / 尺寸 / 漫游），
 * 而且这些全是**设备级偏好**（不进同步白名单）—— 与"外观"共享一个组会让人以为
 * "改主题会顺带改桌宠"，也让"我只想调宠物"变成一次寻宝。
 *
 * 位置（桌宠在哪）**不在这里**：那是它的运行时状态，改由拖动决定、存在本机。
 */
import { Section } from '../../components/ui'
import { PetGroup } from './PetGroup'

export function PetSettingsGroup() {
  return (
    <Section title="桌宠">
      <PetGroup />
    </Section>
  )
}
