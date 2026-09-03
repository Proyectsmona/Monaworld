import { domainError, err, ok, type IdGenerator, type Result, type Rule } from '@monaworld/domain';
import type { RuleDraft } from '@monaworld/contracts';
import type { RuleRepository } from '../ports/repositories.js';

/** Alta, edición y baja de reglas. El id lo asigna el servidor, no el cliente. */

export interface RuleDependencies {
  readonly rules: RuleRepository;
  readonly ids: IdGenerator;
}

export async function createRule(
  deps: RuleDependencies,
  draft: RuleDraft,
): Promise<Result<Rule>> {
  const rule: Rule = { ...draft, id: deps.ids.next() };
  await deps.rules.create(rule);
  return ok(rule);
}

export async function updateRule(
  deps: RuleDependencies,
  id: string,
  draft: RuleDraft,
): Promise<Result<Rule>> {
  const existing = await deps.rules.findById(id);
  if (!existing) return err(domainError('rule_not_found', `No existe la regla ${id}`));

  const rule: Rule = { ...draft, id };
  await deps.rules.update(rule);
  return ok(rule);
}

export async function deleteRule(
  deps: RuleDependencies,
  id: string,
): Promise<Result<{ id: string }>> {
  const existing = await deps.rules.findById(id);
  if (!existing) return err(domainError('rule_not_found', `No existe la regla ${id}`));

  await deps.rules.delete(id);
  return ok({ id });
}

export function listRules(deps: RuleDependencies): Promise<Rule[]> {
  return deps.rules.listAll();
}
