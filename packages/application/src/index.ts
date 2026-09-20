import { normalizeCommand, type Resource } from '@monaworld/domain';
export function commandFromResource(resource: Resource): string {
  const command = typeof resource.data.command === 'string' ? resource.data.command : '';
  return normalizeCommand(command);
}
export function canSpend(balance:number,cost:number):boolean { return cost <= 0 || balance >= cost; }
