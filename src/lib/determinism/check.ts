import { DETERMINISM_RULES } from './rules'

export interface Violation {
  ruleId: string
  message: string
  line: number
  snippet: string
}

/** 静态扫描 shot 代码字符串，返回确定性违规列表（空数组 = 通过）。 */
export function checkDeterminism(code: string): Violation[] {
  const violations: Violation[] = []
  const lines = code.split(/\r?\n/)
  lines.forEach((text, index) => {
    for (const rule of DETERMINISM_RULES) {
      if (rule.pattern.test(text)) {
        violations.push({
          ruleId: rule.id,
          message: rule.message,
          line: index + 1,
          snippet: text.trim().slice(0, 120),
        })
      }
    }
  })
  return violations
}

/** 是否确定性合规（无违规）。 */
export function isDeterministic(code: string): boolean {
  return checkDeterminism(code).length === 0
}
